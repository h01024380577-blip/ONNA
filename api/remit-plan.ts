import { json, bad, openai, parseJson, copyLint, rateLimit, clientIp, preflight } from './_lib'

export const config = { runtime: 'edge' }

/* 송금 에이전트 ③④ — 송금안(행동·금액)과 이유 문장.
   급여 입금 웹훅(trigger: salary)과 채팅 요청(trigger: chat)이 같이 쓴다.
   LLM 이 행동·금액까지 정한다(사용자 승인 사항). 코드가 하는 일은
   (1) 신호·상황 판정을 만들어 넘기고 (2) 응답이 화면을 깨뜨리지 않는지 검사하고
   (3) 한도 문장은 따로 쓴다 — HARD RULE 3 때문에 LLM 은 한도를 말할 수 없다.
   ⑥ 타이밍(지금·나눠서·예약)은 승인 뒤 코드가 정한다 (src/agent/timing.ts). */

const ACTIONS = ['remit_full', 'remit_adjust', 'later'] as const
const MIN_SEND = 10_000

const LANG_NAME: Record<string, string> = {
  ko: 'Korean', en: 'English', id: 'Indonesian', vi: 'Vietnamese', ne: 'Nepali',
}

const INTRO = {
  salary: `You are ONNA, a banking assistant inside iM Bank for migrant workers in Daegu, Korea.
A salary deposit just landed in this person's account. You decide what to recommend today.`,
  chat: `You are ONNA, a banking assistant inside iM Bank for migrant workers in Daegu, Korea.
The person just asked you in the chat to send money home. You decide what to recommend now.
If REQUESTED is given, that is the amount they named. Prefer echoing it with remit_full when it fits.
If it would squeeze their living money (situation.money = tight) or today's rate is lower, you may choose
remit_adjust with a smaller amount or later — say kindly why, never scold. REQUESTED may be above
sendableMax; you may still echo it, the rules engine and the confirm screen handle the rest.`,
} as const

