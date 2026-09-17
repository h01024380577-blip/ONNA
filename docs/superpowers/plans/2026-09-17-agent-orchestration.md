# 에이전트 워크플로우 (오케스트레이터 · 송금 · 서류 · 신용) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `onna-workflow.png` 그림대로 오케스트레이터(의도 분석 → Task 분업)가 송금·서류·신용 에이전트에 일을 나누고, 송금 실행 → 거래 DB → 신용 축적 → 대출 한도로 이어지게 만든다.

**Architecture:** 오케스트레이터와 에이전트 파이프라인은 클라이언트 훅이 단계별로 dispatch 한다. 서버 엔드포인트는 상태가 없다. 서류 에이전트의 RAG 는 Supabase pgvector 를 Edge 함수에서 publishable 키로 RPC 호출한다. 판정·금액·타이밍·신용은 코드가 정하고, LLM 은 분류와 문장을 맡는다.

**Tech Stack:** Vite + React 18 + TypeScript, Vercel Edge Functions, OpenAI(gpt-4o-mini · gpt-4.1-mini · text-embedding-3-small), Supabase Postgres 17 + pgvector, postgres.js(스크립트), unpdf(스크립트), vitest, Playwright MCP.

**Spec:** `docs/superpowers/specs/2026-09-17-agent-orchestration-design.md`

---

## 공통 규칙 (모든 태스크)

- 작업 폴더: `onna-mvp/`. git 은 **`/opt/homebrew/bin/git`** 을 쓴다(`/usr/bin/git` 은 Xcode 라이선스 때문에 실패).
- 커밋은 **건드린 파일만 경로로 나열**한다. `git add -A` 금지 — 다른 세션이 같은 저장소를 만질 수 있다. 커밋 전에 `git status --short` 로 확인한다.
- 커밋 메시지는 한국어로 짧게 쓰고, 끝에 빈 줄 + `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` 을 붙인다.
- 테스트: `npx vitest run <파일>`. 타입 검사: `npx tsc --noEmit` (src 만 대상).
- 카피 규칙:
  - 금지어: 거절·차단·위반·블록체인·DID·크리덴셜·토큰.
  - 이모지 금지 — `Icon` 컴포넌트를 쓴다.
  - 새 i18n 키는 **ko·en·id·vi·ne 5개 파일 모두**에 넣는다. 각 파일의 `} as const`/`}` 닫는 줄 바로 위에 붙인다.
- 비밀값(`.env.local`)은 절대 출력·커밋하지 않는다.

## 파일 지도

| 파일 | 상태 | 책임 |
|---|---|---|
| `src/mock/rules.ts` | 수정 | `CREDIT_MONTHS` 상수 추가 |
| `src/mock/ledger.ts` | 수정 | 시드에 `verified` 표시 |
| `src/mock/loan.ts` | 수정 | 한도 계수 추가, `loanOffer` 제거(→ credit.ts) |
| `src/mock/fxDemo.ts` | 신규 | 데모용 환율 상황(흔들림·낮음) 적용·복원 |
| `src/agent/credit.ts` | 신규 | 거래 DB → 신용 산정 |
| `src/agent/situation.ts` | 신규 | 송금 ② 상황 판단 |
| `src/agent/timing.ts` | 신규 | 송금 ⑥ 타이밍 결정 |
| `src/agent/spending.ts` | 수정 | `laterDate` 추가 |
| `src/agent/signals.ts` | 수정 | 상황·신용·laterDate 반영 |
| `src/agent/plan.ts` | 수정 | steps.situation, chat 요청 금액 |
| `src/agent/useRemitAgent.ts` | 신규(이름 변경) | 송금 4단계 훅 (`useSalaryAgent.ts` 삭제) |
| `src/agent/orchestrator.ts` | 신규 | 태스크 검증·폴백 분류·채팅 컨텍스트·폴백 답 |
| `src/agent/useOrchestrator.ts` | 신규 | 의도 분석 → 분업 훅 |
| `src/agent/docRules.ts` | 신규 | 서류 종류·허용 행동·답 정리 (api 와 공유) |
| `src/agent/cove.ts` | 신규 | CoVe 비교 |
| `src/agent/docImages.ts` | 신규 | 실행 중 이미지 메모리 보관 |
| `src/agent/useDocAgent.ts` | 신규 | 서류 5단계 훅 |
| `src/types.ts` | 수정 | 새 상태·타입 |
| `src/store.tsx` | 수정 | 신용 알림, 송금 시작·타이밍·예약, 채팅·오케스트레이션, 서류 실행 |
| `src/i18n/*.ts` `src/i18n/index.ts` | 수정 | 새 문구, `fmtDay` |
| `src/app/hooks.ts` | 수정 | `useCredit` |
| `src/app/AgentSteps.tsx` | 수정 | 새 4단계, 밝은 카드 변형 |
| `src/app/RemitCard.tsx` | 신규 | 제안 카드 (홈·채팅 공용) |
| `src/app/DocRunCard.tsx` | 신규 | 서류 진행·결과 카드 (도움·채팅 공용) |
| `src/app/Chat.tsx` | 신규 | 채팅 시트 (`Phone.tsx` 에서 분리) |
| `src/app/Phone.tsx` | 수정 | 채팅 분리, B8 연결 |
| `src/app/screens/Remit.tsx` | 수정 | B1 알림·예약 카드, B2 확정, B3 타이밍, B5 나머지 안내, B8 |
| `src/app/screens/Loan.tsx` `Record.tsx` | 수정 | `useCredit` |
| `src/app/Bill.tsx` | 삭제 | 가짜 고지서 → 샘플 이미지로 대체 |
| `src/sim/Shell.tsx` `MobileShell.tsx` | 수정 | 새 훅 3개 장착 |
| `src/sim/DemoConsole.tsx` `DataStatus.tsx` | 수정 | 환율 상황·예약일 도래·데이터 출처 |
| `src/styles.css` | 수정 | 밝은 단계 카드, 타이밍, 출처 칩, 채팅 카드 |
| `public/samples/gas-bill-2026-09.png` | 신규 | 데모 촬영 샘플(가상 청구서) |
| `api/_lib.ts` | 수정 | `groundedDigits` 공용화 |
| `api/_guides.ts` | 신규 | 임베딩 + Supabase RPC |
| `api/orchestrate.ts` | 신규 | 의도 분석 (`api/agent.ts` 삭제) |
| `api/remit-plan.ts` | 신규 | 송금안 (`api/salary-plan.ts` 삭제) |
| `api/doc-agent.ts` | 신규 | 서류 5단계 (`api/doc.ts` 삭제) |
| `supabase/migrations/001_guides.sql` | 신규 | 스키마·RPC |
| `scripts/db-migrate.mjs` `guide-chunk.mjs` `guide-ingest.mjs` `guide-check.mjs` | 신규 | DB 스크립트 |
| `guides/README.md` `guides/sources.example.json` | 신규 | 안내 자료 넣는 법 |

---

# Phase A — 데이터·신용

### Task 1: 원장에 검증 표시

**Files:**
- Modify: `src/mock/rules.ts`
- Modify: `src/types.ts` (`LedgerEntry`)
- Modify: `src/mock/ledger.ts`
- Modify: `src/store.tsx` (`book`)
- Test: `src/mock/ledger.test.ts`, `src/agent/spending.test.ts`(픽스처 보정)

- [ ] **Step 1: 실패하는 테스트 작성** — `src/mock/ledger.test.ts` 의 `describe('seedLedger'` 블록 맨 끝(`})` 앞)에 추가

```ts
  it('최근 6−monthsToCredit개 완결월과 이번 달만 검증된 기록 — 그 전 달은 은행 거래일 뿐', () => {
    const l = seedLedger(p, NOW) // minh: monthsToCredit 2 → 최근 4개월 검증
    for (let k = 1; k <= MONTHS_SEEDED; k++) {
      const d = new Date(2026, 8 - k, 1)
      const m = l.filter((e) => sameMonth(e.at, d.getFullYear(), d.getMonth()))
      expect(m.every((e) => e.verified === k <= 4)).toBe(true)
    }
    const cur = l.filter((e) => sameMonth(e.at, 2026, 8))
    expect(cur.every((e) => e.verified)).toBe(true)
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/mock/ledger.test.ts`
Expected: FAIL — `verified` 가 undefined.

- [ ] **Step 3: 구현**

`src/mock/rules.ts` 의 `MONTHLY_LIMIT` 줄 아래:

```ts
/** 신용 대출을 열기 위한 검증된 급여 기록 개월 수 */
export const CREDIT_MONTHS = 6
```

`src/types.ts` 의 `LedgerEntry` 에서 `memoKey` 아래에 추가:

```ts
  /** ONNA 로 검증된 기록인지 — 신용 산정은 이 줄만 센다 */
  verified: boolean
```

`src/mock/ledger.ts`:
- import 줄을 `import type { LedgerEntry, Persona, PersonaId } from '../types'` + `import { CREDIT_MONTHS } from './rules'` 로 바꾼다.
- `seedLedger` 안의 `const out: LedgerEntry[] = []` 를 `const out: Omit<LedgerEntry, 'verified'>[] = []` 로 바꾼다.
- 마지막 `return out.sort((a, b) => b.at - a.at)` 을 아래로 바꾼다.

```ts
  /* 검증된 기록 = ONNA 로 쌓이기 시작한 뒤. 최근 (6 − 남은 개월)개 완결월과 이번 달.
     그보다 오래된 달은 은행 거래이지만 신용 기록으로 세지 않는다 (spec 2026-09-17) */
  const vMonths = Math.max(0, Math.min(MONTHS_SEEDED, CREDIT_MONTHS - p.monthsToCredit))
  const verifiedFrom = new Date(y, m0 - vMonths, 1).getTime()
  return out
    .map((e) => ({ ...e, verified: e.at >= verifiedFrom }))
    .sort((a, b) => b.at - a.at)
```

`src/store.tsx` 의 `book` 을 아래로 바꾼다(세션 중 생기는 기록은 전부 검증됨).

```ts
/** 원장에 한 줄 추가 — 최신순 유지. 세션 중 생긴 기록은 전부 검증된 기록이다 */
function book(s: AppState, e: Omit<LedgerEntry, 'at' | 'verified'> & { at?: number }): AppState['ledger'] {
  return [{ at: Date.now(), verified: true, ...e }, ...s.ledger]
}
```

`src/agent/spending.test.ts` 의 픽스처 헬퍼 `e` 가 반환하는 객체에 `verified: true` 를 추가한다(`amount,` 뒤).

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/mock/ledger.test.ts src/agent/spending.test.ts && npx tsc --noEmit`
Expected: 전부 PASS, 타입 에러 없음.

- [ ] **Step 5: 커밋**

```bash
/opt/homebrew/bin/git add src/mock/rules.ts src/types.ts src/mock/ledger.ts src/store.tsx src/mock/ledger.test.ts src/agent/spending.test.ts
/opt/homebrew/bin/git commit -m "원장에 검증된 기록 표시 — 신용 산정의 근거"
```

### Task 2: 거래 DB → 신용 산정 (`credit.ts`)

**Files:**
- Modify: `src/mock/loan.ts`
- Create: `src/agent/credit.ts`
- Test: `src/agent/credit.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/agent/credit.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { assessCredit, creditLimit } from './credit'
import { seedLedger } from '../mock/ledger'
import { PERSONAS } from '../mock/personas'
import { LOAN } from '../mock/loan'
import type { LedgerEntry } from '../types'

const NOW = new Date(2026, 8, 16, 14, 0).getTime()
const salaryNow = (amount: number): LedgerEntry => ({
  id: 'sal_now', at: NOW, kind: 'salary', dir: 'in', amount, verified: true,
})
const remitNow = (id: string): LedgerEntry => ({
  id, at: NOW, kind: 'remit', dir: 'out', amount: 300_000, fee: 3_000, verified: true,
})

describe('assessCredit', () => {
  it('시드 검증 개월 = 6 − monthsToCredit', () => {
    for (const id of ['budi', 'sita', 'minh'] as const) {
      const p = PERSONAS[id]
      const c = assessCredit(seedLedger(p, NOW), p)
      expect(c.creditMonths).toBe(6 - p.monthsToCredit)
      expect(c.monthsToCredit).toBe(p.monthsToCredit)
      expect(c.ready).toBe(false)
    }
  })

  it('Budi 는 이번 달 급여가 기록되는 순간 6개월을 채워 대출이 열린다', () => {
    const p = PERSONAS.budi
    const before = assessCredit(seedLedger(p, NOW), p)
    const after = assessCredit([salaryNow(p.salary), ...seedLedger(p, NOW)], p)
    expect(before.ready).toBe(false)
    expect(after.creditMonths).toBe(6)
    expect(after.monthsToCredit).toBe(0)
    expect(after.ready).toBe(true)
    expect(after.limit).toBeGreaterThan(before.limit)
  })

  it('검증된 송금이 한 건 늘 때마다 한도가 5만원 오른다', () => {
    const p = PERSONAS.minh
    const base = seedLedger(p, NOW)
    const a = assessCredit(base, p)
    const b = assessCredit([remitNow('r1'), ...base], p)
    expect(b.verifiedRemits).toBe(a.verifiedRemits + 1)
    expect(b.limit - a.limit).toBe(LOAN.perRemit)
  })

  it('검증되지 않은 기록은 세지 않는다', () => {
    const p = PERSONAS.minh
    const base = seedLedger(p, NOW)
    const unverified = { ...remitNow('r2'), verified: false }
    expect(assessCredit([unverified, ...base], p).verifiedRemits).toBe(assessCredit(base, p).verifiedRemits)
  })

  it('데모 토글은 준비 상태만 켠다 — 개월 수는 그대로', () => {
    const p = PERSONAS.sita
    const c = assessCredit(seedLedger(p, NOW), p, true)
    expect(c.ready).toBe(true)
    expect(c.creditMonths).toBe(2)
  })

  it('금리 = 기준 + 가산 − 우대, 소수 1자리', () => {
    const p = PERSONAS.budi // 재직 22개월 → 1.0%p
    const c = assessCredit(seedLedger(p, NOW), p, false, 12)
    expect(c.discount).toBe(1.0 + (c.verifiedRemits >= 6 ? 1.0 : 0) + 0.5)
    expect(c.rate).toBe(Math.round((c.base + LOAN.spread - c.discount) * 10) / 10)
  })
})

