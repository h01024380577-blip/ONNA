import type { LedgerEntry, Persona } from '../types'
import { CREDIT_MONTHS } from '../mock/rules'
import { LOAN, baseRateFor } from '../mock/loan'

/* 거래 DB(원장) → 신용. 그림의 "신용 축적 → 신용 확인 → 대출 한도 증가·승인".
   검증된 기록(verified)만 센다 — 시드의 오래된 달은 은행 거래일 뿐 신용 기록이 아니다. */

export interface Credit {
  /** 검증된 급여가 있는 달 수 */
  creditMonths: number
  monthsToCredit: number
  verifiedRemits: number
  ready: boolean
  limit: number
  /** 연 금리(%) = base + spread − discount */
  rate: number
  discount: number
  base: number
  spread: number
}

const monthKey = (at: number) => {
  const d = new Date(at)
  return d.getFullYear() * 12 + d.getMonth()
}

export function creditLimit(creditMonths: number, verifiedRemits: number): number {
  const raw =
    LOAN.limitBase +
    Math.min(creditMonths, CREDIT_MONTHS) * LOAN.perMonth +
    verifiedRemits * LOAN.perRemit
  return Math.floor(Math.min(LOAN.cap, raw) / 10_000) * 10_000
}

/** demoReady = 데모 콘솔 "신용 6개월 충족" 토글 */
export function assessCredit(ledger: LedgerEntry[], p: Persona, demoReady = false, months = 12): Credit {
  const v = ledger.filter((e) => e.verified)
  const creditMonths = new Set(v.filter((e) => e.kind === 'salary').map((e) => monthKey(e.at))).size
  const verifiedRemits = v.filter((e) => e.kind === 'remit').length
  // 우대: 재직 12개월↑ 1.0%p · 검증 송금 6건↑ 1.0%p · 공과금 정시 0.5%p
  const discount = (p.monthsEmployed >= 12 ? 1.0 : 0) + (verifiedRemits >= 6 ? 1.0 : 0) + 0.5
  const base = baseRateFor(months)
  return {
    creditMonths,
    monthsToCredit: Math.max(0, CREDIT_MONTHS - creditMonths),
    verifiedRemits,
    ready: creditMonths >= CREDIT_MONTHS || demoReady,
    limit: creditLimit(creditMonths, verifiedRemits),
    rate: Math.round((base + LOAN.spread - discount) * 10) / 10,
    discount,
    base,
    spread: LOAN.spread,
  }
}
