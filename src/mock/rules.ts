import type { HoldCode, Scenario } from '../types'

// POST /compliance/precheck 목 — 판정은 규칙 엔진(코드), LLM은 설명만 (AG-3)
export const MONTHLY_LIMIT = 5_000_000
/** 신용 대출을 열기 위한 검증된 급여 기록 개월 수 */
export const CREDIT_MONTHS = 6

export interface Precheck {
  result: 'PASS' | 'HOLD'
  code?: HoldCode
  refNo?: string
}

let refSeq = 48213

export function precheck(amount: number, sentThisMonth: number, scenario: Scenario): Precheck {
  if (scenario === 'pass') return pass()
  if (scenario !== 'auto') return { result: 'HOLD', code: scenario }
  if (sentThisMonth + amount > MONTHLY_LIMIT) return { result: 'HOLD', code: 'HOLD_LIMIT_MONTHLY' }
  return pass()
}

function pass(): Precheck {
  refSeq += Math.floor(Math.random() * 7) + 1
  return { result: 'PASS', refNo: `IMB-2609-${refSeq}` }
}

export function newTxId(): string {
  return `tx_${Date.now().toString(36)}`
}

export function newTraceId(): string {
  return Math.random().toString(36).slice(2, 8)
}
