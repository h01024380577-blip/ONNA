import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { AgentPlan, AppState, ChatAction, ChatItem, DocAnswer, DocOcr, DocPassage, DocPhase, DocRun, FxDemo, OrchTask, HoldCode, Lang, PersonaId, RemitTrigger, Scenario, Screen, StepKey, Timing } from './types'
import { PERSONAS } from './mock/personas'
import { monthlyPayment } from './mock/loan'
import { assessCredit } from './agent/credit'
import { getQuote } from './mock/fx'
import { precheck, newTxId, newTraceId, MONTHLY_LIMIT } from './mock/rules'
import { collectSignals } from './agent/signals'
import { seedLedger } from './mock/ledger'
import { decideTiming, laterParts, nowPart, overrideNow } from './agent/timing'
import { applyFxDemo } from './mock/fxDemo'
import type { LedgerEntry } from './types'

export const SLA_DEMO_SEC = 30 // 파일럿 SLA 30분 → 데모 30초
export const ARRIVE_DEMO_SEC = 45 // 도착 웹훅 데모 45초
/** 계좌 개설 전에 A6이 표시하는 자리표시자 — 화면과 리듀서가 같은 값을 쓴다 */
export const A6_FALLBACK_ACCT = '508-12-000000'

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
  | { type: 'REMIT_START'; requestedAmount?: number } // 채팅에서 온 송금 업무
  | { type: 'ANALYSIS_PHASE'; phase: StepKey }
  | { type: 'ANALYSIS_RESULT'; plan: AgentPlan; source: 'llm' | 'template'; latencyMs: number }
  | { type: 'ANALYSIS_DONE' }
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
  | { type: 'CREDIT_NEWS_DISMISS' }
  | { type: 'CONFIRM_AMOUNT' } // B2 확정 → B3 (타이밍 새로 계산)
  | { type: 'TIMING_OVERRIDE' } // "지금 한 번에 보내기"
  | { type: 'TIMING_RESET' } // 에이전트 결정으로 되돌리기
  | { type: 'SCHEDULED_DUE' } // 데모: 예약일 도래
  | { type: 'SCHEDULED_CANCEL'; id: string }
  | { type: 'SET_FX_DEMO'; mode: FxDemo }
  | { type: 'CHAT_ASK'; text: string }
  | { type: 'ORCH_DONE'; id: number; tasks: OrchTask[]; text: string; action?: ChatAction; source: 'llm' | 'template' }
  | { type: 'DOC_START'; runId: number; origin: DocRun['origin']; question?: string }
  | { type: 'DOC_OCR'; runId: number; ocr: DocOcr }
  | { type: 'DOC_SEARCH'; runId: number; passages: DocPassage[]; failed: boolean }
  | { type: 'DOC_VERIFIED'; runId: number; answer: DocAnswer; source: NonNullable<DocRun['source']>; checkCount: number; fixedCount: number }
  | { type: 'DOC_PHASE'; runId: number; phase: DocPhase }
  | { type: 'DOC_DONE'; runId: number; latencyMs: number }
  | { type: 'DOC_ERROR'; runId: number }

function trace(s: AppState, actor: AppState['trace'][number]['actor'], msg: string): AppState['trace'] {
  return [...s.trace.slice(-199), { at: Date.now(), actor, traceId: newTraceId(), msg }]
}
function ev(s: AppState, name: string, data?: string): AppState['events'] {
  return [...s.events.slice(-199), { at: Date.now(), name, data }]
}
/** 원장에 한 줄 추가 — 최신순 유지. 세션 중 생긴 기록은 전부 검증된 기록이다 */
function book(s: AppState, e: Omit<LedgerEntry, 'at' | 'verified'> & { at?: number }): AppState['ledger'] {
  return [{ at: Date.now(), verified: true, ...e }, ...s.ledger]
}

