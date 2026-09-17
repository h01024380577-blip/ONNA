import { useEffect, useRef, useState } from 'react'
import { useApp, useCredit } from './hooks'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { StepRow, ThinkingCard } from './AgentSteps'
import { RemitProposalCard } from './RemitCard'
import { DocRunCard } from './DocRunCard'
import { startDocRun } from '../agent/useDocAgent'
import { downscale } from '../lib/image'
import type { ChatAction, ChatItem } from '../types'

/* 에이전트 채팅 — 사용자 질문(chat) → 오케스트레이터(의도 분석 → Task 분업) →
   송금·서류·신용 도우미 카드. 실행은 항상 카드/화면의 확인 단계를 거친다 (AG-3) */

export function ChatSheet({ onClose }: { onClose: () => void }) {
  const { state, dispatch, t } = useApp()
  const [draft, setDraft] = useState('')
  const msgsRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const typing = state.orch?.status === 'running'
  const docBusy = state.docRun?.status === 'running'

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.chat.length, typing, state.analysis?.phase, state.docRun?.phase])

  const ask = (raw?: string) => {
    const text = (raw ?? draft).trim()
    if (!text || typing) return
    setDraft('')
    dispatch({ type: 'CHAT_ASK', text })
  }

  const lastQuestion = (): string | undefined => {
    for (let i = state.chat.length - 1; i >= 0; i--) {
      const m = state.chat[i]
      if (m.who === 'user') return m.text
    }
    return undefined
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || docBusy) return
    try {
      startDocRun(dispatch, await downscale(f), 'chat', draft.trim() || lastQuestion())
      setDraft('')
    } catch {
      /* 읽을 수 없는 파일 */
    }
  }

  const runAction = (a: ChatAction) => {
    if (a.escalate) dispatch({ type: 'ESCALATE', reason: 'chat_request' })
    if (a.screen) {
      dispatch({ type: 'NAV', screen: a.screen })
      onClose()
    }
  }

  return (
    <div className="micSheetBack" onClick={onClose}>
      <div className="chatSheet" onClick={(e) => e.stopPropagation()}>
        <div className="chatHead">
          <Logo size={24} />
          <b className="wmk">ONNA</b>
          <button className="chatClose" aria-label={t('common.close')} onClick={onClose}><Icon name="close" size={17} /></button>
        </div>
        <div className="chatMsgs" ref={msgsRef}>
          <div className="bubble agent">{t('chat.hello')}</div>
          {state.chat.map((m) => (
            <ChatRow key={m.id} m={m} onClose={onClose} onAttach={() => fileRef.current?.click()} runAction={runAction} />
          ))}
          {typing && <div className="bubble agent typing"><i /><i /><i /></div>}
        </div>
        <div className="chatChips">
          {[t('chat.s1'), t('chat.s2'), t('chat.s3')].map((sug) => (
            <button key={sug} disabled={typing} onClick={() => ask(sug)}>{sug}</button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <div className="chatInputRow">
          <button className="attachBtn" aria-label={t('doc.attach')} disabled={docBusy} onClick={() => fileRef.current?.click()}>
            <Icon name="camera" size={19} />
          </button>
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) ask() }}
            placeholder={t('chat.ph')} />
          <button className="sendBtn" aria-label={t('chat.title')} disabled={typing} onClick={() => ask()}><Icon name="send" size={18} /></button>
        </div>
      </div>
    </div>
  )
}

function ChatRow({ m, onClose, onAttach, runAction }: {
  m: ChatItem
  onClose: () => void
  onAttach: () => void
  runAction: (a: ChatAction) => void
}) {
  const { state, t } = useApp()
  if (m.who === 'user') return <div className="bubble user">{m.text}</div>
  switch (m.kind) {
    case 'text':
      return (
        <div className="bubble agent">
          {m.text}
          {m.action && (
            <button className="btn agent sm" style={{ marginTop: 8 }} onClick={() => runAction(m.action!)}>{t(m.action.labelKey)}</button>
          )}
        </div>
      )
    case 'route':
      return (
        <div className="routeRow">
          <Icon name="sparkle" size={14} />
          <span>{t('orch.route', { who: m.agents.map((a) => t(`orch.agent.${a}`)).join(' · ') })}</span>
        </div>
      )
    case 'remit':
      return <div className="chatCard"><RemitChatCard runId={m.runId} onClose={onClose} /></div>
    case 'docAsk':
      return (
        <div className="bubble agent">
          {t('doc.ask')}
          <button className="btn agent sm" style={{ marginTop: 8 }} disabled={state.docRun?.status === 'running'} onClick={onAttach}>
            <Icon name="camera" size={16} style={{ marginRight: 6 }} />{t('doc.attach')}
          </button>
        </div>
      )
    case 'doc':
      return (
        <div className="chatCard">
          {state.docRun?.runId === m.runId
            ? <DocRunCard origin="chat" onNavigate={onClose} />
            : <div className="bubble agent">{t('chat.docOld')}</div>}
        </div>
      )
    case 'credit':
      return <div className="chatCard"><CreditChatCard onClose={onClose} /></div>
  }
}

/** 채팅 송금 카드 — 분석 중이면 단계, 끝나면 제안 카드 */
function RemitChatCard({ runId, onClose }: { runId: number; onClose: () => void }) {
  const { state, t } = useApp()
  const an = state.analysis
  if (!an || an.startedAt !== runId) return <div className="bubble agent">{t('chat.remitOld')}</div>
  if (an.status === 'running') return <ThinkingCard variant="light" />
  if (state.proposal?.status === 'new') return <RemitProposalCard onDone={onClose} />
  return <div className="bubble agent">{t('chat.remitHandled')}</div>
}

/** 기록·신용 도우미 — 거래 DB → 신용 확인 → 한도 안내. 코드만으로 그린다 */
function CreditChatCard({ onClose }: { onClose: () => void }) {
  const { dispatch, t, krw } = useApp()
  const cr = useCredit()
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= 3) return
    const id = setTimeout(() => setStep(step + 1), 350)
    return () => clearTimeout(id)
  }, [step])
  const go = (screen: 'D1' | 'C1') => () => {
    dispatch({ type: 'NAV', screen })
    onClose()
  }
  return (
    <div className="think light">
      <div className="thinkHead">
        <Logo size={20} />
        <b className="wmk">ONNA</b>
        <span>{t('orch.agent.credit')}</span>
      </div>
      {['credit.step1', 'credit.step2', 'credit.step3'].map((k, i) => (
        <StepRow key={k} label={t(k)} status={i < step ? 'done' : i === step ? 'running' : 'pending'} />
      ))}
      {step >= 3 && (
        <div className="creditResult">
          <div className="meter"><i style={{ width: `${Math.round((Math.min(cr.creditMonths, 6) / 6) * 100)}%` }} /></div>
          {/* 대출 게이트 — 준비 전에는 한도·금리를 보여 주지 않는다 */}
          {cr.ready ? (
            <>
              <p>{t('credit.readyLine', { limit: krw(cr.limit), rate: cr.rate })}</p>
              <button className="btn agent sm" onClick={go('D1')}>{t('credit.newsGo')}</button>
            </>
          ) : (
            <>
              <p>{t('credit.left', { m: cr.creditMonths, k: cr.monthsToCredit })}</p>
              <button className="btn ghost sm" onClick={go('C1')}>{t('chat.goRecord')}</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
