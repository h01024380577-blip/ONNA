import { describe, expect, it } from 'vitest'
import { collectSignals, fxStrength } from './signals'
import { initialState } from '../store'
import { PERSONAS } from '../mock/personas'
import { MONTHLY_LIMIT } from '../mock/rules'

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

  it('보낼 수 있는 상한은 입금 후 잔액에서 자동이체를 뺀 값', () => {
    const s = initialState('minh', 'home')
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(sg.sendableMax).toBe(s.balance + p.salary - p.autoDebit)
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
