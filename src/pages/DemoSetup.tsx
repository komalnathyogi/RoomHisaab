import { Navigate } from 'react-router-dom'

// Keep legacy /demo links working while the landing page owns the one-step demo selector.
export default function DemoSetup() {
  return <Navigate to="/#demo" replace />
}
