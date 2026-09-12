import type { Persona } from '../types'
import { Face } from './Face'

/* A2 스캔 연출용 외국인등록증 목업 — 실제 서식을 간략화, 페르소나별 가상 정보(번호 마스킹) */
const MOCK: Record<string, { regNo: string; nation: string; issued: string }> = {
  budi: { regNo: '980412-5••••••', nation: 'INDONESIA', issued: '2024.03.15' },
  sita: { regNo: '010226-6••••••', nation: 'NEPAL', issued: '2025.10.02' },
  minh: { regNo: '960730-5••••••', nation: 'VIET NAM', issued: '2023.08.21' },
}

export function IdCard({ p, glare = false }: { p: Persona; glare?: boolean }) {
  const m = MOCK[p.id]
  return (
    <div className="idcard" aria-hidden>
      <div className="idHead">
        <span className="idTitle">외국인등록증<small>RESIDENCE CARD</small></span>
        <span className="idKor">대한민국</span>
      </div>
      <div className="idBody">
        <div className="photo"><Face p={p} /></div>
        <div className="idFields">
          <div><label>외국인등록번호 Registration No.</label><b className="mono">{m.regNo}</b></div>
          <div><label>성명 Name</label><b>{p.fullName.toUpperCase()}</b></div>
          <div className="idRow2">
            <span><label>국가지역 Country</label><b>{m.nation}</b></span>
            <span><label>체류자격 Status</label><b>E-9</b></span>
          </div>
          <div><label>발급일자 Issue Date</label><b className="mono">{m.issued}</b></div>
        </div>
      </div>
      <div className="idFoot">법무부장관 MINISTER OF JUSTICE, REPUBLIC OF KOREA</div>
      {glare && <div className="glare" />}
    </div>
  )
}
