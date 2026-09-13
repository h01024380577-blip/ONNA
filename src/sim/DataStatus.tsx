import { fxLive } from '../mock/fx'
import { benchmark } from '../mock/loan'
import { apiRemote } from '../lib/api'

/* 데이터 출처 표시 — API가 죽으면 화면은 목업으로 조용히 폴백한다.
   그 상태가 눈에 안 보여서 iOS에서 목업 환율이 실시간인 줄 알고 오래 방치된
   적이 있다. 콘솔 패널에 항상 띄워 둬서 같은 일이 반복되지 않게 한다. */
export function DataStatus() {
  const rows = [
    { label: '환율', live: fxLive.on, note: fxLive.on ? fxLive.asOf.slice(0, 10) : '목업 값' },
    { label: '대출 기준금리', live: benchmark.live, note: benchmark.live ? benchmark.source : '기본 기준선' },
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
