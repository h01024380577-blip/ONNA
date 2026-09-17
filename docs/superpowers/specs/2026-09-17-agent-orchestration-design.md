# 에이전트 워크플로우 — 오케스트레이터 + 업무별 전문 에이전트 설계

작성 2026-09-17 · 승인됨 · 기준 그림 `onna-workflow.png`(ONNA 에이전트 워크플로우)

블록체인·이상거래탐지 박스는 이번 범위에서 제외한다(사용자 지시).

## 문제

그림과 지금 코드를 대조하면 네 곳이 비어 있다.

| 그림 | 지금 | 상태 |
|---|---|---|
| 오케스트레이터: 의도 분석 → Task 분업 | `/api/agent` 가 LLM 1회로 분류 5종 + 답변을 같이 한다. 분류는 "화면 이동 버튼"으로만 쓰이고 전문 에이전트를 부르지 않는다. 섞인 요청을 나누지 못한다 | 부분 |
| 송금 에이전트 | `useSalaryAgent` 4단계(신호·견주기·한도·결정). 채팅에서는 안 불린다. 승인 뒤 "송금 타이밍 결정"이 없다 | 대부분 |
| 서류 에이전트: OCR → RAG → CoVe → 근거 답변 → 다음 행동 | `/api/doc` 가 LLM 1회로 OCR·분류·요약 | 대부분 없음 |
| 거래 DB → 신용 축적 → 신용 확인 → 대출 한도 증가·승인 | 대출 한도가 페르소나 고정값(`monthsEmployed`) 기준. 원장과 무관 | 없음 |

## 결정 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 진행 표시 위치 | **근로자 앱 안에만** (지난 결정 유지). 데모 콘솔 워크플로우 패널은 만들지 않는다 |
| 오케스트레이션 방식 | 클라이언트가 오케스트레이터를 돌리고, 에이전트 엔드포인트는 상태가 없다 |
| 문서 Vector DB | **Supabase pgvector** (프로젝트 `scpdpvdadowasdphkhoi`, 서울 리전) |
| 송금 타이밍 | 승인 뒤 코드가 **지금 / 나눠서 / 예약** 중에서 정한다 |
| CoVe | **조건부 수정** — 초안 → 독립 검증 → 어긋난 항목이 있을 때만 수정 호출 |
| 안내 자료 | **사용자가 제공**한다. 받기 전까지 안내 자료 DB는 비어 있고 서류 에이전트는 폴백 경로로 돈다 |
| 사용자 서류 원문 | DB에 저장하지 않는다 (기존 원칙: 메모리에서만 처리) |

### 오케스트레이션 방식을 클라이언트로 둔 이유

- 거래 DB(`state.ledger`)와 페르소나가 클라이언트에 있다. 서버 오케스트레이터는 매번 원장 전체를 받아야 한다.
- 단계 진행을 앱에 보여 주려면 단계마다 이벤트가 필요하다. 흐름 중간에 **사용자 승인**이 끼어서 요청 하나로 끝낼 수 없다.
- 기존 `useSalaryAgent` 패턴(훅이 단계를 dispatch, 엔드포인트는 계산만)과 같다.
- LLM 이 도구를 스스로 고르는 루프는 "판정은 코드, LLM 은 설명"(AG-3·AG-4)과 가드레일을 무너뜨려서 쓰지 않는다.

## 전체 흐름

```
채팅 질문 ─▶ 오케스트레이터 (useOrchestrator)
   ① 의도 분석 ── POST /api/orchestrate → { tasks[≤2], text }
   ② Task 분업 ── task.agent 별로 전문 에이전트에 넘긴다
        remit   → 송금 에이전트 (trigger: 'chat', requestedAmount)
        doc     → 서류 에이전트 (사진이 없으면 채팅에서 첨부를 요청)
        credit  → 신용 확인 카드 (코드)
        general → 오케스트레이터가 쓴 text 가 곧 답 (환율·잔액·인사·상담 연결)

급여 입금 웹훅 ─▶ 송금 에이전트 (trigger: 'salary') — 그림대로 오케스트레이터를 거치지 않는다

송금 실행 ─▶ 거래 기록 ─▶ 거래 DB(state.ledger)
                              └▶ 신용 축적 ─▶ 신용 확인 ─▶ 한도 증가 · 대출 가능
```

## API 구성 (Vercel Hobby 함수 12개 제한 → 6개)

| 파일 | 런타임 | 역할 |
|---|---|---|
| `api/orchestrate.ts` | edge | 의도 분석 + Task 분업 (`api/agent.ts` 대체) |
| `api/remit-plan.ts` | edge | 송금안 + 이유 (`api/salary-plan.ts` 대체) |
| `api/doc-agent.ts` | edge | 서류 에이전트 `step: ocr \| search \| draft \| verify \| revise` (`api/doc.ts` 대체) |
| `api/fx.ts` `api/fx-brief.ts` `api/rates.ts` | edge | 변경 없음 |

