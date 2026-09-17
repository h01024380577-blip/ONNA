/* API 호출 주소는 반드시 여기를 거친다.

   /api/* 는 Vercel Edge Function이라 배포본에만 존재한다. 그런데 앱은 세 가지
   오리진에서 뜬다:
     - 배포본(onna-mvp.vercel.app)      → 같은 오리진, 상대경로로 충분
     - vercel dev(localhost:3000)       → 같은 오리진, 상대경로로 충분
     - Capacitor iOS(localhost:5199)    → Vite dev 서버. /api/* 가 없다
   마지막 경우에 상대경로를 쓰면 404가 나고, 호출부가 전부 조용히 목업으로
   폴백해 "실시간인 척하는 가짜 숫자"가 화면에 남는다. 그래서 API가 없는
   오리진에서는 배포본을 직접 부른다. */

const DEPLOYED = 'https://onna-mvp.vercel.app'

/** 이 오리진이 /api/* 를 직접 서빙하는가 */
function servesApi(): boolean {
  if (typeof location === 'undefined') return true
  // capacitor:// · ionic:// · file:// — 네이티브 셸에서 번들을 직접 연 경우
  if (!/^https?:$/.test(location.protocol)) return false
  // Capacitor가 붙는 Vite dev 서버에는 Edge Function이 없다
  if (location.port === '5199') return false
  return true
}

/** API가 원격(배포본)으로 나가는 상태인지 — 콘솔 패널 표시용 */
export const apiRemote = !servesApi()

/** 모든 fetch는 이 함수로 주소를 만든다. 상대경로를 직접 쓰지 말 것. */
export function apiUrl(path: string): string {
  return apiRemote ? DEPLOYED + path : path
}
