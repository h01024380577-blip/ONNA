import { useState } from 'react'
import { useStore, SLA_DEMO_SEC } from '../store'
import { PERSONAS } from '../mock/personas'
import { Icon } from '../app/Icon'

/* EM-1 사장님 화면 — 근로자가 보낸 ONNA 알림이 카카오톡처럼 한 건씩 쌓인다.
   재직 확인 요청과 급여계좌 안내는 성격이 다른 알림이라 목록에서 분리해 보여주고,
   고른 알림만 아래에 펼친다. 어느 경우에도 급여 정보는 보이지 않는다. */

type NotiKind = 'verify' | 'account'

const timeText = (at: number) =>
  new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

export function EmployerCard() {
  const { state, dispatch } = useStore()
  const p = PERSONAS[state.personaId]
  const st = state.onboarding.employer
  const share = state.accountShare
  const company = state.onboarding.employerName ?? p.employerKo

  const notis: Array<{
    kind: NotiKind; title: string; preview: string; at: number; channel: string
    unread: boolean; tagText: string; tagTone: 'todo' | 'done'
  }> = []
  if (st !== 'none') {
    notis.push({
      kind: 'verify',
      title: '재직 확인 요청',
      preview: `${p.fullName} 님이 "우리 직원이 맞다"는 확인을 요청했어요.`,
      at: state.onboarding.startedAt ?? Date.now(),
      channel: '카카오톡',
      unread: st === 'pending',
      tagText: st === 'pending' ? '확인 필요' : '확인 완료',
      tagTone: st === 'pending' ? 'todo' : 'done',
    })
  }
  if (share) {
    notis.push({
      kind: 'account',
      title: '급여계좌 안내',
      preview: `iM뱅크 ${share.acct} · ${p.fullName}`,
      at: share.at,
      channel: share.channel === 'kakao' ? '카카오톡' : 'SMS',
      unread: !share.read,
      tagText: share.read ? '읽음' : '새 알림',
      tagTone: share.read ? 'done' : 'todo',
    })
  }
  notis.sort((a, b) => b.at - a.at)

  /* 알림함이 첫 화면이고, 누른 알림만 펼친다. 자동으로 펼치거나 읽음 처리하지 않는다 —
     사장님이 실제로 눌러서 확인했을 때만 '읽음'이 되어야 배지가 정직하다.
     읽지 않은 알림이 하나도 없으면(= 다 확인함) 가장 최근 것을 펼쳐 둔다. */
  const allRead = notis.length > 0 && notis.every((n) => !n.unread)
  const [open, setOpen] = useState<NotiKind | null>(allRead ? notis[0].kind : null)

  const pickNoti = (kind: NotiKind) => {
    setOpen(open === kind ? null : kind)
    if (kind === 'account' && share && !share.read) dispatch({ type: 'EMPLOYER_READ_ACCOUNT' })
  }

  const unreadCount = notis.filter((n) => n.unread).length

  return (
    <div className="deskCard empCard">
      <div className="dcHead">
        <b className="wmk">ONNA</b>
        <span>사장님 화면 — 카카오톡으로 받은 알림</span>
      </div>

      {notis.length === 0 ? (
        <div className="dcBody">
          <h2>아직 받은 알림이 없어요</h2>
          <p className="sub2">
            근로자가 온보딩에서 회사를 연결하거나 급여계좌를 보내면, 사장님 카카오톡으로 알림이 옵니다.
          </p>
        </div>
      ) : (
        <>
          <div className="notiBar">
            알림 {notis.length}건
            {unreadCount > 0 && <i className="notiNew">확인할 항목 {unreadCount}</i>}
          </div>

          <div className="notiList">
            {notis.map((n) => (
              <button
                key={n.kind}
                className={`notiItem ${open === n.kind ? 'on' : ''} ${n.unread ? 'unread' : ''}`}
                onClick={() => pickNoti(n.kind)}
              >
                <span className={`notiIco ${n.kind}`}>
                  <Icon name={n.kind === 'verify' ? 'check' : 'money'} size={17} strokeWidth={2.1} />
                </span>
                <span className="notiTxt">
                  <b>{n.title}</b>
                  <span className="notiPrev">{n.preview}</span>
                  <span className="notiMeta">{n.channel} · {timeText(n.at)}</span>
                </span>
                <span className={`notiTag ${n.tagTone}`}>{n.tagText}</span>
              </button>
            ))}
          </div>

          {open === 'verify' && (
            <div className="dcBody notiDetail">
              <h2>{p.fullName} 님이 우리 직원인가요?</h2>
              <p className="sub2">확인하는 내용은 <b>"일하고 있음"</b> 하나뿐입니다. 급여 정보는 보이지 않아요.</p>
              <div className="kv"><span className="k">근로자</span><span className="v">{p.fullName}</span></div>
              <div className="kv"><span className="k">사업장</span><span className="v">{company}</span></div>
              <div className="kv"><span className="k">요청 항목</span><span className="v">재직 여부 (일하고 있음)</span></div>
              {st === 'verified' ? (
                <div className="empDone">✓ 확인해 주셔서 감사합니다. {p.name} 님의 기록이 시작됩니다.</div>
              ) : (
                <button className="empApprove" onClick={() => dispatch({ type: 'EMPLOYER_APPROVE' })}>
                  네, 우리 직원이 맞습니다
                </button>
              )}
            </div>
          )}

          {open === 'account' && share && (
            <div className="dcBody notiDetail">
              <h2>급여를 보낼 계좌예요</h2>
              <p className="sub2">{p.fullName} 님이 급여계좌를 보냈습니다. 다음 급여부터 이 계좌로 보내 주세요.</p>
              <div className="acctBox">
                <span className="acctBank">iM뱅크</span>
                <span className="acctNo">{share.acct}</span>
                <span className="acctOwner">예금주 {p.fullName}</span>
              </div>
              <div className="kv"><span className="k">사업장</span><span className="v">{company}</span></div>
              <div className="kv"><span className="k">받은 경로</span><span className="v">{share.channel === 'kakao' ? '카카오톡' : 'SMS'}</span></div>
              <p className="empNote">확인만 하면 됩니다. 사장님이 따로 입력하실 내용은 없어요.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* RM-9 컴플라이언스 담당자 큐 — 내부 도구, 최소 UI */
export function OpsCard() {
  const { state, dispatch } = useStore()
  return (
    <div className="deskCard">
      <div className="dcHead"><b className="wmk">ONNA</b><span>컴플라이언스 검토 큐 — 파일럿 SLA 30분 (데모 {SLA_DEMO_SEC}초 자동 승인)</span></div>
      <div className="dcBody">
        {state.queue.length === 0 ? (
          <>
            <h2>대기 중인 건이 없습니다</h2>
            <p className="sub2">근로자 앱에서 보류가 발생하고 급여명세서가 올라오면 여기에 쌓입니다.</p>
          </>
        ) : (
          state.queue.map((q) => (
            <div className="opsRow" key={q.id}>
              <div className="docThumb" />
              <div>
                <div className="who2">{q.user}</div>
                <div className="sub3">₩{q.amount.toLocaleString()} · {new Date(q.at).toLocaleTimeString('ko-KR')}</div>
                <span className="code">{q.code}</span>
              </div>
              <button className="opsApprove" disabled={q.status === 'approved'}
                onClick={() => dispatch({ type: 'OPS_APPROVE', id: q.id })}>
                {q.status === 'approved' ? '승인됨' : '재심사 승인'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
