import { useState } from 'react'
import { useApp } from '../hooks'
import { Icon, type IconName } from '../Icon'
import { Qr } from '../Qr'
import { IdCard } from '../IdCard'
import { Face } from '../Face'
import { Logo, LogoHero } from '../Logo'
import { searchCompanies } from '../../mock/companies'
import { NATIONS, PERSONAS } from '../../mock/personas'
import { A6_FALLBACK_ACCT } from '../../store'
import { makeT } from '../../i18n'
import type { PersonaId } from '../../types'

/* A0 국적 선택 — ON-1: 휴대폰 언어 기반 추천 카드, 국기 없음.
   국적이 페르소나를 결정 → 언어·통화·환율·수취인이 함께 바뀐다 */
export function A0() {
  const { state, dispatch } = useApp()
  const selKo = state.lang === 'ko'
  const sel = state.lang !== null && !selKo ? state.personaId : null
  const t = makeT(state.lang ?? 'ko') // 선택 전 기본 한국어, 선택 즉시 그 나라 언어로
  const pick = (id: PersonaId) => {
    dispatch({ type: 'RESET', persona: id, startAt: 'onboarding' })
    dispatch({ type: 'SELECT_LANG', lang: PERSONAS[id].lang })
  }
  return (
    <>
      <div className="appBody">
        <LogoHero />
        <div className="brandTitle">일로 <i className="wmk">ONNA</i></div>
        <p className="lead" style={{ fontSize: 16 }}>{t('a0.nation')}</p>
        <div className="list">
          {NATIONS.map((n) => (
            <button key={n.persona} className="item" onClick={() => pick(n.persona)}
              style={sel === n.persona ? { background: 'var(--app-primary-tint)' } : undefined}>
              <span className={n.persona === 'sita' ? 'devanagari' : undefined} style={{ fontWeight: sel === n.persona ? 700 : 500 }}>
                {n.native}
                <span className="sub">{n.ko} · {n.langLabel} · {n.cur}</span>
              </span>
              {sel === n.persona && <span className="r" style={{ color: 'var(--app-primary)', fontWeight: 700 }}>✓</span>}
            </button>
          ))}
          <button className="item" onClick={() => dispatch({ type: 'SELECT_LANG', lang: 'ko' })}
            style={selKo ? { background: 'var(--app-primary-tint)' } : undefined}>
            <span style={{ fontWeight: selKo ? 700 : 500 }}>
              대한민국
              <span className="sub">한국 · 한국어 · KRW</span>
            </span>
            {selKo && <span className="r" style={{ color: 'var(--app-primary)', fontWeight: 700 }}>✓</span>}
          </button>
        </div>
      </div>
      <div className="appFoot">
        <button className="btn" disabled={state.lang === null} onClick={() => dispatch({ type: 'ONB_START' })}>
          {t('a0.continue')}
        </button>
      </div>
    </>
  )
}

/* A1 소개 — 가치 제안 3개 (일러스트 없음: PRD 지시) */
export function A1() {
  const { dispatch, t } = useApp()
  return (
    <>
      <div className="appBody">
        <div className="h1" style={{ marginTop: 24 }}>{t('a1.title')}</div>
        <p className="lead">{t('a1.lead')}</p>
        <div className="list">
          {([['f1t', 'f1s', 'send'], ['f2t', 'f2s', 'record'], ['f3t', 'f3s', 'chat']] as Array<[string, string, IconName]>).map(([tt, ss, ic]) => (
            <div className="item" key={tt}>
              <div className="ico"><Icon name={ic} size={20} /></div>
              <span style={{ fontWeight: 600 }}>{t(`a1.${tt}`)}<span className="sub">{t(`a1.${ss}`)}</span></span>
            </div>
          ))}
        </div>
        <p style={{ color: 'var(--app-muted)', fontSize: 13 }}>{t('a1.time')}</p>
      </div>
      <div className="appFoot">
        <button className="btn" onClick={() => dispatch({ type: 'NAV', screen: 'A2' })}>
          {t('a1.start')}<Icon name="chevron" size={17} style={{ marginLeft: 4 }} />
        </button>
        <button className="btn ghost" onClick={() => dispatch({ type: 'NAV', screen: 'A6' })}>{t('a1.existing')}</button>
      </div>
    </>
  )
}