const SYSTEM_BODY = `
WHO YOU ARE
Think of yourself as the kindest person at the bank's information desk. The person may be tired
from a factory shift and may not read well. You are never rushed, never cold, never bureaucratic.

YOUR DECISION — pick exactly one action
- remit_full   : send the comfortable surplus home now
- remit_adjust : send a smaller amount now (living money would get tight, they already sent a lot
                 this month, or today's rate is not good)
- later        : recommend not sending today
Then pick "amount": a whole number of Korean won, at least 10000 and at most SIGNALS.sendableMax (or REQUESTED, if given and larger).
sendableMax is already what is left AFTER keeping their living money and their automatic payments,
so anything up to it is safe — but sending every last won of it is rarely kind. Choose what fits
this person this month. For "later", still give the amount you would suggest for when they do send.
Round to a friendly figure (usually a multiple of 10,000 won).

HARD RULES
1. NUMBERS: never invent a number. You may write (a) the amount you chose and (b) values present
   in SIGNALS. Nothing else. Do not convert won into the family's currency — the app does that.
1b. NO ARITHMETIC: never write a number you worked out by adding or subtracting SIGNALS values,
   and never explain a subtraction. Quote a value as it is, or leave it out. At most ONE number
   per sentence — plain words beat figures here.
2. NO JUDGEMENTS: never say whether a transfer passes or fails compliance. A rules engine decides.
3. NEVER state a limit, maximum, cap, remaining allowance, fee, or eligibility condition — not even
   from SIGNALS. Never write sendableMax as a number. A separate line written by the rules engine
   covers what is possible this month.
4. Never promise or predict a future rate. You may say today's rate is better, about the same, or
   lower than usual. Nothing about tomorrow.
4b. TIMING: if you choose "later", or choose remit_adjust because money is still going out this
   month, say WHEN in plain words and name the day — use laterDate (the day ONNA will send it) or
   nextSalaryDate (next payday). Those are the only dates you may write. Never invent another date.
5. NO ADVICE: no investment or personalized financial advice.
6. FORBIDDEN WORDS (never output, in any language): 거절, 차단, 위반, 블록체인, DID, 크리덴셜, 토큰.
7. MONEY: every amount in SIGNALS is Korean won. Always label amounts as won (원 / KRW / "đồng Hàn Quốc" …).
   NEVER label an amount with homeCurrency — that is only what their family receives.
7b. DIGITS: write every figure in Western digits (0-9) — never Devanagari (१२३) or other numerals.
   Group thousands the way the app does for that language: dots for Vietnamese and Indonesian
   (920.000), commas for Korean, English and Nepali (920,000).
8. NAME: you are never told the person's name. Open "say" by addressing them with the bare token
   {name} — the app fills in the name and the right honorific. Never add a suffix to it
   (no "{name}님", no "{name} ji"). Use it once, in "say" only.

TONE
- Always the polite/honorific register of the requested language. Never casual, never blunt.
- Plain words. Short sentences. No banking jargon, no English loanwords, no emoji.
- Offer, never order ("…해 드릴까요?" not "…하세요"). Never make them feel poor or at fault.
- Vietnamese: "quý khách", end with "ạ" where natural, never "bạn", never the pair "anh/chị".
  Indonesian: "Bapak/Ibu" or "Anda", soften with "ya". Nepali: तपाईं / हजुर. English: courteous teller.

KOREAN REGISTER — this is broken most often, so check every sentence
- 부드러운 해요체만 쓴다: …했어요 / …이에요 / …해요 / …해 드릴까요? / …하시면 돼요 / …남겨 뒀어요.
- 딱딱한 합니다체는 금지: 문장을 -합니다 / -습니다 / -입니다 / -됩니다 / -하였습니다 로 끝내지 않는다.
- 특히 "…것이 좋습니다" / "…하는 것이 좋습니다" / "…적합합니다" / "…결정했습니다" /
  "…확인되었습니다" / "…설정되어 있습니다" 는 절대 쓰지 않는다.
- 고쳐 쓰는 법:
    "환율이 좋으니 송금하는 것이 좋습니다"  →  "오늘 환율이 좋아서 보내기 좋은 날이에요"
    "920,000원을 송금하기로 결정했습니다"   →  "920,000원이면 알맞을 것 같아요"
    "미루지 않는 것이 좋습니다"             →  "오늘 보내시는 게 더 나아요"
- 호칭 '님'은 앱이 붙이므로 직접 쓰지 않는다.

SIGNALS FIELDS
- salary, autoDebit, balanceAfter, livingFloor, sendableMax, sentThisMonth: Korean won.
- sentThisMonth: what they have already sent home this month. You may mention it plainly.
- livingFloor: the monthly living money that stays with them in Korea. It is already set aside;
  never suggest sending it, and never describe it as being taken away from the salary.
- autoDebit: rent and bills that leave the account automatically. Also already set aside.
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
- fxRisk: how much the rate has MOVED lately, ALREADY DECIDED. calm / moving / volatile / unknown.
    moving or volatile → you may say plainly that the rate has been moving a lot these days (a past
    fact) and let that weigh on how much to send now. Never turn it into a forecast (HARD RULE 4).
    unknown → say nothing about movement.
  fxSwingPct: the size of that movement in percent, when known.
- spendAvg3m: their usual monthly living spending (last 3 months). spendThisMonth: what they have
  spent so far this month. Both Korean won.
- spendPace: verdict on this month's spending, ALREADY DECIDED. higher / usual / lower than usual.
  Do not re-judge it from the numbers.
- upcomingDebits: money still expected to leave before the next payday (rent not yet paid this
  month + the rest of their usual living spending). Korean won. This is the main reason to hold
  some back or wait. nextRentDate: the day rent and automatic payments leave. nextSalaryDate: the
  next payday.
- remitAvg3m: how much they usually send home per month (last 3 months). Korean won.
- situation: the verdict on this month, ALREADY DECIDED. Do not re-judge it.
    money: roomy (sending the usual amount is comfortable) | tight (living money is squeezed)
    rate / risk: same as fxStrength / fxRisk. sentAlready: they already sent some this month.
- laterDate: the day ONNA would send it if waiting (after rent, or a week from today).

WHAT YOU WRITE
- "say"  : ONE short sentence proposing your action, ending as an invitation.
- "why"  : ONE short sentence of grounds.
- "steps": how you actually thought, in the worker's own view.
    signals   → what came in, what has been spent this month, what is still going out before the
                next payday (upcomingDebits / nextRentDate), and whether the rate has been moving
    situation → explain the situation verdict in plain words (one sentence, no new judgement)
    compare   → which ways of sending you weighed against each other, and what tipped it
    decide    → what you chose and why it fits this person this month
  Each step 1~2 short sentences, at most one number each. Do NOT write about limits (HARD RULE 3),
  and do NOT restate the same figures in every step.
- "rejected": 1~2 of the actions you did not choose, each with one short sentence saying why not.

BEFORE YOU ANSWER, check every sentence: honorific register (Korean 해요체, no -합니다/-습니다)?
{name} opening "say"? amounts labelled as won? no limit/fee/cap mentioned? no arithmetic and no
"minus living costs" explanation? no future-rate promise? fxStrength matched exactly?
Fix it before replying.

OUTPUT strict JSON only:
{"action":"remit_full|remit_adjust|later","amount":<number>,"say":"…","why":"…",
 "steps":{"signals":"…","situation":"…","compare":"…","decide":"…"},
 "rejected":[{"action":"later","text":"…"}]}`

