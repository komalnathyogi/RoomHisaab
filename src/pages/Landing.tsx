import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { APP } from '../lib/constants'
import { Icon } from '../components/Icon'
import { useStore } from '../hooks/useStore'
import { useTheme } from '../hooks/useTheme'
import { AboutRoomHisaab } from '../components/AboutRoomHisaab'
import { BackButton } from '../components/BackButton'
import { createDemoSeed } from '../lib/seed'
import { formatINR, parseRupeesToPaise, splitEqual } from '../lib/money'
import { AnimatePresence, motion } from 'framer-motion'

// Decorative WebGL is optional: retry a transient module fetch once, then
// resolve to the in-file static visual so a chunk/network hiccup never blanks Landing.
const LazyHero3D = lazy(async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await import('../components/Hero3D') }
    catch (error) {
      if (attempt === 1) {
        console.warn('[RoomHisaab] 3D hero unavailable; showing static preview.', error)
        return { default: HeroFallback }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 320))
    }
  }
  return { default: HeroFallback }
})

const NAV = [
  ['Create Room', 'create-room'], ['Join Room', 'join-room'], ['Login Room', 'sign-in'], ['Try Demo', 'demo'],
  ['How It Works', 'how-it-works'], ['Features', 'features'], ['About Us', 'about'], ['Contact Us', 'contact'],
] as const

function focusHashTarget(event: MouseEvent<HTMLAnchorElement>) {
  const id = event.currentTarget.hash.slice(1)
  if (!id) return
  requestAnimationFrame(() => document.getElementById(decodeURIComponent(id))?.focus({ preventScroll: true }))
}

