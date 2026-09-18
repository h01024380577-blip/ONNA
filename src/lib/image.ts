import { MAX_PDF_BYTES, asPdfDataUrl, isPdfFile } from '../agent/docInput'

/** 업로드 전 브라우저에서 축소 — 업로드 용량·OCR 비용을 줄이고 전송 한도를 지킨다 */
export async function downscale(file: Blob, max = 1600, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', quality)
}

/** 파일 선택으로 받은 서류 — 사진은 줄여서, PDF 는 원본 그대로 data URL 로.
    읽을 수 없거나 너무 큰 파일이면 throw 한다 */
export async function readDoc(file: File): Promise<string> {
  if (!isPdfFile(file)) return downscale(file)
  if (file.size > MAX_PDF_BYTES) throw new Error('pdf too large')
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  const pdf = asPdfDataUrl(url)
  if (!pdf) throw new Error('unreadable pdf')
  return pdf
}
