# 급여입금 웹훅 에이전트 분석 · 사고과정 UI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 급여 입금 웹훅이 뜨면 에이전트가 실제로 신호를 읽고 송금 행동·금액을 스스로 결정하고, 그 사고과정을 근로자 앱에서 모국어로 펼쳐 볼 수 있게 한다.

**Architecture:** 코드가 신호를 모아(`src/agent/signals.ts`) 새 edge 함수 `/api/salary-plan`에 넘기면 LLM이 3개 행동 중 하나와 금액·문장·사고 단계를 JSON으로 돌려준다. 한도 문장(③단계)만 코드가 쓴다(기존 카피 규칙). 훅 `useSalaryAgent`가 4단계를 2~3초에 걸쳐 진행시키고, 실패하면 현행 공식 + i18n 템플릿으로 같은 모양의 플랜을 만들어 화면이 경로를 하나만 알게 한다.

**Tech Stack:** React 18 + TypeScript + Vite, Vercel Edge Functions, OpenAI gpt-4o-mini, vitest 5 (신규 devDep)

설계 문서: `docs/superpowers/specs/2026-09-13-salary-webhook-agent-design.md`

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/agent/signals.ts` (신규) | 신호 수집 순수 함수 + 환율 강도 판정 |
| `src/agent/plan.ts` (신규) | 플랜 검증(범위·구조) + 폴백 플랜 생성 |
| `src/agent/plan.test.ts` (신규) | plan.ts 단위 테스트 |
| `src/agent/signals.test.ts` (신규) | signals.ts 단위 테스트 |
| `src/agent/useSalaryAgent.ts` (신규) | 4단계 오케스트레이션 (fetch + 타이머 + dispatch) |
| `src/app/AgentSteps.tsx` (신규) | `ThinkingCard`(잠금화면) · `AgentReasoning`(B1 펼침) |
| `api/salary-plan.ts` (신규) | LLM 엔드포인트 + 서버 가드레일 |
| `src/types.ts` | `PlanAction` `StepKey` `AgentSignals` `AgentPlan` `Analysis` + `AppState.analysis` |
| `src/store.tsx` | `SALARY_CREDITED` 재작성 + 액션 3개 |
| `src/app/screens/Remit.tsx` | B0 2상태, B1 카드 문장 교체 + 펼침, B2 근거 문구 |
| `src/i18n/{ko,en,id,vi,ne}.ts` | 17키 × 5언어 |
| `src/styles.css` | `.think*` `.reason*` |
| `src/sim/{Shell,MobileShell}.tsx` | `useSalaryAgent()` 호출 |
| `src/sim/DataStatus.tsx` | 분석 출처 한 줄 |
| `package.json` | `test` 스크립트 + vitest devDep |

---

### Task 1: 타입 정의

**Files:** Modify `src/types.ts`

- [ ] **Step 1: `PastKey`/`PastPoint`를 types.ts로 옮긴다** (`AgentSignals`가 써야 하는데 `mock/fx.ts`에 있으면 types → mock 역방향 의존이 생긴다)

`src/types.ts` 맨 위 `export type Currency` 아래에 추가:

```ts
/** 과거 시세 — /api/fx 가 실값을 채워 줄 때만 존재한다 */
export type PastKey = 'weekAgo' | 'monthAgo'
export interface PastPoint {
  date: string // YYYY-MM-DD
  rate: number
  rateText: string
}
```

- [ ] **Step 2: 에이전트 타입 추가** — `src/types.ts`의 `AppEvent` 뒤에 추가

```ts
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
```

- [ ] **Step 3: `AppState`에 필드 추가** — `salaryEvent` 바로 아래

```ts
  /** 급여 입금 웹훅에 대한 에이전트 분석 — 세션 데이터라 RESET 때 이월하지 않는다 */
  analysis?: Analysis
```

- [ ] **Step 4: `mock/fx.ts`가 types의 정의를 쓰게 바꾼다**

`src/mock/fx.ts`에서 지역 정의 두 개를 지우고 재수출로 바꾼다.

```ts
import type { Currency, PastKey, PastPoint, Quote } from '../types'
export type { PastKey, PastPoint }
```
(기존 `export type PastKey = …` / `export interface PastPoint {…}` 블록 삭제)

- [ ] **Step 5: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/types.ts src/mock/fx.ts docs/
git commit -m "에이전트 분석 상태 타입 추가"
```

---

### Task 2: 신호 수집 (TDD)

**Files:** Create `src/agent/signals.ts`, `src/agent/signals.test.ts`; Modify `package.json`

- [ ] **Step 1: 테스트 러너 스크립트 추가** — `package.json`의 `scripts`에 추가

```json
    "test": "vitest run",
```

- [ ] **Step 2: 실패하는 테스트를 쓴다** — `src/agent/signals.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { collectSignals, fxStrength } from './signals'
import { initialState } from '../store'
import { PERSONAS } from '../mock/personas'
import { MONTHLY_LIMIT } from '../mock/rules'

describe('fxStrength', () => {
  it('1.0% 이상은 확실히 유리', () => expect(fxStrength(1.0)).toBe('clearly-better'))
  it('0.2~1.0%는 조금 유리', () => expect(fxStrength(0.5)).toBe('slightly-better'))
  it('±0.2% 안은 평소와 같다', () => {
    expect(fxStrength(0)).toBe('same')
    expect(fxStrength(-0.19)).toBe('same')
  })
  it('-0.2% 이하는 낮은 날', () => expect(fxStrength(-0.2)).toBe('lower'))
})

describe('collectSignals', () => {
  const p = PERSONAS.minh

  it('보낼 수 있는 상한은 입금 후 잔액에서 자동이체를 뺀 값', () => {
    const s = initialState('minh', 'home')
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(sg.sendableMax).toBe(s.balance + p.salary - p.autoDebit)
  })

  it('한도 잔여는 월 한도에서 이번 달 보낸 돈을 뺀 값', () => {
    const s = { ...initialState('minh', 'home'), sentThisMonth: 1_000_000 }
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(sg.limitRemaining).toBe(MONTHLY_LIMIT - 1_000_000)
  })

  it('현행 공식값은 넘기지 않는다 — 넘기면 LLM 이 베낀다', () => {
    const s = initialState('minh', 'home')
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(JSON.stringify(sg)).not.toContain('proposalAmount')
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./signals"`

- [ ] **Step 4: 구현** — `src/agent/signals.ts`

