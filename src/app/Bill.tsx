/* C2 서류 촬영 데모용 전기요금 고지서 목업 — 한국 고지서 서식 간략화, 가상 수치 */
export const BILL = {
  amount: 32_400,
  due: '2026. 10. 25', // 문장 끝 마침표와 겹치지 않게 끝점 제외
  month: '2026년 9월분',
  customer: '5••-••••-3271',
  provider: '한국전력공사',
}

export function Bill() {
  const won = (n: number) => n.toLocaleString('ko-KR')
  return (
    <div className="bill" aria-hidden>
      <div className="blHead">
        <span className="blTitle">전기요금 청구서</span>
        <span className="blProv">{BILL.provider}</span>
      </div>
      <div className="blMonth">{BILL.month}</div>
      <div className="blAmt">{won(BILL.amount)}<small>원</small></div>
      <div className="blRows">
        <div><span>납기일</span><b>{BILL.due}.</b></div>
        <div><span>고객번호</span><b>{BILL.customer}</b></div>
        <div><span>사용량</span><b>184 kWh</b></div>
      </div>
      <div className="blBar" />
      <div className="blFoot">납기일이 지나면 연체료가 붙습니다</div>
    </div>
  )
}
