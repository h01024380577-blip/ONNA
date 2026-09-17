import { describe, expect, it } from 'vitest'
import { seedLedger, sameMonth, SPEND_MIN, SPEND_MAX, MONTHS_SEEDED } from './ledger'
import { PERSONAS } from './personas'

const NOW = new Date(2026, 8, 16, 14, 0).getTime() // 2026-09-16
const p = PERSONAS.minh

describe('seedLedger', () => {
  it('같은 페르소나·같은 날이면 항상 같은 내역 — 리셋해도 기록이 바뀌지 않는다', () => {
    expect(seedLedger(p, NOW)).toEqual(seedLedger(p, NOW))
  })

  it('페르소나가 다르면 내역도 다르다', () => {
    expect(seedLedger(PERSONAS.budi, NOW)).not.toEqual(seedLedger(PERSONAS.sita, NOW))
  })

  it('최신순으로 정렬돼 있다', () => {
    const l = seedLedger(p, NOW)
    for (let i = 1; i < l.length; i++) expect(l[i - 1].at).toBeGreaterThanOrEqual(l[i].at)
  })

  it('과거 완결월마다 급여·월세·송금·공과금이 있고, 생활 지출은 정한 범위 안', () => {
    const l = seedLedger(p, NOW)
    for (let k = 1; k <= MONTHS_SEEDED; k++) {
      const d = new Date(2026, 8 - k, 1)
      const m = l.filter((e) => sameMonth(e.at, d.getFullYear(), d.getMonth()))
      expect(m.filter((e) => e.kind === 'salary')).toHaveLength(1)
      expect(m.filter((e) => e.kind === 'rent')).toHaveLength(1)
      expect(m.filter((e) => e.kind === 'remit').length).toBeGreaterThanOrEqual(1)
      expect(m.filter((e) => e.kind === 'utility').length).toBeGreaterThanOrEqual(1)
      const living = m.filter((e) => e.kind === 'spend' || e.kind === 'utility').reduce((a, e) => a + e.amount, 0)
      expect(living).toBeGreaterThanOrEqual(SPEND_MIN - 1000)
      expect(living).toBeLessThanOrEqual(SPEND_MAX + 1000)
    }
  })

  it('과거 급여는 오늘과 같은 일자, 월세는 그 2일 뒤', () => {
    const l = seedLedger(p, NOW)
    const sal = l.filter((e) => e.kind === 'salary')
    expect(sal.every((e) => new Date(e.at).getDate() === 16)).toBe(true)
    const rent = l.filter((e) => e.kind === 'rent')
    expect(rent.every((e) => new Date(e.at).getDate() === 18)).toBe(true)
  })

  it('이번 달에는 급여·월세가 없고 생활비만 오늘 이전 날짜로 있다', () => {
    const l = seedLedger(p, NOW)
    const cur = l.filter((e) => sameMonth(e.at, 2026, 8))
    expect(cur.length).toBeGreaterThan(0)
    expect(cur.every((e) => e.kind === 'spend' || e.kind === 'utility')).toBe(true)
    expect(cur.every((e) => e.at < NOW)).toBe(true)
  })

  it('최근 6−monthsToCredit개 완결월과 이번 달만 검증된 기록 — 그 전 달은 은행 거래일 뿐', () => {
    const l = seedLedger(p, NOW) // minh: monthsToCredit 2 → 최근 4개월 검증
    for (let k = 1; k <= MONTHS_SEEDED; k++) {
      const d = new Date(2026, 8 - k, 1)
      const m = l.filter((e) => sameMonth(e.at, d.getFullYear(), d.getMonth()))
      expect(m.every((e) => e.verified === k <= 4)).toBe(true)
    }
    const cur = l.filter((e) => sameMonth(e.at, 2026, 8))
    expect(cur.every((e) => e.verified)).toBe(true)
  })

  it('송금 금액은 만원 단위, 수수료가 붙어 있다', () => {
    const l = seedLedger(p, NOW)
    for (const e of l.filter((e) => e.kind === 'remit')) {
      expect(e.amount % 10_000).toBe(0)
      expect(e.fee).toBe(3_000)
    }
  })
})
