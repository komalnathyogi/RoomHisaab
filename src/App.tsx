// Route-level code splitting keeps the first download small. Heavy pages,
// charts, and motion code load only when their route is opened.
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { StoreProvider } from './hooks/useStore'
import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import { parseCloudInviteLocation } from './lib/cloud'
import { useTheme } from './hooks/useTheme'

const Landing = lazy(() => import('./pages/Landing'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Login = lazy(() => import('./pages/Login'))
const Recover = lazy(() => import('./pages/Recover'))
const JoinRoom = lazy(() => import('./pages/JoinRoom'))
const CloudJoin = lazy(() => import('./pages/CloudJoin'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const MyDashboard = lazy(() => import('./pages/MyDashboard'))
const QuickBuy = lazy(() => import('./pages/QuickBuy'))
const History = lazy(() => import('./pages/History'))
const Insights = lazy(() => import('./pages/Insights'))
const Members = lazy(() => import('./pages/Members'))
const Inbox = lazy(() => import('./pages/Inbox'))
const Rules = lazy(() => import('./pages/Rules'))
const Payments = lazy(() => import('./pages/Payments'))
const Settings = lazy(() => import('./pages/Settings'))
const Guide = lazy(() => import('./pages/Guide'))
const Layout = lazy(() => import('./components/Layout').then((module) => ({ default: module.Layout })))

function ThemeController() {
  useTheme()
  return null
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) }, [pathname])
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
          <a href="/room" className="btn-primary !px-6">Go to Room Home</a>
          <a href="/room/guide" className="btn-outline !px-6">Open Help & Guide</a>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <ThemeController />
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<div className="min-h-dvh bg-surface-page"><RouteLoading /></div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/login" element={<Login />} />
            <Route path="/recover" element={<Recover />} />
            <Route path="/join" element={<JoinEntry />} />

            <Route path="/room" element={<Shell><Dashboard /></Shell>} />
            <Route path="/room/guide" element={<Shell><Guide /></Shell>} />
            <Route path="/room/my" element={<Shell><MyDashboard /></Shell>} />
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
    </StoreProvider>
  )
}
