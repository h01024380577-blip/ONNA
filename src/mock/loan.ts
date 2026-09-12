import type { Persona } from '../types'

/* 소액대출 한도·금리 산정 — 판정은 규칙 엔진(코드), 에이전트는 사유 설명만 (AG-3)
   기록 기반: 재직 개월 + 송금 횟수 + 공과금 정시 납부가 근거 */
export const LOAN = {
  baseRate: 9.4, // 기록 없을 때 기준 금리(%)
  minMonths: 6, // 신용 산출 최소 이력
  cap: 3_000_000, // 파일럿 최대 한도
  terms: [6, 12, 24] as const,
}

export interface LoanOffer {
  limit: number
  rate: number
  /** 기록으로 깎인 금리 포인트 */
  discount: number
}

export function loanOffer(p: Persona, sessionRemits: number): LoanOffer {
  const remits = p.remitCount + sessionRemits
  // 한도 = 재직 개월 × 20만, 10만 단위 절삭, 상한 300만
  const raw = Math.min(LOAN.cap, p.monthsEmployed * 200_000)
  const limit = Math.floor(raw / 100_000) * 100_000
  // 금리 우대: 재직 12개월↑ 1.0%p, 송금 12회↑ 1.0%p, 공과금 정시 0.5%p
  const discount =
    (p.monthsEmployed >= 12 ? 1.0 : 0) + (remits >= 12 ? 1.0 : 0) + 0.5
  return { limit, rate: Math.round((LOAN.baseRate - discount) * 10) / 10, discount }
}

/** 원리금 균등 상환 월 납입액 */
export function monthlyPayment(amount: number, months: number, ratePct: number): number {
  const r = ratePct / 100 / 12
  if (r === 0) return Math.round(amount / months)
  const m = (amount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1)
  return Math.round(m / 10) * 10
}

export function totalRepay(monthly: number, months: number): number {
  return monthly * months
}
