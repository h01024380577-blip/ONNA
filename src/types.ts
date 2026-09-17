import type { DocAnswer, DocKind } from './agent/docRules'
export type { DocAnswer, DocKind }

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
  | 'B0' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B7' | 'B8' // B8 예약 완료
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
  actor: 'orchestrator' | 'remit-agent' | 'compliance-agent' | 'rules-engine' | 'bank-core' | 'record-svc' | 'app' | 'doc-agent' | 'credit-agent'
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

/** 송금 ⑥ 타이밍 결정 — 승인된 금액을 언제·얼마로 나눌지 (코드) */
export interface TimingPart {
  when: 'now' | string // 'now' 또는 YYYY-MM-DD
  amount: number
}
export interface Timing {
  rule: 'now' | 'split' | 'wait'
  /** 화면 이유 문구 키 — tm.why.<cause> */
  cause: 'normal' | 'rate-moving' | 'rate-low' | 'agent-later' | 'user'
  parts: TimingPart[]
  /** 사용자가 "지금 한 번에"로 바꿨다 */
  overridden?: boolean
}

/** 예약된 송금 — 예약일(데모: 콘솔 "예약일 도래")에 사전점검 후 실행 */
export interface ScheduledRemit {
  id: string
  amount: number
  date: string // YYYY-MM-DD
  rule: Timing['rule']
  status: 'waiting' | 'done' | 'cancelled'
  at: number
}

/** 송금 분석 4단계 — ①② 코드, ③④ LLM 한 번의 응답(③ 뒤에 규칙 엔진 사전점검) */
export type StepKey = 'signals' | 'situation' | 'plan' | 'explain'
export type RemitTrigger = 'salary' | 'chat'

/** LLM 에게 넘기는 근거 값 — 전부 코드가 계산한다 */
/* 지출 요약(SpendingSummary)은 원장에서 계산해 신호에 평평하게 합친다 */
export interface AgentSignals extends SpendingSummary {
  salary: number
  autoDebit: number
  balanceAfter: number
  livingFloor: number
  /** 생활비·자동이체를 남긴 상한 = balanceAfter − autoDebit − livingFloor */
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
  fxRisk: FxRisk
  /** 오늘·1주 전·1달 전 시세의 (최대−최소)/오늘 × 100, 소수 1자리. 과거 시세가 없으면 없다 */
  fxSwingPct?: number
  monthsEmployed: number
  remitCount: number
  monthsToCredit: number
  creditReady: boolean
  loanMonthly?: number
  today: string
  situation: Situation
}

export interface AgentPlan {
  action: PlanAction
  amount: number
  say: string
  why: string
  steps: Record<'signals' | 'situation' | 'compare' | 'decide', string>
  rejected?: Array<{ action: PlanAction; text: string }>
}

export interface Analysis {
  status: 'running' | 'done'
  phase: StepKey | 'done'
  /** 이 분석 회차의 식별자 — 훅이 늦게 도착한 응답을 버리는 기준 */
  startedAt: number
  /** 급여 웹훅에서 왔는지, 채팅 요청에서 왔는지 */
  trigger: RemitTrigger
  /** 채팅에서 사용자가 말한 금액 */
  requestedAmount?: number
  signals: AgentSignals
  source: 'llm' | 'template'
  latencyMs?: number
  precheck?: { result: 'PASS' | 'HOLD'; code?: HoldCode }
  /** ③단계 문구 키 — 한도 이야기는 LLM 이 못 하게 되어 있어 코드가 쓴다 */
  checkKey?: 'agent.checkOk' | 'agent.checkTight'
  plan?: AgentPlan
}

/** 입출금 원장 한 줄 — 시드된 과거 + 세션 중 실제 이벤트 */
export type LedgerKind = 'salary' | 'remit' | 'rent' | 'utility' | 'spend' | 'loan'
export interface LedgerEntry {
  id: string
  at: number // epoch ms
  kind: LedgerKind
  dir: 'in' | 'out'
  /** 원화, 항상 양수. 송금은 수수료를 뺀 보낸 금액 */
  amount: number
  /** 송금 수수료 — 화면에 "수수료 포함"으로 표기 */
  fee?: number
  /** 송금 — 가족이 받은 본국 통화 금액 */
  receive?: number
  /** i18n 키 — spend·utility 의 세부 항목 (ledger.m.grocery 등) */
  memoKey?: string
  /** ONNA 로 검증된 기록인지 — 신용 산정은 이 줄만 센다 */
  verified: boolean
}

