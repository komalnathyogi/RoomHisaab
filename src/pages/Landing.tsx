import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { APP, colorFromName } from '../lib/constants'
import { formatINR, splitEqual } from '../lib/money'
import { SAMPLE_SMS, parseBankSMS } from '../lib/smsParser'
import { minimalTransfers } from '../lib/balances'
import { Avatar } from '../components/Avatar'
import { Skeleton } from '../components/Skeleton'
import { Icon, type IconName } from '../components/Icon'
import { useStore } from '../hooks/useStore'
import { useTheme } from '../hooks/useTheme'

const Hero3D = lazy(() => import('../components/Hero3D'))
const ease = [0.4, 0, 0.2, 1] as const

interface DemoExp { id: number; desc: string; amt: number; payer: string; icon: IconName }
const PEOPLE = ['Komal Nath', 'Anurag', 'Prabhat'].map((name) => ({ name, color: colorFromName(name) }))
const ACTIONS: Omit<DemoExp, 'id'>[] = [
  { desc: 'Anurag paid ₹300 for snacks and tea', amt: 30000, payer: 'Anurag', icon: 'receipt' },
  { desc: 'Prabhat paid the ₹1,240 electricity bill', amt: 124000, payer: 'Prabhat', icon: 'bolt' },
  { desc: 'Komal Nath paid the ₹799 WiFi bill', amt: 79900, payer: 'Komal Nath', icon: 'card' },
  { desc: 'Komal Nath paid ₹2,450.75 for groceries', amt: 245075, payer: 'Komal Nath', icon: 'cash' },
]