```ts
import type { AgentSignals, AppState, Persona } from '../types'
import { FX, fxAdvantagePct } from '../mock/fx'
import { MONTHLY_LIMIT } from '../mock/rules'

/* 오늘 환율이 얼마나 유리한지 — api/fx-brief.ts 와 같은 구간으로 판정한다.
   이 판정을 LLM 에 맡기면 +6.9%를 "조금 더"라고 쓰는 일이 생긴다(실측). */
export function fxStrength(pct: number): AgentSignals['fxStrength'] {
  if (pct >= 1.0) return 'clearly-better'
  if (pct >= 0.2) return 'slightly-better'
  if (pct > -0.2) return 'same'
  return 'lower'
}

/** 급여 입금 직후 신호. balanceAfter 는 급여가 더해진 뒤의 잔액을 넘긴다.
    현행 공식값(급여−생활비−자동이체)은 일부러 넣지 않는다 — 넣으면 LLM 이
    그대로 베껴서 "자유 판단"이 무의미해진다. 폴백 경로에서만 쓴다. */
export function collectSignals(s: AppState, p: Persona, balanceAfter: number): AgentSignals {
  const fx = FX[p.currency]
  const pct = Number(fxAdvantagePct(p.currency))
  return {
    salary: p.salary,
    autoDebit: p.autoDebit,
    balanceAfter,
    livingFloor: s.livingFloor,
    sendableMax: Math.max(0, balanceAfter - p.autoDebit),
    sentThisMonth: s.sentThisMonth,
    limitRemaining: Math.max(0, MONTHLY_LIMIT - s.sentThisMonth),
    homeCurrency: p.currency,
    fxRate: fx.rate,
    fxRateText: fx.rateText,
    fxAdvantagePct: pct,
    fxBasis: fx.avgReal ? '90d-average' : 'reference',
    fxStrength: fxStrength(pct),
    fxPast: fx.past,
    monthsEmployed: p.monthsEmployed,
    remitCount: p.remitCount + s.sessionRemits,
    monthsToCredit: p.monthsToCredit,
    creditReady: s.creditReady || p.monthsToCredit <= 0,
    loanMonthly: s.loan?.monthly,
    today: new Date().toISOString().slice(0, 10),
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm test`
Expected: PASS (7 tests)

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json src/agent/signals.ts src/agent/signals.test.ts
git commit -m "급여 입금 신호 수집 함수 + vitest 도입"
```

---

### Task 3: 플랜 검증·폴백 (TDD)

**Files:** Create `src/agent/plan.ts`, `src/agent/plan.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `src/agent/plan.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { fallbackPlan, formulaAmount, validatePlan } from './plan'
import { collectSignals } from './signals'
import { initialState } from '../store'
import { PERSONAS } from '../mock/personas'
import { makeT, fmtKRW } from '../i18n'

const p = PERSONAS.minh
const s = initialState('minh', 'home')
const sg = collectSignals(s, p, s.balance + p.salary)

const good = {
  action: 'remit_full',
  amount: 1_150_000,
  say: '월급이 들어왔어요.',
  why: '오늘 환율이 평소보다 좋아요.',
  steps: { signals: 'ㄱ', compare: 'ㄴ', decide: 'ㄷ' },
  rejected: [{ action: 'later', text: '오늘이 유리해서요' }],
}

describe('validatePlan', () => {
  it('정상 플랜은 금액을 그대로 통과시킨다 — 우리가 몰래 고치지 않는다', () => {
    expect(validatePlan(good, sg)?.amount).toBe(1_150_000)
  })

  it('모르는 행동은 폐기한다', () => {
    expect(validatePlan({ ...good, action: 'buy_stock' }, sg)).toBeNull()
  })

  it('보낼 수 있는 상한을 넘으면 폐기한다 — 금액만 깎으면 문장과 어긋난다', () => {
    expect(validatePlan({ ...good, amount: sg.sendableMax + 10_000 }, sg)).toBeNull()
  })

  it('1만원 미만은 폐기한다', () => {
    expect(validatePlan({ ...good, amount: 5_000 }, sg)).toBeNull()
  })

  it('단계 문장이 하나라도 비면 폐기한다', () => {
    expect(validatePlan({ ...good, steps: { signals: 'ㄱ', compare: '', decide: 'ㄷ' } }, sg)).toBeNull()
  })

  it("'나중에'는 금액이 없어도 공식값으로 채운다", () => {
    const v = validatePlan({ ...good, action: 'later', amount: null }, sg)
    expect(v?.action).toBe('later')
    expect(v?.amount).toBe(formulaAmount(sg))
  })

  it('탈락 후보의 행동 이름이 틀리면 그 항목만 버린다', () => {
    const v = validatePlan({ ...good, rejected: [{ action: 'nope', text: 'x' }, { action: 'later', text: 'ok' }] }, sg)
    expect(v?.rejected).toEqual([{ action: 'later', text: 'ok' }])
  })
})

describe('fallbackPlan', () => {
  const t = makeT('ko')
  const krw = (n: number) => fmtKRW(n, 'ko')

  it('현행 공식 금액으로 전액 송금을 제안한다', () => {
    const fb = fallbackPlan(sg, t, krw)
    expect(fb.action).toBe('remit_full')
    expect(fb.amount).toBe(p.salary - s.livingFloor - p.autoDebit)
  })

  it('네 문장 모두 채워진다 — 빈 칸이 화면에 나가면 안 된다', () => {
    const fb = fallbackPlan(sg, t, krw)
    for (const v of [fb.say, fb.why, fb.steps.signals, fb.steps.compare, fb.steps.decide]) {
      expect(v.length).toBeGreaterThan(3)
      expect(v).not.toContain('{')
    }
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./plan"`

- [ ] **Step 3: 구현** — `src/agent/plan.ts`

```ts
import type { AgentPlan, AgentSignals, PlanAction } from '../types'

const ACTIONS: readonly PlanAction[] = ['remit_full', 'remit_adjust', 'later']
export const MIN_SEND = 10_000

type Translate = (key: string, slots?: Record<string, string | number>) => string
type Money = (n: number) => string

/** 폴백 금액 = 기존 공식. 'later' 에 금액이 없을 때도 이 값을 쓴다 */
export function formulaAmount(sg: AgentSignals): number {
  const raw = sg.salary - sg.livingFloor - sg.autoDebit
  return Math.min(Math.max(MIN_SEND, raw), Math.max(MIN_SEND, sg.sendableMax))
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/* 모델 응답 검증 — 통과하면 그 금액을 그대로 쓴다.
   범위를 벗어난 금액을 몰래 깎지 않는 이유: 문장에는 모델이 말한 금액이
   적혀 있어서, 숫자만 고치면 카드의 금액과 설명이 어긋난다. 통째로 폐기하고
   폴백으로 간다. (서버도 같은 규칙으로 한 번 걸러 준다) */
export function validatePlan(raw: unknown, sg: AgentSignals): AgentPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const action = ACTIONS.find((a) => a === r.action)
  if (!action) return null

  const say = str(r.say)
  const why = str(r.why)
  if (!say || !why) return null

  const st = (r.steps ?? {}) as Record<string, unknown>
  const steps = { signals: str(st.signals), compare: str(st.compare), decide: str(st.decide) }
  if (!steps.signals || !steps.compare || !steps.decide) return null

  const cap = Math.max(MIN_SEND, sg.sendableMax)
  const n = typeof r.amount === 'number' && Number.isFinite(r.amount) ? Math.round(r.amount) : NaN
  const amount = n >= MIN_SEND && n <= cap ? n : action === 'later' ? formulaAmount(sg) : NaN
  if (!Number.isFinite(amount)) return null

  const rejected = Array.isArray(r.rejected)
    ? r.rejected
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>
          const a = ACTIONS.find((v) => v === o.action)
          const text = str(o.text)
          return a && text ? { action: a, text } : null
        })
        .filter((x): x is { action: PlanAction; text: string } => x !== null)
        .slice(0, 2)
    : undefined

  return { action, amount, say, why, steps, ...(rejected?.length ? { rejected } : {}) }
}

/* LLM 실패·가드레일 폐기 때 쓰는 안전망. 여기서 또 분기하면 검증할 경로가
   두 배가 되므로 항상 전액 송금 + 공식 금액으로 고정한다. */
export function fallbackPlan(sg: AgentSignals, t: Translate, krw: Money): AgentPlan {
  const amount = formulaAmount(sg)
  return {
    action: 'remit_full',
    amount,
    say: t('b1.say', { amount: krw(amount) }),
    why: t('b1.why', { rate: sg.fxRateText, pct: sg.fxAdvantagePct, floor: krw(sg.livingFloor) }),
    steps: {
      signals: t('agent.fbStep1', { salary: krw(sg.salary), debit: krw(sg.autoDebit) }),
      compare: t('agent.fbStep2'),
      decide: t('agent.fbStep3', { amount: krw(amount), floor: krw(sg.livingFloor) }),
    },
  }
}
```

