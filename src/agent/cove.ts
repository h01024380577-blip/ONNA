import type { DocAnswer, DocCheck } from './docRules'

/* CoVe(Chain-of-Verification) 비교 — 초안이 주장한 값(expect)과, 초안을 보지 않은
   검증 호출의 답을 코드가 견준다. 어긋난 항목이 있을 때만 수정 호출을 한다. */

export interface DocVerifyAnswer {
  id: string
  answer: string | null
  verdict?: 'yes' | 'no' | 'unknown'
  cite?: string
}

export interface Mismatch {
  checkId: string
  pointId: string
  q: string
  answer: string | null
}

const pad = (s: string) => s.padStart(2, '0')
const YMD = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/
const MD = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/

function dateParts(s: string): { y?: string; md: string } | null {
  const a = s.match(YMD)
  if (a) return { y: a[1], md: pad(a[2]) + pad(a[3]) }
  const b = s.match(MD)
  return b ? { md: pad(b[1]) + pad(b[2]) } : null
}

/* 숫자 덩어리 — 천 단위 구분(,)·소수점(.)·번호 구분(-)으로 이어진 숫자는 하나로 본다.
   "15,520원" → 15520, "07-1234-5678" → 0712345678, "1,284 m³" → 1284 */
const digitGroups = (s: string) => (s.match(/\d(?:[\d,.-]*\d)?/g) ?? []).map((g) => g.replace(/\D/g, ''))
const norm = (s: string) => s.toLowerCase().replace(/[\s.,·()]/g, '')

export function checkMatches(c: DocCheck, a?: DocVerifyAnswer): boolean {
  if (!a) return false
  // 검증 호출이 verdict 대신 answer 에 yes 를 적는 경우가 있다(실측)
  if (c.type === 'yesno') return a.verdict === 'yes' || /^\s*yes\s*$/i.test(a.answer ?? '')
  const ans = (a.answer ?? '').trim()
  if (!ans) return false

  const de = dateParts(c.expect)
  const da = dateParts(ans)
  if (de || da) return !!de && !!da && de.md === da.md && (!de.y || !da.y || de.y === da.y)

  const en = c.expect.replace(/\D/g, '')
  if (en) return digitGroups(ans).includes(en)

  const e = norm(c.expect)
  const n = norm(ans)
  return !!e && !!n && (e.includes(n) || n.includes(e))
}

export function findMismatches(checks: DocCheck[], answers: DocVerifyAnswer[]): Mismatch[] {
  return checks
    .filter((c) => !checkMatches(c, answers.find((a) => a.id === c.id)))
    .map((c) => ({
      checkId: c.id,
      pointId: c.pointId,
      q: c.q,
      answer: answers.find((a) => a.id === c.id)?.answer ?? null,
    }))
}

/** 검증 호출에 보낼 질문 — 초안의 주장(expect)은 빼서 독립 검증이 되게 한다 */
export const verifyPayload = (checks: DocCheck[]) => checks.map(({ id, q, type }) => ({ id, q, type }))

/** 수정 호출이 실패했을 때 — 어긋난 항목만 뺀다 */
export function dropPoints(ans: DocAnswer, pointIds: string[]): DocAnswer | null {
  const points = ans.points.filter((p) => !pointIds.includes(p.id))
  return points.length ? { ...ans, points } : null
}
