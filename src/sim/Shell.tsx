import { useEffect, useRef, useState } from 'react'
import { useStore, ARRIVE_DEMO_SEC } from '../store'
import { useSimTimers } from './useSimTimers'
import { PERSONAS } from '../mock/personas'
import { WorkerPhone } from '../app/Phone'
import { FamilyPhone } from '../web/FamilyPhone'
import { EmployerCard, OpsCard } from '../web/Desk'
import type { PersonaId, Scenario, Screen } from '../types'

type View = 'worker' | 'family' | 'employer' | 'ops'

const SCENARIOS: Array<{ id: Scenario; label: string; warn?: boolean }> = [
  { id: 'auto', label: '자동 판정' },
  { id: 'pass', label: '통과 강제' },
  { id: 'HOLD_LIMIT_MONTHLY', label: '보류 · 월 한도', warn: true },
  { id: 'HOLD_DOC_INCOME', label: '보류 · 소득 서류', warn: true },
  { id: 'HOLD_BENEFICIARY_NEW', label: '보류 · 신규 수취인', warn: true },
]

const JUMPS: Array<{ s: Screen; label: string }> = [
  { s: 'A0', label: 'A0 언어' },
  { s: 'A2', label: 'A2 등록증' },
  { s: 'A5', label: 'A5 동의' },
  { s: 'B1', label: 'B1 홈' },
  { s: 'B7', label: 'B7 규칙' },
  { s: 'C1', label: 'C1 기록' },
]

