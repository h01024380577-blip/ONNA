import { useStore } from '../store'
import { PERSONAS } from '../mock/personas'
import { makeT, fmtKRW, fmtLocal } from '../i18n'

export function useApp() {
  const { state, dispatch } = useStore()
  const p = PERSONAS[state.personaId]
  const lang = state.lang ?? 'ko' // 언어 설정 전 기본 한국어, 설정 후에는 그 언어로만
  const t = makeT(lang)
  const krw = (n: number) => fmtKRW(n, lang)
  const local = (n: number) => fmtLocal(n, p.currency)
  return { state, dispatch, p, lang, t, krw, local }
}
