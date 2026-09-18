import { afterEach, describe, expect, it } from 'vitest'
import { initialState, reducer } from './store'
import { assessCredit } from './agent/credit'
import { failDocRun } from './agent/useDocAgent'
import { PERSONAS } from './mock/personas'
import type { AppState } from './types'

const run = (s: AppState, ...actions: Parameters<typeof reducer>[1][]) => actions.reduce(reducer, s)

describe('신용 알림 (거래 DB → 신용)', () => {
  it('Budi 급여 입금 → 대출 가능 알림', () => {
    const s = run(initialState('budi', 'home'), { type: 'SALARY_CREDITED' })
    expect(s.creditNews?.kind).toBe('ready')
    expect(s.creditNews?.limit).toBe(assessCredit(s.ledger, PERSONAS.budi).limit)
  })

  it('준비 전인 사람은 급여가 들어와도 알림이 없다', () => {
    const s = run(initialState('sita', 'home'), { type: 'SALARY_CREDITED' })
    expect(s.creditNews).toBeUndefined()
  })

  it('대출 가능한 상태에서 송금하면 한도 증가 알림', () => {
    let s = run(initialState('budi', 'home'), { type: 'SALARY_CREDITED' }, { type: 'CREDIT_NEWS_DISMISS' })
    expect(s.creditNews).toBeUndefined()
    s = run({ ...s, scenario: 'pass', draftAmount: 300_000 }, { type: 'EXECUTE' }, { type: 'SEND_FINAL' })
    expect(s.creditNews?.kind).toBe('limitUp')
  })

  it('세션 초기화는 알림을 만들지 않는다', () => {
    const s = run(initialState('budi', 'home'), { type: 'RESET', persona: 'minh', startAt: 'home' })
    expect(s.creditNews).toBeUndefined()
  })

  it('대출 실행은 신용 산정 한도를 넘지 않는다', () => {
    let s = run(initialState('budi', 'home'), { type: 'SALARY_CREDITED' })
    s = run(s, { type: 'SET_LOAN_DRAFT', amount: 9_000_000, months: 12 }, { type: 'LOAN_EXECUTE' })
    expect(s.loan?.amount).toBe(assessCredit(s.ledger, PERSONAS.budi).limit)
  })

  it('준비 전에는 대출이 실행되지 않는다', () => {
    const s = run(initialState('sita', 'home'), { type: 'SET_LOAN_DRAFT', amount: 500_000, months: 12 }, { type: 'LOAN_EXECUTE' })
    expect(s.loan).toBeUndefined()
  })
})


describe('타이밍 결정 → 실행·예약', () => {
  afterEach(() => { reducer(initialState('minh', 'home'), { type: 'SET_FX_DEMO', mode: 'real' }) })

  const ready = (mode: 'real' | 'volatile' | 'low') =>
    run(
      initialState('minh', 'home'),
      { type: 'SET_FX_DEMO', mode },
      { type: 'SET_SCENARIO', scenario: 'pass' },
      { type: 'SET_DRAFT', amount: 600_000 },
      { type: 'CONFIRM_AMOUNT' },
    )

  it('금액 확정은 B3 으로 가고 이전 타이밍을 지운다', () => {
    const s = ready('real')
    expect(s.screen).toBe('B3')
    expect(s.timing).toBeUndefined()
  })

  it('평소: 지금 전액', () => {
    const s = run(ready('real'), { type: 'EXECUTE' })
    expect(s.screen).toBe('B4')
    expect(s.draftAmount).toBe(600_000)
    expect(s.scheduled).toHaveLength(0)
    expect(s.timing?.rule).toBe('now')
  })

  it('흔들림: 절반 지금 송금 + 나머지 예약', () => {
    const s = run(ready('volatile'), { type: 'EXECUTE' }, { type: 'SEND_FINAL' })
    expect(s.tx?.amount).toBe(300_000)
    expect(s.scheduled).toMatchObject([{ amount: 300_000, status: 'waiting', rule: 'split' }])
    expect(s.ledger[0]).toMatchObject({ kind: 'remit', amount: 300_000, verified: true })
    expect(s.timing?.rule).toBe('split')
  })

  it('낮은 날: 전액 예약, 돈은 그대로, 제안은 처리됨', () => {
    const s0 = ready('low')
    const s = run(s0, { type: 'EXECUTE' })
    expect(s.screen).toBe('B8')
    expect(s.balance).toBe(s0.balance)
    expect(s.compliance).toBeUndefined()
    expect(s.proposal).toBeUndefined()
    expect(s.scheduled[0]).toMatchObject({ amount: 600_000, status: 'waiting' })
  })

  it('사용자가 "지금 한 번에"로 바꾸면 예약 없음', () => {
    const s = run(ready('volatile'), { type: 'TIMING_OVERRIDE' }, { type: 'EXECUTE' })
    expect(s.draftAmount).toBe(600_000)
    expect(s.scheduled).toHaveLength(0)
    expect(s.timing?.overridden).toBe(true)
  })

  it('되돌리면 에이전트 결정으로', () => {
    const s = run(ready('volatile'), { type: 'TIMING_OVERRIDE' }, { type: 'TIMING_RESET' }, { type: 'EXECUTE' })
    expect(s.scheduled).toHaveLength(1)
  })

  it('예약일 도래 — 통과면 바로 송금(B5)', () => {
    let s = run(ready('low'), { type: 'EXECUTE' })
    const sent = s.sentThisMonth
    s = run(s, { type: 'SCHEDULED_DUE' })
    expect(s.screen).toBe('B5')
    expect(s.tx?.amount).toBe(600_000)
    expect(s.sentThisMonth).toBe(sent + 600_000)
    expect(s.scheduled[0].status).toBe('done')
    expect(s.timing).toBeUndefined()
  })

  it('예약일 도래 — 보류면 B4', () => {
    const s = run(
      ready('low'),
      { type: 'EXECUTE' },
      { type: 'SET_SCENARIO', scenario: 'HOLD_DOC_INCOME' },
      { type: 'SCHEDULED_DUE' },
    )
    expect(s.screen).toBe('B4')
    expect(s.compliance?.result).toBe('HOLD')
    expect(s.draftAmount).toBe(600_000)
    expect(s.scheduled[0].status).toBe('done')
  })

  it('예약 취소 — 취소한 건은 실행되지 않는다', () => {
    let s = run(ready('low'), { type: 'EXECUTE' })
    s = run(s, { type: 'SCHEDULED_CANCEL', id: s.scheduled[0].id })
    expect(s.scheduled[0].status).toBe('cancelled')
    expect(run(s, { type: 'SCHEDULED_DUE' }).tx).toBeUndefined()
  })

  it('환율 상황 데모는 세션 초기화에도 유지', () => {
    const s = run(ready('volatile'), { type: 'RESET', persona: 'budi', startAt: 'home' })
    expect(s.fxDemo).toBe('volatile')
    expect(s.scheduled).toEqual([])
  })
})

