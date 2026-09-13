import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { AppState, HoldCode, Lang, PersonaId, Scenario, Screen } from './types'
import { PERSONAS } from './mock/personas'
import { loanOffer, monthlyPayment } from './mock/loan'
import { getQuote, fxAdvantagePct } from './mock/fx'
import { precheck, newTxId, newTraceId, MONTHLY_LIMIT } from './mock/rules'

export const SLA_DEMO_SEC = 30 // 파일럿 SLA 30분 → 데모 30초
export const ARRIVE_DEMO_SEC = 45 // 도착 웹훅 데모 45초

export type Action =
  | { type: 'RESET'; persona: PersonaId; startAt: 'onboarding' | 'home' }
  | { type: 'NAV'; screen: Screen }
  | { type: 'SELECT_LANG'; lang: Lang }
  | { type: 'ONB_START' }
  | { type: 'ID_RESULT'; success: boolean }
  | { type: 'FACE_OK' }
  | { type: 'EMPLOYER_LINK'; method: 'qr' | 'search' | 'skip'; company?: string }
  | { type: 'CONSENT'; key: 'salary' | 'remit' | 'employment'; value: boolean }
  | { type: 'ACCOUNT_OPENED' }
  | { type: 'SALARY_CREDITED' }
  | { type: 'PROPOSAL_ACTION'; action: 'send' | 'change' | 'later' }
  | { type: 'SET_DRAFT'; amount: number }
  | { type: 'EXECUTE' } // B3 지문 → 규정 점검
  | { type: 'SEND_FINAL' } // B4 통과 → 실행
  | { type: 'DOC_UPLOAD' }
  | { type: 'OPS_APPROVE'; id: string }
  | { type: 'TOGGLE_CREDIT' }
  | { type: 'SET_LOAN_DRAFT'; amount?: number; months?: number }
  | { type: 'LOAN_EXECUTE' }
  | { type: 'CANCEL_TX' }
  | { type: 'TX_ARRIVED' }
  | { type: 'SHARE_FAMILY'; channel: string }
  | { type: 'RULE_SAVE' }
  | { type: 'EMPLOYER_APPROVE' }
  | { type: 'SHARE_ACCOUNT'; channel: 'kakao' | 'sms' }
  | { type: 'EMPLOYER_READ_ACCOUNT' }
  | { type: 'FAMILY_READ'; kind: 'shared' | 'arrived' }
  | { type: 'SET_SCENARIO'; scenario: Scenario }
  | { type: 'TOGGLE_DARK' }
  | { type: 'ESCALATE'; reason: string }

function trace(s: AppState, actor: AppState['trace'][number]['actor'], msg: string): AppState['trace'] {
  return [...s.trace.slice(-199), { at: Date.now(), actor, traceId: newTraceId(), msg }]
}
function ev(s: AppState, name: string, data?: string): AppState['events'] {
  return [...s.events.slice(-199), { at: Date.now(), name, data }]
}

export function initialState(persona: PersonaId, startAt: 'onboarding' | 'home'): AppState {
  const p = PERSONAS[persona]
  // acctNo()는 매번 다른 번호를 만든다 — 계좌번호가 쓰이는 곳이 여러 군데라 한 번만 뽑는다
  const acct = startAt === 'home' ? acctNo() : undefined
  const base: AppState = {
    personaId: persona,
    lang: startAt === 'home' ? p.lang : null,
    dark: false,
    screen: startAt === 'home' ? 'B1' : 'A0',
    scenario: 'auto',
    onboarding: {
      idAttempts: 0,
      idOk: startAt === 'home',
      faceOk: startAt === 'home',
      employer: startAt === 'home' ? 'pending' : 'none',
      consents: { salary: true, remit: true, employment: true },
      accountNo: acct,
      startedAt: startAt === 'onboarding' ? Date.now() : undefined,
      completedAt: startAt === 'home' ? Date.now() : undefined,
    },
    // 홈에서 시작 = 온보딩을 이미 마친 상태 → 급여계좌도 이미 보낸 것으로 둔다(읽음)
    accountShare:
      startAt === 'home'
        ? { at: Date.now(), channel: 'kakao', acct: acct!, read: true }
        : undefined,
    livingFloor: 1_000_000,
    balance: 320_000,
    sentThisMonth: 0,
    draftAmount: 0,
    rule: null,
    creditReady: false,
    loanDraft: { amount: 0, months: 12 },
    sessionRemits: 0,
    queue: [],
    trace: [],
    events: [],
  }
  base.trace = [{ at: Date.now(), actor: 'orchestrator', traceId: newTraceId(), msg: `세션 시작 — 페르소나 ${p.name} (${p.lang}), 시작점 ${startAt === 'home' ? '홈' : '온보딩 A0'}` }]
  base.events = [{ at: Date.now(), name: startAt === 'home' ? 'session_started' : 'onboarding_started' }]
  return base
}