- [ ] **Step 4: 통과 확인** (i18n 키가 아직 없어 `fallbackPlan` 문장 테스트는 Task 5 뒤에 통과한다 — 먼저 Task 5를 끝내고 돌려도 된다)

Run: `npm test`
Expected: `validatePlan` 7개 PASS. `fallbackPlan`의 "네 문장 모두" 테스트는 키가 없으면 키 이름이 그대로 반환돼 `{` 가 없어 통과한다. `agent.fbStep1`은 슬롯이 안 채워지지만 문자열 길이 조건은 만족.

- [ ] **Step 5: 커밋**

```bash
git add src/agent/plan.ts src/agent/plan.test.ts
git commit -m "에이전트 플랜 검증·폴백 로직"
```

---

### Task 4: LLM 엔드포인트

**Files:** Create `api/salary-plan.ts`

- [ ] **Step 1: 엔드포인트 작성**

```ts
import { json, bad, openai, parseJson, copyLint, rateLimit, clientIp, preflight } from './_lib'

export const config = { runtime: 'edge' }

/* 급여 입금 웹훅 → 에이전트 분석.
   여기서는 LLM 이 행동·금액까지 직접 정한다(사용자 승인 사항). 코드는
   (1) 신호를 만들어 넘기고 (2) 응답이 화면을 깨뜨리지 않는지 검사하고
   (3) 한도 문장은 따로 쓴다 — HARD RULE 7 때문에 LLM 은 한도를 말할 수 없다. */

const ACTIONS = ['remit_full', 'remit_adjust', 'later'] as const
const MIN_SEND = 10_000

const LANG_NAME: Record<string, string> = {
  ko: 'Korean', en: 'English', id: 'Indonesian', vi: 'Vietnamese', ne: 'Nepali',
}

const SYSTEM = `You are ONNA, a banking assistant inside iM Bank for migrant workers in Daegu, Korea.
A salary deposit just landed in this person's account. You decide what to recommend today.

WHO YOU ARE
Think of yourself as the kindest person at the bank's information desk. The person may be tired
from a factory shift and may not read well. You are never rushed, never cold, never bureaucratic.

