import { useEffect, useState } from 'react'
import { useApp } from './hooks'
import { Icon } from './Icon'
import { Splash } from './Splash'
import { ChatSheet } from './Chat'
import { A0, A1, A2, A3, A4, A41, A42, A5, A6 } from './screens/Onboarding'
import { B0, B1, B2, B3, B4, B5, B7, B8 } from './screens/Remit'
import { C1, Help } from './screens/Record'
import { D1, D2, D3 } from './screens/Loan'
import type { Screen } from '../types'

/* 상단 앱바 — 뒤로(이전 단계) / 섹션 타이틀 / 홈·아바타. A6·B5는 완료 화면, B0은 잠금, C1·HELP는 하단 탭 담당 */
const TOP_NAV: Partial<Record<Screen, { back?: Screen; home?: boolean; title?: string }>> = {
  A1: { back: 'A0' },
  A2: { back: 'A1', title: 'prog.identity' }, A3: { back: 'A2', title: 'prog.identity' },
  A4: { back: 'A3', title: 'prog.company' },
  A41: { back: 'A4', title: 'prog.company' }, A42: { back: 'A4', title: 'prog.company' },
  A5: { back: 'A4', title: 'prog.record' },
  B2: { back: 'B1', title: 'b1.navSend' }, B3: { back: 'B2', home: true, title: 'b1.navSend' },
  B4: { home: true, title: 'b3.check' }, B7: { back: 'B5', home: true, title: 'b5.makeRule' },
  B8: { home: true, title: 'b1.navSend' },
  D1: { back: 'C1', home: true, title: 'd.open' },
  D2: { back: 'D1', home: true, title: 'd.open' },
  D3: { home: true, title: 'd3.confirm' }, // 실행 후 금액 화면으로 되돌아가지 않도록 뒤로가기 없음
}

/* 로딩 화면은 세션당 한 번만. 화면 탭(근로자/사장님/가족)을 오갈 때마다 WorkerPhone이
   다시 마운트되는데, 그때마다 재생되면 시연 중 매번 3초를 기다리게 된다.
   '첫 온보딩 화면으로'는 'onna:splash' 이벤트로 명시적으로 다시 재생시킨다. */
let splashPlayed = false

/* 근로자 앱 화면 — 항상 실기(iOS)와 같은 풀스크린 레이아웃으로 그린다.
   데스크톱에서는 DeviceFrame이 기기 셸을 씌워 같은 모습을 만든다. */
export function WorkerPhone({ idFailMode }: { idFailMode: boolean }) {
  const { state, dispatch, p, t } = useApp()
  // 앱 진입 로딩 화면 — 폰 화면 안에서만 표시. 'onna:splash' 이벤트로 재생
  const [splash, setSplash] = useState(!splashPlayed)
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    const open = () => setChatOpen(true)
    const replay = () => { splashPlayed = false; setSplash(true) }
    window.addEventListener('onna:chat', open)
    window.addEventListener('onna:splash', replay)
    return () => {
      window.removeEventListener('onna:chat', open)
      window.removeEventListener('onna:splash', replay)
    }
  }, [])

  const s = state.screen
  const isLock = s === 'B0'

  const inner = (
      <div className={`screen frameless ${state.dark ? 'dark' : ''}`} data-lang={state.lang ?? ''}>
        {!isLock && <div className="safeTop" />}

        {TOP_NAV[s] && (
          <div className="topbar">
            {TOP_NAV[s]!.back
              ? <button aria-label={t('common.back')} onClick={() => dispatch({ type: 'NAV', screen: TOP_NAV[s]!.back! })}><Icon name="back" size={22} /></button>
              : <span />}
            {TOP_NAV[s]!.title && <span className="tTitle">{t(TOP_NAV[s]!.title!)}</span>}
            <div className="tRight">
              {TOP_NAV[s]!.home && (
                <button aria-label={t('b1.navHome')} onClick={() => dispatch({ type: 'NAV', screen: 'B1' })}><Icon name="home" size={21} /></button>
              )}
              <div className="avatarDot" aria-hidden>{p.name[0]}</div>
            </div>
          </div>
        )}

        {s === 'A0' && <A0 />}
        {s === 'A1' && <A1 />}
        {s === 'A2' && <A2 idFailMode={idFailMode} />}
        {s === 'A3' && <A3 />}
        {s === 'A4' && <A4 />}
        {s === 'A41' && <A41 />}
        {s === 'A42' && <A42 />}
        {s === 'A5' && <A5 />}
        {s === 'A6' && <A6 />}
        {s === 'B0' && <B0 />}
        {s === 'B1' && <B1 />}
        {s === 'B2' && <B2 />}
        {s === 'B3' && <B3 />}
        {s === 'B4' && <B4 />}
        {s === 'B5' && <B5 />}
        {s === 'B7' && <B7 />}
        {s === 'B8' && <B8 />}
        {s === 'C1' && <C1 />}
        {s === 'HELP' && <Help />}
        {s === 'D1' && <D1 />}
        {s === 'D2' && <D2 />}
        {s === 'D3' && <D3 />}

        {/* 에이전트 채팅 — 오케스트레이터가 송금·서류·신용 도우미에게 일을 나눈다 */}
        {chatOpen && <ChatSheet onClose={() => setChatOpen(false)} />}

        {splash && <Splash onDone={() => { splashPlayed = true; setSplash(false) }} />}
      </div>
  )

  return inner
}
