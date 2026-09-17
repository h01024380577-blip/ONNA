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
| 돈 | `salary` `autoDebit` `balanceAfter` `livingFloor` `sendableMax`(= balanceAfter − autoDebit − livingFloor) |
| 이번 달 | `sentThisMonth` `limitRemaining` (**limitRemaining 은 모델에 보내지 않는다** — 아래) |
| 환율 | `fxRate` `fxRateText` `fxAdvantagePct` `fxBasis`(90d-average\|reference) `fxStrength`(clearly-better\|slightly-better\|same\|lower — `fx-brief.ts` 판정 규칙 재사용) `fxPast`(실값 있을 때만) |
| 기록 | `monthsEmployed` `remitCount` `monthsToCredit` `creditReady` `loanMonthly?` |
| 기타 | `homeCurrency` `today` |

현행 공식값은 **넘기지 않는다** — 주면 베껴 쓰고 자유 판단이 무의미해진다. 폴백 경로에서만 쓴다.

`limitRemaining`도 모델에 보내지 않는다. 한도는 사용자에게 말해서도 안 되고(HARD RULE 3) 판단은 규칙 엔진 몫인데, 신호로 주면 "지금 30만원까지만 보낼 수 있어요" 같은 문장이 샌다(실측). ③단계가 코드로 덮는다.

`sendableMax`에서 생활비 기준선을 빼는 것이 중요하다. 안 빼면 에이전트가 계좌를 거의 비우는 금액(192만원)을 제안하고, 앱이 약속한 "생활비는 남겨 뒀어요"가 거짓이 된다(실측).

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
4. `numbersAreGrounded` — 근거 컨텍스트는 `signals + chosenAmount`. 모델이 정한 금액은 환각이 아니므로 포함시킨다(안 하면 자유 판단한 금액이 전부 폐기된다). `api/agent.ts`에 있는 "뒤 0을 떼고 한 번 더 본다"는 관용 규칙은 쓰지 않는다 — 자리수가 하나 틀린 금액이 그 규칙으로 통과했다
5. **어투**(ko) — 합니다체로 새면 폐기. 카드에 직접 나가는 문장만 기준으로 하고, 탈락 후보는 그 항목만 뺀다(전체를 버리면 실측 2/3가 폴백)
6. **상한 언급** — `sendableMax` 숫자가 문장에 나오면 폐기(고른 금액과 같을 때는 정상)
7. **통화 이름** — 원화 금액에 본국 통화 이름(रुपैयाँ·rupiah)을 붙이면 폐기. 베트남어 "đồng Hàn Quốc"은 규칙상 허용이라 예외
8. 무엇이든 실패하면 **1회 재시도** 후 `{fallback}` → 클라이언트 폴백. 탈락은 대부분 확률적이라 한 번 더 뽑으면 통과한다(네팔어 1/3 → 2/3, 전체 12/14). 클라이언트가 9초에 끊으므로 시도별 타임아웃 6초 + 첫 시도가 3.5초를 넘으면 재시도하지 않는다

### 숫자 표기는 코드가 다시 쓴다

모델이 쓴 금액 표기를 `normalizeFigures()`가 언어별 표기로 교체한다(`fmtKRW`와 같은 규칙). 네팔어는 데바나가리 숫자에 자리 구분까지 틀리고(१,१०,०००० = 1,10,0000), 베트남어는 쉼표를 쓰는데 같은 카드의 앱 금액은 점을 쓴다. 아는 값만 교체하고 환율 표기처럼 모르는 숫자는 그대로 두어 근거 검사에 맡긴다.

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

## 검증 (2026-09-13 실측)

vitest 17개 통과 — `validatePlan` 폐기 조건, `formulaAmount`·`fallbackPlan`, `collectSignals` 계산, `fxStrength` 구간.

엔드포인트 14회 호출: ko 5/5 · vi 4/4 · id 3/3 · ne 2/3 (통화 이름 1회 폐기). 응답 2.6~6.1초(중간 3.5초). 환율이 낮은 날엔 `later`, 이번 달에 많이 보낸 경우엔 `remit_adjust`로 실제로 갈린다.

브라우저(`vercel dev` + Playwright): ① 잠금화면 4단계가 순서대로 체크되고 ② 완료 후 푸시 본문이 에이전트 문장으로 바뀌며 ③ 홈 카드 펼침에 4단계·탈락 후보·출처(`실시간 분석 · 4.3초`)가 뜬다. ④ `/api/salary-plan`을 차단하면 같은 UI에 공식 금액(₩600.000)과 `기본 계산` 출처가 뜬다. ⑤ `보류 · 월 한도` 시나리오에서 ③단계 문구가 코드 문구로 바뀐다. 콘솔 에러 없음.

미검증: iOS 시뮬레이터(원격 API 경로) — 배포 후 확인 필요.
