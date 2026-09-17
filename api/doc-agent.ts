import {
  json, bad, openai, parseJson, copyLint, maskPii, rateLimit, clientIp, MODEL_VISION, preflight, groundedDigits,
} from './_lib'
import { embed, getChunks, matchChunks, type GuideChunk } from './_guides'
import { ACTIONS_BY_KIND, DOC_KINDS, KIND_KO, cleanAnswer, cleanChecks, toKind, type DocKind } from '../src/agent/docRules'
import { softenKo } from '../src/agent/koRegister'

export const config = { runtime: 'edge' }

/* 서류 에이전트 — 단계마다 요청이 따로 온다(클라이언트 useDocAgent 가 순서를 잡는다).
     ocr    : 사진 → 종류·주요 글자·항목·기본 요약            (vision)
     search : 질의 임베딩 → 문서 Vector DB(pgvector) top-5     (RAG)
     draft  : 근거 달린 초안 + 검증 질문                       (CoVe 1)
     verify : 초안을 보지 않고 원본 사진·자료로 질문에 답함      (CoVe 2, vision)
     revise : 어긋난 항목만 고침 — 어긋났을 때만 불린다          (CoVe 3)
   프라이버시: 사진·원문은 메모리에서만 처리하고 저장·로그하지 않는다. */

const LANG_NAME: Record<string, string> = {
  ko: 'Korean', en: 'English', id: 'Indonesian', vi: 'Vietnamese', ne: 'Nepali',
}
const MIN_SIMILARITY = 0.3

const RULES = `HARD RULES
- Never invent values. Use only what is printed on the document or written in the PASSAGES.
- Never state whether anything passes or fails any rule or regulation. No legal or financial advice.
- FORBIDDEN WORDS (any language): 거절, 차단, 위반, 블록체인, DID, 크리덴셜, 토큰.
- PRIVACY: never write the person's own identifiers — their name, address, customer / meter / card numbers.
  (The issuer's payment account or phone number is fine.) Talk about what the paper means and what to do.
- Plain, short sentences — the reader may have low literacy. Write every figure in Western digits (0-9).
- REGISTER, per language:
  Vietnamese: call the reader "quý khách", never "bạn", never "anh/chị"; end with "ạ" where natural.
  Indonesian: "Anda" or "Bapak/Ibu", soften with "ya". Nepali: तपाईं. English: a courteous bank teller.
{KO}`

/* 한국어 전용 어투 안내 — 공통 규칙에 두면 베트남어 문장 끝에 "이에요"가 붙었다(실측) */
const KO_BLOCK = `
KOREAN REGISTER — this is broken most often, so check every Korean sentence
- 부드러운 해요체만 쓴다: …이에요 / …예요 / …해요 / …돼요 / …있어요 / …하시면 돼요 / …붙어요.
- 합니다체 금지: 문장을 -합니다 / -습니다 / -입니다 / -됩니다 로 끝내지 않는다.
- 고쳐 쓰는 법:
    "청구금액은 15,520원입니다."         →  "청구금액은 15,520원이에요."
    "납기일은 10월 5일입니다."           →  "10월 5일까지 내시면 돼요."
    "연체가산금이 부과됩니다."            →  "늦게 내면 돈이 조금 더 붙어요."
    "자동이체를 신청할 수 있습니다."       →  "자동이체를 걸어 둘 수 있어요."`
/* 규칙 블록 바로 뒤({KO} 자리)에 넣는다 — 프롬프트 끝에 붙이면 합니다체가 두 번 모두 샜다(실측) */
const withLang = (system: string, lang: string) => system.replace('{KO}', lang === 'ko' ? KO_BLOCK : '')

/* 프롬프트만으로는 어투가 샌다(송금 에이전트에서 실측한 것과 같은 패턴) — 코드로 한 번 더 거른다 */
const KO_STIFF = /(?<!감사|축하|죄송|미안)(합니다|습니다|입니다|됩니다)[.!?…]?(?=\s|$)/
const ADDRESS_BAD: Record<string, RegExp> = { ko: KO_STIFF, vi: /\bbạn\b|anh\/chị/i }
/** 한국어가 아닌 답의 문장이 한국어 어미로 끝나는지 — 고유명사(한빛은행)·단위(원)는 허용 */
const KO_ENDING = /(이에요|예요|해요|돼요|있어요|습니다|입니다)(?=[\s.!?…]|$)/

