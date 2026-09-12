import { useEffect, useState } from 'react'

/* iM뱅크 마크 — 좌측 블록 + 곡선 윙 2개로 이루어진 M 심볼 (단색 화이트) */
function ImMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size * 1.3} height={size} viewBox="0 0 124 96" fill="currentColor" aria-hidden>
      <rect x="0" y="49" width="25" height="47" rx="6" />
      <path d="M31 96V63C31 39 48 22 71 22v30c-14 0-19 10-19 44Z" />
      <path d="M80 96V63c0-24 17-41 40-41v30c-14 0-19 10-19 44Z" />
    </svg>
  )
}

/* iM뱅크 × ONNA 로딩 화면 — 파트너십 락업 */
export function Splash({ onDone, ms = 2200 }: { onDone: () => void; ms?: number }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), ms - 400)
    const done = setTimeout(onDone, ms)
    return () => { clearTimeout(fade); clearTimeout(done) }
  }, [ms, onDone])

  return (
    <div className={`splash ${leaving ? 'out' : ''}`}>
      <div className="splashLock">
        <span className="imLogo"><ImMark size={34} /><b>iM뱅크</b></span>
        {/* iOS 웹뷰에 ✕(U+2715) 글리프가 없어 tofu가 되므로 SVG로 그린다 */}
        <svg className="splashX" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.6" strokeLinecap="round" aria-hidden>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
        <span className="onnaLogo">
          <img src="/onna-mark.png" alt="" aria-hidden />
          <b>ONNA</b>
        </span>
      </div>
      <div className="spinner" />
    </div>
  )
}
