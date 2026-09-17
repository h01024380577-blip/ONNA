import { useState } from 'react'
import { useApp } from './hooks'
import { Icon, type IconName } from './Icon'
import { FX } from '../mock/fx'
import { MONTHS_SEEDED, sameMonth } from '../mock/ledger'
import type { LedgerEntry, LedgerKind } from '../types'

/* 기록 탭 — 입출금 내역. 원장(state.ledger)을 월별로 묶어 보여 준다.
   에이전트가 같은 원장을 읽어 "언제 얼마"를 정하므로, 사람이 보는 것과 에이전트가
   보는 것이 같은 데이터다. */

const ICON: Record<LedgerKind, IconName> = {
  salary: 'money', remit: 'send', rent: 'home', utility: 'flash', spend: 'cart', loan: 'doc',
}

export interface MonthGroup {
  y: number
  m0: number
  label: string // YYYY.MM
  entries: LedgerEntry[]
  inSum: number
  outSum: number
}

/** 최근 n개월(이번 달 포함) 월 묶음 — 최신 달이 먼저 */
export function groupByMonth(ledger: LedgerEntry[], now: number, months: number): MonthGroup[] {
  const today = new Date(now)
  const out: MonthGroup[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const y = d.getFullYear()
    const m0 = d.getMonth()
    const entries = ledger.filter((e) => sameMonth(e.at, y, m0))
    out.push({
      y, m0,
      label: `${y}.${String(m0 + 1).padStart(2, '0')}`,
      entries,
      inSum: entries.filter((e) => e.dir === 'in').reduce((a, e) => a + e.amount, 0),
      outSum: entries.filter((e) => e.dir === 'out').reduce((a, e) => a + e.amount + (e.fee ?? 0), 0),
    })
  }
  return out
}

export function Ledger() {
  const { state, p, t, krw, local } = useApp()
  const [shown, setShown] = useState(1)
  const groups = groupByMonth(state.ledger, Date.now(), Math.min(shown, MONTHS_SEEDED + 1))
  const fx = FX[p.currency]
  // 원화 → 본국 통화. 송금은 실제 받은 금액(receive)이 있으니 그걸 쓴다
  const home = (e: LedgerEntry) => local(e.receive ?? Math.round(e.amount * fx.rate))
  const md = (at: number) => {
    const d = new Date(at)
    return `${d.getMonth() + 1}.${d.getDate()}`
  }

  return (
    <>
      {groups.map((g) => (
        <div className="list ledgerMonth" key={g.label}>
          <div className="ledgerHead">
            <span className="mono">{g.label}</span>
            <span className="tot">
              {g.inSum > 0 && <b className="in">+{krw(g.inSum)}</b>}
              {g.outSum > 0 && <b>−{krw(g.outSum)}</b>}
              <small>{t('ledger.count', { n: g.entries.length })}</small>
            </span>
          </div>
          {g.entries.length === 0 && <div className="item"><span style={{ color: 'var(--app-muted)', fontSize: 13.5 }}>{t('ledger.empty')}</span></div>}
          {g.entries.map((e) => (
            <div className="item ledgerRow" key={e.id}>
              <div className="ico" style={e.dir === 'in' ? { background: 'var(--app-ok-tint)', color: 'var(--app-ok)' } : undefined}>
                <Icon name={ICON[e.kind]} size={18} />
              </div>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>{t(`ledger.k.${e.kind}`)}</span>
                <span className="sub">
                  {md(e.at)}
                  {e.kind === 'salary' && ` · ${state.lang === 'ko' ? p.employerKo : p.employer}`}
                  {e.kind === 'remit' && ` · ${p.beneficiary.name}`}
                  {e.memoKey && ` · ${t(e.memoKey)}`}
                  {e.fee ? ` · ${t('ledger.fee', { fee: krw(e.fee) })}` : ''}
                </span>
              </span>
              <span className="r amt" style={{ color: e.dir === 'in' ? 'var(--app-ok)' : 'var(--app-ink)' }}>
                {e.dir === 'in' ? '+' : '−'}{krw(e.amount)}
                <small>{home(e)}</small>
              </span>
            </div>
          ))}
        </div>
      ))}

      <div className="row" style={{ marginBottom: 12 }}>
        {shown <= MONTHS_SEEDED && (
          <button className="btn ghost sm" onClick={() => setShown(shown + 1)}>{t('ledger.more')}</button>
        )}
        {shown > 1 && (
          <button className="btn ghost sm" onClick={() => setShown(1)}>{t('ledger.less')}</button>
        )}
      </div>
    </>
  )
}
