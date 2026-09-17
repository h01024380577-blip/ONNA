import { describe, expect, it } from 'vitest'
import { checkMatches, dropPoints, findMismatches, verifyPayload } from './cove'
import type { DocCheck } from './docRules'

const v = (expect: string): DocCheck => ({ id: 'c', pointId: 'p1', q: 'q', type: 'value', expect })
const yn: DocCheck = { id: 'y', pointId: 'p2', q: 'q', type: 'yesno', expect: 'yes' }

describe('checkMatches', () => {
  it('금액은 숫자 묶음으로 견준다', () => {
    expect(checkMatches(v('15,520원'), { id: 'c', answer: '15520원' })).toBe(true)
    expect(checkMatches(v('15,520원'), { id: 'c', answer: '청구 15,520원 (납기 후 15,790원)' })).toBe(true)
    expect(checkMatches(v('15,520원'), { id: 'c', answer: '15,790원' })).toBe(false)
    // 하이픈으로 이어진 번호는 한 덩어리
    expect(checkMatches(v('07-1234-5678'), { id: 'c', answer: '07-1234-5678' })).toBe(true)
    expect(checkMatches(v('07-1234-5678'), { id: 'c', answer: '07-1234-5679' })).toBe(false)
    // 부분 숫자로 맞았다고 보지 않는다
    expect(checkMatches(v('12'), { id: 'c', answer: '1,284 m³' })).toBe(false)
  })

  it('날짜는 표기가 달라도 같은 날이면 일치, 연도가 한쪽에만 있어도 된다', () => {
    expect(checkMatches(v('2026. 10. 05.'), { id: 'c', answer: '2026-10-5' })).toBe(true)
    expect(checkMatches(v('2026년 10월 5일'), { id: 'c', answer: '10월 5일' })).toBe(true)
    expect(checkMatches(v('2026. 10. 05.'), { id: 'c', answer: '2026. 10. 15.' })).toBe(false)
  })

  it('글자 값은 공백·대소문자 무시 포함 관계', () => {
    expect(checkMatches(v('한빛도시가스'), { id: 'c', answer: '한빛도시가스(주)' })).toBe(true)
    expect(checkMatches(v('한빛도시가스'), { id: 'c', answer: '한국전력' })).toBe(false)
  })

  it('답이 없으면 불일치', () => {
    expect(checkMatches(v('15,520원'), { id: 'c', answer: null })).toBe(false)
    expect(checkMatches(v('15,520원'), undefined)).toBe(false)
  })

  it('yesno 는 yes 만 일치', () => {
    expect(checkMatches(yn, { id: 'y', answer: null, verdict: 'yes' })).toBe(true)
    expect(checkMatches(yn, { id: 'y', answer: null, verdict: 'unknown' })).toBe(false)
    expect(checkMatches(yn, { id: 'y', answer: 'yes', verdict: 'unknown' })).toBe(true)
  })
})

describe('findMismatches · verifyPayload · dropPoints', () => {
  const checks: DocCheck[] = [{ ...v('15,520원'), id: 'c1' }, { ...yn, id: 'c2' }]

  it('어긋난 질문만 항목 id 와 함께', () => {
    const m = findMismatches(checks, [
      { id: 'c1', answer: '15,520원' },
      { id: 'c2', answer: null, verdict: 'no' },
    ])
    expect(m).toEqual([{ checkId: 'c2', pointId: 'p2', q: 'q', answer: null }])
  })

  it('검증에는 기대값을 보내지 않는다', () => {
    expect(verifyPayload(checks)).toEqual([
      { id: 'c1', q: 'q', type: 'value' },
      { id: 'c2', q: 'q', type: 'yesno' },
    ])
  })

  it('어긋난 항목을 빼고, 남는 게 없으면 null', () => {
    const ans = { summary: 's', actions: [], points: [{ id: 'p1', text: 'a', cites: ['ocr'] }, { id: 'p2', text: 'b', cites: ['ocr'] }] }
    expect(dropPoints(ans, ['p2'])?.points.map((p) => p.id)).toEqual(['p1'])
    expect(dropPoints(ans, ['p1', 'p2'])).toBeNull()
  })
})
