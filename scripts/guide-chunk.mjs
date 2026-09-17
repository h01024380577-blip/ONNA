/* 안내 자료 → 검색 청크. 제목·문단 경계를 먼저 지키고, 긴 문단은 문장 단위,
   그래도 긴 문장은 글자 단위로 자른다. 둘째 청크부터는 앞 청크 끝(overlap)을 붙여
   문맥이 끊기지 않게 한다. */

const SEP = '\n\n'

function hardSplit(s, size, overlap) {
  const out = []
  for (let i = 0; i < s.length; i += size - overlap) out.push(s.slice(i, i + size))
  return out
}

export function chunkText(text, { size = 700, overlap = 100 } = {}) {
  const clean = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!clean) return []

  const paras = clean
    .split(/\n(?=#{1,6}\s)|\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  const base = []
  let cur = ''
  const flush = () => {
    if (cur.trim()) base.push(cur.trim())
    cur = ''
  }

  for (const p of paras) {
    const heading = /^#{1,6}\s/.test(p)
    if (heading) flush()
    if (p.length > size) {
      flush()
      for (const s of p.split(/(?<=[.!?。])\s+/)) {
        if (s.length > size) {
          flush()
          base.push(...hardSplit(s, size, overlap))
          continue
        }
        if (cur && cur.length + 1 + s.length > size) flush()
        cur = cur ? `${cur} ${s}` : s
      }
      flush()
      continue
    }
    if (cur && cur.length + SEP.length + p.length > size) flush()
    cur = cur ? `${cur}${SEP}${p}` : p
  }
  flush()

  // 겹침은 단어 경계에서 시작한다 — 화면 출처 칩에 "료)" 같은 조각이 보이지 않게
  const tailOf = (prev) => {
    const tail = prev.slice(-overlap)
    const cut = tail.search(/\s/)
    return (cut >= 0 && prev.length > overlap ? tail.slice(cut + 1) : tail).trimStart()
  }
  return base.map((c, i) => (i === 0 ? c : `${tailOf(base[i - 1])} ${c}`))
}
