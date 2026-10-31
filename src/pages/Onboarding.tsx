import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../hooks/useStore'
import { usePersistentState } from '../hooks/usePersistentDraft'
import { APP } from '../lib/constants'
import { makeSeedRoom } from '../lib/seed'
import { isCloudConfigured, makeRoomLoginId, normalizeLoginUsername, normalizeRoomLoginId } from '../lib/supabase'
import { Avatar } from '../components/Avatar'
import { Icon, type IconName } from '../components/Icon'
import {
  MemberProfileFields,
  emptyMemberProfile,
  missingProfileFields,
  profileCompletion,
  profileDraftError,
  profileDraftToMember,
  type MemberProfileDraft,
} from '../components/MemberProfileFields'
import clsx from 'clsx'

const ease = [0.4, 0, 0.2, 1] as const

function toDateInput(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function parseDateInput(value: string, endOfDay = false): number | null {
  const [y, m, da] = value.split('-').map(Number)
  if (!y || !m || !da) return null
  return new Date(y, m - 1, da, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime()
}

interface MateDraft { name: string; profile: MemberProfileDraft }

const STEP_META: { title: string; sub: string; icon: IconName }[] = [
  { title: 'Room details', sub: 'Room name and your name', icon: 'home' },
  { title: 'Add members', sub: 'Add people now or later', icon: 'users' },
  { title: 'Monthly period', sub: 'Choose when the month starts', icon: 'chart' },
  { title: 'Save your room', sub: 'Choose where your room stays', icon: 'shield' },
]

export default function Onboarding() {
  const nav = useNavigate()
  const { createRoom, cloudCreateRoom, pushToast } = useStore()
  const [step, setStep, clearStepDraft] = usePersistentState('onboarding.v7.step', 0)
  const [roomName, setRoomName, clearRoomNameDraft] = usePersistentState('onboarding.roomName', '')
  const [myName, setMyName, clearMyNameDraft] = usePersistentState('onboarding.myName', '')
  const [myProfile, setMyProfile, clearMyProfileDraft] = usePersistentState<MemberProfileDraft>('onboarding.myProfile', () => emptyMemberProfile())
  const [mates, setMates, clearMatesDraft] = usePersistentState<MateDraft[]>('onboarding.mates', () => [{ name: '', profile: emptyMemberProfile() }])
  const [expandedMate, setExpandedMate, clearExpandedMateDraft] = usePersistentState<number | null>('onboarding.expandedMate', 0)
  const [cycleDay, setCycleDay, clearCycleDayDraft] = usePersistentState('onboarding.cycleDay', 1)
  const [cycleChoice, setCycleChoice, clearCycleChoiceDraft] = usePersistentState<'monthly' | 'today' | 'custom'>('onboarding.cycleChoice', 'monthly')
  const [customStart, setCustomStart, clearCustomStartDraft] = usePersistentState('onboarding.customStart', () => toDateInput(new Date()))
  const [customEnd, setCustomEnd, clearCustomEndDraft] = usePersistentState('onboarding.customEnd', () => { const d = new Date(); d.setDate(d.getDate() + 29); return toDateInput(d) })
  const [cloudEnabled, setCloudEnabled, clearCloudEnabledDraft] = usePersistentState('onboarding.cloudEnabled', isCloudConfigured)
  const [roomLoginId, setRoomLoginId, clearRoomLoginDraft] = usePersistentState('onboarding.roomLoginId', () => makeRoomLoginId('room'))
  // Passwords are intentionally memory-only and are never saved as drafts.
  const [roomPassword, setRoomPassword] = useState('')
  const [confirmRoomPassword, setConfirmRoomPassword] = useState('')
  const [loginUsername, setLoginUsername, clearLoginUsernameDraft] = usePersistentState('onboarding.loginUsername', '')
  const [usernameTouched, setUsernameTouched, clearUsernameTouchedDraft] = usePersistentState('onboarding.usernameTouched', false)
  const [personalPassword, setPersonalPassword] = useState('')
  const [confirmPersonalPassword, setConfirmPersonalPassword] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const creationLockRef = useRef(false)
  const [cloudError, setCloudError] = useState('')

  useEffect(() => {
    if (!usernameTouched) setLoginUsername(normalizeLoginUsername(myName))
  }, [myName, usernameTouched])

  const cleanMates = useMemo(() => mates.map((m) => ({ ...m, name: m.name.trim() })).filter((m) => m.name), [mates])
  const myDetails = useMemo(() => profileDraftToMember(myProfile), [myProfile])
  const allProfiles = useMemo(() => [
    { name: myName.trim() || 'You', details: myDetails },
    ...cleanMates.map((m) => ({ name: m.name, details: profileDraftToMember(m.profile) })),
  ], [myName, myDetails, cleanMates])
  const incompleteCount = allProfiles.filter((p) => !p.details.upiId).length
  const cycleSummary = cycleChoice === 'monthly'
    ? `starting on day ${cycleDay} each month`
    : cycleChoice === 'today'
      ? `30 days from ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
      : `${customStart || 'start'} → ${customEnd || 'end'}`

  function validateStep(target = step): boolean {
    if (target === 0 && !roomName.trim()) {
      pushToast({ message: 'Enter a room name, such as Shanti Niwas 204.', tone: 'bad' }); return false
    }
    if (target === 0 && !myName.trim()) { pushToast({ message: 'Enter your name.', tone: 'bad' }); return false }
    if (target === 1) {
      const names = [myName.trim().toLowerCase(), ...cleanMates.map((m) => m.name.toLowerCase())]
      if (new Set(names).size !== names.length) { pushToast({ message: 'Two people have the same name. Use different names.', tone: 'bad' }); return false }
      for (const mate of cleanMates) {
        const err = profileDraftError(mate.profile)
        if (err) { pushToast({ message: `${mate.name}: ${err}`, tone: 'bad' }); return false }
      }
    }
    if (target === 2 && !buildCyclePatch()) return false
    return true
  }

  function next() {
    if (!validateStep()) return
    setStep((s) => Math.min(s + 1, STEP_META.length - 1))
  }

  function buildCyclePatch(): { cycleMode: 'monthly' | 'custom'; cycleStart?: number; cycleEnd?: number } | null {
    if (cycleChoice === 'today') {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const end = new Date(start); end.setDate(end.getDate() + 29); end.setHours(23, 59, 59, 999)
      return { cycleMode: 'custom', cycleStart: start.getTime(), cycleEnd: end.getTime() }
    }
    if (cycleChoice === 'custom') {
      const start = parseDateInput(customStart)
      const end = parseDateInput(customEnd, true)
      if (!start || !end || end < start) { pushToast({ message: 'Select valid custom cycle dates.', tone: 'bad' }); return null }
      return { cycleMode: 'custom', cycleStart: start, cycleEnd: end }
    }
    return { cycleMode: 'monthly' }
  }

  function clearOnboardingDraft() {
    clearStepDraft(); clearRoomNameDraft(); clearMyNameDraft(); clearMyProfileDraft(); clearMatesDraft()
    clearExpandedMateDraft(); clearCycleDayDraft(); clearCycleChoiceDraft(); clearCustomStartDraft(); clearCustomEndDraft()
    clearCloudEnabledDraft(); clearRoomLoginDraft(); clearLoginUsernameDraft(); clearUsernameTouchedDraft()
  }

  function goAfterCreate(cloud = false) {
    clearOnboardingDraft()
    pushToast({ message: `${cloud ? 'Room is ready on your devices.' : 'Room is ready on this device.'}${incompleteCount ? ' You can add UPI IDs later.' : ''}`, tone: incompleteCount ? 'warn' : 'ok' })
    nav('/room?add=1')
  }

  function finishLocal() {
    if (creationLockRef.current) return
    creationLockRef.current = true
    const cyclePatch = buildCyclePatch()
    if (!cyclePatch) { creationLockRef.current = false; return }
    createRoom(
      roomName.trim(),
      myName.trim(),
      cycleDay,
      myDetails,
      cleanMates.map((m) => ({ name: m.name, details: profileDraftToMember(m.profile) })),
      cyclePatch,
    )
    goAfterCreate(false)
  }

  async function finish() {
    if (creationLockRef.current) return
    setCloudError('')
    if (!validateStep(0) || !validateStep(1) || !validateStep(2)) return
    const cyclePatch = buildCyclePatch()
    if (!cyclePatch) return
    if (!cloudEnabled || !isCloudConfigured) { finishLocal(); return }
    const cleanRoomLogin = normalizeRoomLoginId(roomLoginId)
    const cleanUsername = normalizeLoginUsername(loginUsername)
    if (!cleanRoomLogin || cleanRoomLogin.length < 3) { setCloudError('Room ID must contain at least 3 characters.'); return }
    if (!cleanUsername) { setCloudError('Enter a valid username without spaces.'); return }
    if (roomPassword.length < 8) { setCloudError('The shared Room Password must contain at least 8 characters.'); return }
    if (roomPassword !== confirmRoomPassword) { setCloudError('The Room Passwords do not match.'); return }
    if (personalPassword.length < 8) { setCloudError('Your personal password must contain at least 8 characters.'); return }
    if (personalPassword !== confirmPersonalPassword) { setCloudError('The personal passwords do not match.'); return }
    if (roomPassword === personalPassword) { setCloudError('Use different Room and personal passwords. Never share your personal password.'); return }

    creationLockRef.current = true
    setCloudBusy(true)
    const result = await cloudCreateRoom({
      roomName: roomName.trim(),
      roomLoginId: cleanRoomLogin,
      roomPassword,
      username: cleanUsername,
      personalPassword,
      creatorName: myName.trim(),
      creatorDetails: myDetails,
      initialMembers: cleanMates.map((m) => ({ name: m.name, details: profileDraftToMember(m.profile) })),
      rentCycleDay: cycleDay,
      cycleMode: cyclePatch.cycleMode,
      cycleStart: cyclePatch.cycleStart,
      cycleEnd: cyclePatch.cycleEnd,
    })
    setCloudBusy(false)
    if (!result.ok) {
      creationLockRef.current = false
      setCloudError(result.error ?? 'Could not create the cloud room.')
      return
    }
    goAfterCreate(true)
  }

  return (
    <div className="min-h-dvh bg-surface-page text-ink">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-10">
        <div className="grid lg:grid-cols-[330px_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
          {/* Step rail */}
          <aside className="relative overflow-hidden rounded-[24px] bg-[#15172F] text-[#F1F0FF] border border-white/10 p-4 sm:p-6 lg:sticky lg:top-6 shadow-lift3d">
            <div className="absolute -top-20 -right-20 hidden h-52 w-52 rounded-full bg-[#4F46C8]/30 blur-3xl sm:block" aria-hidden="true" />
            <div className="relative flex items-center gap-3">
              <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-[#4F46C8] to-[#DE7726] text-white shadow-fab"><Icon name="rupee" size={22} /></span>
              <span><span className="block font-display font-bold text-[18px] leading-none">{APP.name}</span><span className="block text-[11.5px] text-[#A9C4B5] mt-1">{APP.tagline}</span></span>
            </div>

            <h1 className="relative text-[21px] text-white mt-4 leading-tight lg:mt-7 lg:text-[25px]">Set up your room in 4 easy steps</h1>
            <p className="relative mt-2 hidden text-[13px] leading-relaxed text-[#C5C3E1] lg:block">We will ask one small thing at a time: room details, members, your monthly period, and where to save your room. You can change these details later.</p>

            <ol className="relative mt-4 grid grid-cols-4 gap-2 lg:mt-7 lg:block lg:space-y-2">
              {STEP_META.map((s, i) => {
                const done = i < step, active = i === step
                return (
                  <li key={s.title}>
                    <button type="button" disabled={i > step} onClick={() => setStep(i)}
                      className={clsx('flex w-full items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-left transition-all lg:justify-start lg:gap-3 lg:px-3.5 lg:py-3', active ? 'border-[#8678FF] bg-[#4F46C8]/30 text-white' : done ? 'border-white/15 bg-white/10 text-white' : 'border-white/10 bg-white/[.04] text-[#AAA8C9]')}
                      aria-current={active ? 'step' : undefined} aria-label={`Step ${i + 1}: ${s.title}`} title={`Step ${i + 1}: ${s.title}`}>
                      <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl lg:h-10 lg:w-10', active || done ? 'bg-white text-[#3C34A3]' : 'bg-white/10 text-[#C5C3E1]')}>
                        {done ? <Icon name="check" size={19} /> : <Icon name={s.icon} size={19} />}
                      </span>
                      <span className="hidden flex-1 lg:block"><span className="block font-display font-bold text-[14px] leading-tight">{s.title}</span><span className="block text-[11px] opacity-75 mt-0.5">{s.sub}</span></span>
                      <span className="text-[11px] font-bold opacity-75">0{i + 1}</span>
                    </button>
                  </li>
                )
              })}
            </ol>

            <div className="relative mt-7 hidden rounded-2xl bg-white/5 border border-white/10 p-4 lg:block">
              <p className="flex items-center gap-2 font-display font-bold text-[14px]"><Icon name="shield" className="text-[#A8A0FF]" /> Privacy first</p>
              <p className="text-[12.5px] leading-relaxed text-[#C5C3E1] mt-1.5">Cloud rooms are stored in Supabase and protected by row-level security. RoomHisaab never asks for a UPI PIN, OTP or bank password.</p>
            </div>
          </aside>

          {/* Form */}
          <main className="min-w-0">
            <div className="flex items-center gap-2 mb-4" aria-hidden="true">
              {STEP_META.map((_, i) => <span key={i} className={clsx('h-2 flex-1 rounded-full transition-all duration-300', i <= step ? 'bg-gradient-to-r from-primary-solid to-accent' : 'bg-ink/10')} />)}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.section key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: .26, ease }} className="card p-5 sm:p-7 shadow-lift3d">
                <p className="kicker">Step {step + 1} of {STEP_META.length}</p>
                {step === 0 && (
                  <>
                    <h2 className="text-[26px] sm:text-[30px] mt-1">What is your room called?</h2>
                    <p className="text-ink-soft text-[14px] mt-2">Your room starts as My Room. Add another participating member to enable shared expenses.</p>
                    <div className="mt-7">
                      <label className="label" htmlFor="room-name">Room, flat or PG name</label>
                      <input id="room-name" autoFocus className="input !text-[18px] !py-3" placeholder="Shanti Niwas 204" value={roomName} onChange={(e) => setRoomName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next()} />
                    </div>
                    <div className="mt-4 max-w-sm">
                      <label className="label" htmlFor="my-name">Your name *</label>
                      <input id="my-name" className="input !text-[17px]" placeholder="Enter your name" value={myName} onChange={(e) => setMyName(e.target.value)} />
                    </div>
                    <details className="mt-4 rounded-2xl border border-line-light bg-surface-alt p-4">
                      <summary className="cursor-pointer text-[13px] font-bold">Add your UPI ID and contact details (optional)</summary>
                      <div className="pt-4"><MemberProfileFields idPrefix="me" value={myProfile} onChange={setMyProfile} /></div>
                    </details>
                    <div className="grid sm:grid-cols-3 gap-3 mt-6">
                      <SetupBenefit icon="sparkles" title="Less typing" body="Add bills from SMS, a file, or voice" />
                      <SetupBenefit icon="qr" title="Exact payment QR" body="For money pending between members" />
                      <SetupBenefit icon="chart" title="Clear balances" body="See who pays and who receives" />
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <h2 className="text-[26px] sm:text-[30px] mt-1">Who else shares this room?</h2>
                    <p className="text-ink-soft text-[14px] mt-2">This can be your personal expense space. Add people now if you share costs, or add them later. A room can have up to 8 people.</p>
                    <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><p className="text-[14px] font-bold">Starting on your own?</p><p className="mt-1 text-[12px] text-ink-soft">Only your name will be in the room. You can invite members later.</p></div>
                        <button type="button" className={mates.length === 0 ? 'btn-primary' : 'btn-outline'} onClick={() => {
                          if (cleanMates.length > 0 && !window.confirm('Remove the member names entered here and continue with only you?')) return
                          setMates([]); setExpandedMate(null)
                        }}>Continue with just me</button>
                      </div>
                    </div>
                    {mates.length === 0 && <p className="mt-3 rounded-xl bg-surface-alt px-3.5 py-3 text-[12.5px] text-ink-soft">You are set to start alone. Use “Add a member” below if you want to enter someone now.</p>}
                    <div className="space-y-3.5 mt-6">
                      {mates.map((mate, i) => {
                        const details = profileDraftToMember(mate.profile)
                        const percent = profileCompletion(details)
                        const open = expandedMate === i
                        return (
                          <div key={i} className="rounded-[22px] border border-line-light bg-surface-alt p-4">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <Avatar name={mate.name || `R${i + 1}`} color="#5046C8" size={42} />
                              <input className="input flex-1 min-w-[190px] !bg-surface-card" placeholder={`Member ${i + 1} name`} value={mate.name}
                                onChange={(e) => setMates((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} aria-label={`Member ${i + 1} name`} />
                              <button type="button" className={open ? 'btn-primary !px-3.5' : 'btn-outline !px-3.5'} onClick={() => setExpandedMate(open ? null : i)} aria-expanded={open}>
                                <Icon name="wallet" size={18} /> {open ? 'Hide details' : `UPI details · ${percent}%`}
                              </button>
                              {mates.length > 1 && <button type="button" className="btn-danger !px-3" onClick={() => setMates((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove member"><Icon name="x" size={18} /></button>}
                            </div>
                            <div className="flex items-center gap-2 mt-3">
                              <div className="meter flex-1"><span style={{ width: `${percent}%` }} /></div>
                              <span className="text-[11.5px] font-bold text-ink-soft">{details.upiId ? 'QR ready' : 'UPI missing'}</span>
                            </div>
                            <AnimatePresence initial={false}>
                              {open && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .25, ease }} className="overflow-hidden">
                                  <div className="pt-5">
                                    <MemberProfileFields idPrefix={`mate-${i}`} value={mate.profile}
                                      onChange={(profile) => setMates((prev) => prev.map((x, j) => j === i ? { ...x, profile } : x))} />
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )
                      })}
                    </div>
                    {mates.length < 7 && (
                      <button type="button" className="btn-outline w-full mt-4" onClick={() => { setMates((p) => [...p, { name: '', profile: emptyMemberProfile() }]); setExpandedMate(mates.length) }}>
                        <Icon name="plus" size={18} /> Add a member
                      </button>
                    )}
                  </>
                )}

                {step === 2 && (
                  <>
                    <h2 className="text-[26px] sm:text-[30px] mt-1">When does your monthly period start?</h2>
                    <p className="text-ink-soft text-[14px] mt-2">This date is used for your monthly totals and reports. You can keep the first day of each month or choose another date.</p>
                    <div className="mt-6">
                      <span className="label">Monthly period</span>
                      <div className="grid sm:grid-cols-3 gap-2">
                        {([['monthly', 'Starts on the 1st of each month', 'Default setting'], ['today', 'Start today', '30 days from today'], ['custom', 'Custom dates', 'Choose start and end dates']] as const).map(([key, title, sub]) => (
                          <button key={key} type="button" onClick={() => setCycleChoice(key)} className={clsx('rounded-2xl border p-3.5 text-left transition-all', cycleChoice === key ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-line-light')} aria-pressed={cycleChoice === key}>
                            <span className="block font-display font-bold text-[14px]">{title}</span>
                            <span className="block text-[11.5px] text-ink-soft mt-0.5">{sub}</span>
                          </button>
                        ))}
                      </div>

                      {cycleChoice === 'monthly' && (
                        <div className="mt-4">
                          <span className="label">Choose a start date</span>
                          <div className="flex flex-wrap gap-2">
                            {[1, 5, 10, 15, 20, 25].map((d) => <button key={d} type="button" onClick={() => setCycleDay(d)} className={cycleDay === d ? 'chip-on' : 'chip-off'} aria-pressed={cycleDay === d}>Day {d}</button>)}
                            <button type="button" onClick={() => setCycleDay(Math.min(new Date().getDate(), 28))} className="chip-off">Use today's date</button>
                          </div>
                        </div>
                      )}

                      {cycleChoice === 'custom' && (
                        <div className="grid sm:grid-cols-2 gap-3 mt-4">
                          <div>
                            <label className="label" htmlFor="onboard-cycle-start">Start date</label>
                            <input id="onboard-cycle-start" type="date" className="input" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                          </div>
                          <div>
                            <label className="label" htmlFor="onboard-cycle-end">End date</label>
                            <input id="onboard-cycle-end" type="date" className="input" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                          </div>
                        </div>
                      )}

                      <p className="text-[12.5px] text-ink-soft mt-3">Your monthly period: <b className="text-ink">{cycleSummary}</b>. You can change this later in Settings.</p>
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <h2 className="text-[26px] sm:text-[30px] mt-1">Save Your Room</h2>
                    <p className="text-ink-soft text-[14px] mt-2">Choose whether to use this room on all your devices or only in this browser.</p>

                    <div className="mt-6 rounded-[24px] border border-primary/25 bg-primary/5 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start gap-3">
                        <span className="icon-tile h-11 w-11"><Icon name="shield" size={21} /></span>
                        <div className="flex-1 min-w-[230px]">
                          <h3 className="font-display font-bold text-[17px]">Use on all your devices</h3>
                          <p className="text-[12.5px] text-ink-soft leading-relaxed mt-1">The Room Password is used only for invite joining. Each member creates a personal password, so nobody can edit another member’s expenses or profile.</p>
                        </div>
                        <span className="text-[11.5px] font-bold uppercase tracking-wide text-ink-soft">Choose where to save this room</span>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
                        <button type="button" aria-pressed={!cloudEnabled} onClick={() => setCloudEnabled(false)} className={clsx('rounded-2xl border p-3.5 text-left', !cloudEnabled ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-line-light bg-surface-card')}>
                          <span className="block text-[14px] font-bold">Use Only on This Device</span><span className="mt-1 block text-[11.5px] text-ink-soft">Saved in this browser. You can download a backup in Settings.</span>
                        </button>
                        <button type="button" aria-pressed={cloudEnabled} disabled={!isCloudConfigured} onClick={() => setCloudEnabled(true)} className={clsx('rounded-2xl border p-3.5 text-left disabled:opacity-50', cloudEnabled ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-line-light bg-surface-card')}>
                          <span className="block text-[14px] font-bold">Use on All My Devices</span><span className="mt-1 block text-[11.5px] text-ink-soft">Sign in to open the room on your other devices.</span>
                        </button>
                      </div>
                      <p className="mt-3 rounded-xl border border-line-light bg-surface-card px-3.5 py-2.5 text-[12.5px] text-ink-soft">
                        {cloudEnabled && isCloudConfigured ? 'Your room will sync across devices when members sign in.' : 'Use only this device. Your room stays in this browser. Download a backup later in Settings.'}
                      </p>

                      {!isCloudConfigured && <p className="mt-3 rounded-xl border border-pending/30 bg-pending/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-pending">Supabase is not configured in this build. Only “Use Only on This Device” is available in this build.</p>}

                      {cloudEnabled && isCloudConfigured && (
                        <div className="grid sm:grid-cols-2 gap-3 mt-4">
                          <div>
                            <label className="label" htmlFor="cloud-room-login">Room ID *</label>
                            <div className="flex gap-2">
                              <input id="cloud-room-login" className="input flex-1 font-mono !bg-surface-card" value={roomLoginId} onChange={(e) => setRoomLoginId(normalizeRoomLoginId(e.target.value))} autoCapitalize="off" spellCheck={false} />
                              <button type="button" className="btn-outline !px-3" onClick={() => setRoomLoginId(makeRoomLoginId(roomName || 'room'))}>Auto</button>
                            </div>
                            <p className="text-[11px] text-ink-faint mt-1">All members use this ID on the login screen.</p>
                          </div>
                          <div>
                            <label className="label" htmlFor="cloud-my-username">Your login username *</label>
                            <input id="cloud-my-username" className="input font-mono !bg-surface-card" value={loginUsername} onChange={(e) => { setUsernameTouched(true); setLoginUsername(e.target.value.toLowerCase()) }} autoComplete="username" autoCapitalize="off" spellCheck={false} />
                          </div>
                          <div>
                            <label className="label" htmlFor="cloud-room-password">Room invite password *</label>
                            <input id="cloud-room-password" type="password" className="input !bg-surface-card" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} autoComplete="off" />
                          </div>
                          <div>
                            <label className="label" htmlFor="cloud-room-password2">Confirm room invite password *</label>
                            <input id="cloud-room-password2" type="password" className="input !bg-surface-card" value={confirmRoomPassword} onChange={(e) => setConfirmRoomPassword(e.target.value)} autoComplete="off" />
                          </div>
                          <div>
                            <label className="label" htmlFor="cloud-personal-password">Your personal password *</label>
                            <input id="cloud-personal-password" type="password" className="input !bg-surface-card" value={personalPassword} onChange={(e) => setPersonalPassword(e.target.value)} autoComplete="new-password" />
                          </div>
                          <div>
                            <label className="label" htmlFor="cloud-personal-password2">Personal password confirm *</label>
                            <input id="cloud-personal-password2" type="password" className="input !bg-surface-card" value={confirmPersonalPassword} onChange={(e) => setConfirmPersonalPassword(e.target.value)} autoComplete="new-password" />
                          </div>
                          <p className="sm:col-span-2 rounded-xl bg-surface-card border border-line-light px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-soft">
                            <b className="text-ink">Save these details:</b> Room ID <span className="font-mono">({roomLoginId || '—'})</span> and your username. Do not share your personal password.
                          </p>
                        </div>
                      )}
                      {cloudError && (
                        <div className="mt-3 rounded-xl border border-overdue/30 bg-overdue/10 px-3.5 py-3" role="alert">
                          <p className="text-[13px] font-semibold text-overdue">{cloudError}</p>
                          <button type="button" className="btn-ghost !px-2.5 !py-1.5 !text-[12.5px] mt-1.5" onClick={finishLocal}>Create a local room instead</button>
                        </div>
                      )}
                    </div>

                    <div className="rounded-[22px] bg-[#15172F] text-[#F1F0FF] p-5 mt-6 relative overflow-hidden">
                      <div className="absolute -right-14 -top-14 hidden h-36 w-36 rounded-full bg-[#4F46C8]/30 blur-2xl sm:block" aria-hidden="true" />
                      <p className="relative text-[11px] uppercase tracking-[0.16em] text-[#A8A0FF] font-bold">Check before creating</p>
                      <h3 className="relative text-[22px] text-white mt-1">{roomName.trim() || 'My Room'}</h3>
                      <p className="relative text-[12.5px] text-[#C5C3E1]">{allProfiles.length} members · {cycleSummary} · {incompleteCount ? `${incompleteCount} UPI profile(s) incomplete` : 'all QR-ready'}{cloudEnabled && isCloudConfigured ? ` · Room ID ${roomLoginId}` : ' · Only on this device'}</p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 mt-4">
                      {allProfiles.map((p) => {
                        const percent = profileCompletion(p.details)
                        const missing = missingProfileFields(p.details)
                        return (
                          <div key={p.name} className="rounded-2xl border border-line-light p-4">
                            <div className="flex items-center gap-3">
                              <Avatar name={p.name} color="#5046C8" size={40} />
                              <div className="flex-1 min-w-0"><p className="font-semibold text-[14.5px] truncate">{p.name}</p><p className="text-[11.5px] text-ink-soft truncate">{p.details.upiId ?? 'UPI ID missing'}</p></div>
                              <span className={percent === 100 ? 'badge-ok rounded-full px-2 py-1 text-[10.5px] font-bold' : 'badge-warn rounded-full px-2 py-1 text-[10.5px] font-bold'}>{percent}%</span>
                            </div>
                            <div className="meter mt-3"><span style={{ width: `${percent}%` }} /></div>
                            <p className="text-[11.5px] text-ink-soft mt-2">{missing.length ? `Missing: ${missing.join(', ')}` : 'Profile complete. QR payments are ready.'}</p>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                <div className="flex flex-wrap gap-2.5 mt-7 pt-5 border-t border-line-light">
                  {step > 0 && <button type="button" className="btn-outline flex-1 min-w-[130px]" onClick={() => setStep((s) => s - 1)}>Back</button>}
                  {step < STEP_META.length - 1 ? (
                    <button type="button" className="btn-primary flex-[2] min-w-[180px]" onClick={next}>Continue <Icon name="arrowRight" size={18} /></button>
                  ) : (
                    <button type="button" className="btn-accent flex-[2] min-w-[210px]" onClick={finish} disabled={cloudBusy}><Icon name={cloudEnabled && isCloudConfigured ? 'shield' : 'home'} size={19} /> {cloudBusy ? 'Creating cloud room…' : cloudEnabled && isCloudConfigured ? 'Create Room' : 'Create Room'}</button>
                  )}
                </div>
              </motion.section>
            </AnimatePresence>

            <div className="card mt-4 p-4 flex flex-wrap items-center gap-3">
              <span className="icon-tile h-11 w-11"><Icon name="sparkles" size={21} /></span>
              <div className="flex-1 min-w-[220px]"><p className="font-display font-bold text-[15px]">Want to preview the app first?</p><p className="text-[12.5px] text-ink-soft">The demo includes {makeSeedRoom().expenses.length} sample expenses, three members and sample payments.</p></div>
              <button className="btn-outline" onClick={() => nav('/demo')}>Try Demo</button>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

function SetupBenefit({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return <div className="rounded-2xl border border-line-light bg-surface-alt p-3.5"><Icon name={icon} className="text-primary" size={20} /><p className="font-display font-bold text-[13.5px] mt-2">{title}</p><p className="text-[11.5px] text-ink-soft">{body}</p></div>
}

function CompletionNote({ percent, missing }: { percent: number; missing: string[] }) {
  return (
    <div className="mt-5 rounded-2xl border border-line-light p-4" aria-live="polite">
      <div className="flex items-center gap-3"><div className="meter flex-1"><span style={{ width: `${percent}%` }} /></div><b className="text-[13px]">{percent}% complete</b></div>
      <p className="text-[12.5px] text-ink-soft mt-2">{missing.length ? `Add a UPI ID for QR payments. Missing: ${missing.join(', ')}.` : 'Your payment profile is complete.'}</p>
    </div>
  )
}