describe('송금 에이전트 시작', () => {
  it('급여 웹훅 → 급여 트리거 분석, 잠금화면', () => {
    const s = run(initialState('minh', 'home'), { type: 'SALARY_CREDITED' })
    expect(s.analysis).toMatchObject({ status: 'running', phase: 'signals', trigger: 'salary' })
    expect(s.screen).toBe('B0')
  })

  it('채팅 요청 → 채팅 트리거 분석, 화면은 그대로, 잔액 기준 신호', () => {
    const s0 = initialState('minh', 'home')
    const s = run(s0, { type: 'REMIT_START', requestedAmount: 500_000 })
    expect(s.analysis).toMatchObject({ trigger: 'chat', requestedAmount: 500_000 })
    expect(s.screen).toBe(s0.screen)
    expect(s.analysis?.signals.balanceAfter).toBe(s0.balance)
  })

  it('이미 도는 분석이 있으면 새로 시작하지 않는다', () => {
    const s1 = run(initialState('minh', 'home'), { type: 'SALARY_CREDITED' })
    const s2 = run(s1, { type: 'REMIT_START', requestedAmount: 500_000 })
    expect(s2.analysis).toBe(s1.analysis)
  })

  it('결과가 오면 ④ 이유 설명 단계, 끝나면 제안', () => {
    const s1 = run(initialState('minh', 'home'), { type: 'REMIT_START' })
    const plan = {
      action: 'remit_full' as const, amount: 300_000, say: 'a', why: 'b',
      steps: { signals: 'c', situation: 'd', compare: 'e', decide: 'f' },
    }
    const s2 = run(s1, { type: 'ANALYSIS_RESULT', plan, source: 'llm', latencyMs: 10 })
    expect(s2.analysis?.phase).toBe('explain')
    const s3 = run(s2, { type: 'ANALYSIS_DONE' })
    expect(s3.proposal).toEqual({ amount: 300_000, status: 'new' })
  })
})