YOUR DECISION — pick exactly one action
- remit_full   : send the comfortable surplus home now
- remit_adjust : send a smaller amount now (living money would get tight, they already sent a lot
                 this month, or today's rate is not good)
- later        : recommend not sending today
Then pick "amount": a whole number of Korean won, at least 10000 and at most SIGNALS.sendableMax.
For "later", still give the amount you would suggest for when they do send.
Round to a friendly figure (usually a multiple of 10,000 won).

HARD RULES
1. NUMBERS: never invent a number. You may write (a) the amount you chose and (b) values present
   in SIGNALS. Nothing else. Do not convert won into the family's currency — the app does that.
2. NO JUDGEMENTS: never say whether a transfer passes or fails compliance. A rules engine decides.
3. NEVER state a limit, maximum, cap, remaining allowance, fee, or eligibility condition — not even
   from SIGNALS. Do not mention limitRemaining or sendableMax as a number. A separate line written
   by the rules engine covers that.
4. Never promise or predict a future rate. You may say today's rate is better, about the same, or
   lower than usual. Nothing about tomorrow.
5. NO ADVICE: no investment or personalized financial advice.
6. FORBIDDEN WORDS (never output, in any language): 거절, 차단, 위반, 블록체인, DID, 크리덴셜, 토큰.
7. MONEY: every amount in SIGNALS is Korean won. Always label amounts as won (원 / KRW / "đồng Hàn Quốc" …).
   NEVER label an amount with homeCurrency — that is only what their family receives.
8. NAME: you are never told the person's name. Write the bare token {name} where you address them —
   the app fills in the name and the right honorific. Never add a suffix to it. At most once, in "say".

TONE
- Always the polite/honorific register of the requested language. Never casual, never blunt.
- Plain words. Short sentences. No banking jargon, no English loanwords, no emoji.
- Offer, never order ("…해 드릴까요?" not "…하세요"). Never make them feel poor or at fault.
- Korean: 존댓말 해요체. Vietnamese: "quý khách", end with "ạ" where natural, never "bạn".
  Indonesian: "Bapak/Ibu" or "Anda", soften with "ya". Nepali: तपाईं / हजुर. English: courteous teller.

SIGNALS FIELDS
- salary, autoDebit, balanceAfter, livingFloor, sendableMax, sentThisMonth, limitRemaining: Korean won.
- livingFloor: the monthly living money they should keep in Korea.
- fxRateText: what ₩1 is worth today, already formatted. Quote as-is or not at all.
- fxAdvantagePct: how much better than usual today's rate is, in percent.
- fxStrength: the verdict on today's rate, ALREADY DECIDED for you. Do not re-judge it.
    clearly-better → say it plainly, never hedge (no 조금/약간/sedikit/một chút/थोरै).
    slightly-better → hedging belongs here. same → about usual. lower → say it plainly, do not spin.
- fxBasis: "90d-average" = a real 90-day average. "reference" = a fixed reference rate; then never
  call it an average, say "usual" instead.
- fxPast.weekAgo / monthAgo: what ₩1 was worth then, with .date and .rateText. Optional.
- monthsEmployed, remitCount, monthsToCredit: counts. loanMonthly: their monthly loan repayment, if any.

WHAT YOU WRITE
- "say"  : ONE short sentence proposing your action, ending as an invitation.
- "why"  : ONE short sentence of grounds.
- "steps": how you actually thought, in the worker's own view.
    signals → what came in and what is already committed
    compare → which ways of sending you weighed against each other
    decide  → what you chose and why it fits this person this month
  Each step 1~2 short sentences. Do NOT write about limits here (see HARD RULE 3).
- "rejected": 1~2 of the actions you did not choose, each with one short sentence saying why not.

BEFORE YOU ANSWER, check: honorific register? {name} used instead of a real name? amounts labelled
as won? no limit/fee/cap mentioned? no future-rate promise? fxStrength matched exactly?

OUTPUT strict JSON only:
{"action":"remit_full|remit_adjust|later","amount":<number>,"say":"…","why":"…",
 "steps":{"signals":"…","compare":"…","decide":"…"},
 "rejected":[{"action":"later","text":"…"}]}`

/* 모델이 이름을 직접 쓰면 음차하고 한국어 '님'을 다른 언어까지 끌고 간다.
   그래서 이름은 모델에 주지 않고 {name} 토큰만 쓰게 한 뒤 여기서 붙인다.
   (api/agent.ts 와 같은 처리) */
const HONORIFIC: Record<string, string> = { ko: '님' }

function fillName(text: string, name: string | undefined, lang: string): string {
  const token = /\{\s*name\s*\}\s*(님|씨|ji|जी)?/g
  if (name) return text.replace(token, name + (HONORIFIC[lang] ?? ''))
  return text
    .replace(new RegExp(token.source + '\\s*[,，、]?\\s*', 'g'), '')
    .replace(/^\s*[,，、]\s*/, '')
    .trim()
}

/** 신호에 없는 숫자가 나오면 거짓 수치로 본다. 모델이 정한 금액은 환각이
    아니므로 근거 목록에 넣어 준다 — 넣지 않으면 자유 판단한 금액이 전부 폐기된다 */
function grounded(texts: string[], ctxDigits: string): boolean {
  return texts.every((text) =>
    (text.match(/[\d][\d.,\s]{2,}/g) ?? []).every((tok) => {
      const d = tok.replace(/\D/g, '')
      if (d.length < 3) return true
      return ctxDigits.includes(d) || ctxDigits.includes(d.replace(/0+$/, ''))
    }),
  )
}

const HEDGE =
  /\b(slightly|a little|a bit|sedikit|agak|một chút|chút ít|hơi)\b|조금|약간|살짝|थोरै|अलिकति/i

export default async function handler(req: Request) {
  const pre = preflight(req)
  if (pre) return pre

  if (req.method !== 'POST') return bad('POST only', 405)
  if (!rateLimit(clientIp(req), 20, 60_000)) return bad('too many requests', 429)

  let body: { lang?: string; name?: string; signals?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return bad('invalid json')
  }
  const lang = body.lang && LANG_NAME[body.lang] ? body.lang : 'ko'
  const sg = body.signals
  if (!sg || typeof sg.salary !== 'number' || typeof sg.sendableMax !== 'number')
    return bad('missing signals')

  const cap = Math.max(MIN_SEND, sg.sendableMax as number)

  try {
    const d = await openai({
      // steps 3개 + rejected 2개 + say/why. 네팔어·베트남어는 토큰이 훨씬 많이 든다
      max_tokens: 700,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}\nSIGNALS: ${JSON.stringify(sg)}`,
        },
      ],
    })

    const out = parseJson<Record<string, unknown>>(d?.choices?.[0]?.message?.content ?? '')
    if (!out) return json({ fallback: 'unparsable' })

    const action = (ACTIONS as readonly string[]).includes(String(out.action))
      ? (out.action as string)
      : null
    if (!action) return json({ fallback: 'action' })

    const n = typeof out.amount === 'number' && Number.isFinite(out.amount) ? Math.round(out.amount) : NaN
    // 범위를 벗어난 금액은 깎지 않고 통째로 폐기한다 — 문장에 그 금액이 적혀 있다
    if (!(n >= MIN_SEND && n <= cap) && action !== 'later') return json({ fallback: 'amount' })
    const amount = n >= MIN_SEND && n <= cap ? n : null

    const steps = (out.steps ?? {}) as Record<string, unknown>
    const pick = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const texts = {
      say: fillName(pick(out.say), body.name, lang),
      why: pick(out.why),
      signals: pick(steps.signals),
      compare: pick(steps.compare),
      decide: pick(steps.decide),
    }
    if (Object.values(texts).some((v) => !v)) return json({ fallback: 'empty' })

    const rejected = Array.isArray(out.rejected)
      ? out.rejected
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>
            const a = (ACTIONS as readonly string[]).includes(String(o.action)) ? String(o.action) : null
            const text = pick(o.text)
            return a && text ? { action: a, text } : null
          })
          .filter(Boolean)
          .slice(0, 2)
      : []

    const all = [...Object.values(texts), ...rejected.map((r) => (r as { text: string }).text)]
    if (all.some((v) => !copyLint(v))) return json({ fallback: 'copy' })

    const ctxDigits = (JSON.stringify(sg) + (amount ?? '')).replace(/\D/g, '')
    if (!grounded(all, ctxDigits)) return json({ fallback: 'ungrounded' })

    // 확실히 유리한 날인데 "조금"으로 깎아 쓰면 폐기 — 프롬프트만으로는 새는 케이스
    if (sg.fxStrength === 'clearly-better' && HEDGE.test(texts.say + texts.why))
      return json({ fallback: 'hedge' })

    return json({
      action,
      amount,
      say: texts.say,
      why: texts.why,
      steps: { signals: texts.signals, compare: texts.compare, decide: texts.decide },
      rejected,
    })
  } catch (e) {
    return json({ fallback: (e as Error).message })
  }
}
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add api/salary-plan.ts
git commit -m "급여 입금 분석 LLM 엔드포인트"
```

---

### Task 5: i18n 17키 × 5언어

**Files:** Modify `src/i18n/ko.ts`, `en.ts`, `id.ts`, `vi.ts`, `ne.ts`

- [ ] **Step 1: `ko.ts`의 `'b1.hi'` 앞에 블록 추가**

```ts
  // 급여 입금 분석 — 사고과정 UI
  'agent.analyzing': '급여 입금을 확인하고 있어요',
  'agent.step1': '들어온 돈·나갈 돈 확인',
  'agent.step2': '보낼 방법 견주기',
  'agent.step3': '이번 달 보낼 수 있는지 확인',
  'agent.step4': '결정과 이유',
  'agent.how': '어떻게 정했는지 보기',
  'agent.hide': '접기',
  'agent.notPicked': '고르지 않은 방법',
  'agent.actFull': '전부 보내기',
  'agent.actAdjust': '조금 줄여 보내기',
  'agent.actLater': '나중에 보내기',
  'agent.checkOk': '생활비 {floor}은 남겨 뒀어요. 이번 달에 보낸 돈과 합쳐도 괜찮아요.',
  'agent.checkTight': '이번 달에 보낸 돈과 합치면 빡빡해요. 보내기 전에 한 번 더 알려 드릴게요.',
  'agent.srcLive': '실시간 분석 · {sec}초',
  'agent.srcTemplate': '기본 계산으로 안내했어요',
  'agent.fbStep1': '급여 {salary}에서 자동이체 {debit}을 먼저 확인했어요.',
  'agent.fbStep2': '전부 보내기, 조금 줄여 보내기, 나중에 보내기를 견줘 봤어요.',
  'agent.fbStep3': '{amount}이 알맞아요. 생활비 {floor}은 남겨 뒀어요.',
