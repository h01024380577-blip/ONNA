import { json, bad, preflight } from './_lib'

// 수출입은행 API가 해외 리전에서 느려 표본이 모자라는 일이 있어 서울 고정
export const config = { runtime: 'edge', regions: ['icn1'] }

/* 실제 환율 — KRW 기준. 수치는 전부 여기(코드)에서 계산하고,
   LLM은 이 값을 받아 문장만 쓴다 (PRD AG-4: 근거 없는 수치 생성 금지) */

type Quote = 'IDR' | 'NPR' | 'VND'
const QUOTES: Quote[] = ['IDR', 'NPR', 'VND']

/* 통화별 표기 규칙 — 앱의 fmtLocal과 동일한 감각.
   NPR은 ₩1 = 0.11루피대라 소수 2자리로는 지난주와 오늘이 같은 숫자로 뭉개진다.
   과거 시세 비교가 가능하도록 4자리로 쓴다(목값 'रु 0.0965'와도 자리수가 맞는다). */
const FMT: Record<Quote, (r: number) => string> = {
  IDR: (r) => `Rp${r.toFixed(1)}`,
  NPR: (r) => `रु ${r.toFixed(4)}`,
  VND: (r) => `${r.toFixed(1)}₫`.replace('.', ','),
}

/** 기준선을 과거 실값으로 못 구할 때 쓰는 보수적 고정값.
   수출입은행 고시 통화(IDR)는 실제 90일 평균으로 대체되고,
   미지원 통화(NPR·VND)는 과거 시세를 주는 무료 소스가 없어 이 값을 그대로 쓴다. */
const BASELINE_FIXED: Record<Quote, number> = { IDR: 12.88, NPR: 0.1118, VND: 18.92 }

/** 기준선 출처 — 화면에 "무엇 대비"인지 정직하게 표기하기 위해 함께 내려보낸다 */
type BaselineSource = 'koreaexim-90d' | 'fixed'

const EXIM_KEY = () => process.env.KOREAEXIM_FX_KEY ?? process.env.KOREAEXIM_API_KEY

const ymdOf = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')

/** 수출입은행 고시환율 하루치 → KRW 1원당 외화 맵.
   휴일·고시 전에는 빈 배열이 오므로 null로 구분한다. */
async function eximDay(key: string, ymd: string): Promise<Record<string, number> | null> {
  const r = await fetch(
    `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${key}&searchdate=${ymd}&data=AP01`,
    { signal: AbortSignal.timeout(8000) },
  )
  if (!r.ok) return null
  const rows = (await r.json()) as Array<{ cur_unit?: string; deal_bas_r?: string }>
  if (!Array.isArray(rows) || rows.length === 0) return null

  const rates: Record<string, number> = {}
  for (const row of rows) {
    const m = /^([A-Z]{3})(?:\((\d+)\))?$/.exec((row.cur_unit ?? '').trim())
    if (!m) continue
    const krwPerUnit = Number((row.deal_bas_r ?? '').replace(/,/g, ''))
    if (!krwPerUnit) continue
    const per = Number(m[2] ?? '1') // IDR(100) 처럼 100단위 고시인 통화 보정
    rates[m[1]] = per / krwPerUnit // KRW 1원당 외화
  }
  return Object.keys(rates).length ? rates : null
}

/* 1차: 한국수출입은행 고시환율(공식). 영업일 11시 이후 당일분이 나오고
   휴일·시간 이전에는 빈 배열이 오므로 최근 영업일까지 거슬러 조회한다. */