공용 모듈은 밑줄 파일이라 함수로 세지 않는다: `api/_lib.ts`(기존), `api/_guides.ts`(임베딩·RPC).

## 1. 오케스트레이터

### 계약 — `POST /api/orchestrate`

```jsonc
// 요청: 기존 /api/agent 와 같은 { message, lang, ctx }
// 응답
{ "tasks": [ { "agent": "remit", "amount": 500000 }, { "agent": "doc" } ],
  "text": "…",            // general 이면 답, 아니면 넘겨받았다는 한 줄
  "escalate": false }      // 사람 연결을 원하면 true
// 실패·가드레일 → { "fallback": "<사유>" }
```

- `agent` 는 `remit | doc | credit | general` 네 가지. `record`·`loan` 은 `credit` 으로 합친다(그림의 "데이터·신용").
- 태스크는 **최대 2개**, 같은 agent 중복은 합친다. `general` 은 다른 태스크와 같이 오면 버린다(text 가 이미 답이다).
- `amount` 는 `remit` 에만 둔다. **코드가 사용자 문장에서 실제로 파싱되는 금액(`parseAmount`)이거나 `ctx.proposalAmount` 와 같을 때만 인정**하고, 아니면 `null` 로 지운다.
- 기존 가드레일을 그대로 유지한다: `{name}` 토큰, 금지어(`copyLint`), 근거 없는 수치(`numbersAreGrounded`), 대출 게이트(`creditReady` 가 false 면 한도·금리 언급 금지).
- 대출 게이트의 `creditReady`·`monthsToCredit`·`loanLimit` 은 이제 `assessCredit`(5절)이 준다.

### 클라이언트 — `src/agent/orchestrator.ts` + `useOrchestrator`

- 순수 함수: `validateTasks(raw, message, ctx)`, `fallbackTasks(message)`(기존 키워드 분류 `KW` 를 옮겨 온다).
- 훅은 `state.orch` 를 보고 ① → ② 를 dispatch 한다. 태스크 실행은 순서대로 dispatch 만 하고 끝을 기다리지 않는다 — 서류는 사진(사용자 행동)을 기다려야 하므로 직렬로 묶을 이유가 없다.
- 폴백: 엔드포인트 실패 시 `fallbackTasks` + 기존 i18n 템플릿 답.

### 채팅 (스토어로 이동)

지금 채팅 기록은 `WorkerPhone` 의 지역 상태라 데스크톱 탭을 오가면 사라진다. 에이전트 실행이 스토어에 있으므로 채팅도 `state.chat` 으로 옮긴다. RESET 은 비운다.

```ts
type ChatItem =
  | { id; who: 'user'; text }
  | { id; who: 'agent'; kind: 'text'; text; action? }       // general 답 (기존 버튼 액션 유지)
  | { id; who: 'agent'; kind: 'route'; agents: AgentKind[] } // "송금 도우미·서류 도우미에게 맡겼어요"
  | { id; who: 'agent'; kind: 'remit'; runId }               // 진행 → 제안 카드 (state.analysis 를 읽는다)
  | { id; who: 'agent'; kind: 'docAsk' }                     // 사진 첨부 버튼
  | { id; who: 'agent'; kind: 'doc'; runId }                 // 진행 → 결과 카드 (state.docRun 을 읽는다)
  | { id; who: 'agent'; kind: 'credit' }                     // 신용 카드 (assessCredit 을 그 자리에서 계산)
```

- 입력줄 왼쪽에 사진 첨부 버튼을 둔다(파일 선택 = 기존 `downscale` 재사용).
- 라우팅 안내는 쉬운 말로 쓴다: 송금 도우미 / 서류 도우미 / 기록·신용 도우미.

## 2. 송금 에이전트

### 단계 (앱 표기 · 담당)

| # | 앱 표기 | 담당 |
|---|---|---|
| ① `signals` | 입출금 내역·환율 흔들림 확인 | 코드 `collectSignals` (기존) |
| ② `situation` | 지금 상황 판단 | 코드 `judgeSituation` (신규) |
| ③ `plan` | 송금안 만들기 | `POST /api/remit-plan` → 규칙 엔진 사전점검 (기존 check 문구가 여기 붙는다) |
| ④ `explain` | 이유 설명 | ③과 **같은 응답**의 문장 부분. 호출을 두 번 하는 척하지 않는다 |
| ⑤ | 사용자 승인 | 제안 카드 [보내기][금액 변경][다음에] — 홈 B1 · 채팅 카드 |
| ⑥ | 송금 타이밍 결정 | 코드 `decideTiming` — 승인 뒤, 최종 금액 기준 |
| ⑦ | 송금 실행 | B3 지문 → B4 → B5, 원장 기록 (예약분은 예약일에) |