function LandingSection({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  return <section id={id} tabIndex={-1} className={`mx-auto max-w-content scroll-mt-24 px-4 py-10 sm:px-6 lg:px-8 ${className}`}>{children}</section>
}

export default function Landing() {
  const navigate = useNavigate()
  const { ready, loadDemo, pushToast } = useStore()
  const { theme, setTheme } = useTheme()
  const [memberCount, setMemberCount] = useState(5)
  const [previewMembers, setPreviewMembers] = useState<1 | 3>(1)
  const [previewAmount, setPreviewAmount] = useState('12000')
  const previewTotalPaise = parseRupeesToPaise(previewAmount) ?? 0
  const previewSharePaise = splitEqual(previewTotalPaise, previewMembers)[0] ?? 0
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('home')
  const [scrolled, setScrolled] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoError, setDemoError] = useState('')
  const demoLock = useRef(false)
  const menuRef = useRef<HTMLElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const [heroActive, setHeroActive] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  async function startDemo() {
    if (!ready || demoLock.current) return
    demoLock.current = true
    setDemoBusy(true)
    setDemoError('')
    try {
      if (await loadDemo({ memberCount, seed: createDemoSeed() })) navigate('/room')
    } catch {
      const message = 'We could not start the demo. Please try again.'
      setDemoError(message)
      pushToast({ message, tone: 'bad' })
    } finally {
      demoLock.current = false
      setDemoBusy(false)
    }
  }

  useEffect(() => {
    const ids = ['home', ...NAV.map(([, id]) => id)]
    const targets = ids.map((id) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node))
    const updateActive = () => {
      const current = targets.map((target) => ({ target, top: target.getBoundingClientRect().top })).filter(({ top }) => top <= 130).sort((a, b) => b.top - a.top)[0]
      if (current) setActiveSection(current.target.id)
    }
    const onScroll = () => { setScrolled(window.scrollY > 4); updateActive() }
    const onHashChange = () => { if (NAV.some(([, id]) => id === window.location.hash.slice(1))) setActiveSection(window.location.hash.slice(1)) }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('hashchange', onHashChange)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('hashchange', onHashChange) }
  }, [])

  useEffect(() => {
    const node = heroRef.current
    if (!node || heroActive) return
    if (!('IntersectionObserver' in window)) { setHeroActive(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setHeroActive(true); observer.disconnect() }
    }, { rootMargin: '260px 0px', threshold: 0.01 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [heroActive])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const menu = menuRef.current
    const focusables = () => Array.from(menu?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
    focusables()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileMenuOpen(false); menuButtonRef.current?.focus(); return }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileMenuOpen])



  return <div className="min-h-dvh overflow-x-clip bg-surface-page text-ink">
    <header className={`sticky top-0 z-50 border-b border-line-light bg-surface-page/95 backdrop-blur-xl transition-shadow ${scrolled ? 'shadow-card' : ''}`}>
      <div className="relative mx-auto flex min-h-[68px] max-w-content items-center px-4 sm:px-6 lg:px-8">
        <button ref={menuButtonRef} type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} aria-controls="landing-corner-menu" className="btn-ghost !min-h-[44px] !w-11 !px-0" aria-haspopup="dialog">
          <Icon name={mobileMenuOpen ? 'x' : 'menu'} size={22} />
        </button>
        <a href="#home" onClick={focusHashTarget} aria-label={`${APP.name} home`} className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary-solid to-accent-solid text-white shadow-fab"><Icon name="rupee" size={21} /></span>
          <span><b className="block whitespace-nowrap font-display text-[16px] leading-none sm:text-[18px]">{APP.name}</b><small className="mt-1 hidden text-center text-[10px] text-ink-soft min-[440px]:block">{APP.tagline}</small></span>
        </a>
        <div className="ml-auto flex items-center gap-1.5"><BackButton fallback="/" /><button type="button" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`} className="btn-ghost !min-h-[44px] !w-11 !px-0"><Icon name={isDark ? 'sun' : 'moon'} size={19} /></button></div>
      </div>
      <AnimatePresence>
        {mobileMenuOpen && <>
          <motion.button type="button" aria-label="Close navigation menu" onClick={() => { setMobileMenuOpen(false); menuButtonRef.current?.focus() }} className="fixed inset-0 z-40 cursor-default bg-slate-950/35 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.nav ref={menuRef} id="landing-corner-menu" role="dialog" aria-modal="true" aria-label="RoomHisaab navigation" className="absolute left-3 top-[calc(100%+10px)] z-50 w-[min(370px,calc(100vw-24px))] origin-top-left rounded-[24px] border border-line-light bg-surface-card p-4 shadow-2xl sm:left-6" initial={{ opacity: 0, y: -10, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .97 }} transition={{ duration: .18 }}>
            <div className="mb-3 flex items-center justify-between px-1"><div><p className="kicker">Explore RoomHisaab</p><h2 className="font-display text-lg font-bold">Where would you like to go?</h2></div><button type="button" onClick={() => { setMobileMenuOpen(false); menuButtonRef.current?.focus() }} className="btn-ghost !min-h-[40px] !w-10 !px-0" aria-label="Close menu"><Icon name="x" size={18}/></button></div>
            <div className="grid grid-cols-2 gap-2">{NAV.map(([label, id]) => <a key={id} href={`#${id}`} aria-label={label} onClick={(event) => { focusHashTarget(event); setActiveSection(id); setMobileMenuOpen(false); menuButtonRef.current?.focus() }} aria-current={activeSection === id ? 'location' : undefined} className={`group flex min-h-[68px] items-center gap-2.5 rounded-2xl border p-3 text-[13px] font-bold transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${activeSection === id ? 'border-primary/40 bg-primary/10 text-primary' : 'border-line-light bg-surface-alt text-ink'}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-surface-card text-primary shadow-sm"><Icon name={(label === 'Create Room' ? 'home' : label === 'Join Room' ? 'share' : label === 'Login Room' ? 'shield' : label === 'Try Demo' ? 'sparkles' : label === 'Features' ? 'bolt' : label === 'How It Works' ? 'arrowRight' : label === 'About Us' ? 'users' : 'mail') as 'home'} size={17}/></span>{label}<span className="ml-auto text-primary/60">↗</span></a>)}</div>
            <p className="mt-3 px-1 text-[11px] text-ink-soft">Use Tab to move through links. Press Escape to close.</p>
          </motion.nav>
        </>}
      </AnimatePresence>
    </header>

    <div className="mx-auto flex max-w-content flex-col px-4 sm:px-6 lg:px-8">
      <section aria-labelledby="landing-navigation-title" className="order-2 scroll-mt-24 py-2 lg:order-2 lg:py-8">
        <div className="rounded-[28px] border border-line-light bg-surface-card p-5 shadow-card sm:p-7">
          <p className="kicker">Explore RoomHisaab</p>
          <h2 id="landing-navigation-title" className="mt-1 font-display text-[24px] font-bold sm:text-[30px] lg:text-[34px]">Where would you like to go?</h2>
          <nav aria-label="Explore RoomHisaab sections" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {NAV.map(([label, id]) => <a key={id} href={`#${id}`} onClick={focusHashTarget} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line-light bg-surface-alt px-3 py-2.5 text-[13px] font-bold text-ink transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span>{label}</span><span className="text-primary" aria-hidden="true">↗</span></a>)}
          </nav>
        </div>
      </section>

      <section id="home" tabIndex={-1} className="order-1 scroll-mt-24 overflow-hidden py-2 lg:order-1 lg:py-20">
        <div className="grid items-center gap-4 lg:grid-cols-2 lg:gap-8">
          <div>
            <p className="kicker">For solo living or shared homes</p>
            <h1 className="mt-3 max-w-[13ch] font-display text-[42px] font-black leading-[1.05] sm:text-[60px]">Shared expenses, <span className="text-primary">made clear.</span></h1>
          </div>
          <div className="flex items-center py-1 lg:min-h-[220px] lg:pl-8">
            <p className="max-w-xl text-[16px] leading-relaxed text-ink-soft sm:text-[18px]">Track bills, split costs and see what everyone owes—all in one place.</p>
          </div>
        </div>
      </section>
    </div>

    <section aria-label="Start where you need" className="mx-auto max-w-content scroll-mt-24 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-4 max-w-2xl">
        <p className="kicker">A calmer way to share costs</p>
        <h2 className="mt-1 font-display text-[24px] font-bold sm:text-[30px]">Start where you need</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">Add a bill, see each person’s share, and keep household spending clear. Choose one simple next step.</p>
      </div>
      <div className="grid auto-rows-fr grid-cols-1 items-stretch gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <article id="demo" tabIndex={-1} className="flex h-full min-h-[310px] scroll-mt-24 flex-col rounded-2xl border border-line-light bg-surface-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card">
          <span className="icon-tile h-9 w-9 rounded-xl"><Icon name="sparkles" size={18}/></span>
          <h3 className="mt-3 font-display text-[16px] font-bold">Try RoomHisaab</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">Explore sample data. Your room stays untouched.</p>
          <fieldset className="mt-3"><legend className="sr-only">Choose sample room size</legend>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-line-light bg-surface-alt px-2 py-1.5">
              <button type="button" aria-label="Decrease member count" disabled={memberCount <= 1} onClick={() => setMemberCount((n) => Math.max(1,n-1))} className="grid h-9 w-9 place-items-center rounded-lg text-xl hover:bg-ink/5 disabled:opacity-40">−</button>
              <p className="text-center text-[13px] font-bold" aria-live="polite">{memberCount} {memberCount === 1 ? 'Member' : 'Members'}</p>
              <button type="button" aria-label="Increase member count" disabled={memberCount >= 10} onClick={() => setMemberCount((n) => Math.min(10,n+1))} className="grid h-9 w-9 place-items-center rounded-lg text-xl hover:bg-ink/5 disabled:opacity-40">+</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">{[1,2,5,10].map((n)=><button key={n} type="button" aria-pressed={memberCount===n} onClick={()=>setMemberCount(n)} className={memberCount===n?'chip-on !min-h-[34px] !px-2.5 !py-1 !text-[11px]':'chip-off !min-h-[34px] !px-2.5 !py-1 !text-[11px]'}>{n} {n===1?'Member':'Members'}</button>)}</div>
          </fieldset>
          <button type="button" disabled={demoBusy || !ready} onClick={() => void startDemo()} className="btn-primary mt-3 w-full !min-h-[42px] !px-3 !text-[13px]">{!ready?'Preparing…':demoBusy?'Starting…':'Start Demo'}</button>
          {demoError && <p className="mt-2 text-[12px] font-semibold text-overdue" role="alert">{demoError}</p>}
        </article>
        <article id="create-room" tabIndex={-1} className="flex h-full min-h-[310px] scroll-mt-24 flex-col rounded-2xl border border-line-light bg-surface-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card">
          <span className="icon-tile h-9 w-9 rounded-xl"><Icon name="home" size={18}/></span>
          <h3 className="mt-3 font-display text-[16px] font-bold">Create Your Room</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">A personal tracker or a shared space for your household.</p>
          <ul className="mt-3 mb-1 space-y-1.5 text-[11.5px] text-ink-soft"><li>• Choose members and room name</li><li>• Set your monthly cycle</li></ul>
          <Link to="/onboarding" className="btn-primary mt-3 w-full !min-h-[42px] !px-3 !text-[13px]"><Icon name="arrowRight" size={16}/> Create Room Now</Link>
        </article>
        <article id="join-room" tabIndex={-1} className="flex h-full min-h-[310px] scroll-mt-24 flex-col rounded-2xl border border-line-light bg-surface-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card">
          <span className="icon-tile h-9 w-9 rounded-xl"><Icon name="share" size={18}/></span>
          <h3 className="mt-3 font-display text-[16px] font-bold">Join an Existing Room</h3>
          <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-ink-soft">Use the invite link or room code from a roommate.</p>
          <Link to="/join" className="btn-outline mt-3 w-full !min-h-[42px] !px-3 !text-[13px]"><Icon name="arrowRight" size={16}/> Join Room Now</Link>
        </article>
        <article id="sign-in" tabIndex={-1} className="flex h-full min-h-[310px] scroll-mt-24 flex-col rounded-2xl border border-line-light bg-surface-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card">
          <span className="icon-tile h-9 w-9 rounded-xl"><Icon name="shield" size={18}/></span>
          <h3 className="mt-3 font-display text-[16px] font-bold">Already Have a Room?</h3>
          <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-ink-soft">Sign in with your room ID, username and password.</p>
          <Link to="/login" className="btn-outline mt-3 w-full !min-h-[42px] !px-3 !text-[13px]"><Icon name="arrowRight" size={16}/> Sign In to My Room</Link>
          <Link to="/recover" className="mt-2 self-start text-[12px] font-bold text-primary hover:underline">Forgot Password?</Link>
        </article>
      </div>
    </section>

    <LandingSection id="how-it-works">
      <SectionHead kicker="Simple steps" title="How RoomHisaab Works" sub="Use the same clear steps whether you track expenses alone or with roommates." />
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
        ['01','Create a Room','Start alone or with roommates.'],['02','Add Expenses','Record what you bought and how much you paid.'],['03','Split Bills','Share expenses with selected members.'],['04','Settle Payments','See who needs to pay and record payments.'],
      ].map(([n,title,body])=><article key={n} className="card p-5"><span className="icon-tile h-10 w-10">{n}</span><h3 className="mt-4 font-display font-bold">{title}</h3><p className="mt-2 text-[13px] text-ink-soft">{body}</p></article>)}</div>
      <p className="mt-4 rounded-2xl border border-line-light bg-surface-card p-4 text-[13px] text-ink-soft"><b className="text-ink">Using RoomHisaab alone?</b> Track personal expenses without splitting bills.</p>
    </LandingSection>
    <LandingSection id="features">
      <SectionHead kicker="Helpful tools" title="Everything You Need to Manage Expenses" sub="A clear set of tools for everyday spending and shared costs." />
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
        ['receipt','Add Expenses','Record a purchase, amount and payer.'],['scan','Quick Pay','Prepare an expense before scanning a seller QR.'],['share','Split Bills','Share costs equally or with selected members.'],['users','Member Balances','See who paid and who needs to pay.'],['chart','Reports','Review spending over time.'],['bolt','Recurring Bills','Keep monthly costs on your list.'],['clipboard','Import Expenses','Prepare expenses from supported sources.'],['bank','Backup and Restore','Save and restore your room data.'],
      ].map(([icon,title,body])=><article key={title} className="card p-5"><span className="icon-tile h-11 w-11"><Icon name={icon as 'receipt'} size={21}/></span><h3 className="mt-3 font-display font-bold">{title}</h3><p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{body}</p></article>)}</div>
    </LandingSection>
    <section aria-label="Interactive 3D RoomHisaab preview" className="mx-auto max-w-content px-4 py-6 sm:px-6 lg:px-8">
      <div ref={heroRef} className="relative min-h-[300px] overflow-hidden rounded-[32px] border border-white/10 bg-[#09090B] text-white shadow-lift3d sm:min-h-[390px]">
        {heroActive ? <Suspense fallback={<HeroFallback />}><LazyHero3D className="h-[300px] w-full sm:h-[390px]" /></Suspense> : <HeroFallback />}
      </div>
    </section>

    <LandingSection id="preview">
      <SectionHead kicker="Interactive calculator · sample only" title="See a fair split in real time" sub="Adjust the sample expense and household size. The calculator is isolated from your room data and never creates a payment." />
      <div className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-light p-4"><b className="mr-auto">Room split preview</b><button type="button" aria-pressed={previewMembers===1} onClick={()=>setPreviewMembers(1)} className={previewMembers===1?'chip-on':'chip-off'}>1 Member</button><button type="button" aria-pressed={previewMembers===3} onClick={()=>setPreviewMembers(3)} className={previewMembers===3?'chip-on':'chip-off'}>3 Members</button></div>
        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(220px,.8fr)_1.2fr] sm:items-center">
          <label className="block"><span className="label">Sample room expense (₹)</span><input className="input num" inputMode="decimal" type="number" min="0" step="0.01" value={previewAmount} onChange={(event)=>setPreviewAmount(event.target.value)} aria-label="Sample room expense amount"/><span className="mt-2 block text-[12px] text-ink-soft">Illustrative only · no data is saved</span></label>
          {previewMembers===1 ? <div className="grid gap-3 sm:grid-cols-3"><PreviewStat label="My Room · Total Spent" value={formatINR(previewTotalPaise)}/><PreviewStat label="Paid Expenses" value={formatINR(previewTotalPaise)}/><PreviewStat label="Unpaid Bills" value={formatINR(0)}/></div> : <div className="grid gap-3 sm:grid-cols-2"><PreviewStat label="Green Villa · Total Spent" value={formatINR(previewTotalPaise)}/><PreviewStat label="You Paid" value={formatINR(previewTotalPaise)}/><PreviewStat label="Your Share" value={formatINR(previewSharePaise)}/><PreviewStat label="Owed to you · sample" value={formatINR(Math.max(0, previewTotalPaise-previewSharePaise))}/></div>}
        </div>
      </div>
    </LandingSection>
    <LandingSection id="who"><SectionHead kicker="For real homes" title="Who Is It For?" sub="RoomHisaab is designed for everyday personal and shared spending."/><div className="mt-6 grid gap-4 sm:grid-cols-3">{[['Living alone','Track personal expenses and monthly bills.'],['Shared homes','Record shared costs and keep balances clear.'],['Hostels and PGs','Manage room expenses with a simple member list.']].map(([title,body])=><article className="card p-5" key={title}><h3 className="font-display font-bold">{title}</h3><p className="mt-2 text-[13px] text-ink-soft">{body}</p></article>)}</div></LandingSection>
    <section tabIndex={-1} className="mx-auto max-w-content scroll-mt-24 space-y-6 px-4 py-8 sm:px-6 lg:px-8" aria-label="About RoomHisaab and its developer"><AboutRoomHisaab/></section>
    <LandingSection id="payment-safety"><SectionHead kicker="Payment Safety" title="Your payments stay in your hands" sub="RoomHisaab does not approve payments. Check the payee and amount in your payment app, and enter your PIN only there."/><p className="card mt-5 p-5 text-[13px] leading-relaxed text-ink-soft">Scanning a QR or returning from a payment app is not proof that money was sent. RoomHisaab asks you to confirm before marking a Quick Pay expense as paid.</p></LandingSection>
    <LandingSection id="faqs"><SectionHead kicker="FAQs" title="Frequently Asked Questions" sub="Short answers about getting started and using RoomHisaab."/><div className="mt-6 grid gap-3 lg:grid-cols-2">{[
      ['Can I use RoomHisaab alone?','Yes. A one-member room lets you track personal spending without splitting bills.'],['Does scanning a QR complete a payment?','No. You approve the payment in your UPI app and confirm it yourself in RoomHisaab.'],['Does the demo affect my room?','No. The demo uses sample data and does not launch real payments.'],['Where do I create or join a room?','Use Create Room or Join Room in the main navigation. The forms remain on their dedicated pages.'],
    ].map(([q,a])=><details key={q} className="card p-4"><summary className="cursor-pointer font-display font-bold">{q}</summary><p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{a}</p></details>)}</div></LandingSection>
    <footer id="contact" tabIndex={-1} className="scroll-mt-24 border-t border-line-light bg-surface-card/70 py-8"><div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-4 text-[13px] text-ink-soft sm:px-6 lg:px-8"><span>© 2026 RoomHisaab · Developed by Komal Nath Yogi</span><a href="#home" onClick={focusHashTarget} className="font-semibold text-primary">Back to top</a><a href="mailto:1komalnathyogi1@gmail.com" className="underline">Contact Us</a></div></footer>
  </div>
}

