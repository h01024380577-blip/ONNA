import { describe, expect, it } from 'vitest'
import { decideTiming, laterParts, nowPart, overrideNow, SPLIT_MIN } from './timing'

const sg = { fxStrength: 'clearly-better' as const, fxRisk: 'calm' as const, laterDate: '2026-09-19' }
const total = (t: ReturnType<typeof decideTiming>) => t.parts.reduce((a, x) => a + x.amount, 0)

describe('decideTiming', () => {
  it('평소엔 지금 전액', () => {
    const t = decideTiming(600_000, sg, 'remit_full')
    expect(t).toEqual({ rule: 'now', cause: 'normal', parts: [{ when: 'now', amount: 600_000 }] })
  })

  it("에이전트가 '나중에'를 골랐으면 기다릴 날에 전액 예약", () => {
    const t = decideTiming(600_000, sg, 'later')
    expect(t).toMatchObject({ rule: 'wait', cause: 'agent-later', parts: [{ when: '2026-09-19', amount: 600_000 }] })
  })

  it('환율이 낮은 날엔 보내기를 골랐어도 예약', () => {
    const t = decideTiming(600_000, { ...sg, fxStrength: 'lower' }, 'remit_full')
    expect(t).toMatchObject({ rule: 'wait', cause: 'rate-low' })
  })

  it('환율이 흔들리고 40만원 이상이면 절반 지금 + 나머지 예약', () => {
    const t = decideTiming(600_000, { ...sg, fxRisk: 'volatile' }, 'remit_full')
    expect(t).toEqual({
      rule: 'split', cause: 'rate-moving',
      parts: [{ when: 'now', amount: 300_000 }, { when: '2026-09-19', amount: 300_000 }],
    })
  })

  it('나눌 때 지금 몫은 만원 단위, 합계는 그대로', () => {
    const t = decideTiming(450_000, { ...sg, fxRisk: 'moving' }, 'remit_adjust')
    expect(nowPart(t)).toBe(230_000)
    expect(total(t)).toBe(450_000)
  })

  it('흔들려도 40만원 미만이면 지금 전액', () => {
    expect(decideTiming(SPLIT_MIN - 10_000, { ...sg, fxRisk: 'volatile' }, 'remit_full').rule).toBe('now')
  })

  it('낮은 환율이 흔들림보다 먼저다', () => {
    expect(decideTiming(600_000, { fxStrength: 'lower', fxRisk: 'volatile', laterDate: 'x' }, 'remit_full').rule).toBe('wait')
  })
})

describe('도우미', () => {
  it('사용자가 지금 한 번에로 바꾸면 지금 전액 + 표시', () => {
    expect(overrideNow(500_000)).toEqual({ rule: 'now', cause: 'user', parts: [{ when: 'now', amount: 500_000 }], overridden: true })
  })
  it('지금 몫과 예약 몫', () => {
    const t = decideTiming(600_000, { ...sg, fxRisk: 'volatile' }, 'remit_full')
    expect(nowPart(t)).toBe(300_000)
    expect(laterParts(t)).toEqual([{ when: '2026-09-19', amount: 300_000 }])
    expect(nowPart(decideTiming(600_000, sg, 'later'))).toBe(0)
  })
})
