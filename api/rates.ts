import { json } from './_lib'

export const config = { runtime: 'edge' }

/* 조달 기준금리 — 한국수출입은행 '국제금리'(수은채 유통수익률) 커브.
   대출 금리를 임의 상수가 아니라 공시 지표에 연동해 설명 가능하게 만든다.
   실패하면 클라이언트가 기존 고정 기준선을 그대로 쓴다. */

const TENOR: Record<string, number> = {
  m6: 6, m12: 12, m24: 24,
}
/** "수은채 유통수익률 1년 6개월" → 개월 수 */
function toMonths(name: string): number | null {
  const m = /(?:(\d+)년)?\s*(?:(\d+)개월)?/.exec(name.replace('수은채 유통수익률', '').trim())
  if (!m) return null
  const y = Number(m[1] ?? 0)
  const mo = Number(m[2] ?? 0)
  const total = y * 12 + mo
  return total > 0 ? total : null
}

export default async function handler() {
  const key = process.env.KOREAEXIM_API_KEY
  if (!key) return json({ error: 'no key' }, 502)

  const kstNow = new Date(Date.now() + 9 * 3600_000)
  for (let back = 0; back < 6; back++) {
    const d = new Date(kstNow.getTime() - back * 86400_000)
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
    try {
      const r = await fetch(
        `https://oapi.koreaexim.go.kr/site/program/financial/interestJSON?authkey=${key}&searchdate=${ymd}&data=AP02`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (!r.ok) continue
      const rows = (await r.json()) as Array<{ result?: number; sfln_intrc_nm?: string; int_r?: string }>
      if (!Array.isArray(rows) || rows.length === 0 || rows[0]?.result !== 1) continue

      const curve = new Map<number, number>()
      for (const row of rows) {
        const months = toMonths(row.sfln_intrc_nm ?? '')
        const v = Number(row.int_r)
        if (months && Number.isFinite(v)) curve.set(months, v)
      }
      if (curve.size === 0) continue

      const pick = (months: number) => {
        if (curve.has(months)) return curve.get(months)!
        // 가장 가까운 만기로 보간 없이 대체
        let best = -1, bestDiff = Infinity
        for (const k of curve.keys()) {
          const diff = Math.abs(k - months)
          if (diff < bestDiff) { bestDiff = diff; best = k }
        }
        return curve.get(best)!
      }

      const out: Record<string, number> = {}
      for (const [k, months] of Object.entries(TENOR)) out[k] = pick(months)

      return json(
        {
          ...out,
          asOf: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}`,
          source: '한국수출입은행 국제금리 (수은채 유통수익률)',
        },
        200,
        3600,
      )
    } catch {
      /* 다음 날짜 */
    }
  }
  return json({ error: 'no data' }, 502)
}
