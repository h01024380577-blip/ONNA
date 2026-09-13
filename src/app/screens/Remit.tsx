import { useEffect, useState } from 'react'
import { useApp } from '../hooks'
import { Icon } from '../Icon'
import { Flag, type FlagCode } from '../Flag'
import { Payslip } from '../Payslip'
import { Logo } from '../Logo'
import { LoanEntry } from './Loan'
import { fmtMMSS } from '../../i18n'
import { FX, fxAdvantagePct, fxLive } from '../../mock/fx'
import { SLA_DEMO_SEC } from '../../store'
import { apiUrl } from '../../lib/api'

/* B0 잠금화면 푸시 — RM-1 */
export function B0() {
  const { state, dispatch, p, t, krw } = useApp()
  const amount = state.proposal?.amount ?? 0
  return (
    <div className="lock">
      <div className="time">18:02</div>
      <div className="date">{t('b0.date')}</div>
      <div className="push">
        <div className="app">
          <Logo size={20} />
          <b className="wmk">ONNA</b>{t('b0.app').replace('ONNA', '')}
        </div>
        <div className="msg">{t('b0.push', { salary: krw(p.salary), amount: krw(amount) })}</div>
        <div className="acts">
          <button className="pri" onClick={() => dispatch({ type: 'NAV', screen: 'B1' })}>{t('b0.send')}</button>
          <button onClick={() => dispatch({ type: 'PROPOSAL_ACTION', action: 'later' })}>{t('b0.later')}</button>
        </div>
      </div>
      <p style={{ opacity: 0.55, fontSize: 12, marginTop: 'auto' }}>{t('b0.note')}</p>
    </div>
  )
}

/** 실시간 환율 — 국적 통화 기준. 수치는 코드 계산, 해석 문장은 에이전트가 생성 */
function FxBlock() {
  const { state, p, t, local } = useApp()
  const fx = FX[p.currency]
  const pct = Number(fxAdvantagePct(p.currency))
  const up = pct >= 0.15
  const down = pct <= -0.15
  const sampleText = local(Math.round(100_000 * fx.rate))

  // 템플릿 문구를 먼저 보여 주고, 에이전트 판단이 오면 교체한다
  const [brief, setBrief] = useState<string | null>(null)
  const lang = state.lang ?? 'ko'
  useEffect(() => {
    let alive = true
    fetch(apiUrl('/api/fx-brief'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        lang,
        quote: p.currency,
        rateText: fx.rateText,
        advantagePct: pct,
        sampleText,
        // 기준선이 실제 90일 평균인지 고정값인지 알려야 문장이 과장되지 않는다
        basis: fx.avgReal ? '90d-average' : 'reference',
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (alive && d?.text) setBrief(d.text) })
      .catch(() => { /* 템플릿 문구 유지 */ })
    return () => { alive = false }
  }, [lang, p.currency, fx.rateText, pct, sampleText])

  const template = up ? t('fx.better', { pct: Math.abs(pct) })
    : down ? t('fx.worse', { pct: Math.abs(pct) })
    : t('fx.same')

  return (
    <div className="fxBlock">
      <div className="fxTop">
        <span className="fxLabel">
          {t('fx.today')}
          {fxLive.on && <i className="fxLive">{t('fx.live')}</i>}
        </span>
        <span className={`fxDelta ${up ? 'up' : down ? 'down' : ''}`}>
          {up && <Icon name="chevron" size={13} strokeWidth={2.6} style={{ transform: 'rotate(-90deg)' }} />}
          {down && <Icon name="chevron" size={13} strokeWidth={2.6} style={{ transform: 'rotate(90deg)' }} />}
          {pct > 0 ? `+${pct}` : pct}%
        </span>
      </div>
      <div className="fxRate">₩1 = <b>{fx.rateText}</b></div>
      <div className="fxSample">{t('fx.sample', { local: sampleText })}</div>
      {/* 증감률이 "무엇 대비"인지 명시 — 통화마다 기준선 출처가 다르다 */}
      <div className="fxBasis">{fx.avgReal ? t('fx.basisReal') : t('fx.basisFixed')}</div>
      <div className="fxBrief">
        <Logo size={17} />
        <span>{brief ?? template}</span>
      </div>
    </div>
  )
}