function DeferredHero3D() {
  const posterRef = useRef<HTMLDivElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [saveData] = useState(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    return Boolean(connection?.saveData || /^(slow-2g|2g)$/.test(connection?.effectiveType ?? ''))
  })

  useEffect(() => {
    if (shouldLoad || saveData || !posterRef.current) return
    let cancelled = false
    const start = () => { if (!cancelled) setShouldLoad(true) }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) start()
    }, { rootMargin: '240px 0px' })
    observer.observe(posterRef.current)

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const idleId = idleWindow.requestIdleCallback ? idleWindow.requestIdleCallback(start, { timeout: 1800 }) : undefined
    const timeoutId = idleId === undefined ? window.setTimeout(start, 1200) : undefined
    return () => {
      cancelled = true
      observer.disconnect()
      if (idleId !== undefined) idleWindow.cancelIdleCallback?.(idleId)
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [saveData, shouldLoad])

  if (shouldLoad) {
    return (
      <Suspense fallback={<Skeleton className="h-[470px] sm:h-[600px] lg:h-[660px] !rounded-none" />}>
        <Hero3D className="h-[470px] sm:h-[600px] lg:h-[660px]" />
      </Suspense>
    )
  }

  return (
    <div ref={posterRef} className="relative h-[470px] overflow-hidden sm:h-[600px] lg:h-[660px]" aria-label="Room money picture">
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-[42%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
        <div className="absolute left-1/2 top-[42%] h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        <div className="absolute left-1/2 top-[42%] grid h-28 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[28px] bg-gradient-to-br from-[#4F46C8] via-[#5046C8] to-[#A84E0A] text-center text-white shadow-lift3d">
          <span>
            <Icon name="rupee" size={34} />
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">Room money</span>
          </span>
        </div>
        <span className="absolute left-1/2 top-16 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-white/10 py-1.5 pl-1.5 pr-3 text-[12px] font-bold text-white">
          <Avatar name={PEOPLE[0].name} color={PEOPLE[0].color} size={28} /> {PEOPLE[0].name}
        </span>
        <span className="absolute bottom-32 left-5 flex items-center gap-2 rounded-full border border-white/15 bg-white/10 py-1.5 pl-1.5 pr-3 text-[12px] font-bold text-white sm:left-10">
          <Avatar name={PEOPLE[1].name} color={PEOPLE[1].color} size={28} /> {PEOPLE[1].name}
        </span>
        <span className="absolute bottom-32 right-5 flex items-center gap-2 rounded-full border border-white/15 bg-white/10 py-1.5 pl-1.5 pr-3 text-[12px] font-bold text-white sm:right-10">
          <Avatar name={PEOPLE[2].name} color={PEOPLE[2].color} size={28} /> {PEOPLE[2].name}
        </span>
      </div>
      <div className="absolute inset-x-4 bottom-5 text-center">
        {saveData ? (
          <>
            <p className="text-[13px] font-semibold text-white">The moving 3D view is paused to save mobile data.</p>
            <button type="button" onClick={() => setShouldLoad(true)} className="btn-accent mt-3 !px-5">Load 3D view</button>
          </>
        ) : (
          <p className="text-[12.5px] font-semibold text-white/75" role="status">Loading the moving 3D room picture…</p>
        )}
      </div>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const { state, loadDemo } = useStore()
  const { theme, setTheme } = useTheme()
  const [demo, setDemo] = useState<DemoExp[]>([{ ...ACTIONS[0], id: 1 }])
  const [sms, setSms] = useState(SAMPLE_SMS[0])
  const [showDemoOptions, setShowDemoOptions] = useState(false)
  const parsed = useMemo(() => parseBankSMS(sms), [sms])
  const started = state.room != null
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const debts = useMemo(() => {
    const paid: Record<string, number> = Object.fromEntries(PEOPLE.map((p) => [p.name, 0]))
    const owed: Record<string, number> = Object.fromEntries(PEOPLE.map((p) => [p.name, 0]))
    for (const e of demo) {
      paid[e.payer] += e.amt
      const per = splitEqual(e.amt, PEOPLE.length)
      PEOPLE.forEach((p, i) => { owed[p.name] += per[i] })
    }
    return minimalTransfers(PEOPLE.map((p) => ({
      memberId: p.name,
      netPaise: paid[p.name] - owed[p.name],
      paidPaise: paid[p.name],
      owedPaise: owed[p.name],
    })))
  }, [demo])
  const total = demo.reduce((a, b) => a + b.amt, 0)

  return (
    <div className="min-h-dvh bg-surface-page text-ink overflow-x-clip">
      {/* ───────────────── HEADER ───────────────── */}
      <header className="sticky top-0 z-50 border-b border-line-light bg-surface-page/90 backdrop-blur-xl">
        <div className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 min-h-[66px] py-2 flex items-center gap-2 sm:gap-3">
          <Link to="/" className="flex min-w-0 shrink items-center gap-2.5 min-h-[44px]" aria-label="RoomHisaab home">
            <span className="grid place-items-center h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-primary-solid to-accent-solid text-white shadow-fab"><Icon name="rupee" size={21} /></span>
            <span className="min-w-0">
              <span className="block font-display font-bold leading-none text-[15px] sm:text-[17px] truncate">{APP.name}</span>
              <span className="hidden min-[430px]:block text-[11px] text-ink-soft mt-0.5 truncate">{APP.tagline}</span>
            </span>
          </Link>
          <nav className="hidden lg:flex items-center gap-1 mx-auto text-[13.5px] font-semibold text-ink-soft" aria-label="Landing sections">
            <a className="px-3 py-2 rounded-lg hover:text-primary hover:bg-primary/10" href="#start-here">Start here</a>
            <a className="px-3 py-2 rounded-lg hover:text-primary hover:bg-primary/10" href="#flow">How it works</a>
            <a className="px-3 py-2 rounded-lg hover:text-primary hover:bg-primary/10" href="#demo">Live demo</a>
            <a className="px-3 py-2 rounded-lg hover:text-primary hover:bg-primary/10" href="#features">Features</a>
            <a className="px-3 py-2 rounded-lg hover:text-primary hover:bg-primary/10" href="#faq">FAQ</a>
          </nav>
          <span className="flex-1 lg:hidden" />
          <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="btn-ghost shrink-0 !px-2.5 sm:!px-3" aria-label="Change theme">
            <Icon name={isDark ? 'sun' : 'moon'} size={19} /><span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>
          <Link to="/login" className="btn-outline shrink-0 !px-2.5 min-[480px]:!px-3.5 whitespace-nowrap" aria-label="Sign in"><Icon name="shield" size={17} /><span className="hidden min-[480px]:inline">Sign in</span></Link>
          <Link to={started ? '/room' : '/onboarding'} className="btn-primary shrink-0 !px-3 min-[480px]:!px-3.5 !text-[13px] min-[480px]:!text-[15px] whitespace-nowrap">{started ? 'Open app' : 'Start free'}</Link>
        </div>
      </header>

      {/* First-visit launch pad: four clear choices, with demos kept local-only. */}
      <section className="welcome-stage relative isolate overflow-hidden px-4 py-12 sm:py-16">
        <motion.div aria-hidden="true" className="welcome-orb welcome-orb-a" animate={{ x: [0, 18, 0], y: [0, -14, 0] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div aria-hidden="true" className="welcome-orb welcome-orb-b" animate={{ x: [0, -16, 0], y: [0, 12, 0] }} transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }} />
        <div className="relative mx-auto max-w-5xl text-center">
          <p className="kicker">Welcome to RoomHisaab</p>
          <h1 className="font-display mt-2 text-[34px] leading-tight sm:text-[48px]">What would you like to do?</h1>
          <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">Choose one clear next step. You can explore first—demo data stays on this device and is never saved to an account.</p>
          <div className="mt-8 grid gap-3 text-left sm:grid-cols-2 xl:grid-cols-4">
            <WelcomeChoice icon="home" title="Create room" detail="Start a personal space or set up shared costs." to={started ? '/room' : '/onboarding'} />
            <article className="welcome-choice card p-4 sm:p-5">
              <span className="icon-tile h-11 w-11"><Icon name="sparkles" size={21} /></span>
              <h2 className="mt-3 text-[16px]">Try a demo</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">Pick a one, two or three-member sample. No cloud account or database records.</p>
              <button type="button" onClick={() => setShowDemoOptions((v) => !v)} aria-expanded={showDemoOptions} className="btn-outline mt-3 w-full !py-2.5">{showDemoOptions ? 'Hide demo choices' : 'Choose a demo'}</button>
              {showDemoOptions && <div className="mt-2 grid grid-cols-3 gap-1.5">{([1, 2, 3] as const).map((count) => <button type="button" key={count} className="chip-off justify-center !px-1.5 !text-[11px]" onClick={() => { void loadDemo(count).then((opened) => { if (opened) navigate('/room?tour=1') }) }}>{count} member{count > 1 ? 's' : ''}</button>)}</div>}
            </article>
            <WelcomeChoice icon="search" title="Explore features" detail="See how adding bills, balances and payments work." onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} />
            <WelcomeChoice icon="users" title="About us" detail="Meet the developer and learn what RoomHisaab is for." onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })} />
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2"><Link to="/join" className="btn-ghost !min-h-[42px]">Join with invite</Link><Link to="/login" className="btn-ghost !min-h-[42px]">Sign in to my room</Link></div>
        </div>
      </section>

      {/* ───────────────── HERO ───────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-32 left-[8%] hidden h-[360px] w-[620px] rounded-full bg-primary/15 blur-3xl sm:block" />
          <div className="absolute top-[420px] -left-36 hidden h-80 w-80 rounded-full bg-accent/10 blur-3xl sm:block" />
          <div className="absolute top-24 -right-24 hidden h-96 w-96 rounded-full bg-primary/10 blur-3xl sm:block" />
        </div>

        <div className="relative mx-auto max-w-content px-4 sm:px-6 lg:px-8 pt-7 lg:pt-14 pb-12 grid lg:grid-cols-[0.9fr_1.1fr] gap-7 lg:gap-9 items-center">
          <div>
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45, ease, delay: .05 }}
              className="text-[40px] leading-[1.06] sm:text-[58px] lg:text-[66px]">
              A shared notebook
              <span className="block bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(100deg, rgb(var(--c-primary)) 0%, rgb(var(--c-coral)) 42%, rgb(var(--c-violet)) 75%, rgb(var(--c-accent)) 100%)` }}>for room money.</span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45, ease, delay: .12 }}
              className="mt-4 sm:mt-5 text-[15.5px] sm:text-[16.5px] leading-relaxed text-ink-soft max-w-xl">
              For roommates, flatmates, PGs, and hostels. Write each shared expense once. RoomHisaab shows <b className="text-ink">who paid, what each person’s share is, and who should pay whom</b>—then creates an exact UPI QR when money is pending.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45, ease, delay: .2 }}
              className="mt-5 grid gap-2.5 min-[560px]:flex min-[560px]:flex-wrap sm:mt-7">
              <Link to={started ? '/room' : '/onboarding'} className="btn-primary w-full !px-6 !py-3 !text-[15.5px] shadow-fab min-[560px]:w-auto">
                <Icon name="home" /> {started ? 'Open my room' : 'Create my room'}
              </Link>
              <button onClick={() => { void loadDemo().then((opened) => { if (opened) navigate('/room?tour=1') }) }} className="btn-outline w-full !px-5 !py-3 bg-surface-card min-[560px]:w-auto"><Icon name="sparkles" /> Try demo + tour</button>
              <a href="#start-here" className="btn-ghost w-full !px-4 !py-3 min-[560px]:w-auto"><Icon name="help" /> I am new — show me</a>
            </motion.div>

            <ol className="mt-6 grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-light bg-line-light shadow-card min-[560px]:grid-cols-4" aria-label="How RoomHisaab works in four steps">
              <JourneyStep n="1" title="Add people" body="name + UPI ID" />
              <JourneyStep n="2" title="Write expense" body="item + amount" />
              <JourneyStep n="3" title="App divides" body="every person's share" />
              <JourneyStep n="4" title="Pay pending" body="exact QR or UPI app" accent />
            </ol>
          </div>

          {/* Pure 3D stage — iske upar koi flat card nahi chupa raha */}
          <motion.div initial={{ opacity: 0, scale: .975 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .55, ease, delay: .12 }}
            className="relative rounded-[34px] border border-white/15 bg-[#11152A] shadow-lift3d overflow-hidden">
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div className="absolute inset-0 opacity-[.17]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.16) 1px,transparent 1px)', backgroundSize: '42px 42px', maskImage: 'radial-gradient(circle at 50% 45%,black,transparent 74%)', WebkitMaskImage: 'radial-gradient(circle at 50% 45%,black,transparent 74%)' }} />
              <div className="absolute left-1/2 top-1/2 hidden h-[430px] w-[430px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4F46C8]/25 blur-3xl sm:block" />
              <div className="absolute -right-20 top-10 hidden h-64 w-64 rounded-full bg-[#D95765]/20 blur-3xl sm:block" />
              <div className="absolute -left-20 bottom-0 hidden h-56 w-56 rounded-full bg-[#5B7FE3]/20 blur-3xl sm:block" />
            </div>
            <DeferredHero3D />
          </motion.div>
        </div>
      </section>


      {/* ───────────────── START HERE ───────────────── */}
      <section id="start-here" className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 py-10 scroll-mt-20">
        <SectionHead kicker="Start here" title="First, choose your situation" sub="Do not guess where to tap. Pick the card that sounds like you." />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-8">
          <StartCard icon="home" title="I am starting a new room" body="Create the room, add roommates, and make the login. This is for the first person who sets everything up." to="/onboarding" cta="Create my room" />
          <StartCard icon="share" title="A friend sent me a link" body="Open the invite, choose or claim your name, enter the shared Room Password, then create your own personal password." to="/join" cta="Join a room" />
          <StartCard icon="shield" title="My room already exists" body="Sign in with the Room Login ID, your personal username, and your personal password to open the same room again." to="/login" cta="Sign in" />
          <StartCard icon="sparkles" title="I only want to learn first" body="Open a sample room with fake money and a 1-minute tour. You can look around safely before creating anything real." cta="Try demo + tour" onClick={() => { void loadDemo().then((opened) => { if (opened) navigate('/room?tour=1') }) }} />
        </div>

        <div className="card mt-5 p-5 sm:p-6" aria-labelledby="simple-example-title">
          <div className="flex flex-wrap items-center gap-3">
            <span className="icon-tile h-11 w-11"><Icon name="sparkles" size={21} /></span>
            <div>
              <p className="kicker">The whole website in one example</p>
              <h3 id="simple-example-title" className="text-[20px] mt-0.5">If you understand this, you understand RoomHisaab</h3>
            </div>
          </div>
          <div className="grid md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 items-stretch mt-5">
            <ExampleBox step="1" title="Komal Nath pays" body="Komal Nath gives ₹900 to the grocery shop for everyone." amount="₹900" />
            <span className="hidden md:grid place-items-center text-ink-faint" aria-hidden="true"><Icon name="arrowRight" size={22} /></span>
            <ExampleBox step="2" title="App divides" body="There are 3 people, so RoomHisaab makes three equal shares." amount="₹300 each" />
            <span className="hidden md:grid place-items-center text-ink-faint" aria-hidden="true"><Icon name="arrowRight" size={22} /></span>
            <ExampleBox step="3" title="Others return money" body="Anurag and Prabhat each pay their own share back to Komal Nath." amount="₹300 + ₹300" />
          </div>
          <p className="mt-4 text-center text-[13.5px] font-semibold text-ink-soft">RoomHisaab remembers the bill, shows it in History, updates every balance, and can make the exact payment QR.</p>
        </div>
      </section>

      {/* ───────────────── STATS ───────────────── */}
      <section className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 pb-4">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[22px] border border-line-light bg-line-light shadow-card lg:grid-cols-4">
          <Stat top="24.07B" bottom="UPI transactions · Sep 2026¹" />
          <Stat top="₹29.37L Cr" bottom="monthly UPI value¹" />
          <Stat top="4.5:1+" bottom="WCAG AA text contrast" />
          <Stat top="₹0" bottom="RoomHisaab fees" />
        </div>
        <p className="text-[11px] text-ink-faint mt-2">¹ Reported from NPCI monthly public data. RoomHisaab uses standard UPI links and never reads bank data without permission.</p>
      </section>

      {/* ───────────────── SYSTEM FLOW ───────────────── */}
      <section id="flow" className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 py-12 scroll-mt-20">
        <SectionHead kicker="How it works" title="Only four things happen" sub="Always in this order: people, expense, divide, pay pending money." />
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mt-8">
          <StepCard n="01" icon="users" title="Add people once" body="Write each roommate’s name and UPI ID. The UPI ID is only the address used to receive money—it is not a PIN." points={['Name everyone can recognize', 'UPI ID for receiving QR money']} />
          <StepCard n="02" icon="receipt" title="Write the expense" body="Type the item and amount, or let Auto Capture read an SMS, statement file, or your voice." points={['Quick Buy is fastest', 'Check before confirming']} />
          <StepCard n="03" icon="chart" title="App divides the bill" body="It can divide equally, by percentage, by exact amount, or only between selected people." points={['+ means receives money', '− means pays money']} />
          <StepCard n="04" icon="qr" title="Pay pending money" body="Open Payments for an exact QR or UPI app. Check the name and amount there before approving." points={['PIN only in your UPI app', 'Receiver confirms settlement']} />
        </div>
      </section>

      {/* ───────────────── LIVE DEMO ───────────────── */}
      <section id="demo" className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 py-8 scroll-mt-20">
        <div className="relative overflow-hidden rounded-[30px] bg-[#15172F] text-[#F1F0FF] border border-white/10 shadow-lift3d p-5 sm:p-7 lg:p-9">
          <div className="absolute hidden sm:block -top-24 right-0 h-72 w-72 rounded-full bg-[#4F46C8]/30 blur-3xl" aria-hidden="true" />
          <div className="absolute hidden sm:block -bottom-28 left-1/4 h-64 w-64 rounded-full bg-[#DE7726]/15 blur-3xl" aria-hidden="true" />
          <div className="relative grid lg:grid-cols-[0.92fr_1.08fr] gap-8">
            <div>
              <p className="text-[11.5px] font-bold uppercase tracking-[0.17em] text-[#A8A0FF]">Live calculator</p>
              <h2 className="text-[28px] sm:text-[34px] text-white mt-2">Add expenses.<br />Watch balances update.</h2>
              <p className="text-[#C5C3E1] text-[14.5px] mt-3 max-w-lg">Tap a sample bill. Then look at the balance card: <b className="text-white">+ means that person receives money</b> and <b className="text-white">− means that person pays</b>.</p>
              <div className="space-y-2.5 mt-6">
                {ACTIONS.map((a, i) => {
                  const added = demo.some((x) => x.desc === a.desc)
                  return (
                    <button key={a.desc} disabled={added} onClick={() => setDemo((d) => [...d, { ...a, id: Date.now() + i }])}
                      className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[.98] ${added ? 'border-[#8678FF]/50 bg-[#4F46C8]/20 text-white' : 'border-white/15 bg-white/5 text-[#E9E8FA] hover:bg-white/10'}`}>
                      <span className="grid place-items-center h-10 w-10 rounded-xl bg-white/10 shrink-0"><Icon name={a.icon} size={19} /></span>
                      <span className="flex-1 text-[14px] font-medium">{a.desc}</span>
                      {added && <Icon name="check" className="text-[#8FF0B3]" />}
                    </button>
                  )
                })}
              </div>
              <button onClick={() => setDemo([{ ...ACTIONS[0], id: 1 }])} className="mt-4 rounded-xl border border-white/20 px-4 min-h-[42px] text-[13px] font-semibold text-[#E9E8FA] hover:bg-white/10">Reset demo</button>
            </div>

            <div className="rounded-[26px] bg-white text-[#18172B] p-4 sm:p-5 shadow-lift3d self-start">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div><p className="text-[11px] uppercase tracking-[0.14em] text-[#514E6B] font-bold">Room balance</p><h3 className="text-[20px] text-[#18172B]">Who pays whom?</h3></div>
                <span className="grid place-items-center h-11 w-11 rounded-2xl bg-[#ECEBFA] text-[#5046C8]"><Icon name="qr" size={22} /></span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {PEOPLE.map((p) => {
                  const owes = debts.find((d) => d.fromId === p.name)?.paise
                  const gets = debts.filter((d) => d.toId === p.name).reduce((s, d) => s + d.paise, 0)
                  return (
                    <div key={p.name} className="rounded-2xl border border-[#D7E6DC] bg-[#F8FAF7] p-3 text-center">
                      <Avatar name={p.name} color={p.color} size={39} className="mx-auto mb-1.5" />
                      <p className="font-display font-bold text-[13.5px]">{p.name}</p>
                      <p className={`num text-[14px] mt-.5 ${gets ? 'text-[#087F5B]' : owes ? 'text-[#D92D20]' : 'text-[#514E6B]'}`}>
                        {gets ? `+${formatINR(gets)}` : owes ? `−${formatINR(owes)}` : 'Settled'}
                      </p>
                      <p className="text-[10.5px] text-[#514E6B]">{gets ? 'receives' : owes ? 'pays' : 'settled'}</p>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 rounded-xl bg-[#ECEBFA] border border-[#DADAF0] px-3 py-2.5 text-[12px] font-semibold text-[#514E6B]">Green + = money comes to that person · Red − = that person pays · Settled = no action</p>
              <div className="mt-4 rounded-2xl bg-[#5046C8] text-white px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[12.5px] font-semibold opacity-90">Total expenses</span><span className="num font-display text-[20px]">{formatINR(total)}</span>
              </div>
              {debts.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {debts.map((d) => (
                    <p key={`${d.fromId}-${d.toId}`} className="flex items-center gap-2 text-[13px] font-semibold bg-[#ECEBFA] border border-[#DADAF0] rounded-xl px-3 py-2.5">
                      <Icon name="qr" size={17} className="text-[#5046C8]" /> {d.fromId} → {d.toId}: QR ready for {formatINR(d.paise)}
                    </p>
                  ))}
                </div>
              ) : <p className="mt-3 text-[13px] font-semibold bg-green-50 border border-green-200 text-green-800 rounded-xl px-3 py-2.5">All balances are settled.</p>}
              <Link to={started ? '/room/payments' : '/onboarding'} className="btn-primary w-full mt-4"><Icon name={started ? 'wallet' : 'home'} /> {started ? 'Open Payments to make a real QR' : 'Create my room to try this'}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────── FEATURES ───────────────── */}
      <section id="features" className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 py-12 scroll-mt-20">
        <SectionHead kicker="Helpful tools" title="Less typing. Less confusion." sub="These tools are optional shortcuts. The basic flow is still: write expense → app divides → pay pending money." />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          <Feature icon="clipboard" title="Paste a bank SMS" body="Copy the SMS text. Auto Capture fills the amount and shop name, then asks you to check it." />
          <Feature icon="bank" title="Add many bills from one file" body="Upload a bank statement CSV to prepare many expenses together. Credits and duplicates are skipped." />
          <Feature icon="mic" title="Speak instead of typing" body="Say who paid, the amount, and the item. RoomHisaab prepares the expense for your review." />
          <Feature icon="bolt" title="Monthly bills set once" body="Rent, WiFi, and other repeated bills can be added automatically on their due day." />
          <Feature icon="share" title="Send a clear reminder" body="Share an invite, statement, or payment reminder on WhatsApp with the details already written." />
          <Feature icon="search" title="Find anything fast" body="On a computer, press Ctrl + K. On a phone, open Help & Guide and type normal words such as invite, pay, or old bill." />
        </div>
      </section>

      <section id="about" className="mx-auto max-w-content scroll-mt-20 px-4 py-12 sm:px-6 lg:px-8" aria-labelledby="about-title">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .55 }} className="card mx-auto max-w-4xl overflow-hidden p-6 text-center sm:p-9">
          <p className="kicker">About us</p>
          <h2 id="about-title" className="mt-2 text-[28px] sm:text-[36px]">Made to make shared money simple</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-soft">RoomHisaab helps people record everyday expenses, understand balances and share clear payment details—without confusing calculations.</p>
          <div className="mx-auto mt-7 flex max-w-xl flex-col items-center gap-4 rounded-3xl border border-line-light bg-surface-alt p-5 sm:flex-row sm:text-left">
            <div className="developer-avatar" role="img" aria-label="Komal Nath Yogi profile photo placeholder">KN</div>
            <div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-primary">Developer</p><h3 className="mt-1 text-[20px]">Komal Nath Yogi</h3><a className="mt-1 inline-block break-all text-[13px] font-semibold text-primary hover:underline" href="mailto:1komalnathyogi1@gmail.com">1komalnathyogi1@gmail.com</a><p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">Building a practical, clear and privacy-aware expense notebook for everyday Indian households and shared homes.</p></div>
          </div>
          <p className="mt-3 text-[11.5px] text-ink-faint">Profile image placeholder shown. Replace with the developer’s approved photo when available.</p>
        </motion.div>
      </section>

      {/* ───────────────── SMS PARSER ───────────────── */}
      <section className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 py-8">
        <div className="card p-5 sm:p-7 overflow-hidden relative">
          <div className="absolute -top-24 right-0 h-56 w-72 bg-primary/10 blur-3xl rounded-full pointer-events-none" aria-hidden="true" />
          <div className="relative grid lg:grid-cols-2 gap-6">
            <div>
              <p className="kicker">Try it</p>
              <h2 className="text-[27px] sm:text-[32px] mt-2">Paste a bank SMS</h2>
              <p className="text-ink-soft text-[14.5px] mt-2">The parser runs in your browser. Nothing is uploaded.</p>
              <label className="label mt-5" htmlFor="sms-demo">Bank / UPI SMS</label>
              <textarea id="sms-demo" rows={5} value={sms} onChange={(e) => setSms(e.target.value)}
                className="input !font-mono !text-[13px] resize-y" placeholder="SBI: Rs.500 debited..." />
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {SAMPLE_SMS.map((s, i) => <button key={i} onClick={() => setSms(s)} className="chip-off !text-[11.5px] !py-1">Sample {i + 1}</button>)}
              </div>
            </div>
            <div aria-live="polite">
              <span className="label lg:mt-[104px]">Automatic result</span>
              {parsed ? (
                <motion.div key={JSON.stringify(parsed)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25, ease }}
                  className="rounded-xl2 border border-primary/30 bg-primary/10 p-5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="num text-[30px] font-display text-primary">{formatINR(parsed.amountPaise)}</span>
                    <span className={`rounded-md px-2 py-1 text-[11px] font-bold border ${parsed.direction === 'debit' ? 'border-overdue/30 text-overdue bg-overdue/10' : 'border-moneyin/30 text-moneyin bg-moneyin/10'}`}>
                      {parsed.direction === 'debit' ? 'DEBIT · expense' : 'CREDIT · received'}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] mt-4">
                    <Row k="Merchant" v={parsed.merchant} />
                    <Row k="Bank / App" v={parsed.bank} />
                    <Row k="Method" v={parsed.methodGuess.toUpperCase()} />
                    <Row k="Date" v={parsed.date ? new Date(parsed.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
                    <Row k="Category" v={String(parsed.suggestedCategory ?? 'other')} />
                    <Row k="Confidence" v={`${parsed.confidence}%`} />
                  </dl>
                  <div className="h-2.5 w-full rounded-full bg-ink/10 overflow-hidden mt-5">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${parsed.confidence}%` }} transition={{ duration: .6, ease }}
                      className={`h-full rounded-full ${parsed.confidence >= 90 ? 'bg-moneyin' : parsed.confidence >= 70 ? 'bg-pending' : 'bg-overdue'}`} />
                  </div>
                  <Link to={started ? '/inbox' : '/onboarding'} className="btn-primary w-full mt-4"><Icon name="sparkles" /> Add in the app</Link>
                </motion.div>
              ) : (
                <div className="rounded-xl2 border border-dashed border-line-light p-6 text-center text-ink-soft text-[13.5px]">No amount was found. Paste the complete original bank or UPI SMS.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────── AUTOMATION TRUTH ───────────────── */}
      <section className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-6 items-start">
          <div>
            <p className="kicker">UPI automation, clearly explained</p>
            <h2 className="text-[28px] sm:text-[34px] mt-2">One-tap payment links.<span className="block text-ink-soft">No bank access without permission.</span></h2>
            <p className="text-ink-soft text-[15px] mt-3 max-w-lg">
              A normal website cannot secretly read your bank account. RoomHisaab uses practical, permission-based methods that work on the free web:
            </p>
            <Link to={started ? '/room/payments' : '/onboarding'} className="btn-primary !px-5 mt-5"><Icon name="qr" /> Open Payment Center</Link>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Truth icon="qr" title="Exact QR + App" body="UPI ID, name, amount and note in standard UPI format for scanning or app opening." tag="Automatic" />
            <Truth icon="share" title="SMS Share Target" body="The installed app appears in Android Share, so an SMS can be sent directly for parsing." tag="1 share" />
            <Truth icon="bank" title="Statement CSV" body="Upload a bank CSV and review months of expenses together." tag="Bulk auto" />
          </div>
        </div>
      </section>

      {/* ───────────────── FAQ ───────────────── */}
      <section id="faq" className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 py-10 scroll-mt-20">
        <SectionHead kicker="FAQ" title="Clear from day one" sub="No hidden charges and no misleading bank-access claims." />
        <div className="grid lg:grid-cols-2 gap-3 mt-7">
          <Faq q="I am new. Which button should I press first?" a="Use the four Start Here cards above. Create a room if you are the first person, Join if a friend sent a link, Sign in if the room already exists, or open the demo if you only want to learn." />
          <Faq q="What is the difference between Quick Buy and Payments?" a="Quick Buy writes a new purchase. Payments is for money that is already pending between members after expenses have been divided." />
          <Faq q="Can the website read expenses directly from my bank?" a="No. A normal free website cannot do that legally. RoomHisaab captures expenses only from SMS text or a bank CSV that you choose to share." />
          <Faq q="Does scanning the QR complete the payment?" a="The QR fills the payee, exact amount and note in your UPI app. You approve the payment and enter the PIN only in that app." />
          <Faq q="Why are personal details needed?" a="Name and UPI ID are used for payments, phone for reminders, and email is optional. RoomHisaab never asks for a PIN, OTP, card number or bank password." />
          <Faq q="Where is my data stored?" a="Cloud rooms are stored in Supabase with a fast local snapshot. Local rooms stay in your browser. JSON backup and restore are available in Settings." />
        </div>
      </section>

      {/* ───────────────── CTA ───────────────── */}

      <section className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 pb-16">
        <div className="relative overflow-hidden rounded-[30px] bg-[#15172F] text-[#F1F0FF] px-6 py-11 sm:px-10 text-center shadow-lift3d border border-white/10">
          <div className="absolute hidden sm:block -top-20 left-1/4 h-52 w-52 rounded-full bg-[#4F46C8]/35 blur-3xl" aria-hidden="true" />
          <div className="absolute hidden sm:block -bottom-24 right-1/4 h-56 w-56 rounded-full bg-[#DE7726]/20 blur-3xl" aria-hidden="true" />
          <div className="relative">
            <span className="mx-auto grid place-items-center h-14 w-14 rounded-2xl bg-gradient-to-br from-[#4F46C8] to-[#DE7726] text-white"><Icon name="home" size={27} /></span>
            <h2 className="text-[28px] sm:text-[36px] mt-4 text-white">Clear balances for every room.</h2>
            <p className="text-[#C5C3E1] mt-2">Create a room · Write expenses · See who pays whom</p>
            <Link to={started ? '/room' : '/onboarding'} className="inline-flex items-center justify-center gap-2 mt-6 rounded-xl bg-white text-[#3C34A3] font-display font-bold px-6 min-h-[50px] shadow-card active:scale-95 transition-transform">
              <Icon name="arrowRight" size={19} /> {started ? 'Open room' : 'Start free'}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line-light py-7">
        <div className="mx-auto max-w-content px-4 sm:px-6 lg:px-8 flex flex-wrap gap-3 items-center text-[13px] text-ink-soft">
          <span className="flex items-center gap-2"><span className="grid place-items-center h-8 w-8 rounded-xl bg-primary-solid text-primary-on"><Icon name="rupee" size={16} /></span><b className="font-display text-ink">{APP.name}</b></span>
          <p>{APP.tagline}</p><span className="flex-1" />
          <a href="#start-here" className="text-primary font-semibold">Start Here</a>
          <Link to="/room/guide" className="text-primary font-semibold">Help & Guide</Link>
          <Link to="/settings" className="text-primary font-semibold">Settings & Privacy</Link>
        </div>
      </footer>
    </div>
  )
}

