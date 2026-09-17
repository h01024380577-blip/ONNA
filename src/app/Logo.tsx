/* ONNA 브랜드 마크 — 에이전트가 말하는 자리·앱 아이콘 자리에 공통 사용.
   PNG 자체가 둥근 배지 모양(모서리 투명)이라 CSS로 다시 깎으면 로고 글자가 잘린다.
   radius는 사각 배경 위에 얹는 예외 상황에서만 넘길 것. */
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
        borderRadius: radius,
        objectFit: 'contain',
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