type Body = Record<string, unknown>
const s = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '')
const opt = (v: unknown) => (v == null || v === '' ? null : maskPii(String(v)).trim())

function fieldsOf(v: unknown): Array<{ label: string; value: string }> {
  return (Array.isArray(v) ? v : [])
    .slice(0, 6)
    .map((f) => ({ label: maskPii(s((f as Body)?.label, 60)), value: maskPii(s((f as Body)?.value, 120)) }))
    .filter((f) => f.label && f.value)
}

function docBlock(b: Body, chunks: GuideChunk[]): string {
  const fields = fieldsOf(b.fields).map((f) => `- ${f.label}: ${f.value}`).join('\n') || '(none)'
  const passages = chunks.length
    ? chunks.map((c) => `[${c.id}] (${c.title} — ${c.source})\n${c.content}`).join('\n\n')
    : '(none — do not explain anything that needs a passage)'
  return `DOCUMENT KIND: ${toKind(b.kind)}
FIELDS:
${fields}
OCR TEXT [ocr]:
${maskPii(s(b.rawText, 800)) || '(none)'}
QUESTION: ${maskPii(s(b.question, 300)) || '(none)'}
PASSAGES:
${passages}`
}

const idsOf = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 10) : [])

async function chunksOf(b: Body): Promise<GuideChunk[]> {
  try {
    return await getChunks(idsOf(b.passageIds))
  } catch {
    return []
  }
}

