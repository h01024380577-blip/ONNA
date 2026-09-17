# 기록 탭 입출금 내역 · 송금 에이전트 지출 신호 설계

작성 2026-09-16 · 사용자 요청 "기록 탭에서 입출금 내역도 확인 가능하도록. 송금 에이전트가 입출금·지출 내역과 환율 리스크를 종합 검토해서 언제 얼마나 송금해야 할지 안내하기 위해 필요"

세부 결정은 사용자가 자리에 없어 이 문서의 작성자가 내렸다. 바꾸고 싶은 항목은 표에서 고르면 된다.

## 문제

- 기록 탭(C1)은 재직·송금 횟수·공과금 정시 납부 **집계**만 보여 준다. 돈이 언제 얼마나 들어오고 나갔는지는 어디에도 없다. 월별 타임라인의 "송금 2회" 같은 값도 `i % 3` 으로 지어낸 값이다.
- 송금 에이전트(`/api/salary-plan`)가 받는 신호는 급여·자동이체·생활비 기준선·환율뿐이다. **실제 지출 흐름**(이번 달 얼마 썼는지, 급여일 전에 뭐가 더 나가는지)과 **환율이 요즘 얼마나 흔들렸는지**를 모른다. 그래서 "언제" 보낼지는 말할 근거가 없다.

## 결정

| 항목 | 결정 |
|---|---|
| 원장 저장 위치 | `state.ledger: LedgerEntry[]` — 세션 시작 때 시드 + 리듀서가 실제 이벤트를 덧붙인다 |
| 과거 내역 | 페르소나별 **결정적(seeded PRNG)** 6개월. 리셋해도 같은 내역 |
| 급여일 | 과거 급여는 **오늘과 같은 일(日)** 에 들어온 것으로 시드한다 → 이번 달 급여는 데모 웹훅 그 자체 |
| 월세·자동이체 | 급여일 +2일. 이번 달 것은 아직 안 나갔다 → `sendableMax` 가 자동이체를 빼는 현행 정의와 모순 없음 |
| 잔액 | 시드 내역에서 잔액을 재계산하지 않는다(`balance: 320_000` 유지). 데모 트레이드오프 |
| 타임라인 | C1 월별 타임라인의 급여·송금 횟수·공과금 여부를 **원장에서 파생**한다 (지어낸 `i % 3` 제거) |
| 송금 취소 | 원장에서 해당 송금 항목을 **제거**한다 (트레이스 문구 "원장 기록 회수"와 일치) |
| 에이전트 신호 | 지출 요약 + 환율 변동성 판정을 **코드가 계산**해 넘긴다. 판정(`spendPace`, `fxRisk`)은 코드가 내린다 — `fxStrength` 와 같은 이유 |
| "언제" 안내 | 별도 필드 없이 문장으로. 프롬프트에 "나중에/줄여 보낼 땐 `nextRentDate`·`nextSalaryDate` 중 하나를 날짜로 말하라" 지시 |
| 채팅 에이전트 | `/api/agent` CONTEXT 에도 같은 지출 요약 4개 값을 넣는다 ("이번 달 얼마 썼어요?" 대답용) |

## 데이터

`src/types.ts`

```ts
export type LedgerKind = 'salary' | 'remit' | 'rent' | 'utility' | 'spend' | 'loan'
export interface LedgerEntry {
  id: string
  at: number            // epoch ms
  kind: LedgerKind
  dir: 'in' | 'out'
  amount: number        // 원화, 항상 양수. 송금은 수수료 제외 금액
  fee?: number          // 송금 수수료 (화면에 "수수료 포함" 표기)
  receive?: number      // 송금 — 가족이 받은 본국 통화 금액
  memoKey?: string      // i18n 키 (spend·utility 세부: ledger.m.grocery 등)
}
```

`src/mock/ledger.ts` — `seedLedger(persona, now): LedgerEntry[]`

- mulberry32(페르소나 id 해시)로 결정적.
- 과거 6개 완결월 각각: 급여(in, 오늘 일자) · 월세·자동이체(out, +2일, `persona.autoDebit`) · 송금 1~2회(out, 급여 다음 날, ≈ 급여−자동이체−생활비 ±10%, 만원 단위, 두 번째는 월 중순 소액) · 공과금 1~2건(가스·전기, 3만~7만) · 생활비 4~6건(장보기·식사·교통·휴대폰, 월합 55만~85만).
- 이번 달: 1일~오늘까지 생활비만 (일수 비례). 급여·월세는 아직 없다.
- 최신순 정렬.

`src/store.tsx`

- `initialState` → `ledger: seedLedger(p, Date.now())`
- `SALARY_CREDITED` → salary in 추가
- `SEND_FINAL` → `{ id: tx.id, kind: 'remit', amount: draftAmount, fee: quote.fee, receive: quote.receive }` 추가
- `CANCEL_TX` → `id === tx.id` 항목 제거
- `LOAN_EXECUTE` → loan in 추가
- `RESET` 은 `initialState` 가 다시 시드하므로 추가 작업 없음

## 신호

`src/agent/spending.ts` — `summarizeSpending(ledger, persona, now)` (순수 함수)

