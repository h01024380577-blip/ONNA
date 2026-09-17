/* 한국어 합니다체 → 해요체 (문장 끝만). 서버 에이전트가 모델 문장을 다듬는 데 쓴다.
   안내 자료가 "~이다" 체라 모델이 딱딱한 어미로 끌려가는 것을 실측했다 — 프롬프트만으로는 절반이 샌다.
   받침·모음 조화로 확실히 바꿀 수 있는 것만 바꾸고, 불규칙 활용이 걸릴 수 있는 어간은 그대로 둔다
   (그대로 남은 문장은 호출부의 어투 검사가 걸러 재시도한다). */

const BASE = 0xac00
const syll = (ch: string) => {
  const c = ch.charCodeAt(0) - BASE
  return c >= 0 && c < 11172 ? { jung: Math.floor(c / 28) % 21, jong: c % 28 } : null
}

const JONG_SS = 20 // ㅆ — 과거형(했·었·았)
const JUNG_A = 0 // ㅏ
const JUNG_O = 8 // ㅗ
/** 규칙 활용이 확실한 현재형 어간 */
const SAFE_STEMS = new Set('있없붙받않같좋늦많적찾맞남넘작높낮'.split(''))

// 문장 끝: 뒤에 문장부호·공백·끝이 온다
const END = /(.)(합니다|됩니다|입니다|습니다)(?=[.!?…]?(?:\s|$))/g

export function softenKo(text: string): string {
  return text.replace(END, (m, prev: string, tail: string, offset: number, all: string) => {
    // "감사합니다·축하합니다·죄송합니다·미안합니다" 같은 인사말은 그대로
    const two = all.slice(Math.max(0, offset - 1), offset + 1)
    if (tail === '합니다' && /^(감사|축하|죄송|미안)$/.test(two)) return m
    if (tail === '합니다') return `${prev}해요`
    if (tail === '됩니다') return `${prev}돼요`
    if (tail === '입니다') {
      const s = syll(prev)
      return s && s.jong > 0 ? `${prev}이에요` : `${prev}예요`
    }
    // 습니다 — prev 가 어간 마지막 음절
    const s = syll(prev)
    if (!s) return m
    if (s.jong === JONG_SS) return `${prev}어요`
    if (!SAFE_STEMS.has(prev)) return m
    return `${prev}${s.jung === JUNG_A || s.jung === JUNG_O ? '아요' : '어요'}`
  })
}
