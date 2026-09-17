import { json, bad, openai, parseJson, copyLint, rateLimit, clientIp, preflight } from './_lib'
import { softenKo } from '../src/agent/koRegister'

export const config = { runtime: 'edge' }

/* ONNA 오케스트레이터 ① 의도 분석 → ② Task 분업.
   LLM 은 "어느 전문 도우미에게 맡길지 + 모국어 한 줄"만 쓴다. 금액·환율 등 수치는
   클라이언트 컨텍스트 값만 쓰고, 실제 일은 전문 에이전트(송금·서류·신용)가 한다.
   클라이언트(src/agent/orchestrator.ts)가 태스크를 한 번 더 검증한다 (AG-3 / AG-4) */

const AGENTS = ['remit', 'doc', 'credit', 'general'] as const
type AgentKind = (typeof AGENTS)[number]
const MAX_TASKS = 2

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
  /** 원장에서 코드가 계산한 지출 요약 — "이번 달 얼마 썼어요?" 대답용 */
  spendAvg3m?: number
  spendThisMonth?: number
  upcomingDebits?: number
  nextRentDate?: string
}

const LANG_NAME: Record<string, string> = {
  ko: 'Korean', en: 'English', id: 'Indonesian', vi: 'Vietnamese', ne: 'Nepali',
}

/* 한국어 전용 안내 — 공통 프롬프트에 두면 인도네시아어·네팔어 답에 한국어 예문이 그대로 섞였다(실측) */
const KO_BLOCK = `

KOREAN REGISTER — check every Korean sentence
- 부드러운 해요체만: …이에요 / …예요 / …해요 / …드릴게요 / …하시면 돼요.
- 문장을 -합니다 / -습니다 / -입니다 / -됩니다 / -하겠습니다 로 끝내지 않는다.
    "오늘의 환율은 18,9₫입니다."   →  "오늘 환율은 ₩1에 18,9₫이에요."
    "담당자에게 전달하겠습니다."     →  "송금 도우미가 준비해 드릴게요."
- 도우미에게 넘길 때 좋은 예: "송금은 송금 도우미가 바로 준비해 드릴게요. 고지서는 사진을 올려 주시면 서류 도우미가 읽어 드려요."`

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
- spendAvg3m: usual monthly living spending (last 3 months). spendThisMonth: spent so far this month.
  upcomingDebits: money still expected to leave before the next payday. All Korean won.
  nextRentDate: the day rent and automatic payments leave (YYYY-MM-DD) — say the day plainly.
  Use these for questions about spending, what is still going out, or whether now is a good time.
- creditReady: whether they can borrow yet. See HARD RULE 7.

WHAT YOU DO — you are the orchestrator
Read the message, work out what the person wants, and hand each piece of work to the right helper.
- remit   : wants to send money home (with or without an amount)
- doc     : asks about a paper, bill, letter, payslip, contract or bank document, or wants to show a photo of one
- credit  : asks about their work/transfer record, credit progress, or borrowing (obey HARD RULE 7)
- general : greeting, today's or past rate, balance, spending, wants a human, suspicious call, anything else
If the message has two different requests, return two tasks in the order they were asked. Never more than two.
"amount" is only for remit, and only if the person said an amount (or said "that amount" and proposalAmount is set).

"text":
- If the only task is general: the full answer, following every rule above (3 sentences max).
- Otherwise: at most TWO short, warm sentences saying which ONNA helper takes it and what happens next.
  The helpers are part of ONNA — never say a staff member or another person will handle it.
  For doc, always ask them to attach a photo of the paper. Do NOT answer the task yourself and do not
  state any amount, limit, rate or number of months in these sentences.
  Write it entirely in the REQUESTED LANGUAGE — never copy Korean words into another language.
"escalate": true only if they want to talk to a person or report a suspicious call.

DIGITS: write every figure in Western digits (0-9) in every language — never Devanagari (२) or other numerals.

BEFORE YOU ANSWER, check: honorific register? {name} token used instead of the real name?
amounts labelled as won? loan gate respected? 3 sentences or fewer? Fix it before replying.

