import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHead } from '../components/Layout'
import { SectionCard } from '../components/SectionCard'
import { Icon, type IconName } from '../components/Icon'
import { clearHiddenPageTips } from '../components/PageHelp'
import { useRoomData, useStore } from '../hooks/useStore'
import { GLOSSARY, GUIDE_FAQS, GUIDE_TASKS, PAGE_HELP } from '../lib/guide'
import { fetchMyRecoveryKeyStatus } from '../lib/cloud'
import { formatINR, parseRupeesToPaise, splitEqual } from '../lib/money'
import clsx from 'clsx'

const QUICK_SEARCHES = ['already paid', 'invite', 'old bill', 'monthly rent', 'forgot password']

function includesQuery(text: string, query: string): boolean {
  return !query || text.toLowerCase().includes(query)
}

function cleanAmountInput(raw: string): string {
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.]/g, '')
  const [whole = '', ...decimalParts] = cleaned.split('.')
  if (decimalParts.length === 0) return whole.slice(0, 9)
  return `${whole.slice(0, 9)}.${decimalParts.join('').slice(0, 2)}`
}

export default function Guide() {
  const navigate = useNavigate()
  const { state, isCloudRoomActive, loadDemo, pushToast } = useStore()
  const { room, members, expenses, me } = useRoomData()
  const [query, setQuery] = useState('')
  const [amount, setAmount] = useState('900')
  const [people, setPeople] = useState(3)
  const [recoveryReady, setRecoveryReady] = useState<boolean | null>(null)
  const [tipsReset, setTipsReset] = useState(false)

  const normalizedQuery = query.trim().toLowerCase()
  const realMembers = members.filter((member) => !member.isVirtual)
  const liveExpenses = expenses.filter((expense) => !expense.deleted)
  const allUpiReady = realMembers.length > 0 && realMembers.every((member) => !!member.upiId)

  useEffect(() => {
    if (!isCloudRoomActive || !room?.id) {
      setRecoveryReady(null)
      return
    }
    let cancelled = false
    fetchMyRecoveryKeyStatus(room.id)
      .then((status) => { if (!cancelled) setRecoveryReady(status.hasKey) })
      .catch(() => { if (!cancelled) setRecoveryReady(null) })
    return () => { cancelled = true }
  }, [isCloudRoomActive, room?.id])

  const tasks = useMemo(
    () => GUIDE_TASKS.filter((task) => includesQuery(`${task.title} ${task.body} ${task.cta} ${task.keywords}`, normalizedQuery)),
    [normalizedQuery],
  )
  const pages = useMemo(
    () => Object.entries(PAGE_HELP).filter(([path, page]) => includesQuery(`${path} ${page.pageName} ${page.purpose} ${page.firstStep} ${page.example}`, normalizedQuery)),
    [normalizedQuery],
  )
  const words = useMemo(
    () => GLOSSARY.filter((item) => includesQuery(`${item.term} ${item.meaning} ${item.example} ${item.keywords}`, normalizedQuery)),
    [normalizedQuery],
  )
  const faqs = useMemo(
    () => GUIDE_FAQS.filter((item) => includesQuery(`${item.question} ${item.answer} ${item.keywords}`, normalizedQuery)),
    [normalizedQuery],
  )
  const resultCount = tasks.length + pages.length + words.length + faqs.length

  const checklist = [
    {
      label: 'Create or open a room',
      detail: room ? `${room.name} is open.` : 'A room is the shared notebook for one home or PG.',
      done: !!room,
      to: room ? '/room' : '/onboarding',
      cta: room ? 'Open Room Home' : 'Create room',
    },
    {
      label: 'Add at least 2 people',
      detail: `${realMembers.length} real member${realMembers.length === 1 ? '' : 's'} in this room.`,
      done: realMembers.length >= 2,
      to: '/room/members',
      cta: 'Open Members',
    },
    {
      label: 'Save your UPI ID',
      detail: me?.upiId ? `Your receiving UPI ID is ${me.upiId}.` : 'This is needed so another member can create a QR to pay you.',
      done: !!me?.upiId,
      to: '/room/members',
      cta: 'Complete profile',
    },
    {
      label: 'Save every member’s UPI ID',
      detail: allUpiReady ? 'Everyone can receive QR payments.' : 'A payment QR cannot be made for a member whose UPI ID is missing.',
      done: allUpiReady,
      to: '/room/members',
      cta: 'Check UPI profiles',
    },
    {
      label: 'Add the first real expense',
      detail: liveExpenses.length ? `${liveExpenses.length} expense${liveExpenses.length === 1 ? '' : 's'} saved.` : 'Try one small real purchase to see the balance change.',
      done: liveExpenses.length > 0,
      to: '/room/buy',
      cta: 'Open Quick Buy',
    },
    {
      label: 'Optional: set one monthly bill',
      detail: state.recurring.length ? `${state.recurring.length} recurring bill${state.recurring.length === 1 ? '' : 's'} set.` : 'Rent or WiFi can be added automatically every month.',
      done: state.recurring.length > 0,
      to: '/room/rules',
      cta: 'Open Automation',
    },
    ...(isCloudRoomActive ? [{
      label: 'Save your Personal Recovery Key',
      detail: recoveryReady === true ? 'A recovery key is ready for this login.' : recoveryReady === false ? 'Create it now, before a forgotten-password problem happens.' : 'Open Settings to check this safety step.',
      done: recoveryReady,
      to: '/settings',
      cta: 'Open Settings',
    }] : []),
  ]
  const knownChecklist = checklist.filter((item) => item.done !== null)
  const checklistPercent = knownChecklist.length
    ? Math.round((knownChecklist.filter((item) => item.done).length / knownChecklist.length) * 100)
    : 0

  const amountPaise = parseRupeesToPaise(amount) ?? 0
  const shares = amountPaise > 0 ? splitEqual(amountPaise, people) : []
  const othersReturn = amountPaise > 0 ? amountPaise - (shares[0] ?? 0) : 0

  const showAllPageTips = () => {
    clearHiddenPageTips()
    setTipsReset(true)
    pushToast({ message: 'Page tips are on again. Open any page to see its simple explanation.', tone: 'ok' })
  }

  const openDemo = () => {
    void loadDemo().then((opened) => { if (opened) navigate('/room?tour=1') })
  }

  return (
    <>
      <PageHead
        title="Help & Guide"
        sub="RoomHisaab explained in simple words, with examples"
        right={room ? (
          <Link to="/room?tour=1" className="btn-primary"><Icon name="sparkles" size={18} /> Take 1-minute tour</Link>
        ) : (
          <button type="button" onClick={openDemo} className="btn-primary"><Icon name="sparkles" size={18} /> Try demo + tour</button>
        )}
      />

      {/* Simple meaning */}
      <section className="relative mb-5 overflow-hidden rounded-[28px] border border-white/10 bg-[#15172F] p-5 text-[#F1F0FF] shadow-lift3d sm:p-7" aria-labelledby="guide-main-title">
        <div className="absolute -right-20 -top-24 hidden h-64 w-64 rounded-full bg-[#4F46C8]/30 blur-3xl sm:block" aria-hidden="true" />
        <div className="absolute -bottom-28 left-1/3 hidden h-52 w-52 rounded-full bg-[#DE7726]/20 blur-3xl sm:block" aria-hidden="true" />
        <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-[#A8A0FF]">Start here</p>
            <h2 id="guide-main-title" className="mt-2 text-[28px] leading-tight text-white sm:text-[36px]">RoomHisaab is one shared money notebook.</h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#C5C3E1]">
              Roommates write each shared expense once. RoomHisaab divides the bill and clearly answers three questions:
              <b className="text-white"> Who paid? What is each person’s share? Who should pay whom?</b>
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {room ? (
                <Link to="/room?tour=1" className="btn-accent !px-5"><Icon name="sparkles" /> Replay the tour</Link>
              ) : (
                <button type="button" onClick={openDemo} className="btn-accent !px-5"><Icon name="sparkles" /> Open demo and tour</button>
              )}
              <a href="#guide-tasks" className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 font-display text-[14px] font-bold text-white hover:bg-white/15">
                <Icon name="search" size={18} /> Find what to tap
              </a>
            </div>
          </div>

          <div className="rounded-[24px] bg-white p-5 text-[#18172B] shadow-lift3d" aria-label="Simple expense example">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#514E6B]">One tiny example</p>
            <div className="mt-4 space-y-3 text-center">
              <ExampleLine top="Komal Nath pays at the shop" bottom="Groceries" amount="₹900" />
              <p className="text-[20px]" aria-hidden="true">↓</p>
              <p className="rounded-2xl bg-[#ECEBFA] px-4 py-3 font-display text-[17px] font-bold text-[#3C34A3]">₹900 ÷ 3 people = ₹300 each</p>
              <p className="text-[20px]" aria-hidden="true">↓</p>
              <div className="grid grid-cols-2 gap-2">
                <ExampleLine top="Anurag returns" bottom="to Komal Nath" amount="₹300" compact />
                <ExampleLine top="Prabhat returns" bottom="to Komal Nath" amount="₹300" compact />
              </div>
            </div>
            <p className="mt-4 text-center text-[12.5px] font-semibold text-[#514E6B]">That is the whole idea. The app does this maths for every bill.</p>
          </div>
        </div>
      </section>

      {/* Search by job */}
      <section id="guide-tasks" className="card mb-5 scroll-mt-24 p-5 sm:p-6" aria-labelledby="guide-search-title">
        <div className="flex items-start gap-3">
          <span className="icon-tile h-11 w-11 shrink-0"><Icon name="search" size={21} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="guide-search-title" className="text-[20px] leading-tight">What do you want to do?</h2>
            <p className="mt-1 text-[13px] text-ink-soft">Type normal words. You do not need to know the page name.</p>
          </div>
          {normalizedQuery && <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11.5px] font-bold text-primary">{resultCount} results</span>}
        </div>
        <label className="label mt-4" htmlFor="guide-search">Search the guide</label>
        <div className="relative">
          <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            id="guide-search"
            className="input !pl-11 !pr-11"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try: invite, old bill, already paid…"
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="btn-ghost absolute right-1 top-1/2 !px-2.5 -translate-y-1/2" aria-label="Clear guide search">
              <Icon name="x" size={17} />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested searches">
          {QUICK_SEARCHES.map((term) => (
            <button key={term} type="button" onClick={() => setQuery(term)} className={normalizedQuery === term ? 'chip-on' : 'chip-off'}>
              {term}
            </button>
          ))}
        </div>
        {normalizedQuery && resultCount === 0 && (
          <p className="mt-4 rounded-2xl border border-pending/30 bg-pending/10 px-4 py-3 text-[13.5px] font-semibold text-pending" role="status">
            No guide result for “{query}”. Try a shorter word such as “pay”, “invite”, “bill”, or “password”.
          </p>
        )}
      </section>

      {/* Task shortcuts */}
      {tasks.length > 0 && (
        <section className="mb-7" aria-labelledby="guide-task-title">
          <SectionHeading id="guide-task-title" icon="bolt" title="Tap the sentence that matches your job" sub="Each card opens the correct page. Opening a page does not move money." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tasks.map((task) => (
              <Link key={task.id} to={task.to} className="card group p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift3d">
                <span className="icon-tile h-11 w-11"><Icon name={task.icon} size={21} /></span>
                <span className="mt-3 block font-display text-[16px] font-bold leading-snug">{task.title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-soft">{task.body}</span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-primary">
                  {task.cta} <Icon name="arrowRight" size={16} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Four-step monthly flow */}
      {!normalizedQuery && (
        <section className="mb-7" aria-labelledby="guide-flow-title">
          <SectionHeading id="guide-flow-title" icon="home" title="Normal use is only 4 steps" sub="Repeat these steps whenever someone pays for a shared thing." />
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FlowCard number="1" icon="users" title="People are added once" body="Save names and UPI IDs in Members & UPI." to="/room/members" />
            <FlowCard number="2" icon="receipt" title="Write the expense" body="Use Quick Buy, Add Expense, or Auto Capture." to="/room/buy" />
            <FlowCard number="3" icon="chart" title="See the balance" body="Room Home shows who should receive and who should pay." to="/room" />
            <FlowCard number="4" icon="qr" title="Pay and confirm" body="Use Payments for the exact QR or UPI app, then record the settlement." to="/room/payments" />
          </ol>
          <div className="mt-3 grid gap-3 md:grid-cols-3" aria-label="Meaning of balance signs">
            <SignCard symbol="+ ₹300" title="Money comes to this person" body="This person paid extra for the room and should receive money back." tone="text-moneyin" />
            <SignCard symbol="− ₹300" title="This person should pay" body="This person’s share is still pending. Open Payments to pay it." tone="text-overdue" />
            <SignCard symbol="₹0" title="Settled — no action" body="This person neither receives nor pays anything right now." tone="text-ink-soft" />
          </div>
        </section>
      )}

      {/* Interactive split calculator */}
      {!normalizedQuery && (
        <SectionCard className="mb-7" title="Try it yourself: split calculator" sub="Change the amount and number of people. This is only a learning example; it does not save an expense.">
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <label className="label" htmlFor="guide-calc-amount">One person paid this full amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display text-[22px] font-bold text-ink-soft" aria-hidden="true">₹</span>
                <input
                  id="guide-calc-amount"
                  className="input num !py-3 !pl-11 !text-[24px] !font-display !font-bold"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(cleanAmountInput(event.target.value))}
                />
              </div>
              <span className="label mt-4">How many people share it, including the payer?</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Number of people sharing">
                {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                  <button key={count} type="button" onClick={() => setPeople(count)} className={people === count ? 'chip-on' : 'chip-off'} aria-pressed={people === count}>
                    {count} people
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-[22px] border border-primary/25 bg-primary/10 p-4 sm:p-5" aria-live="polite">
              {amountPaise > 0 ? (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-primary">Result</p>
                  <p className="num mt-2 font-display text-[25px] leading-tight">{formatINR(amountPaise)} ÷ {people}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                    Shares: <b className="text-ink">{shares.map(formatINR).join(' · ')}</b>
                  </p>
                  <p className="mt-3 rounded-xl bg-surface-card px-3.5 py-3 text-[13.5px] leading-relaxed text-ink-soft">
                    The payer also uses one share. The other {people - 1} people return <b className="text-ink">{formatINR(othersReturn)}</b> in total to the payer.
                  </p>
                </>
              ) : (
                <p className="text-[14px] font-semibold text-ink-soft">Enter an amount above ₹0 to see the split.</p>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Add method confusion */}
      {!normalizedQuery && (
        <section className="mb-7" aria-labelledby="guide-add-choice-title">
          <SectionHeading id="guide-add-choice-title" icon="help" title="Which Add button should I use?" sub="This is the most common confusion. Choose by the situation, not by the feature name." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ChoiceCard icon="scan" title="Quick Buy" when="“I am at a shop” or “I already paid”" body="Fastest. Item + amount, then Pay now or Already paid." to="/room/buy" />
            <ChoiceCard icon="plus" title="Add Expense" when="“This split is special”" body="Full control: payer, selected people, percentage, or exact shares." to="/room?add=1" />
            <ChoiceCard icon="sparkles" title="Auto Capture" when="“I have an SMS, file, or voice note”" body="The app prepares the expense. You review and confirm it." to="/inbox" />
            <ChoiceCard icon="qr" title="Payments" when="“Money is already pending”" body="Not for a new purchase. Use it to pay a member and clear a balance." to="/room/payments" />
          </div>
          <p className="mt-3 rounded-2xl border border-line-light bg-surface-card px-4 py-3 text-[13.5px] leading-relaxed text-ink-soft">
            <b className="text-ink">After saving:</b> the entry appears in <b className="text-ink">History</b>, balances change on <b className="text-ink">Room Home</b>, charts update in <b className="text-ink">Reports</b>, and any pending member payment appears in <b className="text-ink">Payments</b>.
          </p>
        </section>
      )}

      {/* Checklist */}
      {!normalizedQuery && (
        <SectionCard className="mb-7" title="First-time setup checklist" sub="Do these once. After that, daily use is mostly Quick Buy and Payments." right={<span className="font-display text-[18px] font-bold text-primary">{checklistPercent}%</span>}>
          <div className="meter"><span style={{ width: `${checklistPercent}%` }} /></div>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {checklist.map((item) => (
              <li key={item.label} className="flex gap-3 rounded-2xl border border-line-light p-3.5">
                <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-full', item.done ? 'bg-moneyin/15 text-moneyin' : 'bg-ink/5 text-ink-faint')}>
                  <Icon name={item.done ? 'check' : 'plus'} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold">{item.label}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-soft">{item.detail}</span>
                  <Link to={item.to} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-bold text-primary">
                    {item.cta} <Icon name="arrowRight" size={14} />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Page map */}
      {pages.length > 0 && (
        <section className="mb-7" aria-labelledby="guide-pages-title">
          <SectionHeading id="guide-pages-title" icon="clipboard" title="Every page in one easy line" sub="Use this map whenever you forget where something is." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pages.map(([path, page]) => (
              <Link key={path} to={path} className="card p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift3d">
                <span className="icon-tile h-10 w-10"><Icon name={page.icon} size={20} /></span>
                <span className="mt-3 block font-display text-[16px] font-bold">{page.pageName}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-soft">{page.purpose}</span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-primary">Open page <Icon name="arrowRight" size={14} /></span>
              </Link>
            ))}
            {!normalizedQuery && (
              <div className="card border-primary/30 bg-primary/5 p-4">
                <span className="icon-tile h-10 w-10"><Icon name="help" size={20} /></span>
                <span className="mt-3 block font-display text-[16px] font-bold">Help & Guide</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-soft">You are here. Search a job, learn the words, replay the tour, or turn page tips back on.</span>
                <span className="badge-ok mt-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold">Current page</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Glossary */}
      {words.length > 0 && (
        <section className="mb-7" aria-labelledby="guide-words-title">
          <SectionHeading id="guide-words-title" icon="receipt" title="Words used in this app" sub="No difficult finance words. Each word has a tiny example." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {words.map((item) => (
              <article key={item.term} className="card p-4">
                <h3 className="text-[16px]">{item.term}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{item.meaning}</p>
                <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-soft"><b className="text-ink">Example:</b> {item.example}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      {faqs.length > 0 && (
        <section className="mb-7" aria-labelledby="guide-faq-title">
          <SectionHeading id="guide-faq-title" icon="help" title="Common confusion, answered simply" sub="Tap a question to open the answer." />
          <div className="grid gap-3 lg:grid-cols-2">
            {faqs.map((item) => (
              <details key={item.question} className="card group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center gap-3 font-display text-[15.5px] font-bold">
                  <span className="flex-1">{item.question}</span>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary transition-transform group-open:rotate-45"><Icon name="plus" size={17} /></span>
                </summary>
                <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Safety and reset help */}
      {!normalizedQuery && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#15172F] p-5 text-[#F1F0FF] shadow-lift3d sm:p-6" aria-labelledby="guide-safety-title">
            <div className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-[#4F46C8]/30 blur-3xl" aria-hidden="true" />
            <div className="relative">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-[#A8A0FF]"><Icon name="shield" size={22} /></span>
              <h2 id="guide-safety-title" className="mt-3 text-[20px] text-white">Safe UPI rule</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#C5C3E1]">
                RoomHisaab only prepares the payment. Your UPI app moves the money. Always check the receiver name and amount in the UPI app.
                <b className="text-white"> Never enter a UPI PIN, OTP, card number, or bank password on this website.</b>
              </p>
            </div>
          </section>

          <SectionCard title="Need the help boxes again?" sub="Useful after hiding a page tip.">
            <p className="text-[13.5px] leading-relaxed text-ink-soft">
              Every main page can show a short box: what the page is for, what to do first, and one easy example.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={showAllPageTips} className="btn-primary !px-4"><Icon name="help" size={18} /> Show all page tips again</button>
              <Link to="/room?tour=1" className="btn-outline !px-4"><Icon name="sparkles" size={18} /> Replay tour</Link>
            </div>
            {tipsReset && <p className="mt-3 text-[12.5px] font-semibold text-moneyin" role="status">Done. Page tips will appear again when you open those pages.</p>}
          </SectionCard>
        </div>
      )}
    </>
  )
}

function ExampleLine({ top, bottom, amount, compact = false }: { top: string; bottom: string; amount: string; compact?: boolean }) {
  return (
    <div className={clsx('rounded-2xl border border-[#D7E6DC] bg-[#F8FAF7]', compact ? 'p-3' : 'p-4')}>
      <p className={clsx('font-display font-bold', compact ? 'text-[13px]' : 'text-[15px]')}>{top}</p>
      <p className="text-[11.5px] text-[#514E6B]">{bottom}</p>
      <p className={clsx('num mt-1 font-display font-bold text-[#5046C8]', compact ? 'text-[18px]' : 'text-[24px]')}>{amount}</p>
    </div>
  )
}

function SectionHeading({ id, icon, title, sub }: { id: string; icon: IconName; title: string; sub: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-3">
      <span className="icon-tile h-10 w-10 shrink-0"><Icon name={icon} size={20} /></span>
      <div>
        <h2 id={id} className="text-[19px] leading-tight">{title}</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-soft">{sub}</p>
      </div>
    </div>
  )
}

function FlowCard({ number, icon, title, body, to }: { number: string; icon: IconName; title: string; body: string; to: string }) {
  return (
    <li>
      <Link to={to} className="card block h-full p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift3d">
        <span className="flex items-start justify-between gap-3">
          <span className="icon-tile h-11 w-11"><Icon name={icon} size={21} /></span>
          <span className="inline-flex min-h-[32px] items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 font-display text-[10.5px] font-black uppercase tracking-[0.11em] text-primary">Step {Number(number)}</span>
        </span>
        <span className="mt-3 block font-display text-[15.5px] font-bold">{title}</span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-soft">{body}</span>
      </Link>
    </li>
  )
}

function SignCard({ symbol, title, body, tone }: { symbol: string; title: string; body: string; tone: string }) {
  return (
    <article className="card p-4 text-center">
      <p className={clsx('num font-display text-[28px] font-bold', tone)}>{symbol}</p>
      <h3 className="mt-1 text-[15px]">{title}</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{body}</p>
    </article>
  )
}

function ChoiceCard({ icon, title, when, body, to }: { icon: IconName; title: string; when: string; body: string; to: string }) {
  return (
    <Link to={to} className="card p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift3d">
      <span className="icon-tile h-11 w-11"><Icon name={icon} size={21} /></span>
      <span className="mt-3 block font-display text-[16px] font-bold">{title}</span>
      <span className="mt-1 block text-[12px] font-bold text-primary">{when}</span>
      <span className="mt-1.5 block text-[12.5px] leading-relaxed text-ink-soft">{body}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-bold text-primary">Open <Icon name="arrowRight" size={14} /></span>
    </Link>
  )
}
