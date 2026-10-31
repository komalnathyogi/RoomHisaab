// Route-level code splitting keeps the first download small. Heavy pages,
// charts, and motion code load only when their route is opened.
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { StoreProvider, useStore } from './hooks/useStore'
import { Suspense, lazy, useLayoutEffect, useRef, type ReactNode } from 'react'
import { parseCloudInviteLocation } from './lib/cloud'
import { useTheme } from './hooks/useTheme'

const Landing = lazy(() => import('./pages/Landing'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Login = lazy(() => import('./pages/Login'))
const Recover = lazy(() => import('./pages/Recover'))
const JoinRoom = lazy(() => import('./pages/JoinRoom'))
const CloudJoin = lazy(() => import('./pages/CloudJoin'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const QuickBuy = lazy(() => import('./pages/QuickBuy'))
const History = lazy(() => import('./pages/History'))
const Insights = lazy(() => import('./pages/Insights'))
const Members = lazy(() => import('./pages/Members'))
const Inbox = lazy(() => import('./pages/Inbox'))
const Rules = lazy(() => import('./pages/Rules'))
const Payments = lazy(() => import('./pages/Payments'))
const Settings = lazy(() => import('./pages/Settings'))
const About = lazy(() => import('./pages/About'))
const Guide = lazy(() => import('./pages/Guide'))
const Layout = lazy(() => import('./components/Layout').then((module) => ({ default: module.Layout })))

function ThemeController() {
  useTheme()
  return null
}

function ScrollToTop() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const positions = useRef(new Map<string, { x: number; y: number }>())

  useLayoutEffect(() => {
    const savedPositions = positions.current
    const key = location.key
    return () => { savedPositions.set(key, { x: window.scrollX, y: window.scrollY }) }
  }, [location.key, location.pathname, location.search, location.hash])

  useLayoutEffect(() => {
    if (location.hash) {
      const target = decodeURIComponent(location.hash.slice(1))
      requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
      }))
      return
    }
    const saved = positions.current.get(location.key)
    if (navigationType === 'POP' && saved) window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' as ScrollBehavior })
    else window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.key, location.pathname, location.search, location.hash, navigationType])
  return null
}

function JoinEntry() {
  const location = useLocation()
  const invite = parseCloudInviteLocation(location.search, location.hash)
  return invite.token ? <CloudJoin /> : <JoinRoom />
}

function RouteLoading({ label = 'Loading page' }: { label?: string }) {
  return (
    <div className="grid min-h-[45dvh] place-items-center px-4 py-12" role="status" aria-live="polite" aria-label={label}>
      <div className="w-full max-w-xl" aria-hidden="true">
        <div className="loading-orb mx-auto" />
        <div className="skeleton-line mx-auto mt-6 h-5 w-44" />
        <div className="skeleton-line mx-auto mt-3 h-3.5 w-64 max-w-full" />
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="skeleton-card h-24" />
          <div className="skeleton-card h-24" />
          <div className="skeleton-card h-24" />
        </div>
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <Layout>
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
    </Layout>
  )
}

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="mb-3 text-6xl" aria-hidden="true">🧾</p>
        <h1 className="mb-1.5 text-[24px]">Page not found</h1>
        <p className="mb-5 text-[14.5px] text-ink-soft">The link is invalid or the page has moved. Choose one safe place to continue.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <a href="/room" className="btn-primary !px-6">Go to Home</a>
          <a href="/room/guide" className="btn-outline !px-6">Open Help</a>
        </div>
      </div>
    </div>
  )
}

function AppContent() {
  const { state } = useStore()
  return (
    <MotionConfig reducedMotion={state.profile.reduceMotion ? 'always' : 'user'}>
      <div className={state.profile.reduceMotion ? 'no-motion' : undefined}>
        <ThemeController />
        <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<div className="min-h-dvh bg-surface-page"><RouteLoading /></div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/demo" element={<Navigate to="/#demo" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/recover" element={<Recover />} />
            <Route path="/join" element={<JoinEntry />} />

            <Route path="/room" element={<Shell><Dashboard /></Shell>} />
            <Route path="/room/guide" element={<Shell><Guide /></Shell>} />
            <Route path="/room/about" element={<Shell><About /></Shell>} />
            <Route path="/room/my" element={<Navigate to="/room" replace />} />
            <Route path="/room/buy" element={<Shell><QuickBuy /></Shell>} />
            <Route path="/room/payments" element={<Shell><Payments /></Shell>} />
            <Route path="/room/history" element={<Shell><History /></Shell>} />
            <Route path="/room/insights" element={<Shell><Insights /></Shell>} />
            <Route path="/room/members" element={<Shell><Members /></Shell>} />
            <Route path="/room/rules" element={<Shell><Rules /></Shell>} />
            <Route path="/inbox" element={<Shell><Inbox /></Shell>} />
            <Route path="/settings" element={<Shell><Settings /></Shell>} />

            <Route path="/guide" element={<Navigate to="/room/guide" replace />} />
            <Route path="/help" element={<Navigate to="/room/guide" replace />} />
            <Route path="/home" element={<Navigate to="/room" replace />} />
            <Route path="/history" element={<Navigate to="/room/history" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </BrowserRouter>
      </div>
    </MotionConfig>
  )
}

export default function App() {
  return <StoreProvider><AppContent /></StoreProvider>
}
