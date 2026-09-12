import { useEffect, useState } from 'react'

/* iM뱅크 × ONNA 로딩 화면 — 파트너십 락업.
   iM뱅크 로고는 공식 화이트 버전 자산을 그대로 사용한다 (임의 재현 금지) */
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
        <img className="imLogo" src="/im-logo.png" alt="iM뱅크" />
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