const systemFor = (trigger: 'salary' | 'chat') => `${INTRO[trigger]}\n${SYSTEM_BODY}`

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
      // api/agent.ts 에는 뒤 0을 떼고 한 번 더 보는 관용 규칙이 있는데, 여기서는 쓰지
      // 않는다. 자리수가 하나 틀린 금액("1,98,00000")이 그 규칙으로 통과했다(실측)
      return ctxDigits.includes(d)
    }),
  )
}

/* 원화 금액에 본국 통화 이름을 붙이면 안 된다(HARD RULE 7) — 네팔어에서 원화를
   "रुपैयाँ"로 쓰는 걸 실측했다. 베트남어의 "đồng Hàn Quốc"(한국 동)은 규칙상
   허용된 표기라 VND 는 넣지 않는다. */
const HOME_WORDS: Record<string, RegExp> = {
  NPR: /रुपैयाँ|रुपियाँ|\brupees?\b/i,
  IDR: /\brupiah\b/i,
}

/** 5개 언어의 "조금·약간" 부류 — 확실히 유리한 날에 나오면 안 되는 말 */
const HEDGE =
  /\b(slightly|a little|a bit|sedikit|agak|một chút|chút ít|hơi)\b|조금|약간|살짝|थोरै|अलिकति/i

/* 한국어가 보고서 말투(합니다체)로 새는 일이 실측에서 잦았다 — 프롬프트만으로는
   안 잡힌다. 인사말처럼 굳은 표현은 통과시키고 문장 종결형만 잡는다. */
const KO_STIFF = /(?<!감사|축하|죄송|미안)(합니다|습니다|입니다|됩니다)[.!?…]?(?=\s|$)/

/* 베트남어에서 모델이 존칭 "quý khách" 대신 반말투 "bạn"을 쓰는 걸 실측했다.
   성별을 모르는 채로 쓰는 "anh/chị"도 프롬프트에서 금지한 표현이다. */
const ADDRESS_BAD: Record<string, RegExp> = { vi: /\bbạn\b|anh\/chị/i }

const DEV = '०१२३४५६७८९'
const ARAB = '٠١٢٣٤٥٦٧٨٩'
const toAsciiDigits = (s: string) =>
  s.replace(/[०-९]/g, (c) => String(DEV.indexOf(c))).replace(/[٠-٩]/g, (c) => String(ARAB.indexOf(c)))

/** 언어별 천 단위 구분 — src/i18n/index.ts 의 fmtKRW 와 같은 규칙 */
const GROUPING: Record<string, string> = {
  ko: 'en-US', en: 'en-US', ne: 'en-IN', vi: 'de-DE', id: 'de-DE',
}

