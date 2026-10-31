import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PAGE_HELP } from '../lib/guide'
import { Icon } from './Icon'

export const PAGE_TIPS_HIDDEN_KEY = 'roomhisaab.pageTips.hidden.v1'

type HiddenTips = Record<string, boolean>

function loadHiddenTips(): HiddenTips {
  try {
    const raw = window.localStorage.getItem(PAGE_TIPS_HIDDEN_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as HiddenTips : {}
  } catch {
    return {}
  }
}

export function clearHiddenPageTips() {
  try {
    window.localStorage.removeItem(PAGE_TIPS_HIDDEN_KEY)
  } catch {
    // Storage may be unavailable in private browsing; the guide still works.
  }
}

export function PageHelp({ pathname }: { pathname: string }) {
  const [hiddenTips, setHiddenTips] = useState<HiddenTips>(() => loadHiddenTips())
  const [expanded, setExpanded] = useState(false)
  const help = PAGE_HELP[pathname]

  useEffect(() => {
    setExpanded(false)
  }, [pathname])

  if (!help || hiddenTips[pathname]) return null

  const helpId = `page-help-${pathname.replace(/[^a-z0-9]+/gi, '-')}`
  const detailsId = `${helpId}-details`

  const hideTip = () => {
    const next = { ...hiddenTips, [pathname]: true }
    setHiddenTips(next)
    try {
      window.localStorage.setItem(PAGE_TIPS_HIDDEN_KEY, JSON.stringify(next))
    } catch {
      // Hiding for this visit is enough if storage is unavailable.
    }
  }

  return (
    <section
      className="mb-4 overflow-hidden rounded-2xl border border-line-light border-l-4 border-l-primary bg-surface-card/95 p-3.5 shadow-card sm:p-4"
      aria-labelledby={helpId}
      data-testid="page-help"
    >
      <div className="flex items-start gap-3">
        <span className="icon-tile h-10 w-10 shrink-0"><Icon name="help" size={20} /></span>
        <div className="min-w-0 flex-1">
          <p id={helpId} className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
            Start here · {help.pageName}
          </p>
          <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">{help.purpose}</p>

        </div>

        <button
          type="button"
          onClick={hideTip}
          className="btn-ghost shrink-0 !px-2.5"
          aria-label={`Hide help for ${help.pageName}`}
          title="Hide this tip"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

          <div className="mt-3 grid grid-cols-2 items-center gap-2 sm:ml-[52px] sm:flex sm:flex-wrap">
            <Link to={help.actionTo} className="btn-primary col-span-2 !min-h-[40px] !px-3.5 !text-[13px] sm:col-auto">
              <Icon name="arrowRight" size={16} /> {help.actionLabel}
            </Link>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="btn-outline w-full !min-h-[40px] !px-2.5 !text-[13px] sm:w-auto sm:!px-3.5"
              aria-expanded={expanded}
              aria-controls={detailsId}
            >
              <Icon name={help.icon} size={16} /> {expanded ? 'Hide example' : 'First step'}
            </button>
            <Link to="/room/guide" className="btn-ghost w-full !min-h-[40px] !px-2.5 !text-[13px] sm:w-auto">
              Full guide
            </Link>
          </div>

      {expanded && (
        <div id={detailsId} className="mt-3 grid gap-2 border-t border-line-light pt-3 md:grid-cols-2">
          <div className="rounded-xl bg-surface-card2/75 px-3.5 py-3">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
              <Icon name={help.icon} size={15} /> Do this first
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{help.firstStep}</p>
          </div>
          <div className="rounded-xl bg-surface-card2/75 px-3.5 py-3">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
              <Icon name="sparkles" size={15} /> Easy example
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{help.example}</p>
          </div>
          <button type="button" onClick={hideTip} className="btn-ghost justify-self-start !min-h-[38px] !px-2.5 !text-[12.5px]">
            Hide this page tip
          </button>
        </div>
      )}
    </section>
  )
}
