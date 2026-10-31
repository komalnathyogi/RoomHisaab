import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { APP } from '../lib/constants'
import { text } from '../content/en'
import { useRoomData, useStore } from '../hooks/useStore'
import { useTheme } from '../hooks/useTheme'
import { createDemoSeed } from '../lib/seed'
import { Avatar } from './Avatar'
import { Toasts } from './Toasts'
import { PageHelp } from './PageHelp'
import { Icon, type IconName } from './Icon'
import { formatINR } from '../lib/money'
import { cycleLabelForRoom } from '../lib/balances'
import clsx from 'clsx'

interface NavItemDef { to: string; label: string; desc: string; icon: IconName; end?: boolean; badgeKey?: 'inbox' | 'pay' }

const GROUPS: { label: string; items: NavItemDef[] }[] = [
  { label: 'Main', items: [
    { to: '/room', label: text.navigation.home, desc: 'Your balance and next steps', icon: 'home', end: true },
    { to: '/room/history', label: text.navigation.expenses, desc: 'See and manage expenses', icon: 'receipt' },
    { to: '/room/payments', label: text.navigation.settle, desc: 'Pay or confirm a room payment', icon: 'wallet', badgeKey: 'pay' },
    { to: '/room/members', label: text.navigation.members, desc: 'Roommates and invites', icon: 'users' },
  ] },
  { label: 'Tools', items: [
    { to: '/room/insights', label: text.navigation.reports, desc: 'See where money went', icon: 'chart' },
    { to: '/inbox', label: text.navigation.importExpenses, desc: 'Use SMS, CSV, or voice', icon: 'clipboard', badgeKey: 'inbox' },
    { to: '/room/rules', label: text.navigation.recurringBills, desc: 'Manage regular room bills', icon: 'bolt' },
  ] },
  { label: 'Support', items: [
    { to: '/room/about', label: 'About Us', desc: 'About RoomHisaab and its developer', icon: 'sparkles' },
    { to: '/room/guide', label: text.navigation.help, desc: 'Get help with RoomHisaab', icon: 'help' },
    { to: '/settings', label: text.navigation.settings, desc: 'Profile, backup, and safety', icon: 'settings' },
  ] },
]

const ease = [0.4, 0, 0.2, 1] as const