```

- [ ] **Step 2: `en.ts` 같은 위치에 추가**

```ts
  'agent.analyzing': 'Checking your salary deposit',
  'agent.step1': 'What came in, what goes out',
  'agent.step2': 'Weighing the ways to send',
  'agent.step3': 'Checking this month',
  'agent.step4': 'Decision and reason',
  'agent.how': 'See how I decided',
  'agent.hide': 'Hide',
  'agent.notPicked': 'What I did not pick',
  'agent.actFull': 'Send it all',
  'agent.actAdjust': 'Send a little less',
  'agent.actLater': 'Send later',
  'agent.checkOk': 'I set aside {floor} for living costs. Together with what you sent this month, this is fine.',
  'agent.checkTight': 'With what you already sent this month, this is tight. I will tell you again before it goes.',
  'agent.srcLive': 'Live analysis · {sec}s',
  'agent.srcTemplate': 'Guided by the basic calculation',
  'agent.fbStep1': 'I started from your salary {salary} and the {debit} that leaves automatically.',
  'agent.fbStep2': 'I weighed sending it all, sending a little less, and sending later.',
  'agent.fbStep3': '{amount} fits best. I set aside {floor} for living costs.',
```

- [ ] **Step 3: `id.ts` 같은 위치에 추가**

```ts
  'agent.analyzing': 'Sedang memeriksa gaji yang masuk',
  'agent.step1': 'Uang masuk dan uang keluar',
  'agent.step2': 'Menimbang cara mengirim',
  'agent.step3': 'Memeriksa bulan ini',
  'agent.step4': 'Keputusan dan alasannya',
  'agent.how': 'Lihat cara saya memutuskan',
  'agent.hide': 'Tutup',
  'agent.notPicked': 'Yang tidak saya pilih',
  'agent.actFull': 'Kirim semua',
  'agent.actAdjust': 'Kirim sedikit lebih kecil',
  'agent.actLater': 'Kirim nanti',
  'agent.checkOk': 'Biaya hidup {floor} sudah disisihkan. Digabung dengan kiriman bulan ini pun masih aman.',
  'agent.checkTight': 'Digabung dengan kiriman bulan ini terasa sempit. Nanti saya kabari lagi sebelum dikirim.',
  'agent.srcLive': 'Analisis langsung · {sec} detik',
  'agent.srcTemplate': 'Dipandu perhitungan dasar',
  'agent.fbStep1': 'Saya mulai dari gaji {salary} dan {debit} yang keluar otomatis.',
  'agent.fbStep2': 'Saya menimbang kirim semua, kirim sedikit lebih kecil, dan kirim nanti.',
  'agent.fbStep3': '{amount} paling pas. Biaya hidup {floor} sudah disisihkan.',
```

- [ ] **Step 4: `vi.ts` 같은 위치에 추가**

```ts
  'agent.analyzing': 'Đang kiểm tra khoản lương vừa về',
  'agent.step1': 'Tiền vào và tiền phải trả',
  'agent.step2': 'Cân nhắc các cách gửi',
  'agent.step3': 'Kiểm tra tháng này',
  'agent.step4': 'Quyết định và lý do',
  'agent.how': 'Xem tôi đã quyết định thế nào',
  'agent.hide': 'Thu lại',
  'agent.notPicked': 'Cách tôi không chọn',
  'agent.actFull': 'Gửi toàn bộ',
  'agent.actAdjust': 'Gửi ít hơn một chút',
  'agent.actLater': 'Gửi sau',
  'agent.checkOk': 'Đã giữ lại {floor} sinh hoạt phí ạ. Cộng với số đã gửi tháng này vẫn ổn.',
  'agent.checkTight': 'Cộng với số đã gửi tháng này thì hơi chật ạ. Trước khi gửi tôi sẽ nhắc lại.',
  'agent.srcLive': 'Phân tích trực tiếp · {sec} giây',
  'agent.srcTemplate': 'Theo cách tính cơ bản',
  'agent.fbStep1': 'Tôi bắt đầu từ lương {salary} và {debit} tự động trừ ạ.',
  'agent.fbStep2': 'Tôi đã cân nhắc gửi toàn bộ, gửi ít hơn một chút và gửi sau.',
  'agent.fbStep3': '{amount} là phù hợp nhất ạ. Đã giữ lại {floor} sinh hoạt phí.',
```

- [ ] **Step 5: `ne.ts` 같은 위치에 추가**

```ts
  'agent.analyzing': 'तलब आएको जाँच गर्दै छु',
  'agent.step1': 'आएको पैसा र जाने पैसा',
  'agent.step2': 'पठाउने तरिका तुलना',
  'agent.step3': 'यो महिनाको जाँच',
  'agent.step4': 'निर्णय र कारण',
  'agent.how': 'मैले कसरी निर्णय गरेँ हेर्नुहोस्',
  'agent.hide': 'बन्द गर्नुहोस्',
  'agent.notPicked': 'मैले नछानेको तरिका',
  'agent.actFull': 'सबै पठाउने',
  'agent.actAdjust': 'अलि कम पठाउने',
  'agent.actLater': 'पछि पठाउने',
  'agent.checkOk': 'जीवन खर्च {floor} छुट्याइराखेको छु। यो महिना पठाएको रकमसँग जोड्दा पनि ठीक छ।',
  'agent.checkTight': 'यो महिना पठाएको रकमसँग जोड्दा अलि कसिलो हुन्छ। पठाउनु अघि फेरि जानकारी दिनेछु।',
  'agent.srcLive': 'प्रत्यक्ष विश्लेषण · {sec} सेकेन्ड',
  'agent.srcTemplate': 'आधारभूत गणनाबाट',
  'agent.fbStep1': 'तलब {salary} र स्वतः जाने {debit} पहिले जाँचेँ।',
  'agent.fbStep2': 'सबै पठाउने, अलि कम पठाउने र पछि पठाउने तुलना गरेँ।',
  'agent.fbStep3': '{amount} मिल्दो छ। जीवन खर्च {floor} छुट्याइराखेको छु।',
