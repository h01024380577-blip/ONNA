import { useEffect } from 'react'
import { useStore } from '../store'
import { PERSONAS } from '../mock/personas'
import { fmtKRW, makeT } from '../i18n'
import { apiUrl } from '../lib/api'
import { fallbackPlan, validatePlan } from './plan'
import type { AgentPlan } from '../types'

/* 송금 에이전트 4단계를 진행시킨다. 급여 웹훅·채팅 요청 공용.
   ① 신호(코드) → ② 상황 판단(코드) → ③ 송금안(LLM + 규칙 엔진) → ④ 이유 설명(③과 같은 응답)
   ⑤ 사용자 승인 · ⑥ 타이밍 · ⑦ 실행은 화면과 리듀서가 맡는다.

   LLM 이 캐시처럼 빨리 와도 ③은 잠깐은 보여 준다 — 단계가 눈에 보이기 전에 끝나면
   사고과정이 아예 없는 것처럼 보인다. */
const SIGNAL_MS = 550
const SITUATION_MS = 500
const MIN_PLAN_MS = 1700
const EXPLAIN_MS = 480

export function useRemitAgent() {
  const { state, dispatch } = useStore()
  const runId = state.analysis?.status === 'running' ? state.analysis.startedAt : 0

  useEffect(() => {
    const an = state.analysis
    if (!runId || !an) return

    const p = PERSONAS[state.personaId]
    const lang = state.lang ?? p.lang
    const t = makeT(lang)
    const krw = (n: number) => fmtKRW(n, lang)
    const sg = an.signals

    let alive = true
    const timers: ReturnType<typeof setTimeout>[] = []
    const t0 = Date.now()
    const later = (ms: number, fn: () => void) =>
      timers.push(setTimeout(() => { if (alive) fn() }, ms))

    later(SIGNAL_MS, () => dispatch({ type: 'ANALYSIS_PHASE', phase: 'situation' }))
    later(SIGNAL_MS + SITUATION_MS, () => dispatch({ type: 'ANALYSIS_PHASE', phase: 'plan' }))

    const settle = (plan: AgentPlan, source: 'llm' | 'template') => {
      later(Math.max(0, MIN_PLAN_MS - (Date.now() - t0)), () => {
        dispatch({ type: 'ANALYSIS_RESULT', plan, source, latencyMs: Date.now() - t0 })
        later(EXPLAIN_MS, () => dispatch({ type: 'ANALYSIS_DONE' }))
      })
    }

    /* 월 한도 잔여는 모델에 주지 않는다 — 사용자에게 한도를 말해서도 안 되고
       (카피 규칙), 한도 판단은 규칙 엔진 몫이다. 신호로 주면 "지금 30만원까지만
       보낼 수 있어요" 같은 문장이 새는 것을 실측했다. */
    const { limitRemaining: _lr, ...signalsForModel } = sg

    fetch(apiUrl('/api/remit-plan'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      /* 12초 — 평소 응답은 3초쯤인데, 배포 직후 첫 호출은 콜드 스타트가 얹혀
         9초를 넘겼다(실측). 서버는 재시도까지 해도 8초대에서 스스로 끊는다. */
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        lang,
        name: p.name,
        trigger: an.trigger,
        requestedAmount: an.requestedAmount,
        signals: signalsForModel,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        const plan = validatePlan(d, sg, an.requestedAmount)
        settle(plan ?? fallbackPlan(sg, t, krw, an.requestedAmount), plan ? 'llm' : 'template')
      })
      .catch(() => settle(fallbackPlan(sg, t, krw, an.requestedAmount), 'template'))

    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [runId]) // eslint-disable-line react-hooks/exhaustive-deps
}
