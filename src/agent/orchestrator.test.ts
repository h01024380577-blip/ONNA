import { describe, expect, it } from 'vitest'
import { buildChatCtx, fallbackReply, fallbackTasks, handoffText, parseAmount, validateTasks } from './orchestrator'
import { initialState } from '../store'
import { PERSONAS } from '../mock/personas'
import { assessCredit } from './credit'

describe('parseAmount', () => {
  it('만 단위', () => expect(parseAmount('50만 원 보내줘')).toBe(500_000))
  it('쉼표·점 구분', () => {
    expect(parseAmount('kirim 500.000')).toBe(500_000)
    expect(parseAmount('send 500,000 won')).toBe(500_000)
  })
  it('숫자가 없으면 null', () => expect(parseAmount('환율 알려줘')).toBeNull())
})

describe('validateTasks', () => {
  it('허용 밖 agent 는 버리고, 없으면 general', () => {
    expect(validateTasks([{ agent: 'hack' }], 'hi')).toEqual([{ agent: 'general' }])
    expect(validateTasks('nope', 'hi')).toEqual([{ agent: 'general' }])
  })
  it('최대 2개, 같은 agent 는 한 번', () => {
    const t = validateTasks([{ agent: 'doc' }, { agent: 'doc' }, { agent: 'credit' }, { agent: 'remit' }], 'x')
    expect(t).toEqual([{ agent: 'doc' }, { agent: 'credit' }])
  })
  it('다른 일이 있으면 general 은 뺀다', () => {
    expect(validateTasks([{ agent: 'general' }, { agent: 'credit' }], 'x')).toEqual([{ agent: 'credit' }])
  })
  it('송금 금액은 사용자 문장에서 읽힌 값만 인정한다', () => {
    expect(validateTasks([{ agent: 'remit', amount: 500_000 }], '50만 보내줘')).toEqual([{ agent: 'remit', amount: 500_000 }])
    // 모델이 지어낸 금액 → 문장의 금액으로
    expect(validateTasks([{ agent: 'remit', amount: 900_000 }], '50만 보내줘')).toEqual([{ agent: 'remit', amount: 500_000 }])
    // 문장에 금액이 없으면 null
    expect(validateTasks([{ agent: 'remit', amount: 900_000 }], '엄마한테 보내줘')).toEqual([{ agent: 'remit', amount: null }])
  })
  it('지금 제안 금액과 같으면 인정한다 ("그 금액으로 보내줘")', () => {
    expect(validateTasks([{ agent: 'remit', amount: 620_000 }], '그걸로 보내줘', 620_000)).toEqual([{ agent: 'remit', amount: 620_000 }])
  })
})

describe('fallbackTasks', () => {
  it('섞인 요청을 문장 순서대로 나눈다', () => {
    expect(fallbackTasks('이 고지서 뭐예요? 그리고 50만원 보내줘')).toEqual([
      { agent: 'doc' },
      { agent: 'remit', amount: 500_000 },
    ])
  })
  it('기록·대출 → credit', () => {
    expect(fallbackTasks('대출 받을 수 있어요?')).toEqual([{ agent: 'credit' }])
    expect(fallbackTasks('송금 기록 보여줘')).toEqual([{ agent: 'credit' }])
  })
  it('환율·잔액·인사 → general', () => {
    expect(fallbackTasks('오늘 환율 알려줘')).toEqual([{ agent: 'general' }])
    expect(fallbackTasks('xin chào')).toEqual([{ agent: 'general' }])
  })
  it('5개 언어 키워드', () => {
    expect(fallbackTasks('saya mau kirim uang')[0].agent).toBe('remit')
    expect(fallbackTasks('hóa đơn này là gì')[0].agent).toBe('doc')
    expect(fallbackTasks('ऋण पाउन सक्छु?')[0].agent).toBe('credit')
    expect(fallbackTasks('Send 500,000 won')).toEqual([{ agent: 'remit', amount: 500_000 }])
    expect(fallbackTasks('500,000 वन पठाउनुहोस्')).toEqual([{ agent: 'remit', amount: 500_000 }])
  })
})

describe('fallbackReply', () => {
  const s = initialState('minh', 'home')
  const p = PERSONAS.minh
  it('사람 연결 요청 → 상담 버튼', () => {
    expect(fallbackReply('상담원 연결해줘', s, p).action).toMatchObject({ screen: 'HELP', escalate: true })
  })
  it('환율 질문 → 환율 문장', () => {
    expect(fallbackReply('환율 알려줘', { ...s, lang: 'ko' }, p).text).toContain('₩1')
  })
})

describe('buildChatCtx', () => {
  it('신용 값은 거래 DB 산정과 같다', () => {
    const s = initialState('budi', 'home')
    const c = buildChatCtx(s, PERSONAS.budi)
    const cr = assessCredit(s.ledger, PERSONAS.budi, s.creditReady)
    expect(c).toMatchObject({ creditReady: cr.ready, monthsToCredit: cr.monthsToCredit, loanLimit: cr.limit })
  })
})

describe('handoffText', () => {
  const tpl = '알맞은 도우미에게 맡길게요.'
  it('일반 답은 그대로', () => {
    expect(handoffText('오늘 환율은 18,9₫이에요.', [{ agent: 'general' }], tpl)).toBe('오늘 환율은 18,9₫이에요.')
  })
  it('도우미에게 넘길 때 숫자가 있으면 템플릿 — 에이전트 제안과 어긋나지 않게', () => {
    expect(handoffText('지금 500,000원을 보낼게요.', [{ agent: 'remit', amount: 500_000 }], tpl)).toBe(tpl)
  })
  it('숫자가 없는 인계 문장은 그대로', () => {
    expect(handoffText('송금 도우미가 준비해 드릴게요.', [{ agent: 'remit', amount: null }], tpl)).toBe('송금 도우미가 준비해 드릴게요.')
  })
})