function WelcomeChoice({ icon, title, detail, to, onClick }: { icon: IconName; title: string; detail: string; to?: string; onClick?: () => void }) {
  const inner = <><span className="icon-tile h-11 w-11"><Icon name={icon} size={21} /></span><h2 className="mt-3 text-[16px]">{title}</h2><p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{detail}</p><span className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-primary">Continue <Icon name="arrowRight" size={15} /></span></>
  return to ? <Link to={to} className="welcome-choice card p-4 sm:p-5">{inner}</Link> : <button type="button" onClick={onClick} className="welcome-choice card p-4 text-left sm:p-5">{inner}</button>
}

function StartCard({ icon, title, body, cta, to, onClick }: { icon: IconName; title: string; body: string; cta: string; to?: string; onClick?: () => void }) {
  return (
    <article className="card flex h-full flex-col p-5 hover:-translate-y-1 hover:shadow-lift3d transition-all duration-300">
      <span className="icon-tile h-12 w-12"><Icon name={icon} size={23} /></span>
      <h3 className="text-[17px] mt-4">{title}</h3>
      <p className="text-[13.5px] leading-relaxed text-ink-soft mt-1.5 flex-1">{body}</p>
      {to ? (
        <Link to={to} className="btn-primary w-full mt-4"><Icon name="arrowRight" size={17} /> {cta}</Link>
      ) : (
        <button type="button" onClick={onClick} className="btn-primary w-full mt-4"><Icon name="arrowRight" size={17} /> {cta}</button>
      )}
    </article>
  )
}

