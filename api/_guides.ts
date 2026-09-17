/* 문서 Vector DB (Supabase pgvector) — 공개(publishable) 키로 RPC 두 개만 부른다.
   테이블은 권한 회수 + RLS 라 직접 조회되지 않는다 (supabase/migrations/001_guides.sql).
   실패하면 throw — 호출부가 "안내 자료 없음"으로 바꾼다. */

export const EMBED_MODEL = 'text-embedding-3-small'

export interface GuideChunk {
  id: string
  doc_id: string
  title: string
  source: string
  url: string | null
  content: string
  similarity?: number
}

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    return await fn(ctl.signal)
  } finally {
    clearTimeout(timer)
  }
}

export async function embed(text: string, timeoutMs = 5000): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not set')
  return withTimeout(timeoutMs, async (signal) => {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 6000) }),
      signal,
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d?.error?.message ?? `embeddings ${r.status}`)
    return d.data[0].embedding as number[]
  })
}

async function rpc<T>(fn: string, args: Record<string, unknown>, timeoutMs = 4000): Promise<T> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set')
  return withTimeout(timeoutMs, async (signal) => {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal,
    })
    if (!r.ok) throw new Error(`supabase ${fn} ${r.status}`)
    return (await r.json()) as T
  })
}

export const matchChunks = (vec: number[], k: number, kind: string | null) =>
  rpc<GuideChunk[]>('match_guide_chunks', { query_embedding: vec, match_count: k, kind_filter: kind })

export const getChunks = (ids: string[]): Promise<GuideChunk[]> =>
  ids.length ? rpc<GuideChunk[]>('get_guide_chunks', { ids: ids.slice(0, 10) }) : Promise.resolve([])