describe('creditLimit', () => {
  it('기본 + 개월×20만 + 송금×5만, 만원 단위', () => {
    expect(creditLimit(6, 8)).toBe(500_000 + 1_200_000 + 400_000)
  })
  it('개월은 6까지만 반영', () => expect(creditLimit(9, 0)).toBe(creditLimit(6, 0)))
  it('상한 300만원', () => expect(creditLimit(6, 100)).toBe(LOAN.cap))
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/agent/credit.test.ts`
Expected: FAIL — `./credit` 모듈 없음.

- [ ] **Step 3: 구현**

`src/mock/loan.ts`:
- `LOAN` 객체에서 `minMonths` 줄을 지우고, `cap` 아래에 추가한다.

```ts
  /** 기록 기반 한도 = limitBase + 검증 개월 × perMonth + 검증 송금 × perRemit (상한 cap) */
  limitBase: 500_000,
  perMonth: 200_000,
  perRemit: 50_000,
```

- `export interface LoanOffer { … }` 와 `export function loanOffer(…) { … }` 를 **통째로 삭제**한다. 파일 맨 위 `import type { Persona } from '../types'` 도 지운다(더 안 쓴다). 파일 머리 주석을 아래로 바꾼다.

```ts
/* 소액대출 기준선 — 한도·금리 판정은 src/agent/credit.ts (거래 DB 기반, 코드).
   에이전트는 사유 설명만 한다 (AG-3) */
```

`src/agent/credit.ts`:

```ts
import type { LedgerEntry, Persona } from '../types'
import { CREDIT_MONTHS } from '../mock/rules'
import { LOAN, baseRateFor } from '../mock/loan'

/* 거래 DB(원장) → 신용. 그림의 "신용 축적 → 신용 확인 → 대출 한도 증가·승인".
   검증된 기록(verified)만 센다 — 시드의 오래된 달은 은행 거래일 뿐 신용 기록이 아니다. */

export interface Credit {
  /** 검증된 급여가 있는 달 수 */
  creditMonths: number
  monthsToCredit: number
  verifiedRemits: number
  ready: boolean
  limit: number
  /** 연 금리(%) = base + spread − discount */
  rate: number
  discount: number
  base: number
  spread: number
}

const monthKey = (at: number) => {
  const d = new Date(at)
  return d.getFullYear() * 12 + d.getMonth()
}

export function creditLimit(creditMonths: number, verifiedRemits: number): number {
  const raw =
    LOAN.limitBase +
    Math.min(creditMonths, CREDIT_MONTHS) * LOAN.perMonth +
    verifiedRemits * LOAN.perRemit
  return Math.floor(Math.min(LOAN.cap, raw) / 10_000) * 10_000
}

/** demoReady = 데모 콘솔 "신용 6개월 충족" 토글 */
export function assessCredit(ledger: LedgerEntry[], p: Persona, demoReady = false, months = 12): Credit {
  const v = ledger.filter((e) => e.verified)
  const creditMonths = new Set(v.filter((e) => e.kind === 'salary').map((e) => monthKey(e.at))).size
  const verifiedRemits = v.filter((e) => e.kind === 'remit').length
  // 우대: 재직 12개월↑ 1.0%p · 검증 송금 6건↑ 1.0%p · 공과금 정시 0.5%p
  const discount = (p.monthsEmployed >= 12 ? 1.0 : 0) + (verifiedRemits >= 6 ? 1.0 : 0) + 0.5
  const base = baseRateFor(months)
  return {
    creditMonths,
    monthsToCredit: Math.max(0, CREDIT_MONTHS - creditMonths),
    verifiedRemits,
    ready: creditMonths >= CREDIT_MONTHS || demoReady,
    limit: creditLimit(creditMonths, verifiedRemits),
    rate: Math.round((base + LOAN.spread - discount) * 10) / 10,
    discount,
    base,
    spread: LOAN.spread,
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/agent/credit.test.ts`
Expected: PASS. (`tsc` 는 `loanOffer` 를 쓰는 곳 때문에 아직 실패한다 — Task 3 에서 고친다)

- [ ] **Step 5: 커밋**

```bash
/opt/homebrew/bin/git add src/mock/loan.ts src/agent/credit.ts src/agent/credit.test.ts
/opt/homebrew/bin/git commit -m "거래 DB 기반 신용 산정 — 검증 개월·검증 송금으로 한도·금리"
```

### Task 3: 신용을 앱 전체에 연결 + 한도 증가 알림

**Files:**
- Modify: `src/types.ts`, `src/store.tsx`, `src/app/hooks.ts`, `src/agent/signals.ts`
- Modify: `src/app/screens/Loan.tsx`, `src/app/screens/Record.tsx`, `src/app/screens/Remit.tsx`, `src/app/Phone.tsx`
- Modify: `src/i18n/{ko,en,id,vi,ne}.ts`
- Test: `src/store.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성** — `src/store.test.ts`

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { initialState, reducer } from './store'
import { assessCredit } from './agent/credit'
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
})
```

> `afterEach` 는 Task 6 에서 쓴다. 지금 import 해 둬도 무방하다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/store.test.ts`
Expected: FAIL — `creditNews` undefined, `CREDIT_NEWS_DISMISS` 미정의.

- [ ] **Step 3: 상태·리듀서 구현**

`src/types.ts` 의 `AppState` 에서 `loan?: …` 줄 아래에 추가:

```ts
  /** 거래 DB 가 바뀌어 신용이 좋아졌을 때 홈에 띄우는 알림 */
  creditNews?: { kind: 'ready' | 'limitUp'; limit: number; at: number }
```

`src/store.tsx`:

1. import 교체 — `import { loanOffer, monthlyPayment } from './mock/loan'` → `import { monthlyPayment } from './mock/loan'`, 그리고 `import { assessCredit } from './agent/credit'` 추가.
2. `Action` 유니온에 `| { type: 'CREDIT_NEWS_DISMISS' }` 추가.
3. `export function reducer(` 를 `function baseReducer(` 로 이름을 바꾸고, 그 안의 **재귀 호출** `return reducer(st, { type: 'SEND_FINAL' })`(OPS_APPROVE)은 그대로 둔다. 바깥 `reducer` 가 신용 비교를 한 번 더 하지만 결과가 같다.
4. `baseReducer` 의 `switch` 에 추가:

```ts
    case 'CREDIT_NEWS_DISMISS':
      return s.creditNews ? { ...s, creditNews: undefined } : s
```

5. `LOAN_EXECUTE` 의 `const offer = loanOffer(p, s.sessionRemits, s.loanDraft.months)` 를 아래로 바꾸고, 트레이스 문자열의 `(기록 우대 ${offer.discount}%p)` 는 그대로 둔다.

```ts
      const offer = assessCredit(s.ledger, p, s.creditReady, s.loanDraft.months)
      if (!offer.ready) return s
```

6. `baseReducer` 정의 **아래**에 바깥 리듀서를 둔다.

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/store.test.ts`
Expected: PASS.

- [ ] **Step 5: 신호·화면 연결**

`src/app/hooks.ts` 를 아래로 바꾼다.

```ts
import { useStore } from '../store'
import { PERSONAS } from '../mock/personas'
import { makeT, fmtKRW, fmtLocal, fmtDay } from '../i18n'
import { assessCredit } from '../agent/credit'

export function useApp() {
  const { state, dispatch } = useStore()
  const p = PERSONAS[state.personaId]
  const lang = state.lang ?? 'ko' // 언어 설정 전 기본 한국어, 설정 후에는 그 언어로만
  const t = makeT(lang)
  const krw = (n: number) => fmtKRW(n, lang)
  const local = (n: number) => fmtLocal(n, p.currency)
  const day = (ymd: string) => fmtDay(ymd, lang)
  return { state, dispatch, p, lang, t, krw, local, day }
}

/** 거래 DB 기반 신용 — 화면은 페르소나 고정값 대신 항상 이걸 본다 */
export function useCredit(months = 12) {
  const { state } = useStore()
  return assessCredit(state.ledger, PERSONAS[state.personaId], state.creditReady, months)
}
```

`src/i18n/index.ts` 의 `fmtMMSS` 위에 추가(날짜 표기 — Task 8 에서도 쓴다):

```ts
/** YYYY-MM-DD → 짧은 날짜. 네팔어는 데바나가리 숫자를 피하려고 en-GB 서식을 쓴다 */
export function fmtDay(ymd: string, lang: Lang): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  if (lang === 'ko') return `${m}월 ${d}일`
  const loc = { en: 'en-US', id: 'id-ID', vi: 'vi-VN', ne: 'en-GB' }[lang]
  return new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric' }).format(new Date(y, m - 1, d))
}
```

`src/agent/signals.ts`:
- `import { assessCredit } from './credit'` 추가.
- `collectSignals` 안의 `const now = Date.now()` 아래에 `const credit = assessCredit(s.ledger, p, s.creditReady)` 를 추가한다.
- 반환 객체의 `monthsToCredit: p.monthsToCredit,` → `monthsToCredit: credit.monthsToCredit,`
- 반환 객체의 `creditReady: s.creditReady || p.monthsToCredit <= 0,` → `creditReady: credit.ready,`

`src/app/screens/Loan.tsx`:
- import 교체: `import { LOAN, benchmark, loanOffer, monthlyPayment, totalRepay } from '../../mock/loan'` → `import { LOAN, benchmark, monthlyPayment, totalRepay } from '../../mock/loan'`, `import { useApp } from '../hooks'` → `import { useApp, useCredit } from '../hooks'`.
- `useCreditReady` 를 아래로 바꾼다.

```ts
/** 신용 이력 충족 여부 — 거래 DB 의 검증 개월(또는 데모 토글) */
export function useCreditReady() {
  return useCredit().ready
}
```

- D1: `const offer = loanOffer(p, state.sessionRemits)` → `const offer = useCredit()`.
- D2: `const offer = loanOffer(p, state.sessionRemits, months)` → `const offer = useCredit(months)`.
- D3: `const offer = loanOffer(p, state.sessionRemits, state.loanDraft.months)` → `const offer = useCredit(state.loanDraft.months)`.

`src/app/screens/Record.tsx`:
- `import { useApp } from '../hooks'` → `import { useApp, useCredit } from '../hooks'`.
- C1 에서 `const credit = p.monthsToCredit` 와 `const pct = …` 두 줄을 아래로 바꾼다.

```ts
  const cr = useCredit()
  const credit = cr.monthsToCredit
  const pct = Math.round((Math.min(cr.creditMonths, 6) / 6) * 100)
```

- `months` 매핑에서 `salary`·`remit` 을 검증된 기록만 보게 바꾼다(배지 기준).

```ts
    salary: g.entries.some((e) => e.kind === 'salary' && e.verified),
    remit: g.entries.filter((e) => e.kind === 'remit' && e.verified).length,
```

`src/app/screens/Remit.tsx`:
- `import { useApp } from '../hooks'` → `import { useApp, useCredit } from '../hooks'`.
- B1: `const credit = Math.max(0, p.monthsToCredit)` 와 `const pct = …` 를 아래로 바꾼다.

```ts
  const cr = useCredit()
  const credit = cr.monthsToCredit
  const pct = Math.round((Math.min(cr.creditMonths, 6) / 6) * 100)
```

- B1: `{state.salaryEvent && <div className="h1" …>}` 줄 **바로 아래**에 신용 알림 카드를 넣는다.

```tsx
        {state.creditNews && (
          <div className="card accent creditNews">
            <div className="ico" style={{ background: 'var(--app-ok-tint)', color: 'var(--app-ok)' }}><Icon name="money" size={20} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4>{t(state.creditNews.kind === 'ready' ? 'credit.newsReady' : 'credit.newsUp', { limit: krw(state.creditNews.limit) })}</h4>
              <button className="btn sm" style={{ marginTop: 8 }} onClick={() => { dispatch({ type: 'CREDIT_NEWS_DISMISS' }); dispatch({ type: 'NAV', screen: 'D1' }) }}>{t('credit.newsGo')}</button>
            </div>
            <button className="chatClose" aria-label={t('common.close')} onClick={() => dispatch({ type: 'CREDIT_NEWS_DISMISS' })}><Icon name="close" size={15} /></button>
          </div>
        )}
```

- B5: `const remits = …` 아래에 `const cr = useCredit()` 를 추가하고, `useState`·`useEffect` 호출보다 **앞**에 오도록 한다(hooks 순서 — B5 는 `if (!tx) return null` 이전에 모든 훅을 호출해야 한다). 그 뒤 두 줄을 바꾼다.

```tsx
          <p>{t('b5.histUpS', { n: remits, k: cr.monthsToCredit })}</p>
          <div className="meter"><i style={{ width: `${Math.round((Math.min(cr.creditMonths, 6) / 6) * 100)}%` }} /></div>
```

`src/app/Phone.tsx` (채팅은 Task 19 에서 통째로 옮긴다. 지금은 빌드만 살린다):
- `import { loanOffer } from '../mock/loan'` → `import { assessCredit } from '../agent/credit'`.
- `reply()` 의 loan 분기와 `send()` 의 `const offer = loanOffer(p, state.sessionRemits)` 를 `const offer = assessCredit(state.ledger, p, state.creditReady)` 로 바꾼다. `ready` 는 `offer.ready`, `p.monthsToCredit` 은 `offer.monthsToCredit` 으로 바꾼다.
- `toMsg()` 의 `state.creditReady || p.monthsToCredit <= 0` 도 `assessCredit(state.ledger, p, state.creditReady).ready` 로 바꾼다.
- ctx 의 `monthsToCredit: p.monthsToCredit, creditReady: …` 두 줄을 `monthsToCredit: offer.monthsToCredit, creditReady: offer.ready,` 로 바꾼다.

`src/styles.css` 맨 끝에 추가:

```css
/* 신용 알림 — 거래 DB 가 바뀌어 대출 가능·한도 증가 */
.creditNews { display: flex; gap: 12px; align-items: flex-start; }
.creditNews h4 { margin: 0; line-height: 1.4; }
.creditNews .btn { width: auto; padding-left: 16px; padding-right: 16px; }
```

- [ ] **Step 6: 문구 5개 언어** — 각 파일 끝에 추가

ko:
```ts
  'credit.newsReady': '기록이 6개월 쌓였어요. 이제 대출을 받을 수 있어요. 한도는 {limit}이에요.',
  'credit.newsUp': '기록이 쌓여서 대출 한도가 {limit}로 늘었어요.',
  'credit.newsGo': '대출 알아보기',
```
en:
```ts
  'credit.newsReady': 'Your record reached 6 months. You can now borrow, up to {limit}.',
  'credit.newsUp': 'Your record grew, so your loan limit is now {limit}.',
  'credit.newsGo': 'See loan options',
```
id:
```ts
  'credit.newsReady': 'Catatan Anda sudah 6 bulan. Sekarang Anda bisa meminjam, sampai {limit}.',
  'credit.newsUp': 'Catatan Anda bertambah, jadi batas pinjaman Anda sekarang {limit}.',
  'credit.newsGo': 'Lihat pinjaman',
```
vi:
```ts
  'credit.newsReady': 'Hồ sơ của quý khách đã đủ 6 tháng. Giờ quý khách có thể vay, tối đa {limit}.',
  'credit.newsUp': 'Hồ sơ tăng thêm nên hạn mức vay của quý khách nay là {limit}.',
  'credit.newsGo': 'Xem khoản vay',
```
ne:
```ts
  'credit.newsReady': 'तपाईंको रेकर्ड 6 महिना पुग्यो। अब तपाईं {limit} सम्म ऋण लिन सक्नुहुन्छ।',
  'credit.newsUp': 'रेकर्ड बढेकाले तपाईंको ऋण सीमा अब {limit} भयो।',
  'credit.newsGo': 'ऋण हेर्नुहोस्',
```

> 네팔어 문구에서도 숫자는 아라비아 숫자로 쓴다(앱 금액 표기와 맞춘다).

- [ ] **Step 7: 전체 확인**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 타입 에러 없음, 전체 PASS. `plan.test.ts`·`signals.test.ts` 는 이번 변경과 무관하게 통과해야 한다.

- [ ] **Step 8: 커밋**

```bash
/opt/homebrew/bin/git add src/types.ts src/store.tsx src/store.test.ts src/app/hooks.ts src/i18n/index.ts src/agent/signals.ts src/app/screens/Loan.tsx src/app/screens/Record.tsx src/app/screens/Remit.tsx src/app/Phone.tsx src/styles.css src/i18n/ko.ts src/i18n/en.ts src/i18n/id.ts src/i18n/vi.ts src/i18n/ne.ts
/opt/homebrew/bin/git commit -m "신용을 거래 DB 에서 산정해 화면·신호·대출에 연결 + 한도 증가 알림"
```

# Phase B — 송금 에이전트

### Task 4: 환율 상황 데모 · 상황 판단 · laterDate

**Files:**
- Modify: `src/types.ts`
- Create: `src/mock/fxDemo.ts`
- Modify: `src/mock/fx.ts` (`loadLiveFx` 끝에서 `rebaseFxDemo()`)
- Create: `src/agent/situation.ts`
- Modify: `src/agent/spending.ts`, `src/agent/signals.ts`
- Test: `src/agent/situation.test.ts`, `src/agent/spending.test.ts`, `src/agent/signals.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/agent/situation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { judgeSituation } from './situation'

const base = {
  sendableMax: 900_000, remitAvg3m: 800_000, spendPace: 'usual' as const,
  fxStrength: 'clearly-better' as const, fxRisk: 'calm' as const, sentThisMonth: 0,
}

describe('judgeSituation', () => {
  it('상한이 평소 송금의 80% 이상이고 씀씀이가 평소면 여유', () => {
    expect(judgeSituation(base).money).toBe('roomy')
    expect(judgeSituation({ ...base, sendableMax: 640_000 }).money).toBe('roomy')
  })
  it('상한이 평소 송금의 80%보다 작으면 빠듯', () => {
    expect(judgeSituation({ ...base, sendableMax: 639_999 }).money).toBe('tight')
  })
  it('이번 달 씀씀이가 높으면 빠듯', () => {
    expect(judgeSituation({ ...base, spendPace: 'higher' }).money).toBe('tight')
  })
  it('평소 송금 기록이 없으면 최소 송금액(1만원)이 기준', () => {
    expect(judgeSituation({ ...base, remitAvg3m: 0, sendableMax: 9_999 }).money).toBe('tight')
    expect(judgeSituation({ ...base, remitAvg3m: 0, sendableMax: 10_000 }).money).toBe('roomy')
  })
  it('환율·흔들림은 신호 그대로, 이번 달 송금 여부', () => {
    const s = judgeSituation({ ...base, fxStrength: 'lower', fxRisk: 'volatile', sentThisMonth: 1 })
    expect(s).toMatchObject({ rate: 'lower', risk: 'volatile', sentAlready: true })
  })
})
```

`src/agent/spending.test.ts` 의 `describe('summarizeSpending'` 안에 추가:

```ts
  it('기다릴 날 — 월세가 아직이면 월세일', () => expect(s.laterDate).toBe('2026-09-18'))
  it('기다릴 날 — 월세가 이미 나갔으면 오늘부터 7일 뒤', () => {
    const s2 = summarizeSpending([...ledger, e(2026, 9, 2, 'rent', p.autoDebit)], p, NOW)
    expect(s2.laterDate).toBe('2026-09-23')
  })
```

`src/agent/signals.test.ts` 맨 끝에 추가(import 에 `afterEach` 추가, `import { applyFxDemo } from '../mock/fxDemo'`, `import { FX } from '../mock/fx'` 추가):

```ts
describe('환율 상황 데모', () => {
  const p = PERSONAS.minh
  afterEach(() => applyFxDemo('real'))

  it('낮음 → 환율 판정 lower, 기준선보다 낮은 환율', () => {
    applyFxDemo('low')
    const s = initialState('minh', 'home')
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(sg.fxStrength).toBe('lower')
    expect(FX.VND.rate).toBeLessThan(FX.VND.avg3m)
  })

  it('흔들림 → fxRisk volatile', () => {
    applyFxDemo('volatile')
    const s = initialState('minh', 'home')
    expect(collectSignals(s, p, s.balance).fxRisk).toBe('volatile')
  })

  it('실제로 되돌리면 원래 값', () => {
    const before = { rate: FX.VND.rate, past: FX.VND.past }
    applyFxDemo('low')
    applyFxDemo('volatile')
    applyFxDemo('real')
    expect(FX.VND.rate).toBe(before.rate)
    expect(FX.VND.past).toBe(before.past)
  })

  it('신호에 상황 판단과 기다릴 날이 들어 있다', () => {
    const s = initialState('minh', 'home')
    const sg = collectSignals(s, p, s.balance + p.salary)
    expect(['roomy', 'tight']).toContain(sg.situation.money)
    expect(sg.laterDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/agent/situation.test.ts src/agent/spending.test.ts src/agent/signals.test.ts`
Expected: FAIL — 모듈·필드 없음.

- [ ] **Step 3: 타입**

`src/types.ts`:
- `export type FxRisk = …` 줄 아래에 추가.

```ts
/** 데모 콘솔 "환율 상황" — 송금 타이밍 분기 시연용 */
export type FxDemo = 'real' | 'volatile' | 'low'

/** 송금 ② 지금 상황 판단 — 코드가 내린 판정. LLM 은 설명만 한다 */
export interface Situation {
  money: 'roomy' | 'tight'
  rate: AgentSignals['fxStrength']
  risk: FxRisk
  sentAlready: boolean
}
```

- `SpendingSummary` 의 `nextSalaryDate` 아래에 추가.

```ts
  /** 기다렸다 보낼 날 — 월세가 아직이면 월세일, 이미 나갔으면 오늘 + 7일 */
  laterDate: string // YYYY-MM-DD
```

- `AgentSignals` 의 `today: string` 아래에 `situation: Situation` 추가.
- `AppState` 의 `dark: boolean` 아래에 `fxDemo: FxDemo` 추가.

`src/store.tsx` 의 `initialState` 에서 `dark: false,` 아래에 `fxDemo: 'real',` 추가. `RESET` 의 이월 목록에 `fxDemo: s.fxDemo` 추가:

```ts
      return { ...initialState(a.persona, a.startAt), scenario: s.scenario, dark: s.dark, creditReady: s.creditReady, fxDemo: s.fxDemo }
```

- [ ] **Step 4: 구현**

`src/mock/fxDemo.ts`:

```ts
import type { Currency, FxDemo, PastPoint } from '../types'
import { FX, fmtRate } from './fx'

/* 데모 콘솔 "환율 상황" — 송금 타이밍 분기(지금·나눠서·예약)를 시연하려고 FX 목 객체를
   그 자리에서 바꾼다. 홈 환율·견적·에이전트 신호가 같은 값을 보게 하려는 것이다.
   'real' 이면 원래 값으로 되돌린다. 같은 모드를 두 번 적용해도 결과가 같다(StrictMode). */

type Snapshot = { rate: number; rateText: string; past: (typeof FX)[Currency]['past'] }
const base: Partial<Record<Currency, Snapshot>> = {}
let current: FxDemo = 'real'

const DIGITS: Record<Currency, number> = { VND: 1, IDR: 1, NPR: 4 }
const roundTo = (cur: Currency, n: number) => Number(n.toFixed(DIGITS[cur]))

function ymdAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const point = (cur: Currency, rate: number, daysAgo: number): PastPoint => ({
  date: ymdAgo(daysAgo), rate, rateText: fmtRate(cur, rate),
})

export function applyFxDemo(mode: FxDemo): void {
  current = mode
  for (const cur of Object.keys(FX) as Currency[]) {
    const f = FX[cur]
    const b = (base[cur] ??= { rate: f.rate, rateText: f.rateText, past: f.past })
    f.rate = b.rate
    f.rateText = b.rateText
    f.past = b.past
    if (mode === 'low') {
      // 기준선보다 1.5% 낮은 날 → fxStrength 'lower'
      f.rate = roundTo(cur, f.avg3m * 0.985)
      f.rateText = fmtRate(cur, f.rate)
    } else if (mode === 'volatile') {
      // 1주 전 +2%, 1달 전 −1.5% → 흔들림 약 3.5% → fxRisk 'volatile'
      f.past = {
        weekAgo: point(cur, roundTo(cur, f.rate * 1.02), 7),
        monthAgo: point(cur, roundTo(cur, f.rate * 0.985), 30),
      }
    }
  }
}

/** loadLiveFx 가 실값을 받은 뒤 부른다 — 새 실값을 기준으로 삼고 현재 모드를 다시 적용 */
export function rebaseFxDemo(): void {
  for (const k of Object.keys(base) as Currency[]) delete base[k]
  if (current !== 'real') applyFxDemo(current)
}
```

`src/mock/fx.ts`:
- 맨 위 import 에 `import { rebaseFxDemo } from './fxDemo'` 추가.
- `loadLiveFx` 의 `fxLive.asOf = d.asOf` 줄 아래에 `rebaseFxDemo()` 추가.

`src/agent/situation.ts`:

```ts
import type { AgentSignals, Situation } from '../types'
import { MIN_SEND } from './plan'

/* 송금 ② 지금 상황 판단. fxStrength·spendPace 처럼 판정은 코드가 내린다 —
   LLM 에 맡기면 같은 값을 매번 다르게 부른다. LLM 은 이 판정을 설명만 한다.
   여유/빠듯: 보낼 수 있는 상한이 평소 송금의 80%에 못 미치거나 이번 달 씀씀이가 높으면 빠듯. */
export function judgeSituation(
  sg: Pick<AgentSignals, 'sendableMax' | 'remitAvg3m' | 'spendPace' | 'fxStrength' | 'fxRisk' | 'sentThisMonth'>,
): Situation {
  const need = Math.max(MIN_SEND, Math.round(sg.remitAvg3m * 0.8))
  return {
    money: sg.sendableMax < need || sg.spendPace === 'higher' ? 'tight' : 'roomy',
    rate: sg.fxStrength,
    risk: sg.fxRisk,
    sentAlready: sg.sentThisMonth > 0,
  }
}
```

`src/agent/spending.ts` 의 `summarizeSpending` 에서 `const payday = paydayOf(today)` 부터 `return {` 직전까지를 아래로 바꾼다(기존 `today.setHours` 가 `today` 를 바꾸던 부작용도 없앤다).

```ts
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
```

그리고 반환 객체의 `nextSalaryDate: ymd(nextSalary),` 아래에 `laterDate,` 를 추가한다.

`src/agent/signals.ts`:
- import 에 `import { judgeSituation } from './situation'` 추가.
- `collectSignals` 의 `return {` 를 `const core: Omit<AgentSignals, 'situation'> = {` 로 바꾸고, 객체 닫는 `}` 뒤에 아래를 둔다.

```ts
  return { ...core, situation: judgeSituation(core) }
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS, 타입 에러 없음.

- [ ] **Step 6: 커밋**

```bash
/opt/homebrew/bin/git add src/types.ts src/store.tsx src/mock/fxDemo.ts src/mock/fx.ts src/agent/situation.ts src/agent/situation.test.ts src/agent/spending.ts src/agent/spending.test.ts src/agent/signals.ts src/agent/signals.test.ts
/opt/homebrew/bin/git commit -m "송금 ② 상황 판단·기다릴 날 신호 + 환율 상황 데모"
```

### Task 5: 송금 ⑥ 타이밍 결정 (`timing.ts`)

**Files:**
- Modify: `src/types.ts`
- Create: `src/agent/timing.ts`
- Test: `src/agent/timing.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/agent/timing.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { decideTiming, laterParts, nowPart, overrideNow, SPLIT_MIN } from './timing'

const sg = { fxStrength: 'clearly-better' as const, fxRisk: 'calm' as const, laterDate: '2026-09-19' }
const total = (t: ReturnType<typeof decideTiming>) => t.parts.reduce((a, x) => a + x.amount, 0)

describe('decideTiming', () => {
  it('평소엔 지금 전액', () => {
    const t = decideTiming(600_000, sg, 'remit_full')
    expect(t).toEqual({ rule: 'now', cause: 'normal', parts: [{ when: 'now', amount: 600_000 }] })
  })

  it("에이전트가 '나중에'를 골랐으면 기다릴 날에 전액 예약", () => {
    const t = decideTiming(600_000, sg, 'later')
    expect(t).toMatchObject({ rule: 'wait', cause: 'agent-later', parts: [{ when: '2026-09-19', amount: 600_000 }] })
  })

  it('환율이 낮은 날엔 보내기를 골랐어도 예약', () => {
    const t = decideTiming(600_000, { ...sg, fxStrength: 'lower' }, 'remit_full')
    expect(t).toMatchObject({ rule: 'wait', cause: 'rate-low' })
  })

  it('환율이 흔들리고 40만원 이상이면 절반 지금 + 나머지 예약', () => {
    const t = decideTiming(600_000, { ...sg, fxRisk: 'volatile' }, 'remit_full')
    expect(t).toEqual({
      rule: 'split', cause: 'rate-moving',
      parts: [{ when: 'now', amount: 300_000 }, { when: '2026-09-19', amount: 300_000 }],
    })
  })

  it('나눌 때 지금 몫은 만원 단위, 합계는 그대로', () => {
    const t = decideTiming(450_000, { ...sg, fxRisk: 'moving' }, 'remit_adjust')
    expect(nowPart(t)).toBe(230_000)
    expect(total(t)).toBe(450_000)
  })

  it('흔들려도 40만원 미만이면 지금 전액', () => {
    expect(decideTiming(SPLIT_MIN - 10_000, { ...sg, fxRisk: 'volatile' }, 'remit_full').rule).toBe('now')
  })

  it('낮은 환율이 흔들림보다 먼저다', () => {
    expect(decideTiming(600_000, { fxStrength: 'lower', fxRisk: 'volatile', laterDate: 'x' }, 'remit_full').rule).toBe('wait')
  })
})

describe('도우미', () => {
  it('사용자가 지금 한 번에로 바꾸면 지금 전액 + 표시', () => {
    expect(overrideNow(500_000)).toEqual({ rule: 'now', cause: 'user', parts: [{ when: 'now', amount: 500_000 }], overridden: true })
  })
  it('지금 몫과 예약 몫', () => {
    const t = decideTiming(600_000, { ...sg, fxRisk: 'volatile' }, 'remit_full')
    expect(nowPart(t)).toBe(300_000)
    expect(laterParts(t)).toEqual([{ when: '2026-09-19', amount: 300_000 }])
    expect(nowPart(decideTiming(600_000, sg, 'later'))).toBe(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/agent/timing.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/types.ts` 의 `PlanAction` 줄 아래에 추가:

```ts
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
```

`src/agent/timing.ts`:

```ts
import type { AgentSignals, PlanAction, Timing, TimingPart } from '../types'
import { MIN_SEND } from './plan'

/* 송금 ⑥ 타이밍 결정 — 그림에서 "사용자 승인" 다음 단계.
   승인된 최종 금액(금액 변경을 거쳤으면 바꾼 금액)을 두고 코드가 정한다.
     wait  : 에이전트가 '나중에'를 골랐거나 오늘 환율이 낮다 → 기다릴 날에 전액
     split : 환율이 흔들리고 40만원 이상 → 절반 지금, 나머지 기다릴 날
     now   : 그 밖 → 지금 전액
   낮은 환율을 흔들림보다 먼저 본다 — 낮은 날에 절반을 보내면 그 절반이 손해다. */

export const SPLIT_MIN = 400_000
const round10k = (n: number) => Math.round(n / 10_000) * 10_000

export function decideTiming(
  amount: number,
  sg: Pick<AgentSignals, 'fxStrength' | 'fxRisk' | 'laterDate'>,
  action: PlanAction,
): Timing {
  if (action === 'later')
    return { rule: 'wait', cause: 'agent-later', parts: [{ when: sg.laterDate, amount }] }
  if (sg.fxStrength === 'lower')
    return { rule: 'wait', cause: 'rate-low', parts: [{ when: sg.laterDate, amount }] }
  if ((sg.fxRisk === 'moving' || sg.fxRisk === 'volatile') && amount >= SPLIT_MIN) {
    const now = Math.max(MIN_SEND, round10k(amount / 2))
    return {
      rule: 'split',
      cause: 'rate-moving',
      parts: [{ when: 'now', amount: now }, { when: sg.laterDate, amount: amount - now }],
    }
  }
  return { rule: 'now', cause: 'normal', parts: [{ when: 'now', amount }] }
}

export const overrideNow = (amount: number): Timing => ({
  rule: 'now', cause: 'user', parts: [{ when: 'now', amount }], overridden: true,
})

export const nowPart = (t: Timing): number => t.parts.find((x) => x.when === 'now')?.amount ?? 0
export const laterParts = (t: Timing): TimingPart[] => t.parts.filter((x) => x.when !== 'now')
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/agent/timing.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
/opt/homebrew/bin/git add src/types.ts src/agent/timing.ts src/agent/timing.test.ts
/opt/homebrew/bin/git commit -m "송금 ⑥ 타이밍 결정 — 지금·나눠서·예약"
```

### Task 6: 리듀서 — 타이밍 · 실행 · 예약 · 환율 상황

**Files:**
- Modify: `src/types.ts` (`Screen`, `AppState`)
- Modify: `src/store.tsx`
- Test: `src/store.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/store.test.ts` 끝에 추가

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/store.test.ts`
Expected: FAIL — 액션 미정의.

- [ ] **Step 3: 타입**

`src/types.ts`:
- `Screen` 의 `| 'B0' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B7'` 을 `| 'B0' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B7' | 'B8' // B8 예약 완료` 로 바꾼다.
- `AppState` 의 `quote?: Quote` 아래에 추가.

```ts
  /** 송금 ⑥ 타이밍 — 승인 뒤 코드가 정한 값. 사용자가 바꾸면 overridden */
  timing?: Timing
  /** 예약된 송금 — 세션 데이터 */
  scheduled: ScheduledRemit[]
```

- [ ] **Step 4: 리듀서 구현** — `src/store.tsx`

import 에 추가:

```ts
import { decideTiming, laterParts, nowPart, overrideNow } from './agent/timing'
import { applyFxDemo } from './mock/fxDemo'
import type { FxDemo, Timing } from './types'
```

`Action` 유니온에 추가:

```ts
  | { type: 'CONFIRM_AMOUNT' } // B2 확정 → B3 (타이밍 새로 계산)
  | { type: 'TIMING_OVERRIDE' } // "지금 한 번에 보내기"
  | { type: 'TIMING_RESET' } // 에이전트 결정으로 되돌리기
  | { type: 'SCHEDULED_DUE' } // 데모: 예약일 도래
  | { type: 'SCHEDULED_CANCEL'; id: string }
  | { type: 'SET_FX_DEMO'; mode: FxDemo }
```

`initialState` 의 `sessionRemits: 0,` 아래에 `scheduled: [],` 추가.

`initialState` 함수 아래(리듀서 위)에 추가:

```ts
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
```

`baseReducer` 의 `case 'PROPOSAL_ACTION'` 에서 `send` 반환을 바꾼다:

```ts
      return { ...s, screen: 'B3', timing: undefined, events }
```

`case 'EXECUTE'` 전체를 아래로 바꾼다.

```ts
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
```

`case 'SET_DRAFT'` 아래에 새 case 들을 추가한다.

```ts
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

    case 'SET_FX_DEMO':
      // FX 목 객체를 바꾸는 부작용 — 같은 모드 재적용이 안전해서 StrictMode 이중 호출에도 괜찮다
      applyFxDemo(a.mode)
      return { ...s, fxDemo: a.mode, trace: trace(s, 'app', `환율 상황 데모: ${a.mode}`) }
```

`case 'SALARY_CREDITED'` 의 `draftAmount: 0,` 아래에 `timing: undefined,` 추가.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS.

> `tsc` 가 `Phone.tsx` 의 화면 분기에서 B8 누락을 잡지는 않는다(조건부 렌더링). B8 화면은 Task 8 에서 붙인다.

- [ ] **Step 6: 커밋**

```bash
/opt/homebrew/bin/git add src/types.ts src/store.tsx src/store.test.ts
/opt/homebrew/bin/git commit -m "승인 뒤 타이밍 결정대로 실행·예약 + 예약일 도래·취소 + 환율 상황 데모 액션"
```

### Task 7: 송금 분석 파이프라인 — 새 4단계 · 채팅 트리거 · `/api/remit-plan`

**Files:**
- Modify: `src/types.ts`, `src/store.tsx`, `src/agent/plan.ts`, `src/app/AgentSteps.tsx`, `src/sim/Shell.tsx`, `src/sim/MobileShell.tsx`, `src/sim/DataStatus.tsx`
- Create: `src/agent/useRemitAgent.ts` (삭제: `src/agent/useSalaryAgent.ts`)
- Create: `api/remit-plan.ts` (삭제: `api/salary-plan.ts`)
- Modify: `src/i18n/{ko,en,id,vi,ne}.ts`
- Test: `src/agent/plan.test.ts`, `src/store.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/agent/plan.test.ts`:
- `good.steps` 를 `{ signals: 'ㄱ', situation: 'ㄹ', compare: 'ㄴ', decide: 'ㄷ' }` 로 바꾼다.
- `'단계 문장이 하나라도 비면 폐기한다'` 테스트의 steps 에 `situation: 'ㄹ'` 을 넣는다.
- `describe('validatePlan'` 끝에 추가:

```ts
  it('상황 판단 문장이 비면 폐기한다', () => {
    expect(validatePlan({ ...good, steps: { ...good.steps, situation: '' } }, sg)).toBeNull()
  })

  it('채팅에서 사용자가 말한 금액은 상한을 넘어도 되풀이할 수 있다', () => {
    const asked = sg.sendableMax + 100_000
    expect(validatePlan({ ...good, amount: asked }, sg, asked)?.amount).toBe(asked)
    expect(validatePlan({ ...good, amount: asked + 10_000 }, sg, asked)).toBeNull()
  })

  it("채팅 요청의 '나중에'는 요청 금액으로 채운다", () => {
    expect(validatePlan({ ...good, action: 'later', amount: null }, sg, 700_000)?.amount).toBe(700_000)
  })
```

- `describe('fallbackPlan'` 의 `'네 문장 모두 채워진다'` 를 `'다섯 문장 모두 채워진다'` 로 바꾸고 배열에 `fb.steps.situation` 을 넣는다. 그리고 추가:

```ts
  it('채팅 요청 금액이 있으면 그 금액으로 준비한다', () => {
    const fb = fallbackPlan(sg, t, krw, 700_000)
    expect(fb.amount).toBe(700_000)
    expect(fb.say).toContain(krw(700_000))
  })
```

`src/store.test.ts` 끝에 추가:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/agent/plan.test.ts src/store.test.ts`
Expected: FAIL.

- [ ] **Step 3: 타입** — `src/types.ts`

- `StepKey` 를 바꾼다.

```ts
/** 송금 분석 4단계 — ①② 코드, ③④ LLM 한 번의 응답(③ 뒤에 규칙 엔진 사전점검) */
export type StepKey = 'signals' | 'situation' | 'plan' | 'explain'
export type RemitTrigger = 'salary' | 'chat'
```

- `AgentPlan.steps` 를 `steps: Record<'signals' | 'situation' | 'compare' | 'decide', string>` 로 바꾼다.
- `Analysis` 의 `startedAt` 아래에 추가.

```ts
  /** 급여 웹훅에서 왔는지, 채팅 요청에서 왔는지 */
  trigger: RemitTrigger
  /** 채팅에서 사용자가 말한 금액 */
  requestedAmount?: number
```

- [ ] **Step 4: 리듀서** — `src/store.tsx`

- import 의 type 목록에 `RemitTrigger` 추가.
- `Action` 에 `| { type: 'REMIT_START'; requestedAmount?: number } // 채팅에서 온 송금 업무` 추가.
- `timingFor` 아래에 추가:

```ts
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
```

- `case 'SALARY_CREDITED'` 전체를 아래로 바꾼다(그림대로 오케스트레이터를 거치지 않고 송금 에이전트로 바로 간다).

```ts
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
```

- `case 'ANALYSIS_RESULT'` 안의 `phase: 'check',` → `phase: 'explain',`. 트레이스 문자열 앞에 `③ ` 을 붙인다: `` `③ 송금안 ${a.source === 'llm' ? …` ``.
- `case 'ANALYSIS_DONE'` 의 trace 를 trigger 별로 바꾼다.

```ts
        trace: trace(s, 'orchestrator', an.trigger === 'salary'
          ? `④ 제안 전달 — 잠금화면 푸시 (${s.lang ?? p.lang})`
          : '④ 제안 전달 — 채팅 카드'),
```

- [ ] **Step 5: `plan.ts`**

`validatePlan` 과 `fallbackPlan` 을 아래로 바꾸고, `formulaAmount` 아래에 `planCap` 을 추가한다.

```ts
/** 모델이 고를 수 있는 금액 상한 — 채팅에서 사용자가 직접 말한 금액은 되풀이할 수 있어야 한다.
    한도 판단은 규칙 엔진 몫이고, 빠듯함은 B2 게이지가 따로 알린다 */
export function planCap(sg: AgentSignals, requestedAmount?: number): number {
  return Math.max(MIN_SEND, sg.sendableMax, requestedAmount ?? 0)
}
```

```ts
export function validatePlan(raw: unknown, sg: AgentSignals, requestedAmount?: number): AgentPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const action = ACTIONS.find((a) => a === r.action)
  if (!action) return null

  const say = str(r.say)
  const why = str(r.why)
  if (!say || !why) return null

  const st = (r.steps ?? {}) as Record<string, unknown>
  const steps = {
    signals: str(st.signals),
    situation: str(st.situation),
    compare: str(st.compare),
    decide: str(st.decide),
  }
  if (Object.values(steps).some((v) => !v)) return null

  const cap = planCap(sg, requestedAmount)
  const n = typeof r.amount === 'number' && Number.isFinite(r.amount) ? Math.round(r.amount) : NaN
  const amount =
    n >= MIN_SEND && n <= cap ? n : action === 'later' ? requestedAmount ?? formulaAmount(sg) : NaN
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
   두 배가 되므로 항상 전액 송금으로 고정한다. 금액은 채팅 요청 금액 → 공식 순. */
export function fallbackPlan(sg: AgentSignals, t: Translate, krw: Money, requestedAmount?: number): AgentPlan {
  const asked = requestedAmount && requestedAmount >= MIN_SEND ? requestedAmount : undefined
  const amount = asked ?? formulaAmount(sg)
  return {
    action: 'remit_full',
    amount,
    say: asked ? t('agent.fbAskSay', { amount: krw(amount) }) : t('b1.say', { amount: krw(amount) }),
    why: t('b1.why', { rate: sg.fxRateText, pct: sg.fxAdvantagePct, floor: krw(sg.livingFloor) }),
    steps: {
      signals: t('agent.fbStep1', { salary: krw(sg.salary), debit: krw(sg.autoDebit) }),
      situation: t(sg.situation.money === 'tight' ? 'agent.fbSitTight' : 'agent.fbSitRoomy'),
      compare: t('agent.fbStep2'),
      decide: t('agent.fbStep3', { amount: krw(amount), floor: krw(sg.livingFloor) }),
    },
  }
}
```

- [ ] **Step 6: 훅 — `src/agent/useRemitAgent.ts`** (그리고 `git rm src/agent/useSalaryAgent.ts`)

```ts
import { useEffect } from 'react'
import { useStore } from '../store'
import { PERSONAS } from '../mock/personas'
import { fmtKRW, makeT } from '../i18n'
import { apiUrl } from '../lib/api'
import { fallbackPlan, validatePlan } from './plan'
import type { AgentPlan } from '../types'

/* 송금 에이전트 4단계를 진행시킨다. 급여 웹훅·채팅 요청 공용.
   ① 신호(코드) → ② 상황 판단(코드) → ③ 송금안(LLM + 규칙 엔진) → ④ 이유 설명(③과 같은 응답)
   ⑤ 사용자 승인 · ⑥ 타이밍 · ⑦ 실행은 화면과 리듀서가 맡는다.

   LLM 이 캐시처럼 빨리 와도 ③은 잠깐은 보여 준다 — 단계가 눈에 보이기 전에 끝나면
   사고과정이 아예 없는 것처럼 보인다. */
const SIGNAL_MS = 550
const SITUATION_MS = 500
const MIN_PLAN_MS = 1700
const EXPLAIN_MS = 480

export function useRemitAgent() {
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
    const later = (ms: number, fn: () => void) =>
      timers.push(setTimeout(() => { if (alive) fn() }, ms))

    later(SIGNAL_MS, () => dispatch({ type: 'ANALYSIS_PHASE', phase: 'situation' }))
    later(SIGNAL_MS + SITUATION_MS, () => dispatch({ type: 'ANALYSIS_PHASE', phase: 'plan' }))

    const settle = (plan: AgentPlan, source: 'llm' | 'template') => {
      later(Math.max(0, MIN_PLAN_MS - (Date.now() - t0)), () => {
        dispatch({ type: 'ANALYSIS_RESULT', plan, source, latencyMs: Date.now() - t0 })
        later(EXPLAIN_MS, () => dispatch({ type: 'ANALYSIS_DONE' }))
      })
    }

    /* 월 한도 잔여는 모델에 주지 않는다 — 사용자에게 한도를 말해서도 안 되고
       (카피 규칙), 한도 판단은 규칙 엔진 몫이다. 신호로 주면 "지금 30만원까지만
       보낼 수 있어요" 같은 문장이 새는 것을 실측했다. */
    const { limitRemaining: _lr, ...signalsForModel } = sg

    fetch(apiUrl('/api/remit-plan'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      /* 12초 — 평소 응답은 3초쯤인데, 배포 직후 첫 호출은 콜드 스타트가 얹혀
         9초를 넘겼다(실측). 서버는 재시도까지 해도 8초대에서 스스로 끊는다. */
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        lang,
        name: p.name,
        trigger: an.trigger,
        requestedAmount: an.requestedAmount,
        signals: signalsForModel,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        const plan = validatePlan(d, sg, an.requestedAmount)
        settle(plan ?? fallbackPlan(sg, t, krw, an.requestedAmount), plan ? 'llm' : 'template')
      })
      .catch(() => settle(fallbackPlan(sg, t, krw, an.requestedAmount), 'template'))

    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [runId]) // eslint-disable-line react-hooks/exhaustive-deps
}
```

`src/sim/Shell.tsx`·`src/sim/MobileShell.tsx`: `import { useSalaryAgent } from '../agent/useSalaryAgent'` → `import { useRemitAgent } from '../agent/useRemitAgent'`, 호출 `useSalaryAgent()` → `useRemitAgent()`.

`src/sim/DataStatus.tsx`: `label: '급여 분석'` → `label: '송금 분석'`.

- [ ] **Step 7: 단계 UI — `src/app/AgentSteps.tsx`**

- 상단 `ORDER`·`LABEL` 은 새 StepKey 로 바꾼다(키 이름 `agent.step1~4` 는 그대로 쓰고 문구만 Step 8 에서 바꾼다).

```ts
const ORDER: StepKey[] = ['signals', 'situation', 'plan', 'explain']
const LABEL: Record<StepKey, string> = {
  signals: 'agent.step1',
  situation: 'agent.step2',
  plan: 'agent.step3',
  explain: 'agent.step4',
}
```

- `ThinkingCard` 를 아래로 바꾼다(채팅에서도 쓰는 밝은 변형).

```tsx
/** 분석이 도는 동안 단계 라벨만 보여 준다 (본문은 아직 없다).
    lock = 어두운 잠금화면, light = 채팅 등 밝은 화면 */
export function ThinkingCard({ variant = 'lock' }: { variant?: 'lock' | 'light' }) {
  const { state, t } = useApp()
  const an = state.analysis
  if (!an) return null
  return (
    <div className={`think ${variant === 'light' ? 'light' : ''}`}>
      <div className="thinkHead">
        <Logo size={20} />
        <b className="wmk">ONNA</b>
        <span>{t(an.trigger === 'chat' ? 'agent.analyzingChat' : 'agent.analyzing')}</span>
      </div>
      {ORDER.map((k) => (
        <StepRow key={k} status={statusOf(an.phase, k)} label={t(LABEL[k])} />
      ))}
    </div>
  )
}

/** 단계 한 줄 — 송금·서류·신용 카드가 같이 쓴다 */
export function StepRow({ status, label, sub }: { status: 'done' | 'running' | 'pending'; label: string; sub?: string }) {
  return (
    <div className={`thinkRow ${status}`}>
      <span className="thinkDot">
        {status === 'done' ? <Icon name="check" size={11} strokeWidth={3} /> : status === 'running' ? <i className="spin" /> : null}
      </span>
      <span className="thinkText">
        {label}
        {sub && <small>{sub}</small>}
      </span>
    </div>
  )
}
```

- `AgentReasoning` 의 `body` 를 아래로 바꾼다. 규칙 엔진 문장은 ③ 송금안 아래에 붙인다.

```ts
  const body: Record<StepKey, string> = {
    signals: an.plan.steps.signals,
    situation: an.plan.steps.situation,
    plan: `${an.plan.steps.compare} ${t(an.checkKey ?? 'agent.checkOk', { floor: krw(an.signals.livingFloor) })}`,
    explain: an.plan.steps.decide,
  }
```

`src/styles.css` 끝에 추가:

```css
/* 단계 카드 — 밝은 화면(채팅·도움) 변형 */
.think.light { color: var(--app-ink); background: var(--app-card); border-color: var(--app-line); backdrop-filter: none; }
.think.light .thinkDot { border-color: var(--app-line); }
.think.light .spin { border-color: var(--app-line); border-top-color: var(--app-primary); }
.think.light .thinkRow.done .thinkDot { color: #fff; }
.thinkText { display: flex; flex-direction: column; min-width: 0; }
.thinkText small { font-size: 11.5px; opacity: .7; margin-top: 1px; overflow-wrap: anywhere; }
```

- [ ] **Step 8: 문구 5개 언어** — `agent.step1~4` 의 값을 **바꾸고**, 새 키 4개를 끝에 추가

| 키 | ko | en | id | vi | ne |
|---|---|---|---|---|---|
| `agent.step1` (값 교체) | 입출금 내역·환율 흔들림 확인 | Check money in/out and rate swings | Cek uang masuk/keluar dan naik-turun kurs | Xem tiền vào/ra và biến động tỷ giá | पैसा आउने-जाने र दरको उतारचढाव हेर्ने |
| `agent.step2` (값 교체) | 지금 상황 판단 | Judge the situation now | Menilai keadaan sekarang | Đánh giá tình hình hiện tại | अहिलेको अवस्था बुझ्ने |
| `agent.step3` (값 교체) | 송금안 만들기 | Make a sending plan | Membuat rencana kirim | Lập phương án gửi tiền | पठाउने योजना बनाउने |
| `agent.step4` (값 교체) | 이유 설명 | Explain why | Menjelaskan alasannya | Giải thích lý do | कारण बताउने |
| `agent.analyzingChat` | 송금안을 만들고 있어요 | Making a sending plan | Sedang membuat rencana kirim | Đang lập phương án gửi tiền | पठाउने योजना बनाउँदै |
| `agent.fbAskSay` | 요청하신 {amount}을 보낼 준비를 했어요. 보내 드릴까요? | I've got {amount} ready to send, as you asked. Shall I send it? | {amount} yang Anda minta sudah siap dikirim. Mau saya kirim? | Đã chuẩn bị gửi {amount} như quý khách yêu cầu. Tôi gửi nhé ạ? | तपाईंले भन्नुभएको {amount} पठाउन तयार छ। पठाऊँ? |
| `agent.fbSitRoomy` | 생활비와 자동이체를 남겨도 여유가 있어요. | Even after living money and automatic payments, there is room. | Setelah biaya hidup dan pembayaran otomatis, masih ada ruang. | Sau khi giữ tiền sinh hoạt và khoản tự động trừ, vẫn còn dư ạ. | बस्ने खर्च र स्वचालित भुक्तानी राखेपछि पनि ठाउँ छ। |
| `agent.fbSitTight` | 이번 달은 생활비가 조금 빠듯해요. | Living money is a little tight this month. | Bulan ini biaya hidup agak pas-pasan. | Tháng này tiền sinh hoạt hơi eo hẹp ạ. | यो महिना बस्ने खर्च अलि कसिलो छ। |

각 파일에 넣을 때의 형식 예(ko):

```ts
  'agent.analyzingChat': '송금안을 만들고 있어요',
  'agent.fbAskSay': '요청하신 {amount}을 보낼 준비를 했어요. 보내 드릴까요?',
  'agent.fbSitRoomy': '생활비와 자동이체를 남겨도 여유가 있어요.',
  'agent.fbSitTight': '이번 달은 생활비가 조금 빠듯해요.',
```

- [ ] **Step 9: 엔드포인트 — `api/remit-plan.ts`** (그리고 `git rm api/salary-plan.ts`)

`api/salary-plan.ts` 를 `api/remit-plan.ts` 로 옮긴 뒤 아래를 바꾼다. **나머지(가드레일·정규화·재시도)는 한 줄도 바꾸지 않는다.**

(1) 머리 주석:

```ts
/* 송금 에이전트 ③④ — 송금안(행동·금액)과 이유 문장.
   급여 입금 웹훅(trigger: salary)과 채팅 요청(trigger: chat)이 같이 쓴다.
   LLM 이 행동·금액까지 정한다(사용자 승인 사항). 코드가 하는 일은
   (1) 신호·상황 판정을 만들어 넘기고 (2) 응답이 화면을 깨뜨리지 않는지 검사하고
   (3) 한도 문장은 따로 쓴다 — HARD RULE 3 때문에 LLM 은 한도를 말할 수 없다.
   ⑥ 타이밍(지금·나눠서·예약)은 승인 뒤 코드가 정한다 (src/agent/timing.ts). */
```

(2) `const SYSTEM = \`…\`` 의 첫 두 줄(`You are ONNA…` / `A salary deposit just landed…`)을 지우고, 상수 이름을 `SYSTEM_BODY` 로 바꾼다. 그 위에 서두 두 개와 조립 함수를 둔다.

```ts
const INTRO = {
  salary: `You are ONNA, a banking assistant inside iM Bank for migrant workers in Daegu, Korea.
A salary deposit just landed in this person's account. You decide what to recommend today.`,
  chat: `You are ONNA, a banking assistant inside iM Bank for migrant workers in Daegu, Korea.
The person just asked you in the chat to send money home. You decide what to recommend now.
If REQUESTED is given, that is the amount they named. Prefer echoing it with remit_full when it fits.
If it would squeeze their living money (situation.money = tight) or today's rate is lower, you may choose
remit_adjust with a smaller amount or later — say kindly why, never scold. REQUESTED may be above
sendableMax; you may still echo it, the rules engine and the confirm screen handle the rest.`,
} as const

const systemFor = (trigger: 'salary' | 'chat') => `${INTRO[trigger]}\n${SYSTEM_BODY}`
```

(3) `SYSTEM_BODY` 안에서 바꿀 곳:

- `YOUR DECISION` 의 `Then pick "amount": … at most SIGNALS.sendableMax.` 를 `Then pick "amount": a whole number of Korean won, at least 10000 and at most SIGNALS.sendableMax (or REQUESTED, if given and larger).` 로 바꾼다.
- HARD RULE 4b 를 아래로 바꾼다.

```
4b. TIMING: if you choose "later", or choose remit_adjust because money is still going out this
   month, say WHEN in plain words and name the day — use laterDate (the day ONNA will send it) or
   nextSalaryDate (next payday). Those are the only dates you may write. Never invent another date.
```

- `SIGNALS FIELDS` 끝(`- remitAvg3m: …` 줄 아래)에 추가.

```
- situation: the verdict on this month, ALREADY DECIDED. Do not re-judge it.
    money: roomy (sending the usual amount is comfortable) | tight (living money is squeezed)
    rate / risk: same as fxStrength / fxRisk. sentAlready: they already sent some this month.
- laterDate: the day ONNA would send it if waiting (after rent, or a week from today).
```

- `WHAT YOU WRITE` 의 steps 설명을 아래로 바꾼다.

```
- "steps": how you actually thought, in the worker's own view.
    signals   → what came in, what has been spent this month, what is still going out, and whether
                the rate has been moving
    situation → explain the situation verdict in plain words (one sentence, no new judgement)
    compare   → which ways of sending you weighed against each other, and what tipped it
    decide    → what you chose and why it fits this person this month
```

- `OUTPUT strict JSON only:` 의 steps 를 `"steps":{"signals":"…","situation":"…","compare":"…","decide":"…"},` 로 바꾼다.

(4) `once()` 의 시그니처와 본문:

```ts
async function once(
  lang: string,
  sg: Record<string, unknown>,
  cap: number,
  name: string | undefined,
  timeoutMs: number,
  trigger: 'salary' | 'chat',
  requested: number | null,
): Promise<Attempt> {
```

- messages 의 system 을 `{ role: 'system', content: systemFor(trigger) }` 로, user content 를 아래로 바꾼다.

```ts
          content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}\n${requested ? `REQUESTED: ${requested}\n` : ''}SIGNALS: ${JSON.stringify(sg)}`,
```

- `allowedFigures` 배열에 `requested,` 를 추가한다(`amount,` 다음).
- `texts` 에 `situation: pick(steps.situation),` 를 추가한다(`signals` 다음).
- `core` 를 `[texts.say, texts.why, texts.signals, texts.situation, texts.compare, texts.decide]` 로 바꾼다.
- `ctxDigits` 를 `(JSON.stringify(sg) + (amount ?? '') + (requested ?? '')).replace(/\D/g, '')` 로 바꾼다.
- 반환 `steps` 에 `situation: texts.situation,` 을 추가한다.

(5) `handler`:

```ts
  let body: {
    lang?: string
    name?: string
    trigger?: string
    requestedAmount?: number
    signals?: Record<string, unknown>
  }
```

`const cap = …` 을 아래로 바꾼다.

```ts
  const trigger = body.trigger === 'chat' ? 'chat' : 'salary'
  const requested =
    trigger === 'chat' && typeof body.requestedAmount === 'number' && body.requestedAmount >= MIN_SEND
      ? Math.min(Math.round(body.requestedAmount), 99_000_000)
      : null
  const cap = Math.max(MIN_SEND, sg.sendableMax, requested ?? 0)
```

반복문의 호출을 `once(lang, sg, cap, body.name, 6000, trigger, requested)` 로 바꾼다.

- [ ] **Step 10: 확인**

Run: `npx vitest run && npx tsc --noEmit && npm run check:api`
Expected: 전부 PASS. `grep -rn "salary-plan\|useSalaryAgent" src api` 결과 없음.

- [ ] **Step 11: 커밋**

```bash
/opt/homebrew/bin/git rm -q src/agent/useSalaryAgent.ts api/salary-plan.ts
/opt/homebrew/bin/git add src/types.ts src/store.tsx src/store.test.ts src/agent/plan.ts src/agent/plan.test.ts src/agent/useRemitAgent.ts src/app/AgentSteps.tsx src/sim/Shell.tsx src/sim/MobileShell.tsx src/sim/DataStatus.tsx src/styles.css api/remit-plan.ts src/i18n/ko.ts src/i18n/en.ts src/i18n/id.ts src/i18n/vi.ts src/i18n/ne.ts
/opt/homebrew/bin/git commit -m "송금 에이전트 새 4단계(상황 판단 추가) + 채팅 트리거 + /api/remit-plan"
```

### Task 8: 송금 화면 — 제안 카드 분리 · 타이밍 · 예약 · B8 · 콘솔

**Files:**
- Create: `src/app/RemitCard.tsx`
- Modify: `src/app/screens/Remit.tsx`, `src/app/Phone.tsx`, `src/sim/DemoConsole.tsx`, `src/styles.css`
- Modify: `src/i18n/{ko,en,id,vi,ne}.ts`

- [ ] **Step 1: 제안 카드 분리 — `src/app/RemitCard.tsx`**

```tsx
import { useApp } from './hooks'
import { Logo } from './Logo'
import { AgentReasoning } from './AgentSteps'
import { FX, fxAdvantagePct } from '../mock/fx'

/* 송금 ⑤ 사용자 승인 — 홈(B1)과 채팅이 같은 카드를 쓴다.
   onDone: 채팅에서 버튼을 누르면 시트를 닫는다 */
export function RemitProposalCard({ onDone }: { onDone?: () => void }) {
  const { state, dispatch, p, t, krw, local } = useApp()
  const fx = FX[p.currency]
  const plan = state.analysis?.plan
  const prop = state.proposal
  if (!prop || prop.status !== 'new') return null

  const act = (fn: () => void) => () => { fn(); onDone?.() }

  return (
    <div className="agentcard">
      <div className="who"><Logo size={24} /><b className="wmk">ONNA</b></div>
      <p className="say">{plan?.say ?? t('b1.say', { amount: krw(prop.amount) })}</p>
      <p className="why">{plan?.why ?? t('b1.why', { rate: fx.rateText, pct: fxAdvantagePct(p.currency), floor: krw(state.livingFloor) })}</p>
      <div className="money" style={{ fontSize: 27 }}>
        {krw(prop.amount)}
        <small>≈ {local(Math.round(prop.amount * fx.rate))}</small>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn agent sm" onClick={act(() => { dispatch({ type: 'SET_DRAFT', amount: prop.amount }); dispatch({ type: 'PROPOSAL_ACTION', action: 'send' }) })}>{t('b1.send')}</button>
        <button className="btn ghost sm" onClick={act(() => { dispatch({ type: 'SET_DRAFT', amount: prop.amount }); dispatch({ type: 'PROPOSAL_ACTION', action: 'change' }) })}>{t('b1.change')}</button>
        <button className="btn ghost sm" onClick={act(() => dispatch({ type: 'PROPOSAL_ACTION', action: 'later' }))}>{t('b1.later')}</button>
      </div>
      <AgentReasoning />
    </div>
  )
}
```

> 기존 B1 은 "금액 변경" 때 `SET_DRAFT` 를 하지 않았다(`SALARY_CREDITED`→`ANALYSIS_DONE` 이 draftAmount 를 채워 둬서). 채팅 경로에서도 안전하도록 여기서 채운다.

- [ ] **Step 2: `Remit.tsx` 수정**

import 추가·교체:

```ts
import { RemitProposalCard } from '../RemitCard'
import { SLA_DEMO_SEC, timingFor } from '../../store'
import { laterParts } from '../../agent/timing'
```

(`AgentReasoning` import 는 더 안 쓰면 `ThinkingCard` 만 남긴다.)

B1:
- `const plan = state.analysis?.plan` 줄을 지운다.
- `{state.proposal?.status === 'new' && ( <div className="agentcard"> … </div> )}` 블록 전체를 `<RemitProposalCard />` 한 줄로 바꾼다.
- `{state.proposal?.status === 'snoozed' && …}` 아래에 예약 카드를 넣는다.

```tsx
        <ScheduledCard />
```

같은 파일 하단(NavBar 위)에 추가:

```tsx
/** 예약한 송금 — 대기 중인 건만. 그날까지 돈은 계좌에 그대로 있다 */
function ScheduledCard() {
  const { state, dispatch, t, krw, day } = useApp()
  const waiting = state.scheduled.filter((x) => x.status === 'waiting')
  if (!waiting.length) return null
  return (
    <div className="card">
      <h4><Icon name="bell" size={15} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 6 }} />{t('sch.title')}</h4>
      {waiting.map((x) => (
        <div className="kv" key={x.id}>
          <span className="k">{day(x.date)}</span>
          <span className="v">
            {krw(x.amount)}
            <button className="linkBtn" onClick={() => dispatch({ type: 'SCHEDULED_CANCEL', id: x.id })}>{t('sch.cancel')}</button>
          </span>
        </div>
      ))}
      <p style={{ marginTop: 6 }}>{t('sch.note')}</p>
    </div>
  )
}
```

B2: CTA 의 `onClick={() => dispatch({ type: 'NAV', screen: 'B3' })}` → `onClick={() => dispatch({ type: 'CONFIRM_AMOUNT' })}`.

B3:
- `const amount = state.draftAmount` 아래에 추가.

```ts
  const tm = timingFor(state)
  const waitOnly = tm.rule === 'wait'
  const laterDay = laterParts(tm)[0]?.when
```

- `규정 점검` kv 줄 **아래**, `note mint` 위에 타이밍 블록을 넣는다.

```tsx
          <div className="timing">
            <b>{t('tm.title')}</b>
            {tm.parts.map((x) => (
              <div className="kv" key={x.when}>
                <span className="k">{x.when === 'now' ? t('tm.now') : day(x.when)}</span>
                <span className="v">{krw(x.amount)}<small>≈ {local(Math.round(x.amount * fx.rate))}</small></span>
              </div>
            ))}
            <p>{t(`tm.why.${tm.cause}`, { date: laterDay ? day(laterDay) : '' })}</p>
            {tm.rule !== 'now' && (
              <button className="linkBtn" onClick={() => dispatch({ type: 'TIMING_OVERRIDE' })}>{t('tm.allNow')}</button>
            )}
            {tm.overridden && (
              <button className="linkBtn" onClick={() => dispatch({ type: 'TIMING_RESET' })}>{t('tm.useAgent')}</button>
            )}
          </div>
```

- `useApp()` 구조 분해에 `day` 를 추가한다.
- 지문 버튼 라벨을 `{waitOnly ? t('tm.btnSchedule') : t('b3.btn')}` 로 바꾼다.
- 예약만 하는 경우 취소창 안내는 의미가 없으므로 `note mint` 를 `{!waitOnly && ( … )}` 로 감싼다.

B5: `useApp()` 에 `day` 추가. `card center` 블록 아래에 넣는다.

```tsx
        {state.timing?.rule === 'split' && laterParts(state.timing)[0] && (
          <div className="note amber">
            <Icon name="bell" size={16} />
            <span>{t('b5.rest', { amount: krw(laterParts(state.timing)[0].amount), date: day(laterParts(state.timing)[0].when) })}</span>
          </div>
        )}
```

B8 — B7 아래에 추가:

```tsx
/* B8 예약했어요 — ⑥ 타이밍 결정이 "기다렸다 보내기"였을 때. 돈은 아직 나가지 않았다 */
export function B8() {
  const { state, dispatch, t, krw, local, p, day } = useApp()
  const fx = FX[p.currency]
  const parts = state.timing ? laterParts(state.timing) : []
  return (
    <>
      <div className="appBody">
        <div className="shield ok"><Icon name="bell" size={36} /></div>
        <div className="h1 center">{t('b8.title')}</div>
        <p className="lead center">{state.timing ? t(`tm.why.${state.timing.cause}`, { date: parts[0] ? day(parts[0].when) : '' }) : ''}</p>
        <div className="list">
          {parts.map((x) => (
            <div className="item" key={x.when}>
              <div className="ico"><Icon name="send" size={18} /></div>
              <span style={{ fontWeight: 600 }}>{day(x.when)}<span className="sub">{p.beneficiary.name}</span></span>
              <span className="r" style={{ textAlign: 'right' }}>
                <b style={{ color: 'var(--app-ink)' }}>{krw(x.amount)}</b>
                <small style={{ display: 'block' }}>≈ {local(Math.round(x.amount * fx.rate))}</small>
              </span>
            </div>
          ))}
        </div>
        <div className="note amber"><Icon name="shield" size={16} /><span style={{ fontWeight: 600 }}>{t('b4.money')}</span></div>
        <p style={{ color: 'var(--app-muted)', fontSize: 13 }}>{t('b8.lead')}</p>
      </div>
      <div className="appFoot">
        <button className="btn" onClick={() => dispatch({ type: 'NAV', screen: 'B1' })}>{t('b8.home')}</button>
      </div>
    </>
  )
}
```

- [ ] **Step 3: `Phone.tsx` 연결**

- `import { B0, B1, B2, B3, B4, B5, B7 } from './screens/Remit'` 에 `B8` 추가.
- `TOP_NAV` 에 `B8: { home: true, title: 'b1.navSend' },` 추가.
- 화면 분기에 `{s === 'B8' && <B8 />}` 추가(`B7` 다음).

- [ ] **Step 4: 콘솔 — `src/sim/DemoConsole.tsx`**

- import 의 type 에 `FxDemo` 추가.
- `SCENARIOS` 아래에 추가.

```ts
/* 송금 ⑥ 타이밍 분기 시연 — 홈 환율·견적·에이전트 신호가 함께 바뀐다 */
const FX_DEMOS: Array<{ id: FxDemo; label: string; warn?: boolean }> = [
  { id: 'real', label: '실제 환율' },
  { id: 'volatile', label: '흔들림 → 나눠 보내기', warn: true },
  { id: 'low', label: '낮음 → 예약', warn: true },
]
```

- 컴포넌트 안 `const hasAccount = …` 아래에 `const waiting = state.scheduled.filter((x) => x.status === 'waiting').length` 추가.
- "송금 도착 지금 발생" 버튼 **아래**에 추가.

```tsx
      <button className="devBtn subtle" disabled={!waiting || state.tx?.status === 'processing'}
        onClick={pick(() => { dispatch({ type: 'SCHEDULED_DUE' }); setView('worker') })}>
        예약일 도래 (예약 송금 실행){waiting ? ` · ${waiting}건` : ''}
      </button>
```

- "규정 점검 시나리오" 섹션 **아래**에 추가.

```tsx
      <h3>환율 상황 (송금 타이밍)</h3>
      <div className="pillRow">
        {FX_DEMOS.map((m) => (
          <button key={m.id} className={`pill ${m.warn ? 'warn' : ''} ${state.fxDemo === m.id ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'SET_FX_DEMO', mode: m.id })}>{m.label}</button>
        ))}
      </div>
```

- [ ] **Step 5: 스타일** — `src/styles.css` 끝

```css
/* B3 타이밍 — 언제·얼마 */
.timing { margin: 10px 0 2px; padding: 11px 13px; border-radius: 14px; background: var(--app-agent-tint); border: 1px solid var(--app-agent-line); }
.timing > b { display: block; font-size: 12.5px; color: var(--app-agent-ink); margin-bottom: 2px; }
.timing .kv { padding: 7px 0; border-color: var(--app-agent-line); }
.timing p { margin: 6px 0 0; font-size: 12.5px; line-height: 1.45; color: var(--app-agent-ink); }
.linkBtn {
  background: none; border: 0; padding: 0; margin: 6px 0 0 8px; font: inherit; font-size: 12.5px;
  font-weight: 700; color: var(--app-primary-press); text-decoration: underline; cursor: pointer;
}
.timing .linkBtn { margin-left: 0; margin-right: 12px; }
.screen.dark .linkBtn { color: var(--app-primary); }
```

- [ ] **Step 6: 문구 5개 언어** — 끝에 추가

ko:
```ts
  'tm.title': '언제·얼마 보낼지',
  'tm.now': '지금',
  'tm.why.normal': '지금 보내도 괜찮은 날이에요.',
  'tm.why.rate-moving': '요즘 환율이 많이 움직여서, 절반은 지금 보내고 나머지는 {date}에 보낼게요.',
  'tm.why.rate-low': '오늘은 환율이 평소보다 낮아서 {date}에 보낼게요.',
  'tm.why.agent-later': '조금 기다렸다 보내는 게 나아서 {date}에 보낼게요.',
  'tm.why.user': '말씀하신 대로 지금 한 번에 보낼게요.',
  'tm.allNow': '지금 한 번에 보내기',
  'tm.useAgent': '온나가 정한 대로 보내기',
  'tm.btnSchedule': '지문으로 예약하기',
  'b8.title': '보낼 날을 예약했어요',
  'b8.lead': '그날이 되면 환율과 잔액을 다시 보고 보낼게요. 그 전에는 홈에서 언제든 취소할 수 있어요.',
  'b8.home': '홈으로',
  'sch.title': '예약한 송금',
  'sch.cancel': '취소',
  'sch.note': '그날까지 돈은 계좌에 그대로 있어요.',
  'b5.rest': '나머지 {amount}은 {date}에 보낼게요.',
```
en:
```ts
  'tm.title': 'When and how much',
  'tm.now': 'Now',
  'tm.why.normal': 'Today is a fine day to send.',
  'tm.why.rate-moving': 'The rate has been moving a lot, so I will send half now and the rest on {date}.',
  'tm.why.rate-low': 'The rate is lower than usual today, so I will send it on {date}.',
  'tm.why.agent-later': 'It is better to wait a little, so I will send it on {date}.',
  'tm.why.user': 'As you asked, I will send it all now.',
  'tm.allNow': 'Send it all now',
  'tm.useAgent': "Use ONNA's plan",
  'tm.btnSchedule': 'Schedule with fingerprint',
  'b8.title': 'Your transfer is scheduled',
  'b8.lead': 'On that day I will check the rate and your balance again, then send. You can cancel from Home any time before.',
  'b8.home': 'Go to Home',
  'sch.title': 'Scheduled transfers',
  'sch.cancel': 'Cancel',
  'sch.note': 'Until that day, the money stays in your account.',
  'b5.rest': 'I will send the other {amount} on {date}.',
```
id:
```ts
  'tm.title': 'Kapan dan berapa',
  'tm.now': 'Sekarang',
  'tm.why.normal': 'Hari ini aman untuk mengirim.',
  'tm.why.rate-moving': 'Kurs sedang banyak bergerak, jadi separuh saya kirim sekarang dan sisanya pada {date}.',
  'tm.why.rate-low': 'Kurs hari ini lebih rendah dari biasanya, jadi saya kirim pada {date}.',
  'tm.why.agent-later': 'Lebih baik menunggu sebentar, jadi saya kirim pada {date}.',
  'tm.why.user': 'Sesuai permintaan Anda, saya kirim semuanya sekarang.',
  'tm.allNow': 'Kirim semua sekarang',
  'tm.useAgent': 'Ikuti rencana ONNA',
  'tm.btnSchedule': 'Jadwalkan dengan sidik jari',
  'b8.title': 'Kiriman sudah dijadwalkan',
  'b8.lead': 'Pada hari itu saya cek lagi kurs dan saldo Anda, lalu mengirim. Sebelum itu Anda bisa membatalkan dari Beranda.',
  'b8.home': 'Ke Beranda',
  'sch.title': 'Kiriman terjadwal',
  'sch.cancel': 'Batal',
  'sch.note': 'Sampai hari itu, uang tetap ada di rekening Anda.',
  'b5.rest': 'Sisanya {amount} saya kirim pada {date}.',
```
vi:
```ts
  'tm.title': 'Gửi khi nào và bao nhiêu',
  'tm.now': 'Bây giờ',
  'tm.why.normal': 'Hôm nay gửi là ổn ạ.',
  'tm.why.rate-moving': 'Dạo này tỷ giá biến động nhiều, nên tôi gửi một nửa bây giờ và phần còn lại vào {date} ạ.',
  'tm.why.rate-low': 'Hôm nay tỷ giá thấp hơn thường lệ, nên tôi sẽ gửi vào {date} ạ.',
  'tm.why.agent-later': 'Chờ thêm một chút sẽ tốt hơn, nên tôi sẽ gửi vào {date} ạ.',
  'tm.why.user': 'Theo ý quý khách, tôi sẽ gửi hết bây giờ ạ.',
  'tm.allNow': 'Gửi hết bây giờ',
  'tm.useAgent': 'Làm theo phương án của ONNA',
  'tm.btnSchedule': 'Đặt lịch bằng vân tay',
  'b8.title': 'Đã đặt lịch gửi tiền',
  'b8.lead': 'Đến ngày đó tôi sẽ xem lại tỷ giá và số dư rồi mới gửi. Trước ngày đó quý khách có thể hủy ở Trang chủ.',
  'b8.home': 'Về Trang chủ',
  'sch.title': 'Lệnh gửi đã hẹn',
  'sch.cancel': 'Hủy',
  'sch.note': 'Đến ngày đó, tiền vẫn nằm nguyên trong tài khoản ạ.',
  'b5.rest': 'Phần còn lại {amount} tôi sẽ gửi vào {date} ạ.',
```
ne:
```ts
  'tm.title': 'कहिले र कति पठाउने',
  'tm.now': 'अहिले',
  'tm.why.normal': 'आज पठाउन ठीक दिन हो।',
  'tm.why.rate-moving': 'आजकल दर धेरै चलिरहेकाले आधा अहिले र बाँकी {date} मा पठाउँछु।',
  'tm.why.rate-low': 'आज दर सामान्यभन्दा कम भएकाले {date} मा पठाउँछु।',
  'tm.why.agent-later': 'अलि पर्खेर पठाउनु राम्रो भएकाले {date} मा पठाउँछु।',
  'tm.why.user': 'तपाईंले भन्नुभएजस्तै सबै अहिले पठाउँछु।',
  'tm.allNow': 'सबै अहिले पठाउने',
  'tm.useAgent': 'ONNA को योजना अनुसार',
  'tm.btnSchedule': 'औँठाछापले तालिका बनाउने',
  'b8.title': 'पठाउने दिन तय भयो',
  'b8.lead': 'त्यो दिन दर र ब्यालेन्स फेरि हेरेर पठाउँछु। त्यसअघि होमबाट जुनसुकै बेला रद्द गर्न सकिन्छ।',
  'b8.home': 'होममा जाने',
  'sch.title': 'तालिका बनाइएको पठाइ',
  'sch.cancel': 'रद्द',
  'sch.note': 'त्यो दिनसम्म पैसा खातामै रहन्छ।',
  'b5.rest': 'बाँकी {amount} {date} मा पठाउँछु।',
```

- [ ] **Step 7: 확인**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 전부 통과.

수동 확인(`npm run dev`, http://localhost:5199):
1. 콘솔 "시작: 홈" → 세션 초기화 → "흔들림 → 나눠 보내기" → 급여 입금 발생.
2. 잠금화면 4단계 → 보내기 → 홈 카드 [보내기] → B3 에 "지금 / 날짜" 두 줄과 이유가 보인다.
3. 지문 → B4 → B5 에 "나머지 … 보낼게요" 안내가 뜬다.
4. 홈에 "예약한 송금" 카드가 있고 → 콘솔 "예약일 도래" → B5.
5. "낮음 → 예약" → 송금 탭 → 금액 → B3 버튼이 "지문으로 예약하기" → B8.

- [ ] **Step 8: 커밋**

```bash
/opt/homebrew/bin/git add src/app/RemitCard.tsx src/app/screens/Remit.tsx src/app/Phone.tsx src/sim/DemoConsole.tsx src/styles.css src/i18n/ko.ts src/i18n/en.ts src/i18n/id.ts src/i18n/vi.ts src/i18n/ne.ts
/opt/homebrew/bin/git commit -m "송금 화면: 타이밍(언제·얼마)·예약 카드·B8·콘솔 환율 상황·예약일 도래"
```

# Phase C — 오케스트레이터

### Task 9: 태스크 검증·폴백 분류·채팅 컨텍스트 (`orchestrator.ts`)

**Files:**
- Modify: `src/types.ts`
- Create: `src/agent/orchestrator.ts`
- Test: `src/agent/orchestrator.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/agent/orchestrator.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { buildChatCtx, fallbackReply, fallbackTasks, parseAmount, validateTasks } from './orchestrator'
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/agent/orchestrator.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 타입** — `src/types.ts` 끝에 추가

```ts
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
```

- [ ] **Step 4: 구현** — `src/agent/orchestrator.ts`

```ts
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
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/agent/orchestrator.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
/opt/homebrew/bin/git add src/types.ts src/agent/orchestrator.ts src/agent/orchestrator.test.ts
/opt/homebrew/bin/git commit -m "오케스트레이터 태스크 검증·폴백 분류·채팅 컨텍스트"
```

### Task 10: 의도 분석 엔드포인트 `/api/orchestrate`

**Files:**
- Create: `api/orchestrate.ts`
- (`api/agent.ts` 는 채팅 UI 를 옮기는 Task 18 에서 지운다)

- [ ] **Step 1: 구현** — `api/agent.ts` 를 `api/orchestrate.ts` 로 **복사**한 뒤 아래를 바꾼다

(1) 머리 주석:

```ts
/* ONNA 오케스트레이터 ① 의도 분석 → ② Task 분업.
   LLM 은 "어느 전문 도우미에게 맡길지 + 모국어 한 줄"만 쓴다. 금액·환율 등 수치는
   클라이언트 컨텍스트 값만 쓰고, 실제 일은 전문 에이전트(송금·서류·신용)가 한다.
   클라이언트(src/agent/orchestrator.ts)가 태스크를 한 번 더 검증한다 (AG-3 / AG-4) */
```

(2) `ACTIONS`/`ActionKind` 를 교체한다.

```ts
const AGENTS = ['remit', 'doc', 'credit', 'general'] as const
type AgentKind = (typeof AGENTS)[number]
const MAX_TASKS = 2
```

(3) `SYSTEM` 의 `WHAT YOU DO` 섹션부터 끝까지를 아래로 바꾼다(앞부분 WHO/HARD RULES/TONE/PER-LANGUAGE/CONTEXT FIELDS 는 그대로).

```
WHAT YOU DO — you are the orchestrator
Read the message, work out what the person wants, and hand each piece of work to the right helper.
- remit   : wants to send money home (with or without an amount)
- doc     : asks about a paper, bill, letter, payslip, contract or bank document, or wants to show a photo of one
- credit  : asks about their work/transfer record, credit progress, or borrowing (obey HARD RULE 7)
- general : greeting, today's or past rate, balance, spending, wants a human, suspicious call, anything else
If the message has two different requests, return two tasks in the order they were asked. Never more than two.
"amount" is only for remit, and only if the person said an amount (or said "that amount" and proposalAmount is set).

"text":
- If the only task is general: the full answer, following every rule above (3 sentences max).
- Otherwise: ONE short, warm sentence saying you are handing it to the right helper and what happens next
  (for doc: kindly ask them to attach a photo of the paper). Do NOT answer the task yourself and do not
  state any amount, limit or rate in this sentence.
"escalate": true only if they want to talk to a person or report a suspicious call.

BEFORE YOU ANSWER, check: honorific register? {name} token used instead of the real name?
amounts labelled as won? loan gate respected? 3 sentences or fewer? Fix it before replying.

OUTPUT strict JSON only:
{"tasks":[{"agent":"remit|doc|credit|general","amount":<number or null>}],"text":"<reply in requested language>","escalate":false}
```

(4) `handler` 의 `try` 블록 안, `const raw = …` 부터 `return json({ text, action, amount })` 까지를 아래로 바꾼다.

```ts
    const raw = d?.choices?.[0]?.message?.content ?? ''
    const out = parseJson<{ tasks?: unknown; text?: string; escalate?: boolean }>(raw)
    const text = fillName((out?.text ?? '').trim(), ctx.name, lang)

    // 태스크 모양만 여기서 거른다. 금액이 사용자 문장과 맞는지는 클라이언트가 본다
    const tasks: Array<{ agent: AgentKind; amount: number | null }> = []
    for (const x of Array.isArray(out?.tasks) ? out!.tasks : []) {
      const o = (x ?? {}) as Record<string, unknown>
      const agent = (AGENTS as readonly string[]).includes(String(o.agent)) ? (o.agent as AgentKind) : null
      if (!agent || tasks.some((t) => t.agent === agent)) continue
      const amount =
        agent === 'remit' && typeof o.amount === 'number' && o.amount > 0
          ? Math.min(Math.round(o.amount), 99_000_000)
          : null
      tasks.push({ agent, amount })
    }
    if (!tasks.length) tasks.push({ agent: 'general', amount: null })

    // 가드레일: 금지어 / 근거 없는 수치 → 클라이언트 폴백
    if (!text) return json({ fallback: 'empty' })
    if (!copyLint(text)) return json({ fallback: 'copy' })
    if (!numbersAreGrounded(text, ctx)) return json({ fallback: 'ungrounded' })

    return json({ tasks: tasks.slice(0, MAX_TASKS), text, escalate: out?.escalate === true })
```

(5) `max_tokens: 320` 는 그대로 둔다.

- [ ] **Step 2: 확인**

Run: `npx tsc --noEmit --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom api/orchestrate.ts`
Expected: 에러 없음. (엔드포인트 실측은 Task 20 에서 `vercel dev` 로 한다)

- [ ] **Step 3: 커밋**

```bash
/opt/homebrew/bin/git add api/orchestrate.ts
/opt/homebrew/bin/git commit -m "/api/orchestrate — 의도 분석과 Task 분업"
```

### Task 11: 채팅·오케스트레이션 상태 + `useOrchestrator`

**Files:**
- Modify: `src/types.ts`, `src/store.tsx`
- Create: `src/agent/useOrchestrator.ts`
- Modify: `src/sim/Shell.tsx`, `src/sim/MobileShell.tsx`
- Test: `src/store.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/store.test.ts` 끝에 추가

```ts
describe('오케스트레이터', () => {
  it('질문 → 사용자 말풍선 + 의도 분석 시작, 도는 중엔 새 질문을 받지 않는다', () => {
    const s = run(initialState('minh', 'home'), { type: 'CHAT_ASK', text: '50만 보내줘' })
    expect(s.chat).toMatchObject([{ who: 'user', text: '50만 보내줘' }])
    expect(s.orch).toMatchObject({ status: 'running', message: '50만 보내줘' })
    expect(run(s, { type: 'CHAT_ASK', text: '또' }).chat).toHaveLength(1)
  })

  it('분업 결과 → 라우팅 안내 + 안내 문장 + 송금 카드(채팅 분석 시작) + 사진 요청', () => {
    const s1 = run(initialState('minh', 'home'), { type: 'CHAT_ASK', text: '고지서 뭐예요? 50만 보내줘' })
    const s2 = run(s1, {
      type: 'ORCH_DONE', id: s1.orch!.id, source: 'llm', text: '맡길게요',
      tasks: [{ agent: 'doc' }, { agent: 'remit', amount: 500_000 }],
    })
    expect(s2.orch?.status).toBe('done')
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/store.test.ts`
Expected: FAIL.

- [ ] **Step 3: 타입** — `src/types.ts`

`ChatAction` 아래에 추가:

```ts
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
}
```

`AppState` 의 `ledger: LedgerEntry[]` 아래에 추가:

```ts
  /** 채팅 기록 — 에이전트 실행이 스토어에 있어서 채팅도 스토어에 둔다(탭을 오가도 남는다) */
  chat: ChatItem[]
  /** 오케스트레이터 실행 한 회차 */
  orch?: Orchestration
```

`TraceEvent.actor` 유니온에 `| 'doc-agent' | 'credit-agent'` 을 추가한다(Task 16 에서 쓴다).

- [ ] **Step 4: 리듀서** — `src/store.tsx`

- import 의 type 목록에 `ChatAction`, `ChatItem`, `OrchTask` 추가.
- `Action` 에 추가:

```ts
  | { type: 'CHAT_ASK'; text: string }
  | { type: 'ORCH_DONE'; id: number; tasks: OrchTask[]; text: string; action?: ChatAction; source: 'llm' | 'template' }
```

- `initialState` 의 `ledger: …` 아래에 `chat: [],` 추가.
- `baseReducer` 에 추가:

```ts
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
      let st: AppState = { ...s, orch: { ...s.orch, status: 'done' } }
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
```

- [ ] **Step 5: 훅 — `src/agent/useOrchestrator.ts`**

```ts
import { useEffect } from 'react'
import { useStore } from '../store'
import { PERSONAS } from '../mock/personas'
import { makeT } from '../i18n'
import { apiUrl } from '../lib/api'
import { buildChatCtx, fallbackReply, fallbackTasks, validateTasks } from './orchestrator'
import type { ChatAction } from '../types'

/* 오케스트레이터 ① 의도 분석을 부르고 ② Task 분업 결과를 스토어에 넘긴다.
   실패하면 키워드 분류 + 코드 답으로 폴백한다 — 채팅이 멈추면 안 된다. */
export function useOrchestrator() {
  const { state, dispatch } = useStore()
  const orch = state.orch
  const runId = orch?.status === 'running' ? orch.id : 0

  useEffect(() => {
    if (!runId || !orch) return
    let alive = true
    const p = PERSONAS[state.personaId]
    const lang = state.lang ?? 'ko'
    const t = makeT(lang)
    const message = orch.message

    const fallback = () => {
      if (!alive) return
      const tasks = fallbackTasks(message)
      const general = tasks.every((x) => x.agent === 'general')
      const r = general ? fallbackReply(message, state, p) : { text: t('orch.handoff') }
      dispatch({ type: 'ORCH_DONE', id: runId, tasks, text: r.text, action: r.action, source: 'template' })
    }

    fetch(apiUrl('/api/orchestrate'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ message, lang, ctx: buildChatCtx(state, p) }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (!d?.text || !Array.isArray(d.tasks)) return fallback()
        const tasks = validateTasks(d.tasks, message, state.proposal?.amount)
        const action: ChatAction | undefined = d.escalate
          ? { labelKey: 'help.human', screen: 'HELP', escalate: true }
          : undefined
        dispatch({ type: 'ORCH_DONE', id: runId, tasks, text: d.text, action, source: 'llm' })
      })
      .catch(fallback)

    return () => { alive = false }
  }, [runId]) // eslint-disable-line react-hooks/exhaustive-deps
}
```

`src/sim/Shell.tsx`·`src/sim/MobileShell.tsx`: `import { useOrchestrator } from '../agent/useOrchestrator'` 를 추가하고 `useRemitAgent()` 아래에서 `useOrchestrator()` 를 호출한다.

- [ ] **Step 6: 확인**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
/opt/homebrew/bin/git add src/types.ts src/store.tsx src/store.test.ts src/agent/useOrchestrator.ts src/sim/Shell.tsx src/sim/MobileShell.tsx
/opt/homebrew/bin/git commit -m "채팅·오케스트레이션 상태를 스토어로 + 의도 분석 → 분업 훅"
```

# Phase D — 서류 에이전트 · 문서 Vector DB

### Task 12: Supabase 스키마·RPC + 마이그레이션 스크립트 (실제 적용)

**Files:**
- Create: `supabase/migrations/001_guides.sql`
- Create: `scripts/db-migrate.mjs`, `scripts/guide-check.mjs`
- Modify: `package.json` (devDependency `postgres`, 스크립트)

- [ ] **Step 1: 의존성·스크립트**

Run: `npm i -D postgres@3`

`package.json` 의 `scripts` 에 추가:

```json
    "db:migrate": "node --env-file=.env.local scripts/db-migrate.mjs",
    "guide:check": "node --env-file=.env.local scripts/guide-check.mjs",
```

- [ ] **Step 2: 스키마** — `supabase/migrations/001_guides.sql`

```sql
-- ONNA 문서 Vector DB — 서류 에이전트의 RAG 검색 대상(안내 자료).
-- 사용자가 올린 서류는 여기 저장하지 않는다(메모리에서만 처리).
-- 공개(publishable) 키로는 아래 두 RPC 만 부를 수 있다: 테이블은 권한 회수 + RLS.

set search_path = public, extensions;

create extension if not exists vector with schema extensions;

create table if not exists public.onna_guide_docs (
  id          text primary key,
  title       text not null,
  source      text not null,
  url         text,
  kinds       text[] not null default '{}',   -- 비어 있으면 모든 서류 종류에 공통
  lang        text not null default 'ko',
  updated_at  timestamptz not null default now()
);

create table if not exists public.onna_guide_chunks (
  id         text primary key,                 -- '<doc_id>#<seq>'
  doc_id     text not null references public.onna_guide_docs (id) on delete cascade,
  seq        int  not null,
  content    text not null,
  embedding  extensions.vector(1536) not null  -- text-embedding-3-small
);

create index if not exists onna_guide_chunks_doc_idx on public.onna_guide_chunks (doc_id);
create index if not exists onna_guide_chunks_embedding_idx
  on public.onna_guide_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.onna_guide_docs   enable row level security;
alter table public.onna_guide_chunks enable row level security;
revoke all on table public.onna_guide_docs, public.onna_guide_chunks from anon, authenticated;

create or replace function public.match_guide_chunks(
  query_embedding extensions.vector(1536),
  match_count int default 5,
  kind_filter text default null
)
returns table (id text, doc_id text, title text, source text, url text, content text, similarity double precision)
language sql stable security definer
set search_path = public, extensions
as $$
  select c.id, c.doc_id, d.title, d.source, d.url, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.onna_guide_chunks c
  join public.onna_guide_docs d on d.id = c.doc_id
  where kind_filter is null or cardinality(d.kinds) = 0 or kind_filter = any (d.kinds)
  order by c.embedding <=> query_embedding
  limit least(greatest(coalesce(match_count, 5), 1), 10);
$$;

create or replace function public.get_guide_chunks(ids text[])
returns table (id text, doc_id text, title text, source text, url text, content text)
language sql stable security definer
set search_path = public, extensions
as $$
  select c.id, c.doc_id, d.title, d.source, d.url, c.content
  from public.onna_guide_chunks c
  join public.onna_guide_docs d on d.id = c.doc_id
  where c.id = any (ids[1:10]);
$$;

revoke all on function public.match_guide_chunks(extensions.vector, int, text) from public;
revoke all on function public.get_guide_chunks(text[]) from public;
grant execute on function public.match_guide_chunks(extensions.vector, int, text) to anon, authenticated;
grant execute on function public.get_guide_chunks(text[]) to anon, authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 3: 마이그레이션 실행기** — `scripts/db-migrate.mjs`

```js
/* supabase/migrations/*.sql 을 이름순으로 한 번씩 적용한다.
   접속: SUPABASE_DB_URL (Transaction pooler — Direct 주소는 IPv6 전용이라 안 붙는다)
   실행: npm run db:migrate */

import postgres from 'postgres'
import { readdirSync, readFileSync } from 'node:fs'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL 이 없습니다 — .env.local 을 확인하세요')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1, ssl: 'require', onnotice: () => {} })
try {
  await sql`create table if not exists public.onna_migrations (name text primary key, applied_at timestamptz not null default now())`
  await sql`alter table public.onna_migrations enable row level security`
  const done = new Set((await sql`select name from public.onna_migrations`).map((r) => r.name))
  const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (done.has(f)) {
      console.log('·', f, '(이미 적용)')
      continue
    }
    const body = readFileSync(`supabase/migrations/${f}`, 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(body)
      await tx`insert into public.onna_migrations (name) values (${f})`
    })
    console.log('✓', f)
  }
} finally {
  await sql.end({ timeout: 5 })
}
```

- [ ] **Step 4: 공개 키 권한 검사기** — `scripts/guide-check.mjs`

```js
/* 공개(publishable) 키로 할 수 있는 것과 없는 것을 확인한다.
   - RPC match_guide_chunks: 되어야 한다
   - 테이블 직접 조회: 막혀야 한다 (권한 없음 또는 빈 결과)
   실행: npm run guide:check */

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY 가 없습니다')
  process.exit(1)
}
const headers = { apikey: key, 'content-type': 'application/json' }
const vec = Array.from({ length: 1536 }, (_, i) => Math.sin(i + 1))

const r1 = await fetch(`${url}/rest/v1/rpc/match_guide_chunks`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ query_embedding: vec, match_count: 3, kind_filter: null }),
})
const b1 = await r1.text()
console.log('RPC match_guide_chunks →', r1.status, b1.slice(0, 160))

const r2 = await fetch(`${url}/rest/v1/onna_guide_chunks?select=id&limit=1`, { headers })
const b2 = await r2.text()
console.log('테이블 직접 조회   →', r2.status, b2.slice(0, 160))

const rpcOk = r1.ok && Array.isArray(JSON.parse(b1))
const tableBlocked = !r2.ok || b2.trim() === '[]'
console.log(rpcOk && tableBlocked ? '✓ 권한 구성 정상' : '✗ 권한 구성 확인 필요')
process.exit(rpcOk && tableBlocked ? 0 : 1)
```

- [ ] **Step 5: 적용과 확인**

Run: `npm run db:migrate`
Expected: `✓ 001_guides.sql`

Run: `npm run db:migrate`
Expected: `· 001_guides.sql (이미 적용)`

Run: `npm run guide:check`
Expected:
- `RPC match_guide_chunks → 200 []`
- `테이블 직접 조회 → 401` 이나 `403`, 또는 `200 []`
- 마지막 줄 `✓ 권한 구성 정상`

> RPC 가 401 이면 publishable 키를 `Authorization: Bearer` 로도 보내야 하는 것이다. `guide-check.mjs` 와 Task 14 의 `api/_guides.ts` 헤더에 `authorization: \`Bearer ${key}\`` 를 추가하고 다시 확인한다.
> RPC 가 404(`PGRST202`)면 스키마 캐시가 늦은 것이다. 10초 뒤 다시 실행한다.

- [ ] **Step 6: 커밋**

```bash
/opt/homebrew/bin/git add package.json package-lock.json supabase/migrations/001_guides.sql scripts/db-migrate.mjs scripts/guide-check.mjs
/opt/homebrew/bin/git commit -m "문서 Vector DB 스키마(pgvector)·RPC + 마이그레이션·권한 검사 스크립트"
```

### Task 13: 안내 자료 적재 파이프라인 (자료를 받으면 실행)

**Files:**
- Create: `scripts/guide-chunk.mjs`, `scripts/guide-chunk.test.mjs`, `scripts/guide-ingest.mjs`
- Create: `guides/README.md`, `guides/sources.example.json`
- Modify: `.gitignore`, `package.json`

- [ ] **Step 1: 실패하는 테스트 작성** — `scripts/guide-chunk.test.mjs`

```js
import { describe, expect, it } from 'vitest'
import { chunkText } from './guide-chunk.mjs'

const para = (n, ch = '가') => `${ch.repeat(n - 1)}.`

describe('chunkText', () => {
  it('빈 글은 빈 배열', () => expect(chunkText('  \n\n ')).toEqual([]))

  it('짧은 문단들은 한 청크로 묶는다', () => {
    expect(chunkText('첫 문단.\n\n둘째 문단.')).toEqual(['첫 문단.\n\n둘째 문단.'])
  })

  it('제목 앞에서 끊는다', () => {
    const out = chunkText(`# 가스\n${para(400)}\n# 전기\n${para(400, '나')}`, { size: 500, overlap: 50 })
    expect(out).toHaveLength(2)
    expect(out[0].startsWith('# 가스')).toBe(true)
    expect(out[1]).toContain('# 전기')
  })

  it('청크 길이는 size + overlap + 구분자를 넘지 않는다', () => {
    const text = Array.from({ length: 12 }, (_, i) => para(180, String.fromCharCode(0xac00 + i))).join('\n\n')
    for (const c of chunkText(text, { size: 400, overlap: 60 })) expect(c.length).toBeLessThanOrEqual(400 + 60 + 3)
  })

  it('둘째 청크부터는 앞 청크 끝이 겹쳐 붙는다', () => {
    const out = chunkText(`${para(300)}\n\n${para(300, '나')}`, { size: 350, overlap: 40 })
    expect(out).toHaveLength(2)
    expect(out[1].startsWith(out[0].slice(-40))).toBe(true)
  })

  it('아주 긴 한 문장도 잘라 낸다', () => {
    const out = chunkText('다'.repeat(1500), { size: 500, overlap: 50 })
    expect(out.length).toBeGreaterThanOrEqual(3)
    expect(out.every((c) => c.length <= 553)).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run scripts/guide-chunk.test.mjs`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `scripts/guide-chunk.mjs`

```js
/* 안내 자료 → 검색 청크. 제목·문단 경계를 먼저 지키고, 긴 문단은 문장 단위,
   그래도 긴 문장은 글자 단위로 자른다. 둘째 청크부터는 앞 청크 끝(overlap)을 붙여
   문맥이 끊기지 않게 한다. */

const SEP = '\n\n'

function hardSplit(s, size, overlap) {
  const out = []
  for (let i = 0; i < s.length; i += size - overlap) out.push(s.slice(i, i + size))
  return out
}

export function chunkText(text, { size = 700, overlap = 100 } = {}) {
  const clean = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!clean) return []

  const paras = clean
    .split(/\n(?=#{1,6}\s)|\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  const base = []
  let cur = ''
  const flush = () => {
    if (cur.trim()) base.push(cur.trim())
    cur = ''
  }

  for (const p of paras) {
    const heading = /^#{1,6}\s/.test(p)
    if (heading) flush()
    if (p.length > size) {
      flush()
      for (const s of p.split(/(?<=[.!?。])\s+/)) {
        if (s.length > size) {
          flush()
          base.push(...hardSplit(s, size, overlap))
          continue
        }
        if (cur && cur.length + 1 + s.length > size) flush()
        cur = cur ? `${cur} ${s}` : s
      }
      flush()
      continue
    }
    if (cur && cur.length + SEP.length + p.length > size) flush()
    cur = cur ? `${cur}${SEP}${p}` : p
  }
  flush()

  return base.map((c, i) => (i === 0 ? c : `${base[i - 1].slice(-overlap)} ${c}`))
}
```

> 겹침 뒤 구분자는 공백 한 칸이라 길이 상한은 `size + overlap + 1` 이다. 테스트의 `+3` 은 여유분이다. 긴 문장을 `hardSplit` 한 조각들은 이미 서로 겹친다. 여기에 앞 청크 끝이 한 번 더 붙어도 검색 품질에는 문제가 없다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run scripts/guide-chunk.test.mjs`
Expected: PASS.

> 테스트가 실패하면 `chunkText` 를 테스트에 맞춰 고친다(테스트가 명세다). 특히 "제목 앞에서 끊는다"는 `heading` 분기가 담당한다.

- [ ] **Step 5: 적재 스크립트** — `npm i -D unpdf` 후 `scripts/guide-ingest.mjs`

```js
/* 안내 자료 적재 — guides/sources.json 에 적힌 파일을 청크로 잘라 임베딩하고
   Supabase(onna_guide_docs / onna_guide_chunks)에 넣는다. 문서 단위로 지우고 다시 넣어서
   여러 번 실행해도 결과가 같다. sources.json 에 없는 문서는 지운다.

   실행: npm run guide:ingest            (guides/)
         npm run guide:ingest -- guides-test (다른 폴더) */

import postgres from 'postgres'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { chunkText } from './guide-chunk.mjs'

const DIR = process.argv[2] ?? 'guides'
const KINDS = ['utility_bill', 'payslip', 'contract', 'bank_doc', 'residence_card', 'receipt', 'mail', 'unknown']
const EMBED_MODEL = 'text-embedding-3-small'

const dbUrl = process.env.SUPABASE_DB_URL
const openaiKey = process.env.OPENAI_API_KEY
if (!dbUrl || !openaiKey) {
  console.error('SUPABASE_DB_URL / OPENAI_API_KEY 가 없습니다 — .env.local 을 확인하세요')
  process.exit(1)
}
const manifestPath = join(DIR, 'sources.json')
if (!existsSync(manifestPath)) {
  console.error(`${manifestPath} 가 없습니다 — guides/README.md 를 보세요`)
  process.exit(1)
}

/** @type {Array<{file:string,id:string,title:string,source:string,url?:string,kinds?:string[],lang?:string}>} */
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
for (const d of manifest) {
  if (!d.file || !/^[a-z0-9_-]+$/.test(d.id ?? '') || !d.title || !d.source)
    throw new Error(`sources.json 항목 확인 필요: ${JSON.stringify(d)}`)
  const bad = (d.kinds ?? []).filter((k) => !KINDS.includes(k))
  if (bad.length) throw new Error(`${d.id}: 모르는 kinds ${bad.join(',')}`)
}

async function readDoc(file) {
  const p = join(DIR, file)
  if (extname(p).toLowerCase() === '.pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(readFileSync(p)))
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  }
  return readFileSync(p, 'utf8')
}

async function embedAll(texts) {
  const out = []
  for (let i = 0; i < texts.length; i += 64) {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${openaiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts.slice(i, i + 64) }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d?.error?.message ?? `embeddings ${r.status}`)
    out.push(...d.data.map((x) => x.embedding))
  }
  return out
}

const sql = postgres(dbUrl, { prepare: false, max: 1, ssl: 'require', onnotice: () => {} })
try {
  for (const doc of manifest) {
    const chunks = chunkText(await readDoc(doc.file))
    if (!chunks.length) {
      console.warn('!', doc.id, '— 읽을 글이 없어 건너뜀')
      continue
    }
    const vecs = await embedAll(chunks.map((c) => `${doc.title}\n${c}`))
    await sql.begin(async (tx) => {
      await tx`
        insert into public.onna_guide_docs (id, title, source, url, kinds, lang, updated_at)
        values (${doc.id}, ${doc.title}, ${doc.source}, ${doc.url ?? null}, ${doc.kinds ?? []}, ${doc.lang ?? 'ko'}, now())
        on conflict (id) do update set title = excluded.title, source = excluded.source, url = excluded.url,
          kinds = excluded.kinds, lang = excluded.lang, updated_at = now()`
      await tx`delete from public.onna_guide_chunks where doc_id = ${doc.id}`
      for (let i = 0; i < chunks.length; i++) {
        await tx`
          insert into public.onna_guide_chunks (id, doc_id, seq, content, embedding)
          values (${`${doc.id}#${i}`}, ${doc.id}, ${i}, ${chunks[i]}, ${JSON.stringify(vecs[i])}::extensions.vector)`
      }
    })
    console.log('✓', doc.id, `${chunks.length}청크`)
  }
  const ids = manifest.map((d) => d.id)
  const gone = await sql`delete from public.onna_guide_docs where not (id = any (${ids})) returning id`
  if (gone.length) console.log('− 목록에 없어 지움:', gone.map((r) => r.id).join(', '))
} finally {
  await sql.end({ timeout: 5 })
}
```

`package.json` scripts 에 `"guide:ingest": "node --env-file=.env.local scripts/guide-ingest.mjs",` 추가.

- [ ] **Step 6: 자료 폴더 안내**

`.gitignore` 끝에 추가(저장소가 공개라 받은 자료 원본은 커밋하지 않는다):

```
# 안내 자료 원본 — 저장소가 공개이므로 올리지 않는다 (README·예시만 커밋)
guides/*
!guides/README.md
!guides/sources.example.json
guides-test/
```

`guides/sources.example.json`:

```json
[
  {
    "file": "gas-bill-guide.md",
    "id": "gas_bill_guide",
    "title": "도시가스 요금 고지서 읽는 법",
    "source": "제공 자료 이름 (발행 기관)",
    "url": "https://example.org/원문-주소",
    "kinds": ["utility_bill"],
    "lang": "ko"
  }
]
```

`guides/README.md`:

```md
# 안내 자료 (문서 Vector DB 원본)

서류 에이전트가 RAG 검색으로 찾는 근거 자료다. 여기 넣은 파일은 **커밋되지 않는다**(저장소가 공개).

1. 자료 파일(`.md` · `.txt` · `.pdf`)을 이 폴더에 둔다.
2. `sources.example.json` 을 `sources.json` 으로 복사해 파일마다 한 줄씩 적는다.
   - `id`: 영문 소문자·숫자·`_`·`-` 만
   - `kinds`: 이 자료가 설명하는 서류 종류 — `utility_bill` `payslip` `contract` `bank_doc` `residence_card` `receipt` `mail` `unknown`. 비워 두면 모든 서류에 공통으로 검색된다
   - `source`·`url`: 화면의 출처 칩에 그대로 보인다
3. `npm run guide:ingest` — 목록에 없는 문서는 DB 에서 지워진다.
```

- [ ] **Step 7: 커밋**

```bash
/opt/homebrew/bin/git add scripts/guide-chunk.mjs scripts/guide-chunk.test.mjs scripts/guide-ingest.mjs guides/README.md guides/sources.example.json .gitignore package.json package-lock.json
/opt/homebrew/bin/git commit -m "안내 자료 적재 파이프라인(청크·임베딩·upsert) — 자료를 받으면 실행"
```

### Task 14: 서류 규칙·CoVe 비교 (공용 순수 모듈)

**Files:**
- Create: `src/agent/docRules.ts`, `src/agent/cove.ts`
- Test: `src/agent/docRules.test.ts`, `src/agent/cove.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/agent/docRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cleanAnswer, cleanChecks, toKind } from './docRules'

const raw = {
  summary: '9월 도시가스 요금이에요.',
  points: [
    { id: 'p1', text: '청구금액은 15,520원이에요.', cites: ['ocr'] },
    { id: 'p2', text: '납기일이 지나면 연체료가 붙어요.', cites: ['guide_gas#0', 'guide_ghost#9'] },
    { id: 'p3', text: '출처 없는 말', cites: ['guide_ghost#9'] },
    { id: 'p4', text: '', cites: ['ocr'] },
  ],
  actions: [
    { kind: 'autopay', reason: '매달 잊지 않게' },
    { kind: 'autopay', reason: '중복' },
    { kind: 'pay_now', reason: '허용 밖' },
    { kind: 'open_record', reason: '고지서엔 허용 밖' },
    { kind: 'human', reason: '' },
  ],
}

describe('cleanAnswer', () => {
  const a = cleanAnswer(raw, 'utility_bill', ['guide_gas#0'])!

  it('모르는 출처는 지우고, 출처가 없거나 빈 항목은 버린다', () => {
    expect(a.points).toEqual([
      { id: 'p1', text: '청구금액은 15,520원이에요.', cites: ['ocr'] },
      { id: 'p2', text: '납기일이 지나면 연체료가 붙어요.', cites: ['guide_gas#0'] },
    ])
  })

  it('서류 종류별 허용 행동만, 중복 없이', () => {
    expect(a.actions.map((x) => x.kind)).toEqual(['autopay', 'human'])
  })

  it('요약이 없거나 남는 항목이 없으면 null', () => {
    expect(cleanAnswer({ ...raw, summary: '' }, 'utility_bill', [])).toBeNull()
    expect(cleanAnswer({ ...raw, points: [raw.points[2]] }, 'utility_bill', [])).toBeNull()
    expect(cleanAnswer(null, 'utility_bill', [])).toBeNull()
  })
})

describe('cleanChecks', () => {
  it('있는 항목을 가리키는 질문만, 최대 4개, yesno 기대값은 yes', () => {
    const c = cleanChecks(
      [
        { id: 'c1', pointId: 'p1', q: '청구금액은 얼마인가요?', type: 'value', expect: '15,520원' },
        { id: 'c2', pointId: 'p9', q: '없는 항목', type: 'value', expect: '1' },
        { id: 'c3', pointId: 'p2', q: '납기 후 연체료가 붙나요?', type: 'yesno' },
        { id: 'c4', pointId: 'p1', q: '', type: 'value', expect: '1' },
        { id: 'c5', pointId: 'p1', q: '값 없는 value', type: 'value', expect: '' },
        { id: 'c6', pointId: 'p1', q: '모르는 type', type: 'maybe', expect: 'x' },
      ],
      ['p1', 'p2'],
    )
    expect(c).toEqual([
      { id: 'c1', pointId: 'p1', q: '청구금액은 얼마인가요?', type: 'value', expect: '15,520원' },
      { id: 'c3', pointId: 'p2', q: '납기 후 연체료가 붙나요?', type: 'yesno', expect: 'yes' },
    ])
  })
})

it('toKind — 모르는 종류는 unknown', () => {
  expect(toKind('payslip')).toBe('payslip')
  expect(toKind('tax')).toBe('unknown')
})
```

`src/agent/cove.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { checkMatches, dropPoints, findMismatches, verifyPayload } from './cove'
import type { DocCheck } from './docRules'

const v = (expect: string): DocCheck => ({ id: 'c', pointId: 'p1', q: 'q', type: 'value', expect })
const yn: DocCheck = { id: 'y', pointId: 'p2', q: 'q', type: 'yesno', expect: 'yes' }

describe('checkMatches', () => {
  it('금액은 숫자 묶음으로 견준다', () => {
    expect(checkMatches(v('15,520원'), { id: 'c', answer: '15520원' })).toBe(true)
    expect(checkMatches(v('15,520원'), { id: 'c', answer: '청구 15,520원 (납기 후 15,790원)' })).toBe(true)
    expect(checkMatches(v('15,520원'), { id: 'c', answer: '15,790원' })).toBe(false)
    // 부분 숫자로 맞았다고 보지 않는다
    expect(checkMatches(v('12'), { id: 'c', answer: '1,284 m³' })).toBe(false)
  })

  it('날짜는 표기가 달라도 같은 날이면 일치, 연도가 한쪽에만 있어도 된다', () => {
    expect(checkMatches(v('2026. 10. 05.'), { id: 'c', answer: '2026-10-5' })).toBe(true)
    expect(checkMatches(v('2026년 10월 5일'), { id: 'c', answer: '10월 5일' })).toBe(true)
    expect(checkMatches(v('2026. 10. 05.'), { id: 'c', answer: '2026. 10. 15.' })).toBe(false)
  })

  it('글자 값은 공백·대소문자 무시 포함 관계', () => {
    expect(checkMatches(v('한빛도시가스'), { id: 'c', answer: '한빛도시가스(주)' })).toBe(true)
    expect(checkMatches(v('한빛도시가스'), { id: 'c', answer: '한국전력' })).toBe(false)
  })

  it('답이 없으면 불일치', () => {
    expect(checkMatches(v('15,520원'), { id: 'c', answer: null })).toBe(false)
    expect(checkMatches(v('15,520원'), undefined)).toBe(false)
  })

  it('yesno 는 yes 만 일치', () => {
    expect(checkMatches(yn, { id: 'y', answer: null, verdict: 'yes' })).toBe(true)
    expect(checkMatches(yn, { id: 'y', answer: null, verdict: 'unknown' })).toBe(false)
  })
})

describe('findMismatches · verifyPayload · dropPoints', () => {
  const checks: DocCheck[] = [{ ...v('15,520원'), id: 'c1' }, { ...yn, id: 'c2' }]

  it('어긋난 질문만 항목 id 와 함께', () => {
    const m = findMismatches(checks, [
      { id: 'c1', answer: '15,520원' },
      { id: 'c2', answer: null, verdict: 'no' },
    ])
    expect(m).toEqual([{ checkId: 'c2', pointId: 'p2', q: 'q', answer: null }])
  })

  it('검증에는 기대값을 보내지 않는다', () => {
    expect(verifyPayload(checks)).toEqual([
      { id: 'c1', q: 'q', type: 'value' },
      { id: 'c2', q: 'q', type: 'yesno' },
    ])
  })

  it('어긋난 항목을 빼고, 남는 게 없으면 null', () => {
    const ans = { summary: 's', actions: [], points: [{ id: 'p1', text: 'a', cites: ['ocr'] }, { id: 'p2', text: 'b', cites: ['ocr'] }] }
    expect(dropPoints(ans, ['p2'])?.points.map((p) => p.id)).toEqual(['p1'])
    expect(dropPoints(ans, ['p1', 'p2'])).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/agent/docRules.test.ts src/agent/cove.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `src/agent/docRules.ts`

```ts
/* 서류 에이전트 공용 규칙 — api/doc-agent.ts(Edge)와 클라이언트가 같이 쓴다.
   import 가 없는 순수 모듈로 둔다: Edge 번들에 브라우저 코드가 딸려 가지 않게. */

export const DOC_KINDS = [
  'utility_bill', 'payslip', 'contract', 'bank_doc', 'residence_card', 'receipt', 'mail', 'unknown',
] as const
export type DocKind = (typeof DOC_KINDS)[number]

/** 앱이 실제로 실행할 수 있는 다음 행동만. "바로 납부"는 실제 납부처럼 보여 넣지 않는다 */
export const DOC_ACTIONS = ['autopay', 'due_reminder', 'ko_phrase', 'human', 'open_record'] as const
export type DocActionKind = (typeof DOC_ACTIONS)[number]

export const ACTIONS_BY_KIND: Record<DocKind, readonly DocActionKind[]> = {
  utility_bill: ['autopay', 'due_reminder', 'ko_phrase', 'human'],
  payslip: ['open_record', 'ko_phrase', 'human'],
  contract: ['due_reminder', 'ko_phrase', 'human'],
  bank_doc: ['open_record', 'ko_phrase', 'human'],
  residence_card: ['ko_phrase', 'human'],
  receipt: ['open_record', 'ko_phrase', 'human'],
  mail: ['ko_phrase', 'human'],
  unknown: ['ko_phrase', 'human'],
}

/** 검색 질의에 넣는 종류 이름 — 안내 자료가 한국어라 한국어로 */
export const KIND_KO: Record<DocKind, string> = {
  utility_bill: '공과금 고지서',
  payslip: '급여명세서',
  contract: '근로계약서',
  bank_doc: '은행 거래 서류',
  residence_card: '외국인등록증',
  receipt: '영수증',
  mail: '안내 우편물',
  unknown: '서류',
}

export interface DocPoint { id: string; text: string; cites: string[] }
export interface DocAction { kind: DocActionKind; reason: string }
export interface DocAnswer { summary: string; points: DocPoint[]; actions: DocAction[] }

/** CoVe 검증 질문. expect 는 초안이 주장한 값 — 검증 호출에는 보내지 않는다 */
export interface DocCheck {
  id: string
  pointId: string
  q: string
  type: 'value' | 'yesno'
  expect: string
}

export const toKind = (v: unknown): DocKind =>
  (DOC_KINDS as readonly string[]).includes(String(v)) ? (v as DocKind) : 'unknown'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** 최종 답 정리 — 모르는 출처 제거, 출처 없는·빈 항목 제거, 허용 밖·중복 행동 제거.
    쓸 만한 항목이 하나도 없으면 null */
export function cleanAnswer(raw: unknown, kind: DocKind, citeIds: readonly string[]): DocAnswer | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const summary = str(r.summary)
  if (!summary) return null

  const allowed = new Set(['ocr', ...citeIds])
  const points: DocPoint[] = (Array.isArray(r.points) ? r.points : [])
    .map((x, i) => {
      const o = (x ?? {}) as Record<string, unknown>
      const cites = (Array.isArray(o.cites) ? o.cites : []).map(String).filter((c) => allowed.has(c))
      return { id: str(o.id) || `p${i + 1}`, text: str(o.text), cites: [...new Set(cites)] }
    })
    .filter((p) => p.text && p.cites.length)
    .slice(0, 5)
  if (!points.length) return null

  const ok = new Set<string>(ACTIONS_BY_KIND[kind])
  const actions: DocAction[] = []
  for (const x of Array.isArray(r.actions) ? r.actions : []) {
    const o = (x ?? {}) as Record<string, unknown>
    const k = String(o.kind)
    if (ok.has(k) && !actions.some((a) => a.kind === k)) actions.push({ kind: k as DocActionKind, reason: str(o.reason) })
  }
  return { summary, points, actions: actions.slice(0, 3) }
}

export function cleanChecks(raw: unknown, pointIds: readonly string[]): DocCheck[] {
  const ids = new Set(pointIds)
  const out: DocCheck[] = []
  for (const x of Array.isArray(raw) ? raw : []) {
    const o = (x ?? {}) as Record<string, unknown>
    const id = str(o.id)
    const pointId = str(o.pointId)
    const q = str(o.q).slice(0, 200)
    const type = o.type === 'value' || o.type === 'yesno' ? o.type : null
    const expect = type === 'yesno' ? 'yes' : str(o.expect)
    if (!id || !ids.has(pointId) || !q || !type || !expect) continue
    out.push({ id, pointId, q, type, expect })
  }
  return out.slice(0, 4)
}
```

`src/agent/cove.ts`:

```ts
import type { DocAnswer, DocCheck } from './docRules'

/* CoVe(Chain-of-Verification) 비교 — 초안이 주장한 값(expect)과, 초안을 보지 않은
   검증 호출의 답을 코드가 견준다. 어긋난 항목이 있을 때만 수정 호출을 한다. */

export interface DocVerifyAnswer {
  id: string
  answer: string | null
  verdict?: 'yes' | 'no' | 'unknown'
  cite?: string
}

export interface Mismatch {
  checkId: string
  pointId: string
  q: string
  answer: string | null
}

const pad = (s: string) => s.padStart(2, '0')
const YMD = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/
const MD = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/

function dateParts(s: string): { y?: string; md: string } | null {
  const a = s.match(YMD)
  if (a) return { y: a[1], md: pad(a[2]) + pad(a[3]) }
  const b = s.match(MD)
  return b ? { md: pad(b[1]) + pad(b[2]) } : null
}

const digitGroups = (s: string) => (s.match(/\d[\d,.]*/g) ?? []).map((g) => g.replace(/\D/g, ''))
const norm = (s: string) => s.toLowerCase().replace(/[\s.,·()]/g, '')

export function checkMatches(c: DocCheck, a?: DocVerifyAnswer): boolean {
  if (!a) return false
  if (c.type === 'yesno') return a.verdict === 'yes'
  const ans = (a.answer ?? '').trim()
  if (!ans) return false

  const de = dateParts(c.expect)
  const da = dateParts(ans)
  if (de || da) return !!de && !!da && de.md === da.md && (!de.y || !da.y || de.y === da.y)

  const en = c.expect.replace(/\D/g, '')
  if (en) return digitGroups(ans).includes(en)

  const e = norm(c.expect)
  const n = norm(ans)
  return !!e && !!n && (e.includes(n) || n.includes(e))
}

export function findMismatches(checks: DocCheck[], answers: DocVerifyAnswer[]): Mismatch[] {
  return checks
    .filter((c) => !checkMatches(c, answers.find((a) => a.id === c.id)))
    .map((c) => ({
      checkId: c.id,
      pointId: c.pointId,
      q: c.q,
      answer: answers.find((a) => a.id === c.id)?.answer ?? null,
    }))
}

/** 검증 호출에 보낼 질문 — 초안의 주장(expect)은 빼서 독립 검증이 되게 한다 */
export const verifyPayload = (checks: DocCheck[]) => checks.map(({ id, q, type }) => ({ id, q, type }))

/** 수정 호출이 실패했을 때 — 어긋난 항목만 뺀다 */
export function dropPoints(ans: DocAnswer, pointIds: string[]): DocAnswer | null {
  const points = ans.points.filter((p) => !pointIds.includes(p.id))
  return points.length ? { ...ans, points } : null
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/agent/docRules.test.ts src/agent/cove.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
/opt/homebrew/bin/git add src/agent/docRules.ts src/agent/docRules.test.ts src/agent/cove.ts src/agent/cove.test.ts
/opt/homebrew/bin/git commit -m "서류 에이전트 공용 규칙(허용 행동·답 정리)과 CoVe 비교"
```

### Task 15: 서류 에이전트 엔드포인트 `/api/doc-agent` + `_guides.ts`

**Files:**
- Modify: `api/_lib.ts`
- Create: `api/_guides.ts`, `api/doc-agent.ts`
- (`api/doc.ts` 는 도움 화면을 옮기는 Task 17 에서 지운다)

- [ ] **Step 1: 공용 근거 검사** — `api/_lib.ts` 의 `maskPii` 아래에 추가

```ts
/** 문장 속 3자리 이상 숫자가 전부 근거 숫자열(sourceDigits)에 들어 있는지 — 근거 없는 수치 차단 */
export function groundedDigits(texts: string[], sourceDigits: string): boolean {
  return texts.every((text) =>
    (text.match(/[\d][\d.,\s]{2,}/g) ?? []).every((tok) => {
      const d = tok.replace(/\D/g, '')
      return d.length < 3 || sourceDigits.includes(d)
    }),
  )
}
```

- [ ] **Step 2: `api/_guides.ts`**

```ts
/* 문서 Vector DB (Supabase pgvector) — 공개(publishable) 키로 RPC 두 개만 부른다.
   테이블은 권한 회수 + RLS 라 직접 조회되지 않는다 (supabase/migrations/001_guides.sql).
   실패하면 throw — 호출부가 "안내 자료 없음"으로 바꾼다. */

export const EMBED_MODEL = 'text-embedding-3-small'

export interface GuideChunk {
  id: string
  doc_id: string
  title: string
  source: string
  url: string | null
  content: string
  similarity?: number
}

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    return await fn(ctl.signal)
  } finally {
    clearTimeout(timer)
  }
}

export async function embed(text: string, timeoutMs = 5000): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not set')
  return withTimeout(timeoutMs, async (signal) => {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 6000) }),
      signal,
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d?.error?.message ?? `embeddings ${r.status}`)
    return d.data[0].embedding as number[]
  })
}

