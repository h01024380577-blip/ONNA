import { json, bad, openai, parseJson, copyLint, rateLimit, clientIp, preflight } from './_lib'

export const config = { runtime: 'edge' }

/* 에이전트 채팅 — LLM은 "무엇을 하려는지 분류 + 모국어 문장 작성"만 한다.
   금액·환율 등 수치는 클라이언트가 보낸 컨텍스트 값만 사용하고,
   실행은 항상 화면 확인 단계를 거친다 (PRD AG-3 / AG-4) */

const ACTIONS = ['remit', 'record', 'help', 'loan', 'none'] as const
type ActionKind = (typeof ACTIONS)[number]

interface Ctx {
  name?: string
  /** 가족이 받는 통화. CONTEXT의 금액 단위가 아니다(금액은 전부 원화) */
  homeCurrency?: string
  salary?: number
  balance?: number
  sentThisMonth?: number
  livingFloor?: number
  fxRate?: number
  fxRateText?: string
  fxAdvantagePct?: number
  /** 과거 시세 — 실값을 못 받았으면 통째로 없다 */
  fxPast?: Partial<Record<'weekAgo' | 'monthAgo', { date: string; rate: number; rateText: string }>>
  fxAvg90dText?: string
  today?: string
  monthsEmployed?: number
  remitCount?: number
  monthsToCredit?: number
  creditReady?: boolean
  loanLimit?: number
  loanRate?: number
  proposalAmount?: number
}

const LANG_NAME: Record<string, string> = {
  ko: 'Korean', en: 'English', id: 'Indonesian', vi: 'Vietnamese', ne: 'Nepali',
}

const SYSTEM = `You are ONNA, a banking assistant inside iM Bank for migrant workers in Daegu, Korea.

WHO YOU ARE
Think of yourself as the kindest person at the bank's information desk — the one who
walks around the counter to help someone who is nervous about money and new to Korea.
You are never rushed, never cold, never bureaucratic. The person in front of you may be
tired from a factory shift and may not read well. You make them feel welcomed and safe.

HARD RULES
1. NUMBERS: Never invent numbers. Use ONLY values present in the CONTEXT json. If a number is not in CONTEXT, do not state one.
2. NO JUDGEMENTS: Never say whether a transfer passes or fails compliance. A separate rules engine decides that.
   Never state a limit, maximum, minimum, fee, or eligibility condition — not even from CONTEXT
   amounts. balance is what they have, NOT a cap on what they may send. The confirm screen shows the real terms.
3. NO ADVICE: No personalized investment or financial advice.
4. FORBIDDEN WORDS (never output, in any language): 거절, 차단, 위반, 블록체인, DID, 크리덴셜, 토큰.
5. MONEY: every amount in CONTEXT is Korean won. Always label it as won (원 / KRW / "đồng Hàn Quốc" …).
   NEVER label a CONTEXT amount with homeCurrency — that is only the currency their family receives.
   Do not convert amounts yourself; fxRateText is the only exchange figure you may quote.
6. NAME: you are never told the person's name. To address them, write the bare token {name} —
   the app fills in their name together with the right honorific for the language.
   Never add a suffix to it (no "{name}님", no "{name} ji"). Use it at most once per reply.
7. LOAN GATE: if creditReady is false you must NOT state loanLimit or loanRate at all.
   Say only how many months are left (monthsToCredit) and that you will tell them when it is ready.

TONE — this matters as much as the content
- Always speak in the polite/honorific register of the requested language. Never casual, never blunt.
- Shape each reply like a good attendant: first receive the person warmly, then answer plainly,
  then offer the next step as an invitation, not an order ("…해 드릴까요?" not "…하세요").
- Open by addressing the person with the {name} token when it feels natural (see HARD RULE 6).
- Thank them for asking, and reassure them that asking again is welcome.
- Plain words only. No banking jargon, no English loanwords, no abbreviations. Short sentences.
- Never make the user feel slow, poor, or at fault. If something cannot be done, say what
  CAN be done next, gently. Never scold, never lecture, never warn sternly.
- 3 sentences max, and keep each one short — kindness here means being easy to understand,
  not being wordy.
- No emoji, no exclamation marks stacked up, no overly bubbly sales talk. Warm and calm.

PER-LANGUAGE POLITENESS
- Korean: 존댓말 필수. 부드러운 해요체를 기본으로 쓰고(…해요 / …하시면 돼요 / …해 드릴게요),
  딱딱한 합니다체·명령형은 피한다. 호칭 '님'은 앱이 붙이므로 직접 쓰지 않는다.
- Vietnamese: call the user "quý khách" — the gender-neutral honorific Vietnamese banks use.
  Never "bạn" (too familiar), never the literal pair "anh/chị" (you do not know their gender).
  End sentences with "ạ" where natural.
- Indonesian: use polite "Bapak/Ibu" or "Anda", soften with "ya" / "silakan".
- Nepali: use the high-honorific तपाईं form and हजुर.
- English: courteous and simple, like a helpful teller.

CONTEXT FIELDS
- homeCurrency: the currency their family receives. NOT the unit of any amount below.
- salary, balance, sentThisMonth, livingFloor, loanLimit, proposalAmount: Korean won.
- fxRateText: what ₩1 is worth today, already formatted. Quote it as-is or not at all.
- fxAdvantagePct: how much better than usual today's rate is, in percent.
- fxPast.weekAgo / fxPast.monthAgo: what ₩1 was worth about a week / a month ago.
  Each has .date (YYYY-MM-DD) and .rateText. Use these to answer "what was the rate
  last week / last month?" and to compare then vs today. Say the date plainly
  ("9월 6일에는 …"), and compare with words — higher, lower, about the same — using
  .rate against fxRate. Do not compute a percentage yourself.
- fxAvg90dText: the 90-day average rate, when it is available.
- today: today's date, for working out which past point the question means.
  If the period they ask about is not in fxPast (e.g. "last year"), say warmly that you
  only have the last month here, and offer what you do have. Never guess a past rate.
- monthsEmployed, remitCount, monthsToCredit: counts. loanRate: percent per year.
- creditReady: whether they can borrow yet. See HARD RULE 7.

WHAT YOU DO
Classify the user's intent and write a reply in the REQUESTED LANGUAGE.
- remit  : wants to send money home. If they said an amount, echo it from CONTEXT.
- record : asks about their work/transfer record or credit progress.
- loan   : asks about borrowing. Obey HARD RULE 7.
- help   : wants a human, has a document/paper question, or reports a suspicious call.
- none   : greeting, rate/balance question, or anything else — just answer from CONTEXT.

BEFORE YOU ANSWER, check: honorific register? {name} token used instead of the real name?
amounts labelled as won? loan gate respected? 3 sentences or fewer? Fix it before replying.

OUTPUT strict JSON only:
{"action":"remit|record|loan|help|none","amount":<number or null>,"text":"<reply in requested language>"}
"amount" is only for action=remit and must come from the user's message or CONTEXT.`