/* A2 등록증 촬영 — ON-2: 자동 촬영, 2회 실패 시 사람 연결. 스캔 시 등록증 목업이 프레임에 정렬 */
export function A2({ idFailMode }: { idFailMode: boolean }) {
  const { state, dispatch, p, t } = useApp()
  const [scanning, setScanning] = useState(false)
  const attempts = state.onboarding.idAttempts
  const failedTwice = attempts >= 2 && !state.onboarding.idOk

  const capture = () => {
    if (scanning) return
    setScanning(true)
    setTimeout(() => {
      setScanning(false)
      dispatch({ type: 'ID_RESULT', success: !idFailMode || attempts >= 2 })
    }, 1700)
  }

  return (
    <>
      <div className="appBody">
        <div className="prog"><span>{t('prog.identity')}</span><span>1 / 4</span></div>
        <div className="bar"><i style={{ width: '25%' }} /></div>
        <div className="h1">{t('a2.title')}</div>
        <div className="cam">
          <div className="frame" />
          {scanning && <div className="idcardWrap"><IdCard p={p} glare={idFailMode && attempts < 2} /></div>}
          {scanning && <div className="scanline" />}
          <span>{scanning ? t('a2.scanning') : t('a2.guide')}</span>
        </div>
        {attempts > 0 && !state.onboarding.idOk && (
          <div className="card" style={{ borderColor: 'var(--app-hold)' }}>
            <p style={{ color: 'var(--app-hold)', fontWeight: 600 }}>{t('a2.fail')}</p>
          </div>
        )}
        <div className="card">
          <h4>{t('a2.tip')}</h4>
        </div>
        <div className="note amber"><Icon name="shield" size={16} /><span>{t('a2.privacy')}</span></div>
      </div>
      <div className="appFoot">
        <button className="btn" onClick={capture} disabled={scanning}>
          {!scanning && <Icon name="camera" size={18} style={{ marginRight: 8 }} />}
          {scanning ? t('a2.scanning') : attempts > 0 ? t('a2.retry') : t('a2.btn')}
        </button>
        {failedTwice && (
          <button className="btn ghost" onClick={() => dispatch({ type: 'ESCALATE', reason: 'id_capture_failed' })}>
            {t('b4.opt3')}
          </button>
        )}
      </div>
    </>
  )
}

/* A3 얼굴 인증 — ON-3: 아바타 셀피 프리뷰 위에 스캔 연출 */
export function A3() {
  const { dispatch, p, t } = useApp()
  const [scanning, setScanning] = useState(false)
  const verify = () => {
    if (scanning) return
    setScanning(true)
    setTimeout(() => dispatch({ type: 'FACE_OK' }), 1500)
  }
  return (
    <>
      <div className="appBody">
        <div className="prog"><span>{t('prog.identity')}</span><span>2 / 4</span></div>
        <div className="bar"><i style={{ width: '50%' }} /></div>
        <div className="h1">{t('a3.title')}</div>
        <div className="cam">
          <div className={`faceWrap ${scanning ? 'scan' : ''}`}><Face p={p} /></div>
          <div className="frame face" />
          {scanning && <div className="scanline" />}
          <span>{scanning ? t('a2.scanning') : t('a3.guide')}</span>
        </div>
        <div className="note amber"><Icon name="shield" size={16} /><span>{t('a3.privacy')}</span></div>
      </div>
      <div className="appFoot">
        <button className="btn" onClick={verify} disabled={scanning}>
          {scanning ? t('a2.scanning') : <>{t('a3.btn')}<Icon name="chevron" size={17} style={{ marginLeft: 4 }} /></>}
        </button>
      </div>
    </>
  )
}

