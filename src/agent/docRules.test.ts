import { describe, expect, it } from 'vitest'
import { cleanAnswer, cleanChecks, toKind } from './docRules'

const raw = {
  summary: '9월 도시가스 요금이에요.',
  points: [
    { id: 'p1', text: '청구금액은 15,520원이에요.', cites: ['ocr'] },
    { id: 'p2', text: '납기일이 지나면 연체료가 붙어요.', cites: ['guide_gas#0', 'guide_ghost#9'] },
    { id: 'p3', text: '출처 없는 말', cites: ['guide_ghost#9'] },
    { id: 'p4', text: '', cites: ['ocr'] },
  ],
  actions: [
    { kind: 'autopay', reason: '매달 잊지 않게' },
    { kind: 'autopay', reason: '중복' },
    { kind: 'pay_now', reason: '허용 밖' },
    { kind: 'open_record', reason: '고지서엔 허용 밖' },
    { kind: 'human', reason: '' },
  ],
}

describe('cleanAnswer', () => {
  const a = cleanAnswer(raw, 'utility_bill', ['guide_gas#0'])!

  it('모르는 출처는 지우고, 출처가 없거나 빈 항목은 버린다', () => {
    expect(a.points).toEqual([
      { id: 'p1', text: '청구금액은 15,520원이에요.', cites: ['ocr'] },
      { id: 'p2', text: '납기일이 지나면 연체료가 붙어요.', cites: ['guide_gas#0'] },
    ])
  })

  it('서류 종류별 허용 행동만, 중복 없이', () => {
    expect(a.actions.map((x) => x.kind)).toEqual(['autopay', 'human'])
  })

  it('요약을 그대로 되풀이한 항목은 뺀다', () => {
    const b = cleanAnswer({ ...raw, points: [{ id: 'p0', text: raw.summary, cites: ['ocr'] }, ...raw.points] }, 'utility_bill', ['guide_gas#0'])!
    expect(b.points.map((x) => x.id)).toEqual(['p1', 'p2'])
  })

  it('요약이 없거나 남는 항목이 없으면 null', () => {
    expect(cleanAnswer({ ...raw, summary: '' }, 'utility_bill', [])).toBeNull()
    expect(cleanAnswer({ ...raw, points: [raw.points[2]] }, 'utility_bill', [])).toBeNull()
    expect(cleanAnswer(null, 'utility_bill', [])).toBeNull()
  })
})

describe('cleanChecks', () => {
  it('있는 항목을 가리키는 질문만, 최대 4개, yesno 기대값은 yes', () => {
    const c = cleanChecks(
      [
        { id: 'c1', pointId: 'p1', q: '청구금액은 얼마인가요?', type: 'value', expect: '15,520원' },
        { id: 'c2', pointId: 'p9', q: '없는 항목', type: 'value', expect: '1' },
        { id: 'c3', pointId: 'p2', q: '납기 후 연체료가 붙나요?', type: 'yesno' },
        { id: 'c4', pointId: 'p1', q: '', type: 'value', expect: '1' },
        { id: 'c5', pointId: 'p1', q: '값 없는 value', type: 'value', expect: '' },
        { id: 'c6', pointId: 'p1', q: '모르는 type', type: 'maybe', expect: 'x' },
      ],
      ['p1', 'p2'],
    )
    expect(c).toEqual([
      { id: 'c1', pointId: 'p1', q: '청구금액은 얼마인가요?', type: 'value', expect: '15,520원' },
      { id: 'c3', pointId: 'p2', q: '납기 후 연체료가 붙나요?', type: 'yesno', expect: 'yes' },
    ])
  })
})

it('toKind — 모르는 종류는 unknown', () => {
  expect(toKind('payslip')).toBe('payslip')
  expect(toKind('tax')).toBe('unknown')
})
