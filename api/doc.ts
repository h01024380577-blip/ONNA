import { json, bad, openai, parseJson, copyLint, maskPii, rateLimit, clientIp } from './_lib'

export const config = { runtime: 'edge' }

/* 서류 분석 — 이미지에서 글자를 읽고(OCR) 유형을 분류한 뒤
   사용자 모국어로 설명 + 할 수 있는 행동을 제안한다.

   프라이버시: 이미지는 메모리에서만 처리하고 저장하지 않는다.
   로그에도 원문·추출 텍스트를 남기지 않는다 (등록증 촬영과 동일 원칙) */

const KINDS = ['utility_bill', 'payslip', 'residence_card', 'contract', 'receipt', 'mail', 'unknown'] as const

const LANG_NAME: Record<string, string> = {
  ko: 'Korean', en: 'English', id: 'Indonesian', vi: 'Vietnamese', ne: 'Nepali',
}

const SYSTEM = `You read a photo of a Korean document for a migrant worker and explain it in their language.

STEP 1 — Read the document (OCR). Extract only what is actually printed.
STEP 2 — Classify: utility_bill, payslip, residence_card, contract, receipt, mail, unknown.
STEP 3 — Explain in the REQUESTED LANGUAGE.

HARD RULES
- Never invent values. If a field is unreadable, use null. Do not guess amounts or dates.
- Never state whether anything passes/fails any rule or regulation.
- No legal or financial advice. For contracts or disputes, suggest talking to a human.
- FORBIDDEN WORDS (any language): 거절, 차단, 위반, 블록체인, DID, 크리덴셜, 토큰.
- Keep "summary" to 1-2 short plain sentences. The reader may have low literacy.
- "koPhrase" must be a natural KOREAN sentence the worker can show or read aloud to a Korean staff member about this document. Always Korean regardless of requested language.

OUTPUT strict JSON only:
{
 "kind":"<one of the kinds>",
 "title":"<short document name in requested language>",
 "amount":"<printed amount with unit, e.g. 32,400원>"|null,
 "dueDate":"<printed due date>"|null,
 "issuer":"<printed issuer/company>"|null,
 "fields":[{"label":"<label in requested language>","value":"<printed value>"}],
 "summary":"<1-2 sentences in requested language>",
 "koPhrase":"<Korean sentence to show staff>",
 "confidence":"high|medium|low"
}
Put at most 4 items in "fields".`

export default async function handler(req: Request) {
  if (req.method !== 'POST') return bad('POST only', 405)
  if (!rateLimit(clientIp(req), 10, 60_000)) return bad('too many requests', 429)

  let body: { image?: string; lang?: string }
  try {
    body = await req.json()
  } catch {
    return bad('invalid json')
  }

  const image = body.image ?? ''
  const lang = body.lang && LANG_NAME[body.lang] ? body.lang : 'ko'
  if (!image.startsWith('data:image/')) return bad('image must be a data URL')
  if (image.length > 4_000_000) return bad('image too large (max ~3MB)', 413)

  try {
    const d = await openai(
      {
        max_tokens: 700,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}` },
              { type: 'image_url', image_url: { url: image, detail: 'high' } },
            ],
          },
        ],
      },
      40_000,
    )

    const raw = d?.choices?.[0]?.message?.content ?? ''
    const out = parseJson<Record<string, unknown>>(raw)
    if (!out) return json({ error: 'could not read document' }, 422)

    const kind = (KINDS as readonly string[]).includes(String(out.kind)) ? out.kind : 'unknown'
    const summary = maskPii(String(out.summary ?? '')).trim()
    const koPhrase = maskPii(String(out.koPhrase ?? '')).trim()
    if (!summary) return json({ error: 'empty summary' }, 422)
    if (!copyLint(summary) || !copyLint(koPhrase)) return json({ error: 'copy rule' }, 422)

    const fields = Array.isArray(out.fields)
      ? (out.fields as Array<{ label?: unknown; value?: unknown }>)
          .slice(0, 4)
          .map((f) => ({ label: maskPii(String(f?.label ?? '')), value: maskPii(String(f?.value ?? '')) }))
          .filter((f) => f.label && f.value)
      : []

    const str = (v: unknown) => (v == null || v === '' ? null : maskPii(String(v)))

    return json({
      kind,
      title: str(out.title),
      amount: str(out.amount),
      dueDate: str(out.dueDate),
      issuer: str(out.issuer),
      fields,
      summary,
      koPhrase,
      confidence: ['high', 'medium', 'low'].includes(String(out.confidence)) ? out.confidence : 'medium',
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
}