`StepKey` 는 `signals | situation | plan | explain` 으로 바뀐다. 잠금화면 `ThinkingCard` 와 홈 `AgentReasoning` 이 이 네 단계를 쓴다. 채팅 카드도 같은 컴포넌트를 쓴다.

### ② 상황 판단 — `src/agent/situation.ts`

판정은 코드가 내리고 LLM 은 설명만 한다(`fxStrength`·`spendPace` 와 같은 원칙).

```ts
interface Situation {
  money: 'roomy' | 'tight'   // tight: sendableMax < max(MIN_SEND, remitAvg3m × 0.8) 이거나 spendPace === 'higher'
  rate: FxStrength           // 신호 그대로
  risk: FxRisk               // 신호 그대로
  sentAlready: boolean       // sentThisMonth > 0
}
```

### ③④ 계약 — `POST /api/remit-plan`

`api/salary-plan.ts` 를 옮기면서 바꾸는 것만 적는다. 가드레일(어투·상한 언급·통화 이름·숫자 표기 정규화·재시도)은 그대로 둔다.

- 요청에 `trigger: 'salary' | 'chat'` 과 `requestedAmount?` 를 추가한다. 프롬프트 첫 문단이 trigger 에 따라 바뀐다("급여가 방금 들어왔다" / "사용자가 송금을 요청했다").
- 신호에 `situation`(위)과 `laterDate` 를 추가한다.
  - `laterDate` = 이번 달 월세가 아직 안 나갔으면 `nextRentDate`, 이미 나갔으면 오늘 + 7일.
  - HARD RULE 4b 의 "쓸 수 있는 날짜"는 `laterDate` 와 `nextSalaryDate` 둘로 바뀐다.
- 응답 `steps` 에 `situation` 을 추가한다: `{signals, situation, compare, decide}`. 화면 매핑은 ①←signals ②←situation ③←compare(+rejected) ④←decide.
- 금액 범위: `cap = max(MIN_SEND, sendableMax)`. **chat 이고 `requestedAmount` 가 있으면 `cap = max(cap, requestedAmount)`** — 사용자가 직접 말한 금액은 되풀이할 수 있어야 한다. 한도 판단은 규칙 엔진 몫이고, B2 게이지가 빠듯함을 따로 경고한다.
- 폴백(`fallbackPlan`):
  - salary → 지금처럼 공식 금액.
  - chat + requestedAmount → 그 금액 + "요청하신 {amount}을 보낼 준비를 했어요" 템플릿.
  - chat 인데 금액이 없으면 → 공식 금액.

### 상태

- `state.analysis` 에 `trigger`·`requestedAmount`·`situation` 을 추가한다. 실행은 한 번에 하나다. 급여 분석이 도는 중에 채팅 송금이 오면 채팅 카드는 **도는 실행에 붙는다**. 끝난 실행이 있으면 새 실행이 대체한다(제안도 대체).
- `useSalaryAgent` → `useRemitAgent` 로 이름을 바꾼다. 로직은 trigger 만 넘기고 같다.
- 액션 `REMIT_START { trigger, requestedAmount? }` 를 추가한다. `SALARY_CREDITED` 는 잔액·원장 반영 후 내부적으로 같은 초기화를 쓴다.

### ⑥ 타이밍 결정 — `src/agent/timing.ts`

승인 시점에 **새로 계산한 신호**(`collectSignals(state, p, state.balance)`)와 최종 금액으로 정한다. 금액 변경(B2)을 거쳤어도 같은 규칙이다. 분석 없이 송금 탭에서 바로 온 경우는 action 을 `remit_full` 로 본다.

```ts
type TimingPart = { when: 'now' | string /* YYYY-MM-DD */; amount: number }
interface Timing { rule: 'now' | 'split' | 'wait'; parts: TimingPart[]; overridden?: boolean }

decideTiming(amount, sg, action):
  action === 'later' || sg.fxStrength === 'lower'            → wait : [{laterDate, amount}]
  (sg.fxRisk === 'moving' || 'volatile') && amount ≥ 400,000 → split: [{now, round10k(amount/2)}, {laterDate, 나머지}]
  그 밖                                                       → now  : [{now, amount}]
```

- B3 확인 시트에 "언제·얼마" 목록(원화 + 본국 통화)과 규칙별 이유 한 줄(i18n)을 넣는다.
- **"지금 한 번에 보내기"로 바꾸는 버튼**을 둔다(`TIMING_OVERRIDE` → `now` 전액, `overridden: true`). 결정은 사용자가 한다.
- 액션: `PLAN_TIMING`(보내기 · B2 확정 때), `TIMING_OVERRIDE`.

### ⑦ 실행과 예약

