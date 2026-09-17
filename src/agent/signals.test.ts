import { afterEach, describe, expect, it } from 'vitest'
import { collectSignals, fxRisk, fxStrength, fxSwing } from './signals'
import { initialState } from '../store'
import { PERSONAS } from '../mock/personas'
import { MONTHLY_LIMIT } from '../mock/rules'
import { applyFxDemo } from '../mock/fxDemo'
import { FX } from '../mock/fx'

describe('fxStrength', () => {
  it('1.0% 이상은 확실히 유리', () => expect(fxStrength(1.0)).toBe('clearly-better'))
  it('0.2~1.0%는 조금 유리', () => expect(fxStrength(0.5)).toBe('slightly-better'))
  it('±0.2% 안은 평소와 같다', () => {
    expect(fxStrength(0)).toBe('same')
    expect(fxStrength(-0.19)).toBe('same')
  })
  it('-0.2% 이하는 낮은 날', () => expect(fxStrength(-0.2)).toBe('lower'))
})

describe('collectSignals', () => {
  const p = PERSONAS.minh

  it('보낼 수 있는 상한은 자동이체와 생활비 기준선을 남긴 값', () => {
    const s = initialState('minh', 'home')
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(sg.sendableMax).toBe(s.balance + p.salary - p.autoDebit - s.livingFloor)
  })

  it('상한은 현행 공식값보다 크다 — 에이전트가 공식보다 더 보낼 여지가 있어야 한다', () => {
    const s = initialState('minh', 'home')
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(sg.sendableMax).toBeGreaterThan(p.salary - s.livingFloor - p.autoDebit)
  })

  it('한도 잔여는 월 한도에서 이번 달 보낸 돈을 뺀 값', () => {
    const s = { ...initialState('minh', 'home'), sentThisMonth: 1_000_000 }
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(sg.limitRemaining).toBe(MONTHLY_LIMIT - 1_000_000)
  })

  it('현행 공식값은 넘기지 않는다 — 넘기면 LLM 이 베낀다', () => {
    const s = initialState('minh', 'home')
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(JSON.stringify(sg)).not.toContain('proposalAmount')
  })
})

describe('fxSwing / fxRisk', () => {
  it('과거 시세가 없으면 판정하지 않는다 — 목값으로 지어내면 거짓', () => {
    expect(fxSwing(18.4, undefined)).toBeUndefined()
    expect(fxRisk(undefined)).toBe('unknown')
  })
  it('오늘·1주 전·1달 전의 (최대−최소)/오늘, 소수 1자리', () => {
    const past = { weekAgo: { date: '2026-09-09', rate: 18.2, rateText: '' }, monthAgo: { date: '2026-08-16', rate: 18.55, rateText: '' } }
    expect(fxSwing(18.4, past)).toBe(1.9)
  })
  it('0.5% 미만 calm · 1.5% 미만 moving · 그 이상 volatile', () => {
    expect(fxRisk(0.49)).toBe('calm')
    expect(fxRisk(0.5)).toBe('moving')
    expect(fxRisk(1.49)).toBe('moving')
    expect(fxRisk(1.5)).toBe('volatile')
  })
})

describe('collectSignals — 지출 신호', () => {
  const p = PERSONAS.minh
  it('원장에서 계산한 지출 요약이 신호에 합쳐진다', () => {
    const s = initialState('minh', 'home')
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(sg.spendAvg3m).toBeGreaterThan(0)
    expect(sg.spendThisMonth).toBeGreaterThanOrEqual(0)
    expect(['higher', 'usual', 'lower']).toContain(sg.spendPace)
    // 이번 달 월세는 아직 안 나갔으니 앞으로 나갈 돈에 자동이체가 들어 있다
    expect(sg.upcomingDebits).toBeGreaterThanOrEqual(p.autoDebit)
    expect(sg.nextRentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(sg.nextSalaryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(sg.fxRisk).toBeDefined()
  })
})

describe('환율 상황 데모', () => {
  const p = PERSONAS.minh
  afterEach(() => applyFxDemo('real'))

  it('낮음 → 환율 판정 lower, 기준선보다 낮은 환율', () => {
    applyFxDemo('low')
    const s = initialState('minh', 'home')
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(sg.fxStrength).toBe('lower')
    expect(FX.VND.rate).toBeLessThan(FX.VND.avg3m)
  })

  it('흔들림 → fxRisk volatile', () => {
    applyFxDemo('volatile')
    const s = initialState('minh', 'home')
    expect(collectSignals(s, p, s.balance).fxRisk).toBe('volatile')
  })

  it('실제로 되돌리면 원래 값', () => {
    const before = { rate: FX.VND.rate, past: FX.VND.past }
    applyFxDemo('low')
    applyFxDemo('volatile')
    applyFxDemo('real')
    expect(FX.VND.rate).toBe(before.rate)
    expect(FX.VND.past).toBe(before.past)
  })

  it('신호에 상황 판단과 기다릴 날이 들어 있다', () => {
    const s = initialState('minh', 'home')
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(['roomy', 'tight']).toContain(sg.situation.money)
    expect(sg.laterDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
