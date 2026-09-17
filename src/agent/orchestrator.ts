import type { AgentKind, AppState, ChatAction, OrchTask, Persona } from '../types'
import { FX, fmtRate, fxAdvantagePct } from '../mock/fx'
import { fmtKRW, makeT } from '../i18n'
import { assessCredit } from './credit'
import { summarizeSpending } from './spending'

/* 오케스트레이터 ① 의도 분석 · ② Task 분업 — 클라이언트 쪽 규칙.
   LLM(/api/orchestrate)이 나눈 태스크를 여기서 한 번 더 검증하고,
   LLM 이 실패하면 키워드로 나눈다. 금액은 코드가 사용자 문장에서 읽은 값만 믿는다. */

export const AGENTS: readonly AgentKind[] = ['remit', 'doc', 'credit', 'general']
const MAX_TASKS = 2

/** "50만" → 500,000 · "500,000"/"500.000" → 500,000 · 금액이 없으면 null */
export function parseAmount(s: string): number | null {
  const man = s.match(/(\d+(?:\.\d+)?)\s*만/)
  if (man) return Math.round(parseFloat(man[1]) * 10_000)
  const digits = s.replace(/[,.\s]/g, '').match(/\d{4,9}/)
  return digits ? parseInt(digits[0], 10) : null
}

export function validateTasks(raw: unknown, message: string, proposalAmount?: number): OrchTask[] {
  const said = parseAmount(message.toLowerCase())
  const out: OrchTask[] = []
  for (const x of Array.isArray(raw) ? raw : []) {
    const o = (x ?? {}) as Record<string, unknown>
    const agent = AGENTS.find((a) => a === o.agent)
    if (!agent || out.some((t) => t.agent === agent)) continue
    if (agent !== 'remit') {
      out.push({ agent })
      continue
    }
    const n = typeof o.amount === 'number' && Number.isFinite(o.amount) ? Math.round(o.amount) : null
    // 모델이 말한 금액은 문장에서 읽힌 금액이나 지금 제안 금액과 같을 때만 믿는다
    const amount = n !== null && (n === said || n === proposalAmount) ? n : said
    out.push({ agent, amount })
  }
  const work = out.filter((t) => t.agent !== 'general')
  const tasks = (work.length ? work : out).slice(0, MAX_TASKS)
  return tasks.length ? tasks : [{ agent: 'general' }]
}

/** 도우미에게 넘기는 문장에 숫자가 있으면 템플릿으로 바꾼다 — "지금 50만원 보낼게요" 같은 인계 문장이
    송금 에이전트의 실제 제안(예: 10만원)과 어긋나는 것을 실측했다. 일반 답은 그대로 둔다 */
export function handoffText(text: string, tasks: OrchTask[], template: string): string {
  const routed = tasks.some((t) => t.agent !== 'general')
  return routed && /\d{2,}/.test(text.replace(/[,.\s]/g, '')) ? template : text
}

/* 폴백 분류 키워드 (5개 언어). 환율·잔액·상담은 general 이 답한다 */
const KW: Record<Exclude<AgentKind, 'general'>, string[]> = {
  remit: ['송금', '보내', 'kirim', 'gửi', 'gui ', 'send', 'transfer', 'पठा'],
  doc: ['고지서', '청구서', '서류', '명세서', '계약서', '우편', '종이', 'tagihan', 'dokumen', 'surat', 'hóa đơn', 'giấy', 'bill', 'document', 'letter', 'paper', 'बिल', 'कागज'],
  credit: ['대출', '빌리', '기록', '이력', '신용', 'pinjam', 'catatan', 'kredit', 'vay', 'hồ sơ', 'tín dụng', 'loan', 'borrow', 'record', 'credit', 'ऋण', 'रेकर्ड'],
}
const GENERAL_KW = {
  help: ['도움', '사람', '상담', 'bantuan', 'trợ giúp', 'tư vấn', 'human', 'help', 'मद्दत', 'परामर्श'],
  rate: ['환율', '환전', 'kurs', 'tỷ giá', 'rate', 'दर'],
  bal: ['잔액', 'saldo', 'số dư', 'balance', 'ब्यालेन्स'],
}