- `EXECUTE`(B3 지문):
  - 예약분이 있으면 `state.scheduled` 에 넣는다. 지문 인증이 곧 예약 승인이다.
  - `now` 분이 있으면 `draftAmount = now 금액` 으로 기존 사전점검 → B4 → `SEND_FINAL`.
  - `now` 분이 없으면(wait) 새 화면 **B8 "예약했어요"** 로 간다. 문구는 "돈은 아직 나가지 않았어요"(필수 문구)와 예약 목록이다. 제안은 처리된 것으로 지운다.
- `state.scheduled: Array<{ id; amount; date; status: 'waiting' | 'done' | 'cancelled'; rule }>`
  - 홈 B1 에 "예약한 송금" 카드를 두고 건별 취소(`SCHEDULED_CANCEL`)를 받는다.
  - 잔액·이번 달 보낸 돈은 **실행될 때** 바뀐다. 문구: "그날까지 돈은 계좌에 그대로 있어요".
- 데모 콘솔 **"예약일 도래"** → `SCHEDULED_DUE`: 가장 이른 대기 건 하나를 꺼내 `draftAmount` 로 두고 사전점검한다.
  - PASS → `SEND_FINAL` 을 바로 합성한다. 이미 지문으로 승인했으므로 B5 로 간다.
  - HOLD → 기존 B4 보류 흐름으로 간다.
  - 어느 쪽이든 그 건은 `done` 이 된다.
- 데모 콘솔 **"환율 상황: 실제 / 흔들림 / 낮음"** → `state.fxDemo`.
  - `collectSignals` 가 이 값으로 `fxRisk`(volatile)·`fxStrength`(lower)를 덮는다.
  - 세 가지 타이밍 분기를 시연하려는 장치다.
  - **RESET 때 이월한다**(scenario·dark·creditReady 와 같은 목록 — 지난번 리셋 함정).

## 3. 서류 에이전트

### 입구

- **도움 화면**
  - 촬영: 데모 촬영은 가짜 `Bill` 컴포넌트 대신 `public/samples/gas-bill-2026-09.png` 를 카메라 화면에 보여 주고 **실제 파이프라인에 넣는다**. 상위 폴더의 `가스요금청구서_2026년09월분_샘플.png` 를 복사한 것이고, 문서에 "SAMPLE · 테스트용 / 가상의 청구서" 표기가 있다.
  - 파일 업로드: 기존 경로.
  - 하드코딩 결과(`help.resultSay` 등)는 파이프라인 결과로 대체한다.
- **채팅**: 오케스트레이터가 doc 으로 보내면 `docAsk` 첨부 버튼이 뜬다. 입력줄의 첨부 버튼으로 바로 올려도 doc 실행이 시작된다(질문 문장이 있으면 함께 넘긴다).

### 단계

| # | 앱 표기 | 호출 |
|---|---|---|
| ① `ocr` | 서류 읽기 | `step:ocr` — vision(`gpt-4.1-mini`). 종류·제목·원문 텍스트·항목·기본 요약·한국어 문장·신뢰도 |
| ② `search` | 안내 자료 찾기 | `step:search` — 질의 임베딩 → `match_guide_chunks` top-5 → 자료 제목을 단계 아래에 표시 |
| ③ `verify` | 다시 확인 | `step:draft` → `step:verify` → (어긋나면) `step:revise`. 단계 아래에 "확인 질문 N개 · 고친 곳 M개" |
| ④ `answer` | 근거와 함께 설명 | 최종 답 표시: 요약 + 항목별 출처 칩 |
| ⑤ `actions` | 다음 할 일 | 최종 답의 행동 목록 표시 |

④⑤는 ③의 결과를 보여 주는 단계다(추가 호출 없음).

종류(`kind`)는 그림의 "고지서·금융거래서류·근무 관련 서류"에 맞춰 `utility_bill | payslip | contract | bank_doc | residence_card | receipt | mail | unknown`.

### 계약

```jsonc
// step: ocr   요청 { image, lang }
{ "kind", "title", "rawText",          // rawText: 주요 줄, maskPii 후 최대 800자
  "fields": [{"label","value"}],       // 최대 6개. 이름·주소·고객/계량기 번호는 넣지 않는다
  "amount", "dueDate", "issuer",       // 인쇄된 값 그대로 또는 null
  "summary", "koPhrase", "confidence" }

// step: search 요청 { lang, kind, title, fields, rawText, question? }
{ "passages": [{ "id", "docId", "title", "source", "url", "snippet", "similarity" }] }
// 질의문 = kind 한국어 이름 + title + field 라벨 + question + rawText 앞 300자.
// similarity < 0.3 은 버린다. 안내 자료가 없거나 RPC 실패면 passages: [] (에러 아님)

// step: draft 요청 { lang, kind, rawText, fields, question?, passageIds }
{ "summary",
  "points":  [{ "id": "p1", "text", "cites": ["ocr" | "<chunkId>"] }],      // 2~5개
  "actions": [{ "kind": "<허용 행동>", "reason" }],                          // 최대 3개
  "checks":  [{ "id": "c1", "pointId": "p1", "q", "type": "value" | "yesno", "expect" }] } // 2~4개

// step: verify 요청 { lang, image, passageIds, checks: [{id, q, type}] }  ← 원본 사진으로 확인. 초안·expect 는 보내지 않는다
{ "answers": [{ "id": "c1", "answer": "<값>" | null, "verdict": "yes" | "no" | "unknown", "cite" }] }

// step: revise 요청 { lang, rawText, passageIds, draft: {summary, points, actions}, mismatches: [{pointId, q, answer}] }
{ "summary", "points", "actions" }  // 어긋난 항목은 고치거나 뺀다
```