function ExampleBox({ step, title, body, amount }: { step: string; title: string; body: string; amount: string }) {
  return (
    <div className="rounded-[20px] border border-line-light bg-surface-alt p-4 text-center">
      <span className="mx-auto grid h-8 w-8 place-items-center rounded-full bg-primary-solid text-[13px] font-bold text-white">{step}</span>
      <h4 className="mt-3 font-display text-[16px] font-bold">{title}</h4>
      <p className="mt-1 min-h-[54px] text-[12.5px] leading-relaxed text-ink-soft">{body}</p>
      <p className="num mt-2 font-display text-[22px] font-bold text-primary">{amount}</p>
    </div>
  )
}

function JourneyStep({ n, title, body, accent = false }: { n: string; title: string; body: string; accent?: boolean }) {
  return (
    <li className="bg-surface-card px-3 py-3.5 text-center">
      <span className={`mx-auto grid h-8 w-8 place-items-center rounded-full font-display text-[13px] font-black ${accent ? 'bg-accent-solid text-white' : 'border border-primary/25 bg-primary/10 text-primary'}`}>{n}</span>
      <span className="mt-2 block font-display text-[13px] font-bold leading-tight">{title}</span>
      <span className="mt-1 block text-[11px] leading-tight text-ink-soft">{body}</span>
    </li>
  )
}

