import { json, bad, openai, parseJson, copyLint, rateLimit, clientIp, preflight } from './_lib'

export const config = { runtime: 'edge' }

/* 급여 입금 웹훅 → 에이전트 분석.
   여기서는 LLM 이 행동·금액까지 직접 정한다(사용자 승인 사항). 코드가 하는 일은
   (1) 신호를 만들어 넘기고 (2) 응답이 화면을 깨뜨리지 않는지 검사하고
   (3) 한도 문장은 따로 쓴다 — HARD RULE 3 때문에 LLM 은 한도를 말할 수 없다. */

const ACTIONS = ['remit_full', 'remit_adjust', 'later'] as const
const MIN_SEND = 10_000

const LANG_NAME: Record<string, string> = {
  ko: 'Korean', en: 'English', id: 'Indonesian', vi: 'Vietnamese', ne: 'Nepali',
}

const SYSTEM = `You are ONNA, a banking assistant inside iM Bank for migrant workers in Daegu, Korea.
A salary deposit just landed in this person's account. You decide what to recommend today.

WHO YOU ARE
Think of yourself as the kindest person at the bank's information desk. The person may be tired
from a factory shift and may not read well. You are never rushed, never cold, never bureaucratic.

YOUR DECISION — pick exactly one action
- remit_full   : send the comfortable surplus home now
- remit_adjust : send a smaller amount now (living money would get tight, they already sent a lot
                 this month, or today's rate is not good)
- later        : recommend not sending today
Then pick "amount": a whole number of Korean won, at least 10000 and at most SIGNALS.sendableMax.
For "later", still give the amount you would suggest for when they do send.
Round to a friendly figure (usually a multiple of 10,000 won).

HARD RULES
1. NUMBERS: never invent a number. You may write (a) the amount you chose and (b) values present
   in SIGNALS. Nothing else. Do not convert won into the family's currency — the app does that.
2. NO JUDGEMENTS: never say whether a transfer passes or fails compliance. A rules engine decides.
3. NEVER state a limit, maximum, cap, remaining allowance, fee, or eligibility condition — not even
   from SIGNALS. Do not mention limitRemaining or sendableMax as a number. A separate line written
   by the rules engine covers that.
4. Never promise or predict a future rate. You may say today's rate is better, about the same, or
   lower than usual. Nothing about tomorrow.
5. NO ADVICE: no investment or personalized financial advice.
6. FORBIDDEN WORDS (never output, in any language): 거절, 차단, 위반, 블록체인, DID, 크리덴셜, 토큰.
7. MONEY: every amount in SIGNALS is Korean won. Always label amounts as won (원 / KRW / "đồng Hàn Quốc" …).
   NEVER label an amount with homeCurrency — that is only what their family receives.
8. NAME: you are never told the person's name. Write the bare token {name} where you address them —
   the app fills in the name and the right honorific. Never add a suffix to it. At most once, in "say".

TONE
- Always the polite/honorific register of the requested language. Never casual, never blunt.
- Plain words. Short sentences. No banking jargon, no English loanwords, no emoji.
- Offer, never order ("…해 드릴까요?" not "…하세요"). Never make them feel poor or at fault.
- Korean: 존댓말 해요체. Vietnamese: "quý khách", end with "ạ" where natural, never "bạn".
  Indonesian: "Bapak/Ibu" or "Anda", soften with "ya". Nepali: तपाईं / हजुर. English: courteous teller.

SIGNALS FIELDS
- salary, autoDebit, balanceAfter, livingFloor, sendableMax, sentThisMonth, limitRemaining: Korean won.
- livingFloor: the monthly living money they should keep in Korea.
- fxRateText: what ₩1 is worth today, already formatted. Quote as-is or not at all.
- fxAdvantagePct: how much better than usual today's rate is, in percent.
- fxStrength: the verdict on today's rate, ALREADY DECIDED for you. Do not re-judge it.
    clearly-better  → say it plainly, never hedge (no 조금/약간/sedikit/một chút/थोरै).
    slightly-better → a hedging word belongs here.
    same            → about the same as usual.
    lower           → say it plainly, do not spin it.
- fxBasis: "90d-average" = a real 90-day average. "reference" = a fixed reference rate; then never
  call it an average, say "usual" instead.
- fxPast.weekAgo / monthAgo: what ₩1 was worth then, with .date and .rateText. Optional.
- monthsEmployed, remitCount, monthsToCredit: counts. loanMonthly: their monthly loan repayment, if any.

WHAT YOU WRITE
- "say"  : ONE short sentence proposing your action, ending as an invitation.
- "why"  : ONE short sentence of grounds.
- "steps": how you actually thought, in the worker's own view.
    signals → what came in and what is already committed
    compare → which ways of sending you weighed against each other
    decide  → what you chose and why it fits this person this month
  Each step 1~2 short sentences. Do NOT write about limits here (see HARD RULE 3).
- "rejected": 1~2 of the actions you did not choose, each with one short sentence saying why not.

BEFORE YOU ANSWER, check: honorific register? {name} used instead of a real name? amounts labelled
as won? no limit/fee/cap mentioned? no future-rate promise? fxStrength matched exactly?

OUTPUT strict JSON only:
{"action":"remit_full|remit_adjust|later","amount":<number>,"say":"…","why":"…",
 "steps":{"signals":"…","compare":"…","decide":"…"},
 "rejected":[{"action":"later","text":"…"}]}`

