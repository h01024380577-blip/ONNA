/* ONNA 브랜드 마크 — 에이전트가 말하는 자리·앱 아이콘 자리에 공통 사용 */
export function Logo({ size = 24, radius, className }: { size?: number; radius?: number; className?: string }) {
  return (
    <img
      src="/onna-mark.png"
      alt=""
      aria-hidden
      className={className}
      width={size}
      height={size}
      style={{
        width: size, height: size, flex: 'none', display: 'block',
        borderRadius: radius ?? Math.round(size * 0.28),
        objectFit: 'cover',
      }}
    />
  )
}

/* A0 진입 화면용 큰 앱 아이콘 */
export function LogoHero({ size = 76 }: { size?: number }) {
  return (
    <img src="/onna-logo.png" alt="ONNA" width={size} height={size} className="logoHero"
      style={{ width: size, height: size }} />
  )
}
