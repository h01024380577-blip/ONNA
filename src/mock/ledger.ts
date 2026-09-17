import type { LedgerEntry, Persona, PersonaId } from '../types'
import { CREDIT_MONTHS } from './rules'

/* 입출금 원장 시드 — 페르소나별로 결정적인 과거 6개월.
   기록 탭이 보여 주고, 송금 에이전트가 지출 흐름을 읽는 근거가 된다.

   날짜 규칙 (spec 2026-09-16):
   - 급여는 과거에도 "오늘과 같은 일(日)"에 들어왔다 → 이번 달 급여는 데모 웹훅 그 자체
   - 월세·자동이체는 급여일 +2일. 이번 달 것은 아직 안 나갔다 (sendableMax 가 자동이체를
     빼는 정의와 모순이 없어야 한다)
   - 이번 달은 1일~오늘까지 생활비만 있다 */

export const MONTHS_SEEDED = 6
/** 월 생활 지출(spend+utility) 목표 범위 — 생활비 기준선 100만원의 55~85% */
export const SPEND_MIN = 550_000
export const SPEND_MAX = 850_000

const SPEND_MEMOS = ['ledger.m.grocery', 'ledger.m.food', 'ledger.m.transport', 'ledger.m.phone'] as const
const UTILITY_MEMOS = ['ledger.m.gas', 'ledger.m.electric'] as const

/* mulberry32 — 짧고 결정적. Math.random 을 쓰면 리셋마다 내역이 바뀌어
   "같은 사람의 기록"처럼 보이지 않는다 */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** 급여일 — 오늘 일자를 쓰되 짧은 달에서도 안전하게 28일 이하 */
export function paydayOf(now: Date): number {
  return Math.min(now.getDate(), 28)
}

function at(y: number, m0: number, d: number, h = 9, min = 0): number {
  return new Date(y, m0, d, h, min).getTime()
}
const round10k = (n: number) => Math.round(n / 10_000) * 10_000
const round100 = (n: number) => Math.round(n / 100) * 100

export function seedLedger(p: Persona, now: number | Date = Date.now()): LedgerEntry[] {
  const today = new Date(now)
  const y = today.getFullYear()
  const m0 = today.getMonth()
  const payday = paydayOf(today)
  const r = rng(hash(p.id))
  const out: Omit<LedgerEntry, 'verified'>[] = []
  let seq = 0
  const id = (tag: string) => `seed_${p.id}_${tag}_${(seq++).toString(36)}`

  /* 한 달치 생활비·공과금. dayMax 까지의 날짜에만 놓는다 (이번 달은 오늘까지) */
  const living = (yy: number, mm0: number, dayMax: number, budget: number) => {
    const utilCount = 1 + (r() < 0.5 ? 1 : 0)
    const utilTotal = Math.min(budget * 0.15, 30_000 + r() * 40_000 * utilCount)
    const spendTotal = budget - utilTotal
    const spendCount = 4 + Math.floor(r() * 3) // 4~6
    // 가중치로 나눠 항목 금액이 고르지 않게
    const w = Array.from({ length: spendCount }, () => 0.5 + r())
    const wSum = w.reduce((a, b) => a + b, 0)
    for (let i = 0; i < spendCount; i++) {
      const d = 1 + Math.floor(r() * dayMax)
      out.push({
        id: id('sp'), at: at(yy, mm0, d, 12 + Math.floor(r() * 8), Math.floor(r() * 60)),
        kind: 'spend', dir: 'out', amount: round100((spendTotal * w[i]) / wSum),
        memoKey: SPEND_MEMOS[Math.floor(r() * SPEND_MEMOS.length)],
      })
    }
    for (let i = 0; i < utilCount; i++) {
      // 공과금은 월 하순(20~26일) — 이번 달에 그 날이 안 왔으면 건너뛴다
      const d = 20 + Math.floor(r() * 7)
      if (d > dayMax) continue
      out.push({
        id: id('ut'), at: at(yy, mm0, d, 10),
        kind: 'utility', dir: 'out', amount: round100(utilTotal / utilCount),
        memoKey: UTILITY_MEMOS[i % UTILITY_MEMOS.length],
      })
    }
  }

  // 과거 완결월 6개
  for (let k = 1; k <= MONTHS_SEEDED; k++) {
    const d = new Date(y, m0 - k, 1)
    const yy = d.getFullYear()
    const mm0 = d.getMonth()
    out.push({ id: id('sal'), at: at(yy, mm0, payday, 9, 12), kind: 'salary', dir: 'in', amount: p.salary })
    out.push({ id: id('rent'), at: at(yy, mm0, payday + 2, 7), kind: 'rent', dir: 'out', amount: p.autoDebit })

    const base = p.salary - p.autoDebit - 1_000_000
    const first = round10k(base * (0.9 + r() * 0.2))
    out.push({ id: id('rm'), at: at(yy, mm0, payday + 1, 18, 30), kind: 'remit', dir: 'out', amount: first, fee: 3_000 })
    if (r() < 0.55) {
      // 두 번째 소액 송금 — 월 중순 언저리(급여일과 겹치지 않게)
      const d2 = payday > 14 ? Math.max(1, payday - 12) : Math.min(28, payday + 12)
      out.push({ id: id('rm'), at: at(yy, mm0, d2, 19), kind: 'remit', dir: 'out', amount: round10k(100_000 + r() * 150_000), fee: 3_000 })
    }
    living(yy, mm0, 28, SPEND_MIN + r() * (SPEND_MAX - SPEND_MIN))
  }

  // 이번 달 — 오늘까지의 생활비만
  const dayMax = Math.max(1, today.getDate() - 1)
  living(y, m0, dayMax, (SPEND_MIN + r() * (SPEND_MAX - SPEND_MIN)) * (dayMax / 30))

  /* 검증된 기록 = ONNA 로 쌓이기 시작한 뒤. 최근 (6 − 남은 개월)개 완결월과 이번 달.
     그보다 오래된 달은 은행 거래이지만 신용 기록으로 세지 않는다 (spec 2026-09-17) */
  const vMonths = Math.max(0, Math.min(MONTHS_SEEDED, CREDIT_MONTHS - p.monthsToCredit))
  const verifiedFrom = new Date(y, m0 - vMonths, 1).getTime()
  return out
    .map((e) => ({ ...e, verified: e.at >= verifiedFrom }))
    .sort((a, b) => b.at - a.at)
}

/** 같은 달인지 — 원장 집계 공용 */
export function sameMonth(at: number, y: number, m0: number): boolean {
  const d = new Date(at)
  return d.getFullYear() === y && d.getMonth() === m0
}

export type { PersonaId }
