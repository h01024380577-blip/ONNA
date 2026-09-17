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

let rpcOk = false
try {
  rpcOk = r1.ok && Array.isArray(JSON.parse(b1))
} catch {
  rpcOk = false
}
const tableBlocked = !r2.ok || b2.trim() === '[]'
console.log(rpcOk && tableBlocked ? '✓ 권한 구성 정상' : '✗ 권한 구성 확인 필요')
process.exit(rpcOk && tableBlocked ? 0 : 1)
