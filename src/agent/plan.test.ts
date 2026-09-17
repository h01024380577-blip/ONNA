import { describe, expect, it } from 'vitest'
import { fallbackPlan, formulaAmount, validatePlan } from './plan'
import { collectSignals } from './signals'
import { initialState } from '../store'
import { PERSONAS } from '../mock/personas'
import { fmtKRW, makeT } from '../i18n'

const p = PERSONAS.minh
const s = initialState('minh', 'home')
const sg = collectSignals(s, p, s.balance + p.salary)

// 금액은 상한에서 끌어온다 — 상한 정의가 바뀔 때 픽스처가 조용히 무효가 되지 않게
const okAmount = sg.sendableMax - 20_000

const good = {
  action: 'remit_full',
  amount: okAmount,
  say: '월급이 들어왔어요.',
  why: '오늘 환율이 평소보다 좋아요.',
  steps: { signals: 'ㄱ', situation: 'ㄹ', compare: 'ㄴ', decide: 'ㄷ' },
  rejected: [{ action: 'later', text: '오늘이 유리해서요' }],
}

describe('validatePlan', () => {
  it('정상 플랜은 금액을 그대로 통과시킨다 — 우리가 몰래 고치지 않는다', () => {
    expect(validatePlan(good, sg)?.amount).toBe(okAmount)
  })

  it('모르는 행동은 폐기한다', () => {
    expect(validatePlan({ ...good, action: 'buy_stock' }, sg)).toBeNull()
  })

  it('보낼 수 있는 상한을 넘으면 폐기한다 — 금액만 깎으면 문장과 어긋난다', () => {
    expect(validatePlan({ ...good, amount: sg.sendableMax + 10_000 }, sg)).toBeNull()
  })

  it('1만원 미만은 폐기한다', () => {
    expect(validatePlan({ ...good, amount: 5_000 }, sg)).toBeNull()
  })

  it('단계 문장이 하나라도 비면 폐기한다', () => {
    expect(validatePlan({ ...good, steps: { signals: 'ㄱ', situation: 'ㄹ', compare: '', decide: 'ㄷ' } }, sg)).toBeNull()
  })

  it("'나중에'는 금액이 없어도 공식값으로 채운다", () => {
    const v = validatePlan({ ...good, action: 'later', amount: null }, sg)
    expect(v?.action).toBe('later')
    expect(v?.amount).toBe(formulaAmount(sg))
  })

  it('상황 판단 문장이 비면 폐기한다', () => {
    expect(validatePlan({ ...good, steps: { ...good.steps, situation: '' } }, sg)).toBeNull()
  })

  it('채팅에서 사용자가 말한 금액은 상한을 넘어도 되풀이할 수 있다', () => {
    const asked = sg.sendableMax + 100_000
    expect(validatePlan({ ...good, amount: asked }, sg, asked)?.amount).toBe(asked)
    expect(validatePlan({ ...good, amount: asked + 10_000 }, sg, asked)).toBeNull()
  })

  it("채팅 요청의 '나중에'는 요청 금액으로 채운다", () => {
    expect(validatePlan({ ...good, action: 'later', amount: null }, sg, 700_000)?.amount).toBe(700_000)
  })

  it('탈락 후보의 행동 이름이 틀리면 그 항목만 버린다', () => {
    const v = validatePlan(
      { ...good, rejected: [{ action: 'nope', text: 'x' }, { action: 'later', text: 'ok' }] },
      sg,
    )
    expect(v?.rejected).toEqual([{ action: 'later', text: 'ok' }])
  })
})

describe('fallbackPlan', () => {
  const t = makeT('ko')
  const krw = (n: number) => fmtKRW(n, 'ko')

  it('현행 공식 금액으로 전액 송금을 제안한다', () => {
    const fb = fallbackPlan(sg, t, krw)
    expect(fb.action).toBe('remit_full')
    expect(fb.amount).toBe(p.salary - s.livingFloor - p.autoDebit)
  })

  it('다섯 문장 모두 채워진다 — 빈 칸이 화면에 나가면 안 된다', () => {
    const fb = fallbackPlan(sg, t, krw)
    for (const v of [fb.say, fb.why, fb.steps.signals, fb.steps.situation, fb.steps.compare, fb.steps.decide]) {
      expect(v.length).toBeGreaterThan(3)
      expect(v).not.toContain('{')
    }
  })

  it('채팅 요청 금액이 있으면 그 금액으로 준비한다', () => {
    const fb = fallbackPlan(sg, t, krw, 700_000)
    expect(fb.amount).toBe(700_000)
    expect(fb.say).toContain(krw(700_000))
  })
})
