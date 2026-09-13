import { json, bad, openai, parseJson, copyLint, rateLimit, clientIp } from './_lib'

export const config = { runtime: 'edge' }

/* 에이전트 채팅 — LLM은 "무엇을 하려는지 분류 + 모국어 문장 작성"만 한다.
   금액·환율 등 수치는 클라이언트가 보낸 컨텍스트 값만 사용하고,
   실행은 항상 화면 확인 단계를 거친다 (PRD AG-3 / AG-4) */

const ACTIONS = ['remit', 'record', 'help', 'loan', 'none'] as const
type ActionKind = (typeof ACTIONS)[number]

interface Ctx {
  name?: string
  currency?: string
  salary?: number
  balance?: number
  sentThisMonth?: number
  livingFloor?: number
  fxRate?: number
  fxRateText?: string
  fxAdvantagePct?: number
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

HARD RULES
1. NUMBERS: Never invent numbers. Use ONLY values present in the CONTEXT json. If a number is not in CONTEXT, do not state one.
2. NO JUDGEMENTS: Never say whether a transfer passes or fails compliance. A separate rules engine decides that.
3. NO ADVICE: No personalized investment or financial advice.
4. FORBIDDEN WORDS (never output, in any language): 거절, 차단, 위반, 블록체인, DID, 크리덴셜, 토큰.
5. TONE: warm, plain, short. 2 sentences max. The user may have low literacy — avoid jargon.
6. MONEY: when you mention an amount, keep the exact formatting given in CONTEXT.

WHAT YOU DO
Classify the user's intent and write a reply in the REQUESTED LANGUAGE.
- remit  : wants to send money home. If they said an amount, echo it from CONTEXT.
- record : asks about their work/transfer record or credit progress.
- loan   : asks about borrowing. Only mention limit/rate if creditReady is true.
- help   : wants a human, has a document/paper question, or reports a suspicious call.
- none   : greeting, rate/balance question, or anything else — just answer from CONTEXT.

OUTPUT strict JSON only:
{"action":"remit|record|loan|help|none","amount":<number or null>,"text":"<reply in requested language>"}
"amount" is only for action=remit and must come from the user's message or CONTEXT.`

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

  try {
    const d = await openai({
      max_tokens: 220,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}
CONTEXT: ${JSON.stringify(ctx)}
USER MESSAGE: ${message}`,
        },
      ],
    })

    const raw = d?.choices?.[0]?.message?.content ?? ''
    const out = parseJson<{ action?: string; amount?: number | null; text?: string }>(raw)
    const text = (out?.text ?? '').trim()
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
