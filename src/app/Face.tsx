import type { Persona, PersonaId } from '../types'

/* 페르소나 아바타 — A3 얼굴 스캔 프리뷰 + A2 등록증 증명사진 공용 (플랫 일러스트) */
const STYLE: Record<PersonaId, { skin: string; neck: string; hair: string; shirt: string; female?: boolean }> = {
  budi: { skin: '#c9915f', neck: '#b07a4d', hair: '#1f1a16', shirt: '#3f6f8e' },
  sita: { skin: '#b97f55', neck: '#a06c46', hair: '#221a14', shirt: '#2e7d6b', female: true },
  minh: { skin: '#e0aa76', neck: '#c8945f', hair: '#26201a', shirt: '#5a6672' },
}

export function Face({ p }: { p: Persona }) {
  const s = STYLE[p.id]
  return (
    <svg viewBox="0 0 120 150" aria-hidden>
      <path d="M18 150c0-26 19-38 42-38s42 12 42 38Z" fill={s.shirt} />
      <rect x="50" y="90" width="20" height="28" rx="9" fill={s.neck} />
      <circle cx="28" cy="66" r="6" fill={s.neck} />
      <circle cx="92" cy="66" r="6" fill={s.neck} />
      <ellipse cx="60" cy="62" rx="31" ry="34" fill={s.skin} />
      {s.female ? (
        <path d="M60 21c-24 0-37 17-37 37 0 6 2 11 5 14l4-2c-3-8-2-17 2-23 5-8 14-12 26-12s21 4 26 12c4 6 5 15 2 23l4 2c3-3 5-8 5-14 0-20-13-37-37-37Z" fill={s.hair} />
      ) : (
        <path d="M29 56c0-20 13-33 31-33s31 13 31 33c0 3-4 4-5 1-4-11-11-15-26-15s-22 4-26 15c-1 3-5 2-5-1Z" fill={s.hair} />
      )}
      <path d="M44 57h10M66 57h10" stroke="#2a211a" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="49" cy="66" r="3" fill="#241d18" />
      <circle cx="71" cy="66" r="3" fill="#241d18" />
      <path d="M52 81c4 4 12 4 16 0" stroke="#8a5a3a" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}