/* A4 고용주 연결 — ON-4: 건너뛰어도 계좌 개설 진행. QR=페르소나 사업장, 검색=대구 사업장 디렉터리 */
export function A4() {
  const { state, dispatch, p, t } = useApp()
  const [search, setSearch] = useState(false)
  const [q, setQ] = useState('')
  const results = searchCompanies(q)
  return (
    <>
      <div className="appBody">
        <CompanyStep t={t} />
        <div className="h1">{t('a4.title')}</div>
        <p className="lead">{t('a4.lead')}</p>

        <div className="tileRow">
          {/* QR은 전용 스캔 화면(A4-1)으로 이동 */}
          <button className="tile" onClick={() => dispatch({ type: 'NAV', screen: 'A41' })}>
            <Icon name="scan" size={24} />{t('a4.qr')}
          </button>
          <button className={`tile ${search ? 'on' : ''}`} onClick={() => setSearch(true)}>
            <Icon name="search" size={24} />{t('a4.search')}
          </button>
        </div>

        {search && (
          <>
            <input className="searchInput" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={t('a4.searchPh')} />
            <div className="list">
              {results.map((c) => (
                <button className="item" key={c.name}
                  onClick={() => dispatch({ type: 'EMPLOYER_LINK', method: 'search', company: `${c.name} (${c.area})` })}>
                  <div className="ico"><Icon name="search" size={18} /></div>
                  <span style={{ fontWeight: 600 }}>{c.name}<span className="sub">{c.area} · {c.industry}</span></span>
                  <span className="r"><Icon name="chevron" size={16} /></span>
                </button>
              ))}
              {results.length === 0 && (
                <div className="item"><span style={{ color: 'var(--app-muted)', fontSize: 13.5 }}>{t('a4.noResult')}</span></div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="appFoot">
        <button className="btn ghost" onClick={() => dispatch({ type: 'EMPLOYER_LINK', method: 'skip' })}>
          {t('a4.later2')}
        </button>
      </div>
    </>
  )
}

/* 회사 연결 단계 인디케이터 — A4·A4-1·A4-2 공통 (3/4, 75%) */
function CompanyStep({ t }: { t: (k: string) => string }) {
  return (
    <>
      <div className="prog"><span>{t('prog.company')}</span><span>3 / 4</span></div>
      <div className="bar"><i style={{ width: '75%' }} /></div>
    </>
  )
}

/* A4-1 회사 QR 스캔 — 뷰파인더에 QR이 들어오면 자동 인식 */
export function A41() {
  const { dispatch, p, t } = useApp()
  const [reading, setReading] = useState(false)
  const scan = () => {
    if (reading) return
    setReading(true)
    setTimeout(() => {
      setReading(false)
      dispatch({ type: 'EMPLOYER_LINK', method: 'qr', company: p.employerKo })
    }, 1800)
  }
  return (
    <>
      <div className="appBody">
        <CompanyStep t={t} />
        <div className="h1">{t('a41.title')}</div>
        <p className="lead">{t('a41.sub')}</p>

        <button className="scanView" onClick={scan}>
          <span className="scanChip">
            <i className={reading ? 'live' : ''} />{reading ? t('a41.reading') : t('a41.chip')}
          </span>
          <span className="scanFlash"><Icon name="flash" size={16} /></span>
          <span className="scanFrame" />
          {reading && <span className="scanQr"><Qr seed={p.employerKo} size={104} /></span>}
          {reading && <span className="scanline" />}
          <span className="scanGuide">{t('a41.guide')}</span>
        </button>

        <button className="btn ghost" onClick={() => dispatch({ type: 'NAV', screen: 'A4' })}>
          <Icon name="search" size={18} style={{ marginRight: 7 }} />{t('a4.search')}
        </button>

        <div className="note amber" style={{ marginTop: 12 }}>
          <Icon name="chat" size={16} />
          <span><b style={{ display: 'block', marginBottom: 2 }}>{t('a41.noQr')}</b>{t('a41.noQrS')}</span>
        </div>
      </div>
    </>
  )
}

/* A4-2 스캔 결과 — 연결된 회사 확인 후 다음 단계로 */
export function A42() {
  const { state, dispatch, p, t } = useApp()
  const name = state.onboarding.employerName ?? p.employerKo
  const verified = state.onboarding.employer === 'verified'
  return (
    <>
      <div className="appBody">
        <CompanyStep t={t} />
        <div className="h1">{t('a4.title')}</div>
        <p className="lead">{t('a4.lead')}</p>

        <div className="card accent">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div className="ico"><Icon name="scan" size={20} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 style={{ margin: '2px 0 6px' }}>{name}</h4>
              <span className={`badge ${verified ? 'ok' : 'wait'}`}>
                {verified ? <Icon name="check" size={13} strokeWidth={2.6} /> : <Icon name="refresh" size={13} strokeWidth={2.2} />}
                {verified ? t('a4.verified') : t('a4.waiting')}
              </span>
            </div>
          </div>
          <p style={{ marginTop: 10 }}>{t('a4.pendingMsg')}</p>
          <button className="linkBtn" onClick={() => dispatch({ type: 'NAV', screen: 'A4' })}>{t('a42.other')}</button>
        </div>

        <div className="agentcard">
          <div className="who"><Logo size={24} /><b className="wmk">ONNA</b></div>
          <p className="say">{t('a4.pendingMsg')}</p>
        </div>
      </div>
      <div className="appFoot">
        <button className="btn" onClick={() => dispatch({ type: 'NAV', screen: 'A5' })}>
          {t('common.next')}<Icon name="chevron" size={17} style={{ marginLeft: 4 }} />
        </button>
        <button className="btn ghost" onClick={() => dispatch({ type: 'EMPLOYER_LINK', method: 'skip' })}>
          {t('a4.later2')}
        </button>
      </div>
    </>
  )
}

/* A5 이력 동의 — ON-5: 항목별 토글 + "볼 수 있는 사람" */
export function A5() {
  const { state, dispatch, t } = useApp()
  const c = state.onboarding.consents
  const Toggle = ({ k, title, sub }: { k: 'salary' | 'remit' | 'employment'; title: string; sub: string }) => (
    <button className="toggle" onClick={() => dispatch({ type: 'CONSENT', key: k, value: !c[k] })}>
      <div className={`sw ${c[k] ? 'on' : ''}`} />
      <div><div className="t">{title}</div><div className="s">{sub}</div></div>
    </button>
  )
  return (
    <>
      <div className="appBody">
        <div className="prog"><span>{t('prog.record')}</span><span>4 / 4</span></div>
        <div className="bar"><i style={{ width: '100%' }} /></div>
        <div className="h1">{t('a5.title')}</div>
        <p className="lead">{t('a5.lead')}</p>
        <div className="card">
          <Toggle k="salary" title={t('a5.salary')} sub={t('a5.who')} />
          <Toggle k="remit" title={t('a5.remit')} sub={t('a5.who')} />
          <Toggle k="employment" title={t('a5.employ')} sub={t('a5.employWho')} />
        </div>
        <div className="note amber"><Icon name="shield" size={16} /><span>{t('a5.note')}</span></div>
        <p style={{ fontSize: 13 }}><span style={{ color: 'var(--app-primary)', fontWeight: 600 }}>{t('a5.terms')}</span></p>
      </div>
      <div className="appFoot">
        <button className="btn" onClick={() => dispatch({ type: 'ACCOUNT_OPENED' })}>{t('a5.btn')}</button>
      </div>
    </>
  )
}

/* A6 개설 완료 — ON-6: 계좌번호 + 사장님께 보내기(한국어 안내문) */
export function A6() {
  const { state, dispatch, p, t } = useApp()
  const [shareOpen, setShareOpen] = useState(false)
  const acct = state.onboarding.accountNo ?? A6_FALLBACK_ACCT
  const sent = state.accountShare?.channel
  return (
    <>
      <div className="appBody">
        <div className="shield ok"><Icon name="check" size={38} /></div>
        <div className="h1 center">{t('a6.title')}</div>
        <div className="card center">
          <p>{t('a6.acctLabel')}</p>
          <div className="acctNum">
            {acct}
            <Icon name="copy" size={15} strokeWidth={2} style={{ display: 'inline-block', verticalAlign: '-2px', marginLeft: 7, color: 'var(--app-muted)' }} />
          </div>
          <p style={{ marginTop: 4 }}>{p.fullName}</p>
        </div>
        <div className="agentcard">
          <div className="who"><Logo size={24} /><b className="wmk">ONNA</b></div>
          <p className="say long">{t('a6.agentSay')}</p>
          <p className="why">{t('a6.agentWhy')}</p>
          <button className="btn agent sm" style={{ marginTop: 8 }} onClick={() => setShareOpen(!shareOpen)}>
            {t('a6.share')}
          </button>
          {shareOpen && (
            <div className="card" style={{ marginTop: 10, marginBottom: 0 }}>
              <p style={{ fontSize: 12.5, marginBottom: 6 }}>{t('a6.shareTitle')}</p>
              <p style={{ fontSize: 13, color: 'var(--app-ink)', background: 'var(--app-bg)', borderRadius: 10, padding: '8px 10px' }}>
                사장님, 안녕하세요. {p.fullName}입니다. 급여계좌가 만들어졌어요.
                아래 계좌로 급여를 보내 주세요. iM뱅크 {acct}
              </p>
              {/* 보내면 사장님 화면 알림함에 '급여계좌 안내'가 새 알림으로 뜬다 */}
              {sent && (
                <div className="sentNote">
                  <Icon name="check" size={15} strokeWidth={2.4} />
                  <span>{t('a6.sent', { channel: sent === 'kakao' ? t('a6.kakao') : 'SMS' })}</span>
                </div>
              )}
              {/* 보낸 뒤에도 버튼을 남긴다 — 채널을 바꿔 다시 보낼 수 있고,
                  패널이 눌리지 않는 화면처럼 보이지 않는다 */}
              <div className="row" style={{ marginTop: 8 }}>
                <button className={`btn sm ${sent === 'kakao' ? '' : 'ghost'}`}
                  onClick={() => dispatch({ type: 'SHARE_ACCOUNT', channel: 'kakao' })}>{t('a6.kakao')}</button>
                <button className={`btn sm ${sent === 'sms' ? '' : 'ghost'}`}
                  onClick={() => dispatch({ type: 'SHARE_ACCOUNT', channel: 'sms' })}>SMS</button>
              </div>
            </div>
          )}
        </div>
        <div className="card">
          <h4>{t('b1.myHist')}</h4>
          <p>{t('a6.histNone')}</p>
        </div>
      </div>
      <div className="appFoot">
        <button className="btn" onClick={() => dispatch({ type: 'NAV', screen: 'B1' })}>{t('a6.home')}</button>
      </div>
    </>
  )
}
