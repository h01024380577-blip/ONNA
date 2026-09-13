import { useStore } from '../store'
import { NATION_BY_PERSONA, PERSONAS } from '../mock/personas'
import { Icon } from '../app/Icon'
import { DataStatus } from './DataStatus'
import type { PersonaId, Scenario } from '../types'

/* 데모 콘솔 — 모바일(⚙ 시트)과 데스크톱(우측 패널)이 같은 화면을 쓴다.
   한쪽만 고쳐서 두 콘솔이 갈라지는 일을 막으려고 컴포넌트 하나로 둔다.
   시연 중 심사위원에게 보이는 화면이라 변수명·이벤트명을 쓰지 않는다. */

export type View = 'worker' | 'employer' | 'family'

/** 가족 화면에서 아직 열어보지 않은 메시지 수 — 탭 배지 기준 (데스크톱·⚙ 콘솔 공용) */
export function familyUnread(s: { tx?: { status: string; sharedVia?: string }; familyRead?: { shared?: boolean; arrived?: boolean } }): number {
  const tx = s.tx
  if (!tx || tx.status === 'cancelled' || !tx.sharedVia) return 0
  return (s.familyRead?.shared ? 0 : 1) + (tx.status === 'arrived' && !s.familyRead?.arrived ? 1 : 0)
}

/* 탭 순서 = 이야기 순서: 근로자가 신청 → 사장님이 확인 → 가족이 받는다 */
export const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'worker', label: '근로자 앱' },
  { id: 'employer', label: '사장님 화면' },
  { id: 'family', label: '가족 화면' },
]

const SCENARIOS: Array<{ id: Scenario; label: string; warn?: boolean }> = [
  { id: 'auto', label: '자동 판정' },
  { id: 'pass', label: '통과 강제' },
  { id: 'HOLD_LIMIT_MONTHLY', label: '보류 · 월 한도', warn: true },
  { id: 'HOLD_DOC_INCOME', label: '보류 · 소득 서류', warn: true },
  { id: 'HOLD_BENEFICIARY_NEW', label: '보류 · 신규 수취인', warn: true },
]

interface Props {
  view: View
  setView: (v: View) => void
  idFailMode: boolean
  setIdFailMode: (v: boolean) => void
  startAt: 'onboarding' | 'home'
  setStartAt: (v: 'onboarding' | 'home') => void
  /** 모바일 시트에서 조작 후 시트를 닫는 용도. 데스크톱은 넘기지 않는다 */
  onPick?: () => void
}

export function DemoConsole({
  view, setView, idFailMode, setIdFailMode, startAt, setStartAt, onPick,
}: Props) {
  const { state, dispatch } = useStore()
  const hasAccount = !!state.onboarding.accountNo

  // 그 화면에서 확인할 일이 몇 건인지 — 데스크톱 탭 배지와 같은 기준
  const unread: Partial<Record<View, number>> = {
    employer:
      (state.onboarding.employer === 'pending' ? 1 : 0) +
      (state.accountShare && !state.accountShare.read ? 1 : 0),
    family: familyUnread(state),
  }

  const pick = (fn: () => void) => () => { fn(); onPick?.() }

  return (
    <>
      <h3>온보딩</h3>
      {/* 실제 앱 재실행처럼 — 로딩 화면을 거쳐 온보딩 첫 화면으로 */}
      <button className="devBtn"
        onClick={pick(() => {
          dispatch({ type: 'RESET', persona: state.personaId, startAt: 'onboarding' })
          setView('worker')
          window.dispatchEvent(new CustomEvent('onna:splash'))
        })}>
        <Icon name="restart" size={17} strokeWidth={2.1} style={{ marginRight: 8 }} />첫 온보딩 화면으로 (국적 선택)
      </button>

      <h3>화면</h3>
      <div className="pillRow">
        {VIEWS.map((v) => (
          <button key={v.id} className={`pill ${view === v.id ? 'on' : ''}`}
            onClick={pick(() => setView(v.id))}>
            {v.label}{unread[v.id] ? ` (${unread[v.id]})` : ''}
          </button>
        ))}
      </div>

      <h3>이벤트 트리거</h3>
      <button className="devBtn" disabled={!hasAccount || !!state.salaryEvent}
        onClick={pick(() => { dispatch({ type: 'SALARY_CREDITED' }); setView('worker') })}>
        <Icon name="money" size={17} strokeWidth={2} style={{ marginRight: 8 }} />급여 입금 발생
      </button>
      <button className="devBtn subtle" disabled={state.tx?.status !== 'processing'}
        onClick={() => dispatch({ type: 'TX_ARRIVED' })}>
        송금 도착 지금 발생
      </button>
      <button className="devBtn subtle"
        onClick={pick(() => { dispatch({ type: 'RESET', persona: state.personaId, startAt }); setView('worker') })}>
        <Icon name="refresh" size={16} strokeWidth={2} style={{ marginRight: 8 }} />세션 초기화
      </button>

      <h3>페르소나</h3>
      <div className="pillRow">
        {(Object.keys(PERSONAS) as PersonaId[]).map((id) => (
          <button key={id} className={`pill ${state.personaId === id ? 'on' : ''}`}
            onClick={pick(() => { dispatch({ type: 'RESET', persona: id, startAt }); setView('worker') })}>
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
          <button key={sc.id} className={`pill ${sc.warn ? 'warn' : ''} ${state.scenario === sc.id ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'SET_SCENARIO', scenario: sc.id })}>{sc.label}</button>
        ))}
      </div>

      <DataStatus />

      <h3>기타</h3>
      <div className="pillRow">
        <button className={`pill ${state.dark ? 'on' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_DARK' })}>다크 모드</button>
        <button className={`pill warn ${idFailMode ? 'on' : ''}`} onClick={() => setIdFailMode(!idFailMode)}>등록증 인식 실패 재현</button>
        <button className={`pill ${state.creditReady ? 'on' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_CREDIT' })}>신용 6개월 충족 (대출)</button>
      </div>
    </>
  )
}
