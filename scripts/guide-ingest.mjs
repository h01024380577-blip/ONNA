/* 안내 자료 적재 — guides/sources.json 에 적힌 파일을 청크로 잘라 임베딩하고
   Supabase(onna_guide_docs / onna_guide_chunks)에 넣는다. 문서 단위로 지우고 다시 넣어서
   여러 번 실행해도 결과가 같다. sources.json 에 없는 문서는 지운다.

   실행: npm run guide:ingest            (guides/)
         npm run guide:ingest -- guides-test (다른 폴더) */

import postgres from 'postgres'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { chunkText } from './guide-chunk.mjs'

const DIR = process.argv[2] ?? 'guides'
const KINDS = ['utility_bill', 'payslip', 'contract', 'bank_doc', 'residence_card', 'receipt', 'mail', 'unknown']
const EMBED_MODEL = 'text-embedding-3-small'

const dbUrl = process.env.SUPABASE_DB_URL
const openaiKey = process.env.OPENAI_API_KEY
if (!dbUrl || !openaiKey) {
  console.error('SUPABASE_DB_URL / OPENAI_API_KEY 가 없습니다 — .env.local 을 확인하세요')
  process.exit(1)
}
const manifestPath = join(DIR, 'sources.json')
if (!existsSync(manifestPath)) {
  console.error(`${manifestPath} 가 없습니다 — guides/README.md 를 보세요`)
  process.exit(1)
}

/** @type {Array<{file:string,id:string,title:string,source:string,url?:string,kinds?:string[],lang?:string}>} */
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
for (const d of manifest) {
  if (!d.file || !/^[a-z0-9_-]+$/.test(d.id ?? '') || !d.title || !d.source)
    throw new Error(`sources.json 항목 확인 필요: ${JSON.stringify(d)}`)
  const bad = (d.kinds ?? []).filter((k) => !KINDS.includes(k))
  if (bad.length) throw new Error(`${d.id}: 모르는 kinds ${bad.join(',')}`)
}

async function readDoc(file) {
  const p = join(DIR, file)
  if (extname(p).toLowerCase() === '.pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(readFileSync(p)))
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  }
  return readFileSync(p, 'utf8')
}

async function embedAll(texts) {
  const out = []
  for (let i = 0; i < texts.length; i += 64) {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${openaiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts.slice(i, i + 64) }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d?.error?.message ?? `embeddings ${r.status}`)
    out.push(...d.data.map((x) => x.embedding))
  }
  return out
}

const sql = postgres(dbUrl, { prepare: false, max: 1, ssl: 'require', onnotice: () => {} })
try {
  for (const doc of manifest) {
    const chunks = chunkText(await readDoc(doc.file))
    if (!chunks.length) {
      console.warn('!', doc.id, '— 읽을 글이 없어 건너뜀')
      continue
    }
    const vecs = await embedAll(chunks.map((c) => `${doc.title}\n${c}`))
    await sql.begin(async (tx) => {
      await tx`
        insert into public.onna_guide_docs (id, title, source, url, kinds, lang, updated_at)
        values (${doc.id}, ${doc.title}, ${doc.source}, ${doc.url ?? null}, ${doc.kinds ?? []}, ${doc.lang ?? 'ko'}, now())
        on conflict (id) do update set title = excluded.title, source = excluded.source, url = excluded.url,
          kinds = excluded.kinds, lang = excluded.lang, updated_at = now()`
      await tx`delete from public.onna_guide_chunks where doc_id = ${doc.id}`
      for (let i = 0; i < chunks.length; i++) {
        await tx`
          insert into public.onna_guide_chunks (id, doc_id, seq, content, embedding)
          values (${`${doc.id}#${i}`}, ${doc.id}, ${i}, ${chunks[i]}, ${JSON.stringify(vecs[i])}::extensions.vector)`
      }
    })
    console.log('✓', doc.id, `${chunks.length}청크`)
  }
  const ids = manifest.map((d) => d.id)
  const gone = await sql`delete from public.onna_guide_docs where not (id = any (${ids})) returning id`
  if (gone.length) console.log('− 목록에 없어 지움:', gone.map((r) => r.id).join(', '))
} finally {
  await sql.end({ timeout: 5 })
}
