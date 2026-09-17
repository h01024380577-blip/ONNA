/* 서류 에이전트 공용 규칙 — api/doc-agent.ts(Edge)와 클라이언트가 같이 쓴다.
   import 가 없는 순수 모듈로 둔다: Edge 번들에 브라우저 코드가 딸려 가지 않게. */

export const DOC_KINDS = [
  'utility_bill', 'payslip', 'contract', 'bank_doc', 'residence_card', 'receipt', 'mail', 'unknown',
] as const
export type DocKind = (typeof DOC_KINDS)[number]

/** 앱이 실제로 실행할 수 있는 다음 행동만. "바로 납부"는 실제 납부처럼 보여 넣지 않는다 */
export const DOC_ACTIONS = ['autopay', 'due_reminder', 'ko_phrase', 'human', 'open_record'] as const
export type DocActionKind = (typeof DOC_ACTIONS)[number]

export const ACTIONS_BY_KIND: Record<DocKind, readonly DocActionKind[]> = {
  utility_bill: ['autopay', 'due_reminder', 'ko_phrase', 'human'],
  payslip: ['open_record', 'ko_phrase', 'human'],
  contract: ['due_reminder', 'ko_phrase', 'human'],
  bank_doc: ['open_record', 'ko_phrase', 'human'],
  residence_card: ['ko_phrase', 'human'],
  receipt: ['open_record', 'ko_phrase', 'human'],
  mail: ['ko_phrase', 'human'],
  unknown: ['ko_phrase', 'human'],
}

/** 검색 질의에 넣는 종류 이름 — 안내 자료가 한국어라 한국어로 */
export const KIND_KO: Record<DocKind, string> = {
  utility_bill: '공과금 고지서',
  payslip: '급여명세서',
  contract: '근로계약서',
  bank_doc: '은행 거래 서류',
  residence_card: '외국인등록증',
  receipt: '영수증',
  mail: '안내 우편물',
  unknown: '서류',
}

export interface DocPoint { id: string; text: string; cites: string[] }
export interface DocAction { kind: DocActionKind; reason: string }
export interface DocAnswer { summary: string; points: DocPoint[]; actions: DocAction[] }

/** CoVe 검증 질문. expect 는 초안이 주장한 값 — 검증 호출에는 보내지 않는다 */
export interface DocCheck {
  id: string
  pointId: string
  q: string
  type: 'value' | 'yesno'
  expect: string
}

export const toKind = (v: unknown): DocKind =>
  (DOC_KINDS as readonly string[]).includes(String(v)) ? (v as DocKind) : 'unknown'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** 최종 답 정리 — 모르는 출처 제거, 출처 없는·빈 항목 제거, 허용 밖·중복 행동 제거.
    쓸 만한 항목이 하나도 없으면 null */
export function cleanAnswer(raw: unknown, kind: DocKind, citeIds: readonly string[]): DocAnswer | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const summary = str(r.summary)
  if (!summary) return null

  const allowed = new Set(['ocr', ...citeIds])
  const points: DocPoint[] = (Array.isArray(r.points) ? r.points : [])
    .map((x, i) => {
      const o = (x ?? {}) as Record<string, unknown>
      const cites = (Array.isArray(o.cites) ? o.cites : []).map(String).filter((c) => allowed.has(c))
      return { id: str(o.id) || `p${i + 1}`, text: str(o.text), cites: [...new Set(cites)] }
    })
    // 요약을 그대로 되풀이한 항목은 화면에 두 번 보일 뿐이라 뺀다(실측)
    .filter((p) => p.text && p.cites.length && p.text !== summary)
    .slice(0, 5)
  if (!points.length) return null

  const ok = new Set<string>(ACTIONS_BY_KIND[kind])
  const actions: DocAction[] = []
  for (const x of Array.isArray(r.actions) ? r.actions : []) {
    const o = (x ?? {}) as Record<string, unknown>
    const k = String(o.kind)
    if (ok.has(k) && !actions.some((a) => a.kind === k)) actions.push({ kind: k as DocActionKind, reason: str(o.reason) })
  }
  return { summary, points, actions: actions.slice(0, 3) }
}

export function cleanChecks(raw: unknown, pointIds: readonly string[]): DocCheck[] {
  const ids = new Set(pointIds)
  const out: DocCheck[] = []
  for (const x of Array.isArray(raw) ? raw : []) {
    const o = (x ?? {}) as Record<string, unknown>
    const id = str(o.id)
    const pointId = str(o.pointId)
    const q = str(o.q).slice(0, 200)
    const type = o.type === 'value' || o.type === 'yesno' ? o.type : null
    const expect = type === 'yesno' ? 'yes' : str(o.expect)
    if (!id || !ids.has(pointId) || !q || !type || !expect) continue
    out.push({ id, pointId, q, type, expect })
  }
  return out.slice(0, 4)
}
