import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Crash ho to blank white screen ki jagah friendly message aaye
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null }
  static getDerivedStateFromError(e: Error) { return { err: e.message } }
  componentDidCatch(e: Error) { console.error('[RoomHisaab] crash', e) }
  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20, fontFamily: 'Inter,system-ui,sans-serif', textAlign: 'center' }}>
          <div style={{ maxWidth: 420 }}>
            <p style={{ fontSize: 52 }}>😅</p>
            <h1 style={{ fontSize: 22, margin: '8px 0' }}>Something went wrong</h1>
            <p style={{ color: '#64748B', fontSize: 14.5 }}>
              Your data is safe in this browser. Refresh the page to continue.
            </p>
            <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#D9534F', margin: '12px 0', wordBreak: 'break-word' }}>{this.state.err}</p>
            <button onClick={() => window.location.reload()}
              style={{ background: '#5046C8', color: '#fff', border: 0, borderRadius: 12, padding: '11px 26px', fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>
              Refresh page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Missing #root element in index.html')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

// PWA: service worker register (sirf production/https pe — dev me skip taaki purana cache na phanse)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[RoomHisaab] SW register fail', e))
  })
}