export function initialState(persona: PersonaId, startAt: 'onboarding' | 'home'): AppState {
  const p = PERSONAS[persona]
  // acctNo()는 매번 다른 번호를 만든다 — 계좌번호가 쓰이는 곳이 여러 군데라 한 번만 뽑는다
  const acct = startAt === 'home' ? acctNo() : undefined
  const base: AppState = {
    personaId: persona,
    lang: startAt === 'home' ? p.lang : null,
    dark: false,
    fxDemo: 'real',
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
    scheduled: [],
    ledger: seedLedger(p, Date.now()),
    chat: [],
    queue: [],
    trace: [],
    events: [],
  }
  base.trace = [{ at: Date.now(), actor: 'orchestrator', traceId: newTraceId(), msg: `세션 시작 — 페르소나 ${p.name} (${p.lang}), 시작점 ${startAt === 'home' ? '홈' : '온보딩 A0'}` }]
  base.events = [{ at: Date.now(), name: startAt === 'home' ? 'session_started' : 'onboarding_started' }]
  return base
}

/* 송금 ⑥ — 지금 보이는 금액(draftAmount)에 대한 타이밍.
   저장된 타이밍이 같은 합계면 그대로(사용자 변경 보존), 아니면 새 신호로 다시 정한다.
   B3 화면과 EXECUTE 가 같은 함수를 써야 화면에 보인 대로 실행된다. */
export function timingFor(s: AppState): Timing {
  const total = s.draftAmount
  if (s.timing && s.timing.parts.reduce((a, x) => a + x.amount, 0) === total) return s.timing
  const p = PERSONAS[s.personaId]
  const sg = collectSignals(s, p, s.balance)
  const plan = s.analysis?.status === 'done' ? s.analysis.plan : undefined
  return decideTiming(total, sg, plan?.action ?? 'remit_full')
}

/* 송금 에이전트 실행 시작 — 급여 웹훅과 채팅이 같은 파이프라인을 쓴다.
   이어지는 ANALYSIS_* 는 useRemitAgent 가 보낸다. */
function startRemit(s: AppState, trigger: RemitTrigger, balanceAfter: number, requestedAmount?: number): AppState {
  const p = PERSONAS[s.personaId]
  const signals = collectSignals(s, p, balanceAfter)
  const st: AppState = {
    ...s,
    analysis: { status: 'running', phase: 'signals', startedAt: Date.now(), trigger, requestedAmount, signals, source: 'template' },
    proposal: undefined,
    draftAmount: 0,
    timing: undefined,
  }
  return {
    ...st,
    trace: trace(st, 'remit-agent', `① 신호 수집 (${trigger}) — 상한 ₩${signals.sendableMax.toLocaleString()} · 환율 ${signals.fxAdvantagePct}% (${signals.fxStrength}) · 흔들림 ${signals.fxRisk} · ② 상황 ${signals.situation.money}${requestedAmount ? ` · 요청 ₩${requestedAmount.toLocaleString()}` : ''}`),
  }
}

function acctNo(): string {
  return `508-12-${String(Math.floor(Math.random() * 900000) + 100000)}`
}

/* 제안 금액 계산은 agent/plan.ts 의 formulaAmount 로 옮겼다 — 이제 이 공식은
   에이전트가 실패했을 때의 폴백 경로에서만 쓴다 */

const docLive = (s: AppState, runId: number) => s.docRun?.runId === runId && s.docRun.status === 'running'

