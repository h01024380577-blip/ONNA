import { useState } from 'react'
import { useStore } from '../store'
import { useSimTimers } from './useSimTimers'
import { useRemitAgent } from '../agent/useRemitAgent'
import { useOrchestrator } from '../agent/useOrchestrator'
import { useDocAgent } from '../agent/useDocAgent'
import { NATION_BY_PERSONA, PERSONAS } from '../mock/personas'
import { WorkerPhone } from '../app/Phone'
import { FamilyPhone } from '../web/FamilyPhone'
import { EmployerPhone } from '../web/Desk'
import { DemoConsole, VIEWS, familyUnread, type View } from './DemoConsole'
import { DeviceFrame } from './DeviceFrame'

/* 데스크톱 시뮬레이터 — 스테이지(기기) + 우측 데모 콘솔.
   콘솔 내용은 ⚙ 콘솔과 같은 DemoConsole을 그대로 쓴다. */

const HINT: Record<View, string> = {
  worker: '화면 속 버튼으로 실제 흐름이 진행됩니다 · 급여 입금은 오른쪽 콘솔에서 트리거',
  employer: '근로자가 보낸 알림이 한 건씩 쌓입니다 · 재직 확인은 1탭, 급여는 보이지 않습니다',
  family: '근로자가 메신저로 보낸 메시지 → 링크를 눌러야 수령 페이지가 열립니다 · 앱 설치 불필요',
}

export function Shell() {
  const { state } = useStore()
  const [view, setView] = useState<View>('worker')
  const [startAt, setStartAt] = useState<'onboarding' | 'home'>('onboarding')
  const [idFailMode, setIdFailMode] = useState(false)

  useSimTimers()
  useRemitAgent()
  useOrchestrator()
  useDocAgent()

  const p = PERSONAS[state.personaId]

  // 탭 옆 알림 배지 — 그 화면에서 확인할 일이 몇 건 있는지
  const employerUnread =
    (state.onboarding.employer === 'pending' ? 1 : 0) +
    (state.accountShare && !state.accountShare.read ? 1 : 0)
  const badge: Partial<Record<View, number>> = {
    employer: employerUnread,
    family: familyUnread(state),
  }

  return (
    <div className="shell">
      <header className="shellTop">
        <div className="wordmark"><b className="wmk">ONNA</b><span>외국인 근로자 금융 정착 에이전트 — MVP 시뮬레이터</span></div>
        <nav className="viewTabs">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>
              {v.label}{badge[v.id] ? <span className="n">{badge[v.id]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <div className="meta">{p.name} · {NATION_BY_PERSONA[state.personaId].ko}</div>
      </header>

      <div className="shellMain">
        <main className="stageArea">
          <div className="deviceWrap">
            {/* 세 화면 모두 실기와 같은 기기 안에서 — 근로자·가족·사장님 각자의 폰 */}
            {view === 'worker' && <DeviceFrame dark={state.dark}><WorkerPhone idFailMode={idFailMode} /></DeviceFrame>}
            {view === 'employer' && <DeviceFrame dark={state.dark}><EmployerPhone /></DeviceFrame>}
            {view === 'family' && <DeviceFrame><FamilyPhone /></DeviceFrame>}
          </div>
          <div className="stageHint">{HINT[view]}</div>
        </main>

        <aside className="devPanel">
          <div className="devScroll">
            <DemoConsole
              view={view} setView={setView}
              idFailMode={idFailMode} setIdFailMode={setIdFailMode}
              startAt={startAt} setStartAt={setStartAt}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
