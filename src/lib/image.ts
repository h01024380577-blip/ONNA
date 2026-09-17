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
