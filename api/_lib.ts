/* 서버 공통 유틸 — API 키는 서버에만 존재하고 브라우저로 나가지 않는다 */

export const MODEL = 'gpt-4o-mini' // 채팅·비전 공용, 가장 비용 효율적

export const json = (data: unknown, status = 200, cacheSec = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(cacheSec
        ? { 'cache-control': `public, s-maxage=${cacheSec}, stale-while-revalidate=86400` }
        : { 'cache-control': 'no-store' }),
    },
  })

export const bad = (msg: string, status = 400) => json({ error: msg }, status)

/** OpenAI Chat Completions 호출 — 실패 시 throw */
export async function openai(body: Record<string, unknown>, timeoutMs = 25_000) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not set')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, ...body }),
      signal: ctl.signal,
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d?.error?.message ?? `OpenAI ${r.status}`)
    return d
  } finally {
    clearTimeout(timer)
  }
}

/** 모델 출력에서 JSON 객체만 안전하게 추출 */
export function parseJson<T>(text: string): T | null {
  const s = text.indexOf('{')
  const e = text.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try {
    return JSON.parse(text.slice(s, e + 1)) as T
  } catch {
    return null
  }
}

/** PRD 카피 규칙 — 이 단어들은 사용자에게 노출되면 안 된다 */
const BANNED = ['거절', '차단', '위반', '블록체인', 'DID', '크리덴셜', '토큰']
export function copyLint(text: string): boolean {
  return !BANNED.some((w) => text.includes(w))
}

/** 주민·외국인등록번호 등 민감 번호 마스킹 후 모델에 전달 */
export function maskPii(text: string): string {
  return text.replace(/\b(\d{6})[-\s]?([1-8])\d{6}\b/g, '$1-$2••••••')
}

/** 간단한 IP 기준 레이트리밋 (인스턴스 로컬, 데모 수준 남용 방지) */
const hits = new Map<string, number[]>()
export function rateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs)
  if (arr.length >= limit) return false
  arr.push(now)
  hits.set(ip, arr)
  return true
}

export const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