function Stat({ top, bottom }: { top: string; bottom: string }) {
  return <div className="bg-surface-card p-4 text-center"><p className="num font-display text-[20px] sm:text-[24px] text-primary leading-none">{top}</p><p className="text-[11px] text-ink-soft mt-1.5 leading-tight">{bottom}</p></div>
}

function SectionHead({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,360px)] md:items-end">
      <div>
        <p className="kicker">{kicker}</p>
        <h2 className="text-[28px] sm:text-[36px] mt-2">{title}</h2>
      </div>
      <p className="text-ink-soft text-[15px] leading-relaxed md:pb-1">{sub}</p>
    </div>
  )
}

function StepCard({ n, icon, title, body, points }: { n: string; icon: IconName; title: string; body: string; points: string[] }) {
  return (
    <article className="card group p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lift3d">
      <div className="flex items-start justify-between gap-3">
        <span className="icon-tile h-12 w-12"><Icon name={icon} size={23} /></span>
        <span className="inline-flex min-h-[34px] items-center rounded-full border border-primary/25 bg-primary/10 px-3 font-display text-[11px] font-black uppercase tracking-[0.11em] text-primary">Step {Number(n)}</span>
      </div>
      <h3 className="text-[17px] mt-4">{title}</h3>
      <p className="text-[13.5px] text-ink-soft mt-1.5">{body}</p>
      <ul className="mt-4 space-y-1.5">
        {points.map((p) => <li key={p} className="flex gap-2 text-[12.5px] font-semibold"><Icon name="check" size={16} className="text-moneyin shrink-0 mt-.5" />{p}</li>)}
      </ul>
    </article>
  )
}

