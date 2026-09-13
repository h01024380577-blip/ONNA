import type { AgentSignals, AppState, Persona } from '../types'
import { FX, fxAdvantagePct } from '../mock/fx'
import { MONTHLY_LIMIT } from '../mock/rules'

/* 오늘 환율이 얼마나 유리한지 — api/fx-brief.ts 와 같은 구간으로 판정한다.
   이 판정을 LLM 에 맡기면 +6.9%를 "조금 더"라고 쓰는 일이 생긴다(실측). */
export function fxStrength(pct: number): AgentSignals['fxStrength'] {
  if (pct >= 1.0) return 'clearly-better'
  if (pct >= 0.2) return 'slightly-better'
  if (pct > -0.2) return 'same'
  return 'lower'
}

/** 급여 입금 직후 신호. balanceAfter 는 급여가 더해진 뒤의 잔액을 넘긴다.
    현행 공식값(급여−생활비−자동이체)은 일부러 넣지 않는다 — 넣으면 LLM 이
    그대로 베껴서 "자유 판단"이 무의미해진다. 폴백 경로에서만 쓴다. */
export function collectSignals(s: AppState, p: Persona, balanceAfter: number): AgentSignals {
  const fx = FX[p.currency]
  const pct = Number(fxAdvantagePct(p.currency))
  return {
    salary: p.salary,
    autoDebit: p.autoDebit,
    balanceAfter,
    livingFloor: s.livingFloor,
    sendableMax: Math.max(0, balanceAfter - p.autoDebit),
    sentThisMonth: s.sentThisMonth,
    limitRemaining: Math.max(0, MONTHLY_LIMIT - s.sentThisMonth),
    homeCurrency: p.currency,
    fxRate: fx.rate,
    fxRateText: fx.rateText,
    fxAdvantagePct: pct,
    fxBasis: fx.avgReal ? '90d-average' : 'reference',
    fxStrength: fxStrength(pct),
    fxPast: fx.past,
    monthsEmployed: p.monthsEmployed,
    remitCount: p.remitCount + s.sessionRemits,
    monthsToCredit: p.monthsToCredit,
    creditReady: s.creditReady || p.monthsToCredit <= 0,
    loanMonthly: s.loan?.monthly,
    today: new Date().toISOString().slice(0, 10),
  }
}
