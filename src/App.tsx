import { useState } from 'react'
import { StoreProvider } from './store'
import { Shell } from './sim/Shell'
import { MobileShell } from './sim/MobileShell'
import { Splash } from './app/Splash'

const capacitorNative =
  typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.())
const deviceParam =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('device')

// 네이티브(Capacitor) 또는 ?device → 실제 앱 풀스크린 모드
const mobileMode = capacitorNative || deviceParam
// 브라우저에서 ?device 미리보기일 때만 폰 프레임으로 감싼다(시뮬레이터/기기는 풀스크린)
const browserPreview = deviceParam && !capacitorNative

export default function App() {
  // 앱 진입 로딩 화면 — 세션당 1회, ⚙ 패널에서 다시 볼 수 있다
  const [splash, setSplash] = useState(true)
  const inner = (
    <>
      {mobileMode ? <MobileShell /> : <Shell />}
      {splash && <Splash onDone={() => setSplash(false)} />}
    </>
  )
  if (browserPreview) {
    return (
      <StoreProvider>
        <div className="browserFrame">
          <div className="browserDevice">{inner}</div>
        </div>
      </StoreProvider>
    )
  }
  return <StoreProvider>{inner}</StoreProvider>
}
