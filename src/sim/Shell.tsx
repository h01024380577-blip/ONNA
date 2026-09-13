import { useState } from 'react'
import { useStore } from '../store'
import { useSimTimers } from './useSimTimers'
import { NATION_BY_PERSONA, PERSONAS } from '../mock/personas'
import { WorkerPhone } from '../app/Phone'
import { FamilyPhone } from '../web/FamilyPhone'
import { EmployerCard } from '../web/Desk'
import { DemoConsole, VIEWS, type View } from './DemoConsole'
import { DeviceFrame } from './DeviceFrame'

/* 데스크톱 시뮬레이터 — 스테이지(기기) + 우측 데모 콘솔.
   콘솔 내용은 ⚙ 콘솔과 같은 DemoConsole을 그대로 쓴다. */

const HINT: Record<View, string> = {
  worker: '화면 속 버튼으로 실제 흐름이 진행됩니다 · 급여 입금은 오른쪽 콘솔에서 트리거',
  employer: '카카오톡 링크 1탭 승인, 급여는 보이지 않습니다',
  family: '수취인 언어로 열리는 링크 — 앱 설치가 필요 없습니다',
}

export function Shell() {
  const { state } = useStore()
  const [view, setView] = useState<View>('worker')
  const [startAt, setStartAt] = useState<'onboarding' | 'home'>('onboarding')
  const [idFailMode, setIdFailMode] = useState(false)

  useSimTimers()

  const p = PERSONAS[state.personaId]

  // 탭 옆 알림 배지 — 그 화면에서 확인할 일이 생겼을 때만
  const badge: Partial<Record<View, boolean>> = {
    employer: state.onboarding.employer === 'pending',
    family: !!state.tx && state.tx.status !== 'cancelled',
  }

  return (
    <div className="shell">
      <header className="shellTop">
        <div className="wordmark"><b className="wmk">ONNA</b><span>외국인 근로자 금융 정착 에이전트 — MVP 시뮬레이터</span></div>
        <nav className="viewTabs">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>
              {v.label}{badge[v.id] ? <span className="n">1</span> : null}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <div className="meta">{p.name} · {NATION_BY_PERSONA[state.personaId].ko}</div>
      </header>

      <div className="shellMain">
        <main className="stageArea">
          <div className="deviceWrap">
            {/* 근로자 앱·가족 페이지는 실기와 같은 기기 화면으로, 사장님 승인은 웹 카드로 */}
            {view === 'worker' && <DeviceFrame dark={state.dark}><WorkerPhone idFailMode={idFailMode} /></DeviceFrame>}
            {view === 'family' && <DeviceFrame><FamilyPhone /></DeviceFrame>}
            {view === 'employer' && <EmployerCard />}
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
