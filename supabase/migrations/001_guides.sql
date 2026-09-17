-- ONNA 문서 Vector DB — 서류 에이전트의 RAG 검색 대상(안내 자료).
-- 사용자가 올린 서류는 여기 저장하지 않는다(메모리에서만 처리).
-- 공개(publishable) 키로는 아래 두 RPC 만 부를 수 있다: 테이블은 권한 회수 + RLS.

set search_path = public, extensions;

create extension if not exists vector with schema extensions;

create table if not exists public.onna_guide_docs (
  id          text primary key,
  title       text not null,
  source      text not null,
  url         text,
  kinds       text[] not null default '{}',   -- 비어 있으면 모든 서류 종류에 공통
  lang        text not null default 'ko',
  updated_at  timestamptz not null default now()
);

create table if not exists public.onna_guide_chunks (
  id         text primary key,                 -- '<doc_id>#<seq>'
  doc_id     text not null references public.onna_guide_docs (id) on delete cascade,
  seq        int  not null,
  content    text not null,
  embedding  extensions.vector(1536) not null  -- text-embedding-3-small
);

create index if not exists onna_guide_chunks_doc_idx on public.onna_guide_chunks (doc_id);
create index if not exists onna_guide_chunks_embedding_idx
  on public.onna_guide_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.onna_guide_docs   enable row level security;
alter table public.onna_guide_chunks enable row level security;
revoke all on table public.onna_guide_docs, public.onna_guide_chunks from anon, authenticated;

create or replace function public.match_guide_chunks(
  query_embedding extensions.vector(1536),
  match_count int default 5,
  kind_filter text default null
)
returns table (id text, doc_id text, title text, source text, url text, content text, similarity double precision)
language sql stable security definer
set search_path = public, extensions
as $$
  select c.id, c.doc_id, d.title, d.source, d.url, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.onna_guide_chunks c
  join public.onna_guide_docs d on d.id = c.doc_id
  where kind_filter is null or cardinality(d.kinds) = 0 or kind_filter = any (d.kinds)
  order by c.embedding <=> query_embedding
  limit least(greatest(coalesce(match_count, 5), 1), 10);
$$;

create or replace function public.get_guide_chunks(ids text[])
returns table (id text, doc_id text, title text, source text, url text, content text)
language sql stable security definer
set search_path = public, extensions
as $$
  select c.id, c.doc_id, d.title, d.source, d.url, c.content
  from public.onna_guide_chunks c
  join public.onna_guide_docs d on d.id = c.doc_id
  where c.id = any (ids[1:10]);
$$;

revoke all on function public.match_guide_chunks(extensions.vector, int, text) from public;
revoke all on function public.get_guide_chunks(text[]) from public;
grant execute on function public.match_guide_chunks(extensions.vector, int, text) to anon, authenticated;
grant execute on function public.get_guide_chunks(text[]) to anon, authenticated;

notify pgrst, 'reload schema';
