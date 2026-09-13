import { json, bad, openai, parseJson, copyLint, rateLimit, clientIp } from './_lib'

export const config = { runtime: 'edge' }

/* 오늘 환율에 대한 에이전트의 한 줄 판단.
   수치(환율·기준선·증감률)는 클라이언트가 코드로 계산해 넘기고,
   LLM은 그 값을 읽어 "오늘이 보내기 어떤 날인지"를 모국어 한 문장으로만 쓴다.
   실패하면 클라이언트가 기존 템플릿 문구를 그대로 쓴다 (PRD AG-4). */

const LANG_NAME: Record<string, string> = {
  ko: 'Korean', en: 'English', id: 'Indonesian', vi: 'Vietnamese', ne: 'Nepali',
}

const SYSTEM = `You are ONNA, a banking assistant for migrant workers in Korea sending money home.

You are given today's exchange rate and its 90-day baseline. Write ONE short sentence in the
REQUESTED LANGUAGE telling the worker what today's rate means for sending money home.

HARD RULES
- Use ONLY the numbers given. Never invent or round differently. You may omit numbers entirely.
- One sentence. Plain words. The reader may have low literacy.
- Describe the rate, do not command. "오늘은 평소보다 조금 더 받아요" is good;
  "지금 보내세요" is not. Never promise future rates.
- No investment or financial advice. Never mention fees or amounts not given.
- FORBIDDEN WORDS in any language: 거절, 차단, 위반, 블록체인, DID, 크리덴셜, 토큰.
- Tone: warm, factual, calm.

Guidance by advantagePct (today vs 90-day baseline):
  >= +1.0  : clearly better than usual
  +0.2..1.0: slightly better than usual
  -0.2..0.2: about the same as usual
  <= -0.2  : lower than usual — say it plainly, do not spin it

OUTPUT strict JSON: {"text":"<one sentence in requested language>"}`

export default async function handler(req: Request) {
  if (req.method !== 'POST') return bad('POST only', 405)
  if (!rateLimit(clientIp(req), 20, 60_000)) return bad('too many requests', 429)

  let body: {
    lang?: string
    quote?: string
    rateText?: string
    advantagePct?: number
    sampleText?: string
  }
  try {
    body = await req.json()
  } catch {
    return bad('invalid json')
  }

  const lang = body.lang && LANG_NAME[body.lang] ? body.lang : 'ko'
  const pct = typeof body.advantagePct === 'number' ? body.advantagePct : null
  if (pct === null || !body.rateText) return bad('missing rate data')

  const ctx = {
    currency: body.quote,
    rateToday: body.rateText, // ₩1 당 현지통화 표기
    advantagePct: pct, // 90일 기준선 대비 %
    sample: body.sampleText, // 10만원 환산 예시
  }

  try {
    const d = await openai(
      {
        max_tokens: 120,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}\nDATA: ${JSON.stringify(ctx)}`,
          },
        ],
      },
      9000,
    )
    const raw = d?.choices?.[0]?.message?.content ?? ''
    const text = (parseJson<{ text?: string }>(raw)?.text ?? '').trim()
    if (!text || !copyLint(text)) return json({ fallback: true })

    // 컨텍스트에 없는 숫자를 만들어내면 폐기 (AG-4)
    const ctxDigits = JSON.stringify(ctx).replace(/\D/g, '')
    const bogus = (text.match(/[\d][\d.,]{1,}/g) ?? []).some((tok) => {
      const dg = tok.replace(/\D/g, '')
      return dg.length >= 2 && !ctxDigits.includes(dg)
    })
    if (bogus) return json({ fallback: true })

    return json({ text }, 200, 1800) // 30분 캐시 — 환율이 그 안엔 크게 안 움직인다
  } catch {
    return json({ fallback: true })
  }
}