const textOf = (d: unknown) =>
  parseJson<Body>((d as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? '')

/* ---------- ① OCR ---------- */
const OCR_SYSTEM = `You read a photo of a Korean document for a migrant worker.
STEP 1 — Read it (OCR). Extract only what is actually printed.
STEP 2 — Classify it as one of: ${DOC_KINDS.join(', ')}.
  utility_bill = gas, electricity, water, phone or health-insurance bill. bank_doc = bank statement,
  transfer receipt, balance certificate. payslip = wage statement. contract = employment contract.
STEP 3 — Explain it briefly in the REQUESTED LANGUAGE.
${RULES}
- "rawText": the most important printed lines in reading order, in Korean exactly as printed, at most 600 characters.
- "fields": only the values that matter for what to do next — amounts, dates, period, usage, how to pay.
  Never names, addresses, or customer / meter / account numbers.
- "summary": 1-2 short sentences in the requested language: what this paper is, how much, by when.
- "koPhrase": a natural KOREAN sentence the worker can show or read to a Korean staff member about this document.
OUTPUT strict JSON only:
{"kind":"…","title":"<short document name in requested language>","rawText":"…",
 "amount":"<printed amount with unit>"|null,"dueDate":"<printed due date>"|null,"issuer":"<printed issuer>"|null,
 "fields":[{"label":"<label in requested language>","value":"<printed value>"}],
 "summary":"…","koPhrase":"…","confidence":"high|medium|low"}
At most 6 items in "fields".`

async function stepOcr(b: Body, lang: string) {
  const image = s(b.image, 5_000_000)
  if (!image.startsWith('data:image/')) return bad('image must be a data URL')
  if (image.length > 4_000_000) return bad('image too large (max ~3MB)', 413)

  const d = await openai(
    {
      model: MODEL_VISION,
      max_tokens: 1100,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: withLang(OCR_SYSTEM, lang) },
        {
          role: 'user',
          content: [
            { type: 'text', text: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}` },
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
          ],
        },
      ],
    },
    22_000,
  )
  const out = textOf(d)
  if (!out) return json({ error: 'could not read document' }, 422)
  // 요약은 사용자에게 바로 보일 수 있다(검증 실패 시) — 해요체로 다듬는다. koPhrase 는 직원에게 보여 줄 문장이라 그대로
  const summary = tidy(opt(out.summary) ?? '', lang)
  const koPhrase = opt(out.koPhrase) ?? ''
  if (!summary) return json({ error: 'empty summary' }, 422)
  if (!copyLint(summary) || !copyLint(koPhrase)) return json({ error: 'copy rule' }, 422)

  return json({
    kind: toKind(out.kind),
    title: opt(out.title),
    rawText: (opt(out.rawText) ?? '').slice(0, 800),
    amount: opt(out.amount),
    dueDate: opt(out.dueDate),
    issuer: opt(out.issuer),
    fields: fieldsOf(out.fields),
    summary,
    koPhrase,
    confidence: ['high', 'medium', 'low'].includes(String(out.confidence)) ? out.confidence : 'medium',
  })
}

/* ---------- ② RAG 검색 ---------- */
async function stepSearch(b: Body) {
  const kind = toKind(b.kind)
  const query = [
    KIND_KO[kind],
    s(b.title, 100),
    fieldsOf(b.fields).map((f) => f.label).join(' '),
    maskPii(s(b.question, 300)),
    maskPii(s(b.rawText, 300)),
  ]
    .filter(Boolean)
    .join('\n')
  try {
    const rows = await matchChunks(await embed(query), 5, kind === 'unknown' ? null : kind)
    const passages = rows
      .filter((r) => (r.similarity ?? 0) >= MIN_SIMILARITY)
      .map((r) => ({
        id: r.id,
        docId: r.doc_id,
        title: r.title,
        source: r.source,
        url: r.url,
        // 화면 발췌 — 마크다운 제목 기호·줄바꿈을 걷어 낸다
        snippet: r.content.replace(/^#{1,6}\s*/gm, '').replace(/\s+/g, ' ').trim().slice(0, 180),
        similarity: Math.round((r.similarity ?? 0) * 100) / 100,
      }))
    return json({ passages })
  } catch (e) {
    return json({ passages: [], error: (e as Error).message }, 502)
  }
}

/* ---------- 답 검증 (draft·revise 공용) ---------- */
/* 한국어: 합니다체 문장 끝을 해요체로 바꾸고(softenKo), 받침 뒤 "이예요"·"이어요"는
   표준 표기 "이에요"로 맞춘다 (실측: "15,520원이예요") */
const tidy = (v: string, lang: string) =>
  maskPii(lang === 'ko' ? softenKo(v).replace(/이(예|어)요/g, '이에요') : v)

type Checked = { ok: true; ans: { summary: string; points: Array<{ id: string; text: string; cites: string[] }>; actions: Array<{ kind: string; reason: string }> } } | { ok: false; reason: string }

/** 답 검증 — 실패 사유를 돌려줘서 폴백 원인을 추적할 수 있게 한다 */
function checkAnswer(out: Body | null, kind: DocKind, chunks: GuideChunk[], sourceDigits: string, lang: string): Checked {
  const ans = cleanAnswer(out, kind, chunks.map((c) => c.id))
  if (!ans) return { ok: false, reason: 'shape' }
  const masked = {
    summary: tidy(ans.summary, lang),
    points: ans.points.map((p) => ({ ...p, text: tidy(p.text, lang) })),
    actions: ans.actions.map((a) => ({ ...a, reason: tidy(a.reason, lang) })),
  }
  const all = [masked.summary, ...masked.points.map((p) => p.text), ...masked.actions.map((a) => a.reason)].filter(Boolean)
  if (!all.every(copyLint)) return { ok: false, reason: 'copy' }
  if (!groundedDigits(all, sourceDigits)) return { ok: false, reason: 'ungrounded' }
  const register = ADDRESS_BAD[lang]
  if (register && all.some((v) => register.test(v))) return { ok: false, reason: 'register' }
  if (lang !== 'ko' && all.some((v) => KO_ENDING.test(v))) return { ok: false, reason: 'mixed-language' }
  return { ok: true, ans: masked }
}

const digitsOf = (b: Body, chunks: GuideChunk[]) =>
  (s(b.rawText, 800) + JSON.stringify(fieldsOf(b.fields)) + chunks.map((c) => c.content).join(' ')).replace(/\D/g, '')

const allowedFor = (kind: DocKind) => ACTIONS_BY_KIND[kind].join(', ')

/* ---------- ③-1 초안 + 검증 질문 ---------- */
const DRAFT_SYSTEM = `You explain a Korean document to a migrant worker, grounded in two kinds of sources:
  [ocr]   the printed text and fields read from their document
  [<id>]  PASSAGES from ONNA's guide library
Write in the REQUESTED LANGUAGE.
${RULES}
- Every point must cite its sources: "ocr" and/or passage ids. A point without a source must not exist.
  If any part of a point comes from a passage, include that passage id in "cites" too.
- General explanations (what a charge means, what happens if paid late, how automatic payment works)
  must come from PASSAGES. If no passage covers it, do not say it.
- If a QUESTION is given, answer it first.
- Points must help the worker act: what the paper is for, how much and by when, what happens if it is late,
  how it can be paid. Do not just list printed fields one by one.

Then plan a verification (Chain-of-Verification). Write 2-4 "checks" — short questions that would catch
a mistake in your points. Ask neutrally ("When is the due date?", not "Is the due date October 5?").
  type "value": the answer is a printed value (amount, date, name). Put the value your point claims in "expect".
  type "yesno": a fact taken from a passage, asked so that "yes" means your point is right. "expect": "yes".
Write the checks in the same language as the document text (Korean).

Pick up to 3 "actions" the app can do next, ONLY from: {ALLOWED}. Give each a one-sentence reason.

OUTPUT strict JSON only:
{"summary":"<1-2 sentences>","points":[{"id":"p1","text":"…","cites":["ocr","<passage id>"]}],
 "actions":[{"kind":"…","reason":"…"}],
 "checks":[{"id":"c1","pointId":"p1","q":"…","type":"value|yesno","expect":"…"}]}
Write 2-5 points.`

async function stepDraft(b: Body, lang: string) {
  const kind = toKind(b.kind)
  const chunks = await chunksOf(b)
  const digits = digitsOf(b, chunks)
  let reason = 'unknown'
  for (let i = 0; i < 2; i++) {
    const d = await openai(
      {
        max_tokens: 900,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: withLang(DRAFT_SYSTEM.replace('{ALLOWED}', allowedFor(kind)), lang) },
          { role: 'user', content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}\n${docBlock(b, chunks)}` },
        ],
      },
      9_000,
    )
    const out = textOf(d)
    const r = checkAnswer(out, kind, chunks, digits, lang)
    if ('reason' in r) {
      reason = r.reason
      continue
    }
    const checks = cleanChecks(out?.checks, r.ans.points.map((p) => p.id))
    return json({ ...r.ans, checks })
  }
  return json({ error: `draft ${reason}` }, 422)
}

