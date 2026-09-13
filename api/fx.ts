import { json, bad } from './_lib'

export const config = { runtime: 'edge' }

/* 실제 환율 — KRW 기준. 수치는 전부 여기(코드)에서 계산하고,
   LLM은 이 값을 받아 문장만 쓴다 (PRD AG-4: 근거 없는 수치 생성 금지) */

type Quote = 'IDR' | 'NPR' | 'VND'
const QUOTES: Quote[] = ['IDR', 'NPR', 'VND']

/** 통화별 표기 규칙 — 앱의 fmtLocal과 동일한 감각 */
const FMT: Record<Quote, (r: number) => string> = {
  IDR: (r) => `Rp${r.toFixed(1)}`,
  NPR: (r) => `रु ${r.toFixed(2)}`,
  VND: (r) => `${r.toFixed(1)}₫`.replace('.', ','),
}

/** 3개월 평균 대비 우위 계산에 쓰는 기준선.
   과거 시계열 적재(Cron+KV) 전까지는 보수적인 고정 기준선을 쓰고,
   출처를 baseline으로 명시해 과장하지 않는다 */
const BASELINE_90D: Record<Quote, number> = { IDR: 12.88, NPR: 0.1118, VND: 18.92 }

/* 1차: 한국수출입은행 고시환율(공식). 영업일 11시 이후 당일분이 나오고
   휴일·시간 이전에는 빈 배열이 오므로 최근 영업일까지 거슬러 조회한다.
   외화 1단위당 원화(매매기준율)로 주므로 KRW→외화로 뒤집어 쓴다. */
async function fromKoreaexim(): Promise<{ rates: Record<string, number>; asOf: string } | null> {
  const key = process.env.KOREAEXIM_API_KEY
  if (!key) return null

  const kstNow = new Date(Date.now() + 9 * 3600_000)
  for (let back = 0; back < 5; back++) {
    const d = new Date(kstNow.getTime() - back * 86400_000)
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
    try {
      const r = await fetch(
        `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${key}&searchdate=${ymd}&data=AP01`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (!r.ok) continue
      const rows = (await r.json()) as Array<{
        result?: number
        cur_unit?: string
        deal_bas_r?: string
      }>
      if (!Array.isArray(rows) || rows.length === 0) continue

      const rates: Record<string, number> = {}
      for (const row of rows) {
        const unit = row.cur_unit ?? ''
        const m = /^([A-Z]{3})(?:\((\d+)\))?$/.exec(unit.trim())
        if (!m) continue
        const krwPerUnit = Number((row.deal_bas_r ?? '').replace(/,/g, ''))
        if (!krwPerUnit) continue
        const per = Number(m[2] ?? '1') // IDR(100) 처럼 100단위 고시인 통화 보정
        rates[m[1]] = per / krwPerUnit // KRW 1원당 외화
      }
      if (Object.keys(rates).length === 0) continue
      return { rates, asOf: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}T11:00:00+09:00` }
    } catch {
      /* 다음 날짜로 계속 */
    }
  }
  return null
}

/* 2차: 공개 환율 API — 수출입은행 미지원 통화(NPR 등)와 장애 시 보완 */
async function fromOpenApi(): Promise<{ rates: Record<string, number>; asOf: string }> {
  const r = await fetch('https://open.er-api.com/v6/latest/KRW', {
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`fx upstream ${r.status}`)
  const d = (await r.json()) as {
    result: string
    rates: Record<string, number>
    time_last_update_utc: string
  }
  if (d.result !== 'success') throw new Error('fx upstream not success')
  return { rates: d.rates, asOf: new Date(d.time_last_update_utc).toISOString() }
}

/** 통화별로 공식 고시가 있으면 그걸 쓰고, 없으면 공개 API 값으로 채운다 */
async function fetchRates(): Promise<{
  rates: Record<string, number>
  asOf: string
  sources: Record<string, string>
}> {
  const [official, open] = await Promise.all([
    fromKoreaexim().catch(() => null),
    fromOpenApi(),
  ])
  const rates: Record<string, number> = {}
  const sources: Record<string, string> = {}
  for (const c of QUOTES) {
    if (official && typeof official.rates[c] === 'number') {
      rates[c] = official.rates[c]
      sources[c] = 'koreaexim (고시환율)'
    } else {
      rates[c] = open.rates[c]
      sources[c] = 'open.er-api.com'
    }
  }
  return { rates, asOf: official?.asOf ?? open.asOf, sources }
}

export default async function handler(req: Request) {
  const q = new URL(req.url).searchParams.get('quote')?.toUpperCase() as Quote | null
  if (q && !QUOTES.includes(q)) return bad('unsupported quote')

  try {
    const { rates, asOf, sources } = await fetchRates()
    const build = (c: Quote) => {
      const rate = rates[c]
      if (typeof rate !== 'number') throw new Error(`missing ${c}`)
      const base = BASELINE_90D[c]
      // 받는 돈이 많아질수록 유리 → (현재 - 기준선) / 기준선
      const advantagePct = Math.round(((rate - base) / base) * 1000) / 10
      return {
        quote: c,
        rate,
        rateText: FMT[c](rate),
        baseline90d: base,
        advantagePct,
        asOf,
        source: sources[c],
      }
    }
    const body = q ? build(q) : { rates: QUOTES.map(build), asOf }
    return json(body, 200, 3600) // 1시간 엣지 캐시
  } catch (e) {
    return json({ error: (e as Error).message, fallback: true }, 502)
  }
}
