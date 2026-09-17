import { useEffect } from 'react'
import { useStore, type Action } from '../store'
import { apiUrl } from '../lib/api'
import { dropImage, getImage, putImage } from './docImages'
import { dropPoints, findMismatches, verifyPayload, type DocVerifyAnswer } from './cove'
import { ACTIONS_BY_KIND, cleanAnswer, cleanChecks, type DocAnswer, type DocCheck } from './docRules'
import type { DocOcr, DocPassage, DocRun } from '../types'

/* 서류 에이전트 5단계를 진행시킨다.
   ① OCR → ② RAG 검색 → ③ CoVe(초안 → 독립 검증 → 어긋나면 수정) → ④ 근거 답변 → ⑤ 다음 행동
   ④⑤는 ③의 결과를 차례로 보여 주는 단계다(추가 호출 없음). */

const STEP_MS = 380

export function startDocRun(dispatch: (a: Action) => void, image: string, origin: DocRun['origin'], question?: string) {
  const runId = Date.now()
  putImage(runId, image)
  dispatch({ type: 'DOC_START', runId, origin, question: question?.slice(0, 300) })
}

/** 서류에서 읽은 것만으로 만든 답 — 검색·검증이 실패했을 때 */
export function ocrOnlyAnswer(ocr: DocOcr): DocAnswer {
  return {
    summary: ocr.summary,
    points: ocr.fields.slice(0, 4).map((f, i) => ({ id: `f${i + 1}`, text: `${f.label}: ${f.value}`, cites: ['ocr'] })),
    actions: ACTIONS_BY_KIND[ocr.kind]
      .filter((k) => k === 'autopay' || k === 'ko_phrase' || k === 'human')
      .map((kind) => ({ kind, reason: '' })),
  }
}

class Stale extends Error {}

export function useDocAgent() {
  const { state, dispatch } = useStore()
  const run = state.docRun
  const runId = run?.status === 'running' ? run.runId : 0

  useEffect(() => {
    if (!runId || !run) return
    let alive = true
    const timers: ReturnType<typeof setTimeout>[] = []
    const lang = state.lang ?? 'ko'
    const question = run.question
    const image = getImage(runId)
    const t0 = Date.now()

    const post = async <T,>(body: Record<string, unknown>, timeoutMs: number): Promise<T> => {
      const r = await fetch(apiUrl('/api/doc-agent'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ lang, ...body }),
      })
      const d = await r.json().catch(() => null)
      if (!alive) throw new Stale()
      if (!r.ok || !d || d.error) throw new Error(d?.error ?? `HTTP ${r.status}`)
      return d as T
    }
    const wait = (ms: number) => new Promise<void>((res) => { timers.push(setTimeout(res, ms)) })

    const finish = async (answer: DocAnswer, source: NonNullable<DocRun['source']>, checkCount: number, fixedCount: number) => {
      dropImage(runId)
      dispatch({ type: 'DOC_VERIFIED', runId, answer, source, checkCount, fixedCount })
      await wait(STEP_MS)
      if (!alive) return
      dispatch({ type: 'DOC_PHASE', runId, phase: 'actions' })
      await wait(STEP_MS)
      if (!alive) return
      dispatch({ type: 'DOC_DONE', runId, latencyMs: Date.now() - t0 })
    }

    const go = async () => {
      if (!image) return dispatch({ type: 'DOC_ERROR', runId })

      // ① OCR
      let ocr: DocOcr
      try {
        ocr = await post<DocOcr>({ step: 'ocr', image }, 25_000)
      } catch (e) {
        if (e instanceof Stale) return
        dropImage(runId)
        return dispatch({ type: 'DOC_ERROR', runId })
      }
      dispatch({ type: 'DOC_OCR', runId, ocr })

      // ② RAG 검색 — 실패해도 원문 근거만으로 계속 간다
      let passages: DocPassage[] = []
      let failed = false
      try {
        const d = await post<{ passages?: DocPassage[] }>(
          { step: 'search', kind: ocr.kind, title: ocr.title, fields: ocr.fields, rawText: ocr.rawText, question },
          10_000,
        )
        passages = d.passages ?? []
      } catch (e) {
        if (e instanceof Stale) return
        failed = true
      }
      dispatch({ type: 'DOC_SEARCH', runId, passages, failed })

      // ③ CoVe — 초안
      const ids = passages.map((p) => p.id)
      const doc = { kind: ocr.kind, rawText: ocr.rawText, fields: ocr.fields, question, passageIds: ids }
      let draft: DocAnswer | null = null
      let checks: DocCheck[] = []
      try {
        const d = await post<Record<string, unknown>>({ step: 'draft', ...doc }, 20_000)
        draft = cleanAnswer(d, ocr.kind, ids)
        checks = cleanChecks(d.checks, draft?.points.map((p) => p.id) ?? [])
      } catch (e) {
        if (e instanceof Stale) return
      }
      if (!draft) return finish(ocrOnlyAnswer(ocr), 'ocr-only', 0, 0)
      if (!checks.length) return finish(draft, 'partly', 0, 0)

      // ③ CoVe — 독립 검증: 초안·기대값 없이 원본 사진과 자료로만 답한다
      let answers: DocVerifyAnswer[]
      try {
        const d = await post<{ answers?: DocVerifyAnswer[] }>(
          { step: 'verify', image, passageIds: ids, checks: verifyPayload(checks) },
          25_000,
        )
        answers = d.answers ?? []
      } catch (e) {
        if (e instanceof Stale) return
        return finish(ocrOnlyAnswer(ocr), 'ocr-only', 0, 0)
      }

      const mism = findMismatches(checks, answers)
      if (!mism.length) return finish(draft, 'verified', checks.length, 0)

      // ③ CoVe — 어긋났을 때만 수정
      try {
        const d = await post<Record<string, unknown>>(
          { step: 'revise', ...doc, draft, mismatches: mism.map(({ pointId, q, answer }) => ({ pointId, q, answer })) },
          20_000,
        )
        const fixed = cleanAnswer(d, ocr.kind, ids)
        if (fixed) return finish(fixed, 'verified', checks.length, mism.length)
      } catch (e) {
        if (e instanceof Stale) return
      }
      const kept = dropPoints(draft, mism.map((m) => m.pointId))
      return finish(kept ?? ocrOnlyAnswer(ocr), kept ? 'partly' : 'ocr-only', checks.length, mism.length)
    }
    void go()

    /* StrictMode 에서는 이 정리가 한 번 먼저 돈다 — 사진은 지우지 않는다(다음 실행이 쓴다) */
    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [runId]) // eslint-disable-line react-hooks/exhaustive-deps
}
