# 급여입금 웹훅 — 에이전트 분석 · 사고과정 UI 설계

작성 2026-09-13 · 승인됨

## 문제

지금 `SALARY_CREDITED`(store.tsx)는 분석이 아니라 고정 공식 하나다.

```
제안액 = 급여 − 생활비 기준선 − 자동이체
```

환율이 나쁜 날에도, 월 한도에 걸릴 상황에도, 대출 상환이 걸려 있어도 결론이 같다. 근거 문장은 i18n 템플릿(`b1.why`)에 값만 꽂는다. `state.trace`·`state.events`는 쌓이지만 화면에 쓰이는 곳이 없다.

## 결정 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 사고과정 UI 위치 | **근로자 앱 안에만**. 데모 콘솔 패널은 만들지 않는다 |
| LLM 권한 | **자유 판단** — 후보 발굴·금액 산정·행동 결정·문장 모두 LLM |
| 추천 범위 | **송금 금액·타이밍만** — `remit_full` / `remit_adjust` / `later` 3종 |
| 연출 | 웹훅 → 단계 진행 2~3초 → B0 잠금화면 푸시 |

### 승인된 우려

LLM이 금액까지 정하므로 **같은 조건에서 두 번 돌리면 제안액이 달라질 수 있다.** 사용자가 이 트레이드오프를 알고 선택했다. 완화책은 `temperature: 0.2`와 출처 표기(`실시간 분석` / `기본 계산`)뿐이고, 결정 자체를 코드로 되돌리지 않는다.

## 아키텍처

```
[데모 콘솔] 급여 입금 발생
      │ dispatch SALARY_CREDITED
      ▼
store   balance += 급여 · analysis = {status:'running', phase:'signals'} · screen = B0
        (proposal 은 아직 만들지 않는다)
      │
      ▼
useSalaryAgent (Shell · MobileShell 양쪽에서 호출)
  ① signals  신호 수집 ........ 코드 (순수 함수, 550ms 노출 유지)
  ② compare  보낼 방법 견주기 .. POST /api/salary-plan → LLM 이 결정·문장 생성
  ③ check    한도·생활비 확인 ... 코드 precheck(LLM 이 낸 금액)
  ④ decide   결정과 이유 ....... ②의 응답 공개
      │ ANALYSIS_RESULT → 420ms → ANALYSIS_DONE
      ▼
B0 "분석 중" → "푸시" 전환 → [보내기] → B1 제안 카드 (+ 사고과정 펼침)
```

**③만 코드인 이유**: 기존 프롬프트 HARD RULE 2가 "한도·최대·최소·수수료·자격 조건을 LLM이 말하면 안 된다"다. 한도 문장을 LLM에 맡기면 그 규칙이 깨진다. ①②④는 전부 LLM.

②의 응답에 문장이 함께 오므로 ④는 별도 LLM 호출이 아니다. LLM을 두 번 부르는 척하지 않으려고 ④ 라벨을 "결정과 이유"로 둔다.

## 신호 (코드가 계산해 LLM에 넘긴다)

`src/agent/signals.ts` → `collectSignals(state, persona)`

| 묶음 | 필드 |
|---|---|
| 돈 | `salary` `autoDebit` `balanceAfter` `livingFloor` `sendableMax`(= balanceAfter − autoDebit) |
| 이번 달 | `sentThisMonth` `limitRemaining` |
| 환율 | `fxRate` `fxRateText` `fxAdvantagePct` `fxBasis`(90d-average\|reference) `fxStrength`(clearly-better\|slightly-better\|same\|lower — `fx-brief.ts` 판정 규칙 재사용) `fxPast`(실값 있을 때만) |
| 기록 | `monthsEmployed` `remitCount` `monthsToCredit` `creditReady` `loanMonthly?` |
| 기타 | `homeCurrency` `today` |

현행 공식값은 **넘기지 않는다** — 주면 베껴 쓰고 자유 판단이 무의미해진다. 폴백 경로에서만 쓴다.

## LLM 계약 — `api/salary-plan.ts` (edge)

```jsonc
{ "action": "remit_full" | "remit_adjust" | "later",
  "amount": 1150000,
  "say":  "…",                       // 제안 한 줄
  "why":  "…",                       // 근거 한 줄
  "steps": { "signals": "…", "compare": "…", "decide": "…" },
  "rejected": [ { "action": "later", "text": "…" } ] }
```

프롬프트는 `api/agent.ts` SYSTEM의 규칙을 상속한다 — 존댓말 레지스터, `{name}` 토큰, 금지어 4종(거절·차단·위반·블록체인·DID·크리덴셜·토큰), 금액은 원화 라벨, 환율 환산 금지, 미래 환율 약속 금지, 언어별 경어.

### 가드레일 (막는 것)

