import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './i18n'
import './index.css'
import Bootstrap from './Bootstrap'
import Chat from './pages/Chat'
import Admin from './pages/Admin'

/**
 * Поки база порожня, показуємо онбординг замість чату: після клону
 * репозиторію даних немає, і людина має бачити, що саме готується.
 */
function App() {
  const [ready, setReady] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/bootstrap')
      .then((r) => r.json())
      .then((s) => setReady(Boolean(s.ready)))
      .catch(() => setReady(false))
  }, [])

  if (ready === null) return null
  if (!ready) return <Bootstrap onReady={() => setReady(true)} />

  return (
    <Routes>
      <Route path="/" element={<Chat />} />
      <Route path="/admin/*" element={<Admin />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
