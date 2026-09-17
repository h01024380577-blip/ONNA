import { useEffect } from 'react'
import { useStore, ARRIVE_DEMO_SEC, SLA_DEMO_SEC } from '../store'

/** 도착 웹훅·담당자 큐 SLA 데모 타이머 — 데스크톱 셸과 모바일 셸이 공유 */
export function useSimTimers() {
  const { state, dispatch } = useStore()

  useEffect(() => {
    if (state.tx?.status === 'processing') {
      const id = setTimeout(() => dispatch({ type: 'TX_ARRIVED' }), ARRIVE_DEMO_SEC * 1000)
      return () => clearTimeout(id)
    }
  }, [state.tx?.id, state.tx?.status])

  useEffect(() => {
    const pending = state.queue.find((q) => q.status === 'pending')
    if (pending) {
      const id = setTimeout(() => dispatch({ type: 'OPS_APPROVE', id: pending.id }), SLA_DEMO_SEC * 1000)
      return () => clearTimeout(id)
    }
  }, [state.queue.map((q) => q.id + q.status).join()])
}
