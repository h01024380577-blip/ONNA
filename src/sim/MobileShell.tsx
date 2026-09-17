import { useState } from 'react'
import { WorkerPhone } from '../app/Phone'
import { Icon } from '../app/Icon'
import { FamilyPhone } from '../web/FamilyPhone'
import { EmployerPhone } from '../web/Desk'
import { useSimTimers } from './useSimTimers'
import { useRemitAgent } from '../agent/useRemitAgent'
import { useOrchestrator } from '../agent/useOrchestrator'
import { useDocAgent } from '../agent/useDocAgent'
import { DemoConsole, type View } from './DemoConsole'

/* 네이티브(iOS) 풀스크린 셸 — 실제 앱처럼 근로자 앱만 보이고, ⚙ 로 데모 트리거.
   콘솔 내용은 데스크톱 우측 패널과 같은 DemoConsole을 그대로 쓴다. */
export function MobileShell() {
  useSimTimers()
  useRemitAgent()
  useOrchestrator()
  useDocAgent()
  const [view, setView] = useState<View>('worker')
  const [open, setOpen] = useState(false)
  const [idFailMode, setIdFailMode] = useState(false)
  const [startAt, setStartAt] = useState<'onboarding' | 'home'>('onboarding')

  return (
    <div className="mobileRoot">
      <div className="screenHost">
        {view === 'worker' && <WorkerPhone idFailMode={idFailMode} />}
        {view === 'family' && <FamilyPhone />}
        {view === 'employer' && <EmployerPhone />}
      </div>

      <button className="fab" onClick={() => setOpen(true)} aria-label="데모 패널"><Icon name="gear" size={20} strokeWidth={2} /></button>

      {open && (
        <div className="devSheetBack" onClick={() => setOpen(false)}>
          <div className="devSheet" onClick={(e) => e.stopPropagation()}>
            <DemoConsole
              view={view} setView={setView}
              idFailMode={idFailMode} setIdFailMode={setIdFailMode}
              startAt={startAt} setStartAt={setStartAt}
              onPick={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
