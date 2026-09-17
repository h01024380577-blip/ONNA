import { useEffect } from 'react'
import { useStore } from '../store'
import { PERSONAS } from '../mock/personas'
import { makeT } from '../i18n'
import { apiUrl } from '../lib/api'
import { buildChatCtx, fallbackReply, fallbackTasks, handoffText, validateTasks } from './orchestrator'
import type { ChatAction } from '../types'

/* 오케스트레이터 ① 의도 분석을 부르고 ② Task 분업 결과를 스토어에 넘긴다.
   실패하면 키워드 분류 + 코드 답으로 폴백한다 — 채팅이 멈추면 안 된다. */
export function useOrchestrator() {
  const { state, dispatch } = useStore()
  const orch = state.orch
  const runId = orch?.status === 'running' ? orch.id : 0

  useEffect(() => {
    if (!runId || !orch) return
    let alive = true
    const p = PERSONAS[state.personaId]
    const lang = state.lang ?? 'ko'
    const t = makeT(lang)
    const message = orch.message

    const fallback = () => {
      if (!alive) return
      const tasks = fallbackTasks(message)
      const general = tasks.every((x) => x.agent === 'general')
      const r = general ? fallbackReply(message, state, p) : { text: t('orch.handoff') }
      dispatch({ type: 'ORCH_DONE', id: runId, tasks, text: r.text, action: r.action, source: 'template' })
    }

    fetch(apiUrl('/api/orchestrate'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ message, lang, ctx: buildChatCtx(state, p) }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (!d?.text || !Array.isArray(d.tasks)) return fallback()
        const tasks = validateTasks(d.tasks, message, state.proposal?.amount)
        const action: ChatAction | undefined = d.escalate
          ? { labelKey: 'help.human', screen: 'HELP', escalate: true }
          : undefined
        const text = handoffText(d.text, tasks, t('orch.handoff'))
        dispatch({ type: 'ORCH_DONE', id: runId, tasks, text, action, source: 'llm' })
      })
      .catch(fallback)

    return () => { alive = false }
  }, [runId]) // eslint-disable-line react-hooks/exhaustive-deps
}
