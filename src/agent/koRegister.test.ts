import { describe, expect, it } from 'vitest'
import { softenKo } from './koRegister'

describe('softenKo — 합니다체 문장 끝을 해요체로', () => {
  it('입니다 → 받침 있으면 이에요, 없으면 예요', () => {
    expect(softenKo('청구금액은 15,520원입니다.')).toBe('청구금액은 15,520원이에요.')
    expect(softenKo('도시가스 요금 청구서입니다.')).toBe('도시가스 요금 청구서예요.')
    expect(softenKo('마지막 날입니다')).toBe('마지막 날이에요')
  })
  it('합니다 → 해요, 됩니다 → 돼요', () => {
    expect(softenKo('10월 5일까지 내야 합니다.')).toBe('10월 5일까지 내야 해요.')
    expect(softenKo('연체가산금이 부과됩니다.')).toBe('연체가산금이 부과돼요.')
    expect(softenKo('신청하시면 됩니다!')).toBe('신청하시면 돼요!')
  })
  it('습니다 → 알려진 어간만 아요/어요, 과거형(ㅆ)은 어요', () => {
    expect(softenKo('할인을 받을 수 있습니다.')).toBe('할인을 받을 수 있어요.')
    expect(softenKo('미납액은 없습니다.')).toBe('미납액은 없어요.')
    expect(softenKo('요금이 조금 더 붙습니다.')).toBe('요금이 조금 더 붙어요.')
    expect(softenKo('할인을 받습니다.')).toBe('할인을 받아요.')
    expect(softenKo('지난달보다 낮습니다.')).toBe('지난달보다 낮아요.')
    expect(softenKo('사용량이 줄었습니다.')).toBe('사용량이 줄었어요.')
  })
  it('모르는 어간(불규칙 활용 위험)은 그대로 둔다', () => {
    expect(softenKo('날씨가 덥습니다.')).toBe('날씨가 덥습니다.')
  })
  it('문장 중간·인사말은 건드리지 않는다', () => {
    expect(softenKo('감사합니다. 요금이에요.')).toBe('감사합니다. 요금이에요.')
    expect(softenKo('합니다라는 말')).toBe('합니다라는 말')
  })
  it('여러 문장', () => {
    expect(softenKo('금액은 1,250원입니다. 자동이체를 신청할 수 있습니다.')).toBe('금액은 1,250원이에요. 자동이체를 신청할 수 있어요.')
  })
})
