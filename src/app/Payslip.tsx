import type { Persona } from '../types'

/* B4-2 스캔 연출용 급여명세서 목업 — 한국 사업장 서식 간략화, 페르소나 급여 기준 가상 수치 */
export function Payslip({ p }: { p: Persona }) {
  const gross = p.salary
  const tax = Math.round(gross * 0.033 / 10) * 10
  const ins = Math.round(gross * 0.045 / 10) * 10
  const net = gross - tax - ins
  const won = (n: number) => n.toLocaleString('ko-KR')
  return (
    <div className="payslip" aria-hidden>
      <div className="psHead">
        <span className="psTitle">급여명세서</span>
        <span className="psMonth">2026년 9월분</span>
      </div>
      <div className="psSub">{p.employerKo}</div>
      <div className="psName">{p.fullName.toUpperCase()} 귀하</div>
      <div className="psRows">
        <div><span>기본급</span><b>{won(gross)}</b></div>
        <div><span>소득세</span><b>-{won(tax)}</b></div>
        <div><span>4대보험</span><b>-{won(ins)}</b></div>
      </div>
      <div className="psNet"><span>실지급액</span><b>{won(net)}원</b></div>
      <div className="psFoot">2026. 9. 25. 지급 · 사업자등록번호 5••-••-•••••</div>
    </div>
  )
}