async function fromKoreaexim(): Promise<{ rates: Record<string, number>; asOf: string } | null> {
  const key = EXIM_KEY()
  if (!key) return null

  const kstNow = new Date(Date.now() + 9 * 3600_000)
  for (let back = 0; back < 5; back++) {
    const ymd = ymdOf(new Date(kstNow.getTime() - back * 86400_000))
    try {
      const rates = await eximDay(key, ymd)
      if (!rates) continue
      return { rates, asOf: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}T11:00:00+09:00` }
    } catch {
      /* 다음 날짜로 계속 */
    }
  }
  return null
}

/** 최근 90일 실제 평균 — 7일 간격 13개 표본.
   전 영업일을 다 받으면 호출이 90번이라 주 1회로 솎고, 주말은 직전 금요일로 당긴다.
   공휴일 등으로 빠지는 날이 있어 표본이 절반 미만이면 평균을 믿지 않고 버린다. */
async function baseline90d(): Promise<Record<string, number>> {
  const key = EXIM_KEY()
  if (!key) return {}

  const kstNow = new Date(Date.now() + 9 * 3600_000)
  const dates: string[] = []
  for (let w = 1; w <= 13; w++) {
    const d = new Date(kstNow.getTime() - w * 7 * 86400_000)
    const dow = d.getUTCDay() // kstNow가 이미 +9 보정된 값이라 UTC 요일 = KST 요일
    if (dow === 0) d.setUTCDate(d.getUTCDate() - 2)
    else if (dow === 6) d.setUTCDate(d.getUTCDate() - 1)
    dates.push(ymdOf(d))
  }

  const pull = (ymd: string) => eximDay(key, ymd).catch(() => null)
  let days = await Promise.all(dates.map(pull))
  // 일시적 실패로 표본이 모자라면 빠진 날짜만 한 번 더 시도한다
  if (days.filter(Boolean).length < 6) {
    const retried = await Promise.all(
      days.map((d, i) => (d ? Promise.resolve(d) : pull(dates[i]))),
    )
    days = retried
  }
  const sums: Record<string, { sum: number; n: number }> = {}
  for (const day of days) {
    if (!day) continue
    for (const [cur, rate] of Object.entries(day)) {
      const acc = (sums[cur] ??= { sum: 0, n: 0 })
      acc.sum += rate
      acc.n += 1
    }
  }

  const out: Record<string, number> = {}
  for (const [cur, { sum, n }] of Object.entries(sums)) {
    if (n >= 6) out[cur] = sum / n // 13개 중 6개 이상 모였을 때만 채택
  }
  return out
}

/* 과거 시세 — "지난주엔 얼마였어요?" 같은 질문에 근거를 주려고 함께 내려보낸다.
   수출입은행은 IDR만 고시하고 VND·NPR은 아예 없어서 과거값을 못 준다.
   currency-api(jsDelivr CDN)는 키 없이 일자별 KRW 기준 시세를 주고 셋 다 있다.
   보조 지표이므로 실패하면 조용히 비운다 — 없으면 에이전트가 답하지 않을 뿐이다. */
const HISTORY_DAYS = { weekAgo: 7, monthAgo: 30 } as const
type HistoryKey = keyof typeof HISTORY_DAYS

async function currencyApiDay(ymdDash: string): Promise<Record<string, number> | null> {
  const r = await fetch(
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${ymdDash}/v1/currencies/krw.json`,
    { signal: AbortSignal.timeout(8000) },
  )
  if (!r.ok) return null
  const d = (await r.json()) as { date?: string; krw?: Record<string, number> }
  return d.krw && typeof d.krw === 'object' ? d.krw : null
}

/** 그 날짜에 데이터가 없으면 하루씩 거슬러 최대 3일까지만 찾는다 */
async function currencyApiNear(daysAgo: number): Promise<{ date: string; krw: Record<string, number> } | null> {
  const kstNow = new Date(Date.now() + 9 * 3600_000)
  for (let back = 0; back < 3; back++) {
    const d = new Date(kstNow.getTime() - (daysAgo + back) * 86400_000)
    const date = d.toISOString().slice(0, 10)
    try {
      const krw = await currencyApiDay(date)
      if (krw) return { date, krw }
    } catch {
      /* 다음 날짜로 계속 */
    }
  }
  return null
}

async function fetchHistory(): Promise<Partial<Record<HistoryKey, { date: string; krw: Record<string, number> }>>> {
  const keys = Object.keys(HISTORY_DAYS) as HistoryKey[]
  const days = await Promise.all(keys.map((k) => currencyApiNear(HISTORY_DAYS[k]).catch(() => null)))
  const out: Partial<Record<HistoryKey, { date: string; krw: Record<string, number> }>> = {}
  keys.forEach((k, i) => {
    const day = days[i]
    if (day) out[k] = day
  })
  return out
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
  const pre = preflight(req)
  if (pre) return pre

  const q = new URL(req.url).searchParams.get('quote')?.toUpperCase() as Quote | null
  if (q && !QUOTES.includes(q)) return bad('unsupported quote')

  try {
    const [{ rates, asOf, sources }, real, history] = await Promise.all([
      fetchRates(),
      baseline90d().catch(() => ({} as Record<string, number>)),
      fetchHistory().catch(() => ({})),
    ])
    const build = (c: Quote) => {
      const rate = rates[c]
      if (typeof rate !== 'number') throw new Error(`missing ${c}`)
      // 과거 실값이 모이는 통화는 실제 90일 평균, 아니면 고정 기준선
      const hasReal = typeof real[c] === 'number'
      const base = hasReal ? real[c] : BASELINE_FIXED[c]
      const baselineSource: BaselineSource = hasReal ? 'koreaexim-90d' : 'fixed'
      // 받는 돈이 많아질수록 유리 → (현재 - 기준선) / 기준선
      const advantagePct = Math.round(((rate - base) / base) * 1000) / 10

      const past: Partial<Record<HistoryKey, { date: string; rate: number; rateText: string }>> = {}
      for (const k of Object.keys(HISTORY_DAYS) as HistoryKey[]) {
        const day = history[k]
        const v = day?.krw[c.toLowerCase()]
        if (day && typeof v === 'number') past[k] = { date: day.date, rate: v, rateText: FMT[c](v) }
      }

      return {
        quote: c,
        rate,
        rateText: FMT[c](rate),
        baseline90d: base,
        baselineSource,
        advantagePct,
        // 과거 시세는 못 구할 수 있다 — 없으면 키 자체가 없다
        history: past,
        asOf,
        source: sources[c],
      }
    }
    const built = QUOTES.map(build)
    const body = q ? build(q) : { rates: built, asOf }

    // IDR은 수출입은행 고시 통화라 정상이면 실측 평균이 나와야 한다.
    // 폴백이 섞인 응답을 1시간 캐시하면 그 리전이 한 시간 내내 틀린 값을
    // 내보내므로, 열화된 응답은 짧게만 캐시해 스스로 복구되게 한다.
    const degraded = built.some((r) => r.quote === 'IDR' && r.baselineSource === 'fixed')
    return json(body, 200, degraded ? 120 : 3600)
  } catch (e) {
    return json({ error: (e as Error).message, fallback: true }, 502)
  }
}