async function rpc<T>(fn: string, args: Record<string, unknown>, timeoutMs = 4000): Promise<T> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set')
  return withTimeout(timeoutMs, async (signal) => {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal,
    })
    if (!r.ok) throw new Error(`supabase ${fn} ${r.status}`)
    return (await r.json()) as T
  })
}

export const matchChunks = (vec: number[], k: number, kind: string | null) =>
  rpc<GuideChunk[]>('match_guide_chunks', { query_embedding: vec, match_count: k, kind_filter: kind })

export const getChunks = (ids: string[]): Promise<GuideChunk[]> =>
  ids.length ? rpc<GuideChunk[]>('get_guide_chunks', { ids: ids.slice(0, 10) }) : Promise.resolve([])
```

- [ ] **Step 3: `api/doc-agent.ts`**

```ts
import {
  json, bad, openai, parseJson, copyLint, maskPii, rateLimit, clientIp, MODEL_VISION, preflight, groundedDigits,
} from './_lib'
import { embed, getChunks, matchChunks, type GuideChunk } from './_guides'
import { ACTIONS_BY_KIND, DOC_KINDS, KIND_KO, cleanAnswer, cleanChecks, toKind, type DocKind } from '../src/agent/docRules'

export const config = { runtime: 'edge' }

/* 서류 에이전트 — 단계마다 요청이 따로 온다(클라이언트 useDocAgent 가 순서를 잡는다).
     ocr    : 사진 → 종류·주요 글자·항목·기본 요약            (vision)
     search : 질의 임베딩 → 문서 Vector DB(pgvector) top-5     (RAG)
     draft  : 근거 달린 초안 + 검증 질문                       (CoVe 1)
     verify : 초안을 보지 않고 원본 사진·자료로 질문에 답함      (CoVe 2, vision)
     revise : 어긋난 항목만 고침 — 어긋났을 때만 불린다          (CoVe 3)
   프라이버시: 사진·원문은 메모리에서만 처리하고 저장·로그하지 않는다. */

