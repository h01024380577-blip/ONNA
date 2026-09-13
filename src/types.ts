export type Lang = 'id' | 'ne' | 'vi' | 'en' | 'ko'
export type PersonaId = 'budi' | 'sita' | 'minh'
export type Currency = 'IDR' | 'NPR' | 'VND'

/** 과거 시세 — /api/fx 가 실값을 채워 줄 때만 존재한다 */
export type PastKey = 'weekAgo' | 'monthAgo'
export interface PastPoint {
  date: string // YYYY-MM-DD
  rate: number
  rateText: string
}

export type Screen =
  | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A41' | 'A42' | 'A5' | 'A6'
  | 'B0' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B7'
  | 'C1' | 'HELP'
  | 'D1' | 'D2' | 'D3' // 소액대출: 한도 안내 → 금액·기간 → 실행 완료

export type HoldCode =
  | 'HOLD_LIMIT_MONTHLY'
  | 'HOLD_DOC_INCOME'
  | 'HOLD_BENEFICIARY_NEW'

export type Scenario = 'auto' | 'pass' | HoldCode

export interface Persona {
  id: PersonaId
  name: string
  fullName: string
  lang: Lang
  currency: Currency
  salary: number
  autoDebit: number
  employer: string
  employerKo: string
  area: string
  beneficiary: { name: string; bank: string; masked: string }
  /** base record before this session's activity */
  monthsEmployed: number
  remitCount: number
  monthsToCredit: number
  /** ordered family-notification channels, first = default (RM-11) */
  channels: string[]
}

export interface Quote {
  rate: number
  rateText: string
  receive: number
  fee: number
  brokerDelta: number
  etaKey: 'evening' | 'hour1' | 'morning'
  cancelMin: number
}

export interface TraceEvent {
  at: number
  actor: 'orchestrator' | 'remit-agent' | 'compliance-agent' | 'rules-engine' | 'bank-core' | 'record-svc' | 'app'
  traceId: string
  msg: string
}

export interface AppEvent {
  at: number
  name: string
  data?: string
}

/** 급여 입금 때 에이전트가 고를 수 있는 행동 — 금액·타이밍만 다룬다 */
export type PlanAction = 'remit_full' | 'remit_adjust' | 'later'

/** 사고과정 4단계. check(한도·생활비)만 코드가 문장을 쓴다 */
export type StepKey = 'signals' | 'compare' | 'check' | 'decide'

/** LLM 에게 넘기는 근거 값 — 전부 코드가 계산한다 */
export interface AgentSignals {
  salary: number
  autoDebit: number
  balanceAfter: number
  livingFloor: number
  /** 이 금액까지는 보내도 계좌가 비지 않는다 = balanceAfter − autoDebit */
  sendableMax: number
  sentThisMonth: number
  limitRemaining: number
  homeCurrency: Currency
  fxRate: number
  fxRateText: string
  fxAdvantagePct: number
  fxBasis: '90d-average' | 'reference'
  fxStrength: 'clearly-better' | 'slightly-better' | 'same' | 'lower'
  fxPast?: Partial<Record<PastKey, PastPoint>>
  monthsEmployed: number
  remitCount: number
  monthsToCredit: number
  creditReady: boolean
  loanMonthly?: number
  today: string
}

export interface AgentPlan {
  action: PlanAction
  amount: number
  say: string
  why: string
  steps: Record<'signals' | 'compare' | 'decide', string>
  rejected?: Array<{ action: PlanAction; text: string }>
}

export interface Analysis {
  status: 'running' | 'done'
  phase: StepKey | 'done'
  /** 이 분석 회차의 식별자 — 훅이 늦게 도착한 응답을 버리는 기준 */
  startedAt: number
  signals: AgentSignals
  source: 'llm' | 'template'
  latencyMs?: number
  precheck?: { result: 'PASS' | 'HOLD'; code?: HoldCode }
  /** ③단계 문구 키 — 한도 이야기는 LLM 이 못 하게 되어 있어 코드가 쓴다 */
  checkKey?: 'agent.checkOk' | 'agent.checkTight'
  plan?: AgentPlan
}

export interface QueueItem {
  id: string
  user: string
  amount: number
  code: HoldCode
  at: number
  status: 'pending' | 'approved'
}

export interface AppState {
  personaId: PersonaId
  lang: Lang | null
  dark: boolean
  screen: Screen
  scenario: Scenario

  onboarding: {
    startedAt?: number
    completedAt?: number
    idAttempts: number
    idOk: boolean
    faceOk: boolean
    employer: 'none' | 'pending' | 'verified'
    /** 연결한 사업장 표시명 — 검색으로 고른 회사 (미선택 시 페르소나 기본값) */
    employerName?: string
    consents: { salary: boolean; remit: boolean; employment: boolean }
    accountNo?: string
  }

  livingFloor: number
  balance: number
  sentThisMonth: number

  salaryEvent?: { amount: number; at: number }

  /** 급여 입금 웹훅에 대한 에이전트 분석 — 세션 데이터라 RESET 때 이월하지 않는다 */
  analysis?: Analysis
  proposal?: { amount: number; status: 'new' | 'snoozed' }
  draftAmount: number
  quote?: Quote

  compliance?: {
    result: 'PASS' | 'HOLD'
    code?: HoldCode
    refNo?: string
    docUploaded: boolean
  }

  tx?: {
    id: string
    amount: number
    receive: number
    at: number
    cancelUntil: number
    status: 'processing' | 'arrived' | 'cancelled'
    sharedVia?: string
    /** 공유·도착 시각 — 가족 화면 메시지함의 수신 시각으로 쓴다 */
    sharedAt?: number
    arrivedAt?: number
  }

  /** 가족 화면에서 아직 열어보지 않은 메시지 추적 — 탭 배지용 */
  familyRead?: { shared?: boolean; arrived?: boolean }

  /** A6에서 근로자가 사장님께 보낸 급여계좌 안내 — 사장님 화면 알림함에 뜬다 */
  accountShare?: { at: number; channel: 'kakao' | 'sms'; acct: string; read: boolean }

  rule: null | { amount: number; fxMin: string; floor: number }

  /** 데모: 신용 이력 6개월 충족 강제 (기본은 페르소나 monthsToCredit 기준) */
  creditReady: boolean
  loanDraft: { amount: number; months: number }
  loan?: { amount: number; months: number; rate: number; monthly: number; at: number }

  /** extra activity this session (added to persona base) */
  sessionRemits: number

  queue: QueueItem[]
  trace: TraceEvent[]
  events: AppEvent[]
}
