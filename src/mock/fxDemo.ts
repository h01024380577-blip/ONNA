import type { Currency, FxDemo, PastPoint } from '../types'
import { FX, fmtRate } from './fx'

/* 데모 콘솔 "환율 상황" — 송금 타이밍 분기(지금·나눠서·예약)를 시연하려고 FX 목 객체를
   그 자리에서 바꾼다. 홈 환율·견적·에이전트 신호가 같은 값을 보게 하려는 것이다.
   'real' 이면 원래 값으로 되돌린다. 같은 모드를 두 번 적용해도 결과가 같다(StrictMode). */

type Snapshot = { rate: number; rateText: string; past: (typeof FX)[Currency]['past'] }
const base: Partial<Record<Currency, Snapshot>> = {}
let current: FxDemo = 'real'

const DIGITS: Record<Currency, number> = { VND: 1, IDR: 1, NPR: 4 }
const roundTo = (cur: Currency, n: number) => Number(n.toFixed(DIGITS[cur]))

function ymdAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const point = (cur: Currency, rate: number, daysAgo: number): PastPoint => ({
  date: ymdAgo(daysAgo), rate, rateText: fmtRate(cur, rate),
})

export function applyFxDemo(mode: FxDemo): void {
  current = mode
  for (const cur of Object.keys(FX) as Currency[]) {
    const f = FX[cur]
    const b = (base[cur] ??= { rate: f.rate, rateText: f.rateText, past: f.past })
    f.rate = b.rate
    f.rateText = b.rateText
    f.past = b.past
    if (mode === 'low') {
      // 기준선보다 1.5% 낮은 날 → fxStrength 'lower'
      f.rate = roundTo(cur, f.avg3m * 0.985)
      f.rateText = fmtRate(cur, f.rate)
    } else if (mode === 'volatile') {
      // 1주 전 +2%, 1달 전 −1.5% → 흔들림 약 3.5% → fxRisk 'volatile'
      f.past = {
        weekAgo: point(cur, roundTo(cur, f.rate * 1.02), 7),
        monthAgo: point(cur, roundTo(cur, f.rate * 0.985), 30),
      }
    }
  }
}

/** loadLiveFx 가 실값을 받은 뒤 부른다 — 새 실값을 기준으로 삼고 현재 모드를 다시 적용 */
export function rebaseFxDemo(): void {
  for (const k of Object.keys(base) as Currency[]) delete base[k]
  if (current !== 'real') applyFxDemo(current)
}