const LANG_NAME: Record<string, string> = {
  ko: 'Korean', en: 'English', id: 'Indonesian', vi: 'Vietnamese', ne: 'Nepali',
}
const MIN_SIMILARITY = 0.3

const RULES = `HARD RULES
- Never invent values. Use only what is printed on the document or written in the PASSAGES.
- Never state whether anything passes or fails any rule or regulation. No legal or financial advice.
- FORBIDDEN WORDS (any language): 거절, 차단, 위반, 블록체인, DID, 크리덴셜, 토큰.
- Plain, short sentences — the reader may have low literacy. Polite register (Korean: 해요체, never 합니다체).
- Write every figure in Western digits (0-9).`

type Body = Record<string, unknown>
const s = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '')
const opt = (v: unknown) => (v == null || v === '' ? null : maskPii(String(v)).trim())

function fieldsOf(v: unknown): Array<{ label: string; value: string }> {
  return (Array.isArray(v) ? v : [])
    .slice(0, 6)
    .map((f) => ({ label: maskPii(s((f as Body)?.label, 60)), value: maskPii(s((f as Body)?.value, 120)) }))
    .filter((f) => f.label && f.value)
}

function docBlock(b: Body, chunks: GuideChunk[]): string {
  const fields = fieldsOf(b.fields).map((f) => `- ${f.label}: ${f.value}`).join('\n') || '(none)'
  const passages = chunks.length
    ? chunks.map((c) => `[${c.id}] (${c.title} — ${c.source})\n${c.content}`).join('\n\n')
    : '(none — do not explain anything that needs a passage)'
  return `DOCUMENT KIND: ${toKind(b.kind)}
FIELDS:
${fields}
OCR TEXT [ocr]:
${maskPii(s(b.rawText, 800)) || '(none)'}
QUESTION: ${maskPii(s(b.question, 300)) || '(none)'}
PASSAGES:
${passages}`
}

