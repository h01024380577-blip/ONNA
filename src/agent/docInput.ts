/* 서류 에이전트 입력 — 사진과 PDF 를 함께 받는다.
   사진은 브라우저에서 줄인 JPEG data URL, PDF 는 원본 그대로의 data URL 이다.
   OpenAI Chat Completions 는 PDF 를 file 파트(file_data)로 받아 쪽마다 글자와 그림을 함께 읽는다.
   클라이언트(파일 읽기)와 서버(api/doc-agent)가 같은 규칙을 쓴다. */

/** 서버가 받는 data URL 최대 길이 — 요청 본문 한도(약 4MB) 안에 들어가게 */
export const MAX_DOC_DATA_URL = 4_000_000
/** 브라우저에서 받는 PDF 최대 크기 — base64 로 늘어나도(×4/3) 위 한도 안에 든다 */
export const MAX_PDF_BYTES = 2_500_000

const PDF_PREFIX = 'data:application/pdf;base64,'
const B64 = ';base64,'

/** 일부 브라우저·기기는 MIME 을 비워 주므로 확장자도 본다 */
export const isPdfFile = (f: { type?: string; name?: string }) =>
  f.type === 'application/pdf' || /\.pdf$/i.test(f.name ?? '')

/** FileReader 결과의 MIME 이 비었거나 octet-stream 이어도 PDF data URL 로 맞춘다 */
export function asPdfDataUrl(dataUrl: string): string | null {
  const i = dataUrl.indexOf(B64)
  if (!dataUrl.startsWith('data:') || i < 0) return null
  return PDF_PREFIX + dataUrl.slice(i + B64.length)
}

export type DocInputPart =
  | { type: 'image_url'; image_url: { url: string; detail: 'high' } }
  | { type: 'file'; file: { filename: string; file_data: string } }

/** 모델에 넘길 content 파트 — 사진·PDF data URL 이 아니면 null */
export function docInputPart(dataUrl: string): DocInputPart | null {
  if (dataUrl.startsWith('data:image/')) return { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
  if (dataUrl.startsWith(PDF_PREFIX)) return { type: 'file', file: { filename: 'document.pdf', file_data: dataUrl } }
  return null
}
