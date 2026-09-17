import { fxLive } from '../mock/fx'
import { benchmark } from '../mock/loan'
import { apiRemote } from '../lib/api'
import { useStore } from '../store'

/* 데이터 출처 표시 — API가 죽으면 화면은 목업으로 조용히 폴백한다.
   그 상태가 눈에 안 보여서 iOS에서 목업 환율이 실시간인 줄 알고 오래 방치된
   적이 있다. 콘솔 패널에 항상 띄워 둬서 같은 일이 반복되지 않게 한다. */
export function DataStatus() {
  const { analysis: an, docRun: doc, orch } = useStore().state
  const rows = [
    { label: '환율', live: fxLive.on, note: fxLive.on ? fxLive.asOf.slice(0, 10) : '목업 값' },
    { label: '대출 기준금리', live: benchmark.live, note: benchmark.live ? benchmark.source : '기본 기준선' },
    {
      label: '송금 분석',
      live: an?.status === 'done' && an.source === 'llm',
      note: !an
        ? '대기'
        : an.status === 'running'
          ? '분석 중'
          : an.source === 'llm'
            ? `${((an.latencyMs ?? 0) / 1000).toFixed(1)}초`
            : '기본 계산',
    },
    {
      label: '의도 분석',
      live: orch?.status === 'done' && orch.source === 'llm',
      note: !orch ? '대기' : orch.status === 'running' ? '분석 중' : orch.source === 'llm' ? '완료' : '키워드 폴백',
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
  ]
  return (
    <>
      <h3>데이터 출처</h3>
      <div className="dataStatus">
        {rows.map((r) => (
          <div className="dsRow" key={r.label}>
            <span className={`dsDot ${r.live ? 'on' : ''}`} />
            <span className="dsLabel">{r.label}</span>
            <span className="dsNote">{r.live ? '실시간' : '폴백'} · {r.note}</span>
          </div>
        ))}
        <div className="dsRow">
          <span className={`dsDot ${apiRemote ? 'warn' : 'on'}`} />
          <span className="dsLabel">API 경로</span>
          <span className="dsNote">{apiRemote ? '원격(배포본) 호출' : '같은 오리진'}</span>
        </div>
      </div>
    </>
  )
}
