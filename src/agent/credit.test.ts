import { describe, expect, it } from 'vitest'
import { assessCredit, creditLimit } from './credit'
import { seedLedger } from '../mock/ledger'
import { PERSONAS } from '../mock/personas'
import { LOAN } from '../mock/loan'
import type { LedgerEntry } from '../types'

const NOW = new Date(2026, 8, 16, 14, 0).getTime()
const salaryNow = (amount: number): LedgerEntry => ({
  id: 'sal_now', at: NOW, kind: 'salary', dir: 'in', amount, verified: true,
})
const remitNow = (id: string): LedgerEntry => ({
  id, at: NOW, kind: 'remit', dir: 'out', amount: 300_000, fee: 3_000, verified: true,
})

describe('assessCredit', () => {
  it('시드 검증 개월 = 6 − monthsToCredit', () => {
    for (const id of ['budi', 'sita', 'minh'] as const) {
      const p = PERSONAS[id]
      const c = assessCredit(seedLedger(p, NOW), p)
      expect(c.creditMonths).toBe(6 - p.monthsToCredit)
      expect(c.monthsToCredit).toBe(p.monthsToCredit)
      expect(c.ready).toBe(false)
    }
  })

  it('Budi 는 이번 달 급여가 기록되는 순간 6개월을 채워 대출이 열린다', () => {
    const p = PERSONAS.budi
    const before = assessCredit(seedLedger(p, NOW), p)
    const after = assessCredit([salaryNow(p.salary), ...seedLedger(p, NOW)], p)
    expect(before.ready).toBe(false)
    expect(after.creditMonths).toBe(6)
    expect(after.monthsToCredit).toBe(0)
    expect(after.ready).toBe(true)
    expect(after.limit).toBeGreaterThan(before.limit)
  })

  it('검증된 송금이 한 건 늘 때마다 한도가 5만원 오른다', () => {
    const p = PERSONAS.minh
    const base = seedLedger(p, NOW)
    const a = assessCredit(base, p)
    const b = assessCredit([remitNow('r1'), ...base], p)
    expect(b.verifiedRemits).toBe(a.verifiedRemits + 1)
    expect(b.limit - a.limit).toBe(LOAN.perRemit)
  })

  it('검증되지 않은 기록은 세지 않는다', () => {
    const p = PERSONAS.minh
    const base = seedLedger(p, NOW)
    const unverified = { ...remitNow('r2'), verified: false }
    expect(assessCredit([unverified, ...base], p).verifiedRemits).toBe(assessCredit(base, p).verifiedRemits)
  })

  it('데모 토글은 준비 상태만 켠다 — 개월 수는 그대로', () => {
    const p = PERSONAS.sita
    const c = assessCredit(seedLedger(p, NOW), p, true)
    expect(c.ready).toBe(true)
    expect(c.creditMonths).toBe(2)
  })

  it('금리 = 기준 + 가산 − 우대, 소수 1자리', () => {
    const p = PERSONAS.budi // 재직 22개월 → 1.0%p
    const c = assessCredit(seedLedger(p, NOW), p, false, 12)
    expect(c.discount).toBe(1.0 + (c.verifiedRemits >= 6 ? 1.0 : 0) + 0.5)
    expect(c.rate).toBe(Math.round((c.base + LOAN.spread - c.discount) * 10) / 10)
  })
})

describe('creditLimit', () => {
  it('기본 + 개월×20만 + 송금×5만, 만원 단위', () => {
    expect(creditLimit(6, 8)).toBe(500_000 + 1_200_000 + 400_000)
  })
  it('개월은 6까지만 반영', () => expect(creditLimit(9, 0)).toBe(creditLimit(6, 0)))
  it('상한 300만원', () => expect(creditLimit(6, 100)).toBe(LOAN.cap))
})