export function Shell() {
  const { state, dispatch } = useStore()
  const [view, setView] = useState<View>('worker')
  const [startAt, setStartAt] = useState<'onboarding' | 'home'>('onboarding')
  const [idFailMode, setIdFailMode] = useState(false)
  const traceRef = useRef<HTMLDivElement>(null)

  useSimTimers()

  // 트레이스 자동 스크롤
  useEffect(() => {
    traceRef.current?.scrollTo({ top: traceRef.current.scrollHeight })
  }, [state.trace.length])

  const p = PERSONAS[state.personaId]
  const onbMs =
    state.onboarding.completedAt && state.onboarding.startedAt
      ? state.onboarding.completedAt - state.onboarding.startedAt
      : null
  const pendingCount = state.queue.filter((q) => q.status === 'pending').length
  const hasAccount = !!state.onboarding.accountNo

  return (
    <div className="shell">
      <header className="shellTop">
        <div className="wordmark"><b className="wmk">ONNA</b><span>외국인 근로자 금융 정착 에이전트 — MVP 시뮬레이터</span></div>
        <nav className="viewTabs">
          <button className={view === 'worker' ? 'on' : ''} onClick={() => setView('worker')}>근로자 앱</button>
          <button className={view === 'family' ? 'on' : ''} onClick={() => setView('family')}>
            가족 페이지{state.tx && state.tx.status !== 'cancelled' ? <span className="n">1</span> : null}
          </button>
          <button className={view === 'employer' ? 'on' : ''} onClick={() => setView('employer')}>
            사장님 승인{state.onboarding.employer === 'pending' ? <span className="n">1</span> : null}
          </button>
          <button className={view === 'ops' ? 'on' : ''} onClick={() => setView('ops')}>
            담당자 큐{pendingCount > 0 ? <span className="n">{pendingCount}</span> : null}
          </button>
        </nav>
        <div className="spacer" />
        <div className="meta">PRD v1.0 · 목 서버 · {p.name} ({p.lang})</div>
      </header>

      <div className="shellMain">
        <main className="stageArea">
          <div className="phoneWrap">
            {view === 'worker' && <WorkerPhone idFailMode={idFailMode} />}
            {view === 'family' && <FamilyPhone />}
            {view === 'employer' && <EmployerCard />}
            {view === 'ops' && <OpsCard />}
          </div>
          <div className="stageHint">
            {view === 'worker' && '화면 속 버튼으로 실제 흐름이 진행됩니다 · 급여 입금은 오른쪽 패널에서 트리거'}
            {view === 'family' && 'B6 — 수취인 언어로 렌더링, 앱 설치 불필요 (RM-12)'}
            {view === 'employer' && 'EM-1 — 카카오톡 링크 1탭 승인, 급여는 보이지 않음'}
            {view === 'ops' && 'RM-9 — 서류 업로드 건 재심사. 승인하면 근로자 앱이 자동으로 B5로 진행'}
          </div>
        </main>

        <aside className="devPanel">
          <div className="devScroll">
            <h3>페르소나</h3>
            <div className="pillRow">
              {(Object.keys(PERSONAS) as PersonaId[]).map((id) => (
                <button key={id} className={`pill ${state.personaId === id ? 'on' : ''}`}
                  onClick={() => dispatch({ type: 'RESET', persona: id, startAt })}>
                  {PERSONAS[id].name} · {PERSONAS[id].lang}
                </button>
              ))}
            </div>
            <div className="pillRow" style={{ marginTop: 8 }}>
              <button className={`pill ${startAt === 'onboarding' ? 'on' : ''}`} onClick={() => setStartAt('onboarding')}>시작: 온보딩</button>
              <button className={`pill ${startAt === 'home' ? 'on' : ''}`} onClick={() => setStartAt('home')}>시작: 홈 (개설 완료)</button>
            </div>

            <h3>이벤트 트리거</h3>
            <button className="devBtn" disabled={!hasAccount || !!state.salaryEvent}
              onClick={() => dispatch({ type: 'SALARY_CREDITED' })}>
              💸 급여 입금 웹훅 (salary.credited)
            </button>
            <button className="devBtn subtle" disabled={state.tx?.status !== 'processing'}
              onClick={() => dispatch({ type: 'TX_ARRIVED' })}>
              도착 웹훅 지금 발생 (기본 {ARRIVE_DEMO_SEC}초 뒤)
            </button>
            <button className="devBtn subtle" onClick={() => dispatch({ type: 'RESET', persona: state.personaId, startAt })}>
              ⟲ 세션 초기화
            </button>

            <h3>규정 점검 시나리오</h3>
            <div className="pillRow">
              {SCENARIOS.map((sc) => (
                <button key={sc.id} className={`pill ${sc.warn ? 'warn' : ''} ${state.scenario === sc.id ? 'on' : ''}`}
                  onClick={() => dispatch({ type: 'SET_SCENARIO', scenario: sc.id })}>
                  {sc.label}
                </button>
              ))}
            </div>

            <h3>온보딩 · 화면</h3>
            <div className="pillRow">
              <button className={`pill warn ${idFailMode ? 'on' : ''}`} onClick={() => setIdFailMode(!idFailMode)}>
                등록증 인식 실패 재현
              </button>
              <button className={`pill ${state.dark ? 'on' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_DARK' })}>
                다크 모드 (야간 교대)
              </button>
            </div>
            <div className="pillRow" style={{ marginTop: 8 }}>
              {JUMPS.map((j) => (
                <button key={j.s} className={`pill ${state.screen === j.s ? 'on' : ''}`}
                  onClick={() => dispatch({ type: 'NAV', screen: j.s })}>{j.label}</button>
              ))}
            </div>

            <h3>지표 (부록 D)</h3>
            <div className="metric"><span className="k">현재 화면</span><span className="v">{state.screen}</span></div>
            <div className="metric"><span className="k">온보딩 소요 (목표 ≤ 4분)</span>
              <span className="v">{onbMs !== null ? `${Math.round(onbMs / 1000)}초` : '진행 중'}</span></div>
            <div className="metric"><span className="k">제안 상태</span>
              <span className="v">{state.proposal ? state.proposal.status : state.tx ? `executed(${state.tx.status})` : '—'}</span></div>
            <div className="metric"><span className="k">규정 판정</span>
              <span className="v">{state.compliance ? `${state.compliance.result}${state.compliance.code ? '/' + state.compliance.code : ''}` : '—'}</span></div>
            <div className="metric"><span className="k">이번 달 송금</span><span className="v">₩{state.sentThisMonth.toLocaleString()}</span></div>
            <div className="metric"><span className="k">가족 공유</span><span className="v">{state.tx?.sharedVia ?? '—'}</span></div>

            <h3>이벤트 로그</h3>
            {state.events.slice(-7).reverse().map((e, i) => (
              <div className="metric" key={i}>
                <span className="k" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{e.name}</span>
                <span className="v" style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.data ?? ''}</span>
              </div>
            ))}
          </div>

          <div className="traceBox">
            <div className="traceHead"><span className="dotLive" />에이전트 트레이스 (AG-1 trace_id)</div>
            <div className="traceLog" ref={traceRef}>
              {state.trace.map((tr, i) => (
                <div className="tr" key={i}>
                  <span className="tt">{new Date(tr.at).toLocaleTimeString('ko-KR', { hour12: false })}</span>
                  <span className={`actor ${tr.actor}`}>{tr.actor}</span>
                  <span className="msg">{tr.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
