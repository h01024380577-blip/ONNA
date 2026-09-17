import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.onna.mvp',
  appName: 'ONNA',
  webDir: 'dist',
  // 개발 중에는 Vite dev 서버를 직접 로드 — 코드 수정이 시뮬레이터에 실시간 반영(HMR)
  server: {
    url: 'http://localhost:5199',
    cleartext: true,
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#101619',
  },
}

export default config
