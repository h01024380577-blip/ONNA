import type { CSSProperties } from 'react'

export type IconName =
  | 'send' | 'record' | 'help' | 'home' | 'search' | 'qr' | 'mic'
  | 'check' | 'alert' | 'person' | 'refresh' | 'doc' | 'phone' | 'shield'
  | 'chat' | 'money' | 'chevron' | 'gear' | 'restart' | 'back' | 'backspace'
  | 'camera' | 'finger' | 'copy' | 'bell' | 'close' | 'sparkle' | 'scan' | 'flash'

/** 얇은 stroke 라인 아이콘 세트 — currentColor 상속, placeholder 텍스트/이모지 대체 */
export function Icon({ name, size = 22, strokeWidth = 1.9, style, className }: { name: IconName; size?: number; strokeWidth?: number; style?: CSSProperties; className?: string }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    style: { display: 'block', flex: 'none', ...style },
    'aria-hidden': true,
    className,
  }
  switch (name) {
    case 'send':
      return <svg {...p}><path d="M4.5 12 20 4l-4 16-4.5-6.5L4.5 12Z" /><path d="M11.5 13.5 20 4" /></svg>
    case 'record':
      return <svg {...p}><path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" /><path d="M14 4v5h5" /><path d="M8 13h7M8 16.5h5" /></svg>
    case 'help':
      return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.4 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.4 2-2.4 3.6" /><circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none" /></svg>
    case 'home':
      return <svg {...p}><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></svg>
    case 'search':
      return <svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6" /></svg>
    case 'qr':
      return <svg {...p}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h3v3M20 14v6M17 20h3" /></svg>
    case 'mic':
      return <svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18v3M8.5 21h7" /></svg>
    case 'check':
      return <svg {...p} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7" /></svg>
    case 'alert':
      return <svg {...p} strokeWidth={2.2}><path d="M12 8v5" /><circle cx="12" cy="16.5" r=".5" fill="currentColor" stroke="none" /></svg>
    case 'person':
      return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
    case 'refresh':
      return <svg {...p}><path d="M20 11a8 8 0 1 0-.6 4" /><path d="M20 4v5h-5" /></svg>
    case 'doc':
      return <svg {...p}><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4" /></svg>
    case 'phone':
      return <svg {...p}><path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z" /></svg>
    case 'shield':
      return <svg {...p}><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" /></svg>
    case 'chat':
      return <svg {...p}><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 4v-4H6a2 2 0 0 1-2-2Z" /></svg>
    case 'money':
      return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9v6M18 9v6" /></svg>
    case 'chevron':
      return <svg {...p}><path d="m9 6 6 6-6 6" /></svg>
    case 'back':
      return <svg {...p} strokeWidth={2.2}><path d="m15 5-7 7 7 7" /></svg>
    case 'backspace':
      return <svg {...p}><path d="M9 5.5h10a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H9L3.5 12 9 5.5Z" /><path d="m11.5 9.5 5 5M16.5 9.5l-5 5" /></svg>
    case 'camera':
      return <svg {...p}><path d="M4 8a2 2 0 0 1 2-2h1.6l1.3-1.8h6.2L16.4 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" /><circle cx="12" cy="12.4" r="3.3" /></svg>
    case 'finger':
      return <svg {...p}><path d="M12 3.2A8.8 8.8 0 0 0 3.9 8.6" /><path d="M6.6 10.2a5.6 5.6 0 0 1 11 1.3c0 3.1-.5 5.8-1.3 8" /><path d="M9.6 13a2.6 2.6 0 0 1 5.1-.6c0 2.7-.4 5-1.2 7" /><path d="M12.4 20.8c.3-.9.5-1.8.7-2.8" /></svg>
    case 'copy':
      return <svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
    case 'bell':
      return <svg {...p}><path d="M6 9.6a6 6 0 0 1 12 0c0 4 1.1 5.4 1.9 6.2H4.1C4.9 15 6 13.6 6 9.6Z" /><path d="M10 19.2a2.2 2.2 0 0 0 4 0" /></svg>
    case 'close':
      return <svg {...p} strokeWidth={2.2}><path d="m6 6 12 12M18 6 6 18" /></svg>
    case 'scan':
      // 스캔 뷰파인더 — 4개 모서리 브래킷 + 중앙 QR 힌트
      return (
        <svg {...p} strokeWidth={2}>
          <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
          <rect x="8.5" y="8.5" width="7" height="7" rx="1.2" strokeWidth={1.6} />
        </svg>
      )
    case 'flash':
      return <svg {...p}><path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z" /></svg>
    case 'sparkle':
      // AI 어시스턴트 — 4점 별(큰 것 + 작은 것)
      return (
        <svg {...p} strokeWidth={1.6}>
          <path d="M13.2 2.8c.9 4.6 2.4 6.1 7 7-4.6.9-6.1 2.4-7 7-.9-4.6-2.4-6.1-7-7 4.6-.9 6.1-2.4 7-7Z" fill="currentColor" stroke="none" />
          <path d="M6 14.4c.4 2.2 1.1 2.9 3.3 3.3-2.2.4-2.9 1.1-3.3 3.3-.4-2.2-1.1-2.9-3.3-3.3 2.2-.4 2.9-1.1 3.3-3.3Z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'gear':
      return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
    case 'restart':
      return <svg {...p}><path d="M4 12a8 8 0 1 1 2.3 5.6" /><path d="M4 20v-5h5" /></svg>
    default:
      return null
  }
}