- 서버는 `passageIds` 로 `get_guide_chunks` 를 불러 본문을 가져온다. 클라이언트가 보낸 본문은 믿지 않는다.
- 모든 문자열에 `copyLint`·`maskPii` 를 적용한다. 숫자 근거 검사는 `rawText + 자료 본문` 기준이다.

### CoVe 비교 — `src/agent/cove.ts` (코드)

- `value`:
  - `expect` 에 숫자가 있으면 양쪽을 숫자만 남겨 같은지 본다. 금액 `15,520원` ↔ `15520`, 날짜 `2026. 10. 05.` ↔ `20261005`.
  - 숫자가 없으면 공백·대소문자를 무시하고 한쪽이 다른 쪽을 포함하는지 본다.
  - `answer: null` 은 불일치다.
- `yesno`: `verdict === 'yes'` 만 일치다.
- 불일치가 하나라도 있으면 `revise` 를 부른다. 없으면 초안이 최종 답이다.
- 최종 답 검증:
  - `cites` 는 `'ocr'` 이거나 검색된 chunk id 여야 한다. 모르는 id 는 지우고, 출처가 하나도 없는 항목은 버린다.
  - `actions` 는 아래 허용 목록 밖이면 버린다.

### 다음 행동 허용 목록 — 실제로 앱이 실행할 수 있는 것만

| 행동 | 앱 동작 | 허용 종류 |
|---|---|---|
| `autopay` | 자동이체 신청 (데모 토글, 기존 문구) | utility_bill |
| `due_reminder` | 납기일 알림 켜기 (데모 토글) | utility_bill, contract |
| `ko_phrase` | 한국어로 물어볼 문장 보기 | 전부 |
| `human` | 상담 연결 (`ESCALATE`) | 전부 |
| `open_record` | 내 기록 열기 | payslip, bank_doc, receipt |

"바로 납부"는 실제 납부처럼 보여 오해를 사므로 넣지 않는다.

### 상태·개인정보

- `state.docRun?: { runId; origin: 'help' | 'chat'; question?; status; phase; ocr?; passages?; searchFailed?; checkCount?; fixedCount?; answer?; source?: 'verified' | 'partly' | 'ocr-only'; latencyMs? }`
- 이미지 data URL 은 스토어에 넣지 않고 모듈 수준 `Map<runId, dataUrl>` 에 둔다. **독립 검증(verify)이 원본 사진을 다시 읽기 때문에 실행이 끝날 때 지운다.**
  - 변경 이유(계획 단계): OCR 에서 원문 전체를 뽑으면 출력 토큰 때문에 20초를 넘긴다. 그래서 OCR 은 주요 줄 600자만 뽑고, 검증은 원본 사진으로 한다.
- `rawText` 는 마스킹된 채 클라이언트 메모리로만 단계 사이를 오간다. 서버·DB 어디에도 저장하지 않는다.
- `useDocAgent` 훅은 셸(데스크톱·모바일)에서 돈다. `runId` 로 늦은 응답을 버린다.

### 폴백

| 실패 지점 | 동작 | 출처 표기 |
|---|---|---|
| OCR | 기존 오류 안내("글자를 잘 못 읽었어요…") | — |
| search 실패 / 결과 0 | passages 없이 진행. ② 아래 "찾은 안내 자료가 없어요" | 원문 근거만 |
| draft·verify 실패 | OCR 의 기본 요약·항목을 결과 카드로 (지금 `/api/doc` 카드와 같은 모양) | 기본 설명 |
| revise 실패 | 불일치 항목을 뺀 초안을 최종 답으로 | 확인된 항목만 |

런타임은 Edge 다. 첫 응답까지 25초 제한이 있어 OCR 호출 타임아웃을 22초로 둔다. 단계마다 요청이 따로라 전체 시간(보통 10~14초)은 제한에 걸리지 않는다.

## 4. Supabase — 문서 Vector DB

### 접속

| 용도 | 값 | 어디 |
|---|---|---|
| 런타임 RPC | `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (`apikey` 헤더) | `.env.local` · Vercel env |
| 마이그레이션·적재 | `SUPABASE_DB_URL` — **Transaction pooler** `aws-0-ap-northeast-2.pooler.supabase.com:6543` | `.env.local` 만 (Vercel 에 올리지 않는다) |

Direct 주소(`db.<ref>.supabase.co`)는 IPv6 전용이라 이 맥에서 붙지 않는다(2026-09-17 확인). pooler 는 `prepare: false` 로 쓴다.

### 스키마 — `supabase/migrations/001_guides.sql`

```sql
create extension if not exists vector;

