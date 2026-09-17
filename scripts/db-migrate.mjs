/* supabase/migrations/*.sql 을 이름순으로 한 번씩 적용한다.
   접속: SUPABASE_DB_URL (Transaction pooler — Direct 주소는 IPv6 전용이라 안 붙는다)
   실행: npm run db:migrate */

import postgres from 'postgres'
import { readdirSync, readFileSync } from 'node:fs'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL 이 없습니다 — .env.local 을 확인하세요')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1, ssl: 'require', onnotice: () => {} })
try {
  await sql`create table if not exists public.onna_migrations (name text primary key, applied_at timestamptz not null default now())`
  await sql`alter table public.onna_migrations enable row level security`
  const done = new Set((await sql`select name from public.onna_migrations`).map((r) => r.name))
  const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (done.has(f)) {
      console.log('·', f, '(이미 적용)')
      continue
    }
    const body = readFileSync(`supabase/migrations/${f}`, 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(body)
      await tx`insert into public.onna_migrations (name) values (${f})`
    })
    console.log('✓', f)
  }
} finally {
  await sql.end({ timeout: 5 })
}
