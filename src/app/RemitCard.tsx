import { useApp } from './hooks'
import { Logo } from './Logo'
import { AgentReasoning } from './AgentSteps'
import { FX, fxAdvantagePct } from '../mock/fx'

/* 송금 ⑤ 사용자 승인 — 홈(B1)과 채팅이 같은 카드를 쓴다.
   onDone: 채팅에서 버튼을 누르면 시트를 닫는다 */
export function RemitProposalCard({ onDone }: { onDone?: () => void }) {
  const { state, dispatch, p, t, krw, local } = useApp()
  const fx = FX[p.currency]
  const plan = state.analysis?.plan
  const prop = state.proposal
  if (!prop || prop.status !== 'new') return null

  const act = (fn: () => void) => () => { fn(); onDone?.() }
  // 금액 변경·보내기 모두 제안 금액을 초안으로 채운다 — 채팅 경로에서도 B2·B3 가 맞는 금액을 본다
  const draft = () => dispatch({ type: 'SET_DRAFT', amount: prop.amount })

  return (
    <div className="agentcard">
      <div className="who"><Logo size={24} /><b className="wmk">ONNA</b></div>
      <p className="say">{plan?.say ?? t('b1.say', { amount: krw(prop.amount) })}</p>
      <p className="why">{plan?.why ?? t('b1.why', { rate: fx.rateText, pct: fxAdvantagePct(p.currency), floor: krw(state.livingFloor) })}</p>
      <div className="money" style={{ fontSize: 27 }}>
        {krw(prop.amount)}
        <small>≈ {local(Math.round(prop.amount * fx.rate))}</small>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn agent sm" onClick={act(() => { draft(); dispatch({ type: 'PROPOSAL_ACTION', action: 'send' }) })}>{t('b1.send')}</button>
        <button className="btn ghost sm" onClick={act(() => { draft(); dispatch({ type: 'PROPOSAL_ACTION', action: 'change' }) })}>{t('b1.change')}</button>
        <button className="btn ghost sm" onClick={act(() => dispatch({ type: 'PROPOSAL_ACTION', action: 'later' }))}>{t('b1.later')}</button>
      </div>
      <AgentReasoning />
    </div>
  )
}
