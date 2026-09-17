import type { CSSProperties } from 'react'

export type FlagCode = 'id' | 'ne' | 'vi' | 'ko'

/* 원형 국기 SVG — 외부 에셋 없이 간략화해 그림 (B2 수취인 카드 등) */
export function Flag({ code, size = 40 }: { code: FlagCode; size?: number }) {
  const p = {
    width: size, height: size, viewBox: '0 0 40 40',
    style: { display: 'block', flex: 'none' } as CSSProperties,
    'aria-hidden': true as const,
  }
  const clip = `flagClip-${code}`
  const ring = <circle cx="20" cy="20" r="19.4" fill="none" stroke="rgba(0,0,0,.14)" strokeWidth="1" />
  switch (code) {
    case 'id':
      return (
        <svg {...p}>
          <defs><clipPath id={clip}><circle cx="20" cy="20" r="20" /></clipPath></defs>
          <g clipPath={`url(#${clip})`}>
            <rect width="40" height="20" fill="#e70011" />
            <rect y="20" width="40" height="20" fill="#fff" />
          </g>
          {ring}
        </svg>
      )
    case 'vi':
      return (
        <svg {...p}>
          <defs><clipPath id={clip}><circle cx="20" cy="20" r="20" /></clipPath></defs>
          <g clipPath={`url(#${clip})`}>
            <rect width="40" height="40" fill="#da251d" />
            <path d="M20 11.2 22.1 17.6h6.6l-5.3 3.9 2 6.3-5.4-3.9-5.4 3.9 2-6.3-5.3-3.9h6.6Z" fill="#ffdf00" />
          </g>
          {ring}
        </svg>
      )
    case 'ne':
      return (
        <svg {...p}>
          <defs><clipPath id={clip}><circle cx="20" cy="20" r="20" /></clipPath></defs>
          <g clipPath={`url(#${clip})`}>
            <rect width="40" height="40" fill="#fff" />
            <path d="M14 8.5 25.5 17.2H14Z M14 17.2 27 31H14Z" fill="#dc143c" stroke="#003893" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="18.2" cy="14.6" r="1.7" fill="#fff" />
            <circle cx="18.6" cy="25.6" r="2.1" fill="#fff" />
          </g>
          {ring}
        </svg>
      )
    case 'ko':
      return (
        <svg {...p}>
          <defs><clipPath id={clip}><circle cx="20" cy="20" r="20" /></clipPath></defs>
          <g clipPath={`url(#${clip})`}>
            <rect width="40" height="40" fill="#fff" />
            <circle cx="20" cy="20" r="8" fill="#0047a0" />
            <path d="M12 20a8 8 0 0 1 16 0 4 4 0 0 1-8 0 4 4 0 0 0-8 0Z" fill="#cd2e3a" />
            <path d="M7.5 12.5l4-3M6 10.5l4-3M9 14.5l4-3" stroke="#111" strokeWidth="1.4" />
            <path d="M28.5 30.5l4-3M27 28.5l4-3M30 32.5l4-3" stroke="#111" strokeWidth="1.4" />
          </g>
          {ring}
        </svg>
      )
  }
}
