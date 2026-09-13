import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { PERSONAS } from '../mock/personas'
import { makeT, fmtLocal } from '../i18n'
import { FX } from '../mock/fx'
import { Icon } from '../app/Icon'

/* 가족 화면 — 근로자가 메신저로 보낸 메시지가 먼저 도착하고, 그 안의 링크를 눌러야
   수령 페이지(B6)가 열린다. 실제 가족이 겪는 순서가 그대로 보이도록 분리했다.
   RM-12: 수취인 언어, 앱 설치 불필요, 만료형 링크, 개인정보 최소. */

type MsgKind = 'shared' | 'arrived'

export function FamilyPhone() {
  const { state, dispatch } = useStore()
  const p = PERSONAS[state.personaId]
  const t = makeT(p.lang) // 항상 수취인 언어
  const tx = state.tx
  const fx = FX[p.currency]
  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const live = tx && tx.status !== 'cancelled'
  const shared = live && tx.sharedVia ? tx : null
  const channel = shared?.sharedVia ?? p.channels[0]

  const msgs: Array<{ kind: MsgKind; at: number; unread: boolean }> = []
  if (shared) msgs.push({ kind: 'shared', at: shared.sharedAt ?? shared.at, unread: !state.familyRead?.shared })
  if (shared && shared.status === 'arrived')
    msgs.push({ kind: 'arrived', at: shared.arrivedAt ?? Date.now(), unread: !state.familyRead?.arrived })

  const [open, setOpen] = useState(false) // 수령 페이지를 열었는가

  // 송금이 취소·초기화되면 목록으로 되돌린다
  useEffect(() => { if (!shared) setOpen(false) }, [!!shared])

  const openLink = (kind: MsgKind) => {
    dispatch({ type: 'FAMILY_READ', kind })
    setOpen(true)
  }

  /* ---- 수령 페이지(B6) — 메시지의 링크를 눌렀을 때 ---- */
  if (open && shared) {
    return (
      <div className="screen frameless" data-lang={p.lang}>
        <div className="safeTop" />
        <div className="web">
          <div className="urlbar">
            <button className="urlBack" aria-label={t('common.back')} onClick={() => setOpen(false)}>
              <Icon name="back" size={16} strokeWidth={2.2} />
            </button>
            <span>onna.imbank.co.kr/r/{shared.id.slice(-5)}</span>
          </div>
          <div className="webBody">
            <p style={{ color: 'var(--app-muted)', margin: '4px 0 8px', fontSize: 13 }}>
              <b className="wmk">ONNA</b> · iM Bank
            </p>
            <div className="h1">{t('b6.title', { name: p.name })}</div>
            <div className="money">{fmtLocal(shared.receive, p.currency)}</div>
            <p style={{ color: 'var(--app-muted)', fontSize: 14, margin: '6px 0 12px' }}>{t('b6.sub')}</p>
            <div className="tl">
              <div className="tlRow"><i /><span>{t('b6.t1')}<small>{fmtTime(shared.at)}</small></span></div>
              <div className="tlRow"><i /><span>{t('b6.t2')}<small>{fmtTime(shared.at + 120_000)}</small></span></div>
              <div className="tlRow">
                <i className={shared.status === 'arrived' ? '' : 'todo'} />
                <span>
                  {shared.status === 'arrived' ? t('b6.arrived') : t('b6.t3', { bank: p.beneficiary.bank })}
                  <small>{shared.status === 'arrived' ? fmtTime(shared.arrivedAt ?? Date.now()) : t('b6.t3eta', { eta: t(`eta.${fx.etaKey}`) })}</small>
                </span>
              </div>
            </div>
            <div className="card"><p style={{ fontSize: 14.5 }}>{t('b6.noapp')}</p></div>
            <p style={{ fontSize: 14, color: 'var(--app-primary)', fontWeight: 600 }}>{t('b6.notyet')}</p>
            <p style={{ fontSize: 12.5, color: 'var(--app-muted)' }}>{t('b6.expire')}</p>
          </div>
        </div>
      </div>
    )
  }

  /* ---- 메시지함 — 근로자가 보낸 메신저 화면 ---- */
  return (
    <div className="screen frameless famScreen" data-lang={p.lang}>
      <div className="safeTop" />
      <div className="famHead">
        <span className="famAvat">{p.name[0]}</span>
        <span className="famWho">
          <b>{p.name}</b>
          <small>{channel}</small>
        </span>
      </div>

      <div className="famBody">
        {msgs.length === 0 ? (
          <p className="famEmpty">{t('fam.empty')}</p>
        ) : (
          msgs.map((m) => (
            <div key={m.kind} className={`famMsg ${m.unread ? 'unread' : ''}`}>
              <p className="famText">
                {m.kind === 'shared'
                  ? t('fam.msgShared', { name: p.name, amount: fmtLocal(shared!.receive, p.currency) })
                  : t('fam.msgArrived', { bank: p.beneficiary.bank })}
              </p>
              <button className="famLink" onClick={() => openLink(m.kind)}>
                <span className="famLinkIco"><b className="wmk">ONNA</b></span>
                <span className="famLinkTxt">
                  <b>{t('fam.linkTitle')}</b>
                  <small>onna.imbank.co.kr/r/{shared!.id.slice(-5)}</small>
                </span>
                <Icon name="chevron" size={16} strokeWidth={2.2} />
              </button>
              <span className="famTime">{fmtTime(m.at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