```

- [ ] **Step 6: 폴백 문장 테스트 통과 확인**

Run: `npm test`
Expected: PASS 전체 (`fallbackPlan` 문장에 `{` 가 남지 않는다)

- [ ] **Step 7: 커밋**

```bash
git add src/i18n
git commit -m "사고과정 UI 문구 5개 언어 추가"
```

---

### Task 6: 스토어 액션

**Files:** Modify `src/store.tsx`

- [ ] **Step 1: import과 Action 타입 추가**

`src/store.tsx` 상단 import에 추가:

```ts
import type { AgentPlan, AppState, HoldCode, Lang, PersonaId, Scenario, Screen, StepKey } from './types'
import { collectSignals } from './agent/signals'
```

`Action` 유니온에 추가 (`| { type: 'SALARY_CREDITED' }` 아래):

```ts
  | { type: 'ANALYSIS_PHASE'; phase: StepKey }
  | { type: 'ANALYSIS_RESULT'; plan: AgentPlan; source: 'llm' | 'template'; latencyMs: number }
  | { type: 'ANALYSIS_DONE' }
```

- [ ] **Step 2: `SALARY_CREDITED`를 분석 시작으로 바꾼다** — 기존 `case 'SALARY_CREDITED'` 블록 전체를 교체

```ts
    /* 웹훅 수신 = 분석 시작. 제안 금액은 에이전트가 정하므로 여기서 만들지 않는다.
       이어지는 ANALYSIS_* 는 useSalaryAgent 가 보낸다. */
    case 'SALARY_CREDITED': {
      const balanceAfter = s.balance + p.salary
      const signals = collectSignals(s, p, balanceAfter)
      let st: AppState = {
        ...s,
        balance: balanceAfter,
        salaryEvent: { amount: p.salary, at: Date.now() },
        analysis: {
          status: 'running',
          phase: 'signals',
          startedAt: Date.now(),
          signals,
          source: 'template',
        },
        proposal: undefined,
        draftAmount: 0,
        screen: 'B0',
        events: ev(s, 'salary_credited', String(p.salary)),
        trace: trace(s, 'orchestrator', `WEBHOOK salary.credited ₩${p.salary.toLocaleString()} 수신 → 에이전트 분석 시작`),
      }
      st = {
        ...st,
        trace: trace(st, 'remit-agent', `신호 수집 — 보낼 수 있는 상한 ₩${signals.sendableMax.toLocaleString()} · 환율 ${signals.fxAdvantagePct}% (${signals.fxStrength}) · 한도 잔여 ₩${signals.limitRemaining.toLocaleString()}`),
      }
      return st
    }

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
          phase: 'check',
          plan: a.plan,
          source: a.source,
          latencyMs: a.latencyMs,
          precheck: { result: pre.result, code: pre.code },
          checkKey: tight ? 'agent.checkTight' : 'agent.checkOk',
        },
        trace: trace(s, 'remit-agent', `분석 ${a.source === 'llm' ? '완료 (LLM 판단)' : '폴백 (기본 계산)'} — ${a.plan.action} ₩${a.plan.amount.toLocaleString()} · ${a.latencyMs}ms`),
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
        trace: trace(s, 'orchestrator', `제안 전달 — 잠금화면 푸시 (${s.lang ?? p.lang})`),
      }
    }
```

- [ ] **Step 3: 쓰지 않게 된 import 정리** — `fxAdvantagePct`가 다른 곳에서 안 쓰이면 import에서 뺀다

Run: `npx tsc --noEmit`
Expected: 에러 없음 (미사용 import는 tsc가 경고하지 않으니 눈으로 확인)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS 전체

- [ ] **Step 5: 커밋**

```bash
git add src/store.tsx
git commit -m "급여 입금 웹훅을 에이전트 분석 시작으로 전환"
```

---

### Task 7: 오케스트레이션 훅

**Files:** Create `src/agent/useSalaryAgent.ts`; Modify `src/sim/Shell.tsx`, `src/sim/MobileShell.tsx`

- [ ] **Step 1: 훅 작성** — `src/agent/useSalaryAgent.ts`

```ts
import { useEffect } from 'react'
import { useStore } from '../store'
import { PERSONAS } from '../mock/personas'
import { fmtKRW, makeT } from '../i18n'
import { apiUrl } from '../lib/api'
import { fallbackPlan, validatePlan } from './plan'
import type { AgentPlan } from '../types'

/* 급여 입금 분석의 4단계를 진행시킨다.
   ① 신호 수집(코드) → ② 보낼 방법 견주기(LLM) → ③ 한도·생활비(코드) → ④ 결정
   ②가 캐시처럼 빨리 와도 최소 MIN_COMPARE_MS 는 보여 준다. 그렇지 않으면
   단계가 눈에 보이기 전에 끝나서 사고과정이 없는 것처럼 보인다. */
const SIGNAL_MS = 550
const MIN_COMPARE_MS = 1300
const CHECK_MS = 420

export function useSalaryAgent() {
  const { state, dispatch } = useStore()
  const runId = state.analysis?.status === 'running' ? state.analysis.startedAt : 0

  useEffect(() => {
    const an = state.analysis
    if (!runId || !an) return

    const p = PERSONAS[state.personaId]
    const lang = state.lang ?? p.lang
    const t = makeT(lang)
    const krw = (n: number) => fmtKRW(n, lang)
    const sg = an.signals

    let alive = true
    const timers: ReturnType<typeof setTimeout>[] = []
    const t0 = Date.now()
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(() => { if (alive) fn() }, ms))

    later(SIGNAL_MS, () => dispatch({ type: 'ANALYSIS_PHASE', phase: 'compare' }))

    const settle = (plan: AgentPlan, source: 'llm' | 'template') => {
      later(Math.max(0, MIN_COMPARE_MS - (Date.now() - t0)), () => {
        dispatch({ type: 'ANALYSIS_RESULT', plan, source, latencyMs: Date.now() - t0 })
        later(CHECK_MS, () => dispatch({ type: 'ANALYSIS_DONE' }))
      })
    }

    fetch(apiUrl('/api/salary-plan'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(9000),
      body: JSON.stringify({ lang, name: p.name, signals: sg }),
    })
      .then((r) => r.json())
      .then((d) => {
        const plan = validatePlan(d, sg)
        settle(plan ?? fallbackPlan(sg, t, krw), plan ? 'llm' : 'template')
      })
      .catch(() => settle(fallbackPlan(sg, t, krw), 'template'))

    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [runId]) // eslint-disable-line react-hooks/exhaustive-deps
}
```

- [ ] **Step 2: 두 셸에서 호출** — `src/sim/Shell.tsx`와 `src/sim/MobileShell.tsx` 양쪽에

```ts
import { useSalaryAgent } from '../agent/useSalaryAgent'
```
그리고 기존 `useSimTimers()` 바로 아래에:
```ts
  useSalaryAgent()
```

> 한쪽만 넣으면 iOS 네이티브 셸(MobileShell)에서 분석이 영원히 "견주는 중"에 멈춘다.

- [ ] **Step 3: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/agent/useSalaryAgent.ts src/sim/Shell.tsx src/sim/MobileShell.tsx
git commit -m "분석 4단계 오케스트레이션 훅"
```

---

### Task 8: 사고과정 컴포넌트

