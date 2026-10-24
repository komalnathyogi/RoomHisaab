import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { APP } from '../lib/constants'
import { useRoomData, useStore } from '../hooks/useStore'
import { useTheme } from '../hooks/useTheme'
import { useAdvancedMode } from '../hooks/useAdvancedMode'
import { Avatar } from './Avatar'
import { Toasts } from './Toasts'
import { PageHelp } from './PageHelp'
import { Icon, type IconName } from './Icon'
import { formatINR } from '../lib/money'
import { cycleLabelForRoom } from '../lib/balances'
import clsx from 'clsx'

interface NavItemDef { to: string; label: string; desc: string; icon: IconName; end?: boolean; badgeKey?: 'inbox' | 'pay' }

const GROUPS: { label: string; items: NavItemDef[] }[] = [
  {
    label: 'Daily use',
    items: [
      { to: '/room', label: 'Room Home', desc: 'See balances and the next step', icon: 'home', end: true },
      { to: '/room/guide', label: 'Help & Guide', desc: 'Learn every page in 2 minutes', icon: 'help' },
      { to: '/room/buy', label: 'Quick Buy', desc: 'I bought something · add it', icon: 'scan' },
      { to: '/room/payments', label: 'Payments', desc: 'Pay money that is pending', icon: 'qr', badgeKey: 'pay' },
      { to: '/room/my', label: 'My Dashboard', desc: 'Only my money and my share', icon: 'users' },
      { to: '/inbox', label: 'Auto Capture', desc: 'Add by SMS, file, or voice', icon: 'sparkles', badgeKey: 'inbox' },
    ],
  },
  {
    label: 'Records',
    items: [
      { to: '/room/history', label: 'Expenses & History', desc: 'See every past bill', icon: 'receipt' },
      { to: '/room/insights', label: 'Reports', desc: 'Charts: where money went', icon: 'chart' },
    ],
  },
  {
    label: 'Set up once',
    items: [
      { to: '/room/members', label: 'Members & UPI', desc: 'People, invite link, UPI IDs', icon: 'users' },
      { to: '/room/rules', label: 'Automation', desc: 'Monthly bills add automatically', icon: 'bolt' },
      { to: '/settings', label: 'Settings', desc: 'Login safety, backup, theme', icon: 'settings' },
    ],
  },
]

const MOBILE_NAV: NavItemDef[] = [
  { to: '/room', label: 'Home', desc: '', icon: 'home', end: true },
  { to: '/room/buy', label: 'Add', desc: '', icon: 'scan' },
  { to: '/room/payments', label: 'Pay', desc: '', icon: 'qr', badgeKey: 'pay' },
  { to: '/room/my', label: 'Mine', desc: '', icon: 'users' },
  { to: '/room/guide', label: 'Guide', desc: '', icon: 'help' },
]

const ease = [0.4, 0, 0.2, 1] as const