const idsOf = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 10) : [])

async function chunksOf(b: Body): Promise<GuideChunk[]> {
  try {
    return await getChunks(idsOf(b.passageIds))
  } catch {
    return []
  }
}

const textOf = (d: unknown) =>
  parseJson<Body>((d as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? '')

/* ---------- ① OCR ---------- */
const OCR_SYSTEM = `You read a photo of a Korean document for a migrant worker.
STEP 1 — Read it (OCR). Extract only what is actually printed.
STEP 2 — Classify it as one of: ${DOC_KINDS.join(', ')}.
  utility_bill = gas, electricity, water, phone or health-insurance bill. bank_doc = bank statement,
  transfer receipt, balance certificate. payslip = wage statement. contract = employment contract.
STEP 3 — Explain it briefly in the REQUESTED LANGUAGE.
${RULES}
- "rawText": the most important printed lines in reading order, in Korean exactly as printed, at most 600 characters.
- "summary": 1-2 short sentences in the requested language.
- "koPhrase": a natural KOREAN sentence the worker can show or read to a Korean staff member about this document.
OUTPUT strict JSON only:
{"kind":"…","title":"<short document name in requested language>","rawText":"…",
 "amount":"<printed amount with unit>"|null,"dueDate":"<printed due date>"|null,"issuer":"<printed issuer>"|null,
 "fields":[{"label":"<label in requested language>","value":"<printed value>"}],
 "summary":"…","koPhrase":"…","confidence":"high|medium|low"}
At most 6 items in "fields".`

async function stepOcr(b: Body, lang: string) {
  const image = s(b.image, 5_000_000)
  if (!image.startsWith('data:image/')) return bad('image must be a data URL')
  if (image.length > 4_000_000) return bad('image too large (max ~3MB)', 413)

  const d = await openai(
    {
      model: MODEL_VISION,
      max_tokens: 1100,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: OCR_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}` },
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
          ],
        },
      ],
    },
    22_000,
  )
  const out = textOf(d)
  if (!out) return json({ error: 'could not read document' }, 422)
  const summary = opt(out.summary) ?? ''
  const koPhrase = opt(out.koPhrase) ?? ''
  if (!summary) return json({ error: 'empty summary' }, 422)
  if (!copyLint(summary) || !copyLint(koPhrase)) return json({ error: 'copy rule' }, 422)

  return json({
    kind: toKind(out.kind),
    title: opt(out.title),
    rawText: (opt(out.rawText) ?? '').slice(0, 800),
    amount: opt(out.amount),
    dueDate: opt(out.dueDate),
    issuer: opt(out.issuer),
    fields: fieldsOf(out.fields),
    summary,
    koPhrase,
    confidence: ['high', 'medium', 'low'].includes(String(out.confidence)) ? out.confidence : 'medium',
  })
}

/* ---------- ② RAG 검색 ---------- */
async function stepSearch(b: Body) {
  const kind = toKind(b.kind)
  const query = [
    KIND_KO[kind],
    s(b.title, 100),
    fieldsOf(b.fields).map((f) => f.label).join(' '),
    maskPii(s(b.question, 300)),
    maskPii(s(b.rawText, 300)),
  ]
    .filter(Boolean)
    .join('\n')
  try {
    const rows = await matchChunks(await embed(query), 5, kind === 'unknown' ? null : kind)
    const passages = rows
      .filter((r) => (r.similarity ?? 0) >= MIN_SIMILARITY)
      .map((r) => ({
        id: r.id,
        docId: r.doc_id,
        title: r.title,
        source: r.source,
        url: r.url,
        snippet: r.content.slice(0, 180),
        similarity: Math.round((r.similarity ?? 0) * 100) / 100,
      }))
    return json({ passages })
  } catch (e) {
    return json({ passages: [], error: (e as Error).message }, 502)
  }
}

/* ---------- 답 검증 (draft·revise 공용) ---------- */
function checkAnswer(out: Body | null, kind: DocKind, chunks: GuideChunk[], sourceDigits: string) {
  const ans = cleanAnswer(out, kind, chunks.map((c) => c.id))
  if (!ans) return null
  const masked = {
    summary: maskPii(ans.summary),
    points: ans.points.map((p) => ({ ...p, text: maskPii(p.text) })),
    actions: ans.actions.map((a) => ({ ...a, reason: maskPii(a.reason) })),
  }
  const all = [masked.summary, ...masked.points.map((p) => p.text), ...masked.actions.map((a) => a.reason)].filter(Boolean)
  if (!all.every(copyLint)) return null
  if (!groundedDigits(all, sourceDigits)) return null
  return masked
}

const digitsOf = (b: Body, chunks: GuideChunk[], extra = '') =>
  (s(b.rawText, 800) + JSON.stringify(fieldsOf(b.fields)) + chunks.map((c) => c.content).join(' ') + extra).replace(/\D/g, '')

const allowedFor = (kind: DocKind) => ACTIONS_BY_KIND[kind].join(', ')

/* ---------- ③-1 초안 + 검증 질문 ---------- */
const DRAFT_SYSTEM = `You explain a Korean document to a migrant worker, grounded in two kinds of sources:
  [ocr]   the printed text and fields read from their document
  [<id>]  PASSAGES from ONNA's guide library
Write in the REQUESTED LANGUAGE.
${RULES}
- Every point must cite its sources: "ocr" and/or passage ids. A point without a source must not exist.
- General explanations (what a charge means, what happens if paid late, how automatic payment works)
  must come from PASSAGES. If no passage covers it, do not say it.
- If a QUESTION is given, answer it first.

Then plan a verification (Chain-of-Verification). Write 2-4 "checks" — short questions that would catch
a mistake in your points. Ask neutrally ("When is the due date?", not "Is the due date October 5?").
  type "value": the answer is a printed value (amount, date, name). Put the value your point claims in "expect".
  type "yesno": a fact taken from a passage, asked so that "yes" means your point is right. "expect": "yes".
Write the checks in the same language as the document text (Korean).

Pick up to 3 "actions" the app can do next, ONLY from: {ALLOWED}. Give each a one-sentence reason.

OUTPUT strict JSON only:
{"summary":"<1-2 sentences>","points":[{"id":"p1","text":"…","cites":["ocr","<passage id>"]}],
 "actions":[{"kind":"…","reason":"…"}],
 "checks":[{"id":"c1","pointId":"p1","q":"…","type":"value|yesno","expect":"…"}]}
Write 2-5 points.`

async function stepDraft(b: Body, lang: string) {
  const kind = toKind(b.kind)
  const chunks = await chunksOf(b)
  const digits = digitsOf(b, chunks)
  let reason = 'unknown'
  for (let i = 0; i < 2; i++) {
    const d = await openai(
      {
        max_tokens: 900,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DRAFT_SYSTEM.replace('{ALLOWED}', allowedFor(kind)) },
          { role: 'user', content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}\n${docBlock(b, chunks)}` },
        ],
      },
      9_000,
    )
    const out = textOf(d)
    const ans = checkAnswer(out, kind, chunks, digits)
    if (!ans) {
      reason = 'invalid'
      continue
    }
    const checks = cleanChecks(out?.checks, ans.points.map((p) => p.id))
    return json({ ...ans, checks })
  }
  return json({ error: `draft ${reason}` }, 422)
}

