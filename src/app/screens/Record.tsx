import { useState } from 'react'
import { useApp } from '../hooks'
import { Icon } from '../Icon'
import { Logo } from '../Logo'
import { Bill, BILL } from '../Bill'
import { LoanEntry } from './Loan'
import { NavBar } from './Remit'

/* C1 내 기록 — CR-1/2: 요약 + 진행 바 + 월별 타임라인 + 검증됨 배지 */
export function C1() {
  const { state, p, t } = useApp()
  const remits = p.remitCount + state.sessionRemits
  const credit = p.monthsToCredit
  const pct = Math.round(((6 - credit) / 6) * 100)
  const employerOk = state.onboarding.employer === 'verified'

  // 최근 6개월 타임라인 (기준: 2026.09)
  const months: Array<{ label: string; salary: boolean; remit: number; utility: boolean }> = []
  for (let i = 0; i < 6; i++) {
    const m = 9 - i
    const label = m > 0 ? `2026.${String(m).padStart(2, '0')}` : `2025.${String(12 + m).padStart(2, '0')}`
    if (i === 0) {
      months.push({ label, salary: !!state.salaryEvent, remit: state.sessionRemits, utility: false })
    } else {
      months.push({ label, salary: true, remit: i % 3 === 0 ? 1 : 2, utility: true })
    }
  }

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
      </div>
      <NavBar active="record" />
    </>
  )
}

/* HELP — C2: 서류 촬영(최상단) → 온나가 읽어 주고 행동 제안, AG-6 사람 연결 */
export function Help() {
  const { dispatch, t, krw } = useApp()
  const [cam, setCam] = useState<null | 'aim' | 'reading'>(null)
  const [result, setResult] = useState(false)
  const [koPhrase, setKoPhrase] = useState(false)
  const [autoPaid, setAutoPaid] = useState(false)

  const shoot = () => {
    if (cam === 'reading') return
    setCam('reading')
    setTimeout(() => {
      setCam(null)
      setResult(true)
      setKoPhrase(false)
      setAutoPaid(false)
    }, 1900)
  }

  return (
    <>
      <div className="appBody">
        <div className="h1">{t('help.title')}</div>

        {/* 서류 사진 찍어 물어보기 — 화면 최상단 */}
        {!result ? (
          <button className="dropzone" onClick={() => setCam('aim')}>
            <Icon name="camera" size={26} />
            <h4>{t('help.doc')}</h4>
            <p style={{ margin: 0, fontSize: 12.5 }}>{t('help.docS')}</p>
          </button>
        ) : (
          <div className="agentcard">
            <div className="who"><Logo size={24} /><b className="wmk">ONNA</b></div>
            <p className="say">{t('help.resultKind')}</p>
            <p className="why" style={{ fontSize: 14.5, color: 'var(--app-ink)', fontWeight: 600, margin: '0 0 6px' }}>
              {t('help.resultSay', { month: BILL.month, amount: krw(BILL.amount), due: BILL.due })}
            </p>
            <p className="why">{t('help.resultWhy')}</p>

            {autoPaid && (
              <div className="note mint" style={{ margin: '10px 0 0' }}>
                <Icon name="check" size={15} strokeWidth={2.4} /><span>{t('help.autoPayDone')}</span>
              </div>
            )}
            {koPhrase && (
              <div className="card" style={{ margin: '10px 0 0' }}>
                <p style={{ fontSize: 14.5, color: 'var(--app-ink)', fontWeight: 600, lineHeight: 1.5 }}>{t('help.koPhrase')}</p>
                <p style={{ marginTop: 6 }}>{t('help.koPhraseHint')}</p>
              </div>
            )}

            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn agent sm" disabled={autoPaid} onClick={() => setAutoPaid(true)}>{t('help.autoPay')}</button>
              <button className="btn ghost sm" onClick={() => setKoPhrase(!koPhrase)}>{t('help.makeKo')}</button>
            </div>
            <button className="btn ghost sm" style={{ marginTop: 8, width: '100%' }} onClick={() => { setResult(false); setCam('aim') }}>
              <Icon name="camera" size={16} style={{ marginRight: 6 }} />{t('help.again')}
            </button>
          </div>
        )}

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

      {/* 서류 촬영 시트 */}
      {cam && (
        <div className="micSheetBack" onClick={() => cam === 'aim' && setCam(null)}>
          <div className="docSheet" onClick={(e) => e.stopPropagation()}>
            <div className="chatHead">
              <b>{t('help.scanTitle')}</b>
              <button className="chatClose" aria-label={t('common.close')} onClick={() => setCam(null)}><Icon name="close" size={17} /></button>
            </div>
            <div className="cam" style={{ height: 300 }}>
              <div className="frame" />
              {cam === 'reading' && <div className="billWrap"><Bill /></div>}
              {cam === 'reading' && <div className="scanline" />}
              <span>{cam === 'reading' ? t('help.reading') : t('help.scanGuide')}</span>
            </div>
            <button className="btn agent" onClick={shoot} disabled={cam === 'reading'}>
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