/* B1 홈 + 제안 카드 — RM-2/3/4: 3버튼 동일 크기, 근거 문장 */
export function B1() {
  const { state, dispatch, p, t, krw, local } = useApp()
  const fx = FX[p.currency]
  const months = p.monthsEmployed
  const remits = p.remitCount + state.sessionRemits
  const credit = Math.max(0, p.monthsToCredit)
  const pct = Math.round(((6 - credit) / 6) * 100)

  return (
    <>
      <div className="appBody">
        <div className="homeHead">
          <span className="brand"><b>iM Bank</b><i>·</i><Logo size={20} /><b className="wmk">ONNA</b></span>
          <button className="bellBtn" aria-label="notifications"><Icon name="bell" size={19} /><i /></button>
        </div>
        <p style={{ color: 'var(--app-muted)', margin: '10px 0 2px' }}>{t('b1.hi', { name: p.name })}</p>
        {state.salaryEvent && <div className="h1" style={{ margin: '0 0 12px', fontSize: 22 }}>{t('b1.payday')}</div>}

        {state.proposal?.status === 'new' && (
          <div className="agentcard">
            <div className="who"><Logo size={24} /><b className="wmk">ONNA</b></div>
            <p className="say">{t('b1.say', { amount: krw(state.proposal.amount) })}</p>
            <p className="why">{t('b1.why', { rate: fx.rateText, pct: fxAdvantagePct(p.currency), floor: krw(state.livingFloor) })}</p>
            <div className="money" style={{ fontSize: 27 }}>
              {krw(state.proposal.amount)}
              <small>≈ {local(Math.round(state.proposal.amount * fx.rate))}</small>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn agent sm" onClick={() => { dispatch({ type: 'SET_DRAFT', amount: state.proposal!.amount }); dispatch({ type: 'PROPOSAL_ACTION', action: 'send' }) }}>{t('b1.send')}</button>
              <button className="btn ghost sm" onClick={() => dispatch({ type: 'PROPOSAL_ACTION', action: 'change' })}>{t('b1.change')}</button>
              <button className="btn ghost sm" onClick={() => dispatch({ type: 'PROPOSAL_ACTION', action: 'later' })}>{t('b1.later')}</button>
            </div>
          </div>
        )}
        {state.proposal?.status === 'snoozed' && (
          <div className="card"><p>{t('b1.snoozed')}</p></div>
        )}
        {!state.proposal && state.tx && state.tx.status !== 'cancelled' && (
          <div className="card accent">
            <h4>{t('b5.title')}</h4>
            <p>{t('b1.sent', { amount: krw(state.tx.amount) })}</p>
            {state.tx.status === 'arrived' && <div style={{ marginTop: 8 }}><span className="badge ok">{t('b5.arrived')}</span></div>}
          </div>
        )}
        {!state.proposal && !state.tx && (
          <div className="agentcard">
            <div className="who"><Logo size={24} /><b className="wmk">ONNA</b></div>
            <p className="say long">{t('a6.agentSay')}</p>
          </div>
        )}

        <FxBlock />

        <div className="card">
          <h4>{t('b1.myMoney')}</h4>
          <div className="kv"><span className="k">{t('b1.bal')}</span>
            <span className="v">{krw(state.balance)}<small>≈ {local(Math.round(state.balance * fx.rate))}</small></span></div>
          <div className="kv"><span className="k">{t('b1.thisMonth')}</span><span className="v">{krw(state.sentThisMonth)}</span></div>
        </div>

        <button className="card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => dispatch({ type: 'NAV', screen: 'C1' })}>
          <h4>{t('b1.myHist')}</h4>
          {state.onboarding.employer === 'none'
            ? <p>{t('b1.linkEmployer')}</p>
            : <p>{t('b1.hist', { m: months, n: remits })}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div className="meter" style={{ flex: 1 }}><i style={{ width: `${pct}%` }} /></div>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--app-ok)' }}>{pct}%</span>
          </div>
          <p style={{ fontSize: 12.5 }}>{t('b1.untilCredit', { k: credit })}</p>
        </button>

        <LoanEntry />

        <button className="card helpCard" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => dispatch({ type: 'NAV', screen: 'HELP' })}>
          <div className="ico"><Icon name="chat" size={20} /></div>
          <div><h4>{t('help.human')}</h4><p>{t('help.humanS')}</p></div>
          <span className="r" style={{ marginLeft: 'auto', alignSelf: 'center' }}><Icon name="chevron" size={16} /></span>
        </button>
      </div>
      <NavBar active="home" />
    </>
  )
}

