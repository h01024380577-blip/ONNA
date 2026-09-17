import { describe, expect, it } from 'vitest'
import { judgeSituation } from './situation'

const base = {
  sendableMax: 900_000, remitAvg3m: 800_000, spendPace: 'usual' as const,
  fxStrength: 'clearly-better' as const, fxRisk: 'calm' as const, sentThisMonth: 0,
}

describe('judgeSituation', () => {
  it('상한이 평소 송금의 80% 이상이고 씀씀이가 평소면 여유', () => {
    expect(judgeSituation(base).money).toBe('roomy')
    expect(judgeSituation({ ...base, sendableMax: 640_000 }).money).toBe('roomy')
  })
  it('상한이 평소 송금의 80%보다 작으면 빠듯', () => {
    expect(judgeSituation({ ...base, sendableMax: 639_999 }).money).toBe('tight')
  })
  it('이번 달 씀씀이가 높으면 빠듯', () => {
    expect(judgeSituation({ ...base, spendPace: 'higher' }).money).toBe('tight')
  })
  it('평소 송금 기록이 없으면 최소 송금액(1만원)이 기준', () => {
    expect(judgeSituation({ ...base, remitAvg3m: 0, sendableMax: 9_999 }).money).toBe('tight')
    expect(judgeSituation({ ...base, remitAvg3m: 0, sendableMax: 10_000 }).money).toBe('roomy')
  })
  it('환율·흔들림은 신호 그대로, 이번 달 송금 여부', () => {
    const s = judgeSituation({ ...base, fxStrength: 'lower', fxRisk: 'volatile', sentThisMonth: 1 })
    expect(s).toMatchObject({ rate: 'lower', risk: 'volatile', sentAlready: true })
  })
})
