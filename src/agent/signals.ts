import type { AgentSignals, AppState, FxRisk, PastKey, PastPoint, Persona } from '../types'
import { FX, fxAdvantagePct } from '../mock/fx'
import { MONTHLY_LIMIT } from '../mock/rules'
import { summarizeSpending } from './spending'
import { assessCredit } from './credit'
import { judgeSituation } from './situation'

/* 오늘 환율이 얼마나 유리한지 — api/fx-brief.ts 와 같은 구간으로 판정한다.
   이 판정을 LLM 에 맡기면 +6.9%를 "조금 더"라고 쓰는 일이 생긴다(실측). */
export function fxStrength(pct: number): AgentSignals['fxStrength'] {
  if (pct >= 1.0) return 'clearly-better'
  if (pct >= 0.2) return 'slightly-better'
  if (pct > -0.2) return 'same'
  return 'lower'
}

/** 환율이 요즘 얼마나 흔들렸는지 — 오늘·1주 전·1달 전 시세의 (최대−최소)/오늘.
    과거 시세가 실값으로 없으면 판정하지 않는다(unknown). 목값으로 지어내면 거짓이 된다. */
export function fxSwing(rate: number, past?: Partial<Record<PastKey, PastPoint>>): number | undefined {
  const pts = [rate, past?.weekAgo?.rate, past?.monthAgo?.rate].filter((x): x is number => typeof x === 'number' && x > 0)
  if (pts.length < 2 || rate <= 0) return undefined
  return Math.round(((Math.max(...pts) - Math.min(...pts)) / rate) * 1000) / 10
}
export function fxRisk(swingPct: number | undefined): FxRisk {
  if (swingPct === undefined) return 'unknown'
  if (swingPct < 0.5) return 'calm'
  if (swingPct < 1.5) return 'moving'
  return 'volatile'
}

/** 급여 입금 직후 신호. balanceAfter 는 급여가 더해진 뒤의 잔액을 넘긴다.
    현행 공식값(급여−생활비−자동이체)은 일부러 넣지 않는다 — 넣으면 LLM 이
    그대로 베껴서 "자유 판단"이 무의미해진다. 폴백 경로에서만 쓴다. */
export function collectSignals(s: AppState, p: Persona, balanceAfter: number): AgentSignals {
  const fx = FX[p.currency]
  const pct = Number(fxAdvantagePct(p.currency))
  const swing = fxSwing(fx.rate, fx.past)
  const now = Date.now()
  const credit = assessCredit(s.ledger, p, s.creditReady)
  const core: Omit<AgentSignals, 'situation'> = {
    ...summarizeSpending(s.ledger, p, now),
    salary: p.salary,
    autoDebit: p.autoDebit,
    balanceAfter,
    livingFloor: s.livingFloor,
    // 생활비 기준선까지 뺀 상한. 이걸 안 빼면 에이전트가 계좌를 거의 비우는
    // 금액을 제안하고("192만원 보낼까요?") 앱이 약속한 "생활비는 남겨 뒀어요"가 거짓이 된다
    sendableMax: Math.max(0, balanceAfter - p.autoDebit - s.livingFloor),
    sentThisMonth: s.sentThisMonth,
    limitRemaining: Math.max(0, MONTHLY_LIMIT - s.sentThisMonth),
    homeCurrency: p.currency,
    fxRate: fx.rate,
    fxRateText: fx.rateText,
    fxAdvantagePct: pct,
    fxBasis: fx.avgReal ? '90d-average' : 'reference',
    fxStrength: fxStrength(pct),
    fxPast: fx.past,
    fxRisk: fxRisk(swing),
    fxSwingPct: swing,
    monthsEmployed: p.monthsEmployed,
    remitCount: p.remitCount + s.sessionRemits,
    monthsToCredit: credit.monthsToCredit,
    creditReady: credit.ready,
    loanMonthly: s.loan?.monthly,
    today: new Date(now).toISOString().slice(0, 10),
  }
  return { ...core, situation: judgeSituation(core) }
}