function SectionHead({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,360px)] md:items-end"><div><p className="kicker">{kicker}</p><h2 className="mt-2 font-display text-[27px] font-bold sm:text-[34px]">{title}</h2></div><p className="text-[14px] leading-relaxed text-ink-soft">{sub}</p></div>
}
function PreviewStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-line-light bg-surface-alt p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</p><p className="mt-2 font-display text-[22px] font-bold text-primary">{value}</p></div>
}

function HeroFallback({ className = '' }: { className?: string } = {}) {
  return <div className={`relative grid min-h-[300px] place-items-center overflow-hidden p-6 text-white sm:min-h-[390px] ${className}`}>
    <div className="absolute inset-0 opacity-40" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(circle at 50% 45%, #766dff 0, transparent 57%), linear-gradient(135deg, #242552, #11152a)' }} />
    <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
      <p className="text-[11px] font-bold uppercase tracking-widest text-[#B9B2FF]">Green Villa · Sample</p><p className="mt-4 text-[13px] text-white/70">Shared expenses this month</p>
      <p className="mt-1 font-display text-4xl font-bold">₹12,000</p>
      <div className="mt-5 grid grid-cols-3 gap-2 text-[11px]"><div className="rounded-xl bg-white/10 p-3"><span className="block text-white/60">You paid</span><b>₹5,000</b></div><div className="rounded-xl bg-white/10 p-3"><span className="block text-white/60">Your share</span><b>₹4,000</b></div><div className="rounded-xl bg-white/10 p-3"><span className="block text-white/60">Balance</span><b>₹1,000</b></div></div>
      <p className="mt-3 text-[11px] text-white/65">Sample view only. No room or payment is created.</p>
    </div>
  </div>
}