/* B2 금액 변경 — RM-5: 키패드·칩·이중 통화·생활비 게이지(경고만, 막지 않음) */
export function B2() {
  const { state, dispatch, p, t, krw, local } = useApp()
  const fx = FX[p.currency]
  const amount = state.draftAmount
  const chips = [500_000, 600_000, 800_000, 1_000_000]
  const salary = state.salaryEvent?.amount ?? p.salary
  const left = salary - p.autoDebit - amount
  const tight = left < state.livingFloor
  const gauge = Math.max(4, Math.min(100, Math.round((left / salary) * 100)))

  const key = (k: string) => {
    if (k === '⌫') dispatch({ type: 'SET_DRAFT', amount: Math.floor(amount / 10) })
    else if (k === '000') dispatch({ type: 'SET_DRAFT', amount: Math.min(99_000_000, amount * 1000) })
    else dispatch({ type: 'SET_DRAFT', amount: Math.min(99_000_000, amount * 10 + Number(k)) })
  }

  return (
    <>
      <div className="appBody">
        <div className="h1">{t('b2.title')}</div>
        <div className="recipCard">
          <div className="avat" style={{ background: 'none' }}><Flag code={p.lang as FlagCode} size={40} /></div>
          <span style={{ fontWeight: 600, fontSize: 14.5 }}>
            {p.beneficiary.name}
            <span className="sub">{p.beneficiary.bank} {p.beneficiary.masked}</span>
          </span>
          <span className="relTag">{t('rel.mother')}</span>
        </div>
        <div className="card center">
          <div className="money">{krw(amount)}<small>≈ {local(Math.round(amount * fx.rate))}</small></div>
          <div className="chips">
            {chips.map((c) => (
              <button key={c} className={amount === c ? 'on' : ''} onClick={() => dispatch({ type: 'SET_DRAFT', amount: c })}>
                {c.toLocaleString()}
              </button>
            ))}
          </div>
          <div className="meter"><i className={tight ? 'warn' : ''} style={{ width: `${gauge}%` }} /></div>
          <p className={`gaugeNote ${tight ? 'warn' : ''}`}>
            {t(tight ? 'b2.leftTight' : 'b2.leftOk', { left: krw(Math.max(0, left)) })}
          </p>
        </div>
        <div className="note amber">
          <Logo size={20} />
          <span>{t('b1.why', { rate: fx.rateText, pct: fxAdvantagePct(p.currency), floor: krw(state.livingFloor) })}</span>
        </div>
      </div>
      {/* 키패드는 본문 스크롤 밖에 둔다 — 안에 두면 언어에 따라 안내 문구가 길어질 때
          마지막 줄(000·0·⌫)이 CTA에 가려 잘린다 */}
      <div className="appFoot">
        <div className="keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'].map((k) => (
            <button key={k} onClick={() => key(k)} aria-label={k === '⌫' ? t('common.back') : undefined}>
              {k === '⌫' ? <Icon name="backspace" size={22} style={{ margin: '0 auto' }} /> : k}
            </button>
          ))}
        </div>
        <button className="btn" disabled={amount <= 0} onClick={() => dispatch({ type: 'NAV', screen: 'B3' })}>
          {t('b2.apply')}<Icon name="chevron" size={17} style={{ marginLeft: 4 }} />
        </button>
      </div>
    </>
  )
}

