/* 데모용 QR 룩얼라이크 — 파인더·타이밍·정렬 패턴 + 시드 기반 데이터 모듈 (실제 인코딩 아님) */
const N = 25 // 버전 2 규격

export function Qr({ seed, size = 136 }: { seed: string; size?: number }) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0
  const rand = () => {
    h = (Math.imul(h, 1103515245) + 12345) | 0
    return ((h >>> 16) & 0x7fff) / 32768
  }

  const finderDark = (r: number, c: number, r0: number, c0: number) => {
    const y = r - r0
    const x = c - c0
    if (y < 0 || x < 0 || y > 6 || x > 6) return false
    if (y === 0 || y === 6 || x === 0 || x === 6) return true
    return y >= 2 && y <= 4 && x >= 2 && x <= 4
  }
  const inFinderZone = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8)
  const inAlign = (r: number, c: number) => r >= 16 && r <= 20 && c >= 16 && c <= 20
  const alignDark = (r: number, c: number) => {
    const y = r - 16
    const x = c - 16
    return y === 0 || y === 4 || x === 0 || x === 4 || (y === 2 && x === 2)
  }

  const cells: boolean[] = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      let dark: boolean
      if (inFinderZone(r, c)) {
        dark = finderDark(r, c, 0, 0) || finderDark(r, c, 0, N - 7) || finderDark(r, c, N - 7, 0)
      } else if (inAlign(r, c)) {
        dark = alignDark(r, c)
      } else if (r === 6 || c === 6) {
        dark = (r === 6 ? c : r) % 2 === 0
      } else {
        dark = rand() < 0.48
      }
      cells.push(dark)
    }
  }

  const Q = 2 // quiet zone
  const vb = N + Q * 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} shapeRendering="crispEdges" aria-hidden>
      <rect width={vb} height={vb} fill="#fff" />
      {cells.map((d, i) =>
        d ? <rect key={i} x={(i % N) + Q} y={Math.floor(i / N) + Q} width={1} height={1} fill="#151a18" /> : null,
      )}
    </svg>
  )
}