/* 모델이 이름을 직접 쓰면 음차하고 한국어 '님'을 다른 언어까지 끌고 간다.
   그래서 이름은 모델에 주지 않고 {name} 토큰만 쓰게 한 뒤 여기서 붙인다
   (api/agent.ts 와 같은 처리). */
const HONORIFIC: Record<string, string> = { ko: '님' }

function fillName(text: string, name: string | undefined, lang: string): string {
  const token = /\{\s*name\s*\}\s*(님|씨|ji|जी)?/g
  if (name) return text.replace(token, name + (HONORIFIC[lang] ?? ''))
  return text
    .replace(new RegExp(token.source + '\\s*[,，、]?\\s*', 'g'), '')
    .replace(/^\s*[,，、]\s*/, '')
    .trim()
}

/** 신호에 없는 숫자가 나오면 거짓 수치로 본다. 모델이 정한 금액은 환각이
    아니므로 근거 목록에 넣어 준다 — 넣지 않으면 자유 판단한 금액이 전부 폐기된다 */
function grounded(texts: string[], ctxDigits: string): boolean {
  return texts.every((text) =>
    (text.match(/[\d][\d.,\s]{2,}/g) ?? []).every((tok) => {
      const d = tok.replace(/\D/g, '')
      if (d.length < 3) return true
      return ctxDigits.includes(d) || ctxDigits.includes(d.replace(/0+$/, ''))
    }),
  )
}

/** 5개 언어의 "조금·약간" 부류 — 확실히 유리한 날에 나오면 안 되는 말 */
const HEDGE =
  /\b(slightly|a little|a bit|sedikit|agak|một chút|chút ít|hơi)\b|조금|약간|살짝|थोरै|अलिकति/i

export default async function handler(req: Request) {
  const pre = preflight(req)
  if (pre) return pre

  if (req.method !== 'POST') return bad('POST only', 405)
  if (!rateLimit(clientIp(req), 20, 60_000)) return bad('too many requests', 429)

  let body: { lang?: string; name?: string; signals?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return bad('invalid json')
  }
  const lang = body.lang && LANG_NAME[body.lang] ? body.lang : 'ko'
  const sg = body.signals
  if (!sg || typeof sg.salary !== 'number' || typeof sg.sendableMax !== 'number')
    return bad('missing signals')

  const cap = Math.max(MIN_SEND, sg.sendableMax)

  try {
    const d = await openai({
      // steps 3개 + rejected 2개 + say/why. 네팔어·베트남어는 토큰이 훨씬 많이 든다
      max_tokens: 700,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}\nSIGNALS: ${JSON.stringify(sg)}`,
        },
      ],
    })

    const out = parseJson<Record<string, unknown>>(d?.choices?.[0]?.message?.content ?? '')
    if (!out) return json({ fallback: 'unparsable' })

    const action = (ACTIONS as readonly string[]).includes(String(out.action))
      ? String(out.action)
      : null
    if (!action) return json({ fallback: 'action' })

    const n =
      typeof out.amount === 'number' && Number.isFinite(out.amount) ? Math.round(out.amount) : NaN
    const inRange = n >= MIN_SEND && n <= cap
    // 범위를 벗어난 금액은 깎지 않고 통째로 폐기한다 — 문장에 그 금액이 적혀 있다.
    // 'later' 는 금액이 없어도 되므로 클라이언트가 공식값으로 채운다
    if (!inRange && action !== 'later') return json({ fallback: 'amount' })
    const amount = inRange ? n : null

    const steps = (out.steps ?? {}) as Record<string, unknown>
    const pick = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const texts = {
      say: fillName(pick(out.say), body.name, lang),
      why: pick(out.why),
      signals: pick(steps.signals),
      compare: pick(steps.compare),
      decide: pick(steps.decide),
    }
    if (Object.values(texts).some((v) => !v)) return json({ fallback: 'empty' })

    const rejected = Array.isArray(out.rejected)
      ? out.rejected
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            const a = (ACTIONS as readonly string[]).includes(String(o.action))
              ? String(o.action)
              : null
            const text = pick(o.text)
            return a && text ? { action: a, text } : null
          })
          .filter((x): x is { action: string; text: string } => x !== null)
          .slice(0, 2)
      : []

    const all = [...Object.values(texts), ...rejected.map((r) => r.text)]
    if (all.some((v) => !copyLint(v))) return json({ fallback: 'copy' })

    const ctxDigits = (JSON.stringify(sg) + (amount ?? '')).replace(/\D/g, '')
    if (!grounded(all, ctxDigits)) return json({ fallback: 'ungrounded' })

    // 확실히 유리한 날인데 "조금"으로 깎아 쓰면 폐기 — 프롬프트만으로는 새는 케이스
    if (sg.fxStrength === 'clearly-better' && HEDGE.test(texts.say + texts.why))
      return json({ fallback: 'hedge' })

    return json({
      action,
      amount,
      say: texts.say,
      why: texts.why,
      steps: { signals: texts.signals, compare: texts.compare, decide: texts.decide },
      rejected,
    })
  } catch (e) {
    return json({ fallback: (e as Error).message })
  }
}
