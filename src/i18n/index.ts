import type { Currency, Lang } from '../types'
import ko from './ko'
import en from './en'
import id from './id'
import vi from './vi'
import ne from './ne'

export type Dict = Record<string, string>

const DICTS: Record<Lang, Dict> = { ko, en, id, vi, ne }

export const LANG_META: Record<Lang, { native: string; koName: string }> = {
  id: { native: 'Bahasa Indonesia', koName: '인도네시아어' },
  ne: { native: 'नेपाली', koName: '네팔어' },
  vi: { native: 'Tiếng Việt', koName: '베트남어' },
  en: { native: 'English', koName: '영어' },
  ko: { native: '한국어', koName: '' },
}

export function makeT(lang: Lang) {
  const d = DICTS[lang]
  return (key: string, slots?: Record<string, string | number>): string => {
    let s = d[key] ?? DICTS.en[key] ?? DICTS.ko[key] ?? key
    if (slots) for (const [k, v] of Object.entries(slots)) s = s.split(`{${k}}`).join(String(v))
    return s
  }
}

// ---- 금액·통화 표기 (부록 A) ----
const dots = new Intl.NumberFormat('de-DE') // 1.234.567 (id/vi)
const commas = new Intl.NumberFormat('en-US')
const southAsia = new Intl.NumberFormat('en-IN') // 12,34,567 (ne)

export function fmtKRW(n: number, lang: Lang): string {
  if (lang === 'ko') return `${commas.format(n)}원`
  if (lang === 'ne') return `₩${southAsia.format(n)}`
  if (lang === 'en') return `₩${commas.format(n)}`
  return `₩${dots.format(n)}`
}

export function fmtLocal(n: number, cur: Currency): string {
  switch (cur) {
    case 'IDR': return `Rp${dots.format(n)}`
    case 'VND': return `${dots.format(n)}₫`
    case 'NPR': return `रु ${southAsia.format(n)}`
  }
}

export function fmtMMSS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
