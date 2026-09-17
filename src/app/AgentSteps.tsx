import { useState } from 'react'
import { useApp } from './hooks'
import { Icon } from './Icon'
import { Logo } from './Logo'
import type { Analysis, PlanAction, StepKey } from '../types'

/* 송금 에이전트 사고과정 — 잠금화면·채팅(분석 중)과 제안 카드(펼침)가 같은 단계 정의를 쓴다.
   ③ 송금안 아래의 한도·생활비 문장만 코드가 만든다: 한도 이야기는 LLM 이 못 하게 되어 있다. */

const ORDER: StepKey[] = ['signals', 'situation', 'plan', 'explain']
const LABEL: Record<StepKey, string> = {
  signals: 'agent.step1',
  situation: 'agent.step2',
  plan: 'agent.step3',
  explain: 'agent.step4',
}
const ACT_LABEL: Record<PlanAction, string> = {
  remit_full: 'agent.actFull',
  remit_adjust: 'agent.actAdjust',
  later: 'agent.actLater',
}

function statusOf(phase: Analysis['phase'], k: StepKey): 'done' | 'running' | 'pending' {
  if (phase === 'done') return 'done'
  const i = ORDER.indexOf(k)
  const cur = ORDER.indexOf(phase)
  return i < cur ? 'done' : i === cur ? 'running' : 'pending'
}

/** 분석이 도는 동안 단계 라벨만 보여 준다 (본문은 아직 없다).
    lock = 어두운 잠금화면, light = 채팅 등 밝은 화면 */
export function ThinkingCard({ variant = 'lock' }: { variant?: 'lock' | 'light' }) {
  const { state, t } = useApp()
  const an = state.analysis
  if (!an) return null
  return (
    <div className={`think ${variant === 'light' ? 'light' : ''}`}>
      <div className="thinkHead">
        <Logo size={20} />
        <b className="wmk">ONNA</b>
        <span>{t(an.trigger === 'chat' ? 'agent.analyzingChat' : 'agent.analyzing')}</span>
      </div>
      {ORDER.map((k) => (
        <StepRow key={k} status={statusOf(an.phase, k)} label={t(LABEL[k])} />
      ))}
    </div>
  )
}

/** 단계 한 줄 — 송금·서류·신용 카드가 같이 쓴다 */
export function StepRow({ status, label, sub }: { status: 'done' | 'running' | 'pending'; label: string; sub?: string }) {
  return (
    <div className={`thinkRow ${status}`}>
      <span className="thinkDot">
        {status === 'done' ? <Icon name="check" size={11} strokeWidth={3} /> : status === 'running' ? <i className="spin" /> : null}
      </span>
      <span className="thinkText">
        {label}
        {sub && <small>{sub}</small>}
      </span>
    </div>
  )
}

/** 홈 제안 카드 — 어떻게 정했는지 펼쳐 본다 (기본 접힘) */
export function AgentReasoning() {
  const { state, t, krw } = useApp()
  const [open, setOpen] = useState(false)
  const an = state.analysis
  if (an?.status !== 'done' || !an.plan) return null

  const body: Record<StepKey, string> = {
    signals: an.plan.steps.signals,
    situation: an.plan.steps.situation,
    plan: `${an.plan.steps.compare} ${t(an.checkKey ?? 'agent.checkOk', { floor: krw(an.signals.livingFloor) })}`,
    explain: an.plan.steps.decide,
  }

  return (
    <div className="reason">
      <button className="reasonBtn" onClick={() => setOpen(!open)}>
        {t(open ? 'agent.hide' : 'agent.how')}
        <Icon name="chevron" size={14} style={{ transform: `rotate(${open ? -90 : 90}deg)` }} />
      </button>
      {open && (
        <div className="reasonBody">
          {ORDER.map((k, i) => (
            <div className="reasonStep" key={k}>
              <span className="reasonNo">{i + 1}</span>
              <div>
                <b>{t(LABEL[k])}</b>
                <p>{body[k]}</p>
              </div>
            </div>
          ))}
          {!!an.plan.rejected?.length && (
            <div className="reasonRej">
              <b>{t('agent.notPicked')}</b>
              {an.plan.rejected.map((r, i) => (
                <p key={i}>
                  <span className="rejTag">{t(ACT_LABEL[r.action])}</span>{' '}
                  {r.text}
                </p>
              ))}
            </div>
          )}
          <div className="reasonSrc">
            {an.source === 'llm'
              ? t('agent.srcLive', { sec: ((an.latencyMs ?? 0) / 1000).toFixed(1) })
              : t('agent.srcTemplate')}
          </div>
        </div>
      )}
    </div>
  )
}