/* ---------- ③-2 독립 검증 ---------- */
const VERIFY_SYSTEM = `You are a careful checker. Answer each question using ONLY the document image and the PASSAGES.
You have not seen any earlier explanation. Do not guess.
- type "value": copy the value exactly as printed (with its unit), or null if it is not printed.
- type "yesno": "verdict" is "yes" or "no" only if the PASSAGES or the document clearly say so; otherwise "unknown".
- "cite": "ocr" if you used the document, otherwise the passage id you used.
Answer in the language of the question. FORBIDDEN WORDS: 거절, 차단, 위반, 블록체인, DID, 크리덴셜, 토큰.
OUTPUT strict JSON only: {"answers":[{"id":"c1","answer":"…"|null,"verdict":"yes|no|unknown","cite":"…"}]}`

async function stepVerify(b: Body) {
  const image = s(b.image, 5_000_000)
  if (!image.startsWith('data:image/')) return bad('image must be a data URL')
  const checks = (Array.isArray(b.checks) ? b.checks : [])
    .slice(0, 4)
    .map((c) => ({ id: s((c as Body)?.id, 20), q: maskPii(s((c as Body)?.q, 200)), type: (c as Body)?.type === 'yesno' ? 'yesno' : 'value' }))
    .filter((c) => c.id && c.q)
  if (!checks.length) return bad('no checks')
  const chunks = await chunksOf(b)
  const passages = chunks.length
    ? chunks.map((c) => `[${c.id}] (${c.title})\n${c.content}`).join('\n\n')
    : '(none)'

  const d = await openai(
    {
      model: MODEL_VISION,
      max_tokens: 400,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: VERIFY_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: `PASSAGES:\n${passages}\n\nQUESTIONS:\n${JSON.stringify(checks)}` },
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
          ],
        },
      ],
    },
    20_000,
  )
  const out = textOf(d)
  const ids = new Set(checks.map((c) => c.id))
  const answers = (Array.isArray(out?.answers) ? out!.answers : [])
    .map((x) => {
      const o = (x ?? {}) as Body
      const verdict = ['yes', 'no', 'unknown'].includes(String(o.verdict)) ? String(o.verdict) : 'unknown'
      return { id: s(o.id, 20), answer: o.answer == null ? null : maskPii(s(o.answer, 120)), verdict, cite: s(o.cite, 60) }
    })
    .filter((a) => ids.has(a.id))
  return json({ answers })
}

/* ---------- ③-3 조건부 수정 ---------- */
const REVISE_SYSTEM = `You wrote a DRAFT explanation of a Korean document. An independent check found MISMATCHES:
for each, the question and what the document or passages actually say (answer, or null if not found).
Fix the draft: correct the point with the checked answer when it is clear; otherwise remove the point.
Keep everything else as it was — same sources, same rules, same language.
${RULES}
Actions ONLY from: {ALLOWED}.
OUTPUT strict JSON only:
{"summary":"…","points":[{"id":"…","text":"…","cites":["…"]}],"actions":[{"kind":"…","reason":"…"}]}`

async function stepRevise(b: Body, lang: string) {
  const kind = toKind(b.kind)
  const chunks = await chunksOf(b)
  const mismatches = (Array.isArray(b.mismatches) ? b.mismatches : [])
    .slice(0, 4)
    .map((m) => ({ pointId: s((m as Body)?.pointId, 20), q: s((m as Body)?.q, 200), answer: (m as Body)?.answer == null ? null : s((m as Body)?.answer, 120) }))
  const draft = cleanAnswer(b.draft, kind, chunks.map((c) => c.id))
  if (!draft || !mismatches.length) return bad('nothing to revise')
  // 검증 답은 원본 사진에서 읽은 값이라 근거로 인정한다
  const digits = digitsOf(b, chunks, mismatches.map((m) => m.answer ?? '').join(' '))

  const d = await openai(
    {
      max_tokens: 800,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: REVISE_SYSTEM.replace('{ALLOWED}', allowedFor(kind)) },
        {
          role: 'user',
          content: `REQUESTED LANGUAGE: ${LANG_NAME[lang]}\n${docBlock(b, chunks)}\n\nDRAFT:\n${JSON.stringify(draft)}\n\nMISMATCHES:\n${JSON.stringify(mismatches)}`,
        },
      ],
    },
    9_000,
  )
  const ans = checkAnswer(textOf(d), kind, chunks, digits)
  return ans ? json(ans) : json({ error: 'revise invalid' }, 422)
}