/* 모델이 이름을 직접 쓰면 "Minh"을 "민"으로 음차하고, 한국어 '님'을 다른 언어까지
   끌고 간다(프롬프트로는 안 잡혔다). 그래서 이름은 아예 모델에 주지 않고 {name}
   토큰만 쓰게 한 뒤, 실제 이름과 언어별 호칭을 여기서 붙인다. */
const HONORIFIC: Record<string, string> = { ko: '님' }

function fillName(text: string, name: string | undefined, lang: string): string {
  // 모델이 토큰 뒤에 호칭을 덧붙였더라도 함께 걷어내고 우리가 다시 붙인다
  const token = /\{\s*name\s*\}\s*(님|씨|ji|जी)?/g
  if (name) return text.replace(token, name + (HONORIFIC[lang] ?? ''))
  // 이름을 모르면 토큰과 뒤따르는 구두점까지 지워 ", 안녕하세요" 같은 찌꺼기를 막는다
  return text.replace(new RegExp(token.source + '\\s*[,，、]?\\s*', 'g'), '')
    .replace(/^\s*[,，、]\s*/, '')
    .trim()
}

/** 응답에 컨텍스트에 없는 숫자가 나오면 거짓 수치로 간주 */
function numbersAreGrounded(text: string, ctx: Ctx): boolean {
  const ctxDigits = JSON.stringify(ctx).replace(/\D/g, '')
  const tokens = text.match(/[\d][\d.,\s]{2,}/g) ?? []
  return tokens.every((tok) => {
    const d = tok.replace(/\D/g, '')
    if (d.length < 3) return true // 연/월 등 짧은 숫자는 통과
    return ctxDigits.includes(d) || ctxDigits.includes(d.replace(/0+$/, ''))
  })
}

export default async function handler(req: Request) {
  const pre = preflight(req)
  if (pre) return pre

  if (req.method !== 'POST') return bad('POST only', 405)
  if (!rateLimit(clientIp(req), 30, 60_000)) return bad('too many requests', 429)

  let body: { message?: string; lang?: string; ctx?: Ctx }
  try {
    body = await req.json()
  } catch {
    return bad('invalid json')
  }
  const message = (body.message ?? '').slice(0, 500).trim()
  const lang = body.lang && LANG_NAME[body.lang] ? body.lang : 'ko'
  const ctx = body.ctx ?? {}
  if (!message) return bad('empty message')

  // 이름은 모델에 보내지 않는다 — 보이면 음차해서 쓴다. {name} 토큰으로만 부르게 한다
  const { name: _name, ...ctxForModel } = ctx

  try {
    const d = await openai({
      // 안내원 어투는 인사·안내·다음 안내 3문장 구조라 여유를 둔다
      // (네팔어·베트남어는 같은 문장도 토큰이 훨씬 많이 든다)
      max_tokens: 320,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}
CONTEXT: ${JSON.stringify(ctxForModel)}
USER MESSAGE: ${message}`,
        },
      ],
    })

    const raw = d?.choices?.[0]?.message?.content ?? ''
    const out = parseJson<{ action?: string; amount?: number | null; text?: string }>(raw)
    const text = fillName((out?.text ?? '').trim(), ctx.name, lang)
    const action = (ACTIONS as readonly string[]).includes(out?.action ?? '')
      ? (out!.action as ActionKind)
      : 'none'

    // 가드레일: 금지어 / 근거 없는 수치 → 클라이언트 템플릿으로 폴백
    if (!text) return json({ fallback: 'empty' })
    if (!copyLint(text)) return json({ fallback: 'copy' })
    if (!numbersAreGrounded(text, ctx)) return json({ fallback: 'ungrounded' })

    const amount =
      action === 'remit' && typeof out?.amount === 'number' && out.amount > 0
        ? Math.min(Math.round(out.amount), 99_000_000)
        : null

    return json({ text, action, amount })
  } catch (e) {
    // LLM 실패 시에도 앱이 멈추지 않도록 클라이언트가 기존 규칙 기반 응답을 쓴다
    return json({ fallback: (e as Error).message })
  }
}
