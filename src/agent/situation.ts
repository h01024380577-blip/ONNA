import type { AgentSignals, Situation } from '../types'
import { MIN_SEND } from './plan'

/* 송금 ② 지금 상황 판단. fxStrength·spendPace 처럼 판정은 코드가 내린다 —
   LLM 에 맡기면 같은 값을 매번 다르게 부른다. LLM 은 이 판정을 설명만 한다.
   여유/빠듯: 보낼 수 있는 상한이 평소 송금의 80%에 못 미치거나 이번 달 씀씀이가 높으면 빠듯. */
export function judgeSituation(
  sg: Pick<AgentSignals, 'sendableMax' | 'remitAvg3m' | 'spendPace' | 'fxStrength' | 'fxRisk' | 'sentThisMonth'>,
): Situation {
  const need = Math.max(MIN_SEND, Math.round(sg.remitAvg3m * 0.8))
  return {
    money: sg.sendableMax < need || sg.spendPace === 'higher' ? 'tight' : 'roomy',
    rate: sg.fxStrength,
    risk: sg.fxRisk,
    sentAlready: sg.sentThisMonth > 0,
  }
}