export default async function handler(req: Request) {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return bad('POST only', 405)
  // 한 번의 서류 분석이 4~5회 호출한다
  if (!rateLimit(clientIp(req), 40, 60_000)) return bad('too many requests', 429)

  let b: Body
  try {
    b = await req.json()
  } catch {
    return bad('invalid json')
  }
  const lang = typeof b.lang === 'string' && LANG_NAME[b.lang] ? b.lang : 'ko'

  try {
    switch (b.step) {
      case 'ocr': return await stepOcr(b, lang)
      case 'search': return await stepSearch(b)
      case 'draft': return await stepDraft(b, lang)
      case 'verify': return await stepVerify(b)
      case 'revise': return await stepRevise(b, lang)
      default: return bad('unknown step')
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
}
```

- [ ] **Step 4: 확인**

Run: `npx tsc --noEmit --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom api/doc-agent.ts api/_guides.ts`
Expected: 에러 없음.

> `../src/agent/docRules` import 가 Vercel Edge 번들에서 문제가 되면(Task 20 `vercel dev` 에서 확인) 파일을 `api/_docRules.ts` 로 복사하고 import 경로만 바꾼다. 클라이언트는 `src/agent/docRules.ts` 를 계속 쓴다. 두 파일은 머리 주석에 "같은 내용 유지"를 적는다.

- [ ] **Step 5: 커밋**

```bash
/opt/homebrew/bin/git add api/_lib.ts api/_guides.ts api/doc-agent.ts
/opt/homebrew/bin/git commit -m "/api/doc-agent — OCR·RAG 검색·CoVe(초안·독립 검증·조건부 수정)"
```

### Task 16: 서류 실행 상태 + `useDocAgent`

**Files:**
- Modify: `src/types.ts`, `src/store.tsx`, `src/sim/Shell.tsx`, `src/sim/MobileShell.tsx`
- Create: `src/agent/docImages.ts`, `src/agent/useDocAgent.ts`, `src/lib/image.ts`
- Test: `src/store.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/store.test.ts` 끝에 추가

```ts
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
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/store.test.ts`
Expected: FAIL.

- [ ] **Step 3: 타입** — `src/types.ts`

맨 위에 추가:

```ts
import type { DocAnswer, DocKind } from './agent/docRules'
export type { DocAnswer, DocKind }
```

끝에 추가:

```ts
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
```

`AppState` 의 `orch?` 아래에 `docRun?: DocRun` 추가.

- [ ] **Step 4: 리듀서** — `src/store.tsx`

import 의 type 목록에 `DocAnswer`, `DocOcr`, `DocPassage`, `DocPhase`, `DocRun` 추가. `Action` 에 추가:

```ts
  | { type: 'DOC_START'; runId: number; origin: DocRun['origin']; question?: string }
  | { type: 'DOC_OCR'; runId: number; ocr: DocOcr }
  | { type: 'DOC_SEARCH'; runId: number; passages: DocPassage[]; failed: boolean }
  | { type: 'DOC_VERIFIED'; runId: number; answer: DocAnswer; source: NonNullable<DocRun['source']>; checkCount: number; fixedCount: number }
  | { type: 'DOC_PHASE'; runId: number; phase: DocPhase }
  | { type: 'DOC_DONE'; runId: number; latencyMs: number }
  | { type: 'DOC_ERROR'; runId: number }
```

`baseReducer` 에 추가:

```ts
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
```

`baseReducer` 위에 도우미를 둔다.

```ts
const docLive = (s: AppState, runId: number) => s.docRun?.runId === runId && s.docRun.status === 'running'
```

- [ ] **Step 5: 이미지 보관·축소·훅**

`src/agent/docImages.ts`:

```ts
/* 실행 중인 서류 사진 — 스토어에 넣지 않고(직렬화·기록 방지) 여기 잠깐 둔다.
   OCR 과 독립 검증(원본 사진 재확인)에 쓰고, 실행이 끝나면 지운다. */
const images = new Map<number, string>()
export const putImage = (runId: number, dataUrl: string) => void images.set(runId, dataUrl)
export const getImage = (runId: number) => images.get(runId)
export const dropImage = (runId: number) => void images.delete(runId)
```

`src/lib/image.ts` — `src/app/screens/Record.tsx` 의 `downscale` 을 옮기고 Blob 도 받게 한다.

```ts
/** 업로드 전 브라우저에서 축소 — 업로드 용량·OCR 비용을 줄이고 전송 한도를 지킨다 */
export async function downscale(file: Blob, max = 1600, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', quality)
}
```

`src/agent/useDocAgent.ts`:

```ts
import { useEffect } from 'react'
import { useStore, type Action } from '../store'
import { apiUrl } from '../lib/api'
import { dropImage, getImage, putImage } from './docImages'
import { dropPoints, findMismatches, verifyPayload, type DocVerifyAnswer } from './cove'
import { ACTIONS_BY_KIND, cleanAnswer, cleanChecks, type DocAnswer, type DocCheck } from './docRules'
import type { DocOcr, DocPassage, DocRun } from '../types'

/* 서류 에이전트 5단계를 진행시킨다.
   ① OCR → ② RAG 검색 → ③ CoVe(초안 → 독립 검증 → 어긋나면 수정) → ④ 근거 답변 → ⑤ 다음 행동
   ④⑤는 ③의 결과를 차례로 보여 주는 단계다(추가 호출 없음). */

const STEP_MS = 380

export function startDocRun(dispatch: (a: Action) => void, image: string, origin: DocRun['origin'], question?: string) {
  const runId = Date.now()
  putImage(runId, image)
  dispatch({ type: 'DOC_START', runId, origin, question: question?.slice(0, 300) })
}

/** 서류에서 읽은 것만으로 만든 답 — 검색·검증이 실패했을 때 */
export function ocrOnlyAnswer(ocr: DocOcr): DocAnswer {
  return {
    summary: ocr.summary,
    points: ocr.fields.slice(0, 4).map((f, i) => ({ id: `f${i + 1}`, text: `${f.label}: ${f.value}`, cites: ['ocr'] })),
    actions: ACTIONS_BY_KIND[ocr.kind]
      .filter((k) => k === 'autopay' || k === 'ko_phrase' || k === 'human')
      .map((kind) => ({ kind, reason: '' })),
  }
}

class Stale extends Error {}

export function useDocAgent() {
  const { state, dispatch } = useStore()
  const run = state.docRun
  const runId = run?.status === 'running' ? run.runId : 0

  useEffect(() => {
    if (!runId || !run) return
    let alive = true
    const timers: ReturnType<typeof setTimeout>[] = []
    const lang = state.lang ?? 'ko'
    const question = run.question
    const image = getImage(runId)
    const t0 = Date.now()

    const post = async <T,>(body: Record<string, unknown>, timeoutMs: number): Promise<T> => {
      const r = await fetch(apiUrl('/api/doc-agent'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ lang, ...body }),
      })
      const d = await r.json().catch(() => null)
      if (!alive) throw new Stale()
      if (!r.ok || !d || d.error) throw new Error(d?.error ?? `HTTP ${r.status}`)
      return d as T
    }
    const wait = (ms: number) => new Promise<void>((res) => { timers.push(setTimeout(res, ms)) })

    const finish = async (answer: DocAnswer, source: NonNullable<DocRun['source']>, checkCount: number, fixedCount: number) => {
      dropImage(runId)
      dispatch({ type: 'DOC_VERIFIED', runId, answer, source, checkCount, fixedCount })
      await wait(STEP_MS)
      if (!alive) return
      dispatch({ type: 'DOC_PHASE', runId, phase: 'actions' })
      await wait(STEP_MS)
      if (!alive) return
      dispatch({ type: 'DOC_DONE', runId, latencyMs: Date.now() - t0 })
    }

    const go = async () => {
      if (!image) return dispatch({ type: 'DOC_ERROR', runId })

      // ① OCR
      let ocr: DocOcr
      try {
        ocr = await post<DocOcr>({ step: 'ocr', image }, 25_000)
      } catch (e) {
        if (e instanceof Stale) return
        dropImage(runId)
        return dispatch({ type: 'DOC_ERROR', runId })
      }
      dispatch({ type: 'DOC_OCR', runId, ocr })

      // ② RAG 검색 — 실패해도 원문 근거만으로 계속 간다
      let passages: DocPassage[] = []
      let failed = false
      try {
        const d = await post<{ passages?: DocPassage[] }>(
          { step: 'search', kind: ocr.kind, title: ocr.title, fields: ocr.fields, rawText: ocr.rawText, question },
          10_000,
        )
        passages = d.passages ?? []
      } catch (e) {
        if (e instanceof Stale) return
        failed = true
      }
      dispatch({ type: 'DOC_SEARCH', runId, passages, failed })

      // ③ CoVe — 초안
      const ids = passages.map((p) => p.id)
      const doc = { kind: ocr.kind, rawText: ocr.rawText, fields: ocr.fields, question, passageIds: ids }
      let draft: DocAnswer | null = null
      let checks: DocCheck[] = []
      try {
        const d = await post<Record<string, unknown>>({ step: 'draft', ...doc }, 20_000)
        draft = cleanAnswer(d, ocr.kind, ids)
        checks = cleanChecks(d.checks, draft?.points.map((p) => p.id) ?? [])
      } catch (e) {
        if (e instanceof Stale) return
      }
      if (!draft) return finish(ocrOnlyAnswer(ocr), 'ocr-only', 0, 0)
      if (!checks.length) return finish(draft, 'partly', 0, 0)

      // ③ CoVe — 독립 검증: 초안·기대값 없이 원본 사진과 자료로만 답한다
      let answers: DocVerifyAnswer[]
      try {
        const d = await post<{ answers?: DocVerifyAnswer[] }>(
          { step: 'verify', image, passageIds: ids, checks: verifyPayload(checks) },
          25_000,
        )
        answers = d.answers ?? []
      } catch (e) {
        if (e instanceof Stale) return
        return finish(ocrOnlyAnswer(ocr), 'ocr-only', 0, 0)
      }

      const mism = findMismatches(checks, answers)
      if (!mism.length) return finish(draft, 'verified', checks.length, 0)

      // ③ CoVe — 어긋났을 때만 수정
      try {
        const d = await post<Record<string, unknown>>(
          { step: 'revise', ...doc, draft, mismatches: mism.map(({ pointId, q, answer }) => ({ pointId, q, answer })) },
          20_000,
        )
        const fixed = cleanAnswer(d, ocr.kind, ids)
        if (fixed) return finish(fixed, 'verified', checks.length, mism.length)
      } catch (e) {
        if (e instanceof Stale) return
      }
      const kept = dropPoints(draft, mism.map((m) => m.pointId))
      return finish(kept ?? ocrOnlyAnswer(ocr), kept ? 'partly' : 'ocr-only', checks.length, mism.length)
    }
    void go()

    /* StrictMode 에서는 이 정리가 한 번 먼저 돈다 — 사진은 지우지 않는다(다음 실행이 쓴다) */
    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [runId]) // eslint-disable-line react-hooks/exhaustive-deps
}
```

`src/store.tsx` 는 `export type Action` 이 이미 export 되어 있다(없으면 `export` 를 붙인다).

`src/sim/Shell.tsx`·`src/sim/MobileShell.tsx`: `import { useDocAgent } from '../agent/useDocAgent'` 추가, `useOrchestrator()` 아래에서 `useDocAgent()` 호출.

- [ ] **Step 6: 확인**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
/opt/homebrew/bin/git add src/types.ts src/store.tsx src/store.test.ts src/agent/docImages.ts src/agent/useDocAgent.ts src/lib/image.ts src/sim/Shell.tsx src/sim/MobileShell.tsx
/opt/homebrew/bin/git commit -m "서류 에이전트 실행 상태와 5단계 훅(OCR·RAG·CoVe)"
```

### Task 17: 서류 카드 + 도움 화면 전환 (샘플 촬영 → 실제 파이프라인)

**Files:**
- Create: `src/app/DocRunCard.tsx`, `public/samples/gas-bill-2026-09.png`
- Modify: `src/app/screens/Record.tsx` (`Help`), `src/styles.css`, `src/i18n/{ko,en,id,vi,ne}.ts`
- Delete: `src/app/Bill.tsx`, `api/doc.ts`

- [ ] **Step 1: 샘플 이미지 복사**

```bash
mkdir -p public/samples
cp "../가스요금청구서_2026년09월분_샘플.png" public/samples/gas-bill-2026-09.png
```

(가상 청구서다 — 문서에 "SAMPLE · 테스트용 / 데모 테스트를 위해 생성된 가상의 청구서" 표기가 있다.)

- [ ] **Step 2: `src/app/DocRunCard.tsx`**

```tsx
import { useState } from 'react'
import { useApp } from './hooks'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { StepRow } from './AgentSteps'
import type { DocPhase } from '../types'
import type { DocActionKind } from '../agent/docRules'

/* 서류 에이전트 진행·결과 카드 — 도움 화면과 채팅이 같이 쓴다.
   앱 화면에는 OCR·RAG·CoVe 같은 말을 쓰지 않는다(쉬운 말 단계 이름). */

type Step = Exclude<DocPhase, 'done'>
const ORDER: Step[] = ['ocr', 'search', 'verify', 'answer', 'actions']
const LABEL: Record<Step, string> = {
  ocr: 'doc.step1', search: 'doc.step2', verify: 'doc.step3', answer: 'doc.step4', actions: 'doc.step5',
}

function statusOf(phase: DocPhase, k: Step): 'done' | 'running' | 'pending' {
  if (phase === 'done') return 'done'
  const i = ORDER.indexOf(k)
  const cur = ORDER.indexOf(phase)
  return i < cur ? 'done' : i === cur ? 'running' : 'pending'
}

export function DocRunCard({ origin, onNavigate }: { origin: 'help' | 'chat'; onNavigate?: () => void }) {
  const { state, dispatch, t } = useApp()
  const run = state.docRun
  const [open, setOpen] = useState<string | null>(null)
  const [done, setDone] = useState<Partial<Record<DocActionKind, boolean>>>({})
  const [showKo, setShowKo] = useState(false)
  if (!run || run.origin !== origin) return null

  if (run.status === 'error')
    return <div className="note amber"><Icon name="alert" size={16} strokeWidth={2} /><span>{t('help.failed')}</span></div>

  const ocr = run.ocr
  const passages = run.passages ?? []
  const sub: Partial<Record<Step, string>> = {
    ocr: ocr ? [t(`doc.kind.${ocr.kind}`), ocr.title].filter(Boolean).join(' · ') : undefined,
    search: run.passages
      ? passages.length
        ? passages.slice(0, 3).map((p) => p.title).join(' · ')
        : t(run.searchFailed ? 'doc.searchFail' : 'doc.noGuide')
      : undefined,
    verify: run.checkCount !== undefined ? t('doc.checked', { n: run.checkCount, m: run.fixedCount ?? 0 }) : undefined,
  }

  const citeLabel = (c: string) => (c === 'ocr' ? t('doc.srcOcr') : passages.find((p) => p.id === c)?.title ?? c)
  const citeBody = (c: string) => {
    if (c === 'ocr') return ocr?.rawText.slice(0, 160) ?? ''
    const p = passages.find((x) => x.id === c)
    return p ? `${p.snippet}… — ${p.source}` : ''
  }

  const act = (k: DocActionKind) => {
    if (k === 'ko_phrase') return setShowKo(!showKo)
    if (k === 'open_record') {
      dispatch({ type: 'NAV', screen: 'C1' })
      return onNavigate?.()
    }
    if (k === 'human') dispatch({ type: 'ESCALATE', reason: 'doc_question' })
    setDone({ ...done, [k]: true })
  }
  const doneNote: Partial<Record<DocActionKind, string>> = {
    autopay: t('help.autoPayDone'),
    due_reminder: t('doc.reminderDone'),
    human: t('doc.humanDone'),
  }

  const ans = run.status === 'done' ? run.answer : undefined

  return (
    <>
      <div className="think light">
        <div className="thinkHead">
          <Logo size={20} />
          <b className="wmk">ONNA</b>
          <span>{t('doc.analyzing')}</span>
        </div>
        {ORDER.map((k) => (
          <StepRow key={k} status={statusOf(run.phase, k)} label={t(LABEL[k])} sub={sub[k]} />
        ))}
      </div>

      {ans && ocr && (
        <div className="agentcard">
          <div className="who"><Logo size={24} /><b className="wmk">ONNA</b></div>
          <p className="say">{ocr.title ?? t(`doc.kind.${ocr.kind}`)}</p>
          <p className="why" style={{ fontSize: 14.5, color: 'var(--app-ink)', margin: '0 0 8px' }}>{ans.summary}</p>

          {(ocr.amount || ocr.dueDate || ocr.issuer) && (
            <div className="card" style={{ margin: '0 0 10px' }}>
              {ocr.amount && <div className="kv"><span className="k">{t('help.fAmount')}</span><span className="v">{ocr.amount}</span></div>}
              {ocr.dueDate && <div className="kv"><span className="k">{t('help.fDue')}</span><span className="v">{ocr.dueDate}</span></div>}
              {ocr.issuer && <div className="kv"><span className="k">{t('help.fIssuer')}</span><span className="v">{ocr.issuer}</span></div>}
            </div>
          )}

          <ul className="docPoints">
            {ans.points.map((pt) => (
              <li key={pt.id}>
                <span>{pt.text}</span>
                <span className="cites">
                  {pt.cites.map((c) => (
                    <button key={c} className={`citeChip ${c === 'ocr' ? 'ocr' : ''} ${open === pt.id + c ? 'on' : ''}`}
                      onClick={() => setOpen(open === pt.id + c ? null : pt.id + c)}>
                      <Icon name={c === 'ocr' ? 'scan' : 'doc'} size={11} strokeWidth={2.2} />{citeLabel(c)}
                    </button>
                  ))}
                </span>
                {pt.cites.map((c) => open === pt.id + c && <p className="citeBody" key={c}>{citeBody(c)}</p>)}
              </li>
            ))}
          </ul>

          {ocr.confidence === 'low' && (
            <div className="note amber" style={{ margin: '0 0 10px' }}>
              <Icon name="alert" size={15} strokeWidth={2} /><span>{t('help.lowConf')}</span>
            </div>
          )}

          {showKo && ocr.koPhrase && (
            <div className="card" style={{ margin: '0 0 10px' }}>
              <p style={{ fontSize: 14.5, color: 'var(--app-ink)', fontWeight: 600, lineHeight: 1.5 }}>“{ocr.koPhrase}”</p>
              <p style={{ marginTop: 6 }}>{t('help.koShow')}</p>
            </div>
          )}

          {ans.actions.length > 0 && (
            <div className="docActs">
              <b>{t('doc.step5')}</b>
              {ans.actions.map((a, i) => (
                <div key={a.kind} className="docAct">
                  <button className={`btn sm ${i === 0 ? 'agent' : 'ghost'}`} disabled={!!done[a.kind]} onClick={() => act(a.kind)}>
                    {t(`doc.act.${a.kind}`)}
                  </button>
                  {a.reason && <small>{a.reason}</small>}
                  {done[a.kind] && doneNote[a.kind] && (
                    <div className="note mint" style={{ margin: '6px 0 0' }}>
                      <Icon name="check" size={15} strokeWidth={2.4} /><span>{doneNote[a.kind]}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="reasonSrc" style={{ marginTop: 10 }}>
            {t(`doc.src.${run.source ?? 'ocr-only'}`, { sec: ((run.latencyMs ?? 0) / 1000).toFixed(1) })}
          </p>
          <p style={{ marginTop: 4, fontSize: 12, color: 'var(--app-muted)' }}>{t('help.aiNote')}</p>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: 도움 화면 교체** — `src/app/screens/Record.tsx`

- import 정리: `import { Bill, BILL } from '../Bill'`, `import { apiUrl } from '../../lib/api'`, `useRef` 는 그대로, `DocResult`·`downscale` 정의 삭제. 추가:

```ts
import { DocRunCard } from '../DocRunCard'
import { startDocRun } from '../../agent/useDocAgent'
import { downscale } from '../../lib/image'

/** 데모 촬영에 쓰는 가상 청구서 — 실제 파이프라인(OCR·검색·검증)에 그대로 들어간다 */
const SAMPLE_DOC = '/samples/gas-bill-2026-09.png'
```

- `export function Help() { … }` 전체를 아래로 바꾼다.

```tsx
/* HELP — C2: 서류 촬영·업로드 → 서류 에이전트(읽기·자료 찾기·다시 확인·근거 설명·다음 할 일), AG-6 사람 연결 */
export function Help() {
  const { state, dispatch, t } = useApp()
  const [cam, setCam] = useState<null | 'aim' | 'reading'>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const run = state.docRun?.origin === 'help' ? state.docRun : undefined
  const busy = state.docRun?.status === 'running'

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (!f || busy) return
    try {
      startDocRun(dispatch, await downscale(f), 'help')
    } catch {
      /* 읽을 수 없는 파일 — 아무것도 시작하지 않는다 */
    }
  }

  const shoot = async () => {
    if (cam === 'reading' || busy) return
    setCam('reading')
    try {
      const image = await downscale(await (await fetch(SAMPLE_DOC)).blob())
      setTimeout(() => {
        setCam(null)
        startDocRun(dispatch, image, 'help')
      }, 1200)
    } catch {
      setCam(null)
    }
  }

  return (
    <>
      <div className="appBody">
        <div className="h1">{t('help.title')}</div>

        {/* 서류 사진 찍어 물어보기 — 화면 최상단 */}
        {!run ? (
          <button className="dropzone" onClick={() => setCam('aim')}>
            <Icon name="camera" size={26} />
            <h4>{t('help.doc')}</h4>
            <p style={{ margin: 0, fontSize: 12.5 }}>{t('help.docS')}</p>
          </button>
        ) : (
          <>
            <DocRunCard origin="help" />
            {run.status !== 'running' && (
              <button className="btn ghost sm" style={{ width: '100%', marginBottom: 12 }} onClick={() => setCam('aim')}>
                <Icon name="camera" size={16} style={{ marginRight: 6 }} />{t('help.again')}
              </button>
            )}
          </>
        )}

        {/* 파일 올려서 물어보기 — 같은 서류 에이전트로 */}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <button className="card helpCard" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
          disabled={busy} onClick={() => fileRef.current?.click()}>
          <div className="ico"><Icon name="doc" size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>{t('help.upload')}</h4>
            <p>{busy ? t('help.analyzing') : t('help.uploadS')}</p>
          </div>
          {busy && <span className="dotsMini"><i /><i /><i /></span>}
        </button>

        <button className="card helpCard" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => dispatch({ type: 'ESCALATE', reason: 'help_request' })}>
          <div className="ico"><Icon name="phone" size={20} /></div>
          <div><h4>{t('help.human')}</h4><p>{t('help.humanS')}</p></div>
        </button>
        <div className="card helpCard" style={{ borderColor: 'var(--app-hold)' }}>
          <div className="ico" style={{ background: 'var(--app-hold-tint)', color: 'var(--app-hold)' }}><Icon name="alert" size={20} /></div>
          <div><h4>{t('help.phish')}</h4><p>{t('help.phishS')}</p></div>
        </div>
      </div>

      {/* 서류 촬영 시트 — 데모는 가상 청구서를 찍는다 */}
      {cam && (
        <div className="micSheetBack" onClick={() => cam === 'aim' && setCam(null)}>
          <div className="docSheet" onClick={(e) => e.stopPropagation()}>
            <div className="chatHead">
              <b>{t('help.scanTitle')}</b>
              <button className="chatClose" aria-label={t('common.close')} onClick={() => setCam(null)}><Icon name="close" size={17} /></button>
            </div>
            <div className="cam" style={{ height: 300 }}>
              <div className="frame" />
              {cam === 'reading' && <div className="billWrap"><img className="docSample" src={SAMPLE_DOC} alt="" /></div>}
              {cam === 'reading' && <div className="scanline" />}
              <span>{cam === 'reading' ? t('help.reading') : t('help.scanGuide')}</span>
            </div>
            <button className="btn agent" onClick={shoot} disabled={cam === 'reading' || busy}>
              {cam === 'reading'
                ? t('help.reading')
                : <><Icon name="camera" size={18} style={{ marginRight: 8 }} />{t('help.shoot')}</>}
            </button>
          </div>
        </div>
      )}

      <NavBar active="help" />
    </>
  )
}
```

- `git rm src/app/Bill.tsx api/doc.ts`
- `src/styles.css`: `.bill {` 부터 `.bill .blFoot { … }` 까지의 `.bill` 규칙들을 지운다(`.billWrap` 은 남긴다). 주석 `/* 전기요금 고지서 목업 — C2 서류 촬영 데모 */` 는 `/* 서류 촬영 데모 — 가상 청구서 이미지 */` 로 바꾼다. 그리고 끝에 추가:

```css
.docSample { max-height: 100%; max-width: 100%; border-radius: 3px; box-shadow: 0 12px 26px rgba(0,0,0,.55); display: block; }

/* 서류 결과 — 근거가 달린 항목 */
.docPoints { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.docPoints li { font-size: 14px; line-height: 1.45; color: var(--app-ink); padding-left: 12px; position: relative; }
.docPoints li::before { content: ''; position: absolute; left: 0; top: .55em; width: 5px; height: 5px; border-radius: 50%; background: var(--app-agent); }
.docPoints .cites { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
.citeChip {
  display: inline-flex; align-items: center; gap: 4px; max-width: 100%;
  border: 1px solid var(--app-agent-line); background: var(--app-card); color: var(--app-agent-ink);
  border-radius: 999px; padding: 2px 8px; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.citeChip.ocr { color: var(--app-primary-press); border-color: var(--app-line); }
.citeChip.on { background: var(--app-agent-tint); }
.citeBody { margin: 5px 0 0; padding: 7px 9px; border-radius: 9px; background: var(--app-card); border: 1px dashed var(--app-agent-line); font-size: 12px; color: var(--app-muted); line-height: 1.45; overflow-wrap: anywhere; }
.docActs { border-top: 1px solid var(--app-agent-line); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.docActs > b { font-size: 12px; color: var(--app-agent-ink); }
.docAct small { display: block; margin-top: 3px; font-size: 12px; color: var(--app-muted); }
```

- [ ] **Step 4: 문구 5개 언어** — 끝에 추가

ko:
```ts
  'doc.analyzing': '서류를 살펴보고 있어요',
  'doc.step1': '서류 읽기',
  'doc.step2': '안내 자료 찾기',
  'doc.step3': '다시 확인하기',
  'doc.step4': '근거와 함께 설명',
  'doc.step5': '다음 할 일',
  'doc.noGuide': '맞는 안내 자료가 아직 없어요',
  'doc.searchFail': '안내 자료를 찾지 못했어요',
  'doc.checked': '확인 질문 {n}개 · 고친 곳 {m}개',
  'doc.srcOcr': '서류 원문',
  'doc.src.verified': '서류와 안내 자료로 다시 확인했어요 · {sec}초',
  'doc.src.partly': '확인된 내용만 보여 드려요 · {sec}초',
  'doc.src.ocr-only': '서류에서 읽은 내용만 보여 드려요',
  'doc.act.autopay': '자동이체 걸기',
  'doc.act.due_reminder': '납기일 알림 받기',
  'doc.act.ko_phrase': '한국어로 물어볼 문장',
  'doc.act.human': '사람과 이야기하기',
  'doc.act.open_record': '내 기록 보기',
  'doc.reminderDone': '납기일 전에 알려 드릴게요.',
  'doc.humanDone': '한국어 상담원 연결을 요청했어요.',
  'doc.kind.utility_bill': '공과금 고지서',
  'doc.kind.payslip': '급여명세서',
  'doc.kind.contract': '근로계약서',
  'doc.kind.bank_doc': '은행 서류',
  'doc.kind.residence_card': '외국인등록증',
  'doc.kind.receipt': '영수증',
  'doc.kind.mail': '안내 우편',
  'doc.kind.unknown': '서류',
  'doc.ask': '서류 사진을 올려 주시면 읽고 설명해 드릴게요.',
  'doc.attach': '사진 올리기',
```
en:
```ts
  'doc.analyzing': 'Looking at your document',
  'doc.step1': 'Read the document',
  'doc.step2': 'Find guide material',
  'doc.step3': 'Check again',
  'doc.step4': 'Explain with sources',
  'doc.step5': 'What to do next',
  'doc.noGuide': 'No matching guide material yet',
  'doc.searchFail': 'Could not look up guide material',
  'doc.checked': '{n} checks · {m} fixed',
  'doc.srcOcr': 'Your document',
  'doc.src.verified': 'Checked again against your document and guides · {sec}s',
  'doc.src.partly': 'Showing only what was confirmed · {sec}s',
  'doc.src.ocr-only': 'Showing only what was read from your document',
  'doc.act.autopay': 'Set up automatic payment',
  'doc.act.due_reminder': 'Remind me before the due date',
  'doc.act.ko_phrase': 'A sentence to ask in Korean',
  'doc.act.human': 'Talk to a person',
  'doc.act.open_record': 'See my record',
  'doc.reminderDone': 'I will remind you before the due date.',
  'doc.humanDone': 'I asked for a Korean-speaking staff member to help you.',
  'doc.kind.utility_bill': 'Utility bill',
  'doc.kind.payslip': 'Payslip',
  'doc.kind.contract': 'Work contract',
  'doc.kind.bank_doc': 'Bank document',
  'doc.kind.residence_card': 'Residence card',
  'doc.kind.receipt': 'Receipt',
  'doc.kind.mail': 'Notice letter',
  'doc.kind.unknown': 'Document',
  'doc.ask': 'Please send a photo of the paper and I will read and explain it.',
  'doc.attach': 'Add a photo',
```
id:
```ts
  'doc.analyzing': 'Sedang memeriksa dokumen Anda',
  'doc.step1': 'Membaca dokumen',
  'doc.step2': 'Mencari bahan panduan',
  'doc.step3': 'Memeriksa ulang',
  'doc.step4': 'Menjelaskan dengan sumber',
  'doc.step5': 'Langkah berikutnya',
  'doc.noGuide': 'Belum ada bahan panduan yang cocok',
  'doc.searchFail': 'Bahan panduan tidak dapat dicari',
  'doc.checked': '{n} pertanyaan cek · {m} diperbaiki',
  'doc.srcOcr': 'Dokumen Anda',
  'doc.src.verified': 'Sudah dicek ulang dengan dokumen dan panduan · {sec} detik',
  'doc.src.partly': 'Hanya menampilkan yang sudah dipastikan · {sec} detik',
  'doc.src.ocr-only': 'Hanya menampilkan yang terbaca dari dokumen',
  'doc.act.autopay': 'Pasang bayar otomatis',
  'doc.act.due_reminder': 'Ingatkan sebelum jatuh tempo',
  'doc.act.ko_phrase': 'Kalimat untuk bertanya dalam bahasa Korea',
  'doc.act.human': 'Bicara dengan petugas',
  'doc.act.open_record': 'Lihat catatan saya',
  'doc.reminderDone': 'Saya akan mengingatkan sebelum jatuh tempo.',
  'doc.humanDone': 'Saya sudah meminta petugas berbahasa Korea untuk membantu.',
  'doc.kind.utility_bill': 'Tagihan utilitas',
  'doc.kind.payslip': 'Slip gaji',
  'doc.kind.contract': 'Kontrak kerja',
  'doc.kind.bank_doc': 'Dokumen bank',
  'doc.kind.residence_card': 'Kartu izin tinggal',
  'doc.kind.receipt': 'Kuitansi',
  'doc.kind.mail': 'Surat pemberitahuan',
  'doc.kind.unknown': 'Dokumen',
  'doc.ask': 'Silakan kirim foto kertasnya, saya akan membaca dan menjelaskannya.',
  'doc.attach': 'Tambah foto',
```
vi:
```ts
  'doc.analyzing': 'Đang xem giấy tờ của quý khách',
  'doc.step1': 'Đọc giấy tờ',
  'doc.step2': 'Tìm tài liệu hướng dẫn',
  'doc.step3': 'Kiểm tra lại',
  'doc.step4': 'Giải thích kèm nguồn',
  'doc.step5': 'Việc nên làm tiếp',
  'doc.noGuide': 'Chưa có tài liệu hướng dẫn phù hợp',
  'doc.searchFail': 'Không tìm được tài liệu hướng dẫn',
  'doc.checked': '{n} câu kiểm tra · sửa {m} chỗ',
  'doc.srcOcr': 'Giấy tờ của quý khách',
  'doc.src.verified': 'Đã kiểm tra lại với giấy tờ và tài liệu · {sec} giây',
  'doc.src.partly': 'Chỉ hiển thị nội dung đã xác nhận · {sec} giây',
  'doc.src.ocr-only': 'Chỉ hiển thị nội dung đọc được từ giấy tờ',
  'doc.act.autopay': 'Đăng ký tự động thanh toán',
  'doc.act.due_reminder': 'Nhắc trước hạn nộp',
  'doc.act.ko_phrase': 'Câu hỏi bằng tiếng Hàn',
  'doc.act.human': 'Nói chuyện với nhân viên',
  'doc.act.open_record': 'Xem hồ sơ của tôi',
  'doc.reminderDone': 'Tôi sẽ nhắc quý khách trước hạn nộp ạ.',
  'doc.humanDone': 'Tôi đã yêu cầu nhân viên nói tiếng Hàn hỗ trợ quý khách ạ.',
  'doc.kind.utility_bill': 'Hóa đơn tiện ích',
  'doc.kind.payslip': 'Phiếu lương',
  'doc.kind.contract': 'Hợp đồng lao động',
  'doc.kind.bank_doc': 'Giấy tờ ngân hàng',
  'doc.kind.residence_card': 'Thẻ cư trú',
  'doc.kind.receipt': 'Biên lai',
  'doc.kind.mail': 'Thư thông báo',
  'doc.kind.unknown': 'Giấy tờ',
  'doc.ask': 'Quý khách gửi ảnh tờ giấy, tôi sẽ đọc và giải thích ạ.',
  'doc.attach': 'Thêm ảnh',
```
ne:
```ts
  'doc.analyzing': 'तपाईंको कागज हेर्दै',
  'doc.step1': 'कागज पढ्ने',
  'doc.step2': 'मार्गदर्शन सामग्री खोज्ने',
  'doc.step3': 'फेरि जाँच्ने',
  'doc.step4': 'स्रोतसहित बुझाउने',
  'doc.step5': 'अब के गर्ने',
  'doc.noGuide': 'मिल्ने मार्गदर्शन सामग्री अझै छैन',
  'doc.searchFail': 'मार्गदर्शन सामग्री खोज्न सकिएन',
  'doc.checked': 'जाँच प्रश्न {n} · सच्याइएको {m}',
  'doc.srcOcr': 'तपाईंको कागज',
  'doc.src.verified': 'कागज र मार्गदर्शनसँग फेरि जाँचियो · {sec} सेकेन्ड',
  'doc.src.partly': 'पक्का भएको कुरा मात्र देखाइएको · {sec} सेकेन्ड',
  'doc.src.ocr-only': 'कागजबाट पढिएको कुरा मात्र देखाइएको',
  'doc.act.autopay': 'स्वचालित भुक्तानी राख्ने',
  'doc.act.due_reminder': 'म्याद अगाडि सम्झाउने',
  'doc.act.ko_phrase': 'कोरियालीमा सोध्ने वाक्य',
  'doc.act.human': 'मानिससँग कुरा गर्ने',
  'doc.act.open_record': 'मेरो रेकर्ड हेर्ने',
  'doc.reminderDone': 'म्याद अगाडि सम्झाउनेछु।',
  'doc.humanDone': 'कोरियाली बोल्ने कर्मचारीलाई सहयोगका लागि अनुरोध गरेँ।',
  'doc.kind.utility_bill': 'बिल',
  'doc.kind.payslip': 'तलब विवरण',
  'doc.kind.contract': 'काम सम्झौता',
  'doc.kind.bank_doc': 'बैंक कागज',
  'doc.kind.residence_card': 'बसोबास कार्ड',
  'doc.kind.receipt': 'रसिद',
  'doc.kind.mail': 'सूचना पत्र',
  'doc.kind.unknown': 'कागज',
  'doc.ask': 'कागजको फोटो पठाउनुहोस्, म पढेर बुझाइदिन्छु।',
  'doc.attach': 'फोटो थप्ने',
```

- [ ] **Step 5: 확인**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 통과. `grep -rn "api/doc'\|from '../Bill'" src` 결과 없음.

- [ ] **Step 6: 커밋**

```bash
/opt/homebrew/bin/git rm -q src/app/Bill.tsx api/doc.ts
/opt/homebrew/bin/git add src/app/DocRunCard.tsx src/app/screens/Record.tsx public/samples/gas-bill-2026-09.png src/styles.css src/i18n/ko.ts src/i18n/en.ts src/i18n/id.ts src/i18n/vi.ts src/i18n/ne.ts
/opt/homebrew/bin/git commit -m "도움 화면을 서류 에이전트로 — 샘플 청구서 촬영·업로드 → 5단계 카드"
```

# Phase E — 채팅 UI · 마무리 · 검증

### Task 18: 채팅 시트 분리 — 라우팅 안내 · 에이전트 카드 · 사진 첨부

**Files:**
- Create: `src/app/Chat.tsx`
- Modify: `src/app/Phone.tsx`, `src/styles.css`, `src/i18n/{ko,en,id,vi,ne}.ts`
- Delete: `api/agent.ts`

- [ ] **Step 1: `src/app/Chat.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useApp, useCredit } from './hooks'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { StepRow, ThinkingCard } from './AgentSteps'
import { RemitProposalCard } from './RemitCard'
import { DocRunCard } from './DocRunCard'
import { startDocRun } from '../agent/useDocAgent'
import { downscale } from '../lib/image'
import type { ChatAction, ChatItem } from '../types'

/* 에이전트 채팅 — 사용자 질문(chat) → 오케스트레이터(의도 분석 → Task 분업) →
   송금·서류·신용 도우미 카드. 실행은 항상 카드/화면의 확인 단계를 거친다 (AG-3) */

export function ChatSheet({ onClose }: { onClose: () => void }) {
  const { state, dispatch, t } = useApp()
  const [draft, setDraft] = useState('')
  const msgsRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const typing = state.orch?.status === 'running'
  const docBusy = state.docRun?.status === 'running'

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.chat.length, typing, state.analysis?.phase, state.docRun?.phase])

  const ask = (raw?: string) => {
    const text = (raw ?? draft).trim()
    if (!text || typing) return
    setDraft('')
    dispatch({ type: 'CHAT_ASK', text })
  }

  const lastQuestion = () => [...state.chat].reverse().find((m) => m.who === 'user')?.text

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || docBusy) return
    try {
      startDocRun(dispatch, await downscale(f), 'chat', draft.trim() || (lastQuestion() as string | undefined))
      setDraft('')
    } catch {
      /* 읽을 수 없는 파일 */
    }
  }

  const runAction = (a: ChatAction) => {
    if (a.escalate) dispatch({ type: 'ESCALATE', reason: 'chat_request' })
    if (a.screen) {
      dispatch({ type: 'NAV', screen: a.screen })
      onClose()
    }
  }

  return (
    <div className="micSheetBack" onClick={onClose}>
      <div className="chatSheet" onClick={(e) => e.stopPropagation()}>
        <div className="chatHead">
          <Logo size={24} />
          <b className="wmk">ONNA</b>
          <button className="chatClose" aria-label={t('common.close')} onClick={onClose}><Icon name="close" size={17} /></button>
        </div>
        <div className="chatMsgs" ref={msgsRef}>
          <div className="bubble agent">{t('chat.hello')}</div>
          {state.chat.map((m) => (
            <ChatRow key={m.id} m={m} onClose={onClose} onAttach={() => fileRef.current?.click()} runAction={runAction} />
          ))}
          {typing && <div className="bubble agent typing"><i /><i /><i /></div>}
        </div>
        <div className="chatChips">
          {[t('chat.s1'), t('chat.s2'), t('chat.s3')].map((sug) => (
            <button key={sug} disabled={typing} onClick={() => ask(sug)}>{sug}</button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        <div className="chatInputRow">
          <button className="attachBtn" aria-label={t('doc.attach')} disabled={docBusy} onClick={() => fileRef.current?.click()}>
            <Icon name="camera" size={19} />
          </button>
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) ask() }}
            placeholder={t('chat.ph')} />
          <button className="sendBtn" aria-label={t('chat.title')} disabled={typing} onClick={() => ask()}><Icon name="send" size={18} /></button>
        </div>
      </div>
    </div>
  )
}