| 필드 | 뜻 | 계산 |
|---|---|---|
| `spendAvg3m` | 최근 3개 완결월 월평균 생활 지출 | spend + utility 합 / 3, 100원 단위 반올림 |
| `spendThisMonth` | 이번 달 지금까지 생활 지출 | spend + utility |
| `spendPace` | 이번 달 씀씀이 판정 | 일할 환산(`spendThisMonth / 경과일 × 30`) vs `spendAvg3m`: +15% 이상 `higher`, −15% 이하 `lower`, 그 사이 `usual` |
| `upcomingDebits` | 다음 급여일 전에 더 나갈 돈 | 이번 달 월세 미납이면 `autoDebit` + `max(0, spendAvg3m − spendThisMonth)` |
| `nextRentDate` | 월세·자동이체 예정일 | 이번 달 급여일+2 (이미 지났으면 다음 달), `YYYY-MM-DD` |
| `nextSalaryDate` | 다음 급여일 | 다음 달 같은 일자 |
| `remitAvg3m` | 최근 3개 완결월 월평균 송금액 | remit 합 / 3 |

`src/agent/signals.ts` — `fxRisk(rate, past)`

| `fxRisk` | 조건 (`swing = (max − min) / rate × 100`, 오늘·1주 전·1달 전 시세) |
|---|---|
| `unknown` | 과거 시세가 없다 (목 환율) |
| `calm` | swing < 0.5% |
| `moving` | 0.5% ≤ swing < 1.5% |
| `volatile` | swing ≥ 1.5% |

`fxSwingPct` 도 함께 넘긴다(소수 1자리). `AgentSignals` 에 위 필드를 모두 추가한다. `limitRemaining` 은 지금처럼 모델에 보내지 않는다.

## 프롬프트 (`api/salary-plan.ts`)

- SIGNALS FIELDS 에 위 필드 설명 추가.
- 새 규칙 **TIMING**: `later` 또는 돈이 더 나갈 것을 이유로 `remit_adjust` 를 고르면 `nextRentDate`·`nextSalaryDate` 중 하나의 날짜를 문장에 쓴다. 다른 날짜는 만들지 않는다.
- `fxRisk` 안내: `volatile`/`moving` 이면 "요즘 환율이 많이 움직였어요" 처럼 **과거 사실**로만 말한다. HARD RULE 4(미래 예측 금지) 유지.
- `spendPace` 는 판정이 끝난 값 — 재판정 금지 (`fxStrength` 와 같은 처리).
- `allowedFigures` 에 `spendAvg3m` `spendThisMonth` `upcomingDebits` `remitAvg3m` 추가 (표기 정규화용). `sendableMax` 는 여전히 넣지 않는다.

`api/agent.ts` — `Ctx` 와 CONTEXT FIELDS 에 `spendAvg3m` `spendThisMonth` `upcomingDebits` `nextRentDate` 추가. `src/app/Phone.tsx` 의 ctx 조립에 같은 값을 넣는다.

## 화면 (C1)

순서: 제목 → 집계 카드 → **입출금 내역(신규)** → 대출 진입 → 사장님 확인 대기 → 월별 타임라인(원장 파생) → 공유 버튼.

입출금 내역 섹션

- 앰버 안내 노트(스파클 아이콘): "온나는 이 내역과 환율을 함께 보고, 언제 얼마를 보내면 좋을지 안내해요."
- 월 블록: 헤더 `2026.09` + "들어온 돈 +X · 나간 돈 −Y". 처음엔 이번 달만 펼치고, "지난달 보기" 버튼으로 한 달씩 더 연다(최대 6개월).
- 행: 아이콘(`.ico`) · 종류 라벨(`ledger.k.*`) + 보조(`M.D` · `ledger.m.*`) · 오른쪽 금액(`+`/`−`, 들어온 돈은 `--app-ok`) + 아래 본국 통화(송금은 `receive`, 나머지는 오늘 환율 환산). 원화+본국 통화 이중 표기 규칙 준수.
- 송금 행 보조에 "수수료 3,000원 포함".
- 아이콘: salary→`money`, remit→`send`, rent→`home`, utility→`flash`, spend→`cart`(신규 SVG 1개), loan→`doc`. 이모지 금지.

i18n 5개 언어(`ko` `en` `vi` `id` `ne`)에 `ledger.*` 키 추가.

## 테스트 (vitest)

- `src/mock/ledger.test.ts`: 페르소나별 결정성, 최신순, 완결월마다 급여·월세·송금·공과금 존재, 이번 달엔 급여·월세 없음, 월 생활비 합이 55만~85만 안.
- `src/agent/spending.test.ts`: 손으로 만든 원장으로 평균·이번 달·`spendPace` 3갈래·`upcomingDebits`·날짜 계산 확인. `fxRisk` 경계값 4갈래.
- `src/agent/signals.test.ts`: 새 필드가 신호에 들어가고 `limitRemaining` 은 여전히 모델용 객체에서 빠진다.
- `src/agent/plan.test.ts` 픽스처는 `collectSignals` 로 만들므로 변경 없음.

## 범위 밖

- 시드 내역과 잔액의 정합(잔액 재계산)
- 제안 카드에 "언제" 칩·별도 필드 — 문장으로만
- 내역 필터·검색·내보내기
