import { useState } from 'react'
import { useApp } from '../hooks'
import { Icon } from '../Icon'
import { Logo } from '../Logo'
import { NavBar } from './Remit'
import { FX } from '../../mock/fx'
import { LOAN, loanOffer, monthlyPayment, totalRepay } from '../../mock/loan'

/** 신용 이력 충족 여부 — 페르소나 잔여 개월이 0이거나 데모 토글이 켜진 경우 */
export function useCreditReady() {
  const { state, p } = useApp()
  return state.creditReady || p.monthsToCredit <= 0
}

/* D1 — 기록으로 산출된 한도·금리와 그 근거 */
export function D1() {
  const { state, dispatch, p, t, krw } = useApp()
  const offer = loanOffer(p, state.sessionRemits)
  const remits = p.remitCount + state.sessionRemits

  const rows: Array<[string, string]> = [
    [t('d1.b1', { m: p.monthsEmployed }), t('d1.b1s')],
    [t('d1.b2', { n: remits }), t('d1.b2s')],
    [t('d1.b3'), t('d1.b3s')],
  ]

  return (
    <>
      <div className="appBody">
        <div className="h1">{t('d1.title')}</div>

        <div className="agentcard">
          <div className="who"><Logo size={24} /><b className="wmk">ONNA</b></div>
          <p className="say">{t('d1.say', { name: p.name, limit: krw(offer.limit) })}</p>
          <p className="why">{t('d1.why')}</p>
        </div>

        <div className="card">
          <div className="kv"><span className="k">{t('d1.limit')}</span>
            <span className="v" style={{ fontSize: 17, fontWeight: 800 }}>{krw(offer.limit)}</span></div>
          <div className="kv"><span className="k">{t('d1.rate')}</span>
            <span className="v" style={{ color: 'var(--app-primary)' }}>
              {offer.rate}%<small style={{ color: 'var(--app-ok)', fontWeight: 600 }}>{t('d1.rateNote', { d: offer.discount })}</small>
            </span></div>
        </div>

        <div className="card">
          <h4>{t('d1.basis')}</h4>
          {rows.map(([title, sub]) => (
            <div className="item" style={{ padding: '10px 0' }} key={title}>
              <div className="ico" style={{ background: 'var(--app-ok-tint)', color: 'var(--app-ok)' }}>
                <Icon name="check" size={17} strokeWidth={2.6} />
              </div>
              <span style={{ fontWeight: 600 }}>{title}<span className="sub">{sub}</span></span>
            </div>
          ))}
        </div>

        <div className="note amber"><Icon name="alert" size={16} strokeWidth={2} /><span>{t('d1.note')}</span></div>
      </div>
      <div className="appFoot">
        <button className="btn" onClick={() => {
          dispatch({ type: 'SET_LOAN_DRAFT', amount: Math.min(offer.limit, 1_000_000), months: 12 })
          dispatch({ type: 'NAV', screen: 'D2' })
        }}>
          {t('d1.next')}<Icon name="chevron" size={17} style={{ marginLeft: 4 }} />
        </button>
      </div>
    </>
  )
}

/* D2 — 금액·기간 선택. 월 상환액과 생활비 여유를 즉시 보여 준다 */
export function D2() {
  const { state, dispatch, p, t, krw, local } = useApp()
  const offer = loanOffer(p, state.sessionRemits)
  const { amount, months } = state.loanDraft
  const monthly = amount > 0 ? monthlyPayment(amount, months, offer.rate) : 0
  const over = amount > offer.limit
  // 월급에서 자동이체·상환을 뺀 뒤 남는 생활비
  const left = p.salary - p.autoDebit - monthly
  const tight = left < state.livingFloor
  const steps = [500_000, 1_000_000, 2_000_000, 3_000_000].filter((v) => v <= offer.limit)

  return (
    <>
      <div className="appBody">
        <div className="h1">{t('d2.title')}</div>

        <div className="card center">
          <div className="money">{krw(amount)}<small>≈ {local(Math.round(amount * FX[p.currency].rate))}</small></div>
          <input className="slider" type="range" min={300_000} max={offer.limit} step={100_000}
            value={Math.min(amount, offer.limit)}
            onChange={(e) => dispatch({ type: 'SET_LOAN_DRAFT', amount: Number(e.target.value) })} />
          <div className="chips">
            {steps.map((v) => (
              <button key={v} className={amount === v ? 'on' : ''}
                onClick={() => dispatch({ type: 'SET_LOAN_DRAFT', amount: v })}>
                {(v / 10_000).toLocaleString()}만
              </button>
            ))}
          </div>
          {over && <p className="gaugeNote warn">{t('d2.overLimit', { limit: krw(offer.limit) })}</p>}
        </div>

        <div className="card">
          <h4>{t('d2.term')}</h4>
          <div className="chips" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {LOAN.terms.map((k) => (
              <button key={k} className={months === k ? 'on' : ''}
                onClick={() => dispatch({ type: 'SET_LOAN_DRAFT', months: k })}>
                {t('d2.months', { k })}
              </button>
            ))}
          </div>
        </div>

        <div className="card accent">
          <div className="kv"><span className="k">{t('d2.monthly')}</span>
            <span className="v" style={{ fontSize: 19, fontWeight: 800, color: 'var(--app-primary)' }}>{krw(monthly)}</span></div>
          <p style={{ marginTop: 6 }}>{t('d2.total', { total: krw(totalRepay(monthly, months)) })}</p>
          <div className="meter"><i className={tight ? 'warn' : ''} style={{ width: `${Math.max(4, Math.min(100, Math.round((left / p.salary) * 100)))}%` }} /></div>
          <p className={`gaugeNote ${tight ? 'warn' : ''}`}>
            {tight ? t('d2.tight') : t('d2.safe', { left: krw(Math.max(0, left)) })}
          </p>
        </div>
      </div>
      <div className="appFoot">
        <button className="btn" disabled={amount <= 0 || over}
          onClick={() => dispatch({ type: 'NAV', screen: 'D3' })}>
          {t('d2.apply')}<Icon name="chevron" size={17} style={{ marginLeft: 4 }} />
        </button>
      </div>
    </>
  )
}

