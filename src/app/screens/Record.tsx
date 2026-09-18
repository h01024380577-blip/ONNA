import { useRef, useState } from 'react'
import { useApp, useCredit } from '../hooks'
import { Icon } from '../Icon'
import { LoanEntry } from './Loan'
import { NavBar } from './Remit'
import { DocRunCard } from '../DocRunCard'
import { failDocRun, startDocRun } from '../../agent/useDocAgent'
import { downscale, readDoc } from '../../lib/image'
import { Ledger, groupByMonth } from '../Ledger'

/* C1 내 기록 — CR-1/2: 요약 + 진행 바 + 월별 타임라인 + 검증됨 배지 */
export function C1() {
  const { state, p, t } = useApp()
  // 급여·송금 기록(타임라인)과 입출금 내역은 세로로 쌓지 않고 버튼으로 전환한다
  const [view, setView] = useState<'record' | 'ledger'>('record')
  const remits = p.remitCount + state.sessionRemits
  const cr = useCredit()
  const credit = cr.monthsToCredit
  const pct = Math.round((Math.min(cr.creditMonths, 6) / 6) * 100)
  const employerOk = state.onboarding.employer === 'verified'

  // 최근 6개월 타임라인 — 입출금 원장에서 파생한다 (지어낸 값 없음)
  const months = groupByMonth(state.ledger, Date.now(), 6).map((g) => ({
    label: g.label,
    salary: g.entries.some((e) => e.kind === 'salary' && e.verified),
    remit: g.entries.filter((e) => e.kind === 'remit' && e.verified).length,
    utility: g.entries.some((e) => e.kind === 'utility'),
  }))

  return (
    <>
      <div className="appBody">
        <div className="h1">{t('c1.title')}</div>

        <div className="card">
          <div style={{ display: 'flex', gap: 8, textAlign: 'center' }}>
            {[
              [t('c1.months'), t('c1.monthsV', { m: p.monthsEmployed })],
              [t('c1.remits'), t('c1.remitsV', { n: remits })],
              [t('c1.utility'), '100%'],
            ].map(([k, v]) => (
              <div key={k} style={{ flex: 1, background: 'var(--app-bg)', borderRadius: 12, padding: '10px 4px' }}>
                <div style={{ fontSize: 12, color: 'var(--app-muted)' }}>{k}</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="meter"><i style={{ width: `${pct}%` }} /></div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-primary)' }}>{t('c1.creditBar', { k: credit })}</p>
          <p style={{ fontSize: 12.5 }}>{t('c1.creditStart')}</p>
        </div>

        <LoanEntry />

        <div className="seg" role="tablist">
          <button role="tab" aria-selected={view === 'record'} className={view === 'record' ? 'on' : ''} onClick={() => setView('record')}>
            <Icon name="record" size={15} />{t('c1.tabRecord')}
          </button>
          <button role="tab" aria-selected={view === 'ledger'} className={view === 'ledger' ? 'on' : ''} onClick={() => setView('ledger')}>
            <Icon name="money" size={15} />{t('c1.tabLedger')}
          </button>
        </div>

        {view === 'ledger' && <Ledger />}

        {view === 'record' && <>
        {!employerOk && (
          <div className="card" style={{ borderColor: 'var(--app-hold)' }}>
            <p style={{ color: 'var(--app-hold)' }}>{t('c1.pendingEmployer')}</p>
          </div>
        )}

        <div className="list">
          {months.map((m) => (
            <div className="item" key={m.label} style={{ alignItems: 'flex-start' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--app-muted)', flex: 'none', marginTop: 2 }}>{m.label}</span>
              <span style={{ fontSize: 13.5 }}>
                {[
                  m.salary ? t('c1.evSalary') : null,
                  m.remit > 0 ? t('c1.evRemit', { n: m.remit }) : null,
                  m.utility ? t('c1.evUtility') : null,
                ].filter(Boolean).join(' · ') || '—'}
              </span>
              {(m.salary || m.remit > 0) && (
                <span className="r"><span className="badge ok" style={{ fontSize: 11 }}><Icon name="check" size={12} strokeWidth={2.6} /> {t('c1.verified')}</span></span>
              )}
            </div>
          ))}
        </div>

        <div className="list">
          <button className="item">
            <div className="ico"><Icon name="qr" size={18} /></div>
            <span style={{ fontWeight: 600 }}>{t('c1.shareQR')}</span>
            <span className="r"><Icon name="chevron" size={16} /></span>
          </button>
          <button className="item">
            <div className="ico"><Icon name="doc" size={18} /></div>
            <span style={{ fontWeight: 600 }}>{t('c1.export')}</span>
            <span className="r"><Icon name="chevron" size={16} /></span>
          </button>
        </div>

        <p style={{ color: 'var(--app-muted)', fontSize: 13 }}>{t('c1.own')}</p>
        </>}
      </div>
      <NavBar active="record" />
    </>
  )
}

/** 데모 촬영에 쓰는 가상 청구서 — 실제 파이프라인(OCR·검색·검증)에 그대로 들어간다 */
const SAMPLE_DOC = '/samples/gas-bill-2026-09.png'

/* HELP — C2: 서류 촬영·업로드 → 서류 에이전트(읽기·자료 찾기·다시 확인·근거 설명·다음 할 일), AG-6 사람 연결 */
export function Help() {
  const { state, dispatch, t } = useApp()
  const [cam, setCam] = useState<null | 'aim' | 'reading'>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const run = state.docRun?.origin === 'help' ? state.docRun : undefined
  const busy = state.docRun?.status === 'running'

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (!f || busy) return
    try {
      startDocRun(dispatch, await readDoc(f), 'help')
    } catch {
      failDocRun(dispatch, 'help') // 읽을 수 없거나 너무 큰 파일 — 실패 안내를 보여 준다
    }
  }

  const shoot = async () => {
    if (cam === 'reading' || busy) return
    setCam('reading')
    try {
      const image = await downscale(await (await fetch(SAMPLE_DOC)).blob())
      setTimeout(() => {
        setCam(null)
        startDocRun(dispatch, image, 'help')
      }, 1200)
    } catch {
      setCam(null)
    }
  }

  return (
    <>
      <div className="appBody">
        <div className="h1">{t('help.title')}</div>

        {/* 서류 사진 찍어 물어보기 — 화면 최상단 */}
        {!run ? (
          <button className="dropzone" onClick={() => setCam('aim')}>
            <Icon name="camera" size={26} />
            <h4>{t('help.doc')}</h4>
            <p style={{ margin: 0, fontSize: 12.5 }}>{t('help.docS')}</p>
          </button>
        ) : (
          <>
            <DocRunCard origin="help" />
            {run.status !== 'running' && (
              <button className="btn ghost sm" style={{ width: '100%', marginBottom: 12 }} onClick={() => setCam('aim')}>
                <Icon name="camera" size={16} style={{ marginRight: 6 }} />{t('help.again')}
              </button>
            )}
          </>
        )}

        {/* 파일 올려서 물어보기 — 같은 서류 에이전트로 */}
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={onFile} />
        <button className="card helpCard" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
          disabled={busy} onClick={() => fileRef.current?.click()}>
          <div className="ico"><Icon name="doc" size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>{t('help.upload')}</h4>
            <p>{busy ? t('help.analyzing') : t('help.uploadS')}</p>
          </div>
          {busy && <span className="dotsMini"><i /><i /><i /></span>}
        </button>

        <button className="card helpCard" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => dispatch({ type: 'ESCALATE', reason: 'help_request' })}>
          <div className="ico"><Icon name="phone" size={20} /></div>
          <div><h4>{t('help.human')}</h4><p>{t('help.humanS')}</p></div>
        </button>
        <div className="card helpCard" style={{ borderColor: 'var(--app-hold)' }}>
          <div className="ico" style={{ background: 'var(--app-hold-tint)', color: 'var(--app-hold)' }}><Icon name="alert" size={20} /></div>
          <div><h4>{t('help.phish')}</h4><p>{t('help.phishS')}</p></div>
        </div>
      </div>

      {/* 서류 촬영 시트 — 데모는 가상 청구서를 찍는다 */}
      {cam && (
        <div className="micSheetBack" onClick={() => cam === 'aim' && setCam(null)}>
          <div className="docSheet" onClick={(e) => e.stopPropagation()}>
            <div className="chatHead">
              <b>{t('help.scanTitle')}</b>
              <button className="chatClose" aria-label={t('common.close')} onClick={() => setCam(null)}><Icon name="close" size={17} /></button>
            </div>
            <div className="cam" style={{ height: 300 }}>
              <div className="frame" />
              {cam === 'reading' && <div className="billWrap"><img className="docSample" src={SAMPLE_DOC} alt="" /></div>}
              {cam === 'reading' && <div className="scanline" />}
              <span>{cam === 'reading' ? t('help.reading') : t('help.scanGuide')}</span>
            </div>
            <button className="btn agent" onClick={shoot} disabled={cam === 'reading' || busy}>
              {cam === 'reading'
                ? t('help.reading')
                : <><Icon name="camera" size={18} style={{ marginRight: 8 }} />{t('help.shoot')}</>}
            </button>
          </div>
        </div>
      )}

      <NavBar active="help" />
    </>
  )
}
