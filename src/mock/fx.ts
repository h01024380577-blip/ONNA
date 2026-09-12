import type { Currency, Quote } from '../types'

// GET /fx/quote 목 — 은행 고시 환율 + 3개월 평균 (RM-3: 숫자는 API 값, 문장만 템플릿)
interface FxInfo {
  rate: number
  avg3m: number
  /** 근거 문장에 들어가는 표기 (언어권 관례 반영) */
  rateText: string
  fxMinText: string // 정기송금 규칙의 환율 조건 표기
  etaKey: 'evening' | 'hour1' | 'morning'
  cancelMin: number // RM-10: 파트너망이 즉시 확정이면 0
}

export const FX: Record<Currency, FxInfo> = {
  VND: { rate: 18.4, avg3m: 18.07, rateText: '18,4₫', fxMinText: '18,0₫', etaKey: 'evening', cancelMin: 10 },
  IDR: { rate: 11.9, avg3m: 11.71, rateText: 'Rp11,9', fxMinText: 'Rp11,5', etaKey: 'hour1', cancelMin: 10 },
  NPR: { rate: 0.0965, avg3m: 0.0951, rateText: 'रु 0.0965', fxMinText: 'रु 0.094', etaKey: 'morning', cancelMin: 0 },
}

export const FEE = 3_000
export const BROKER_DELTA = 12_000

export function fxAdvantagePct(cur: Currency): string {
  const f = FX[cur]
  return (((f.rate - f.avg3m) / f.avg3m) * 100).toFixed(1)
}

export function getQuote(cur: Currency, amount: number): Quote {
  const f = FX[cur]
  return {
    rate: f.rate,
    rateText: f.rateText,
    receive: Math.round(amount * f.rate),
    fee: FEE,
    brokerDelta: BROKER_DELTA,
    etaKey: f.etaKey,
    cancelMin: f.cancelMin,
  }
}
