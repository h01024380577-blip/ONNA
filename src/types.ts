export type Lang = 'id' | 'ne' | 'vi' | 'en' | 'ko'
export type PersonaId = 'budi' | 'sita' | 'minh'
export type Currency = 'IDR' | 'NPR' | 'VND'

export type Screen =
  | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6'
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
  }

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