function acctNo(): string {
  return `508-12-${String(Math.floor(Math.random() * 900000) + 100000)}`
}

function proposalAmount(s: AppState): number {
  const p = PERSONAS[s.personaId]
  return Math.max(0, p.salary - s.livingFloor - p.autoDebit) // RM-2: 금액 계산은 코드
}

export function reducer(s: AppState, a: Action): AppState {
  const p = PERSONAS[s.personaId]
  switch (a.type) {
    case 'RESET':
      // 데모 설정(규정 점검 시나리오·다크 모드·신용 충족)은 세션 리셋·페르소나 전환에도 유지
      return { ...initialState(a.persona, a.startAt), scenario: s.scenario, dark: s.dark, creditReady: s.creditReady }

    case 'TOGGLE_CREDIT':
      return {
        ...s,
        creditReady: !s.creditReady,
        events: ev(s, 'demo_credit_toggle', String(!s.creditReady)),
      }

    case 'SET_LOAN_DRAFT':
      return {
        ...s,
        loanDraft: {
          amount: a.amount ?? s.loanDraft.amount,
          months: a.months ?? s.loanDraft.months,
        },
      }

    case 'LOAN_EXECUTE': {
      const offer = loanOffer(p, s.sessionRemits, s.loanDraft.months)
      const amount = Math.min(s.loanDraft.amount, offer.limit)
      const monthly = monthlyPayment(amount, s.loanDraft.months, offer.rate)
      let st: AppState = {
        ...s,
        balance: s.balance + amount,
        loan: { amount, months: s.loanDraft.months, rate: offer.rate, monthly, at: Date.now() },
        screen: 'D3',
        events: ev(s, 'loan_executed', `amount=${amount} months=${s.loanDraft.months} rate=${offer.rate}`),
        trace: trace(s, 'rules-engine', `대출 승인 — 한도 ₩${offer.limit.toLocaleString()} 내 ₩${amount.toLocaleString()} · 금리 ${offer.rate}% (기록 우대 ${offer.discount}%p)`),
      }
      st = { ...st, trace: trace(st, 'bank-core', `POST /loan/execute → 급여계좌 입금 · 월 상환 ₩${monthly.toLocaleString()} × ${s.loanDraft.months}회`) }
      st = { ...st, trace: trace(st, 'record-svc', '대출 실행 기록 — 재직·송금·공과금 이력을 근거로 사용') }
      return st
    }

    case 'NAV': {
      let events = s.events
      if (a.screen === 'C1') events = ev(s, 'record_viewed')
      if (a.screen === 'B3') events = ev(s, 'confirm_viewed')
      return { ...s, screen: a.screen, events }
    }

    case 'SELECT_LANG':
      return {
        ...s,
        lang: a.lang,
        events: ev(s, 'language_selected', `lang=${a.lang} detected=${p.lang}`),
        trace: trace(s, 'orchestrator', `세션 언어 고정: ${a.lang} (감지값 ${p.lang})`),
      }

    case 'ONB_START':
      return { ...s, screen: 'A1', onboarding: { ...s.onboarding, startedAt: s.onboarding.startedAt ?? Date.now() } }

    case 'ID_RESULT': {
      const attempts = s.onboarding.idAttempts + 1
      return {
        ...s,
        onboarding: { ...s.onboarding, idAttempts: attempts, idOk: a.success },
        screen: a.success ? 'A3' : 'A2',
        events: ev(s, 'id_capture_result', `success=${a.success} attempt=${attempts}`),
        trace: trace(s, 'bank-core', a.success ? '법무부 진위확인 OK · 촬영 이미지 즉시 삭제' : `진위확인 실패 (${attempts}회)${attempts >= 2 ? ' → 사람 연결 버튼 노출' : ''}`),
      }
    }

    case 'FACE_OK':
      return {
        ...s,
        onboarding: { ...s.onboarding, faceOk: true },
        screen: 'A4',
        events: ev(s, 'face_verify_result', 'success=true'),
        trace: trace(s, 'bank-core', '안면 대조 OK · 얼굴 이미지 즉시 삭제'),
      }

    case 'EMPLOYER_LINK': {
      const linked = a.method !== 'skip'
      const name = a.company ?? p.employerKo
      return {
        ...s,
        onboarding: { ...s.onboarding, employer: linked ? 'pending' : 'none', employerName: linked ? name : undefined },
        // 연결되면 확인 화면(A4-2)을 거치고, 건너뛰면 바로 다음 단계
        screen: linked ? 'A42' : 'A5',
        events: ev(s, 'employer_linked', `method=${a.method} skipped=${!linked} company=${linked ? name : '-'}`),
        trace: linked
          ? trace(s, 'orchestrator', `재직 확인 요청 발송 → ${name} (카카오톡 링크)`)
          : trace(s, 'orchestrator', '고용주 연결 건너뜀 — 계좌 개설은 계속 진행'),
      }
    }

    case 'CONSENT': {
      const consents = { ...s.onboarding.consents, [a.key]: a.value }
      return {
        ...s,
        onboarding: { ...s.onboarding, consents },
        events: ev(s, 'consent_set', `salary=${consents.salary} remit=${consents.remit} employment=${consents.employment}`),
      }
    }

    case 'ACCOUNT_OPENED': {
      const no = acctNo()
      return {
        ...s,
        onboarding: { ...s.onboarding, accountNo: no, completedAt: Date.now() },
        screen: 'A6',
        events: ev(s, 'account_opened', no),
        trace: trace(s, 'bank-core', `POST /accounts/open → ${no} · 급여 입금 이벤트 구독 시작`),
      }
    }

    case 'SALARY_CREDITED': {
      const amount = proposalAmount(s)
      const pre = precheck(amount, s.sentThisMonth, 'auto') // RM-1 사전점검
      let st: AppState = {
        ...s,
        balance: s.balance + p.salary,
        salaryEvent: { amount: p.salary, at: Date.now() },
        draftAmount: amount,
        proposal: { amount, status: 'new' },
        screen: 'B0',
        events: ev(s, 'salary_credited', String(p.salary)),
        trace: trace(s, 'orchestrator', `WEBHOOK salary.credited ₩${p.salary.toLocaleString()} 수신 → 트리거: 이벤트`),
      }
      st = { ...st, trace: trace(st, 'rules-engine', `사전점검 ${pre.result} — 한도 잔여 ₩${(MONTHLY_LIMIT - s.sentThisMonth).toLocaleString()}`) }
      st = {
        ...st,
        trace: trace(st, 'remit-agent', `제안 ₩${amount.toLocaleString()} = 급여−생활비 기준선−자동이체 · 근거 문장 생성(${s.lang ?? p.lang}) · 환율 ${fxAdvantagePct(p.currency)}% 유리`),
        events: ev(st, 'proposal_sent', `amount=${amount} reason_type=fx_favorable`),
      }
      return st
    }

    case 'PROPOSAL_ACTION': {
      const events = ev(s, 'proposal_action', a.action)
      if (a.action === 'later')
        return { ...s, proposal: s.proposal ? { ...s.proposal, status: 'snoozed' } : s.proposal, screen: 'B1', events, trace: trace(s, 'orchestrator', "'다음에' — 카드 접힘, 다음 급여일까지 재알림 없음") }
      if (a.action === 'change') return { ...s, screen: 'B2', events }
      return { ...s, screen: 'B3', events }
    }

    case 'SET_DRAFT': {
      const ch = s.draftAmount !== a.amount
      return { ...s, draftAmount: a.amount, events: ch ? ev(s, 'amount_changed', `from=${s.draftAmount} to=${a.amount}`) : s.events }
    }

    case 'EXECUTE': {
      // B3 생체인증 후 → POST /compliance/precheck
      const pre = precheck(s.draftAmount, s.sentThisMonth, s.scenario)
      const quote = getQuote(p.currency, s.draftAmount)
      if (pre.result === 'PASS')
        return {
          ...s,
          quote,
          compliance: { result: 'PASS', refNo: pre.refNo, docUploaded: false },
          screen: 'B4',
          events: ev(s, 'compliance_result', 'PASS'),
          trace: trace(s, 'rules-engine', `판정 PASS · 확인번호 ${pre.refNo}`),
        }
      const code = pre.code as HoldCode
      let st: AppState = {
        ...s,
        quote,
        compliance: { result: 'HOLD', code, docUploaded: false },
        screen: 'B4',
        events: ev(s, 'compliance_result', `HOLD/${code}`),
        trace: trace(s, 'rules-engine', `판정 HOLD · 코드 ${code}`),
      }
      st = { ...st, trace: trace(st, 'compliance-agent', `트리거: 예외 — 코드 ${code} → 모국어 사유 1문장 + 행동 3개 구성 (LLM은 설명만, 판정은 규칙 엔진)`) }
      return st
    }

    case 'SEND_FINAL': {
      const quote = s.quote ?? getQuote(p.currency, s.draftAmount)
      const cancelMs = quote.cancelMin * 60_000
      let st: AppState = {
        ...s,
        balance: s.balance - s.draftAmount - quote.fee,
        sentThisMonth: s.sentThisMonth + s.draftAmount,
        sessionRemits: s.sessionRemits + 1,
        proposal: undefined,
        tx: {
          id: newTxId(),
          amount: s.draftAmount,
          receive: quote.receive,
          at: Date.now(),
          cancelUntil: Date.now() + cancelMs,
          status: 'processing',
        },
        screen: 'B5',
        events: ev(s, 'remit_executed', `currency=${p.currency} amount=${s.draftAmount}`),
        trace: trace(s, 'bank-core', `POST /remit/execute → tx 생성 · 취소창 ${quote.cancelMin}분`),
      }
      st = { ...st, trace: trace(st, 'record-svc', '송금 기록 갱신 — 이벤트 해시 원장 기록(발급자: 은행), 원본은 은행 오프체인') }
      st = { ...st, trace: trace(st, 'orchestrator', `POST /family/receipt → 수령 페이지 생성 (lang=${PERSONAS[s.personaId].lang}, 30일 만료)`) }
      return st
    }

    case 'DOC_UPLOAD': {
      if (!s.compliance) return s
      const item = {
        id: `q_${Date.now().toString(36)}`,
        user: `${p.fullName} (${p.employerKo})`,
        amount: s.draftAmount,
        code: s.compliance.code as HoldCode,
        at: Date.now(),
        status: 'pending' as const,
      }
      return {
        ...s,
        compliance: { ...s.compliance, docUploaded: true },
        queue: [...s.queue, item],
        events: ev(s, 'doc_uploaded'),
        trace: trace(s, 'compliance-agent', `급여명세서 수신 → 담당자 큐 등록 (${item.id}) · SLA ${SLA_DEMO_SEC}초(데모)`),
      }
    }

    case 'OPS_APPROVE': {
      const queue = s.queue.map((q) => (q.id === a.id ? { ...q, status: 'approved' as const } : q))
      // RM-9: 승인 시 자동으로 B5 진행
      const pre = precheck(s.draftAmount, s.sentThisMonth, 'pass')
      let st: AppState = {
        ...s,
        queue,
        compliance: { result: 'PASS', refNo: pre.refNo, docUploaded: true },
        trace: trace(s, 'rules-engine', `담당자 재심사 승인 → PASS · 확인번호 ${pre.refNo}`),
        events: ev(s, 'compliance_result', 'PASS(after-review)'),
      }
      return reducer(st, { type: 'SEND_FINAL' })
    }

    case 'CANCEL_TX': {
      if (!s.tx || s.tx.status !== 'processing' || Date.now() > s.tx.cancelUntil) return s
      const quote = s.quote ?? getQuote(p.currency, s.tx.amount)
      return {
        ...s,
        balance: s.balance + s.tx.amount + quote.fee,
        sentThisMonth: Math.max(0, s.sentThisMonth - s.tx.amount),
        sessionRemits: Math.max(0, s.sessionRemits - 1),
        tx: { ...s.tx, status: 'cancelled' },
        screen: 'B1',
        events: ev(s, 'remit_cancelled', s.tx.id),
        trace: trace(s, 'bank-core', '취소창 내 취소 — 원장 기록 회수, 잔액 복원'),
      }
    }

    case 'TX_ARRIVED': {
      if (!s.tx || s.tx.status !== 'processing') return s
      return {
        ...s,
        tx: { ...s.tx, status: 'arrived', arrivedAt: Date.now() },
        trace: trace(s, 'orchestrator', '상태 웹훅: 수취 은행 도착 → 가족 페이지 갱신 + 도착 푸시'),
      }
    }

    case 'SHARE_FAMILY':
      if (!s.tx) return s
      return {
        ...s,
        tx: { ...s.tx, sharedVia: a.channel, sharedAt: Date.now() },
        events: ev(s, 'family_share', `channel=${a.channel}`),
        trace: trace(s, 'orchestrator', `가족 알림 공유 — ${a.channel} · 수취인 언어(${p.lang}) 수령 페이지 링크`),
      }

    case 'RULE_SAVE':
      return {
        ...s,
        rule: { amount: s.tx?.amount ?? s.draftAmount, fxMin: '', floor: s.livingFloor },
        screen: 'B1',
        events: ev(s, 'rule_created'),
        trace: trace(s, 'remit-agent', '정기송금 규칙 저장 — 급여일에 제안만 생성, 자동 실행 없음 (RM-14)'),
      }

    case 'EMPLOYER_APPROVE':
      if (s.onboarding.employer === 'verified') return s
      return {
        ...s,
        onboarding: { ...s.onboarding, employer: 'verified' },
        trace: trace(s, 'record-svc', '재직 확인 발급 (발급자: 고용주 서명) · 해시 앵커링 — 재직 기록 집계 시작'),
        events: ev(s, 'employer_verified'),
      }

    /* A6 — 근로자가 급여계좌를 사장님께 보낸다. 사장님 화면의 알림함에 새 알림으로 쌓인다.
       재직 확인 요청과는 별개의 알림이라 상태도 따로 둔다. */
    case 'SHARE_ACCOUNT': {
      const acct = s.onboarding.accountNo
      if (!acct) return s
      return {
        ...s,
        accountShare: { at: Date.now(), channel: a.channel, acct, read: false },
        events: ev(s, 'account_shared', `channel=${a.channel}`),
        trace: trace(s, 'orchestrator', `급여계좌 안내 발송 → 사장님 (${a.channel === 'kakao' ? '카카오톡' : 'SMS'})`),
      }
    }

    case 'FAMILY_READ':
      if (s.familyRead?.[a.kind]) return s
      return { ...s, familyRead: { ...s.familyRead, [a.kind]: true } }

    case 'EMPLOYER_READ_ACCOUNT':
      if (!s.accountShare || s.accountShare.read) return s
      return { ...s, accountShare: { ...s.accountShare, read: true } }

    case 'SET_SCENARIO':
      return { ...s, scenario: a.scenario, trace: trace(s, 'app', `시나리오 변경: ${a.scenario}`) }

    case 'TOGGLE_DARK':
      return { ...s, dark: !s.dark }

    case 'ESCALATE':
      return {
        ...s,
        events: ev(s, 'human_escalation', `reason=${a.reason} lang=${s.lang}`),
        trace: trace(s, 'orchestrator', `사람 연결 에스컬레이션 — ${a.reason} → ${PERSONAS[s.personaId].lang} 상담원 큐`),
      }

    default:
      return s
  }
}

const StoreCtx = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState('minh', 'onboarding'))
  return <StoreCtx.Provider value={{ state, dispatch }}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('StoreProvider missing')
  return ctx
}
