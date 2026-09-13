import { useEffect, useRef, useState } from 'react'
import { useApp } from './hooks'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { Splash } from './Splash'
import { A0, A1, A2, A3, A4, A41, A42, A5, A6 } from './screens/Onboarding'
import { B0, B1, B2, B3, B4, B5, B7 } from './screens/Remit'
import { C1, Help } from './screens/Record'
import { D1, D2, D3 } from './screens/Loan'
import { FX, fmtRate, fxAdvantagePct } from '../mock/fx'
import { loanOffer } from '../mock/loan'
import type { Screen } from '../types'
import { apiUrl } from '../lib/api'

/* 상단 앱바 — 뒤로(이전 단계) / 섹션 타이틀 / 홈·아바타. A6·B5는 완료 화면, B0은 잠금, C1·HELP는 하단 탭 담당 */
const TOP_NAV: Partial<Record<Screen, { back?: Screen; home?: boolean; title?: string }>> = {
  A1: { back: 'A0' },
  A2: { back: 'A1', title: 'prog.identity' }, A3: { back: 'A2', title: 'prog.identity' },
  A4: { back: 'A3', title: 'prog.company' },
  A41: { back: 'A4', title: 'prog.company' }, A42: { back: 'A4', title: 'prog.company' },
  A5: { back: 'A4', title: 'prog.record' },
  B2: { back: 'B1', title: 'b1.navSend' }, B3: { back: 'B2', home: true, title: 'b1.navSend' },
  B4: { home: true, title: 'b3.check' }, B7: { back: 'B5', home: true, title: 'b5.makeRule' },
  D1: { back: 'C1', home: true, title: 'd.open' },
  D2: { back: 'D1', home: true, title: 'd.open' },
  D3: { home: true, title: 'd3.confirm' }, // 실행 후 금액 화면으로 되돌아가지 않도록 뒤로가기 없음
}

/* 에이전트 채팅 — 데모 의도 분류 (5개 언어 키워드). 실행은 항상 화면 이동 + 확인 단계를 거친다 (AG-3) */
const KW = {
  remit: ['송금', '보내', 'kirim', 'gửi', 'gui', 'send', 'transfer', 'पठा'],
  rate: ['환율', '환전', 'kurs', 'tỷ giá', 'ty gia', 'rate', 'दर'],
  bal: ['잔액', 'saldo', 'số dư', 'so du', 'balance', 'ब्यालेन्स'],
  record: ['기록', '이력', 'catatan', 'hồ sơ', 'ho so', 'record', 'रेकर्ड'],
  help: ['도움', '사람', '상담', 'bantuan', 'trợ giúp', 'tro giup', 'help', 'मद्दत', 'tư vấn', 'परामर्श'],
  loan: ['대출', '빌리', 'pinjam', 'vay', 'loan', 'borrow', 'ऋण'],
}

function parseAmount(s: string): number | null {
  const man = s.match(/(\d+(?:\.\d+)?)\s*만/) // "50만" → 500,000
  if (man) return Math.round(parseFloat(man[1]) * 10_000)
  const digits = s.replace(/[,.\s]/g, '').match(/\d{4,9}/) // "500,000" / "500.000"
  return digits ? parseInt(digits[0], 10) : null
}

/* 로딩 화면은 세션당 한 번만. 화면 탭(근로자/사장님/가족)을 오갈 때마다 WorkerPhone이
   다시 마운트되는데, 그때마다 재생되면 시연 중 매번 3초를 기다리게 된다.
   '첫 온보딩 화면으로'는 'onna:splash' 이벤트로 명시적으로 다시 재생시킨다. */
let splashPlayed = false

type ChatMsg = {
  who: 'agent' | 'user'
  text: string
  action?: { label: string; screen?: Screen; amount?: number; escalate?: boolean }
}

/* 근로자 앱 화면 — 항상 실기(iOS)와 같은 풀스크린 레이아웃으로 그린다.
   데스크톱에서는 DeviceFrame이 기기 셸을 씌워 같은 모습을 만든다. */