/* B3 확정 시트 — RM-6: 수수료 비교·규정 배지·취소창·생체인증 */
export function B3() {
  const { state, dispatch, p, t, krw, local } = useApp()
  const fx = FX[p.currency]
  const [bio, setBio] = useState(false)
  const amount = state.draftAmount
  const rel = t('rel.mother')
  const run = () => {
    setBio(true)
    setTimeout(() => { setBio(false); dispatch({ type: 'EXECUTE' }) }, 1400)
  }
  return (
    <>
      <div className="sheetWrap">
        <div className="sheet">
          <div className="grab" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="h1" style={{ fontSize: 20, margin: 0 }}>{t('b3.titleRel', { rel })}</div>
            <span className="relTag" style={{ marginLeft: 0 }}>{rel}</span>
          </div>
          <div className="kv"><span className="k">{t('b3.to')}</span>
            <span className="v">{p.beneficiary.name}<small>{p.beneficiary.bank} {p.beneficiary.masked}</small></span></div>
          <div className="kv"><span className="k">{t('b3.sendAmt')}</span><span className="v">{krw(amount)}</span></div>
          <div className="kv"><span className="k">{t('b3.recvAmt')}</span>
            <span className="v" style={{ color: 'var(--app-primary)', fontSize: 17, fontWeight: 800 }}>
              {local(Math.round(amount * fx.rate))}<small>₩1 = {fx.rateText}</small></span></div>
          <div className="kv"><span className="k">{t('b3.fee')}</span>
            <span className="v">{krw(3000)}<small style={{ color: 'var(--app-ok)', fontWeight: 600 }}>{t('b3.feeNote', { delta: krw(12000) })}</small></span></div>
          <div className="kv"><span className="k">{t('b3.eta')}</span><span className="v">{t(`eta.${fx.etaKey}`)}</span></div>
          <div className="kv"><span className="k">{t('b3.check')}</span>
            <span className="v"><span className="badge ok">{t('b3.pass')}</span></span></div>
          <div className="note mint" style={{ margin: '10px 0 12px' }}>
            <Icon name="restart" size={15} strokeWidth={2.1} />
            <span>{fx.cancelMin > 0 ? t('b3.cancelNote', { min: fx.cancelMin }) : t('b3.cancelNone')}</span>
          </div>
          <button className="btn" onClick={run}><Icon name="finger" size={19} style={{ marginRight: 8 }} />{t('b3.btn')}</button>
        </div>
      </div>
      {bio && (
        <div className="bioOverlay">
          <div className="bioCard"><div className="fp" /><p>{t('b3.bio')}</p></div>
        </div>
      )}
    </>
  )
}

