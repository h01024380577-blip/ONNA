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
  /** avg3m이 실제 90일 평균이면 true, 고정 기준선이면 false.
     화면에 "무엇 대비" 유리한지 정직하게 표기하려고 들고 다닌다 */
  avgReal?: boolean
}

export const FX: Record<Currency, FxInfo> = {
  VND: { rate: 18.4, avg3m: 18.07, rateText: '18,4₫', fxMinText: '18,0₫', etaKey: 'evening', cancelMin: 10 },
  IDR: { rate: 11.9, avg3m: 11.71, rateText: 'Rp11,9', fxMinText: 'Rp11,5', etaKey: 'hour1', cancelMin: 10 },
  NPR: { rate: 0.0965, avg3m: 0.0951, rateText: 'रु 0.0965', fxMinText: 'रु 0.094', etaKey: 'morning', cancelMin: 0 },
}

export const FEE = 3_000
export const BROKER_DELTA = 12_000

/** 실시간 환율 반영 여부 — 데모 패널 표시용 */
export const fxLive = { on: false, asOf: '' }

/** /api/fx 에서 받은 실제 환율로 FX 값을 덮어쓴다.
   화면들이 FX[통화]를 동기적으로 읽으므로, 객체를 그 자리에서 갱신해
   컴포넌트 구조를 바꾸지 않고 실값으로 전환한다. 실패하면 목값을 그대로 쓴다. */
export async function loadLiveFx(): Promise<void> {
  try {
    const r = await fetch('/api/fx', { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return
    const d = (await r.json()) as {
      asOf: string
      rates: Array<{
        quote: Currency
        rate: number
        rateText: string
        baseline90d: number
        baselineSource?: string
      }>
    }
    if (!Array.isArray(d.rates)) return
    for (const q of d.rates) {
      const f = FX[q.quote]
      if (!f || typeof q.rate !== 'number') continue
      f.rate = q.rate
      f.avg3m = q.baseline90d
      f.rateText = q.rateText
      f.avgReal = q.baselineSource === 'koreaexim-90d'
    }
    fxLive.on = true
    fxLive.asOf = d.asOf
  } catch {
    /* 네트워크·API 실패 시 목 환율 유지 — 데모가 멈추지 않게 */
  }
}

export function fxAdvantagePct(cur: Currency): string {
  // 표기는 소수 1자리 고정 (근거 문장·홈 블록 공용)
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
