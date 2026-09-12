import { useStore } from '../store'
import { PERSONAS } from '../mock/personas'
import { makeT, fmtLocal } from '../i18n'
import { FX } from '../mock/fx'

/* B6 가족 수령 페이지 — RM-12: 수취인 언어, 앱 불필요, 만료형 링크, 개인정보 최소 */
export function FamilyPhone({ frameless = false }: { frameless?: boolean }) {
  const { state } = useStore()
  const p = PERSONAS[state.personaId]
  const t = makeT(p.lang) // 항상 수취인 언어
  const tx = state.tx
  const fx = FX[p.currency]
  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const inner = (
      <div className={`screen ${frameless ? 'frameless' : ''}`} data-lang={p.lang}>
        {frameless
          ? <div className="safeTop" />
          : <div className="statusbar"><span>20:03</span><span className="sig">●●● ▲ ▮</span></div>}
        <div className="web">
          <div className="urlbar">onna.imbank.co.kr/r/{tx ? tx.id.slice(-5) : '—'}</div>
          {tx && tx.status !== 'cancelled' ? (
            <div className="webBody">
              <p style={{ color: 'var(--app-muted)', margin: '4px 0 8px', fontSize: 13 }}>
                <b className="wmk">ONNA</b> · iM Bank
              </p>
              <div className="h1">{t('b6.title', { name: p.name })}</div>
              <div className="money">{fmtLocal(tx.receive, p.currency)}</div>
              <p style={{ color: 'var(--app-muted)', fontSize: 14, margin: '6px 0 12px' }}>{t('b6.sub')}</p>
              <div className="tl">
                <div className="tlRow"><i /><span>{t('b6.t1')}<small>{fmtTime(tx.at)}</small></span></div>
                <div className="tlRow"><i /><span>{t('b6.t2')}<small>{fmtTime(tx.at + 120_000)}</small></span></div>
                <div className="tlRow">
                  <i className={tx.status === 'arrived' ? '' : 'todo'} />
                  <span>
                    {tx.status === 'arrived' ? t('b6.arrived') : t('b6.t3', { bank: p.beneficiary.bank })}
                    <small>{tx.status === 'arrived' ? fmtTime(Date.now()) : t('b6.t3eta', { eta: t(`eta.${fx.etaKey}`) })}</small>
                  </span>
                </div>
              </div>
              <div className="card"><p style={{ fontSize: 14.5 }}>{t('b6.noapp')}</p></div>
              <p style={{ fontSize: 14, color: 'var(--app-primary)', fontWeight: 600 }}>{t('b6.notyet')}</p>
              <p style={{ fontSize: 12.5, color: 'var(--app-muted)' }}>{t('b6.expire')}</p>
            </div>
          ) : (
            <div className="webBody center" style={{ margin: 'auto 0', color: 'var(--app-muted)' }}>
              <p>{t('b6.empty')}</p>
            </div>
          )}
        </div>
      </div>
  )

  return frameless ? inner : <div className="phone">{inner}</div>
}