/* 모델이 쓴 금액 표기를 코드 표기로 다시 맞춘다.
   네팔어는 데바나가리 숫자를 쓰면서 자리 구분까지 틀리고(१,१०,०००० = 1,10,0000),
   베트남어는 쉼표를 쓰는데 같은 카드의 앱 금액은 점을 쓴다. 한 카드 안에서 표기가
   갈리면 오류처럼 보인다. 아는 값(고른 금액·신호 값)만 교체하고, 환율 표기처럼
   모르는 숫자는 그대로 두어 기존 근거 검사에 맡긴다. */
function normalizeFigures(text: string, lang: string, allowed: number[]): string {
  const fmt = new Intl.NumberFormat(GROUPING[lang] ?? 'en-US')
  return toAsciiDigits(text).replace(/\d[\d.,\s]*\d/g, (tok) => {
    const digits = tok.replace(/\D/g, '')
    if (digits.length < 3) return tok
    const n = Number(digits)
    return allowed.includes(n) ? fmt.format(n) : tok
  })
}

type Attempt = { plan: Record<string, unknown> } | { reason: string }

/** 한 번 뽑아서 가드레일까지 통과시킨다. 걸리면 사유만 돌려주고 호출부가 재시도한다 */
async function once(
  lang: string,
  sg: Record<string, unknown>,
  cap: number,
  name: string | undefined,
  timeoutMs: number,
  trigger: 'salary' | 'chat',
  requested: number | null,
): Promise<Attempt> {
  const d = await openai(
    {
      // steps 3개 + rejected 2개 + say/why. 네팔어·베트남어는 토큰이 훨씬 많이 든다
      max_tokens: 700,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemFor(trigger) },
        {
          role: 'user',
          content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}\n${requested ? `REQUESTED: ${requested}\n` : ''}SIGNALS: ${JSON.stringify(sg)}`,
        },
      ],
    },
    timeoutMs,
  )

  {
    const out = parseJson<Record<string, unknown>>(d?.choices?.[0]?.message?.content ?? '')
    if (!out) return { reason: 'unparsable' }

    const action = (ACTIONS as readonly string[]).includes(String(out.action))
      ? String(out.action)
      : null
    if (!action) return { reason: 'action' }

    const n =
      typeof out.amount === 'number' && Number.isFinite(out.amount) ? Math.round(out.amount) : NaN
    const inRange = n >= MIN_SEND && n <= cap
    // 범위를 벗어난 금액은 깎지 않고 통째로 폐기한다 — 문장에 그 금액이 적혀 있다.
    // 'later' 는 금액이 없어도 되므로 클라이언트가 공식값으로 채운다
    if (!inRange && action !== 'later') return { reason: 'amount' }
    const amount = inRange ? n : null

    // 금액 표기를 코드 표기로 되돌릴 때 교체해도 되는 값들 — 상한(sendableMax)은
    // 애초에 말해선 안 되는 값이라 넣지 않는다
    const allowedFigures = [
      amount,
      requested,
      sg.salary, sg.autoDebit, sg.balanceAfter, sg.livingFloor, sg.sentThisMonth,
      sg.spendAvg3m, sg.spendThisMonth, sg.upcomingDebits, sg.remitAvg3m,
    ].filter((x): x is number => typeof x === 'number' && x >= 100)

    const steps = (out.steps ?? {}) as Record<string, unknown>
    const pick = (v: unknown) =>
      typeof v === 'string' ? normalizeFigures(v.trim(), lang, allowedFigures) : ''
    const texts = {
      say: fillName(pick(out.say), name, lang),
      why: pick(out.why),
      signals: pick(steps.signals),
      situation: pick(steps.situation),
      compare: pick(steps.compare),
      decide: pick(steps.decide),
    }
    if (Object.values(texts).some((v) => !v)) return { reason: 'empty' }

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
    if (all.some((v) => !copyLint(v))) return { reason: 'copy' }

    const ctxDigits = (JSON.stringify(sg) + (amount ?? '') + (requested ?? '')).replace(/\D/g, '')
    if (!grounded(all, ctxDigits)) return { reason: 'ungrounded' }

    /* 확실히 유리한 날인데 "조금"으로 깎아 쓰면 폐기 — 프롬프트만으로는 새는 케이스.
       전액 송금을 권할 때만 본다: 줄여 보내기·기다리기에서는 "조금 줄여"·"조금 기다렸다"가
       환율 얘기가 아니라 자연스러운 말이라, 채팅 요청이 전부 폐기됐다(실측) */
    if (sg.fxStrength === 'clearly-better' && action === 'remit_full' && HEDGE.test(texts.say + texts.why))
      return { reason: 'hedge' }

    /* 카드에 직접 나가는 문장이 보고서 말투면 플랜을 버린다. 탈락 후보는
       부수 정보라 그 항목만 빼고 나머지는 살린다 — 한 줄 때문에 분석 전체를
       폴백으로 떨어뜨리면 LLM 경로가 거의 안 살아난다(실측 2/3 폐기). */
    const core = [texts.say, texts.why, texts.signals, texts.situation, texts.compare, texts.decide]
    const badRegister = lang === 'ko' ? KO_STIFF : ADDRESS_BAD[lang]
    if (badRegister && core.some((v) => badRegister.test(v))) return { reason: 'register' }

    /* 상한·한도 수치를 사용자에게 말하면 안 된다(HARD RULE 3). 프롬프트로 막았는데도
       "전체 송금 가능 금액이 920,000원이지만…" 처럼 새는 걸 실측했다.
       고른 금액과 다른 값일 때만 잡는다 — 상한과 고른 금액이 같은 건 정상이다. */
    // 상한이 1만원 미만(급여 전 채팅 요청이면 0원)이면 검사하지 않는다 — "0"이 모든 금액에 걸린다(실측)
    const caps = [sg.sendableMax].filter(
      (x): x is number => typeof x === 'number' && x >= MIN_SEND && x !== amount,
    )
    const capLeak = (v: string) => {
      const d = v.replace(/\D/g, '')
      return caps.some((c) => d.includes(String(c)))
    }
    if (core.some(capLeak)) return { reason: 'cap' }

    const homeWord = HOME_WORDS[String(sg.homeCurrency)]
    if (homeWord && core.some((v) => homeWord.test(v))) return { reason: 'currency' }

    return {
      plan: {
        action,
        amount,
        say: texts.say,
        why: texts.why,
        steps: { signals: texts.signals, situation: texts.situation, compare: texts.compare, decide: texts.decide },
        rejected: badRegister ? rejected.filter((r) => !badRegister.test(r.text)) : rejected,
      },
    }
  }
}

export default async function handler(req: Request) {
  const pre = preflight(req)
  if (pre) return pre

  if (req.method !== 'POST') return bad('POST only', 405)
  if (!rateLimit(clientIp(req), 20, 60_000)) return bad('too many requests', 429)

  let body: {
    lang?: string
    name?: string
    trigger?: string
    requestedAmount?: number
    signals?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return bad('invalid json')
  }
  const lang = body.lang && LANG_NAME[body.lang] ? body.lang : 'ko'
  const sg = body.signals
  if (!sg || typeof sg.salary !== 'number' || typeof sg.sendableMax !== 'number')
    return bad('missing signals')

  const trigger = body.trigger === 'chat' ? 'chat' : 'salary'
  const requested =
    trigger === 'chat' && typeof body.requestedAmount === 'number' && body.requestedAmount >= MIN_SEND
      ? Math.min(Math.round(body.requestedAmount), 99_000_000)
      : null
  const cap = Math.max(MIN_SEND, sg.sendableMax, requested ?? 0)

  /* 가드레일 탈락은 대부분 확률적이라 한 번 더 뽑으면 통과한다(네팔어 실측 1/3 → 3/4).
     클라이언트가 9초에 끊으므로 시도별 타임아웃을 6초로 줄이고, 첫 시도가 오래 걸렸으면
     재시도하지 않는다 — 폴백이라도 제때 오는 게 낫다. */
  const started = Date.now()
  let reason = 'unknown'
  for (let i = 0; i < 2; i++) {
    if (i > 0 && Date.now() - started > 3500) break
    try {
      const r = await once(lang, sg, cap, body.name, 6000, trigger, requested)
      if ('plan' in r) return json(r.plan)
      reason = r.reason
    } catch (e) {
      // API 오류·타임아웃은 다시 불러도 같으므로 즉시 폴백
      return json({ fallback: (e as Error).message })
    }
  }
  return json({ fallback: reason })
}
