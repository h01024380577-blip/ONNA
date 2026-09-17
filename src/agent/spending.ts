import type { LedgerEntry, Persona, SpendingSummary, SpendPace } from '../types'
import { paydayOf, sameMonth } from '../mock/ledger'

/* 원장 → 지출 요약. 전부 코드가 계산한다 — 판정(spendPace)을 LLM 에 맡기면
   fxStrength 에서 봤듯 같은 값을 매번 다르게 부른다.

   "완결월" = 이번 달을 뺀 지난 달들. 이번 달은 아직 진행 중이라 평균에 넣지 않는다. */

const LIVING = (e: LedgerEntry) => e.kind === 'spend' || e.kind === 'utility'
const sum = (xs: LedgerEntry[]) => xs.reduce((a, e) => a + e.amount, 0)
const round100 = (n: number) => Math.round(n / 100) * 100
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 이번 달 씀씀이 — 일할 환산 페이스를 3개월 평균과 견준다 (±15%) */
export function spendPace(thisMonth: number, daysElapsed: number, avg: number): SpendPace {
  if (avg <= 0 || daysElapsed <= 0) return 'usual'
  const pace = (thisMonth / daysElapsed) * 30
  const ratio = pace / avg
  if (ratio >= 1.15) return 'higher'
  if (ratio <= 0.85) return 'lower'
  return 'usual'
}

export function summarizeSpending(ledger: LedgerEntry[], p: Persona, now: number | Date = Date.now()): SpendingSummary {
  const today = new Date(now)
  const y = today.getFullYear()
  const m0 = today.getMonth()

  let living3 = 0
  let remit3 = 0
  for (let k = 1; k <= 3; k++) {
    const d = new Date(y, m0 - k, 1)
    const m = ledger.filter((e) => sameMonth(e.at, d.getFullYear(), d.getMonth()))
    living3 += sum(m.filter(LIVING))
    remit3 += sum(m.filter((e) => e.kind === 'remit'))
  }
  const spendAvg3m = round100(living3 / 3)
  const remitAvg3m = round100(remit3 / 3)

  const cur = ledger.filter((e) => sameMonth(e.at, y, m0))
  const spendThisMonth = sum(cur.filter(LIVING))
  const rentPaid = cur.some((e) => e.kind === 'rent')

  const payday = paydayOf(today)
  const todayStart = new Date(y, m0, today.getDate()).getTime()
  // 월세·자동이체는 급여일 +2일. 이미 나갔거나 그날이 지났으면 다음 달 것을 가리킨다
  const rentThis = new Date(y, m0, payday + 2)
  const rentGone = rentPaid || rentThis.getTime() < todayStart
  const nextRent = rentGone ? new Date(y, m0 + 1, payday + 2) : rentThis
  const nextSalary = new Date(y, m0 + 1, payday)
  // 기다렸다 보낼 날 — 월세가 남아 있으면 그날(나간 뒤 잔액을 다시 본다), 아니면 일주일 뒤
  const laterDate = rentGone ? ymd(new Date(y, m0, today.getDate() + 7)) : ymd(rentThis)

  const upcomingDebits = (rentPaid ? 0 : p.autoDebit) + Math.max(0, spendAvg3m - spendThisMonth)

  return {
    spendAvg3m,
    spendThisMonth,
    spendPace: spendPace(spendThisMonth, new Date(now).getDate(), spendAvg3m),
    upcomingDebits,
    nextRentDate: ymd(nextRent),
    nextSalaryDate: ymd(nextSalary),
    laterDate,
    remitAvg3m,
  }
}
