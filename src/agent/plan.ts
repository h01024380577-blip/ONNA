import type { AgentPlan, AgentSignals, PlanAction } from '../types'

const ACTIONS: readonly PlanAction[] = ['remit_full', 'remit_adjust', 'later']
export const MIN_SEND = 10_000

type Translate = (key: string, slots?: Record<string, string | number>) => string
type Money = (n: number) => string

/** 폴백 금액 = 기존 공식. 'later' 에 금액이 없을 때도 이 값을 쓴다 */
export function formulaAmount(sg: AgentSignals): number {
  const raw = sg.salary - sg.livingFloor - sg.autoDebit
  return Math.min(Math.max(MIN_SEND, raw), Math.max(MIN_SEND, sg.sendableMax))
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/* 모델 응답 검증 — 통과하면 그 금액을 그대로 쓴다.
   범위를 벗어난 금액을 몰래 깎지 않는 이유: 문장에는 모델이 말한 금액이
   적혀 있어서, 숫자만 고치면 카드의 금액과 설명이 어긋난다. 통째로 폐기하고
   폴백으로 간다. (서버도 같은 규칙으로 한 번 걸러 준다) */
export function validatePlan(raw: unknown, sg: AgentSignals): AgentPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const action = ACTIONS.find((a) => a === r.action)
  if (!action) return null

  const say = str(r.say)
  const why = str(r.why)
  if (!say || !why) return null

  const st = (r.steps ?? {}) as Record<string, unknown>
  const steps = { signals: str(st.signals), compare: str(st.compare), decide: str(st.decide) }
  if (!steps.signals || !steps.compare || !steps.decide) return null

  const cap = Math.max(MIN_SEND, sg.sendableMax)
  const n = typeof r.amount === 'number' && Number.isFinite(r.amount) ? Math.round(r.amount) : NaN
  const amount = n >= MIN_SEND && n <= cap ? n : action === 'later' ? formulaAmount(sg) : NaN
  if (!Number.isFinite(amount)) return null

  const rejected = Array.isArray(r.rejected)
    ? r.rejected
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>
          const a = ACTIONS.find((v) => v === o.action)
          const text = str(o.text)
          return a && text ? { action: a, text } : null
        })
        .filter((x): x is { action: PlanAction; text: string } => x !== null)
        .slice(0, 2)
    : undefined

  return { action, amount, say, why, steps, ...(rejected?.length ? { rejected } : {}) }
}

/* LLM 실패·가드레일 폐기 때 쓰는 안전망. 여기서 또 분기하면 검증할 경로가
   두 배가 되므로 항상 전액 송금 + 공식 금액으로 고정한다. */
export function fallbackPlan(sg: AgentSignals, t: Translate, krw: Money): AgentPlan {
  const amount = formulaAmount(sg)
  return {
    action: 'remit_full',
    amount,
    say: t('b1.say', { amount: krw(amount) }),
    why: t('b1.why', { rate: sg.fxRateText, pct: sg.fxAdvantagePct, floor: krw(sg.livingFloor) }),
    steps: {
      signals: t('agent.fbStep1', { salary: krw(sg.salary), debit: krw(sg.autoDebit) }),
      compare: t('agent.fbStep2'),
      decide: t('agent.fbStep3', { amount: krw(amount), floor: krw(sg.livingFloor) }),
    },
  }
}