/* D3 — 확정 시트(지문) → 실행 후 같은 화면이 완료 상태로 전환 */
export function D3() {
  const { state, dispatch, p, t, krw } = useApp()
  const offer = loanOffer(p, state.sessionRemits)
  const [bio, setBio] = useState(false)
  const loan = state.loan

  const run = () => {
    setBio(true)
    setTimeout(() => { setBio(false); dispatch({ type: 'LOAN_EXECUTE' }) }, 1400)
  }

  if (loan) {
    return (
      <>
        <div className="appBody">
          <div className="shield ok"><Icon name="check" size={38} /></div>
          <div className="h1 center">{t('d3.doneTitle')}</div>
          <div className="card center">
            <div className="money">{krw(loan.amount)}</div>
            <p style={{ marginTop: 4 }}>{t('d3.doneS', { amount: krw(loan.amount) })}</p>
          </div>

          <div className="card accent">
            <h4>{t('d3.plan')}</h4>
            <p>{t('d3.planS', { monthly: krw(loan.monthly), k: loan.months })}</p>
            <div className="kv" style={{ marginTop: 8 }}>
              <span className="k">{t('d3.first')}</span><span className="v">{t('d3.firstV')}</span>
            </div>
          </div>

          <div className="note mint"><Icon name="bell" size={15} /><span>{t('d3.remind')}</span></div>
          <div className="note mint"><Icon name="check" size={15} strokeWidth={2.4} /><span>{t('d3.early')}</span></div>
        </div>
        <NavBar active="home" />
      </>
    )
  }

  const monthly = monthlyPayment(state.loanDraft.amount, state.loanDraft.months, offer.rate)
  return (
    <>
      <div className="sheetWrap">
        <div className="sheet">
          <div className="grab" />
          <div className="h1" style={{ fontSize: 20, marginTop: 0 }}>{t('d3.confirm')}</div>
          <div className="kv"><span className="k">{t('d3.amount')}</span>
            <span className="v" style={{ fontSize: 17, fontWeight: 800 }}>{krw(state.loanDraft.amount)}</span></div>
          <div className="kv"><span className="k">{t('d3.rate')}</span>
            <span className="v">{offer.rate}%<small>{t('d1.rateNote', { d: offer.discount })}</small></span></div>
          <div className="kv"><span className="k">{t('d3.monthly')}</span>
            <span className="v" style={{ color: 'var(--app-primary)', fontWeight: 800 }}>{krw(monthly)}</span></div>
          <div className="kv"><span className="k">{t('d3.term')}</span>
            <span className="v">{t('d2.months', { k: state.loanDraft.months })}<small>{t('d2.total', { total: krw(totalRepay(monthly, state.loanDraft.months)) })}</small></span></div>
          <div className="kv"><span className="k">{t('d3.first')}</span><span className="v">{t('d3.firstV')}</span></div>
          <div className="note mint" style={{ margin: '10px 0 12px' }}>
            <Icon name="check" size={15} strokeWidth={2.4} /><span>{t('d3.early')}</span>
          </div>
          <button className="btn" onClick={run}><Icon name="finger" size={19} style={{ marginRight: 8 }} />{t('d3.btn')}</button>
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

/** 홈·기록 화면에 붙는 "대출 알아보기" 진입 카드 */
export function LoanEntry() {
  const { dispatch, t } = useApp()
  const ready = useCreditReady()
  if (!ready) return null
  return (
    <button className="card accent" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
      onClick={() => dispatch({ type: 'NAV', screen: 'D1' })}>
      <div className="ico" style={{ background: 'var(--app-ok-tint)', color: 'var(--app-ok)' }}>
        <Icon name="money" size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ margin: '0 0 3px' }}>{t('d.ready')}</h4>
        <p>{t('d.readyS')}</p>
      </div>
      <span className="r" style={{ color: 'var(--app-muted)' }}><Icon name="chevron" size={16} /></span>
    </button>
  )
}