1. `action`이 3종 밖 → 폐기
2. `amount`가 `[10,000원, sendableMax]` 밖 → **플랜을 통째로 폐기**. 숫자만 깎지 않는 이유: 문장에 모델이 말한 금액이 적혀 있어서, 금액만 고치면 카드의 숫자와 설명이 어긋난다. 예외로 `later`는 금액이 없어도 되고, 그때만 공식값으로 채운다
3. `copyLint` — say·why·steps·rejected **모든 문자열**
4. `numbersAreGrounded` — 근거 컨텍스트는 `signals + chosenAmount`. 모델이 정한 금액은 환각이 아니므로 포함시킨다(안 하면 자유 판단한 금액이 전부 폐기된다)
5. 무엇이든 실패하면 `{fallback}` → 클라이언트 폴백

### 막지 않는 것

후보를 무엇으로 볼지, 금액을 얼마로 할지, **월 한도를 넘길지**(보류 B4 시나리오가 살아 있어야 한다), 설명 순서.

## 폴백

`/api/salary-plan` 실패·9초 타임아웃·가드레일 폐기 시 `fallbackPlan()`이 **같은 모양의 플랜**을 코드로 만든다. 금액은 현행 공식, 문장은 i18n. 화면은 경로를 하나만 안다.

폴백은 안전망이므로 분기하지 않는다 — 항상 `remit_full` + 공식 금액.

출처를 카드 밑에 정직하게 적는다(`실시간 분석 · 1.2초` / `기본 계산`). 이 프로젝트는 목업이 실시간인 척하던 버그로 한 번 데였다. 콘솔 `DataStatus`에도 한 줄 넣는다.

## UI (5개 언어)

```
┌─ B0 · 분석 중 ─────────────┐        ┌─ B1 제안 카드 ────────────────┐
│ 18:02                     │        │ ONNA                          │
│ 2026. 9. 25. (금)          │        │ 월급이 들어왔어요.             │
│ ┌───────────────────────┐ │        │ 1,150,000원 보낼까요?          │
│ │ ◐ ONNA                │ │        │ 오늘 환율 ₩1 = 18,4₫ …         │
│ │ 급여 입금을 확인하고   │ │        │ [보내기] [금액 변경] [다음에]   │
│ │ 있어요                │ │  2~3초  │ ───────────────────────       │
│ │ ✓ 들어온 돈·나갈 돈    │ │  ────▶  │ 어떻게 정했는지 보기       ▾   │
│ │ ◐ 보낼 방법 견주는 중  │ │        │  ① 들어온 돈·나갈 돈 확인      │
│ │ ○ 이번 달 한도 확인    │ │        │  ② 보낼 방법 견주기            │
│ │ ○ 결정                │ │        │     ✗ 나중에 — …               │
│ └───────────────────────┘ │        │  ③ 이번 달 한도·생활비 확인     │
│ 돈은 아직 나가지 않았어요  │        │  ④ 결정                       │
└───────────────────────────┘        │  ─ 실시간 분석 · 1.2초         │
                                     └──────────────────────────────┘
```

- 새 화면을 만들지 않는다. B0에 `analyzing`/`push` 두 상태를 두고 기존 내비게이션(`SALARY_CREDITED` → B0)을 그대로 쓴다.
- 분석 중에는 **단계 라벨만** 보여준다(본문은 아직 없다). 본문은 B1 펼침에서.
- 펼침은 기본 접힘. 이모지 금지 — `Icon` 컴포넌트(iOS tofu 이슈).
- `action: 'later'`여도 버튼 3개 구성은 유지한다. 버튼 세트를 바꾸면 B2·B3까지 분기가 생긴다. say/why만 기다림을 권하는 문장으로 바뀐다.
- 푸시 본문 = `plan.say` 한 줄(코드 템플릿 `b0.push`와 중복되지 않게).

## 상태

`AppState.analysis?` — `status` `phase` `source` `latencyMs` `startedAt` `signals` `precheck` `checkKey` `plan` `clamped`.

액션 3개 추가: `ANALYSIS_PHASE` `ANALYSIS_RESULT` `ANALYSIS_DONE`. 리듀서는 `analysis.status !== 'running'`이면 전부 무시한다(RESET 후 도착하는 늦은 응답 방어).

`RESET`은 `analysis`를 이월하지 않는다(세션 데이터). 데모 설정 이월 목록은 그대로.

## 검증

- vitest 단위 테스트: `clampAmount` 경계, `validatePlan` 폐기 조건, `collectSignals` 계산, `fxStrength` 구간
- 수동: 페르소나 3명 × (환율 유리/불리) × (한도 여유/근접) × (API 정상/차단)에서 ① 제안액이 `sendableMax`를 넘지 않는지 ② 금지어 미노출 ③ API 차단 시 같은 UI로 폴백 ④ 5개 언어 단계 문구 줄바꿈(네팔어) ⑤ iOS 시뮬레이터 원격 API 연결