function ChatRow({ m, onClose, onAttach, runAction }: {
  m: ChatItem
  onClose: () => void
  onAttach: () => void
  runAction: (a: ChatAction) => void
}) {
  const { state, t } = useApp()
  if (m.who === 'user') return <div className="bubble user">{m.text}</div>
  switch (m.kind) {
    case 'text':
      return (
        <div className="bubble agent">
          {m.text}
          {m.action && (
            <button className="btn agent sm" style={{ marginTop: 8 }} onClick={() => runAction(m.action!)}>{t(m.action.labelKey)}</button>
          )}
        </div>
      )
    case 'route':
      return (
        <div className="routeRow">
          <Icon name="sparkle" size={14} />
          <span>{t('orch.route', { who: m.agents.map((a) => t(`orch.agent.${a}`)).join(' · ') })}</span>
        </div>
      )
    case 'remit':
      return <div className="chatCard"><RemitChatCard runId={m.runId} onClose={onClose} /></div>
    case 'docAsk':
      return (
        <div className="bubble agent">
          {t('doc.ask')}
          <button className="btn agent sm" style={{ marginTop: 8 }} disabled={state.docRun?.status === 'running'} onClick={onAttach}>
            <Icon name="camera" size={16} style={{ marginRight: 6 }} />{t('doc.attach')}
          </button>
        </div>
      )
    case 'doc':
      return (
        <div className="chatCard">
          {state.docRun?.runId === m.runId
            ? <DocRunCard origin="chat" onNavigate={onClose} />
            : <div className="bubble agent">{t('chat.docOld')}</div>}
        </div>
      )
    case 'credit':
      return <div className="chatCard"><CreditChatCard onClose={onClose} /></div>
  }
}

/** 채팅 송금 카드 — 분석 중이면 단계, 끝나면 제안 카드 */
function RemitChatCard({ runId, onClose }: { runId: number; onClose: () => void }) {
  const { state, t } = useApp()
  const an = state.analysis
  if (!an || an.startedAt !== runId) return <div className="bubble agent">{t('chat.remitOld')}</div>
  if (an.status === 'running') return <ThinkingCard variant="light" />
  if (state.proposal?.status === 'new') return <RemitProposalCard onDone={onClose} />
  return <div className="bubble agent">{t('chat.remitHandled')}</div>
}

/** 기록·신용 도우미 — 거래 DB → 신용 확인 → 한도 안내. 코드만으로 그린다 */
function CreditChatCard({ onClose }: { onClose: () => void }) {
  const { dispatch, t, krw } = useApp()
  const cr = useCredit()
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= 3) return
    const id = setTimeout(() => setStep(step + 1), 350)
    return () => clearTimeout(id)
  }, [step])
  const go = (screen: 'D1' | 'C1') => () => {
    dispatch({ type: 'NAV', screen })
    onClose()
  }
  return (
    <div className="think light">
      <div className="thinkHead">
        <Logo size={20} />
        <b className="wmk">ONNA</b>
        <span>{t('orch.agent.credit')}</span>
      </div>
      {['credit.step1', 'credit.step2', 'credit.step3'].map((k, i) => (
        <StepRow key={k} label={t(k)} status={i < step ? 'done' : i === step ? 'running' : 'pending'} />
      ))}
      {step >= 3 && (
        <div className="creditResult">
          <div className="meter"><i style={{ width: `${Math.round((Math.min(cr.creditMonths, 6) / 6) * 100)}%` }} /></div>
          {/* 대출 게이트 — 준비 전에는 한도·금리를 보여 주지 않는다 */}
          {cr.ready ? (
            <>
              <p>{t('credit.readyLine', { limit: krw(cr.limit), rate: cr.rate })}</p>
              <button className="btn agent sm" onClick={go('D1')}>{t('credit.newsGo')}</button>
            </>
          ) : (
            <>
              <p>{t('credit.left', { m: cr.creditMonths, k: cr.monthsToCredit })}</p>
              <button className="btn ghost sm" onClick={go('C1')}>{t('chat.goRecord')}</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `Phone.tsx` 정리**

- 지울 것:
  - `KW`, `parseAmount`, `ChatMsg` 타입, `reply`, `toMsg`, `send`, `runAction`
  - `msgs`·`typing`·`draftText`·`msgsRef` 상태와 관련 `useEffect` 두 개(`chat.hello` 넣기, 스크롤)
  - 채팅 시트 JSX 블록 전체
- 지울 import: `FX, fmtRate, fxAdvantagePct`, `assessCredit`, `summarizeSpending`, `apiUrl`, `useRef`, `Logo` (시트 안에서만 쓰였다면).
- 추가: `import { ChatSheet } from './Chat'`.
- `const fx = FX[p.currency]` 줄도 지운다. `useApp()` 구조 분해는 `{ state, dispatch, p, t }` 만 남긴다.
- 채팅 시트 자리에 넣는다.

```tsx
        {/* 에이전트 채팅 — 오케스트레이터가 송금·서류·신용 도우미에게 일을 나눈다 */}
        {chatOpen && <ChatSheet onClose={() => setChatOpen(false)} />}
```

- `git rm api/agent.ts`

- [ ] **Step 3: 스타일** — `src/styles.css` 끝

```css
/* 채팅 — 오케스트레이터 라우팅 안내 · 에이전트 카드 · 사진 첨부 */
.routeRow {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 999px; background: var(--app-primary-tint);
  color: var(--app-primary-press); font-size: 12px; font-weight: 700;
}
.screen.dark .routeRow { color: var(--app-primary); }
.chatCard { align-self: stretch; }
.chatCard .agentcard, .chatCard .think { margin: 0; }
.chatCard .think + .agentcard { margin-top: 8px; }
.attachBtn {
  width: 46px; height: 46px; flex: none; border: 1px solid var(--app-line); border-radius: 50%;
  background: var(--app-card); color: var(--app-ink); display: flex; align-items: center; justify-content: center;
}
.attachBtn:disabled, .sendBtn:disabled, .chatChips button:disabled { opacity: .5; }
.creditResult { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--app-line); }
.creditResult p { margin: 6px 0 8px; font-size: 13.5px; line-height: 1.45; }
```

- [ ] **Step 4: 문구 5개 언어** — `chat.hello`·`chat.s1~s3` 의 **값을 바꾸고**, 새 키를 끝에 추가

| 키 | ko | en | id | vi | ne |
|---|---|---|---|---|---|
| `chat.hello` (값 교체) | 안녕하세요! 무엇을 도와드릴까요? 송금, 서류, 기록·대출, 환율을 도와드릴 수 있어요. | Hello! How can I help? I can help with sending money, papers, your record and loans, and exchange rates. | Halo! Ada yang bisa saya bantu? Saya bisa membantu kirim uang, dokumen, catatan dan pinjaman, serta kurs. | Xin chào quý khách! Tôi có thể giúp gửi tiền, giấy tờ, hồ sơ và khoản vay, và tỷ giá ạ. | नमस्ते! के सहयोग गरूँ? पैसा पठाउने, कागज, रेकर्ड र ऋण, विनिमय दरमा सहयोग गर्न सक्छु। |
| `chat.s1` (값 교체) | 50만 원 보내줘 | Send 500,000 won | Kirim 500.000 won | Gửi 500.000 won | 500,000 वन पठाउनुहोस् |
| `chat.s2` (값 교체) | 이 고지서 뭐예요? | What is this bill? | Tagihan ini apa? | Hóa đơn này là gì? | यो बिल के हो? |
| `chat.s3` (값 교체) | 대출 받을 수 있어요? | Can I get a loan? | Bisakah saya meminjam? | Tôi có vay được không? | मैले ऋण पाउन सक्छु? |
| `chat.remitOld` | 이 송금안은 새 제안으로 바뀌었어요. | This plan was replaced by a newer one. | Rencana ini sudah diganti yang baru. | Phương án này đã được thay bằng đề xuất mới ạ. | यो योजना नयाँ प्रस्तावले बदलियो। |
| `chat.remitHandled` | 이 송금안은 처리했어요. | This plan has been handled. | Rencana ini sudah diproses. | Phương án này đã được xử lý ạ. | यो योजना सम्हालियो। |
| `chat.docOld` | 이 서류 설명은 새 서류로 바뀌었어요. | This explanation was replaced by a newer document. | Penjelasan ini sudah diganti dokumen baru. | Phần giải thích này đã được thay bằng giấy tờ mới ạ. | यो व्याख्या नयाँ कागजले बदलियो। |
| `orch.route` | 온나가 {who}에게 맡겼어요 | ONNA handed this to {who} | ONNA menyerahkan ke {who} | ONNA đã giao cho {who} | ONNA ले {who} लाई सुम्पियो |
| `orch.agent.remit` | 송금 도우미 | the sending helper | pembantu kirim uang | trợ lý gửi tiền | पैसा पठाउने सहयोगी |
| `orch.agent.doc` | 서류 도우미 | the paper helper | pembantu dokumen | trợ lý giấy tờ | कागज सहयोगी |
| `orch.agent.credit` | 기록·신용 도우미 | the record and credit helper | pembantu catatan dan kredit | trợ lý hồ sơ và tín dụng | रेकर्ड र ऋण सहयोगी |
| `orch.agent.general` | 온나 | ONNA | ONNA | ONNA | ONNA |
| `orch.handoff` | 알맞은 도우미에게 맡길게요. 잠시만요. | I'll pass this to the right helper. One moment. | Saya serahkan ke pembantu yang tepat. Sebentar ya. | Tôi sẽ giao cho trợ lý phù hợp. Xin chờ một chút ạ. | उपयुक्त सहयोगीलाई सुम्पिन्छु। एकछिन पर्खनुहोस्। |
| `credit.step1` | 거래 기록 모으기 | Gather transaction records | Mengumpulkan catatan transaksi | Thu thập lịch sử giao dịch | कारोबार रेकर्ड जम्मा गर्ने |
| `credit.step2` | 신용 확인 | Check credit | Memeriksa kredit | Kiểm tra tín dụng | ऋण योग्यता जाँच्ने |
| `credit.step3` | 한도·금리 안내 | Show limit and rate | Menunjukkan batas dan bunga | Báo hạn mức và lãi suất | सीमा र ब्याज बताउने |
| `credit.left` | 확인된 기록이 {m}개월이에요. 대출까지 {k}개월 남았어요. 준비되면 알려 드릴게요. | You have {m} months of confirmed record. {k} more months until a loan. I'll tell you when it's ready. | Catatan terkonfirmasi Anda {m} bulan. Tinggal {k} bulan lagi sampai bisa meminjam. Saya kabari saat siap. | Hồ sơ đã xác nhận của quý khách là {m} tháng. Còn {k} tháng nữa mới vay được. Khi sẵn sàng tôi sẽ báo ạ. | पक्का भएको रेकर्ड {m} महिना छ। ऋणसम्म {k} महिना बाँकी छ। तयार भएपछि भन्नेछु। |
| `credit.readyLine` | 지금 {limit}까지 빌릴 수 있어요. 연 금리는 {rate}%예요. | You can borrow up to {limit} now, at {rate}% a year. | Sekarang Anda bisa meminjam sampai {limit}, bunga {rate}% per tahun. | Hiện quý khách có thể vay tối đa {limit}, lãi suất {rate}%/năm ạ. | अहिले {limit} सम्म ऋण लिन सकिन्छ, वार्षिक ब्याज {rate}%। |

`chat.s1` 는 5개 언어 모두 **금액이 파싱되는 형태**여야 한다(폴백 분류가 금액을 읽는다). 위 표기가 그렇다.

- [ ] **Step 5: 확인**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 통과. `grep -rn "/api/agent'" src` 결과 없음.

- [ ] **Step 6: 커밋**

```bash
/opt/homebrew/bin/git rm -q api/agent.ts
/opt/homebrew/bin/git add src/app/Chat.tsx src/app/Phone.tsx src/styles.css src/i18n/ko.ts src/i18n/en.ts src/i18n/id.ts src/i18n/vi.ts src/i18n/ne.ts
/opt/homebrew/bin/git commit -m "채팅을 오케스트레이터 흐름으로 — 라우팅 안내·송금/서류/신용 카드·사진 첨부"
```

### Task 19: 데이터 출처 표시 · 문서 갱신

**Files:**
- Modify: `src/sim/DataStatus.tsx`, `README.md`, `docs/superpowers/specs/2026-09-17-agent-orchestration-design.md`

- [ ] **Step 1: `DataStatus.tsx`** — `rows` 배열의 '송금 분석' 항목 아래에 추가하고 `useStore().state` 를 통째로 쓴다

```tsx
export function DataStatus() {
  const { analysis: an, docRun: doc, orch } = useStore().state
```

```ts
    {
      label: '의도 분석',
      live: orch?.status === 'done',
      note: !orch ? '대기' : orch.status === 'running' ? '분석 중' : '완료',
    },
    {
      label: '서류 분석',
      live: doc?.status === 'done' && doc.source !== 'ocr-only',
      note: !doc
        ? '대기'
        : doc.status === 'running'
          ? '분석 중'
          : doc.status === 'error'
            ? '실패'
            : `${doc.source === 'verified' ? '검증 완료' : doc.source === 'partly' ? '일부 확인' : '원문만'} · ${((doc.latencyMs ?? 0) / 1000).toFixed(1)}초`,
    },
    {
      label: '문서 검색',
      live: !!doc?.passages?.length,
      note: !doc?.passages ? '대기' : doc.searchFailed ? '연결 실패' : `${doc.passages.length}건`,
    },
```

> '의도 분석' 은 LLM/폴백 구분을 스토어가 들고 있지 않다. 필요하면 `Orchestration` 에 `source?: 'llm' | 'template'` 을 넣고 `ORCH_DONE` 에서 채운 뒤 `live` 를 `orch?.source === 'llm'` 으로 바꾼다 — **이 태스크에서 같이 한다**(타입·리듀서 한 줄씩, `store.test.ts` 의 ORCH_DONE 테스트에 `expect(s2.orch?.source).toBe('llm')` 추가).

- [ ] **Step 2: README** — `## 구성` 표 아래에 추가

```md
## 에이전트 워크플로우 (2026-09-17)

`docs/superpowers/specs/2026-09-17-agent-orchestration-design.md` 참고.

- **오케스트레이터**: 채팅 질문 → `/api/orchestrate` 의도 분석 → Task 분업(송금·서류·신용·일반, 최대 2개). 실패하면 키워드로 폴백.
- **송금 에이전트**: 급여 입금 웹훅(직행) 또는 채팅.
  - 단계: ① 입출금·환율 흔들림 → ② 상황 판단(코드) → ③ 송금안(`/api/remit-plan` + 규칙 엔진) → ④ 이유 설명 → ⑤ 승인 → ⑥ 타이밍 결정(지금·나눠서·예약, 코드) → ⑦ 실행 → 거래 DB.
- **서류 에이전트** (`/api/doc-agent`)
  - 단계: ① OCR → ② RAG 검색(Supabase pgvector) → ③ CoVe(초안 → 원본 사진으로 독립 검증 → 어긋나면 수정) → ④ 근거 달린 답 → ⑤ 허용된 다음 행동.
- **데이터·신용**: 원장의 검증된 기록으로 신용 산정(`src/agent/credit.ts`). 급여·송금이 기록되면 대출 가능/한도 증가 알림.
- **데모 콘솔**: 환율 상황(실제/흔들림/낮음) · 예약일 도래.

### 문서 Vector DB (Supabase)

`.env.local` 에 필요한 값:
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — 런타임 RPC. Vercel env 에도 넣는다.
- `SUPABASE_DB_URL` — 스크립트 전용. Transaction pooler 주소를 쓴다.

```bash
npm run db:migrate   # 스키마·RPC 적용 (한 번)
npm run guide:check     # 공개 키 권한 확인
npm run guide:ingest    # guides/ 의 안내 자료 적재 — guides/README.md
```
```

`## 미구현` 줄의 `C2 서류 OCR(스텁)` 을 지운다.

- [ ] **Step 3: 스펙 갱신** — `docs/superpowers/specs/2026-09-17-agent-orchestration-design.md`

- "상태·개인정보"의 `이미지 data URL 은 … **OCR 호출 직후 지운다.**` 를 아래로 바꾼다.

  > 이미지 data URL 은 스토어에 넣지 않고 모듈 수준 `Map<runId, dataUrl>` 에 둔다. **독립 검증(verify)이 원본 사진을 다시 읽기 때문에 실행이 끝날 때 지운다.**
  > 변경 이유: OCR 에서 원문 전체를 뽑으면 출력 토큰 때문에 20초를 넘겼다(설계 단계 추산). 그래서 OCR 은 주요 줄 600자만 뽑고, 검증은 원본 사진으로 한다.

- 계약의 `// step: verify 요청 { lang, rawText, passageIds, checks: [{id, q, type}] }` 를 `// step: verify 요청 { lang, image, passageIds, checks: [{id, q, type}] }  ← 원본 사진으로 확인, 초안·expect 는 보내지 않는다` 로 바꾼다.
- OCR 계약의 `rawText: maskPii 후 최대 4,000자` 를 `rawText: 주요 줄, maskPii 후 최대 800자` 로 바꾼다.
- 폴백 표의 source 값을 `verified | partly | ocr-only` 로 맞춘다(`full` 표기 삭제).

- [ ] **Step 4: 확인 · 커밋**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
/opt/homebrew/bin/git add src/sim/DataStatus.tsx src/types.ts src/store.tsx src/store.test.ts README.md docs/superpowers/specs/2026-09-17-agent-orchestration-design.md
/opt/homebrew/bin/git commit -m "데이터 출처에 의도·서류·검색 상태 + README·스펙 갱신"
```

### Task 20: 실측 검증 (엔드포인트 · Supabase · 브라우저)

**Files:**
- Create: `guides-test/sources.json`, `guides-test/gas-bill-test.md` (커밋하지 않음 — `.gitignore` 의 `guides-test/`)

- [ ] **Step 1: 로컬 서버**

Run(백그라운드): `npx vercel dev --listen 3000 --yes`
Expected: `Ready! Available at http://localhost:3000`.
- 토큰 만료로 실패하면 사용자에게 `! npx vercel login` 을 요청한다.
- `vercel dev` 가 `.env.local` 의 SUPABASE_* 를 읽는지 확인한다. 못 읽으면 `vercel env add` 로 development 환경에 추가한다(**사용자 확인 후**).

- [ ] **Step 2: 의도 분석 실측** — 5개 언어 × 3종

```bash
for m in '오늘 환율 알려줘' '이 고지서 뭐예요? 그리고 50만원 보내줘' '대출 받을 수 있어요?'; do
  curl -s localhost:3000/api/orchestrate -H 'content-type: application/json' \
    -d "{\"message\":\"$m\",\"lang\":\"ko\",\"ctx\":{\"name\":\"Minh\",\"balance\":320000,\"fxRateText\":\"18,4₫\",\"creditReady\":false,\"monthsToCredit\":2}}"; echo
done
```

Expected:
- 첫째: `tasks:[{agent:general}]` + 환율 답.
- 둘째: `doc`·`remit(500000)` 순서.
- 셋째: `credit`, 한도 숫자 없음.

같은 세 질문을 vi·id·ne·en 번역문으로 한 번씩 돌린다. 폴백 비율을 기록한다.

- [ ] **Step 3: 송금안 실측** — salary·chat × 5개 언어

앱을 `vercel dev` 주소(http://localhost:3000)로 연다.
- 콘솔 "시작: 홈" → 급여 입금 → 잠금화면 4단계 → 카드 펼침(① ~ ④ 문장·출처)을 확인한다.
- 채팅 "50만 원 보내줘" → 라우팅 안내 → 송금 카드(단계 → 제안)를 확인한다.
- 언어별로 `source=llm` 비율과 응답 시간을 이벤트 로그(`proposal_sent`)에서 기록한다.

- [ ] **Step 4: Supabase RAG 실측 — 테스트 자료**

`guides-test/gas-bill-test.md` (테스트 전용 · 확인 후 지운다):

```md
# 도시가스 요금 고지서 읽는 법 (테스트 자료)

청구금액은 이번 달에 내야 하는 돈이다. 납기일은 돈을 내야 하는 마지막 날이다.
납기일이 지나면 연체가산금이 붙을 수 있다. 고지서 아래쪽에 연체가산금 비율이 적혀 있다.

# 자동이체

자동이체를 신청하면 매달 정해진 날 계좌에서 요금이 빠져나가서 납기일을 놓치지 않는다.
고지서에 자동이체 할인 안내가 있으면 그 내용을 따른다.
```

`guides-test/sources.json`:

```json
[{ "file": "gas-bill-test.md", "id": "test_gas_bill", "title": "도시가스 고지서 읽는 법(테스트)", "source": "ONNA 테스트 자료", "kinds": ["utility_bill"] }]
```

Run: `npm run guide:ingest -- guides-test`
Expected: `✓ test_gas_bill 2청크` (청크 수는 1~2)

앱 도움 화면 → 서류 촬영 → 촬영.

Expected:
- 5단계가 순서대로 체크된다.
- ② 아래에 "도시가스 고지서 읽는 법(테스트)" 이 보인다.
- ③ 아래에 "확인 질문 N개 · 고친 곳 M개" 가 보인다.
- 결과: 금액 15,520원 · 납기 2026. 10. 05. · 항목마다 출처 칩("서류 원문" / 테스트 자료 제목).
- 행동: 자동이체·납기 알림 등. 출처 줄은 "다시 확인했어요 · N초".

`/api/doc-agent` 응답 시간을 네트워크 탭에서 기록한다(목표: 전체 10~16초).

- [ ] **Step 5: 폴백 실측**

- 안내 자료 비움: `guides-test/sources.json` 을 `[]` 로 바꾸고 `npm run guide:ingest -- guides-test` → 테스트 문서가 지워진다 → 다시 촬영 → ② "맞는 안내 자료가 아직 없어요", 결과는 원문 근거만.
- 서류 에이전트 차단: Playwright `browser_route` 로 `**/api/doc-agent` 를 abort → 도움 화면 "글자를 잘 못 읽었어요" 안내.
- 오케스트레이터 차단: `**/api/orchestrate` abort → 채팅 "50만 원 보내줘" 가 키워드 폴백으로 송금 카드까지 간다.

- [ ] **Step 6: 브라우저 E2E (Playwright MCP)** — 스펙 "검증 > 브라우저" 6개

1. 채팅 복합 질문 → 라우팅 안내 + 사진 요청 + 송금 카드. 사진 요청의 [사진 올리기] 로 샘플 이미지 업로드(`browser_file_upload` — `public/samples/gas-bill-2026-09.png`) → 채팅 안에서 서류 카드 5단계.
2. 도움 화면 샘플 촬영 → 5단계 → 출처 칩 펼침 → 행동 버튼(자동이체 → 완료 안내).
3. Budi(시작: 홈) → 급여 입금 → 홈에 "이제 대출을 받을 수 있어요" 카드 → [대출 알아보기] → D1 한도가 카드 금액과 같다.
4. 환율 "흔들림" → 급여 입금 → 보내기 → B3 두 줄 → 지문 → B4 → B5 "나머지 … 보낼게요" → 홈 예약 카드 → 콘솔 "송금 도착 지금 발생" → "예약일 도래" → B5 두 번째 송금 → 기록 탭 입출금에 송금 2건.
5. 환율 "낮음" → 송금 탭 → 금액 → B3 "지문으로 예약하기" → B8 → 홈 예약 카드 [취소].
6. 위 폴백 3종.

각 단계 스크린샷을 남기고 `browser_console_messages` 에 에러가 없어야 한다.
모바일 레이아웃(`?device=1`, 390×844)에서 1·2번을 한 번 더 본다.

- [ ] **Step 7: 정리**

- `guides-test/sources.json` 을 `[]` 로 두고 적재해 **테스트 문서를 DB 에서 지운 상태**로 끝낸다(사용자 자료를 받기 전까지 안내 자료 DB 는 비워 둔다).
- `vercel dev` 를 종료한다.
- 실측 결과(언어별 LLM 비율·응답 시간·CoVe 수정 빈도)를 스펙 끝 "검증" 절에 날짜와 함께 적고 커밋한다.

```bash
/opt/homebrew/bin/git add docs/superpowers/specs/2026-09-17-agent-orchestration-design.md
/opt/homebrew/bin/git commit -m "에이전트 워크플로우 실측 결과"
```

- [ ] **Step 8: 배포 (사용자 확인 후에만)**

배포는 공개 URL 을 바꾸므로 사용자에게 먼저 묻는다. 승인되면 아래 순서로 한다.

```bash
printf '%s' "$SUPABASE_URL" | npx vercel env add SUPABASE_URL production
printf '%s' "$SUPABASE_PUBLISHABLE_KEY" | npx vercel env add SUPABASE_PUBLISHABLE_KEY production
npx vercel --prod --yes
```

(값은 `.env.local` 에서 읽어 셸 변수로 넘긴다. 화면에 출력하지 않는다. `SUPABASE_DB_URL` 은 올리지 않는다.)

배포 뒤 https://onna-mvp.vercel.app 에서 Step 6 의 1·2번을 한 번 더 확인한다. iOS 앱은 배포본 API 를 부르므로 이 배포 뒤에야 새 흐름이 붙는다.

---

## 자체 점검 (계획 작성 후)

| 스펙 항목 | 태스크 |
|---|---|
| 오케스트레이터 계약·검증·폴백 | 9, 10, 11 |
| 채팅 스토어 이동·라우팅 안내·첨부 | 11, 18 |
| 송금 ① ~ ④ (상황 판단·채팅 트리거·remit-plan) | 4, 7 |
| 송금 ⑤ 승인 카드(홈·채팅 공용) | 8, 18 |
| 송금 ⑥ 타이밍·override | 5, 6, 8 |
| 송금 ⑦ 실행·예약·B8·예약일 도래·취소 | 6, 8 |
| 환율 상황 데모 + RESET 이월 | 4, 6, 8 |
| 서류 ① ~ ⑤ + 허용 행동 + 폴백 | 14, 15, 16, 17 |
| 샘플 청구서 촬영 | 17 |
| Supabase 스키마·권한·마이그레이션 | 12 |
| 적재 파이프라인(자료 받으면) | 13 |
| 거래 DB → 신용·한도 증가·알림·교체 | 1, 2, 3 |
| 채팅 credit 카드(대출 게이트) | 18 |
| 트레이스 actor 추가 | 11, 16 |
| 5개 언어 카피 | 3, 7, 8, 17, 18 |
| 검증(vitest·실측·브라우저) | 각 태스크, 20 |