/* ---------- ③-2 독립 검증 ---------- */
const VERIFY_SYSTEM = `You are a careful checker. Answer each question using ONLY the document image and the PASSAGES.
You have not seen any earlier explanation. Do not guess.
- type "value": copy the value exactly as printed (with its unit), or null if it is not printed.
  Never calculate, subtract or combine numbers — if the exact answer is not printed, answer null.
- type "yesno": "verdict" is "yes" or "no" only if the PASSAGES or the document clearly say so; otherwise "unknown".
- "cite": "ocr" if you used the document, otherwise the passage id you used.
Answer in the language of the question. FORBIDDEN WORDS: 거절, 차단, 위반, 블록체인, DID, 크리덴셜, 토큰.
OUTPUT strict JSON only: {"answers":[{"id":"c1","answer":"…"|null,"verdict":"yes|no|unknown","cite":"…"}]}`

async function stepVerify(b: Body) {
  const image = s(b.image, 5_000_000)
  if (!image.startsWith('data:image/')) return bad('image must be a data URL')
  const checks = (Array.isArray(b.checks) ? b.checks : [])
    .slice(0, 4)
    .map((c) => ({
      id: s((c as Body)?.id, 20),
      q: maskPii(s((c as Body)?.q, 200)),
      type: (c as Body)?.type === 'yesno' ? 'yesno' : 'value',
    }))
    .filter((c) => c.id && c.q)
  if (!checks.length) return bad('no checks')
  const chunks = await chunksOf(b)
  const passages = chunks.length
    ? chunks.map((c) => `[${c.id}] (${c.title})\n${c.content}`).join('\n\n')
    : '(none)'

  const d = await openai(
    {
      model: MODEL_VISION,
      max_tokens: 400,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: VERIFY_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: `PASSAGES:\n${passages}\n\nQUESTIONS:\n${JSON.stringify(checks)}` },
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
          ],
        },
      ],
    },
    20_000,
  )
  const out = textOf(d)
  const ids = new Set(checks.map((c) => c.id))
  const answers = (Array.isArray(out?.answers) ? (out!.answers as unknown[]) : [])
    .map((x) => {
      const o = (x ?? {}) as Body
      const verdict = ['yes', 'no', 'unknown'].includes(String(o.verdict)) ? String(o.verdict) : 'unknown'
      return { id: s(o.id, 20), answer: o.answer == null ? null : maskPii(s(o.answer, 120)), verdict, cite: s(o.cite, 60) }
    })
    .filter((a) => ids.has(a.id))
  return json({ answers })
}