function baseReducer(s: AppState, a: Action): AppState {
  const p = PERSONAS[s.personaId]
  switch (a.type) {
    case 'CREDIT_NEWS_DISMISS':
      return s.creditNews ? { ...s, creditNews: undefined } : s

    case 'RESET':
      // 데모 설정(규정 점검 시나리오·다크 모드·신용 충족)은 세션 리셋·페르소나 전환에도 유지
      return { ...initialState(a.persona, a.startAt), scenario: s.scenario, dark: s.dark, creditReady: s.creditReady, fxDemo: s.fxDemo }

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
      const offer = assessCredit(s.ledger, p, s.creditReady, s.loanDraft.months)
      if (!offer.ready) return s
      const amount = Math.min(s.loanDraft.amount, offer.limit)
      const monthly = monthlyPayment(amount, s.loanDraft.months, offer.rate)
      let st: AppState = {
        ...s,
        balance: s.balance + amount,
        loan: { amount, months: s.loanDraft.months, rate: offer.rate, monthly, at: Date.now() },
        ledger: book(s, { id: `loan_${Date.now().toString(36)}`, kind: 'loan', dir: 'in', amount }),
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

    /* 웹훅 수신 = 거래 DB 입금 감지 → 송금 에이전트 분석 시작(그림대로 오케스트레이터를 거치지 않는다).
       제안 금액은 에이전트가 정하므로 여기서 만들지 않는다. 이어지는 ANALYSIS_* 는 useRemitAgent 가 보낸다. */
    case 'SALARY_CREDITED': {
      const balanceAfter = s.balance + p.salary
      const credited: AppState = {
        ...s,
        balance: balanceAfter,
        salaryEvent: { amount: p.salary, at: Date.now() },
        ledger: book(s, { id: `sal_${Date.now().toString(36)}`, kind: 'salary', dir: 'in', amount: p.salary }),
        screen: 'B0',
        events: ev(s, 'salary_credited', String(p.salary)),
        trace: trace(s, 'orchestrator', `WEBHOOK salary.credited ₩${p.salary.toLocaleString()} (거래 DB 입금 감지) → 송금 에이전트 직행`),
      }
      return startRemit(credited, 'salary', balanceAfter)
    }

    case 'REMIT_START':
      if (s.analysis?.status === 'running') return s
      return startRemit(
        { ...s, events: ev(s, 'remit_requested', `amount=${a.requestedAmount ?? '-'}`) },
        'chat',
        s.balance,
        a.requestedAmount,
      )

    case 'ANALYSIS_PHASE':
      if (s.analysis?.status !== 'running') return s
      return { ...s, analysis: { ...s.analysis, phase: a.phase } }

    /* LLM(또는 폴백) 결과 도착 → ③ 한도·생활비 확인은 코드가 판단한다.
       금액이 한도를 넘어도 막지 않는다 — B4 보류 흐름이 살아 있어야 한다. */
    case 'ANALYSIS_RESULT': {
      if (s.analysis?.status !== 'running') return s
      const pre = precheck(a.plan.amount, s.sentThisMonth, s.scenario)
      const tight = pre.result === 'HOLD' || a.plan.amount > s.analysis.signals.limitRemaining
      let st: AppState = {
        ...s,
        analysis: {
          ...s.analysis,
          phase: 'explain',
          plan: a.plan,
          source: a.source,
          latencyMs: a.latencyMs,
          precheck: { result: pre.result, code: pre.code },
          checkKey: tight ? 'agent.checkTight' : 'agent.checkOk',
        },
        trace: trace(s, 'remit-agent', `③ 송금안 ${a.source === 'llm' ? '완료 (LLM 판단)' : '폴백 (기본 계산)'} — ${a.plan.action} ₩${a.plan.amount.toLocaleString()} · ${a.latencyMs}ms`),
      }
      st = {
        ...st,
        trace: trace(st, 'rules-engine', `제안 사전점검 ${pre.result}${pre.code ? ` · ${pre.code}` : ''} — 한도 잔여 ₩${(MONTHLY_LIMIT - s.sentThisMonth).toLocaleString()}`),
      }
      return st
    }

    case 'ANALYSIS_DONE': {
      const an = s.analysis
      if (an?.status !== 'running' || !an.plan) return s
      return {
        ...s,
        analysis: { ...an, status: 'done', phase: 'done' },
        proposal: { amount: an.plan.amount, status: 'new' },
        draftAmount: an.plan.amount,
        events: ev(s, 'proposal_sent', `amount=${an.plan.amount} action=${an.plan.action} source=${an.source}`),
        trace: trace(s, 'orchestrator', an.trigger === 'salary'
          ? `④ 제안 전달 — 잠금화면 푸시 (${s.lang ?? p.lang})`
          : '④ 제안 전달 — 채팅 카드'),
      }
    }

    case 'PROPOSAL_ACTION': {
      const events = ev(s, 'proposal_action', a.action)
      if (a.action === 'later')
        return { ...s, proposal: s.proposal ? { ...s.proposal, status: 'snoozed' } : s.proposal, screen: 'B1', events, trace: trace(s, 'orchestrator', "'다음에' — 카드 접힘, 다음 급여일까지 재알림 없음") }
      if (a.action === 'change') return { ...s, screen: 'B2', events }
      return { ...s, screen: 'B3', timing: undefined, events }
    }

    case 'SET_DRAFT': {
      const ch = s.draftAmount !== a.amount
      return { ...s, draftAmount: a.amount, events: ch ? ev(s, 'amount_changed', `from=${s.draftAmount} to=${a.amount}`) : s.events }
    }

    case 'CONFIRM_AMOUNT':
      return { ...s, screen: 'B3', timing: undefined, events: ev(s, 'amount_confirmed', String(s.draftAmount)) }

    case 'TIMING_OVERRIDE':
      return {
        ...s,
        timing: overrideNow(s.draftAmount),
        events: ev(s, 'timing_override', 'now'),
        trace: trace(s, 'app', '사용자: 지금 한 번에 보내기로 변경'),
      }

    case 'TIMING_RESET':
      return { ...s, timing: undefined }

    /* 예약일 도래(데모) — 가장 이른 대기 건 하나. 지문으로 이미 승인했으므로
       통과면 바로 실행, 보류면 기존 B4 흐름. 어느 쪽이든 그 건은 처리됨 */
    case 'SCHEDULED_DUE': {
      const next = s.scheduled
        .filter((x) => x.status === 'waiting')
        .sort((x, y) => x.date.localeCompare(y.date) || x.at - y.at)[0]
      if (!next) return s
      const base: AppState = {
        ...s,
        scheduled: s.scheduled.map((x) => (x.id === next.id ? { ...x, status: 'done' as const } : x)),
        draftAmount: next.amount,
        timing: undefined,
        events: ev(s, 'scheduled_due', `${next.date}:${next.amount}`),
        trace: trace(s, 'orchestrator', `예약일 도래 ${next.date} — ₩${next.amount.toLocaleString()} 사전점검`),
      }
      const pre = precheck(next.amount, s.sentThisMonth, s.scenario)
      const quote = getQuote(p.currency, next.amount)
      if (pre.result === 'PASS') {
        const st: AppState = {
          ...base,
          quote,
          compliance: { result: 'PASS', refNo: pre.refNo, docUploaded: false },
          trace: trace(base, 'rules-engine', `예약 송금 판정 PASS · 확인번호 ${pre.refNo}`),
        }
        return baseReducer(st, { type: 'SEND_FINAL' })
      }
      return {
        ...base,
        quote,
        compliance: { result: 'HOLD', code: pre.code, docUploaded: false },
        screen: 'B4',
        trace: trace(base, 'rules-engine', `예약 송금 판정 HOLD · 코드 ${pre.code}`),
      }
    }

    case 'SCHEDULED_CANCEL':
      return {
        ...s,
        scheduled: s.scheduled.map((x) => (x.id === a.id && x.status === 'waiting' ? { ...x, status: 'cancelled' as const } : x)),
        events: ev(s, 'scheduled_cancelled', a.id),
      }

    /* 오케스트레이터 ① — 질문을 받아 의도 분석을 시작한다(useOrchestrator 가 이어받는다) */
    case 'CHAT_ASK': {
      const text = a.text.trim().slice(0, 500)
      if (!text || s.orch?.status === 'running') return s
      const id = Date.now()
      return {
        ...s,
        chat: [...s.chat, { id: `u${id}`, who: 'user', text }],
        orch: { id, message: text, status: 'running' },
        events: ev(s, 'chat_asked'),
        trace: trace(s, 'orchestrator', '사용자 질문 수신 → ① 의도 분석'),
      }
    }

    /* 오케스트레이터 ② Task 분업 — 전문 에이전트에 일을 나눠 준다.
       송금은 바로 시작하고, 서류는 사진을 기다리고, 신용은 카드가 그 자리에서 계산한다 */
    case 'ORCH_DONE': {
      if (s.orch?.id !== a.id || s.orch.status !== 'running') return s
      const cid = (k: string) => `a${a.id}_${k}`
      const work = a.tasks.filter((x) => x.agent !== 'general')
      let st: AppState = { ...s, orch: { ...s.orch, status: 'done', source: a.source } }
      const items: ChatItem[] = []
      if (work.length) items.push({ id: cid('route'), who: 'agent', kind: 'route', agents: work.map((x) => x.agent) })
      items.push({ id: cid('text'), who: 'agent', kind: 'text', text: a.text, action: a.action })
      for (const task of work) {
        if (task.agent === 'remit') {
          st = baseReducer(st, { type: 'REMIT_START', requestedAmount: task.amount ?? undefined })
          items.push({ id: cid('remit'), who: 'agent', kind: 'remit', runId: st.analysis!.startedAt })
        } else if (task.agent === 'doc') {
          items.push({ id: cid('doc'), who: 'agent', kind: 'docAsk' })
        } else if (task.agent === 'credit') {
          items.push({ id: cid('credit'), who: 'agent', kind: 'credit' })
        }
      }
      return {
        ...st,
        chat: [...st.chat, ...items],
        events: ev(st, 'orchestrated', `${a.source} ${a.tasks.map((x) => x.agent).join('+')}`),
        trace: trace(st, 'orchestrator', `② Task 분업 (${a.source === 'llm' ? 'LLM 의도 분석' : '키워드 폴백'}) → ${a.tasks.map((x) => x.agent + (x.amount ? ` ₩${x.amount.toLocaleString()}` : '')).join(' · ')}`),
      }
    }

    /* 서류 에이전트 — useDocAgent 가 단계마다 보낸다. 다른 실행의 늦은 결과는 버린다 */
    case 'DOC_START': {
      const run: DocRun = { runId: a.runId, origin: a.origin, question: a.question, status: 'running', phase: 'ocr' }
      return {
        ...s,
        docRun: run,
        chat: a.origin === 'chat' ? [...s.chat, { id: `d${a.runId}`, who: 'agent', kind: 'doc', runId: a.runId }] : s.chat,
        events: ev(s, 'doc_started', a.origin),
        trace: trace(s, 'doc-agent', `서류 에이전트 시작 (${a.origin}) → ① OCR 추출`),
      }
    }
    case 'DOC_OCR':
      if (!docLive(s, a.runId)) return s
      return {
        ...s,
        docRun: { ...s.docRun!, ocr: a.ocr, phase: 'search' },
        trace: trace(s, 'doc-agent', `① OCR — ${a.ocr.kind} · 신뢰도 ${a.ocr.confidence} → ② RAG 검색`),
      }
    case 'DOC_SEARCH':
      if (!docLive(s, a.runId)) return s
      return {
        ...s,
        docRun: { ...s.docRun!, passages: a.passages, searchFailed: a.failed, phase: 'verify' },
        trace: trace(s, 'doc-agent', `② 문서 Vector DB — ${a.failed ? '검색 실패' : `${a.passages.length}건`} → ③ CoVe`),
      }
    case 'DOC_VERIFIED':
      if (!docLive(s, a.runId)) return s
      return {
        ...s,
        docRun: { ...s.docRun!, answer: a.answer, source: a.source, checkCount: a.checkCount, fixedCount: a.fixedCount, phase: 'answer' },
        trace: trace(s, 'doc-agent', `③ CoVe — 검증 질문 ${a.checkCount} · 어긋남 ${a.fixedCount} (${a.source}) → ④ 근거 기반 답변`),
      }
    case 'DOC_PHASE':
      if (!docLive(s, a.runId)) return s
      return { ...s, docRun: { ...s.docRun!, phase: a.phase } }
    case 'DOC_DONE':
      if (!docLive(s, a.runId)) return s
      return {
        ...s,
        docRun: { ...s.docRun!, status: 'done', phase: 'done', latencyMs: a.latencyMs },
        events: ev(s, 'doc_answered', `${s.docRun!.ocr?.kind} ${s.docRun!.source}`),
        trace: trace(s, 'doc-agent', `⑤ 다음 행동 ${s.docRun!.answer?.actions.map((x) => x.kind).join(',') || '-'} · ${a.latencyMs}ms`),
      }
    case 'DOC_ERROR':
      if (!docLive(s, a.runId)) return s
      return { ...s, docRun: { ...s.docRun!, status: 'error' }, events: ev(s, 'doc_failed') }

    case 'SET_FX_DEMO':
      // FX 목 객체를 바꾸는 부작용 — 같은 모드 재적용이 안전해서 StrictMode 이중 호출에도 괜찮다
      applyFxDemo(a.mode)
      return { ...s, fxDemo: a.mode, trace: trace(s, 'app', `환율 상황 데모: ${a.mode}`) }

    case 'EXECUTE': {
      // ⑥ 타이밍 결정 — 지문으로 승인된 금액을 지금·나눠서·예약으로 (코드)
      const tm = timingFor(s)
      const nowAmt = nowPart(tm)
      const later = laterParts(tm)
      let base: AppState = {
        ...s,
        timing: tm,
        trace: trace(s, 'remit-agent', `⑥ 타이밍 결정 ${tm.rule}${tm.overridden ? ' (사용자 변경)' : ''} — ${tm.parts.map((x) => `${x.when} ₩${x.amount.toLocaleString()}`).join(' / ')}`),
      }
      if (later.length) {
        const at = Date.now()
        base = {
          ...base,
          scheduled: [
            ...base.scheduled,
            ...later.map((x, i) => ({ id: `sch_${at.toString(36)}_${i}`, amount: x.amount, date: x.when, rule: tm.rule, status: 'waiting' as const, at })),
          ],
          events: ev(base, 'remit_scheduled', later.map((x) => `${x.when}:${x.amount}`).join(',')),
        }
      }
      // 전액 예약 — 돈은 아직 나가지 않는다. 제안은 처리된 것으로 본다
      if (nowAmt <= 0) return { ...base, proposal: undefined, screen: 'B8' }

      // B3 생체인증 후 → POST /compliance/precheck (지금 보낼 몫만)
      base = { ...base, draftAmount: nowAmt }
      const pre = precheck(nowAmt, s.sentThisMonth, s.scenario)
      const quote = getQuote(p.currency, nowAmt)
      if (pre.result === 'PASS')
        return {
          ...base,
          quote,
          compliance: { result: 'PASS', refNo: pre.refNo, docUploaded: false },
          screen: 'B4',
          events: ev(base, 'compliance_result', 'PASS'),
          trace: trace(base, 'rules-engine', `판정 PASS · 확인번호 ${pre.refNo}`),
        }
      const code = pre.code as HoldCode
      let st: AppState = {
        ...base,
        quote,
        compliance: { result: 'HOLD', code, docUploaded: false },
        screen: 'B4',
        events: ev(base, 'compliance_result', `HOLD/${code}`),
        trace: trace(base, 'rules-engine', `판정 HOLD · 코드 ${code}`),
      }
      st = { ...st, trace: trace(st, 'compliance-agent', `트리거: 예외 — 코드 ${code} → 모국어 사유 1문장 + 행동 3개 구성 (LLM은 설명만, 판정은 규칙 엔진)`) }
      return st
    }

    case 'SEND_FINAL': {
      const quote = s.quote ?? getQuote(p.currency, s.draftAmount)
      const cancelMs = quote.cancelMin * 60_000
      const txId = newTxId()
      let st: AppState = {
        ...s,
        balance: s.balance - s.draftAmount - quote.fee,
        sentThisMonth: s.sentThisMonth + s.draftAmount,
        sessionRemits: s.sessionRemits + 1,
        proposal: undefined,
        // 원장 항목 id = tx id — 취소창 안에서 취소하면 이 줄을 회수한다
        ledger: book(s, { id: txId, kind: 'remit', dir: 'out', amount: s.draftAmount, fee: quote.fee, receive: quote.receive }),
        tx: {
          id: txId,
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
        ledger: s.ledger.filter((e) => e.id !== s.tx!.id),
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
      // 계좌번호가 없으면 예전엔 조용히 아무 일도 안 일어났다(버튼이 죽은 것처럼 보임).
      // A6이 화면에 쓰는 것과 같은 값을 써서 클릭은 언제나 반응하게 한다.
      const acct = s.onboarding.accountNo ?? A6_FALLBACK_ACCT
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

/* 거래 DB → 신용 축적 → 신용 확인. 원장이 바뀐 액션마다 전후 신용을 견줘
   "대출이 열렸어요" / "한도가 늘었어요" 알림을 만든다. 세션 초기화는 제외. */
export function reducer(s: AppState, a: Action): AppState {
  const n = baseReducer(s, a)
  if (a.type === 'RESET' || n.ledger === s.ledger) return n
  const p = PERSONAS[n.personaId]
  const before = assessCredit(s.ledger, p, s.creditReady)
  const after = assessCredit(n.ledger, p, n.creditReady)
  const kind = !before.ready && after.ready ? 'ready' : after.ready && after.limit > before.limit ? 'limitUp' : null
  if (!kind) return n
  return {
    ...n,
    creditNews: { kind, limit: after.limit, at: Date.now() },
    trace: trace(n, 'record-svc', `신용 확인 — 검증 ${after.creditMonths}개월 · 송금 ${after.verifiedRemits}건 → ${kind === 'ready' ? '대출 가능' : '한도 증가'} ₩${after.limit.toLocaleString()}`),
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
