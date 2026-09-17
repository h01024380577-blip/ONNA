/* 실행 중인 서류 사진 — 스토어에 넣지 않고(직렬화·기록 방지) 여기 잠깐 둔다.
   OCR 과 독립 검증(원본 사진 재확인)에 쓰고, 실행이 끝나면 지운다. */
const images = new Map<number, string>()
export const putImage = (runId: number, dataUrl: string) => void images.set(runId, dataUrl)
export const getImage = (runId: number) => images.get(runId)
export const dropImage = (runId: number) => void images.delete(runId)
