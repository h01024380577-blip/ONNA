import { describe, expect, it } from 'vitest'
import { MAX_DOC_DATA_URL, MAX_PDF_BYTES, asPdfDataUrl, docInputPart, isPdfFile } from './docInput'

const PDF = 'data:application/pdf;base64,JVBERi0xLjQK'
const JPEG = 'data:image/jpeg;base64,/9j/4AAQ'

describe('isPdfFile', () => {
  it('MIME 이나 확장자로 PDF 를 알아본다', () => {
    expect(isPdfFile({ type: 'application/pdf', name: 'bill' })).toBe(true)
    // 일부 브라우저·기기는 MIME 을 비워 준다
    expect(isPdfFile({ type: '', name: '고지서.PDF' })).toBe(true)
    expect(isPdfFile({ type: 'image/png', name: 'bill.png' })).toBe(false)
  })
})

describe('asPdfDataUrl', () => {
  it('MIME 이 비었거나 octet-stream 이어도 PDF data URL 로 맞춘다', () => {
    expect(asPdfDataUrl('data:application/octet-stream;base64,JVBERi0xLjQK')).toBe(PDF)
    expect(asPdfDataUrl('data:;base64,JVBERi0xLjQK')).toBe(PDF)
    expect(asPdfDataUrl(PDF)).toBe(PDF)
  })
  it('base64 data URL 이 아니면 null', () => {
    expect(asPdfDataUrl('not a data url')).toBeNull()
    expect(asPdfDataUrl('data:application/pdf,plain-text')).toBeNull()
  })
})

describe('docInputPart', () => {
  it('사진은 image_url 파트(고해상도)로 보낸다 — 기존 동작 그대로', () => {
    expect(docInputPart(JPEG)).toEqual({ type: 'image_url', image_url: { url: JPEG, detail: 'high' } })
  })
  it('PDF 는 file 파트(file_data)로 보낸다', () => {
    expect(docInputPart(PDF)).toEqual({ type: 'file', file: { filename: 'document.pdf', file_data: PDF } })
  })
  it('사진·PDF 가 아니면 null', () => {
    expect(docInputPart('data:text/html;base64,PGh0bWw+')).toBeNull()
    expect(docInputPart('https://example.org/bill.pdf')).toBeNull()
    expect(docInputPart('')).toBeNull()
  })
})

describe('크기 한도', () => {
  it('허용한 최대 PDF 를 base64 로 바꿔도 서버 한도 안에 든다', () => {
    const encoded = 'data:application/pdf;base64,'.length + Math.ceil(MAX_PDF_BYTES / 3) * 4
    expect(encoded).toBeLessThanOrEqual(MAX_DOC_DATA_URL)
  })
})