create table onna_guide_docs (
  id text primary key, title text not null, source text not null, url text,
  kinds text[] not null default '{}', lang text not null default 'ko',
  updated_at timestamptz not null default now());

create table onna_guide_chunks (
  id text primary key, doc_id text not null references onna_guide_docs on delete cascade,
  seq int not null, content text not null, embedding vector(1536) not null);

create index on onna_guide_chunks using hnsw (embedding vector_cosine_ops);

alter table onna_guide_docs enable row level security;   -- 정책 없음 → 공개 키로 직접 조회 불가
alter table onna_guide_chunks enable row level security;

-- 공개 키로는 이 두 함수만 부를 수 있다
create function match_guide_chunks(query_embedding vector(1536), match_count int, kind_filter text)
  returns table (id text, doc_id text, title text, source text, url text, content text, similarity float)
  language sql stable security definer set search_path = public, extensions as $$ … $$;
  -- kind_filter 가 null 이거나, 문서 kinds 가 비었거나(공통 자료), kinds 에 포함되면 대상
create function get_guide_chunks(ids text[]) returns table (…) language sql stable security definer …;

revoke all on function match_guide_chunks, get_guide_chunks from public;
grant execute on function match_guide_chunks, get_guide_chunks to anon;
```

`scripts/db-migrate.mjs` 는 `supabase/migrations/*.sql` 을 순서대로 실행하고 `onna_migrations` 테이블에 적용 기록을 남긴다. 실행은 `node --env-file=.env.local`.

### 적재 — `scripts/guide-ingest.mjs`

- 입력: `guides/` 폴더의 `.md`·`.txt`·`.pdf` + `guides/sources.json`(파일별 `id`·`title`·`source`·`url`·`kinds`).
- 청크: 제목·문단 경계 우선으로 자르고, 약 700자 + 겹침 100자.
- 임베딩: `text-embedding-3-small` 배치 호출.
- 저장: 문서 단위로 청크를 지웠다가 다시 넣는다(재실행 안전). `sources.json` 에 없는 문서는 지운다.
- **사용자 자료를 받을 때까지 실행하지 않는다.** 청크 분할 함수는 `scripts/guide-chunk.mjs` 로 분리해 vitest 로 검사한다.

### 런타임 — `api/_guides.ts`

- `embed(text)`: OpenAI embeddings (5초 타임아웃).
- `matchChunks(vec, k, kind)` · `getChunks(ids)`: `POST {SUPABASE_URL}/rest/v1/rpc/…`, 헤더 `apikey`.
- 실패하면 throw 한다. 호출부(`step:search`)가 빈 결과로 바꾼다.

## 5. 데이터·신용 — 거래 DB → 신용

### 검증된 기록

- `LedgerEntry.verified: boolean` 을 추가한다.
  - 시드는 **최근 `6 − persona.monthsToCredit` 개 완결월과 이번 달**을 검증된 기록으로 둔다. ONNA 로 기록되기 시작한 시점이다. 그보다 오래된 달은 은행 거래이지만 검증된 기록은 아니다.
  - 세션 중 생기는 급여·송금·대출·예약 실행 기록은 전부 `verified: true` 다.
- `persona.monthsToCredit` 은 이제 **시드 입력으로만** 쓴다. 화면·신호·채팅은 모두 `assessCredit` 을 본다.

### `src/agent/credit.ts`

```ts
assessCredit(ledger, persona, demoReady): {
  creditMonths      // 검증된 급여가 있는 달 수 (최대 6까지 의미 있음)
  monthsToCredit    // max(0, 6 − creditMonths)
  verifiedRemits    // 검증된 송금 건수
  ready             // creditMonths ≥ 6 || demoReady
  limit             // floor10k(min(3,000,000, 500,000 + creditMonths × 200,000 + verifiedRemits × 50,000))
  rate, discount, base, spread   // 우대: 재직 12개월↑ 1.0%p · 검증 송금 6건↑ 1.0%p · 공과금 0.5%p
}
```

- **Budi 는 검증 5개월로 시작해 급여 입금 웹훅이 이번 달 급여를 기록하는 순간 6개월이 되어 대출이 열린다.** 그림의 "신용 축적 → 신용 확인 → 대출 승인"이 한 번의 시연으로 보인다.
- 송금이 한 건 기록될 때마다 한도가 5만원 오른다(상한 300만원까지). 그림의 "대출 한도 증가"다.
- `loanOffer(p, sessionRemits, months)` 는 `loanOffer(credit, p, months)` 로 바꾼다. 한도·금리 계산은 `credit.ts` 로 옮긴다.
- 리듀서는 원장을 바꾸는 액션(`SALARY_CREDITED`·`SEND_FINAL`·`SCHEDULED_DUE`·`CANCEL_TX`)마다 이전·이후 신용을 비교한다.
  - 준비 상태가 켜졌거나 한도가 올랐으면 `state.creditNews = { kind: 'ready' | 'limitUp', limit, at }` 를 둔다.
  - 홈에 "기록이 쌓여 대출 한도가 {limit}로 늘었어요" / "이제 대출을 받을 수 있어요" 카드를 띄운다(닫기 가능).
- 교체 대상(`monthsToCredit`·`creditReady` 직접 사용): `signals.ts`, `Phone.tsx`, `Loan.tsx`, `Record.tsx`, `Remit.tsx`, `store.tsx`.
- 기록 탭의 "확인됨" 배지는 검증된 급여·송금이 있는 달에만 붙는다.

### 채팅 credit 카드

코드만으로 그린다(추가 LLM 호출 없음). 단계 3개 — 거래 기록 모으기 → 신용 확인 → 한도·금리 안내 — 를 각 350ms 로 보여 주고, 결과는 다음과 같다.

- 준비 전: 검증 개월 미터 + "N개월 남았어요" + [내 기록 보기]
- 준비 후: 한도·금리 + [대출 알아보기]

## 트레이스

`TraceEvent.actor` 에 `doc-agent`·`credit-agent` 를 추가한다. 오케스트레이터 라우팅, 각 단계 시작·끝, RAG 결과 건수, CoVe 불일치 건수를 남긴다. 화면에는 쓰지 않는다(기존과 같음).

## 카피

- 새 문구는 5개 언어 모두에 넣는다(`makeT` 는 en → ko 순으로 폴백하지만 누락을 허용하지 않는다).
- 금지어 규칙과 "돈은 아직 나가지 않았어요" 필수 문구를 지킨다.
- 이모지 대신 `Icon` 을 쓴다.
- 단계 이름은 쉬운 말로 쓴다. "OCR·RAG·CoVe" 는 앱 화면에 쓰지 않는다. 트레이스와 이 문서에서만 쓴다.

## 검증

### vitest

| 대상 | 확인할 것 |
|---|---|
| `orchestrator` | 허용 밖 agent·3개 이상·중복·general 혼합 처리, 사용자 문장에 없는 금액 제거, 폴백 분류 |
| `situation` | tight/roomy 경계 |
| `timing` | wait(later·lower) / split(흔들림 + 40만 이상, 반올림) / now, 금액 변경 후 재계산 |
| 리듀서 | EXECUTE 가 예약분 저장 + now 분만 송금, wait 는 B8, SCHEDULED_DUE PASS·HOLD, 취소, fxDemo 의 RESET 이월 |
| `credit` | 시드 검증 개월 = 6 − monthsToCredit, Budi 급여 입금 → ready, 송금 → 한도 +5만, 상한, creditNews |
| `cove` | 금액·날짜 정규화 일치, null 불일치, yesno, 불일치 없으면 revise 안 부름 |
| 최종 답 검증 | 모르는 cite 제거, 출처 없는 항목 제거, 허용 밖 행동 제거 |
| `guide-chunk` | 문단 경계·길이·겹침 |

### 엔드포인트 실측 (`vercel dev`)

- `orchestrate`: 5개 언어 × (단일·복합·일반) 질문
- `remit-plan`: salary·chat × 5개 언어
- `doc-agent`: 샘플 고지서로 5단계 전체 — 안내 자료가 없을 때 / 테스트 자료를 넣었을 때
- Supabase: 공개 키로 테이블 직접 조회 → 거부, RPC → 성공

### 브라우저 (Playwright)

1. 채팅 "이 고지서 뭐예요? 그리고 50만원 보내줘" → 라우팅 안내 + 송금 카드 + 첨부 요청
2. 샘플 촬영 → 5단계 → 출처 칩 → 행동 버튼
3. Budi 급여 입금 → 대출 가능 카드
4. 환율 "흔들림" → 나눠 보내기 → B5 + 예약 카드 → 예약일 도래 → 두 번째 송금 기록
5. 환율 "낮음" → 예약 → B8
6. `/api/doc-agent` 차단 시 폴백

콘솔 에러가 없어야 한다.

## 비목표

- 블록체인 기록, 이상거래탐지(사용자 지시로 제외)
- 사용자 서류의 DB 저장·재검색
- 실제 납부·자동이체 실행 (데모 토글)
- 안내 자료 작성 (사용자 제공)

## 실측 결과 (2026-09-17, `vercel dev` + Playwright)

### 단위 테스트

vitest 148개 통과. 대상: 신용·상황·타이밍·리듀서·오케스트레이터·CoVe·서류 규칙·해요체 변환·청크.

### 의도 분석 `/api/orchestrate` — 5개 언어 × 3종(환율·복합·대출), 여러 회 반복

- 분류: **15/15**. 복합 질문은 모든 언어에서 `doc → remit(500000)` 순서로 나뉘었다. 응답 1.5~2.3초.
- 보정한 것:
  - "담당자에게 전달하겠습니다"처럼 사람이 처리한다는 안내
  - 한국어 합니다체
  - 네팔어 데바나가리 숫자
  - 한국어 예문이 인니·네팔어 답에 섞임 → 한국어 전용 블록, 섞이면 폴백
  - 인계 문장에 금액이 들어가 송금 에이전트 제안과 어긋남 → 템플릿으로 교체

### 송금안 `/api/remit-plan` — salary·chat, 3개 페르소나

- LLM 채택 **7/9**. 나머지 2건은 네팔어 통화 이름 가드(기존에 있던 확률적 탈락).
- 채팅 요청(급여 전 잔액 32만원)은 전부 `remit_adjust` 10만~30만원으로 줄여 제안했다.
- 처음에는 2/9였다. 원인과 보정:
  - 급여 전에는 상한이 0원이라, 상한 숫자 검사가 "0"을 찾아 모든 금액 문장을 걸러냈다 → 1만원 이상일 때만 검사
  - "조금 줄여 보내기"가 환율 과소 표현으로 잡혔다 → 전액 송금일 때만 검사

### 서류 에이전트 `/api/doc-agent` — 샘플 가스 청구서, 5개 언어

**단계별 응답 시간**

| 단계 | 시간 |
|---|---|
| OCR | 5~8초 |
| 검색 | 0.5~2초 |
| 초안 | 3~7초 |
| 검증 | 2~3초 |
| 수정(어긋날 때만) | 2~4초 |
| **전체** | **약 13~16초** |

**CoVe 동작**
- 초안의 "1.5%"를 검증 호출이 "270원"으로 답했다. 수정 호출은 불렸지만, 이 270원은 인쇄된 값이 아니라 계산한 값이었다 → 검증 프롬프트에 계산 금지, 수정본 숫자는 원문·자료에만 근거.
- 인도네시아어에서 yes/no 검증을 answer 필드에 적어 거짓 불일치가 났다 → 일치로 인정.

**RAG (테스트 자료 1건 적재 후)**
- ②단계에 자료 제목이 표시되고, 항목마다 자료 출처 칩이 붙었다.
- 확인한 뒤 테스트 자료는 지웠다. **안내 자료 DB 는 비어 있다.**

**한국어 어투**
- 자료(~이다 체)를 넣자 합니다체로 끌려갔다. 어투 블록을 프롬프트 끝에 두면 효과가 없었고, 베트남어 답에는 "이에요"가 붙었다.
- 보정: 규칙 블록 바로 뒤에 한국어 요청일 때만 넣고, 문장 끝을 해요체로 코드 변환(`softenKo`). 이후 한국어 3/3 통과.

**개인정보**
- 초안이 사용자 이름·고객번호·주소를 항목으로 나열했다 → OCR 항목과 답에서 본인 식별 정보 금지. 발행처의 납부 계좌는 허용.

### 브라우저 E2E

| 시나리오 | 결과 |
|---|---|
| 채팅 복합 질문 → 라우팅 안내 + 사진 요청 + 송금 카드(LLM 10만원) → 채팅에서 사진 첨부 → 서류 5단계 | 약 16초 |
| 도움 화면 샘플 촬영(가상 청구서 표시) → 5단계 → 출처 칩 펼침 → 자동이체·납기 알림 완료 안내 | 통과 |
| Budi 급여 입금 → "이제 대출을 받을 수 있어요 · ₩2,050,000" → D1 한도 동일 → 채팅 신용 카드에 한도·금리 | 통과 |
| 환율 흔들림 → 나눠 보내기(지금 30만 + 예약 30만) → B5 나머지 안내 → 예약 카드 → 예약일 도래 → 두 번째 송금 | 통과 |
| 환율 낮음 → 송금 탭 → B3 "지문으로 예약하기" → B8 | 통과 |
| `/api/orchestrate`·`/api/doc-agent` 차단 → 키워드 폴백으로 송금 카드, 서류는 오류 안내, 데이터 출처 패널에 폴백 표시 | 통과 |
| 모바일(`?device=1`, 390×844) 채팅·서류 카드 | 가로 넘침 없음 |

콘솔 에러는 일부러 차단한 요청 2건뿐이었다.

### 참고

- `vercel dev` 는 `.env.local` 을 읽지 않고 Vercel 프로젝트의 development 환경변수를 쓴다. 로컬에서 Supabase 까지 붙이려면 `set -a; . ./.env.local; set +a` 뒤에 실행한다.
- 배포 전 Vercel production 환경변수에 `SUPABASE_URL`·`SUPABASE_PUBLISHABLE_KEY` 를 넣어야 한다.
