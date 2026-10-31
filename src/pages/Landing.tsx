import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { APP } from '../lib/constants'
import { Icon } from '../components/Icon'
import { useStore } from '../hooks/useStore'
import { useTheme } from '../hooks/useTheme'
import { AboutRoomHisaab } from '../components/AboutRoomHisaab'
import { createDemoSeed } from '../lib/seed'
import { formatINR } from '../lib/money'

const NAV = [
  ['Create Room', 'create-room'], ['Join Room', 'join-room'], ['Sign In', 'sign-in'], ['Try Demo', 'demo'],
  ['Features', 'features'], ['How It Works', 'how-it-works'], ['About Us', 'about'], ['Contact Us', 'contact'],
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
  const { ready, loadDemo } = useStore()
  const { theme, setTheme } = useTheme()
  const [memberCount, setMemberCount] = useState(3)
  const [previewMembers, setPreviewMembers] = useState<1 | 3>(1)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('home')
  const [scrolled, setScrolled] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoError, setDemoError] = useState('')
  const demoLock = useRef(false)
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  async function startDemo() {
    if (!ready || demoLock.current) return
    demoLock.current = true
    setDemoBusy(true)
    setDemoError('')
    try {
      if (await loadDemo({ memberCount, seed: createDemoSeed() })) navigate('/room')
    } catch {
      setDemoError('We could not start the demo. Please try again.')
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

  const navLink = (label: string, id: string, mobile = false) => (
    <a key={id} href={`#${id}`} onClick={(event) => { focusHashTarget(event); setActiveSection(id); if (mobile) setMobileMenuOpen(false) }}
      aria-current={activeSection === id ? 'location' : undefined}
      className={`${mobile ? 'rounded-xl px-3 py-3' : 'rounded-lg px-2 py-2 text-[12px] 2xl:text-[13px]'} font-semibold transition-colors hover:bg-primary/10 hover:text-primary ${activeSection === id ? 'bg-primary/10 text-primary' : 'text-ink-soft'}`}>
      {label}
    </a>
  )

  return <div className="min-h-dvh overflow-x-clip bg-surface-page text-ink">
    <header className={`sticky top-0 z-50 border-b border-line-light bg-surface-page/95 backdrop-blur-xl transition-shadow ${scrolled ? 'shadow-card' : ''}`}>
      <div className="mx-auto flex min-h-[68px] max-w-content items-center gap-3 px-4 sm:px-6 lg:px-8">
        <a href="#home" onClick={focusHashTarget} aria-label={`${APP.name} home`} className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary-solid to-accent-solid text-white shadow-fab"><Icon name="rupee" size={21} /></span>
          <span><b className="block font-display text-[16px] leading-none">{APP.name}</b><small className="mt-1 hidden text-[10px] text-ink-soft min-[440px]:block">{APP.tagline}</small></span>
        </a>
        <nav className="ml-auto hidden items-center gap-0.5 lg:flex" aria-label="Main navigation">{NAV.map(([label, id]) => navLink(label, id))}</nav>
        <button type="button" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-label="Change theme" className="btn-ghost shrink-0 !px-2.5"><Icon name={isDark ? 'sun' : 'moon'} size={18} /></button>
        <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen} aria-controls="landing-mobile-menu" className="btn-outline !min-h-[42px] !px-2.5 lg:hidden">
          <Icon name={mobileMenuOpen ? 'x' : 'menu'} size={18} /><span className="ml-1 text-[12px]">{mobileMenuOpen ? 'Close' : 'Menu'}</span>
        </button>
      </div>
      {mobileMenuOpen && <nav id="landing-mobile-menu" className="grid grid-cols-2 gap-2 border-t border-line-light bg-surface-page px-4 py-3 sm:px-6 lg:hidden" aria-label="Mobile landing menu">
        {NAV.map(([label, id]) => navLink(label, id, true))}
      </nav>}
    </header>

    <section id="home" tabIndex={-1} className="scroll-mt-24 overflow-hidden">
      <div className="mx-auto grid max-w-content items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
        <div>
          <p className="kicker">For one member or a shared home</p>
          <h1 className="mt-3 font-display text-[42px] font-black leading-[1.05] sm:text-[60px]">Room expenses<br/><span className="text-primary">made simple.</span></h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-soft">Track expenses, split bills and manage payments in one clear place. Start on your own or invite the people you live with.</p>
          <p className="mt-3 text-[13px] font-semibold text-ink-soft">Create a room, join one, sign in or explore a sample—all from the menu above.</p>
        </div>
        <div className="relative grid min-h-[300px] place-items-center overflow-hidden rounded-[32px] border border-white/10 bg-[#15172F] p-6 text-white shadow-lift3d sm:min-h-[390px]">
          <div className="absolute inset-0 opacity-20" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(circle at 50% 45%, #766dff 0, transparent 57%), linear-gradient(135deg, #242552, #11152a)' }} />
          <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#B9B2FF]">Green Villa · Sample</p><p className="mt-4 text-[13px] text-white/70">Shared expenses this month</p>
            <p className="mt-1 font-display text-4xl font-bold">₹12,000</p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-[11px]"><div className="rounded-xl bg-white/10 p-3"><span className="block text-white/60">You paid</span><b>₹5,000</b></div><div className="rounded-xl bg-white/10 p-3"><span className="block text-white/60">Your share</span><b>₹4,000</b></div><div className="rounded-xl bg-white/10 p-3"><span className="block text-white/60">Balance</span><b>₹1,000</b></div></div>
            <p className="mt-3 text-[11px] text-white/65">Sample view only. No room or payment is created.</p>
          </div>
        </div>
      </div>
    </section>

    <LandingSection id="create-room" className="pt-8">
      <ActionCard icon="home" title="Create Your Room" description="Start with one member or add your roommates. RoomHisaab helps you track and split expenses." bullets={['Start with one member', 'Add members anytime', 'Track personal or shared expenses']}>
        <Link to="/onboarding" className="btn-primary mt-5"><Icon name="arrowRight" size={18}/> Create Room Now</Link>
      </ActionCard>
    </LandingSection>
    <LandingSection id="join-room" className="pt-4">
      <ActionCard icon="share" title="Join an Existing Room" description="Have an invite link or room code? Join your roommates and start managing shared expenses." bullets={['Ask your roommate for an invite link or room code']}>
        <Link to="/join" className="btn-primary mt-5"><Icon name="arrowRight" size={18}/> Join Room Now</Link>
      </ActionCard>
    </LandingSection>
    <LandingSection id="sign-in" className="pt-4">
      <ActionCard icon="shield" title="Already Have a Room?" description="Sign in to open your existing room and continue where you left off." bullets={['Your existing sign-in details are used on the secure sign-in page.']}>
        <div className="mt-5 flex flex-wrap gap-3"><Link to="/login" className="btn-primary"><Icon name="arrowRight" size={18}/> Sign In to My Room</Link><Link to="/recover" className="btn-outline">Forgot Password?</Link></div>
      </ActionCard>
    </LandingSection>
    <LandingSection id="demo" className="pt-4">
      <div className="card mx-auto max-w-2xl p-5 sm:p-7">
        <SectionHead kicker="Sample only" title="Try RoomHisaab" sub="Explore sample data. No sign-up or account setup is needed." />
        <fieldset className="mt-5"><legend className="label">How Many Members?</legend>
          <div className="mt-2 flex items-center justify-center gap-4 rounded-2xl border border-line-light bg-surface-alt p-4">
            <button type="button" aria-label="Decrease member count" disabled={memberCount <= 1} onClick={() => setMemberCount((n) => Math.max(1,n-1))} className="btn-outline !min-h-[48px] !w-12 !px-0 text-xl disabled:opacity-45">−</button>
            <p className="min-w-[132px] text-center font-display text-[20px] font-bold" aria-live="polite">{memberCount} {memberCount === 1 ? 'Member' : 'Members'}</p>
            <button type="button" aria-label="Increase member count" disabled={memberCount >= 10} onClick={() => setMemberCount((n) => Math.min(10,n+1))} className="btn-outline !min-h-[48px] !w-12 !px-0 text-xl disabled:opacity-45">+</button>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2" aria-label="Quick member count selections">{[1,2,3,5].map((n)=><button key={n} type="button" aria-pressed={memberCount===n} onClick={()=>setMemberCount(n)} className={memberCount===n?'chip-on':'chip-off'}>{n} {n===1?'Member':'Members'}</button>)}</div>
        </fieldset>
        <button type="button" disabled={demoBusy || !ready} onClick={() => void startDemo()} className="btn-primary mt-6 w-full !py-3.5">{!ready?'Preparing sample room…':demoBusy?'Creating Demo…':'Start Demo'}</button>
        <p className="mt-3 text-center text-[12px] leading-relaxed text-ink-soft">Sample only. Demo data stays separate from your real room. Demo payments are simulated.</p>
        {demoError && <p className="mt-3 text-center text-[13px] font-semibold text-danger" role="alert">{demoError}</p>}
      </div>
    </LandingSection>

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
    <LandingSection id="preview">
      <SectionHead kicker="Sample view" title="See RoomHisaab in Action" sub="Explore a sample interface. This preview never creates a real room or payment." />
      <div className="card mt-6 overflow-hidden"><div className="flex flex-wrap items-center gap-2 border-b border-line-light p-4"><b className="mr-auto">Interactive Preview</b><button type="button" aria-pressed={previewMembers===1} onClick={()=>setPreviewMembers(1)} className={previewMembers===1?'chip-on':'chip-off'}>1 Member</button><button type="button" aria-pressed={previewMembers===3} onClick={()=>setPreviewMembers(3)} className={previewMembers===3?'chip-on':'chip-off'}>3 Members</button></div>
        {previewMembers===1 ? <div className="grid gap-4 p-5 sm:grid-cols-3"><PreviewStat label="My Room · Total Spent" value={formatINR(850000)}/><PreviewStat label="Paid Expenses" value={formatINR(750000)}/><PreviewStat label="Unpaid Bills" value={formatINR(100000)}/></div> : <div className="grid gap-4 p-5 sm:grid-cols-4"><PreviewStat label="Green Villa · Total Spent" value={formatINR(1200000)}/><PreviewStat label="You Paid" value={formatINR(500000)}/><PreviewStat label="Your Share" value={formatINR(400000)}/><PreviewStat label="Balance" value={formatINR(100000)}/></div>}
      </div>
    </LandingSection>
    <LandingSection id="who"><SectionHead kicker="For real homes" title="Who Is It For?" sub="RoomHisaab is designed for everyday personal and shared spending."/><div className="mt-6 grid gap-4 sm:grid-cols-3">{[['Living alone','Track personal expenses and monthly bills.'],['Shared homes','Record shared costs and keep balances clear.'],['Hostels and PGs','Manage room expenses with a simple member list.']].map(([title,body])=><article className="card p-5" key={title}><h3 className="font-display font-bold">{title}</h3><p className="mt-2 text-[13px] text-ink-soft">{body}</p></article>)}</div></LandingSection>
    <section className="mx-auto max-w-content space-y-6 px-4 py-8 sm:px-6 lg:px-8" aria-label="About RoomHisaab and its developer"><AboutRoomHisaab/></section>
    <LandingSection id="payment-safety"><SectionHead kicker="Payment Safety" title="Your payments stay in your hands" sub="RoomHisaab does not approve payments. Check the payee and amount in your payment app, and enter your PIN only there."/><p className="card mt-5 p-5 text-[13px] leading-relaxed text-ink-soft">Scanning a QR or returning from a payment app is not proof that money was sent. RoomHisaab asks you to confirm before marking a Quick Pay expense as paid.</p></LandingSection>
    <LandingSection id="faqs"><SectionHead kicker="FAQs" title="Frequently Asked Questions" sub="Short answers about getting started and using RoomHisaab."/><div className="mt-6 grid gap-3 lg:grid-cols-2">{[
      ['Can I use RoomHisaab alone?','Yes. A one-member room lets you track personal spending without splitting bills.'],['Does scanning a QR complete a payment?','No. You approve the payment in your UPI app and confirm it yourself in RoomHisaab.'],['Does the demo affect my room?','No. The demo uses sample data and does not launch real payments.'],['Where do I create or join a room?','Use Create Room or Join Room in the main navigation. The forms remain on their dedicated pages.'],
    ].map(([q,a])=><details key={q} className="card p-4"><summary className="cursor-pointer font-display font-bold">{q}</summary><p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{a}</p></details>)}</div></LandingSection>
    <footer className="border-t border-line-light bg-surface-card/70 py-8"><div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-4 text-[13px] text-ink-soft sm:px-6 lg:px-8"><span>© 2026 RoomHisaab · Developed by Komal Nath Yogi</span><a href="#home" onClick={focusHashTarget} className="font-semibold text-primary">Back to top</a><a href="mailto:1komalnathyogi1@gmail.com" className="underline">Contact Us</a></div></footer>
  </div>
}

function ActionCard({ icon, title, description, bullets, children }: { icon: 'home'|'share'|'shield'; title: string; description: string; bullets: string[]; children: ReactNode }) {
  return <div className="card mx-auto max-w-3xl p-5 sm:p-7"><div className="flex items-start gap-4"><span className="icon-tile h-12 w-12 shrink-0"><Icon name={icon} size={23}/></span><div><p className="kicker">Get started</p><h2 className="mt-1 font-display text-[25px] font-bold sm:text-[32px]">{title}</h2><p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{description}</p></div></div><ul className="mt-4 grid gap-2 sm:grid-cols-2">{bullets.map((item)=><li key={item} className="rounded-xl border border-line-light bg-surface-alt px-3 py-2.5 text-[13px]">{item}</li>)}</ul>{children}</div>
}
function SectionHead({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,360px)] md:items-end"><div><p className="kicker">{kicker}</p><h2 className="mt-2 font-display text-[27px] font-bold sm:text-[34px]">{title}</h2></div><p className="text-[14px] leading-relaxed text-ink-soft">{sub}</p></div>
}
function PreviewStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-line-light bg-surface-alt p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</p><p className="mt-2 font-display text-[22px] font-bold text-primary">{value}</p></div>
}