const firstIndex = (q: string, ws: string[]) =>
  ws.reduce((m, w) => {
    const i = q.indexOf(w)
    return i >= 0 && i < m ? i : m
  }, Infinity)

export function fallbackTasks(message: string): OrchTask[] {
  const q = message.toLowerCase()
  const said = parseAmount(q)
  const amountAt = said === null ? Infinity : q.search(/\d/)
  const at: Record<Exclude<AgentKind, 'general'>, number> = {
    doc: firstIndex(q, KW.doc),
    remit: Math.min(firstIndex(q, KW.remit), amountAt),
    credit: firstIndex(q, KW.credit),
  }
  // "송금 기록 보여줘" — 금액 없이 기록을 물으면 송금이 아니라 기록 질문이다
  if (at.credit < Infinity && said === null) at.remit = Infinity
  const tasks = (Object.keys(at) as Array<keyof typeof at>)
    .filter((k) => at[k] < Infinity)
    .sort((a, b) => at[a] - at[b])
    .slice(0, MAX_TASKS)
    .map((agent): OrchTask => (agent === 'remit' ? { agent, amount: said } : { agent }))
  return tasks.length ? tasks : [{ agent: 'general' }]
}

/** general 폴백 답 — 환율·잔액·상담. 수치는 전부 코드 값 */
export function fallbackReply(message: string, s: AppState, p: Persona): { text: string; action?: ChatAction } {
  const lang = s.lang ?? 'ko'
  const t = makeT(lang)
  const krw = (n: number) => fmtKRW(n, lang)
  const q = message.toLowerCase()
  const has = (ws: string[]) => ws.some((w) => q.includes(w))
  const fx = FX[p.currency]
  if (has(GENERAL_KW.help))
    return { text: t('chat.help'), action: { labelKey: 'help.human', screen: 'HELP', escalate: true } }
  if (has(GENERAL_KW.rate))
    return { text: t('chat.rate', { rate: fx.rateText, pct: fxAdvantagePct(p.currency) }) }
  if (has(GENERAL_KW.bal))
    return { text: t('chat.bal', { bal: krw(s.balance), sent: krw(s.sentThisMonth) }) }
  return { text: t('chat.fallback') }
}

/** /api/orchestrate 에 넘기는 근거 — 수치는 전부 여기 값만 쓰게 한다 (AG-4) */
export function buildChatCtx(s: AppState, p: Persona) {
  const fx = FX[p.currency]
  const credit = assessCredit(s.ledger, p, s.creditReady)
  const sp = summarizeSpending(s.ledger, p)
  return {
    name: p.name,
    homeCurrency: p.currency,
    salary: p.salary,
    balance: s.balance,
    sentThisMonth: s.sentThisMonth,
    livingFloor: s.livingFloor,
    fxRate: fx.rate,
    fxRateText: fx.rateText,
    fxAdvantagePct: Number(fxAdvantagePct(p.currency)),
    // 과거 환율 질문("지난주엔 얼마였어요?")의 근거. 실값을 못 받았으면 통째로 빠진다
    fxPast: fx.past,
    fxAvg90dText: fx.avgReal ? fmtRate(p.currency, fx.avg3m) : undefined,
    today: new Date().toISOString().slice(0, 10),
    monthsEmployed: p.monthsEmployed,
    remitCount: p.remitCount + s.sessionRemits,
    monthsToCredit: credit.monthsToCredit,
    creditReady: credit.ready,
    loanLimit: credit.limit,
    loanRate: credit.rate,
    proposalAmount: s.proposal?.amount,
    spendAvg3m: sp.spendAvg3m,
    spendThisMonth: sp.spendThisMonth,
    upcomingDebits: sp.upcomingDebits,
    nextRentDate: sp.nextRentDate,
  }
}
