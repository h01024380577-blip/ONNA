import { useState } from 'react'
import { useApp } from './hooks'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { StepRow } from './AgentSteps'
import type { DocPhase } from '../types'
import type { DocActionKind } from '../agent/docRules'

/* 서류 에이전트 진행·결과 카드 — 도움 화면과 채팅이 같이 쓴다.
   앱 화면에는 OCR·RAG·CoVe 같은 말을 쓰지 않는다(쉬운 말 단계 이름). */

type Step = Exclude<DocPhase, 'done'>
const ORDER: Step[] = ['ocr', 'search', 'verify', 'answer', 'actions']
const LABEL: Record<Step, string> = {
  ocr: 'doc.step1', search: 'doc.step2', verify: 'doc.step3', answer: 'doc.step4', actions: 'doc.step5',
}

function statusOf(phase: DocPhase, k: Step): 'done' | 'running' | 'pending' {
  if (phase === 'done') return 'done'
  const i = ORDER.indexOf(k)
  const cur = ORDER.indexOf(phase)
  return i < cur ? 'done' : i === cur ? 'running' : 'pending'
}

export function DocRunCard({ origin, onNavigate }: { origin: 'help' | 'chat'; onNavigate?: () => void }) {
  const { state, dispatch, t } = useApp()
  const run = state.docRun
  const [open, setOpen] = useState<string | null>(null)
  const [done, setDone] = useState<Partial<Record<DocActionKind, boolean>>>({})
  const [showKo, setShowKo] = useState(false)
  if (!run || run.origin !== origin) return null

  if (run.status === 'error')
    return <div className="note amber"><Icon name="alert" size={16} strokeWidth={2} /><span>{t('help.failed')}</span></div>

  const ocr = run.ocr
  const passages = run.passages ?? []
  const sub: Partial<Record<Step, string>> = {
    ocr: ocr ? [t(`doc.kind.${ocr.kind}`), ocr.title].filter(Boolean).join(' · ') : undefined,
    search: run.passages
      ? passages.length
        ? [...new Set(passages.map((p) => p.title))].slice(0, 3).join(' · ')
        : t(run.searchFailed ? 'doc.searchFail' : 'doc.noGuide')
      : undefined,
    verify: run.checkCount !== undefined ? t('doc.checked', { n: run.checkCount, m: run.fixedCount ?? 0 }) : undefined,
  }

  const citeLabel = (c: string) => (c === 'ocr' ? t('doc.srcOcr') : passages.find((p) => p.id === c)?.title ?? c)
  const citeBody = (c: string) => {
    /* 서류 원문 발췌는 원문 앞부분이 아니라 읽어 낸 항목으로 보여 준다 —
       원문 앞머리에는 이름·고객번호가 있어 그대로 노출됐다(실측) */
    if (c === 'ocr') {
      if (!ocr) return ''
      const rows = [
        ocr.amount && `${t('help.fAmount')} ${ocr.amount}`,
        ocr.dueDate && `${t('help.fDue')} ${ocr.dueDate}`,
        ...ocr.fields.map((f) => `${f.label} ${f.value}`),
      ].filter(Boolean)
      return rows.length ? rows.join(' · ') : t('doc.srcOcrNote')
    }
    const p = passages.find((x) => x.id === c)
    return p ? `${p.snippet}… — ${p.source}` : ''
  }

  const act = (k: DocActionKind) => {
    if (k === 'ko_phrase') return setShowKo(!showKo)
    if (k === 'open_record') {
      dispatch({ type: 'NAV', screen: 'C1' })
      return onNavigate?.()
    }
    if (k === 'human') dispatch({ type: 'ESCALATE', reason: 'doc_question' })
    setDone({ ...done, [k]: true })
  }
  const doneNote: Partial<Record<DocActionKind, string>> = {
    autopay: t('help.autoPayDone'),
    due_reminder: t('doc.reminderDone'),
    human: t('doc.humanDone'),
  }

  const ans = run.status === 'done' ? run.answer : undefined

  return (
    <>
      <div className="think light">
        <div className="thinkHead">
          <Logo size={20} />
          <b className="wmk">ONNA</b>
          <span>{t('doc.analyzing')}</span>
        </div>
        {ORDER.map((k) => (
          <StepRow key={k} status={statusOf(run.phase, k)} label={t(LABEL[k])} sub={sub[k]} />
        ))}
      </div>

      {ans && ocr && (
        <div className="agentcard">
          <div className="who"><Logo size={24} /><b className="wmk">ONNA</b></div>
          <p className="say">{ocr.title ?? t(`doc.kind.${ocr.kind}`)}</p>
          <p className="why" style={{ fontSize: 14.5, color: 'var(--app-ink)', margin: '0 0 8px' }}>{ans.summary}</p>

          {(ocr.amount || ocr.dueDate || ocr.issuer) && (
            <div className="card" style={{ margin: '0 0 10px' }}>
              {ocr.amount && <div className="kv"><span className="k">{t('help.fAmount')}</span><span className="v">{ocr.amount}</span></div>}
              {ocr.dueDate && <div className="kv"><span className="k">{t('help.fDue')}</span><span className="v">{ocr.dueDate}</span></div>}
              {ocr.issuer && <div className="kv"><span className="k">{t('help.fIssuer')}</span><span className="v">{ocr.issuer}</span></div>}
            </div>
          )}

          <ul className="docPoints">
            {ans.points.map((pt) => (
              <li key={pt.id}>
                <span>{pt.text}</span>
                <span className="cites">
                  {pt.cites.map((c) => (
                    <button key={c} className={`citeChip ${c === 'ocr' ? 'ocr' : ''} ${open === pt.id + c ? 'on' : ''}`}
                      onClick={() => setOpen(open === pt.id + c ? null : pt.id + c)}>
                      <Icon name={c === 'ocr' ? 'scan' : 'doc'} size={11} strokeWidth={2.2} />{citeLabel(c)}
                    </button>
                  ))}
                </span>
                {pt.cites.map((c) => open === pt.id + c && <p className="citeBody" key={c}>{citeBody(c)}</p>)}
              </li>
            ))}
          </ul>

          {ocr.confidence === 'low' && (
            <div className="note amber" style={{ margin: '0 0 10px' }}>
              <Icon name="alert" size={15} strokeWidth={2} /><span>{t('help.lowConf')}</span>
            </div>
          )}

          {showKo && ocr.koPhrase && (
            <div className="card" style={{ margin: '0 0 10px' }}>
              <p style={{ fontSize: 14.5, color: 'var(--app-ink)', fontWeight: 600, lineHeight: 1.5 }}>“{ocr.koPhrase}”</p>
              <p style={{ marginTop: 6 }}>{t('help.koShow')}</p>
            </div>
          )}

          {ans.actions.length > 0 && (
            <div className="docActs">
              <b>{t('doc.step5')}</b>
              {ans.actions.map((a, i) => (
                <div key={a.kind} className="docAct">
                  <button className={`btn sm ${i === 0 ? 'agent' : 'ghost'}`} disabled={!!done[a.kind]} onClick={() => act(a.kind)}>
                    {t(`doc.act.${a.kind}`)}
                  </button>
                  {a.reason && <small>{a.reason}</small>}
                  {done[a.kind] && doneNote[a.kind] && (
                    <div className="note mint" style={{ margin: '6px 0 0' }}>
                      <Icon name="check" size={15} strokeWidth={2.4} /><span>{doneNote[a.kind]}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="reasonSrc" style={{ marginTop: 10 }}>
            {t(`doc.src.${run.source === 'verified' && !passages.length ? 'verifiedDoc' : run.source ?? 'ocr-only'}`, { sec: ((run.latencyMs ?? 0) / 1000).toFixed(1) })}
          </p>
          <p style={{ marginTop: 4, fontSize: 12, color: 'var(--app-muted)' }}>{t('help.aiNote')}</p>
        </div>
      )}
    </>
  )
}