export function Layout({ children }: { children: ReactNode }) {
  const { state, cloud, isCloudRoomActive, cloudLogout, exitDemo, resetDemo, loadDemo, setCurrentMember } = useStore()
  const { room, members, expenses, me } = useRoomData()
  const { theme, setTheme } = useTheme()
  const loc = useLocation()
  const nav = useNavigate()
  const [palette, setPalette] = useState(false)
  const [mobileSheet, setMobileSheet] = useState<'add' | 'more' | null>(null)
  const [demoMemberPicker, setDemoMemberPicker] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const quickPayNavigationLockRef = useRef(false)
  const isPersonal = members.filter((member) => !member.isVirtual).length <= 1
  const navGroups = useMemo<{ label: string; items: NavItemDef[] }[]>(() => isPersonal ? [
    { label: 'Main', items: [
      { to: '/room', label: 'Home', desc: 'Your spending and bills', icon: 'home' as const, end: true },
      { to: '/room/history', label: 'Expenses', desc: 'Find and manage expenses', icon: 'receipt' as const },
      { to: '/room/insights', label: 'Reports', desc: 'See your spending', icon: 'chart' as const },
    ] },
    { label: 'Tools', items: [
      { to: '/inbox', label: 'Import Expenses', desc: 'Use SMS, CSV, or voice', icon: 'clipboard' as const, badgeKey: 'inbox' as const },
      { to: '/room/rules', label: 'Recurring Bills', desc: 'Manage regular bills', icon: 'bolt' as const },
    ] },
    { label: 'More', items: [
      { to: '/room/members?add=1', label: 'Add Roommates', desc: 'Split future expenses', icon: 'users' as const },
      { to: '/room/about', label: 'About Us', desc: 'About RoomHisaab and its developer', icon: 'sparkles' as const },
      { to: '/room/guide', label: 'Help', desc: 'Get help with RoomHisaab', icon: 'help' as const },
      { to: '/settings', label: 'Settings', desc: 'Profile, backup, and safety', icon: 'settings' as const },
    ] },
  ] : GROUPS, [isPersonal])

  const pending = state.inbox.filter((i) => i.status === 'new').length
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

  const go = (to: string) => { setPalette(false); setMobileSheet(null); nav(to) }
  const openQuickPay = () => {
    if (quickPayNavigationLockRef.current) return
    quickPayNavigationLockRef.current = true
    setPalette(false)
    setMobileSheet(null)
    nav('/room/buy?mode=scan')
    window.setTimeout(() => { quickPayNavigationLockRef.current = false }, 700)
  }

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
        <NavLink to="/room" className="relative px-5 pt-6 pb-5 flex items-center gap-3" aria-label="Go to Home" title="Home">
          <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-[#4F46C8] to-[#A8A0FF] text-white shadow-fab">
            <Icon name="rupee" size={23} strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="block font-display font-bold text-[18px] leading-none">{APP.name}</span>
            <span className="block text-[11.5px] text-[#A9C4B5] mt-1 truncate">{room?.name ?? 'Shared room money notebook'}</span>
          </span>
        </NavLink>

        <div className="relative mx-4 mb-4 grid gap-2">
          <button type="button" onClick={() => go('/room?add=1')} className="btn-primary w-full !justify-start !px-3.5 !py-2.5">
            <Icon name="plus" size={18} /> Add Expense
          </button>
          <button type="button" onClick={openQuickPay} className="btn-outline w-full !justify-start !border-white/20 !bg-white/5 !px-3.5 !py-2.5 !text-white hover:!bg-white/10">
            <Icon name="scan" size={18} /> Quick Pay
          </button>
        </div>

        <button onClick={() => setPalette(true)} className="relative mx-4 mb-5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-left text-[#C5C3E1] hover:bg-white/10">
          <Icon name="search" size={17} />
          <span className="flex-1 whitespace-nowrap text-[13px]">Search</span>
          <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold">Ctrl K</kbd>
        </button>

        <nav className="relative flex-1 overflow-y-auto scrollbar-thin px-3 pb-3" aria-label="Primary">
          {navGroups.map((g) => (
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
            <span className="block font-display text-[13.5px] font-bold leading-tight">Need help?</span>
            <span className="block text-[11px] leading-snug text-[#C5C3E1]">Read the quick guide</span>
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
          <NavLink to="/room" className="lg:hidden grid place-items-center h-10 w-10 min-h-[40px] rounded-2xl bg-primary-solid text-primary-on shadow-fab" aria-label="Go to Home" title="Home">
            <Icon name="rupee" size={21} />
          </NavLink>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-[15px] leading-none truncate">{isPersonal && !room?.demo ? 'My Expenses' : room?.name ?? APP.name}</p>
            <p className="text-[11px] text-ink-soft mt-1 truncate">{room ? (room.demo ? `Demo Mode · ${members.length} sample members` : isPersonal ? 'Personal Room' : `${members.length} members · ${isCloudRoomActive ? `@${cloud.username}` : room.code}`) : APP.tagline}</p>
          </div>
          <button onClick={() => setPalette(true)} className="hidden md:flex items-center gap-2 rounded-xl border border-line-light bg-surface-card px-3 text-ink-soft min-w-[190px]">
            <Icon name="search" size={17} /><span className="flex-1 text-left text-[13px]">Search</span><kbd className="text-[10px] font-bold bg-ink/5 rounded px-1.5 py-0.5">Ctrl K</kbd>
          </button>
          <NavLink to="/room/guide" className="btn-outline !min-h-[42px] !px-2.5 sm:!px-3.5" aria-label="Open Help" title="Help">
            <Icon name="help" size={18} /><span className="hidden xl:inline">Help</span>
          </NavLink>
          <button onClick={() => go('/room?add=1')} className="btn-primary !px-3.5 !py-2 !min-h-[42px]">
            <Icon name="plus" size={18} /><span className="hidden sm:inline">Add Expense</span><span className="sm:hidden">Add</span>
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
          {room?.demo && <section className="mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-primary/30 bg-primary/10 p-3.5" aria-label="Demo mode controls">
            <span className="icon-tile h-10 w-10"><Icon name="sparkles" size={20} /></span>
            <div className="min-w-[150px] flex-1"><p className="text-[13.5px] font-bold">Demo Mode — Sample Data</p><p className="text-[11.5px] text-ink-soft">Viewing as {me?.name ?? 'You'} · No real payments</p></div>
            {members.filter((member) => !member.isVirtual).length > 1 && <button type="button" className="btn-outline !min-h-[40px] !px-3 !text-[12px]" onClick={() => setDemoMemberPicker(true)}>Switch Member</button>}
            <button type="button" className="btn-outline !min-h-[40px] !px-3 !text-[12px]" onClick={() => { if (window.confirm('Reset this sample demo? Your demo changes will be removed.')) void resetDemo() }}>Reset Demo</button>
            <button type="button" className="btn-outline !min-h-[40px] !px-3 !text-[12px]" onClick={() => void loadDemo({ memberCount: members.filter((member) => !member.isVirtual).length, seed: createDemoSeed() })}>Generate New Demo</button>
            <button type="button" className="btn-ghost !min-h-[40px] !px-3 !text-[12px]" onClick={() => void handleLeave()}>Exit Demo</button>
          </section>}
          <PageHelp pathname={loc.pathname} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: state.profile.reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: state.profile.reduceMotion ? 0 : -4 }} transition={{ duration: state.profile.reduceMotion ? 0 : 0.18, ease }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile navigation: Home, Expenses, Add, Settle Up, More */}
      <nav className="mobile-nav-3d lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line-light bg-surface-card/95 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom,0px)' }} aria-label="Mobile">
        <div className="grid grid-cols-5 max-w-xl mx-auto items-end">
          <MobileLink to="/room" label="Home" icon="home" end />
          <MobileLink to="/room/history" label="Expenses" icon="receipt" />
          <button type="button" onClick={() => setMobileSheet('add')} aria-label="Add" className="relative flex flex-col items-center gap-1 py-2.5 min-h-[60px] text-primary">
            <span className="-mt-6 grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br from-primary-solid to-accent-solid text-white shadow-fab border-4 border-surface-page"><Icon name="plus" size={24} /></span>
            <span className="text-[10.5px] font-bold -mt-0.5">Add</span>
          </button>
          {isPersonal ? <MobileLink to="/room/insights" label="Reports" icon="chart" /> : <MobileLink to="/room/payments" label={text.navigation.settle} icon="wallet" />}
          <button type="button" onClick={() => setMobileSheet('more')} aria-expanded={mobileSheet === 'more'} aria-label="More" className={clsx('flex flex-col items-center gap-1 py-2.5 min-h-[60px]', mobileSheet === 'more' ? 'text-primary' : 'text-ink-soft')}><Icon name="settings" size={21} /><span className="text-[10.5px] font-semibold">More</span></button>
        </div>
      </nav>
      <AnimatePresence>
        {mobileSheet && <motion.div className="fixed inset-0 z-[140] lg:hidden flex items-end" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
          <button className="absolute inset-0 bg-ink/50" aria-label="Close menu" onClick={() => setMobileSheet(null)} />
          <motion.div role="dialog" aria-modal="true" aria-label={mobileSheet === 'add' ? 'Add to your room' : 'More options'} initial={{y:30}} animate={{y:0}} exit={{y:30}} className="relative w-full rounded-t-[26px] bg-surface-card p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lift3d">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/15" />
            <h2 className="text-[20px] mb-1">{mobileSheet === 'add' ? 'What do you want to do?' : 'More options'}</h2>
            <p className="text-[13px] text-ink-soft mb-4">{mobileSheet === 'add' ? 'Choose one action to continue.' : 'Open another RoomHisaab page.'}</p>
            {mobileSheet === 'add' ? <div className="grid gap-2">
              <SheetLink icon="receipt" label="Add Expense" detail="Record an expense manually" onClick={() => go('/room?add=1')} />
              <SheetLink icon="scan" label="Quick Pay" detail="Enter purchase details, then scan a seller QR" onClick={openQuickPay} />
              <SheetLink icon="clipboard" label="Import Expenses" detail="Add from SMS, CSV, or voice" onClick={() => go('/inbox')} />
            </div> : <div className="grid grid-cols-2 gap-2">
              {isPersonal ? <SheetLink icon="users" label="Add Roommates" onClick={() => go('/room/members?add=1')} /> : <SheetLink icon="users" label="Members" onClick={() => go('/room/members')} />}
              <SheetLink icon="chart" label="Reports" onClick={() => go('/room/insights')} />
              <SheetLink icon="clipboard" label="Import Expenses" onClick={() => go('/inbox')} />
              <SheetLink icon="bolt" label="Recurring Bills" onClick={() => go('/room/rules')} />
              <SheetLink icon="sparkles" label="About Us" onClick={() => go('/room/about')} />
              <SheetLink icon="help" label="Help" detail="Start Guided Tour" onClick={() => go('/room/guide')} />
              <SheetLink icon="settings" label="Settings" onClick={() => go('/settings')} />
            </div>}
            <button onClick={() => setMobileSheet(null)} className="btn-ghost w-full mt-3 justify-center">Close</button>
          </motion.div>
        </motion.div>}
      </AnimatePresence>

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
                <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for a page or expense…"
                  className="flex-1 h-[54px] bg-transparent outline-none text-[16px]" aria-label="Find a task, expense, or member" />
                <button onClick={() => setPalette(false)} className="btn-ghost !px-2" aria-label="Close"><Icon name="x" /></button>
              </div>
              <div className="max-h-[58dvh] overflow-y-auto scrollbar-thin p-2.5">
                <p className="label px-2.5 pt-1.5">Quick actions</p>
                <PaletteBtn icon="help" label="Open Help" sub="Simple help and answers" onClick={() => go('/room/guide')} />
                <PaletteBtn icon="receipt" label="Add Expense" sub="Record an expense manually" onClick={() => go('/room?add=1')} />
                <PaletteBtn icon="scan" label="Quick Pay" sub="Enter purchase details before scanning or paying" onClick={openQuickPay} />
                <PaletteBtn icon="qr" label="Settle Up" sub="Pay a room balance by UPI or cash" onClick={() => go('/room/payments')} />
                <PaletteBtn icon="users" label="See room balances" sub="See your share and recent expenses" onClick={() => go('/room/my')} />
                <PaletteBtn icon="sparkles" label="Import Expenses" sub="Use a bank SMS, CSV file, or voice" onClick={() => go('/inbox')} />
                <PaletteBtn icon="users" label="Manage members" sub="Invite roommates and update details" onClick={() => go('/room/members')} />

                {results.length > 0 && <>
                  <p className="label px-2.5 pt-3">Expenses</p>
                  {results.map((e) => <PaletteBtn key={e.id} icon="receipt" label={e.description} sub={formatINR(e.amountPaise)} onClick={() => go('/room/history')} />)}
                </>}
                {memberResults.length > 0 && <>
                  <p className="label px-2.5 pt-3">Members</p>
                  {memberResults.map((m) => <PaletteBtn key={m.id} icon="users" label={m.name} sub={m.upiId ?? 'Add UPI ID'} onClick={() => go('/room/members')} />)}
                </>}
                {query && !results.length && !memberResults.length && <p className="px-3 py-5 text-center text-[13px] text-ink-soft">No saved expense or member matches "{query}". Try the Help search for tasks and meanings.</p>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {demoMemberPicker && room?.demo && <motion.div className="fixed inset-0 z-[170] grid place-items-center bg-ink/55 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section role="dialog" aria-modal="true" aria-labelledby="demo-member-title" className="w-full max-w-sm rounded-3xl bg-surface-card p-5 shadow-lift3d" initial={{ y: 12, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, scale: .98 }}>
            <h2 id="demo-member-title" className="text-[20px]">Choose a Demo Member</h2>
            <p className="mt-1 text-[13px] text-ink-soft">The sample room stays the same. Only the view changes.</p>
            <div className="mt-4 grid gap-2">{members.filter((member) => !member.isVirtual).map((member) => <button type="button" key={member.id} onClick={() => { setCurrentMember(member.id); setDemoMemberPicker(false) }} aria-pressed={me?.id === member.id} className={clsx('flex min-h-[48px] items-center gap-3 rounded-2xl border p-3 text-left', me?.id === member.id ? 'border-primary bg-primary/10' : 'border-line-light')}><Avatar name={member.name} color={member.color} size={32} /><span className="flex-1 font-semibold">{member.name}</span>{me?.id === member.id && <Icon name="check" size={18} className="text-primary" />}</button>)}</div>
            <button type="button" className="btn-outline mt-4 w-full" onClick={() => setDemoMemberPicker(false)}>Close</button>
          </motion.section>
        </motion.div>}
      </AnimatePresence>
      <Toasts />
    </div>
  )
}

function MobileLink({to,label,icon,end=false}:{to:string;label:string;icon:IconName;end?:boolean}) {
  return <NavLink to={to} end={end} className={({isActive})=>clsx('flex flex-col items-center gap-1 py-2.5 min-h-[60px]',isActive?'text-primary':'text-ink-soft')}><Icon name={icon} size={21}/><span className="whitespace-nowrap text-[9.5px] font-semibold">{label}</span></NavLink>
}
function SheetLink({icon,label,detail,onClick}:{icon:IconName;label:string;detail?:string;onClick:()=>void}) {
  return <button onClick={onClick} className="flex items-center gap-3 rounded-2xl border border-line-light bg-surface-card p-3.5 text-left hover:bg-surface-alt"><span className="icon-tile h-10 w-10"><Icon name={icon} size={20}/></span><span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span>{detail&&<span className="block text-[12px] text-ink-soft">{detail}</span>}</span><Icon name="arrowRight" size={16}/></button>
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
