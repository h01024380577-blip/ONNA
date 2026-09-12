/* A4 회사 검색 디렉터리 — 실존 대구 기업명을 살짝 변형한 가상 상호 (혼동 방지), 지역·업종은 실제 산업 지형 반영 */
export interface Company {
  name: string // 한국어 상호
  alias: string // 로마자 표기 — 외국인 근로자 검색 보조
  area: string
  industry: string
}

export const COMPANIES: Company[] = [
  { name: '대구정밀', alias: 'Daegu Precision', area: '달서구 성서산업단지', industry: '자동차 부품' },
  { name: '달성섬유', alias: 'Dalseong Textile', area: '달성군 논공읍', industry: '섬유 가공' },
  { name: '북구금속', alias: 'Bukgu Metal', area: '북구 제3산업단지', industry: '금속 가공' },
  { name: '대구텍스', alias: 'Daegu Tex', area: '달서구 대천동', industry: '절삭공구' },
  { name: '삼익테크', alias: 'Samik Tech', area: '달서구 성서산업단지', industry: '기계 부품' },
  { name: '상진브레이크', alias: 'Sangjin Brake', area: '달성군 논공읍', industry: '자동차 제동장치' },
  { name: '평화정밀', alias: 'Pyeonghwa Precision', area: '달성군 유가읍', industry: '자동차 부품' },
  { name: '에스엘라이트', alias: 'SL Light', area: '북구 침산동', industry: '차량용 램프' },
  { name: '경창정공', alias: 'Kyungchang Machining', area: '달서구 월암동', industry: '자동차 부품' },
  { name: '대동기계', alias: 'Daedong Machinery', area: '달성군 논공읍', industry: '농기계' },
  { name: '한국델타', alias: 'Korea Delta', area: '달성군 다사읍', industry: '자동차 전장' },
  { name: '제이브이엔', alias: 'JVN', area: '달서구 성서산업단지', industry: '의료기기 포장' },
]

export function searchCompanies(q: string, limit = 5): Company[] {
  const s = q.trim().toLowerCase()
  if (!s) return COMPANIES.slice(0, 4)
  return COMPANIES.filter((c) =>
    c.name.includes(s) || c.alias.toLowerCase().includes(s) || c.area.includes(s) || c.industry.includes(s),
  ).slice(0, limit)
}