function Feature({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <article className="card p-5 hover:-translate-y-1 hover:shadow-lift3d transition-all duration-300">
      <span className="icon-tile h-11 w-11"><Icon name={icon} size={21} /></span>
      <h3 className="text-[16.5px] mt-3.5">{title}</h3><p className="text-[13.5px] text-ink-soft mt-1.5">{body}</p>
    </article>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-ink-soft font-semibold">{k}</dt><dd className="font-semibold truncate text-ink">{v}</dd></div>
}

function Truth({ icon, title, body, tag }: { icon: IconName; title: string; body: string; tag: string }) {
  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-2"><span className="icon-tile h-11 w-11"><Icon name={icon} size={21} /></span><span className="rounded-full bg-moneyin/10 border border-moneyin/25 px-2 py-0.5 text-[10.5px] font-bold text-moneyin">{tag}</span></div>
      <h3 className="text-[16px] mt-3">{title}</h3><p className="text-[13px] text-ink-soft mt-1">{body}</p>
    </article>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="card px-5 py-4 group">
      <summary className="cursor-pointer list-none font-display font-bold text-[15.5px] flex items-center gap-3">
        <span className="flex-1">{q}</span><span className="grid place-items-center h-8 w-8 rounded-full bg-primary/10 text-primary transition-transform group-open:rotate-45"><Icon name="plus" size={17} /></span>
      </summary>
      <p className="text-[13.5px] text-ink-soft mt-3 leading-relaxed">{a}</p>
    </details>
  )
}