export function WorkerPhone({ idFailMode }: { idFailMode: boolean }) {
  const { state, dispatch, p, t, krw, local } = useApp()
  const fx = FX[p.currency]
  // 앱 진입 로딩 화면 — 폰 화면 안에서만 표시. 'onna:splash' 이벤트로 재생
  const [splash, setSplash] = useState(!splashPlayed)
  const [chatOpen, setChatOpen] = useState(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [typing, setTyping] = useState(false)
  const [draftText, setDraftText] = useState('')
  const msgsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const open = () => setChatOpen(true)
    const replay = () => { splashPlayed = false; setSplash(true) }
    window.addEventListener('onna:chat', open)
    window.addEventListener('onna:splash', replay)
    return () => {
      window.removeEventListener('onna:chat', open)
      window.removeEventListener('onna:splash', replay)
    }
  }, [])

  useEffect(() => {
    if (chatOpen && msgs.length === 0) setMsgs([{ who: 'agent', text: t('chat.hello') }])
  }, [chatOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, typing])

  const reply = (input: string): ChatMsg => {
    const q = input.toLowerCase()
    const has = (ws: string[]) => ws.some((w) => q.includes(w))
    const amount = parseAmount(q)
    if (has(KW.loan)) {
      const offer = loanOffer(p, state.sessionRemits)
      const ready = state.creditReady || p.monthsToCredit <= 0
      return ready
        ? { who: 'agent', text: t('chat.loan', { limit: krw(offer.limit), rate: offer.rate }), action: { label: t('chat.goLoan'), screen: 'D1' } }
        : { who: 'agent', text: t('b1.untilCredit', { k: p.monthsToCredit }), action: { label: t('chat.goRecord'), screen: 'C1' } }
    }
    if (has(KW.rate) && amount === null)
      return { who: 'agent', text: t('chat.rate', { rate: fx.rateText, pct: fxAdvantagePct(p.currency) }) }
    if (has(KW.remit) || amount !== null) {
      const amt = amount ?? state.proposal?.amount ?? 600_000
      const dual = `${krw(amt)} (≈ ${local(Math.round(amt * fx.rate))})`
      return { who: 'agent', text: t('chat.remit', { amount: dual }), action: { label: t('chat.goRemit'), screen: 'B2', amount: amt } }
    }
    if (has(KW.bal))
      return { who: 'agent', text: t('chat.bal', { bal: krw(state.balance), sent: krw(state.sentThisMonth) }) }
    if (has(KW.record))
      return { who: 'agent', text: t('chat.record', { m: p.monthsEmployed, n: p.remitCount + state.sessionRemits }), action: { label: t('chat.goRecord'), screen: 'C1' } }
    if (has(KW.help))
      return { who: 'agent', text: t('chat.help'), action: { label: t('help.human'), screen: 'HELP', escalate: true } }
    return { who: 'agent', text: t('chat.fallback') }
  }

  /** LLM 응답을 화면 액션으로 변환 — 실행은 항상 확인 화면을 거친다 (AG-3) */
  const toMsg = (r: { text: string; action?: string; amount?: number | null }): ChatMsg => {
    switch (r.action) {
      case 'remit': {
        const amt = r.amount ?? state.proposal?.amount ?? 600_000
        return { who: 'agent', text: r.text, action: { label: t('chat.goRemit'), screen: 'B2', amount: amt } }
      }
      case 'record':
        return { who: 'agent', text: r.text, action: { label: t('chat.goRecord'), screen: 'C1' } }
      case 'loan':
        return state.creditReady || p.monthsToCredit <= 0
          ? { who: 'agent', text: r.text, action: { label: t('chat.goLoan'), screen: 'D1' } }
          : { who: 'agent', text: r.text, action: { label: t('chat.goRecord'), screen: 'C1' } }
      case 'help':
        return { who: 'agent', text: r.text, action: { label: t('help.human'), screen: 'HELP', escalate: true } }
      default:
        return { who: 'agent', text: r.text }
    }
  }

  const send = async (raw?: string) => {
    const text = (raw ?? draftText).trim()
    if (!text || typing) return
    setDraftText('')
    setMsgs((m) => [...m, { who: 'user', text }])
    setTyping(true)

    const offer = loanOffer(p, state.sessionRemits)
    try {
      const res = await fetch(apiUrl('/api/agent'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          message: text,
          lang: state.lang ?? 'ko',
          // 수치는 전부 여기서 넘긴 값만 쓰게 한다 (AG-4)
          ctx: {
            name: p.name,
            homeCurrency: p.currency,
            salary: p.salary,
            balance: state.balance,
            sentThisMonth: state.sentThisMonth,
            livingFloor: state.livingFloor,
            fxRate: fx.rate,
            fxRateText: fx.rateText,
            fxAdvantagePct: Number(fxAdvantagePct(p.currency)),
            // 과거 환율 질문("지난주엔 얼마였어요?")의 근거. 실값을 못 받았으면 통째로 빠진다
            fxPast: fx.past,
            fxAvg90dText: fx.avgReal ? fmtRate(p.currency, fx.avg3m) : undefined,
            today: new Date().toISOString().slice(0, 10),
            monthsEmployed: p.monthsEmployed,
            remitCount: p.remitCount + state.sessionRemits,
            monthsToCredit: p.monthsToCredit,
            creditReady: state.creditReady || p.monthsToCredit <= 0,
            loanLimit: offer.limit,
            loanRate: offer.rate,
            proposalAmount: state.proposal?.amount,
          },
        }),
      })
      const d = await res.json()
      setTyping(false)
      // 서버가 가드레일에 걸리거나 실패하면 fallback 플래그가 온다 → 규칙 기반 응답
      setMsgs((m) => [...m, d?.text ? toMsg(d) : reply(text)])
    } catch {
      setTyping(false)
      setMsgs((m) => [...m, reply(text)])
    }
  }

  const runAction = (a: NonNullable<ChatMsg['action']>) => {
    if (a.amount) dispatch({ type: 'SET_DRAFT', amount: a.amount })
    if (a.escalate) dispatch({ type: 'ESCALATE', reason: 'chat_request' })
    if (a.screen) dispatch({ type: 'NAV', screen: a.screen })
    setChatOpen(false)
  }

  const s = state.screen
  const isLock = s === 'B0'

  const inner = (
      <div className={`screen frameless ${state.dark ? 'dark' : ''}`} data-lang={state.lang ?? ''}>
        {!isLock && <div className="safeTop" />}

        {TOP_NAV[s] && (
          <div className="topbar">
            {TOP_NAV[s]!.back
              ? <button aria-label={t('common.back')} onClick={() => dispatch({ type: 'NAV', screen: TOP_NAV[s]!.back! })}><Icon name="back" size={22} /></button>
              : <span />}
            {TOP_NAV[s]!.title && <span className="tTitle">{t(TOP_NAV[s]!.title!)}</span>}
            <div className="tRight">
              {TOP_NAV[s]!.home && (
                <button aria-label={t('b1.navHome')} onClick={() => dispatch({ type: 'NAV', screen: 'B1' })}><Icon name="home" size={21} /></button>
              )}
              <div className="avatarDot" aria-hidden>{p.name[0]}</div>
            </div>
          </div>
        )}

        {s === 'A0' && <A0 />}
        {s === 'A1' && <A1 />}
        {s === 'A2' && <A2 idFailMode={idFailMode} />}
        {s === 'A3' && <A3 />}
        {s === 'A4' && <A4 />}
        {s === 'A41' && <A41 />}
        {s === 'A42' && <A42 />}
        {s === 'A5' && <A5 />}
        {s === 'A6' && <A6 />}
        {s === 'B0' && <B0 />}
        {s === 'B1' && <B1 />}
        {s === 'B2' && <B2 />}
        {s === 'B3' && <B3 />}
        {s === 'B4' && <B4 />}
        {s === 'B5' && <B5 />}
        {s === 'B7' && <B7 />}
        {s === 'C1' && <C1 />}
        {s === 'HELP' && <Help />}
        {s === 'D1' && <D1 />}
        {s === 'D2' && <D2 />}
        {s === 'D3' && <D3 />}

        {/* 에이전트 채팅 시트 — 질문·업무 요청, 실행은 카드/화면 확인으로 */}
        {chatOpen && (
          <div className="micSheetBack" onClick={() => setChatOpen(false)}>
            <div className="chatSheet" onClick={(e) => e.stopPropagation()}>
              <div className="chatHead">
                <Logo size={24} />
                <b className="wmk">ONNA</b>
                <button className="chatClose" aria-label={t('common.close')} onClick={() => setChatOpen(false)}><Icon name="close" size={17} /></button>
              </div>
              <div className="chatMsgs" ref={msgsRef}>
                {msgs.map((m, i) => (
                  <div key={i} className={`bubble ${m.who}`}>
                    {m.text}
                    {m.action && (
                      <button className="btn agent sm" style={{ marginTop: 8 }} onClick={() => runAction(m.action!)}>
                        {m.action.label}
                      </button>
                    )}
                  </div>
                ))}
                {typing && <div className="bubble agent typing"><i /><i /><i /></div>}
              </div>
              <div className="chatChips">
                {[t('chat.s1'), t('chat.s2'), t('chat.s3')].map((sug) => (
                  <button key={sug} onClick={() => send(sug)}>{sug}</button>
                ))}
              </div>
              <div className="chatInputRow">
                <input value={draftText} onChange={(e) => setDraftText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                  placeholder={t('chat.ph')} />
                <button className="sendBtn" aria-label={t('chat.title')} onClick={() => send()}><Icon name="send" size={18} /></button>
              </div>
            </div>
          </div>
        )}

        {splash && <Splash onDone={() => { splashPlayed = true; setSplash(false) }} />}
      </div>
  )

  return inner
}
