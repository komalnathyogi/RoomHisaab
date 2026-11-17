import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'

export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const navigate = useNavigate()
  return <button type="button" onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback)} className="btn-outline !min-h-[42px] !px-2.5 sm:!px-3" aria-label="Go back to previous page" title="Back">
    <Icon name="arrowRight" size={17} className="rotate-180" /><span className="hidden sm:inline">Back</span>
  </button>
}