/* ---------- ③-3 조건부 수정 ---------- */
const REVISE_SYSTEM = `You wrote a DRAFT explanation of a Korean document. An independent check found MISMATCHES:
for each, the question and what the document or passages actually say (answer, or null if not found).
Fix the draft: correct the point with the checked answer when it is clear; otherwise remove the point.
Keep everything else as it was — same sources, same rules, same language.
${RULES}
Actions ONLY from: {ALLOWED}.
OUTPUT strict JSON only:
{"summary":"…","points":[{"id":"…","text":"…","cites":["…"]}],"actions":[{"kind":"…","reason":"…"}]}`

async function stepRevise(b: Body, lang: string) {
  const kind = toKind(b.kind)
  const chunks = await chunksOf(b)
  const mismatches = (Array.isArray(b.mismatches) ? b.mismatches : [])
    .slice(0, 4)
    .map((m) => ({
      pointId: s((m as Body)?.pointId, 20),
      q: s((m as Body)?.q, 200),
      answer: (m as Body)?.answer == null ? null : s((m as Body)?.answer, 120),
    }))
  const draft = cleanAnswer(b.draft, kind, chunks.map((c) => c.id))
  if (!draft || !mismatches.length) return bad('nothing to revise')
  /* 검증 답의 숫자는 근거로 더하지 않는다 — 검증 호출이 "인쇄된 값"이 아니라 계산한 값
     (15,790 − 15,520 = 270원)을 답한 것을 실측했다. 수정본의 숫자도 원문·자료에 있어야 한다 */
  const digits = digitsOf(b, chunks)

  // 가드레일 탈락은 대부분 확률적이라 한 번 더 뽑는다(초안과 같은 방식)
  let reason = 'unknown'
  for (let i = 0; i < 2; i++) {
    const d = await openai(
      {
        max_tokens: 800,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: withLang(REVISE_SYSTEM.replace('{ALLOWED}', allowedFor(kind)), lang) },
          {
            role: 'user',
            content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}\n${docBlock(b, chunks)}\n\nDRAFT:\n${JSON.stringify(draft)}\n\nMISMATCHES:\n${JSON.stringify(mismatches)}`,
          },
        ],
      },
      9_000,
    )
    const r = checkAnswer(textOf(d), kind, chunks, digits, lang)
    if ('ans' in r) return json(r.ans)
    reason = r.reason
  }
  return json({ error: `revise ${reason}` }, 422)
}

export default async function handler(req: Request) {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return bad('POST only', 405)
  // 한 번의 서류 분석이 4~5회 호출한다
  if (!rateLimit(clientIp(req), 40, 60_000)) return bad('too many requests', 429)

  let b: Body
  try {
    b = await req.json()
  } catch {
    return bad('invalid json')
  }
  const lang = typeof b.lang === 'string' && LANG_NAME[b.lang] ? b.lang : 'ko'

  try {
    switch (b.step) {
      case 'ocr': return await stepOcr(b, lang)
      case 'search': return await stepSearch(b)
      case 'draft': return await stepDraft(b, lang)
      case 'verify': return await stepVerify(b)
      case 'revise': return await stepRevise(b, lang)
      default: return bad('unknown step')
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
}