/* B4 규정 점검 결과 — RM-7 통과 / RM-8·9 보류 (금지어 없음, 주 버튼 민트) */
export function B4() {
  const { state, dispatch, p, t, krw } = useApp()
  const c = state.compliance
  const [docCam, setDocCam] = useState<null | 'aim' | 'scanning'>(null)
  const shoot = () => {
    if (docCam === 'scanning') return
    setDocCam('scanning')
    setTimeout(() => { setDocCam(null); dispatch({ type: 'DOC_UPLOAD' }) }, 1800)
  }
  if (!c) return null

  if (c.result === 'PASS') {
    return (
      <>
        <div className="appBody">
          <div className="shield ok"><Icon name="check" size={38} /></div>
          <div className="h1 center" style={{ fontSize: 21 }}>{t('b4.passTitle')}</div>
          <p className="lead center">{t('b4.passLead')}</p>
          <div className="card">
            <div className="kv"><span className="k">{t('b4.decl')}</span><span className="v">{t('b4.declV')}</span></div>
            <div className="kv"><span className="k">{t('b4.ref')}</span><span className="v" style={{ fontFamily: 'var(--mono)' }}>{c.refNo}</span></div>
          </div>
        </div>
        <div className="appFoot">
          <button className="btn" onClick={() => dispatch({ type: 'SEND_FINAL' })}>
            {t('b4.go')}<Icon name="chevron" size={17} style={{ marginLeft: 4 }} />
          </button>
        </div>
      </>
    )
  }

  const reasonKey = c.code === 'HOLD_DOC_INCOME' ? 'b4.holdDoc' : c.code === 'HOLD_BENEFICIARY_NEW' ? 'b4.holdNew' : 'b4.holdLimit'
  const half1 = Math.round(state.draftAmount / 2 / 10000) * 10000
  const half2 = state.draftAmount - half1

  return (
    <>
      <div className="appBody">
        <div className="shield hold"><Icon name="alert" size={36} /></div>
        <div className="h1 center" style={{ fontSize: 21 }}>{t('b4.holdTitle')}</div>
        <p className="lead center">{t(reasonKey)}</p>
        <div className="note amber"><Icon name="shield" size={16} /><span style={{ fontWeight: 600 }}>{t('b4.money')}</span></div>

        {c.docUploaded ? (
          <div className="card accent">
            <h4>{t('b4.opt1')}</h4>
            <p>{t('b4.uploaded')}</p>
            <div style={{ marginTop: 8 }}><span className="badge wait"><Icon name="refresh" size={13} strokeWidth={2.2} /> {t('a4.waiting')}</span></div>
          </div>
        ) : (
          <div className="card">
            <h4>{t('b4.can')}</h4>
            <button className="item" style={{ padding: '10px 0' }} onClick={() => setDocCam('aim')}>
              <div className="ico"><Icon name="doc" size={19} /></div>
              <span style={{ fontWeight: 600 }}>{t('b4.opt1')}<span className="sub">{t('b4.opt1s', { sla: SLA_DEMO_SEC })}</span></span>
              <span className="r"><Icon name="chevron" size={16} /></span>
            </button>
            <button className="item" style={{ padding: '10px 0' }}
              onClick={() => { dispatch({ type: 'SET_DRAFT', amount: half1 }); dispatch({ type: 'NAV', screen: 'B3' }) }}>
              <div className="ico"><Icon name="send" size={19} /></div>
              <span style={{ fontWeight: 600 }}>{t('b4.opt2')}<span className="sub">{t('b4.opt2s', { half1: krw(half1), half2: krw(half2) })}</span></span>
              <span className="r"><Icon name="chevron" size={16} /></span>
            </button>
            <button className="item" style={{ padding: '10px 0' }} onClick={() => dispatch({ type: 'ESCALATE', reason: 'compliance_hold' })}>
              <div className="ico"><Icon name="phone" size={19} /></div>
              <span style={{ fontWeight: 600 }}>{t('b4.opt3')}<span className="sub">{t('b4.opt3s')}</span></span>
              <span className="r"><Icon name="chevron" size={16} /></span>
            </button>
          </div>
        )}
      </div>
      {!c.docUploaded && (
        <div className="appFoot">
          <button className="btn agent" onClick={() => setDocCam('aim')}>
            <Icon name="doc" size={18} style={{ marginRight: 8 }} />{t('b4.opt1')}
          </button>
        </div>
      )}

      {/* C2 서류 촬영 — 급여명세서를 프레임에 맞춰 자동 촬영 */}
      {docCam && (
        <div className="micSheetBack" onClick={() => docCam === 'aim' && setDocCam(null)}>
          <div className="docSheet" onClick={(e) => e.stopPropagation()}>
            <div className="chatHead">
              <b>{t('b4.scanTitle')}</b>
              <button className="chatClose" aria-label={t('common.close')} onClick={() => setDocCam(null)}><Icon name="close" size={17} /></button>
            </div>
            <div className="cam" style={{ height: 300 }}>
              <div className="frame" />
              {docCam === 'scanning' && <div className="payslipWrap"><Payslip p={p} /></div>}
              {docCam === 'scanning' && <div className="scanline" />}
              <span>{docCam === 'scanning' ? t('b4.scanning') : t('b4.scanGuide')}</span>
            </div>
            <div className="note amber"><Icon name="shield" size={16} /><span>{t('b4.scanPrivacy')}</span></div>
            <button className="btn agent" onClick={shoot} disabled={docCam === 'scanning'}>
              {docCam === 'scanning'
                ? t('b4.scanning')
                : <><Icon name="camera" size={18} style={{ marginRight: 8 }} />{t('b4.scanBtn')}</>}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/* B5 보냈어요 — RM-11/13: 가족 알림(언어권별 채널 순서), 이력 갱신, B7 제안 */
export function B5() {
  const { state, dispatch, p, t, krw, local } = useApp()
  const fx = FX[p.currency]
  const tx = state.tx
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  if (!tx) return null
  const rel = t('rel.mother')
  const remits = p.remitCount + state.sessionRemits
  const cancelLeft = tx.cancelUntil - Date.now()

  return (
    <>
      <div className="appBody">
        <div className="shield ok"><Icon name="check" size={38} /></div>
        <div className="h1 center">{t('b5.title')}</div>
        <div className="card center">
          <div className="money">{local(tx.receive)}<small>{krw(tx.amount)} · {t(`eta.${fx.etaKey}`)}</small></div>
          {tx.status === 'arrived' && <div style={{ marginTop: 8 }}><span className="badge ok">{t('b5.arrived')}</span></div>}
        </div>

        <div className="sharecard">
          <p className="say">{t('b5.shareQ', { rel })}</p>
          <p className="why">{t('b5.shareWhy', { rel })}</p>
          {tx.sharedVia ? (
            <span className="badge ok"><Icon name="check" size={13} strokeWidth={2.6} /> {t('b5.shared')} — {tx.sharedVia}</span>
          ) : (
            <div className="row" style={{ marginTop: 6 }}>
              {p.channels.slice(0, 3).map((ch, i) => (
                <button key={ch} className={`btn sm ${i === 0 ? '' : 'ghost'}`}
                  onClick={() => dispatch({ type: 'SHARE_FAMILY', channel: ch })}>{ch}</button>
              ))}
            </div>
          )}
        </div>

        <div className="card accent">
          <h4>{t('b5.histUp')}</h4>
          <p>{t('b5.histUpS', { n: remits, k: p.monthsToCredit })}</p>
          <div className="meter"><i style={{ width: `${Math.round(((6 - p.monthsToCredit) / 6) * 100)}%` }} /></div>
        </div>

        {!state.rule && (
          <div className="card">
            <h4>{t('b5.ruleQ')}</h4>
            <p>{t('b5.ruleS', { amount: krw(tx.amount), fx: FX[p.currency].fxMinText })}</p>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn ghost sm" onClick={() => dispatch({ type: 'NAV', screen: 'B7' })}>{t('b5.makeRule')}</button>
              <button className="btn ghost sm" onClick={() => dispatch({ type: 'NAV', screen: 'B1' })}>{t('b5.no')}</button>
            </div>
          </div>
        )}

        {tx.status === 'processing' && cancelLeft > 0 && (
          <button className="btn ghost" onClick={() => dispatch({ type: 'CANCEL_TX' })}>
            {t('b5.cancelBtn', { t: fmtMMSS(cancelLeft) })}
          </button>
        )}
      </div>
      <NavBar active="home" />
    </>
  )
}

/* B7 정기송금 규칙 — RM-14: 제안만, 자동 실행 없음 */
export function B7() {
  const { state, dispatch, p, t, krw } = useApp()
  const fx = FX[p.currency]
  const amount = state.tx?.amount ?? state.draftAmount ?? 600_000
  const rows: Array<[string, string]> = [
    [t('b7.when'), t('b7.whenV')],
    [t('b7.amt'), krw(amount)],
    [t('b7.fx'), t('b7.fxV', { fx: fx.fxMinText })],
    [t('b7.to'), `${t('rel.mother')} (${p.beneficiary.bank})`],
    [t('b7.floor'), t('b7.floorV', { floor: krw(state.livingFloor) })],
  ]
  return (
    <>
      <div className="appBody">
        <div className="h1">{t('b7.title')}</div>
        <div className="note amber"><Icon name="alert" size={16} strokeWidth={2} /><span>{t('b7.lead')}</span></div>
        <div className="list">
          {rows.map(([k, v]) => (
            <div className="item" key={k}>
              <span style={{ fontWeight: 600 }}>{k}<span className="sub">{v}</span></span>
              <span className="r" style={{ color: 'var(--app-primary)', fontWeight: 600 }}>{t('b7.change')}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="appFoot">
        <button className="btn" onClick={() => dispatch({ type: 'RULE_SAVE' })}>{t('b7.save')}</button>
      </div>
    </>
  )
}

/* 하단 내비게이션 */
export function NavBar({ active }: { active: 'home' | 'send' | 'record' | 'help' }) {
  const { dispatch, t } = useApp()
  return (
    <div className="navbar">
      <button className={active === 'home' ? 'on' : ''} onClick={() => dispatch({ type: 'NAV', screen: 'B1' })}><Icon name="home" size={23} /><span>{t('b1.navHome')}</span></button>
      <button className={active === 'send' ? 'on' : ''} onClick={() => dispatch({ type: 'NAV', screen: 'B2' })}><Icon name="send" size={23} /><span>{t('b1.navSend')}</span></button>
      <button className="micBtn" aria-label={t('chat.title')} onClick={() => window.dispatchEvent(new CustomEvent('onna:chat'))}><span className="wmk">ONNA</span></button>
      <button className={active === 'record' ? 'on' : ''} onClick={() => dispatch({ type: 'NAV', screen: 'C1' })}><Icon name="record" size={23} /><span>{t('b1.navRecord')}</span></button>
      <button className={active === 'help' ? 'on' : ''} onClick={() => dispatch({ type: 'NAV', screen: 'HELP' })}><Icon name="help" size={23} /><span>{t('b1.navHelp')}</span></button>
    </div>
  )
}
