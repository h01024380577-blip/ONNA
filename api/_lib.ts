/* 서버 공통 유틸 — API 키는 서버에만 존재하고 브라우저로 나가지 않는다 */

/* 모델 선택 근거 (실측, 같은 이미지 기준)
   - 텍스트 대화: gpt-4o-mini 가 입력 $0.15/1M 로 가장 저렴
   - 이미지 판독: gpt-4o-mini 는 이미지 토큰을 과도하게 잡아(448 → 14,230 토큰)
     오히려 8.5배 비싸고 빽빽한 표에서 더 부정확 → gpt-4.1-mini 사용 */
export const MODEL_CHAT = 'gpt-4o-mini'
export const MODEL_VISION = 'gpt-4.1-mini'

/* Capacitor iOS 셸은 다른 오리진(localhost:5199 · capacitor://)에서 뜨므로
   교차 출처로 이 API를 부른다. 사용자 자격증명이 걸린 API가 아니고
   키는 전부 서버에만 있으므로 공개 허용해도 노출되는 것이 없다. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}

export const json = (data: unknown, status = 200, cacheSec = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS,
      ...(cacheSec
        ? { 'cache-control': `public, s-maxage=${cacheSec}, stale-while-revalidate=86400` }
        : { 'cache-control': 'no-store' }),
    },
  })

export const bad = (msg: string, status = 400) => json({ error: msg }, status)

/** POST + content-type: application/json 은 프리플라이트를 부른다.
   각 핸들러 맨 앞에서 이걸 먼저 처리해야 iOS에서 요청이 막히지 않는다. */
export const preflight = (req: Request): Response | null =>
  req.method === 'OPTIONS' ? new Response(null, { status: 204, headers: CORS }) : null

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
      body: JSON.stringify({ model: MODEL_CHAT, ...body }),
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

/** 문장 속 3자리 이상 숫자가 전부 근거 숫자열(sourceDigits)에 들어 있는지 — 근거 없는 수치 차단 */
export function groundedDigits(texts: string[], sourceDigits: string): boolean {
  return texts.every((text) =>
    (text.match(/[\d][\d.,\s]{2,}/g) ?? []).every((tok) => {
      const d = tok.replace(/\D/g, '')
      return d.length < 3 || sourceDigits.includes(d)
    }),
  )
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
