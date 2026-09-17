import type { Currency, Persona, PersonaId } from '../types'

/* A0 국적 선택 — 국적이 페르소나(언어·통화·환율·수취인)를 결정. 국기 미사용(PRD) */
export const NATIONS: Array<{ persona: PersonaId; native: string; ko: string; langLabel: string; cur: Currency }> = [
  { persona: 'budi', native: 'Indonesia', ko: '인도네시아', langLabel: 'Bahasa Indonesia', cur: 'IDR' },
  { persona: 'sita', native: 'नेपाल', ko: '네팔', langLabel: 'नेपाली', cur: 'NPR' },
  { persona: 'minh', native: 'Việt Nam', ko: '베트남', langLabel: 'Tiếng Việt', cur: 'VND' },
]

/* 데모 패널 표기용 — 화면에 'id'·'ne'·'vi' 같은 코드 대신 사람이 읽는 국적명을 쓴다 */
export const NATION_BY_PERSONA = Object.fromEntries(
  NATIONS.map((n) => [n.persona, n]),
) as Record<PersonaId, (typeof NATIONS)[number]>

// 부록 A 언어별 초기 설정 반영: 가족 알림 기본 채널 — id: WhatsApp / ne: Viber→WhatsApp / vi: Zalo
export const PERSONAS: Record<PersonaId, Persona> = {
  budi: {
    id: 'budi',
    name: 'Budi',
    fullName: 'Budi Santoso',
    lang: 'id',
    currency: 'IDR',
    salary: 2_050_000,
    autoDebit: 250_000,
    employer: 'Daegu Precision',
    employerKo: '대구정밀 (성서산업단지)',
    area: '성서산단 · 자동차 부품',
    beneficiary: { name: 'Siti Rahayu', bank: 'Bank Mandiri', masked: '****2214' },
    monthsEmployed: 22,
    remitCount: 19,
    monthsToCredit: 1,
    channels: ['WhatsApp', 'SMS'],
  },
  sita: {
    id: 'sita',
    name: 'Sita',
    fullName: 'Sita Gurung',
    lang: 'ne',
    currency: 'NPR',
    salary: 1_980_000,
    autoDebit: 180_000,
    employer: 'Dalseong Textile',
    employerKo: '달성섬유 (달성군)',
    area: '달성군 · 섬유',
    beneficiary: { name: 'Maya Gurung', bank: 'NIC Asia Bank', masked: '****8830' },
    monthsEmployed: 11,
    remitCount: 8,
    monthsToCredit: 4,
    channels: ['Viber', 'WhatsApp', 'SMS'],
  },
  minh: {
    id: 'minh',
    name: 'Minh',
    fullName: 'Minh Nguyen',
    lang: 'vi',
    currency: 'VND',
    salary: 2_150_000,
    autoDebit: 550_000,
    employer: 'Bukgu Metal',
    employerKo: '북구금속 (제3산단)',
    area: '북구 · 금속 가공',
    beneficiary: { name: 'Nguyen Thi Lan', bank: 'Vietcombank', masked: '****1234' },
    monthsEmployed: 14,
    remitCount: 22,
    monthsToCredit: 2,
    channels: ['Zalo', 'WhatsApp', 'SMS'],
  },
}
