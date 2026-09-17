import { StoreProvider } from './store'
import { Shell } from './sim/Shell'
import { MobileShell } from './sim/MobileShell'

const capacitorNative =
  typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.())
const deviceParam =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('device')

// 네이티브(Capacitor) 또는 ?device → 실제 앱 풀스크린 모드
const mobileMode = capacitorNative || deviceParam
// 브라우저에서 ?device 미리보기일 때만 폰 프레임으로 감싼다(시뮬레이터/기기는 풀스크린)
const browserPreview = deviceParam && !capacitorNative

export default function App() {
  // 로딩 화면은 WorkerPhone 안에서 렌더링된다 — 폰 프레임 밖으로 나가지 않도록
  const inner = mobileMode ? <MobileShell /> : <Shell />
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
