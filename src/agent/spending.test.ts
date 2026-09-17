import { describe, expect, it } from 'vitest'
import { spendPace, summarizeSpending } from './spending'
import { PERSONAS } from '../mock/personas'
import type { LedgerEntry } from '../types'

const NOW = new Date(2026, 8, 16, 14, 0).getTime() // 2026-09-16, 급여일 16
const p = PERSONAS.minh

let n = 0
const e = (y: number, m1: number, d: number, kind: LedgerEntry['kind'], amount: number): LedgerEntry => ({
  id: `t${n++}`, at: new Date(y, m1 - 1, d, 12).getTime(), kind, dir: kind === 'salary' ? 'in' : 'out', amount, verified: true,
})

describe('spendPace', () => {
  it('일할 환산 페이스가 평균보다 15% 이상 높으면 higher', () => expect(spendPace(400_000, 16, 600_000)).toBe('higher'))
  it('15% 이상 낮으면 lower', () => expect(spendPace(200_000, 16, 600_000)).toBe('lower'))
  it('그 사이면 usual', () => expect(spendPace(320_000, 16, 600_000)).toBe('usual'))
  it('평균이 없으면 usual', () => expect(spendPace(100_000, 16, 0)).toBe('usual'))
})

describe('summarizeSpending', () => {
  // 6·7·8월 생활비 60만·70만·80만(공과금 포함), 송금 90만·90만·60만. 9월은 20만 썼고 월세 아직
  const ledger: LedgerEntry[] = [
    e(2026, 6, 3, 'spend', 550_000), e(2026, 6, 22, 'utility', 50_000), e(2026, 6, 17, 'remit', 900_000),
    e(2026, 7, 3, 'spend', 650_000), e(2026, 7, 22, 'utility', 50_000), e(2026, 7, 17, 'remit', 900_000),
    e(2026, 8, 3, 'spend', 750_000), e(2026, 8, 22, 'utility', 50_000), e(2026, 8, 17, 'remit', 600_000),
    e(2026, 8, 18, 'rent', 550_000),
    e(2026, 9, 5, 'spend', 200_000),
    // 4개월 전 것은 평균에 들어가면 안 된다
    e(2026, 5, 3, 'spend', 5_000_000),
  ]
  const s = summarizeSpending(ledger, p, NOW)

  it('3개 완결월 평균 생활 지출 (spend+utility)', () => expect(s.spendAvg3m).toBe(700_000))
  it('3개 완결월 평균 송금', () => expect(s.remitAvg3m).toBe(800_000))
  it('이번 달 지금까지', () => expect(s.spendThisMonth).toBe(200_000))
  it('20만/16일 → 월 37.5만 페이스, 평균 70만보다 낮다', () => expect(s.spendPace).toBe('lower'))
  it('월세 미납 → 자동이체 + 남은 평균 생활비', () => {
    expect(s.upcomingDebits).toBe(p.autoDebit + (700_000 - 200_000))
  })
  it('월세 예정일은 이번 달 급여일+2, 다음 급여일은 다음 달 같은 날', () => {
    expect(s.nextRentDate).toBe('2026-09-18')
    expect(s.nextSalaryDate).toBe('2026-10-16')
  })

  it('기다릴 날 — 월세가 아직이면 월세일', () => expect(s.laterDate).toBe('2026-09-18'))
  it('기다릴 날 — 월세가 이미 나갔으면 오늘부터 7일 뒤', () => {
    const s2 = summarizeSpending([...ledger, e(2026, 9, 2, 'rent', p.autoDebit)], p, NOW)
    expect(s2.laterDate).toBe('2026-09-23')
  })

  it('이번 달 월세가 이미 나갔으면 upcoming 에서 빼고 예정일은 다음 달', () => {
    const s2 = summarizeSpending([...ledger, e(2026, 9, 2, 'rent', p.autoDebit)], p, NOW)
    expect(s2.upcomingDebits).toBe(700_000 - 200_000)
    expect(s2.nextRentDate).toBe('2026-10-18')
  })

  it('이번 달 생활비가 평균을 넘었으면 남은 생활비는 0으로 본다', () => {
    const s3 = summarizeSpending([...ledger, e(2026, 9, 10, 'spend', 900_000)], p, NOW)
    expect(s3.upcomingDebits).toBe(p.autoDebit)
    expect(s3.spendPace).toBe('higher')
  })
})
