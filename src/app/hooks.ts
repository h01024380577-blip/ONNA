import { useStore } from '../store'
import { PERSONAS } from '../mock/personas'
import { makeT, fmtKRW, fmtLocal, fmtDay } from '../i18n'
import { assessCredit } from '../agent/credit'

export function useApp() {
  const { state, dispatch } = useStore()
  const p = PERSONAS[state.personaId]
  const lang = state.lang ?? 'ko' // 언어 설정 전 기본 한국어, 설정 후에는 그 언어로만
  const t = makeT(lang)
  const krw = (n: number) => fmtKRW(n, lang)
  const local = (n: number) => fmtLocal(n, p.currency)
  const day = (ymd: string) => fmtDay(ymd, lang)
  return { state, dispatch, p, lang, t, krw, local, day }
}

/** 거래 DB 기반 신용 — 화면은 페르소나 고정값 대신 항상 이걸 본다 */
export function useCredit(months = 12) {
  const { state } = useStore()
  return assessCredit(state.ledger, PERSONAS[state.personaId], state.creditReady, months)
}