**Files:** Create `src/app/AgentSteps.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import { useState } from 'react'
import { useApp } from './hooks'
import { Icon } from './Icon'
import { Logo } from './Logo'
import type { Analysis, PlanAction, StepKey } from '../types'

/* 에이전트 사고과정 — 잠금화면(분석 중)과 홈 제안 카드(펼침)가 같은 단계 정의를 쓴다.
   ③ check 의 본문만 코드가 만든다: 한도 이야기는 LLM 이 못 하게 되어 있다. */

const ORDER: StepKey[] = ['signals', 'compare', 'check', 'decide']
const LABEL: Record<StepKey, string> = {
  signals: 'agent.step1',
  compare: 'agent.step2',
  check: 'agent.step3',
  decide: 'agent.step4',
}
const ACT_LABEL: Record<PlanAction, string> = {
  remit_full: 'agent.actFull',
  remit_adjust: 'agent.actAdjust',
  later: 'agent.actLater',
}

function statusOf(phase: Analysis['phase'], k: StepKey): 'done' | 'running' | 'pending' {
  if (phase === 'done') return 'done'
  const i = ORDER.indexOf(k)
  const cur = ORDER.indexOf(phase)
  return i < cur ? 'done' : i === cur ? 'running' : 'pending'
}

/** 잠금화면 — 분석이 도는 동안 단계 라벨만 보여 준다 (본문은 아직 없다) */
export function ThinkingCard() {
  const { state, t } = useApp()
  const an = state.analysis
  if (!an) return null
  return (
    <div className="think">
      <div className="thinkHead">
        <Logo size={20} />
        <b className="wmk">ONNA</b>
        <span>{t('agent.analyzing')}</span>
      </div>
      {ORDER.map((k) => {
        const st = statusOf(an.phase, k)
        return (
          <div className={`thinkRow ${st}`} key={k}>
            <span className="thinkDot">
              {st === 'done' ? <Icon name="check" size={11} strokeWidth={3} /> : st === 'running' ? <i className="spin" /> : null}
            </span>
            <span>{t(LABEL[k])}</span>
          </div>
        )
      })}
    </div>
  )
}

/** 홈 제안 카드 — 어떻게 정했는지 펼쳐 본다 (기본 접힘) */
export function AgentReasoning() {
  const { state, t, krw } = useApp()
  const [open, setOpen] = useState(false)
  const an = state.analysis
  if (an?.status !== 'done' || !an.plan) return null

  const body: Record<StepKey, string> = {
    signals: an.plan.steps.signals,
    compare: an.plan.steps.compare,
    check: t(an.checkKey ?? 'agent.checkOk', { floor: krw(an.signals.livingFloor) }),
    decide: an.plan.steps.decide,
  }

  return (
    <div className="reason">
      <button className="reasonBtn" onClick={() => setOpen(!open)}>
        {t(open ? 'agent.hide' : 'agent.how')}
        <Icon name="chevron" size={14} style={{ transform: `rotate(${open ? -90 : 90}deg)` }} />
      </button>
      {open && (
        <div className="reasonBody">
          {ORDER.map((k, i) => (
            <div className="reasonStep" key={k}>
              <span className="reasonNo">{i + 1}</span>
              <div>
                <b>{t(LABEL[k])}</b>
                <p>{body[k]}</p>
              </div>
            </div>
          ))}
          {!!an.plan.rejected?.length && (
            <div className="reasonRej">
              <b>{t('agent.notPicked')}</b>
              {an.plan.rejected.map((r, i) => (
                <p key={i}>
                  <span className="rejTag">{t(ACT_LABEL[r.action])}</span>
                  {r.text}
                </p>
              ))}
            </div>
          )}
          <div className="reasonSrc">
            {an.source === 'llm'
              ? t('agent.srcLive', { sec: ((an.latencyMs ?? 0) / 1000).toFixed(1) })
              : t('agent.srcTemplate')}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (아직 화면에서 쓰이지 않아 미사용 경고만)

- [ ] **Step 3: 커밋**

```bash
git add src/app/AgentSteps.tsx
git commit -m "사고과정 표시 컴포넌트"
```

---

### Task 9: B0·B1·B2 화면 연결

**Files:** Modify `src/app/screens/Remit.tsx`

- [ ] **Step 1: import 추가**

```ts
import { AgentReasoning, ThinkingCard } from '../AgentSteps'
```

- [ ] **Step 2: `B0`을 두 상태로 교체** — 기존 `export function B0()` 전체를 교체

```tsx
/* B0 잠금화면 — 분석 중에는 사고과정, 끝나면 푸시. RM-1 */
export function B0() {
  const { state, dispatch, p, t, krw } = useApp()
  const an = state.analysis
  const amount = an?.plan?.amount ?? state.proposal?.amount ?? 0
  return (
    <div className="lock">
      <div className="time">18:02</div>
      <div className="date">{t('b0.date')}</div>
      {an?.status === 'running' ? (
        <ThinkingCard />
      ) : (
        <div className="push">
          <div className="app">
            <Logo size={20} />
            <b className="wmk">ONNA</b>{t('b0.app').replace('ONNA', '')}
          </div>
          {/* 푸시 본문은 에이전트가 쓴 한 줄. 분석 없이 이 화면에 온 경우만 템플릿 */}
          <div className="msg">{an?.plan?.say ?? t('b0.push', { salary: krw(p.salary), amount: krw(amount) })}</div>
          <div className="acts">
            <button className="pri" onClick={() => dispatch({ type: 'NAV', screen: 'B1' })}>{t('b0.send')}</button>
            <button onClick={() => dispatch({ type: 'PROPOSAL_ACTION', action: 'later' })}>{t('b0.later')}</button>
          </div>
        </div>
      )}
      <p style={{ opacity: 0.55, fontSize: 12, marginTop: 'auto' }}>{t('b0.note')}</p>
    </div>
  )
}
```

- [ ] **Step 3: `B1` 제안 카드가 에이전트 문장과 펼침을 쓰게 한다**

`B1` 안의 `{state.proposal?.status === 'new' && (…)}` 블록에서 `say`·`why`를 교체하고 버튼 행 뒤에 `<AgentReasoning />`를 넣는다. `const plan = state.analysis?.plan`을 컴포넌트 상단(`const credit = …` 아래)에 선언한다.

```tsx
            <p className="say">{plan?.say ?? t('b1.say', { amount: krw(state.proposal.amount) })}</p>
            <p className="why">{plan?.why ?? t('b1.why', { rate: fx.rateText, pct: fxAdvantagePct(p.currency), floor: krw(state.livingFloor) })}</p>
```
버튼 `</div>` 다음 줄:
```tsx
            <AgentReasoning />
```

- [ ] **Step 4: `B2`의 앰버 근거 문구도 같은 문장을 쓰게 한다**

`B2` 안 `<div className="note amber">`의 `<span>` 내용을 교체:

```tsx
          <span>{state.analysis?.plan?.why ?? t('b1.why', { rate: fx.rateText, pct: fxAdvantagePct(p.currency), floor: krw(state.livingFloor) })}</span>
