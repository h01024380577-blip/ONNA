import type { Persona } from '../types'
import { apiUrl } from '../lib/api'

/* 소액대출 한도·금리 산정 — 판정은 규칙 엔진(코드), 에이전트는 사유 설명만 (AG-3)
   기록 기반: 재직 개월 + 송금 횟수 + 공과금 정시 납부가 근거 */
export const LOAN = {
  /** 가산금리(%p) — 조달금리 위에 얹는 신용·운영 스프레드 */
  spread: 5.7,
  minMonths: 6, // 신용 산출 최소 이력
  cap: 3_000_000, // 파일럿 최대 한도
  terms: [6, 12, 24] as const,
}

/** 조달 기준금리(수은채 유통수익률, 만기별 %). API 실패 시 이 고정값을 쓴다 */
export const benchmark = {
  m6: 3.46,
  m12: 3.73,
  m24: 3.96,
  live: false,
  asOf: '',
  source: '기본 기준선',
}

/** /api/rates 의 공시 금리로 기준선을 갱신 */
export async function loadLiveRates(): Promise<void> {
  try {
    const r = await fetch(apiUrl('/api/rates'), { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return
    const d = (await r.json()) as { m6?: number; m12?: number; m24?: number; asOf?: string; source?: string }
    if (typeof d.m6 !== 'number' || typeof d.m12 !== 'number' || typeof d.m24 !== 'number') return
    benchmark.m6 = d.m6
    benchmark.m12 = d.m12
    benchmark.m24 = d.m24
    benchmark.live = true
    benchmark.asOf = d.asOf ?? ''
    benchmark.source = d.source ?? ''
  } catch {
    /* 고정 기준선 유지 */
  }
}

/** 만기(개월)에 해당하는 조달금리 */
export function baseRateFor(months: number): number {
  if (months <= 6) return benchmark.m6
  if (months <= 12) return benchmark.m12
  return benchmark.m24
}

export interface LoanOffer {
  limit: number
  rate: number
  /** 기록으로 깎인 금리 포인트 */
  discount: number
  /** 금리 산출 근거 — 조달금리 + 가산 − 우대 */
  base: number
  spread: number
}

export function loanOffer(p: Persona, sessionRemits: number, months = 12): LoanOffer {
  const remits = p.remitCount + sessionRemits
  // 한도 = 재직 개월 × 20만, 10만 단위 절삭, 상한 300만
  const raw = Math.min(LOAN.cap, p.monthsEmployed * 200_000)
  const limit = Math.floor(raw / 100_000) * 100_000
  // 금리 우대: 재직 12개월↑ 1.0%p, 송금 12회↑ 1.0%p, 공과금 정시 0.5%p
  const discount =
    (p.monthsEmployed >= 12 ? 1.0 : 0) + (remits >= 12 ? 1.0 : 0) + 0.5
  const base = baseRateFor(months)
  const rate = Math.round((base + LOAN.spread - discount) * 10) / 10
  return { limit, rate, discount, base, spread: LOAN.spread }
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
