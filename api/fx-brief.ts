import { json, bad, openai, parseJson, copyLint, rateLimit, clientIp, preflight } from './_lib'

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

The baseline differs by currency and is given as "basis":
  "90d-average": a real 90-day average of official published rates.
  "reference"  : a fixed reference rate, NOT a measured average.
Never call the baseline an average when basis is "reference" — say "usual" or "normal" instead.

The strength of today's rate is ALREADY DECIDED for you and given as "strength".
Do not re-judge it from the numbers. Write the sentence to match it exactly:
  "clearly-better"  : better than usual, stated plainly and with confidence.
                      NEVER use a hedging word here (slightly, a little, sedikit,
                      một chút, थोरै, 조금, 약간). It is a solid difference.
  "slightly-better" : better than usual, but only a little. A hedging word belongs here.
  "same"            : about the same as usual.
  "lower"           : lower than usual — say it plainly, do not spin it.

OUTPUT strict JSON: {"text":"<one sentence in requested language>"}`

/** 5개 언어의 "조금·약간" 부류 — 확실히 유리한 날에 나오면 안 되는 말 */
const HEDGE =
  /\b(slightly|a little|a bit|sedikit|agak|một chút|chút ít|hơi)\b|조금|약간|살짝|थोरै|अलिकति/i

export default async function handler(req: Request) {
  const pre = preflight(req)
  if (pre) return pre

  if (req.method !== 'POST') return bad('POST only', 405)
  if (!rateLimit(clientIp(req), 20, 60_000)) return bad('too many requests', 429)

  let body: {
    lang?: string
    quote?: string
    rateText?: string
    advantagePct?: number
    sampleText?: string
    basis?: string
  }
  try {
    body = await req.json()
  } catch {
    return bad('invalid json')
  }

  const lang = body.lang && LANG_NAME[body.lang] ? body.lang : 'ko'
  const pct = typeof body.advantagePct === 'number' ? body.advantagePct : null
  if (pct === null || !body.rateText) return bad('missing rate data')

  // 유리한 정도는 코드가 판정한다 (PRD AG-3: 판단은 규칙, 에이전트는 설명만).
  // LLM에게 맡기면 +6.9%를 "조금 더"라고 쓰는 일이 생긴다.
  const strength =
    pct >= 1.0 ? 'clearly-better'
    : pct >= 0.2 ? 'slightly-better'
    : pct > -0.2 ? 'same'
    : 'lower'

  const ctx = {
    currency: body.quote,
    rateToday: body.rateText, // ₩1 당 현지통화 표기
    advantagePct: pct, // 기준선 대비 %
    sample: body.sampleText, // 10만원 환산 예시
    basis: body.basis === '90d-average' ? '90d-average' : 'reference',
    strength,
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

    // 확실히 유리한 날인데 "조금"으로 깎아 쓰면 폐기 — 프롬프트만으로는 새는 케이스
    if (strength === 'clearly-better' && HEDGE.test(text)) return json({ fallback: true })

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