/** 원장에서 코드가 계산한 지출 요약 — 판정(spendPace)도 코드가 내린다 */
export type SpendPace = 'higher' | 'usual' | 'lower'
export interface SpendingSummary {
  /** 최근 3개 완결월 월평균 생활 지출(spend+utility) */
  spendAvg3m: number
  /** 이번 달 지금까지 생활 지출 */
  spendThisMonth: number
  spendPace: SpendPace
  /** 다음 급여일 전에 더 나갈 것으로 보이는 돈 */
  upcomingDebits: number
  nextRentDate: string // YYYY-MM-DD
  nextSalaryDate: string // YYYY-MM-DD
  /** 기다렸다 보낼 날 — 월세가 아직이면 월세일, 이미 나갔으면 오늘 + 7일 */
  laterDate: string // YYYY-MM-DD
  /** 최근 3개 완결월 월평균 송금액 */
  remitAvg3m: number
}

/** 환율이 요즘 얼마나 흔들렸는지 — 과거 시세가 실값일 때만 판정한다 */
export type FxRisk = 'unknown' | 'calm' | 'moving' | 'volatile'

/** 데모 콘솔 "환율 상황" — 송금 타이밍 분기 시연용 */
export type FxDemo = 'real' | 'volatile' | 'low'

/** 송금 ② 지금 상황 판단 — 코드가 내린 판정. LLM 은 설명만 한다 */
export interface Situation {
  money: 'roomy' | 'tight'
  rate: AgentSignals['fxStrength']
  risk: FxRisk
  sentAlready: boolean
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
  fxDemo: FxDemo
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
  /** 송금 ⑥ 타이밍 — 승인 뒤 코드가 정한 값. 사용자가 바꾸면 overridden */
  timing?: Timing
  /** 예약된 송금 — 세션 데이터 */
  scheduled: ScheduledRemit[]

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
  /** 거래 DB 가 바뀌어 신용이 좋아졌을 때 홈에 띄우는 알림 */
  creditNews?: { kind: 'ready' | 'limitUp'; limit: number; at: number }

  /** extra activity this session (added to persona base) */
  sessionRemits: number

  /** 입출금 원장 — 시드된 과거 6개월 + 세션 이벤트. 최신순 */
  ledger: LedgerEntry[]

  /** 채팅 기록 — 에이전트 실행이 스토어에 있어서 채팅도 스토어에 둔다(탭을 오가도 남는다) */
  chat: ChatItem[]
  /** 오케스트레이터 실행 한 회차 */
  orch?: Orchestration
  /** 서류 에이전트 실행 한 회차 — 사진은 여기 넣지 않는다(agent/docImages.ts) */
  docRun?: DocRun

  queue: QueueItem[]
  trace: TraceEvent[]
  events: AppEvent[]
}

/** 오케스트레이터가 일을 나눠 주는 곳 */
export type AgentKind = 'remit' | 'doc' | 'credit' | 'general'
export interface OrchTask {
  agent: AgentKind
  /** remit 만 — 사용자 문장에서 읽힌 금액 */
  amount?: number | null
}
/** 채팅 답 아래 버튼 — 라벨은 i18n 키로 저장한다(언어가 바뀌어도 맞게) */
export interface ChatAction {
  labelKey: string
  screen?: Screen
  escalate?: boolean
}

export type ChatItem =
  | { id: string; who: 'user'; text: string }
  | { id: string; who: 'agent'; kind: 'text'; text: string; action?: ChatAction }
  | { id: string; who: 'agent'; kind: 'route'; agents: AgentKind[] }
  | { id: string; who: 'agent'; kind: 'remit'; runId: number }
  | { id: string; who: 'agent'; kind: 'docAsk' }
  | { id: string; who: 'agent'; kind: 'doc'; runId: number }
  | { id: string; who: 'agent'; kind: 'credit' }

export interface Orchestration {
  id: number
  message: string
  status: 'running' | 'done'
  /** LLM 의도 분석이었는지, 키워드 폴백이었는지 */
  source?: 'llm' | 'template'
}

/** 서류 에이전트 5단계 */
export type DocPhase = 'ocr' | 'search' | 'verify' | 'answer' | 'actions' | 'done'
export interface DocField { label: string; value: string }
export interface DocOcr {
  kind: DocKind
  title: string | null
  rawText: string
  amount: string | null
  dueDate: string | null
  issuer: string | null
  fields: DocField[]
  summary: string
  koPhrase: string
  confidence: 'high' | 'medium' | 'low'
}
export interface DocPassage {
  id: string
  docId: string
  title: string
  source: string
  url: string | null
  snippet: string
  similarity: number
}
export interface DocRun {
  runId: number
  origin: 'help' | 'chat'
  question?: string
  status: 'running' | 'done' | 'error'
  phase: DocPhase
  ocr?: DocOcr
  passages?: DocPassage[]
  searchFailed?: boolean
  checkCount?: number
  fixedCount?: number
  answer?: DocAnswer
  /** verified: 검증 통과(또는 수정 완료) · partly: 확인된 항목만 · ocr-only: 서류에서 읽은 것만 */
  source?: 'verified' | 'partly' | 'ocr-only'
  latencyMs?: number
}
