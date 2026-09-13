/* 상대경로로 /api/* 를 부르면 Capacitor iOS(다른 오리진)에서 404가 나고,
   호출부가 조용히 목업으로 폴백해 "실시간인 척하는 가짜 숫자"가 화면에 남는다.
   실제로 그 버그를 한 번 겪었으므로 빌드에서 막는다. src/lib/api.ts 의
   apiUrl()을 거치면 된다. */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src'
const ALLOW = 'src/lib/api.ts' // 베이스 주소를 정의하는 곳 자신은 예외
const BAD = /fetch\(\s*['"`]\/api\//

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

const hits = []
for (const file of walk(ROOT)) {
  if (!/\.(ts|tsx)$/.test(file) || file.replace(/\\/g, '/') === ALLOW) continue
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (BAD.test(line)) hits.push(`${file}:${i + 1}  ${line.trim()}`)
  })
}

if (hits.length) {
  console.error('\n✗ /api 를 상대경로로 직접 부르는 곳이 있습니다:\n')
  hits.forEach((h) => console.error('   ' + h))
  console.error("\n  fetch(apiUrl('/api/...')) 로 바꾸세요 — src/lib/api.ts\n")
  process.exit(1)
}
console.log('✓ API 호출 주소 검사 통과')