OUTPUT strict JSON only:
{"tasks":[{"agent":"remit|doc|credit|general","amount":<number or null>}],"text":"<reply in requested language>","escalate":false}`

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

/* 네팔어 답에 데바나가리 숫자(२)가 섞이는 것을 실측했다 — 앱 표기와 맞춰 아라비아 숫자로 */
const DEV = '०१२३४५६७८९'
const toAsciiDigits = (t: string) => t.replace(/[०-९]/g, (c) => String(DEV.indexOf(c)))

/* 어투가 새면 한 번 더 뽑는다(송금·서류 에이전트와 같은 검사). 두 번째도 새면 답을 버리지 않고 쓴다 —
   일반 질문의 답은 템플릿보다 LLM 답이 낫다 */
const KO_STIFF = /(?<!감사|축하|죄송|미안)(합니다|습니다|입니다|됩니다)[.!?…]?(?=\s|$)/
const ADDRESS_BAD: Record<string, RegExp> = { ko: KO_STIFF, vi: /\bbạn\b|anh\/chị/i }
/** 한국어가 아닌 답에 한국어 문장이 섞였는지 — "(원)" 같은 한 글자는 허용 */
const MIXED_KO = /[가-힣]{2,}/

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
    let out: { tasks?: unknown; text?: string; escalate?: boolean } | null = null
    let text = ''
    for (let i = 0; i < 2; i++) {
      const d = await openai(
        {
          // 안내원 어투는 인사·안내·다음 안내 3문장 구조라 여유를 둔다
          // (네팔어·베트남어는 같은 문장도 토큰이 훨씬 많이 든다)
          max_tokens: 320,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: lang === 'ko' ? SYSTEM + KO_BLOCK : SYSTEM },
            {
              role: 'user',
              content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}
CONTEXT: ${JSON.stringify(ctxForModel)}
USER MESSAGE: ${message}`,
            },
          ],
        },
        7_000,
      )
      out = parseJson<{ tasks?: unknown; text?: string; escalate?: boolean }>(d?.choices?.[0]?.message?.content ?? '')
      text = fillName(toAsciiDigits((out?.text ?? '').trim()), ctx.name, lang)
      if (lang === 'ko') text = softenKo(text)
      const register = ADDRESS_BAD[lang]
      const mixed = lang !== 'ko' && MIXED_KO.test(text)
      if (!mixed && (!register || !register.test(text))) break
    }
    // 다른 언어 답에 한국어가 섞이면 읽을 수 없는 답이다 → 폴백(어투는 두 번째 답을 그대로 쓴다)
    if (lang !== 'ko' && MIXED_KO.test(text)) return json({ fallback: 'mixed-language' })

    // 태스크 모양만 여기서 거른다. 금액이 사용자 문장과 맞는지는 클라이언트가 본다
    const tasks: Array<{ agent: AgentKind; amount: number | null }> = []
    for (const x of Array.isArray(out?.tasks) ? out!.tasks : []) {
      const o = (x ?? {}) as Record<string, unknown>
      const agent = (AGENTS as readonly string[]).includes(String(o.agent)) ? (o.agent as AgentKind) : null
      if (!agent || tasks.some((t) => t.agent === agent)) continue
      const amount =
        agent === 'remit' && typeof o.amount === 'number' && o.amount > 0
          ? Math.min(Math.round(o.amount), 99_000_000)
          : null
      tasks.push({ agent, amount })
    }
    if (!tasks.length) tasks.push({ agent: 'general', amount: null })

    // 가드레일: 금지어 / 근거 없는 수치 → 클라이언트 폴백
    if (!text) return json({ fallback: 'empty' })
    if (!copyLint(text)) return json({ fallback: 'copy' })
    if (!numbersAreGrounded(text, ctx)) return json({ fallback: 'ungrounded' })

    return json({ tasks: tasks.slice(0, MAX_TASKS), text, escalate: out?.escalate === true })
  } catch (e) {
    // LLM 실패 시에도 앱이 멈추지 않도록 클라이언트가 기존 규칙 기반 응답을 쓴다
    return json({ fallback: (e as Error).message })
  }
}
