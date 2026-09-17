import type { AgentSignals, PlanAction, Timing, TimingPart } from '../types'
import { MIN_SEND } from './plan'

/* 송금 ⑥ 타이밍 결정 — 그림에서 "사용자 승인" 다음 단계.
   승인된 최종 금액(금액 변경을 거쳤으면 바꾼 금액)을 두고 코드가 정한다.
     wait  : 에이전트가 '나중에'를 골랐거나 오늘 환율이 낮다 → 기다릴 날에 전액
     split : 환율이 흔들리고 40만원 이상 → 절반 지금, 나머지 기다릴 날
     now   : 그 밖 → 지금 전액
   낮은 환율을 흔들림보다 먼저 본다 — 낮은 날에 절반을 보내면 그 절반이 손해다. */

export const SPLIT_MIN = 400_000
const round10k = (n: number) => Math.round(n / 10_000) * 10_000

export function decideTiming(
  amount: number,
  sg: Pick<AgentSignals, 'fxStrength' | 'fxRisk' | 'laterDate'>,
  action: PlanAction,
): Timing {
  if (action === 'later')
    return { rule: 'wait', cause: 'agent-later', parts: [{ when: sg.laterDate, amount }] }
  if (sg.fxStrength === 'lower')
    return { rule: 'wait', cause: 'rate-low', parts: [{ when: sg.laterDate, amount }] }
  if ((sg.fxRisk === 'moving' || sg.fxRisk === 'volatile') && amount >= SPLIT_MIN) {
    const now = Math.max(MIN_SEND, round10k(amount / 2))
    return {
      rule: 'split',
      cause: 'rate-moving',
      parts: [{ when: 'now', amount: now }, { when: sg.laterDate, amount: amount - now }],
    }
  }
  return { rule: 'now', cause: 'normal', parts: [{ when: 'now', amount }] }
}

export const overrideNow = (amount: number): Timing => ({
  rule: 'now', cause: 'user', parts: [{ when: 'now', amount }], overridden: true,
})

export const nowPart = (t: Timing): number => t.parts.find((x) => x.when === 'now')?.amount ?? 0
export const laterParts = (t: Timing): TimingPart[] => t.parts.filter((x) => x.when !== 'now')