describe('오케스트레이터', () => {
  it('질문 → 사용자 말풍선 + 의도 분석 시작, 도는 중엔 새 질문을 받지 않는다', () => {
    const s = run(initialState('minh', 'home'), { type: 'CHAT_ASK', text: '50만 보내줘' })
    expect(s.chat).toMatchObject([{ who: 'user', text: '50만 보내줘' }])
    expect(s.orch).toMatchObject({ status: 'running', message: '50만 보내줘' })
    expect(run(s, { type: 'CHAT_ASK', text: '또' }).chat).toHaveLength(1)
  })

  it('분업 결과 → 라우팅 안내 + 안내 문장 + 사진 요청 + 송금 카드(채팅 분석 시작)', () => {
    const s1 = run(initialState('minh', 'home'), { type: 'CHAT_ASK', text: '고지서 뭐예요? 50만 보내줘' })
    const s2 = run(s1, {
      type: 'ORCH_DONE', id: s1.orch!.id, source: 'llm', text: '맡길게요',
      tasks: [{ agent: 'doc' }, { agent: 'remit', amount: 500_000 }],
    })
    expect(s2.orch?.status).toBe('done')
    expect(s2.orch?.source).toBe('llm')
    expect(s2.chat.slice(1).map((m) => (m.who === 'agent' ? m.kind : m.who))).toEqual(['route', 'text', 'docAsk', 'remit'])
    expect(s2.analysis).toMatchObject({ trigger: 'chat', requestedAmount: 500_000, status: 'running' })
    const card = s2.chat.find((m) => m.who === 'agent' && m.kind === 'remit')
    expect(card).toMatchObject({ runId: s2.analysis!.startedAt })
  })

  it('general 만이면 답 문장 하나', () => {
    const s1 = run(initialState('minh', 'home'), { type: 'CHAT_ASK', text: '안녕' })
    const s2 = run(s1, { type: 'ORCH_DONE', id: s1.orch!.id, source: 'template', text: '안녕하세요', tasks: [{ agent: 'general' }] })
    expect(s2.chat.slice(1)).toMatchObject([{ who: 'agent', kind: 'text', text: '안녕하세요' }])
    expect(s2.analysis).toBeUndefined()
  })

  it('늦게 온 결과(다른 id)는 버린다', () => {
    const s1 = run(initialState('minh', 'home'), { type: 'CHAT_ASK', text: '안녕' })
    const s2 = run(s1, { type: 'ORCH_DONE', id: 1, source: 'llm', text: 'x', tasks: [{ agent: 'general' }] })
    expect(s2).toBe(s1)
  })

  it('세션 초기화는 채팅을 비운다', () => {
    const s = run(initialState('minh', 'home'), { type: 'CHAT_ASK', text: '안녕' }, { type: 'RESET', persona: 'minh', startAt: 'home' })
    expect(s.chat).toEqual([])
    expect(s.orch).toBeUndefined()
  })
})

describe('서류 에이전트 상태', () => {
  const ocr = {
    kind: 'utility_bill' as const, title: '가스 요금', rawText: '청구금액 15,520원', amount: '15,520원',
    dueDate: '2026. 10. 05.', issuer: '한빛도시가스', fields: [], summary: '가스 요금이에요.', koPhrase: '이 요금 알려 주세요.', confidence: 'high' as const,
  }
  const answer = { summary: 's', points: [{ id: 'p1', text: 't', cites: ['ocr'] }], actions: [] }

  it('도움 화면 실행: 단계가 순서대로 넘어가고 끝난다', () => {
    let s = run(initialState('minh', 'home'), { type: 'DOC_START', runId: 7, origin: 'help' })
    expect(s.docRun).toMatchObject({ runId: 7, status: 'running', phase: 'ocr' })
    s = run(s, { type: 'DOC_OCR', runId: 7, ocr })
    expect(s.docRun?.phase).toBe('search')
    s = run(s, { type: 'DOC_SEARCH', runId: 7, passages: [], failed: false })
    expect(s.docRun?.phase).toBe('verify')
    s = run(s, { type: 'DOC_VERIFIED', runId: 7, answer, source: 'verified', checkCount: 3, fixedCount: 1 })
    expect(s.docRun).toMatchObject({ phase: 'answer', checkCount: 3, fixedCount: 1 })
    s = run(s, { type: 'DOC_PHASE', runId: 7, phase: 'actions' }, { type: 'DOC_DONE', runId: 7, latencyMs: 9000 })
    expect(s.docRun).toMatchObject({ status: 'done', phase: 'done', latencyMs: 9000 })
  })

  it('채팅 실행은 채팅에 카드를 붙인다', () => {
    const s = run(initialState('minh', 'home'), { type: 'DOC_START', runId: 8, origin: 'chat', question: '뭐예요?' })
    expect(s.chat.at(-1)).toMatchObject({ kind: 'doc', runId: 8 })
    expect(s.docRun?.question).toBe('뭐예요?')
  })

  it('다른 실행의 늦은 결과는 버린다', () => {
    const s1 = run(initialState('minh', 'home'), { type: 'DOC_START', runId: 9, origin: 'help' })
    expect(run(s1, { type: 'DOC_OCR', runId: 1, ocr })).toBe(s1)
  })

  it('실패', () => {
    const s = run(initialState('minh', 'home'), { type: 'DOC_START', runId: 10, origin: 'help' }, { type: 'DOC_ERROR', runId: 10 })
    expect(s.docRun?.status).toBe('error')
  })

  it('읽지 못한 파일(너무 큰 PDF 등)은 조용히 넘기지 않고 실패 카드로 보인다 — 채팅에도 카드가 남는다', () => {
    const actions: Parameters<typeof reducer>[1][] = []
    failDocRun((a) => actions.push(a), 'chat')
    const s = run(initialState('minh', 'home'), ...actions)
    expect(s.docRun).toMatchObject({ origin: 'chat', status: 'error' })
    expect(s.chat.at(-1)).toMatchObject({ kind: 'doc', runId: s.docRun?.runId })
  })
})