```

- [ ] **Step 5: 타입 검사 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: `✓ API 호출 주소 검사 통과` 후 빌드 성공

- [ ] **Step 6: 커밋**

```bash
git add src/app/screens/Remit.tsx
git commit -m "잠금화면 사고과정 + 제안 카드 펼침 연결"
```

---

### Task 10: 스타일

**Files:** Modify `src/styles.css`

- [ ] **Step 1: `.lock`/`.push` 규칙 근처에 분석 카드 스타일 추가**

```css
/* 잠금화면 분석 카드 — 푸시와 같은 폭·모양, 단계만 다르다 */
.think {
  width: 100%; border-radius: 18px; padding: 14px 15px; color: #fff;
  background: rgba(255, 255, 255, 0.13); backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.16);
}
.thinkHead { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; margin-bottom: 10px; }
.thinkHead span { font-weight: 600; opacity: 0.85; }
.thinkRow { display: flex; align-items: center; gap: 9px; font-size: 13.5px; padding: 3.5px 0; opacity: 0.42; transition: opacity 0.25s; }
.thinkRow.done, .thinkRow.running { opacity: 1; }
.thinkDot {
  width: 17px; height: 17px; border-radius: 50%; flex: none; display: grid; place-items: center;
  border: 1.6px solid rgba(255, 255, 255, 0.4);
}
.thinkRow.done .thinkDot { background: var(--app-ok); border-color: transparent; }
.spin { width: 9px; height: 9px; border-radius: 50%; border: 1.6px solid rgba(255, 255, 255, 0.3); border-top-color: #fff; animation: thinkSpin 0.7s linear infinite; }
@keyframes thinkSpin { to { transform: rotate(360deg); } }

/* 제안 카드 — 어떻게 정했는지 펼침 */
.reason { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(0, 0, 0, 0.08); }
.reasonBtn {
  display: flex; align-items: center; gap: 4px; background: none; border: 0; padding: 0;
  font: inherit; font-size: 12.5px; font-weight: 700; color: var(--app-agent-ink); cursor: pointer;
}
.reasonBody { margin-top: 10px; display: flex; flex-direction: column; gap: 11px; }
.reasonStep { display: flex; gap: 9px; }
.reasonNo {
  width: 19px; height: 19px; border-radius: 50%; flex: none; margin-top: 1px;
  background: var(--app-agent-ink); color: #fff; font-size: 11px; font-weight: 800;
  display: grid; place-items: center;
}
.reasonStep b { display: block; font-size: 12px; font-weight: 700; color: var(--app-agent-ink); }
.reasonStep p { margin: 2px 0 0; font-size: 13px; line-height: 1.45; color: var(--app-ink); }
.reasonRej { padding: 9px 11px; border-radius: 12px; background: rgba(0, 0, 0, 0.04); }
.reasonRej b { font-size: 11.5px; font-weight: 700; color: var(--app-muted); }
.reasonRej p { margin: 5px 0 0; font-size: 12.5px; line-height: 1.4; color: var(--app-muted); }
.rejTag { display: inline-block; margin-right: 5px; padding: 1px 6px; border-radius: 6px; background: rgba(0, 0, 0, 0.07); font-size: 11px; font-weight: 700; }
.reasonSrc { font-size: 11px; color: var(--app-muted); font-family: var(--mono); }
```

> 다크 모드에서 `.reason` 경계선과 `.reasonRej` 배경이 안 보이면 `.dark` 블록에 `rgba(255,255,255,0.09)` 변형을 추가한다.

- [ ] **Step 2: 커밋**

```bash
git add src/styles.css
git commit -m "사고과정 UI 스타일"
```

---

### Task 11: 콘솔 출처 표시

**Files:** Modify `src/sim/DataStatus.tsx`

- [ ] **Step 1: 분석 출처 한 줄 추가**

```tsx
import { useStore } from '../store'
```
`rows` 배열 정의 뒤에 추가:
```tsx
  const an = useStore().state.analysis
  rows.push({
    label: '에이전트 분석',
    live: an?.source === 'llm' && an.status === 'done',
    note: !an ? '대기' : an.status === 'running' ? '분석 중' : an.source === 'llm' ? `${((an.latencyMs ?? 0) / 1000).toFixed(1)}초` : '기본 계산',
  })
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/sim/DataStatus.tsx
git commit -m "콘솔에 에이전트 분석 출처 표시"
```

---

### Task 12: 실제 앱 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: dev 서버 띄우기**

Run: `npm run dev`
Expected: `http://localhost:5199`

- [ ] **Step 2: 정상 경로** — 브라우저에서 `시작: 홈` → `급여 입금 발생`

확인: ① 잠금화면에 4단계가 순서대로 체크된다 ② 2~3초 뒤 푸시로 바뀌고 본문이 에이전트 문장이다 ③ `보내기` → 홈 카드에 같은 문장 ④ `어떻게 정했는지 보기` 펼침에 4단계 본문 + 고르지 않은 방법 + `실시간 분석 · N초`

- [ ] **Step 3: 폴백 경로** — 브라우저 devtools에서 `/api/salary-plan`을 블록(또는 네트워크 오프라인)하고 `세션 초기화` → `급여 입금 발생`

확인: 같은 UI가 뜨고 출처가 `기본 계산으로 안내했어요`, 금액은 공식값(Minh 600,000원)

- [ ] **Step 4: 한도 근접** — 데모 콘솔 `보류 · 월 한도`로 바꾸고 다시 급여 입금

확인: ③단계 본문이 `agent.checkTight` 문구로 바뀐다

- [ ] **Step 5: 페르소나·언어 3종** — Budi(인도네시아어)·Sita(네팔어)로 각각 급여 입금

확인: 단계 라벨·본문이 해당 언어, 네팔어에서 줄이 깨지지 않는다

- [ ] **Step 6: 커밋** (검증 중 수정이 있었다면)

```bash
git add -A && git commit -m "검증 중 발견한 문제 수정"
```

---

## 자체 점검

- 설계 문서의 모든 섹션이 Task로 덮여 있다: 신호(2) · LLM 계약·가드레일(4) · 폴백(3,5) · UI(8,9,10) · 상태(1,6) · 출처 표기(10,11) · 검증(2,3,12)
- 타입 이름 일관성: `AgentSignals` `AgentPlan` `Analysis` `PlanAction` `StepKey`, 함수 `collectSignals` `fxStrength` `validatePlan` `fallbackPlan` `formulaAmount` `useSalaryAgent`, i18n 접두사 `agent.*` — Task 1~11에서 같은 이름으로만 쓴다
- 설계 문서에서 바뀐 점: 금액을 클램프하지 않고 **범위를 벗어나면 플랜을 통째로 폐기**한다(문장에 그 금액이 적혀 있어 숫자만 고치면 카드와 설명이 어긋난다). `clamped` 플래그는 없앴다
