import type { ReactNode } from 'react'

/* iPhone 17 Pro 기기 셸 — 데스크톱 시뮬레이터가 iOS 시뮬레이터와 같은 모습이 되게 한다.

   화면을 실기와 같은 402×874pt로 두고 세이프에어리어(상 59 / 하 34)까지 맞췄다.
   덕분에 앱은 데스크톱에서도 iOS와 완전히 같은 레이아웃으로 그려지고,
   여기서 잘리지 않으면 실기에서도 잘리지 않는다.
   치수(아일랜드 122×37, 상단 14pt)는 시뮬레이터 스크린샷에서 실측한 값이다. */
export function DeviceFrame({ dark = false, children }: { dark?: boolean; children: ReactNode }) {
  return (
    <div className={`device ${dark ? 'onDark' : ''}`}>
      <div className="deviceScreen">
        {children}
        <div className="iosStatus">
          <span className="iosTime">9:41</span>
          <span className="iosIcons">
            {/* 시뮬레이터와 동일 — 셀룰러는 점 4개(서비스 없음), 와이파이, 배터리 */}
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <circle key={i} cx={2.2 + i * 4.4} cy="7.6" r="1.6" fill="currentColor" opacity=".32" />
              ))}
            </svg>
            <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden>
              <path d="M1 4.2a11 11 0 0 1 15 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M4 7.1a7 7 0 0 1 9 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="8.5" cy="10.2" r="1.35" fill="currentColor" />
            </svg>
            <svg width="27" height="13" viewBox="0 0 27 13" fill="none" aria-hidden>
              <rect x=".7" y=".7" width="22" height="11.6" rx="3.6" stroke="currentColor" strokeWidth="1.1" opacity=".4" />
              <rect x="2.4" y="2.4" width="18.6" height="8.2" rx="2.2" fill="currentColor" />
              <path d="M24.4 4.4v4.2c1-.4 1.5-1.1 1.5-2.1s-.5-1.7-1.5-2.1Z" fill="currentColor" opacity=".4" />
            </svg>
          </span>
        </div>
        <div className="dynIsland" />
        <div className="homeBar" />
      </div>
    </div>
  )
}