export function Layout({ children }: { children: ReactNode }) {
  const { state, cloud, isCloudRoomActive, cloudLogout, exitDemo } = useStore()
  const { room, members, expenses, me } = useRoomData()
  const { theme, setTheme } = useTheme()
  const [advancedMode] = useAdvancedMode()
  const loc = useLocation()
  const nav = useNavigate()
  const [palette, setPalette] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const pending = state.inbox.filter((i) => i.status === 'new').length
  const hasSharedMembers = members.filter((m) => !m.isVirtual).length > 1
  const visibleGroups = advancedMode ? GROUPS : [
    { label: 'Daily use', items: GROUPS[0].items.filter((item) => ['Room Home', 'Quick Buy', 'Payments'].includes(item.label) && (item.label !== 'Payments' || hasSharedMembers)) },
    { label: 'Set up once', items: GROUPS[2].items.filter((item) => ['Members & UPI', 'Settings'].includes(item.label)) },
  ]
  const visibleMobileNav = advancedMode ? MOBILE_NAV : [
    MOBILE_NAV[0], MOBILE_NAV[1], ...(hasSharedMembers ? [MOBILE_NAV[2]] : []),
    { to: '/room/members', label: 'People', desc: '', icon: 'users' as const },
    { to: '/settings', label: 'Settings', desc: '', icon: 'settings' as const },
  ]
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const badgeFor = (key?: 'inbox' | 'pay') => key === 'inbox' ? pending : 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
      if (e.key === 'Escape') setPalette(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (palette) setTimeout(() => searchRef.current?.focus(), 60)
    else setQuery('')
  }, [palette])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return expenses.filter((e) => !e.deleted && e.description.toLowerCase().includes(q)).slice(0, 6)
  }, [expenses, query])

  const memberResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return members.filter((m) => m.name.toLowerCase().includes(q) || m.fullName?.toLowerCase().includes(q)).slice(0, 4)
  }, [members, query])

  const go = (to: string) => { setPalette(false); nav(to) }

  const handleLeave = async () => {
    if (state.room?.demo) {
      if (!window.confirm('Close the sample demo? Its sample room will be removed from this device.')) return
      await exitDemo()
      nav('/')
      return
    }
    if (isCloudRoomActive) {
      if (!window.confirm('Sign out of RoomHisaab on this device? Your cloud room stays safe.')) return
      await cloudLogout()
      nav('/login')
      return
    }
    nav('/')
  }

  const leaveLabel = state.room?.demo ? 'Exit demo' : isCloudRoomActive ? 'Sign out' : 'Exit room'

  return (
    <div className={clsx('app-shell min-h-dvh bg-surface-page text-ink', state.profile.reduceMotion && 'no-motion')}>
      {/* ───────── DESKTOP BRAND SIDEBAR ───────── */}
      <aside className="shell-3d hidden lg:flex fixed inset-y-0 left-0 w-[278px] flex-col z-40 bg-[#15172F] text-[#F1F0FF] border-r border-white/10 overflow-hidden">
        <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-[#4F46C8]/25 blur-3xl" aria-hidden="true" />
        <NavLink to="/room" className="relative px-5 pt-6 pb-5 flex items-center gap-3" aria-label="Go to room home" title="Room home">
          <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-[#4F46C8] to-[#A8A0FF] text-white shadow-fab">
            <Icon name="rupee" size={23} strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="block font-display font-bold text-[18px] leading-none">{APP.name}</span>
            <span className="block text-[11.5px] text-[#A9C4B5] mt-1 truncate">{room?.name ?? 'Shared room money notebook'}</span>
          </span>
        </NavLink>

        <button onClick={() => setPalette(true)} className="relative mx-4 mb-5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-left text-[#C5C3E1] hover:bg-white/10">
          <Icon name="search" size={17} />
          <span className="flex-1 whitespace-nowrap text-[13px]">Find a task…</span>
          <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold">Ctrl K</kbd>
        </button>

        <nav className="relative flex-1 overflow-y-auto scrollbar-thin px-3 pb-3" aria-label="Primary">
          {visibleGroups.map((g) => (
            <div key={g.label} className="mb-5">
              <p className="px-2.5 mb-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#A7A5C9]">{g.label}</p>
              <div className="space-y-1">
                {g.items.map((n) => <SideItem key={n.to} {...n} badge={badgeFor(n.badgeKey)} />)}
              </div>
            </div>
          ))}
        </nav>

        <NavLink to="/room/guide" className="relative mx-4 mb-4 flex items-center gap-3 rounded-2xl border border-[#8678FF]/35 bg-[#4F46C8]/20 px-3.5 py-3 text-left hover:bg-[#4F46C8]/25">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#3C34A3]"><Icon name="help" size={20} /></span>
          <span className="min-w-0">
            <span className="block font-display text-[13.5px] font-bold leading-tight">New here?</span>
            <span className="block text-[11px] leading-snug text-[#C5C3E1]">Start with the 2-minute guide</span>
          </span>
          <Icon name="arrowRight" size={16} className="ml-auto shrink-0 text-[#C5C3E1]" />
        </NavLink>

        <div className="relative p-4 border-t border-white/10 space-y-3">
          {room && (
            <div className="rounded-2xl bg-gradient-to-br from-[#4F46C8]/35 to-[#DE7726]/20 border border-white/10 px-3.5 py-3">
              <p className="text-[10.5px] uppercase tracking-[0.14em] text-[#C5C3E1] font-bold">{isCloudRoomActive ? 'Room Login ID' : 'Room code'}</p>
              <p className="font-display font-bold tracking-[0.12em] text-[17px] break-words">{isCloudRoomActive ? (room.loginId ?? cloud.roomLoginId ?? room.code) : room.code}</p>
              <p className="text-[11px] text-[#A9C4B5]">{members.length} members · {cycleLabelForRoom(room)}{isCloudRoomActive ? ` · @${cloud.username}` : ''}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold flex-1">Theme</span>
            {([['light', 'sun'], ['dark', 'moon'], ['system', 'system']] as const).map(([k, icon]) => (
              <button key={k} onClick={() => setTheme(k)} aria-label={`${k} theme`} aria-pressed={theme === k}
                className={clsx('h-10 w-10 min-h-[40px] rounded-xl border grid place-items-center transition-all active:scale-95',
                  theme === k ? 'border-[#A8A0FF] bg-[#4F46C8] text-white' : 'border-white/10 bg-white/5 text-[#C5C3E1]')}>
                <Icon name={icon} size={18} />
              </button>
            ))}
          </div>
          {me && (
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={me.name} color={me.color} size={32} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold truncate">{me.name}</span>
                <span className="block text-[11px] text-[#A9C4B5] truncate">{room?.demo ? 'Sample demo · not a real account' : me.upiId ? `UPI · ${me.upiId}` : 'UPI profile incomplete'}</span>
              </span>
            </div>
          )}
          <button onClick={() => void handleLeave()} className="relative flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 text-left text-[12.5px] font-semibold text-[#D9E7E0] hover:bg-white/10">
            <Icon name="logout" size={17} /> {leaveLabel}
          </button>
        </div>
      </aside>

      {/* ───────── TOP BAR ───────── */}
      <header className="topbar-3d sticky top-0 z-40 lg:ml-[278px] border-b border-line-light bg-surface-page/90 backdrop-blur-xl">
        <div className="mx-auto max-w-content px-4 sm:px-6 lg:px-9 h-[64px] flex items-center gap-3">
          <NavLink to="/room" className="lg:hidden grid place-items-center h-10 w-10 min-h-[40px] rounded-2xl bg-primary-solid text-primary-on shadow-fab" aria-label="Go to room home" title="Room home">
            <Icon name="rupee" size={21} />
          </NavLink>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-[15px] leading-none truncate">{room?.name ?? APP.name}</p>
            <p className="text-[11px] text-ink-soft mt-1 truncate">{room ? (room.demo ? `${members.length} members · DEMO · sample only` : `${members.length} members · ${isCloudRoomActive ? `@${cloud.username}` : room.code}`) : APP.tagline}</p>
          </div>
          <button onClick={() => setPalette(true)} className="hidden md:flex items-center gap-2 rounded-xl border border-line-light bg-surface-card px-3 text-ink-soft min-w-[190px]">
            <Icon name="search" size={17} /><span className="flex-1 text-left text-[13px]">Find a task</span><kbd className="text-[10px] font-bold bg-ink/5 rounded px-1.5 py-0.5">Ctrl K</kbd>
          </button>
          <NavLink to="/room/guide" className="btn-outline !min-h-[42px] !px-2.5 sm:!px-3.5" aria-label="Open Help and Guide" title="Help & Guide">
            <Icon name="help" size={18} /><span className="hidden xl:inline">Help</span>
          </NavLink>
          <button onClick={() => go('/room?add=1')} className="btn-primary !px-3.5 !py-2 !min-h-[42px]">
            <Icon name="plus" size={18} /><span className="hidden sm:inline">Add expense</span><span className="sm:hidden">Add</span>
          </button>
          <button onClick={() => void handleLeave()} className="btn-ghost !min-h-[42px] !w-[42px] !px-2 xl:!w-auto xl:!px-3 whitespace-nowrap" aria-label={leaveLabel} title={leaveLabel}>
            <Icon name="logout" size={18} /><span className="hidden xl:inline">{leaveLabel}</span>
          </button>
          <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="btn-ghost !hidden !px-2.5 min-[480px]:!inline-flex lg:!hidden" aria-label="Change theme">
            <Icon name={isDark ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>

      {/* ───────── MAIN ───────── */}
      <main className="min-w-0 lg:pl-[278px] pb-safe lg:pb-12">
        <div className="mx-auto w-full max-w-content px-4 sm:px-6 lg:px-9 py-5 lg:py-8">
          <PageHelp pathname={loc.pathname} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: state.profile.reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: state.profile.reduceMotion ? 0 : -4 }} transition={{ duration: state.profile.reduceMotion ? 0 : 0.18, ease }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ───────── MOBILE NAV with center Pay ───────── */}
      <nav className="mobile-nav-3d lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line-light bg-surface-card/95 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom,0px)' }} aria-label="Mobile">
        <div className="grid grid-cols-5 max-w-xl mx-auto items-end">
          {visibleMobileNav.map((n) => {
            const center = n.label === 'Pay'
            return (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => clsx('relative flex flex-col items-center gap-1 py-2.5 min-h-[60px]', isActive ? 'text-primary' : 'text-ink-soft')}>
                {center ? (
                  <>
                    <span className="-mt-6 grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br from-primary-solid to-accent-solid text-white shadow-fab border-4 border-surface-page"><Icon name="qr" size={23} /></span>
                    <span className="text-[10.5px] font-bold -mt-0.5">{n.label}</span>
                  </>
                ) : (
                  <>
                    <span className="relative"><Icon name={n.icon} size={21} />
                      {badgeFor(n.badgeKey) > 0 && <span className="badge-alert absolute -top-1.5 -right-3 grid place-items-center min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold">{badgeFor(n.badgeKey)}</span>}
                    </span>
                    <span className="text-[10.5px] font-semibold">{n.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}
        </div>
      </nav>

      {/* ───────── COMMAND PALETTE ───────── */}
      <AnimatePresence>
        {palette && (
          <motion.div className="fixed inset-0 z-[160] flex items-start justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[8dvh] sm:pt-[10dvh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/55 sm:backdrop-blur-[3px]" onClick={() => setPalette(false)} aria-hidden="true" />
            <motion.div role="dialog" aria-modal="true" aria-label="Find a task"
              initial={{ opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }}
              transition={{ duration: .2, ease }} className="relative w-full max-w-xl rounded-[22px] bg-surface-card border border-line-light shadow-lift3d overflow-hidden">
              <div className="flex items-center gap-3 px-4 border-b border-line-light">
                <Icon name="search" className="text-ink-soft" />
                <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type: add, pay, invite…"
                  className="flex-1 h-[54px] bg-transparent outline-none text-[16px]" aria-label="Find a task, expense, or member" />
                <button onClick={() => setPalette(false)} className="btn-ghost !px-2" aria-label="Close"><Icon name="x" /></button>
              </div>
              <div className="max-h-[58dvh] overflow-y-auto scrollbar-thin p-2.5">
                <p className="label px-2.5 pt-1.5">I want to...</p>
                <PaletteBtn icon="help" label="Learn how RoomHisaab works" sub="2-minute guide, examples, and page map" onClick={() => go('/room/guide')} />
                <PaletteBtn icon="scan" label="Add something I bought" sub="Quick Buy · Pay now or Already paid" onClick={() => go('/room/buy')} />
                <PaletteBtn icon="plus" label="Add a bill with a special split" sub="Choose payer, people, percent, or exact shares" onClick={() => go('/room?add=1')} />
                <PaletteBtn icon="qr" label="Pay pending money" sub="Exact QR or open my UPI app" onClick={() => go('/room/payments')} />
                <PaletteBtn icon="users" label="See only my money" sub="My payments, my share, my balance" onClick={() => go('/room/my')} />
                <PaletteBtn icon="sparkles" label="Avoid typing" sub="Auto Capture from SMS, CSV, or voice" onClick={() => go('/inbox')} />
                <PaletteBtn icon="users" label="Invite a roommate or add UPI ID" sub="Members, join link, and payment profiles" onClick={() => go('/room/members')} />

                {results.length > 0 && <>
                  <p className="label px-2.5 pt-3">Expenses</p>
                  {results.map((e) => <PaletteBtn key={e.id} icon="receipt" label={e.description} sub={formatINR(e.amountPaise)} onClick={() => go('/room/history')} />)}
                </>}
                {memberResults.length > 0 && <>
                  <p className="label px-2.5 pt-3">Members</p>
                  {memberResults.map((m) => <PaletteBtn key={m.id} icon="users" label={m.name} sub={m.upiId ?? 'Add UPI ID'} onClick={() => go('/room/members')} />)}
                </>}
                {query && !results.length && !memberResults.length && <p className="px-3 py-5 text-center text-[13px] text-ink-soft">No saved expense or member matches "{query}". Try the Help & Guide search for tasks and meanings.</p>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toasts />
    </div>
  )
}

function SideItem({ to, label, desc, icon, end, badge }: NavItemDef & { badge: number }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => clsx(
      'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all',
      isActive ? 'bg-gradient-to-r from-[#5046C8] to-[#5F53DA] text-white shadow-fab' : 'text-[#E9E8FA] hover:bg-white/10',
    )}>
      {({ isActive }) => (
        <>
          <Icon name={icon} size={20} />
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-semibold leading-tight">{label}</span>
            <span className={clsx('block text-[11px] truncate', isActive ? 'text-white/75' : 'text-[#8FAE9F]')}>{desc}</span>
          </span>
          {badge > 0 && <span className="badge-alert grid place-items-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold">{badge}</span>}
        </>
      )}
    </NavLink>
  )
}

function PaletteBtn({ icon, label, sub, onClick }: { icon: IconName; label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-start gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-primary/10 transition-colors">
      <span className="icon-tile h-10 w-10"><Icon name={icon} size={19} /></span>
      <span className="flex-1 min-w-0"><span className="block text-[14px] font-semibold leading-snug">{label}</span><span className="block text-[11.5px] leading-snug text-ink-soft">{sub}</span></span>
      <Icon name="arrowUpRight" size={16} className="text-ink-faint" />
    </button>
  )
}

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1 basis-64">
        <span className="mb-2 block h-1 w-11 rounded-full bg-accent" aria-hidden="true" />
        <h1 className="text-[24px] sm:text-[29px]">{title}</h1>
        {sub && <p className="text-ink-soft text-[14px] mt-1">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 flex-wrap gap-2">{right}</div>}
    </div>
  )
}
