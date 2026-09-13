import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { loadLiveFx } from './mock/fx'
import { loadLiveRates } from './mock/loan'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)
const render = () =>
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )

// 실시간 환율을 먼저 반영하고 그리기 — 로딩 화면(2.2초) 동안 끝난다.
// 실패해도 목 환율로 그대로 진행한다.
Promise.allSettled([loadLiveFx(), loadLiveRates()]).finally(render)
