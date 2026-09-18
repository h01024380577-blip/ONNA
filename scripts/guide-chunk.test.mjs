import { describe, expect, it } from 'vitest'
import { chunkText } from './guide-chunk.mjs'

const para = (n, ch = '가') => `${ch.repeat(n - 1)}.`

describe('chunkText', () => {
  it('빈 글은 빈 배열', () => expect(chunkText('  \n\n ')).toEqual([]))

  it('짧은 문단들은 한 청크로 묶는다', () => {
    expect(chunkText('첫 문단.\n\n둘째 문단.')).toEqual(['첫 문단.\n\n둘째 문단.'])
  })

  it('제목 앞에서 끊는다', () => {
    const out = chunkText(`# 가스\n${para(400)}\n# 전기\n${para(400, '나')}`, { size: 500, overlap: 50 })
    expect(out).toHaveLength(2)
    expect(out[0].startsWith('# 가스')).toBe(true)
    expect(out[1]).toContain('# 전기')
  })

  it('청크 길이는 size + overlap + 구분자를 넘지 않는다', () => {
    const text = Array.from({ length: 12 }, (_, i) => para(180, String.fromCharCode(0xac00 + i))).join('\n\n')
    for (const c of chunkText(text, { size: 400, overlap: 60 })) expect(c.length).toBeLessThanOrEqual(400 + 60 + 3)
  })

  it('둘째 청크부터는 앞 청크 끝이 겹쳐 붙는다', () => {
    const out = chunkText(`${para(300)}\n\n${para(300, '나')}`, { size: 350, overlap: 40 })
    expect(out).toHaveLength(2)
    expect(out[1].startsWith(out[0].slice(-40))).toBe(true)
  })

  it('겹침은 단어 중간에서 시작하지 않는다', () => {
    const a = '가나다 라마바 사아자 차카타 파하 '.repeat(12).trim()
    const out = chunkText(`${a}.\n\n${a}.`, { size: 200, overlap: 30 })
    expect(out.length).toBeGreaterThan(1)
    for (const c of out.slice(1)) expect(c.startsWith('가') || c.startsWith('라') || c.startsWith('사') || c.startsWith('차') || c.startsWith('파')).toBe(true)
  })

  it('NUL 등 제어 문자는 공백으로 바꾼다 — Postgres text 에 0x00 을 넣을 수 없다', () => {
    const out = chunkText('Ⅱ.\u0000건강보험료 산정\u0007 안내\n\n둘째\u0000 문단.')
    expect(out.join('')).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/)
    expect(out[0]).toContain('Ⅱ. 건강보험료 산정  안내')
  })

  it('아주 긴 한 문장도 잘라 낸다', () => {
    const out = chunkText('다'.repeat(1500), { size: 500, overlap: 50 })
    expect(out.length).toBeGreaterThanOrEqual(3)
    expect(out.every((c) => c.length <= 553)).toBe(true)
  })
})
