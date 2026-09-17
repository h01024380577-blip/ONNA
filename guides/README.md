# 안내 자료 (문서 Vector DB 원본)

서류 에이전트가 RAG 검색으로 찾는 근거 자료다. 여기 넣은 파일은 **커밋되지 않는다**(저장소가 공개).

1. 자료 파일(`.md` · `.txt` · `.pdf`)을 이 폴더에 둔다.
2. `sources.example.json` 을 `sources.json` 으로 복사해 파일마다 한 줄씩 적는다.
   - `id`: 영문 소문자·숫자·`_`·`-` 만
   - `kinds`: 이 자료가 설명하는 서류 종류 — `utility_bill` `payslip` `contract` `bank_doc` `residence_card` `receipt` `mail` `unknown`. 비워 두면 모든 서류에 공통으로 검색된다
   - `source`·`url`: 화면의 출처 칩에 그대로 보인다
3. `npm run guide:ingest` — 목록에 없는 문서는 DB 에서 지워진다.
