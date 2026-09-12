import { useStore, SLA_DEMO_SEC } from '../store'
import { PERSONAS } from '../mock/personas'

/* EM-1 고용주 승인 웹 — 한국어 1화면, 승인 1탭. 급여는 보이지 않음 */
export function EmployerCard() {
  const { state, dispatch } = useStore()
  const p = PERSONAS[state.personaId]
  const st = state.onboarding.employer
  return (
    <div className="deskCard">
      <div className="dcHead"><b className="wmk">ONNA</b><span>재직 확인 — 카카오톡으로 받은 링크</span></div>
      <div className="dcBody">
        {st === 'none' ? (
          <>
            <h2>아직 요청이 없어요</h2>
            <p className="sub2">근로자가 온보딩에서 회사를 연결하면, 사장님 카카오톡으로 이 링크가 갑니다.</p>
          </>
        ) : (
          <>
            <h2>{p.fullName} 님이 우리 직원인가요?</h2>
            <p className="sub2">확인하는 내용은 <b>"일하고 있음"</b> 하나뿐입니다. 급여 정보는 보이지 않아요.</p>
            <div className="kv"><span className="k">근로자</span><span className="v">{p.fullName}</span></div>
            <div className="kv"><span className="k">사업장</span><span className="v">{state.onboarding.employerName ?? p.employerKo}</span></div>
            <div className="kv"><span className="k">요청 항목</span><span className="v">재직 여부 (일하고 있음)</span></div>
            {st === 'verified' ? (
              <div className="empDone">✓ 확인해 주셔서 감사합니다. {p.name} 님의 기록이 시작됩니다.</div>
            ) : (
              <button className="empApprove" onClick={() => dispatch({ type: 'EMPLOYER_APPROVE' })}>
                네, 우리 직원이 맞습니다
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* RM-9 컴플라이언스 담당자 큐 — 내부 도구, 최소 UI */
export function OpsCard() {
  const { state, dispatch } = useStore()
  return (
    <div className="deskCard">
      <div className="dcHead"><b className="wmk">ONNA</b><span>컴플라이언스 검토 큐 — 파일럿 SLA 30분 (데모 {SLA_DEMO_SEC}초 자동 승인)</span></div>
      <div className="dcBody">
        {state.queue.length === 0 ? (
          <>
            <h2>대기 중인 건이 없습니다</h2>
            <p className="sub2">근로자 앱에서 보류가 발생하고 급여명세서가 올라오면 여기에 쌓입니다.</p>
          </>
        ) : (
          state.queue.map((q) => (
            <div className="opsRow" key={q.id}>
              <div className="docThumb" />
              <div>
                <div className="who2">{q.user}</div>
                <div className="sub3">₩{q.amount.toLocaleString()} · {new Date(q.at).toLocaleTimeString('ko-KR')}</div>
                <span className="code">{q.code}</span>
              </div>
              <button className="opsApprove" disabled={q.status === 'approved'}
                onClick={() => dispatch({ type: 'OPS_APPROVE', id: q.id })}>
                {q.status === 'approved' ? '승인됨' : '재심사 승인'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
