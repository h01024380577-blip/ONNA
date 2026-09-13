import { useState } from 'react'
import { useStore } from '../store'
import { NATION_BY_PERSONA, PERSONAS } from '../mock/personas'
import { WorkerPhone } from '../app/Phone'
import { Icon } from '../app/Icon'
import { FamilyPhone } from '../web/FamilyPhone'
import { EmployerCard, OpsCard } from '../web/Desk'
import { useSimTimers } from './useSimTimers'
import type { PersonaId, Scenario } from '../types'
import { DataStatus } from './DataStatus'

type View = 'worker' | 'family' | 'employer' | 'ops'

const SCENARIOS: Array<{ id: Scenario; label: string }> = [
  { id: 'auto', label: '자동 판정' },
  { id: 'pass', label: '통과 강제' },
  { id: 'HOLD_LIMIT_MONTHLY', label: '보류 · 월 한도' },
  { id: 'HOLD_DOC_INCOME', label: '보류 · 소득 서류' },
  { id: 'HOLD_BENEFICIARY_NEW', label: '보류 · 신규 수취인' },
]

/* 네이티브(iOS) 풀스크린 셸 — 실제 앱처럼 근로자 앱만 보이고, ⚙ 로 데모 트리거 */
export function MobileShell() {
  const { state, dispatch } = useStore()
  useSimTimers()
  const [view, setView] = useState<View>('worker')
  const [open, setOpen] = useState(false)
  const [idFailMode, setIdFailMode] = useState(false)
  const [startAt, setStartAt] = useState<'onboarding' | 'home'>('onboarding')

  const hasAccount = !!state.onboarding.accountNo
  const pendingCount = state.queue.filter((q) => q.status === 'pending').length

  const pick = (fn: () => void) => () => { fn() }

  return (
    <div className="mobileRoot">
      <div className="screenHost">
        {view === 'worker' && <WorkerPhone idFailMode={idFailMode} frameless />}
        {view === 'family' && <FamilyPhone frameless />}
        {view === 'employer' && <div className="mobileDesk"><EmployerCard /></div>}
        {view === 'ops' && <div className="mobileDesk"><OpsCard /></div>}
      </div>

      <button className="fab" onClick={() => setOpen(true)} aria-label="데모 패널"><Icon name="gear" size={20} strokeWidth={2} /></button>

      {open && (
        <div className="devSheetBack" onClick={() => setOpen(false)}>
          <div className="devSheet" onClick={(e) => e.stopPropagation()}>
            <h3>온보딩</h3>
            {/* 실제 앱 재실행처럼 — 로딩 화면을 거쳐 온보딩 첫 화면으로 */}
            <button className="devBtn"
              onClick={pick(() => {
                dispatch({ type: 'RESET', persona: state.personaId, startAt: 'onboarding' })
                setView('worker'); setOpen(false)
                window.dispatchEvent(new CustomEvent('onna:splash'))
              })}>
              <Icon name="restart" size={17} strokeWidth={2.1} style={{ marginRight: 8 }} />첫 온보딩 화면으로 (A0 국적 선택)
            </button>

            <h3>화면</h3>
            <div className="pillRow">
              {([['worker', '근로자 앱'], ['family', '가족 페이지'], ['employer', '사장님 승인'], ['ops', `담당자 큐${pendingCount ? ` (${pendingCount})` : ''}`]] as Array<[View, string]>).map(([v, label]) => (
                <button key={v} className={`pill ${view === v ? 'on' : ''}`} onClick={pick(() => { setView(v); setOpen(false) })}>{label}</button>
              ))}
            </div>

            <h3>이벤트 트리거</h3>
            <button className="devBtn" disabled={!hasAccount || !!state.salaryEvent}
              onClick={pick(() => { dispatch({ type: 'SALARY_CREDITED' }); setView('worker'); setOpen(false) })}>
              <Icon name="money" size={17} strokeWidth={2} style={{ marginRight: 8 }} />급여 입금 발생
            </button>
            <button className="devBtn subtle" disabled={state.tx?.status !== 'processing'}
              onClick={() => dispatch({ type: 'TX_ARRIVED' })}>
              송금 도착 지금 발생
            </button>
            <button className="devBtn subtle"
              onClick={pick(() => { dispatch({ type: 'RESET', persona: state.personaId, startAt }); setView('worker'); setOpen(false) })}>
              <Icon name="refresh" size={16} strokeWidth={2} style={{ marginRight: 8 }} />세션 초기화
            </button>

            <h3>페르소나</h3>
            <div className="pillRow">
              {(Object.keys(PERSONAS) as PersonaId[]).map((id) => (
                <button key={id} className={`pill ${state.personaId === id ? 'on' : ''}`}
                  onClick={pick(() => { dispatch({ type: 'RESET', persona: id, startAt }); setView('worker'); setOpen(false) })}>
                  {PERSONAS[id].name} · {NATION_BY_PERSONA[id].ko}
                </button>
              ))}
            </div>
            <div className="pillRow" style={{ marginTop: 8 }}>
              <button className={`pill ${startAt === 'onboarding' ? 'on' : ''}`} onClick={() => setStartAt('onboarding')}>시작: 온보딩</button>
              <button className={`pill ${startAt === 'home' ? 'on' : ''}`} onClick={() => setStartAt('home')}>시작: 홈</button>
            </div>

            <h3>규정 점검 시나리오</h3>
            <div className="pillRow">
              {SCENARIOS.map((sc) => (
                <button key={sc.id} className={`pill ${state.scenario === sc.id ? 'on' : ''}`}
                  onClick={() => dispatch({ type: 'SET_SCENARIO', scenario: sc.id })}>{sc.label}</button>
              ))}
            </div>

            <DataStatus />

            <h3>기타</h3>
            <div className="pillRow">
              <button className={`pill ${state.dark ? 'on' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_DARK' })}>다크 모드</button>
              <button className={`pill ${idFailMode ? 'on' : ''}`} onClick={() => setIdFailMode(!idFailMode)}>등록증 인식 실패 재현</button>
              <button className={`pill ${state.creditReady ? 'on' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_CREDIT' })}>신용 6개월 충족 (대출)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
