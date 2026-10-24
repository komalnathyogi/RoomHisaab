import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, useRoomData } from '../hooks/useStore'
import { usePersistentState } from '../hooks/usePersistentDraft'
import { computeNet, cycleLabelForRoom, cycleRangeForRoom } from '../lib/balances'
import { buildJoinLink, createRoomSyncPacket, encodeRoomSyncPacket } from '../lib/share'
import { download } from '../lib/csv'
import { formatINR } from '../lib/money'
import { PageHead } from '../components/Layout'
import { SectionCard } from '../components/SectionCard'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import {
  MemberProfileFields,
  emptyMemberProfile,
  memberToProfileDraft,
  missingProfileFields,
  profileCompletion,
  profileDraftError,
  profileDraftToMember,
  type MemberProfileDraft,
} from '../components/MemberProfileFields'
import { buildWhatsAppLink, UPI_APPS } from '../lib/upi'
import { cloudResetMemberLogin } from '../lib/cloud'
import { cloudErrorMessage } from '../lib/supabase'
import type { Member } from '../lib/types'
import clsx from 'clsx'

const ease = [0.4, 0, 0.2, 1] as const

function toDateInput(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function parseDateInput(value: string, endOfDay = false): number | null {
  const [y, m, da] = value.split('-').map(Number)
  if (!y || !m || !da) return null
  return new Date(y, m - 1, da, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime()
}

export default function Members() {
  const navigate = useNavigate()
  const { state, cloud, isCloudRoomActive, createCloudInviteLink, cloudRefresh, canEditMember, addMember, updateMember, removeMember, pushToast, updateRoom, setCurrentMember } = useStore()
  const { room, members, expenses, settlements, me } = useRoomData()
  const [search, setSearch] = usePersistentState('members.search', '')
  const [name, setName] = usePersistentState('members.add.name', '')
  const [isVirtual, setIsVirtual] = usePersistentState('members.add.isVirtual', false)
  const [addProfile, setAddProfile] = usePersistentState<MemberProfileDraft>('members.add.profile', () => emptyMemberProfile())
  const [detailsOpen, setDetailsOpen] = usePersistentState('members.add.detailsOpen', false)
  const [editingId, setEditingId] = usePersistentState('members.edit.id', '')
  const [editDraftMemberId, setEditDraftMemberId] = usePersistentState('members.edit.draftMemberId', '')
  const [editName, setEditName] = usePersistentState('members.edit.name', '')
  const [editProfile, setEditProfile] = usePersistentState<MemberProfileDraft>('members.edit.profile', () => emptyMemberProfile())
  const editing = members.find((m) => m.id === editingId) ?? null
  const [rename, setRename] = usePersistentState('members.renameRoom', '')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [cloudInviteLink, setCloudInviteLink] = useState('')
  const [cloudInviteExpiry, setCloudInviteExpiry] = useState('')
  const [cloudInviteBusy, setCloudInviteBusy] = useState(false)
  const [resetBusyId, setResetBusyId] = useState('')
  const [cycleStartInput, setCycleStartInput] = usePersistentState('members.cycle.start', '')
  const [cycleEndInput, setCycleEndInput] = usePersistentState('members.cycle.end', '')
  const [cycleDraftRoomId, setCycleDraftRoomId] = usePersistentState('members.cycle.roomId', '')

  useEffect(() => {
    if (!room) return
    if (cycleDraftRoomId === room.id && (cycleStartInput || cycleEndInput)) return
    const active = cycleRangeForRoom(room)
    setCycleStartInput(toDateInput(room.cycleStart ?? active.start))
    setCycleEndInput(toDateInput(room.cycleEnd ?? active.end))
    setCycleDraftRoomId(room.id)
    // Initialize once per room; do not overwrite an unsaved date draft on refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id])

  const nets = useMemo(() => computeNet(expenses, settlements, members), [expenses, settlements, members])
  const netOf = (id: string) => nets.find((n) => n.memberId === id)
  const realMembers = members.filter((m) => !m.isVirtual)
  const qrReady = realMembers.filter((m) => m.upiId).length
  const avgComplete = realMembers.length ? Math.round(realMembers.reduce((s, m) => s + profileCompletion(m), 0) / realMembers.length) : 0
  const nextIncomplete = realMembers.find((m) => !m.upiId) ?? realMembers.find((m) => profileCompletion(m) < 100)
  const visibleMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    // Keep the fixed join order. Profile completeness must not move rows.
    return q ? members.filter((m) => [m.name, m.fullName, m.upiId, m.phone, m.email].some((x) => x?.toLowerCase().includes(q))) : members
  }, [members, search])

  if (!room || members.length === 0) {
    return (
      <>
        <PageHead title="Members & UPI" sub="Create a room to manage member profiles." />
        <EmptyState emoji="👥" title="Create a room first" body="Member profiles will appear here after the room is created."
          action={<Link to="/onboarding" className="btn-primary">Create room</Link>} />
      </>
    )
  }

  const roomCode = room.code
  const activeCycle = cycleRangeForRoom(room)
  const inviteMsg = inviteLink
    ? `Join *${room.name}* on RoomHisaab:\n${inviteLink}\n\nOpen the link and select your name. Do not forward this link; it contains room data.`
    : `Join *${room.name}* on RoomHisaab. Invite code: *${roomCode}*`
  const waLink = buildWhatsAppLink(undefined, inviteMsg)
  const isCloudAdmin = isCloudRoomActive && (cloud.role === 'owner' || cloud.role === 'admin')
  const cloudInviteMsg = cloudInviteLink
    ? `Join the *${room.name}* cloud room on RoomHisaab.\n\nRoom Login ID: *${room.loginId ?? cloud.roomLoginId ?? ''}*\nJoin link: ${cloudInviteLink}\n\nOpen the link, claim your name, enter the Room Password shared separately, then create your personal password. Never share your personal password, UPI PIN or OTP.`
    : inviteMsg
  const cloudWaLink = buildWhatsAppLink(undefined, cloudInviteMsg)

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      pushToast({ message: text.length > 90 ? `${label} copied.` : `${label} copied: ${text}`, tone: 'ok' })
    } catch {
      pushToast({ message: text.length > 90 ? `Could not copy ${label}. Please copy it manually.` : text, tone: 'warn' })
    }
  }

  async function makeCloudInvite(targetMemberId?: string): Promise<string | null> {
    setCloudInviteBusy(true)
    try {
      const invite = await createCloudInviteLink(targetMemberId)
      if (!invite) return null
      setCloudInviteLink(invite.link)
      setCloudInviteExpiry(invite.expiresAt)
      pushToast({ message: 'Cloud join link is ready. Share the Room Password separately.', tone: 'ok' })
      return invite.link
    } finally {
      setCloudInviteBusy(false)
    }
  }

  async function resetMemberLogin(member: Member) {
    if (!window.confirm(`Reset the personal login for ${member.name}? The old login will stop working and they must claim a new invite.`)) return
    setResetBusyId(member.id)
    try {
      await cloudResetMemberLogin(member.id)
      await cloudRefresh()
      const invite = await createCloudInviteLink(member.id)
      if (invite) {
        setCloudInviteLink(invite.link)
        setCloudInviteExpiry(invite.expiresAt)
      }
      pushToast({ message: `Login reset for ${member.name}. A new personal invite is ready.`, tone: 'ok' })
    } catch (error) {
      pushToast({ message: cloudErrorMessage(error), tone: 'bad' })
    } finally {
      setResetBusyId('')
    }
  }

  async function makeInviteLink(): Promise<string | null> {
    const packet = createRoomSyncPacket(state)
    if (!packet) { pushToast({ message: 'Room data is not ready.', tone: 'bad' }); return null }
    setInviteBusy(true)
    try {
      const encoded = await encodeRoomSyncPacket(packet)
      const link = buildJoinLink(encoded)
      setInviteLink(link)
      pushToast({ message: link.length > 9000 ? 'The join link is ready. For a very large room, use the sync file.' : 'Join link is ready.', tone: 'ok' })
      return link
    } catch {
      pushToast({ message: 'Could not create the join link. Download and share the sync file.', tone: 'bad' })
      return null
    } finally {
      setInviteBusy(false)
    }
  }

  async function copyInviteLink() {
    const link = inviteLink || await makeInviteLink()
    if (link) await copyText(link, 'Full join link')
  }

  function downloadSyncFile() {
    if (!room) return
    const packet = createRoomSyncPacket(state)
    if (!packet) { pushToast({ message: 'Room data is not ready.', tone: 'bad' }); return }
    download(`roomhisaab-sync-${room.code}.json`, JSON.stringify(packet, null, 2), 'application/json')
    pushToast({ message: 'Sync file downloaded. Share it with your roommate.', tone: 'ok' })
  }

  function saveCustomCycle() {
    const start = parseDateInput(cycleStartInput)
    const end = parseDateInput(cycleEndInput, true)
    if (!start || !end) { pushToast({ message: 'Select both cycle dates.', tone: 'bad' }); return }
    if (end < start) { pushToast({ message: 'The end date must be after the start date.', tone: 'bad' }); return }
    if ((end - start) / 86400000 > 366) { pushToast({ message: 'The cycle cannot be longer than one year.', tone: 'bad' }); return }
    updateRoom({ cycleMode: 'custom', cycleStart: start, cycleEnd: end })
    pushToast({ message: `Custom cycle saved: ${new Date(start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, tone: 'ok' })
  }

  function startCycleToday(days = 30) {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + days - 1); end.setHours(23, 59, 59, 999)
    updateRoom({ cycleMode: 'custom', cycleStart: start.getTime(), cycleEnd: end.getTime() })
    pushToast({ message: `Cycle set for ${days} days from today.`, tone: 'ok' })
  }

  function handleAdd() {
    if (room?.cloud && !isCloudAdmin) { pushToast({ message: 'Only a cloud room admin or owner can add a placeholder member.', tone: 'bad' }); return }
    const clean = name.trim()
    if (!clean) { pushToast({ message: 'Enter the member name.', tone: 'bad' }); return }
    if (members.length >= 8) { pushToast({ message: 'The room is full. Maximum 8 members.', tone: 'bad' }); return }
    if (members.some((m) => m.name.toLowerCase() === clean.toLowerCase())) { pushToast({ message: `"${clean}" is already in the room.`, tone: 'warn' }); return }
    const err = profileDraftError(addProfile)
    if (err) { pushToast({ message: err, tone: 'bad' }); setDetailsOpen(true); return }
    const created = addMember(clean, { ...profileDraftToMember(addProfile), isVirtual })
    if (!created) { pushToast({ message: 'Could not add the member. Check the name and member limit.', tone: 'bad' }); return }
    pushToast({ message: created.upiId ? `${clean} was added. QR payments are ready.` : `${clean} was added. Add a UPI ID to enable QR payments.`, tone: created.upiId ? 'ok' : 'warn' })
    setName(''); setIsVirtual(false); setAddProfile(emptyMemberProfile()); setDetailsOpen(false)
  }

  function openEdit(m: Member) {
    setEditingId(m.id)
    if (editDraftMemberId !== m.id) {
      setEditName(m.name)
      setEditProfile(memberToProfileDraft(m))
      setEditDraftMemberId(m.id)
    }
  }

  function saveEdit() {
    if (!editing) return
    const cleanName = editName.trim()
    if (!cleanName) { pushToast({ message: 'Nickname cannot be empty.', tone: 'bad' }); return }
    if (members.some((m) => m.id !== editing.id && m.name.toLowerCase() === cleanName.toLowerCase())) {
      pushToast({ message: `"${cleanName}" is already used by another member.`, tone: 'bad' }); return
    }
    const err = profileDraftError(editProfile)
    if (err) { pushToast({ message: err, tone: 'bad' }); return }
    updateMember(editing.id, { name: cleanName, ...profileDraftToMember(editProfile) })
    pushToast({ message: `${cleanName}'s profile was saved.`, tone: 'ok' })
    setEditingId('')
    setEditDraftMemberId('')
    setEditName('')
    setEditProfile(emptyMemberProfile())
  }

  function handleRemove(m: Member) {
    const n = netOf(m.id)
    if (state.room?.demo !== true && n && n.netPaise !== 0) {
      pushToast({ message: `${m.name} has a pending balance of ${formatINR(Math.abs(n.netPaise))}. Settle it first.`, tone: 'bad' }); return
    }
    const isDemo = state.room?.demo === true
    const message = isDemo
      ? `Remove ${m.name} from this sample demo? Sample bills and payments linked to them will be adjusted or removed.`
      : `Remove ${m.name} from the room? Their existing splits and payment records will also be removed.`
    if (!window.confirm(message)) return
    removeMember(m.id)
    pushToast({ message: isDemo ? `${m.name} was removed from the demo.` : `${m.name} was removed.`, tone: 'warn' })
  }

  function profileRequestLink(m: Member) {
    const missing = missingProfileFields(m).join(', ')
    return buildWhatsAppLink(m.phone, `Hi ${m.name}, please share these details for RoomHisaab QR payments: ${missing}.\n\nUPI ID format: name@okhdfcbank\n\nNever share your UPI PIN, OTP or bank password.`)
  }

  return (
    <>
      <PageHead title="Members & UPI Profiles" sub={`${room.name} · invite people and save each person’s receiving UPI ID`}
        right={<Link to="/room/payments" className="btn-primary"><Icon name="qr" size={18} /> Payment Center</Link>} />

      {/* Setup health */}
      <section className="relative overflow-hidden rounded-[26px] bg-[#15172F] text-[#F1F0FF] border border-white/10 shadow-lift3d p-5 sm:p-6 mb-5">
        <div className="absolute -top-20 right-10 h-48 w-48 rounded-full bg-[#4F46C8]/30 blur-3xl" aria-hidden="true" />
        <div className="relative grid md:grid-cols-[1fr_auto] gap-5 items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A8A0FF]">Payment setup progress</p>
            <div className="flex flex-wrap items-baseline gap-3 mt-1">
              <span className="num font-display text-[42px] leading-none">{avgComplete}%</span>
              <span className="text-[14px] text-[#C5C3E1]">{qrReady}/{realMembers.length} members can receive QR money</span>
            </div>
            <div className="mt-4 h-3 rounded-full bg-white/10 overflow-hidden max-w-xl"><div className="h-full rounded-full bg-gradient-to-r from-[#8678FF] to-[#DE7726] transition-all duration-500" style={{ width: `${avgComplete}%` }} /></div>
            <p className="text-[13px] text-[#C5C3E1] mt-2.5">
              {nextIncomplete ? `Complete ${missingProfileFields(nextIncomplete).join(', ')} for ${nextIncomplete.name}.` : 'All profiles are complete.'}
            </p>
          </div>
          {nextIncomplete ? (
            canEditMember(nextIncomplete, me?.id)
              ? <button onClick={() => openEdit(nextIncomplete)} className="btn-accent !px-5"><Icon name="wallet" /> Complete profile for {nextIncomplete.name}</button>
              : <a href={profileRequestLink(nextIncomplete)} target="_blank" rel="noreferrer" className="btn-accent !px-5"><Icon name="phone" /> Request details from {nextIncomplete.name}</a>
          ) : (
            <Link to="/room/payments" className="btn-accent !px-5"><Icon name="qr" /> Open QR payments</Link>
          )}
        </div>
      </section>

      <div className="grid xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.85fr)] gap-5 items-start">
        {/* Member directory */}
        <SectionCard title="People in this room" sub="Fixed order · open a profile to add or correct details"
          right={<span className="badge-ok rounded-full px-2.5 py-1 text-[11px] font-bold">{qrReady} QR ready</span>}>
          <div className="relative mb-4">
            <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input className="input !pl-11" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, UPI ID, phone or email" aria-label="Search members" />
          </div>

          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {visibleMembers.map((m, i) => {
                const net = netOf(m.id)?.netPaise ?? 0
                const percent = m.isVirtual ? 0 : profileCompletion(m)
                const missing = m.isVirtual ? [] : missingProfileFields(m)
                const appLabel = UPI_APPS.find((a) => a.id === (m.preferredUpiApp ?? 'any'))?.label
                const canEdit = canEditMember(m, me?.id)
                return (
                  <motion.li key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: .18, ease }}
                    className="rounded-[22px] border border-line-light bg-surface-card p-4 shadow-card">
                    <div className="flex flex-wrap items-start gap-3">
                      <Avatar name={m.name} color={m.color} size={48} />
                      <div className="flex-1 min-w-[210px]">
                        <p className="font-display font-bold text-[16px] leading-tight flex flex-wrap items-center gap-2">
                          {m.name}
                          {me?.id === m.id && <span className="rounded-full bg-primary/10 border border-primary/25 px-2 py-0.5 text-[10px] font-bold text-primary">YOU</span>}
                          {m.isVirtual && <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold text-ink-soft">TRACKING ONLY</span>}
                          {room.cloud && !m.isVirtual && (m.claimed
                            ? <span className="rounded-full bg-primary/10 border border-primary/25 px-2 py-0.5 text-[10px] font-bold text-primary">LOGIN ACTIVE</span>
                            : <span className="badge-warn rounded-full px-2 py-0.5 text-[10px] font-bold">INVITE PENDING</span>)}
                          {!m.isVirtual && (m.upiId ? <span className="badge-ok rounded-full px-2 py-0.5 text-[10px] font-bold">QR READY</span> : <span className="badge-warn rounded-full px-2 py-0.5 text-[10px] font-bold">UPI MISSING</span>)}
                        </p>
                        <p className="text-[12.5px] text-ink-soft mt-1">{m.fullName ?? 'Full name not added'}{m.city ? ` · ${m.city}` : ''}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft mt-2">
                          <span className="inline-flex items-center gap-1.5"><Icon name="wallet" size={15} /> {m.upiId ?? 'No UPI ID'}</span>
                          {room.cloud && <span className="inline-flex items-center gap-1.5"><Icon name="shield" size={15} /> {m.loginUsername ? `@${m.loginUsername}` : 'Login not claimed'}</span>}
                          <span className="inline-flex items-center gap-1.5"><Icon name="phone" size={15} /> {m.phone ?? 'No phone'}</span>
                          <span className="inline-flex items-center gap-1.5"><Icon name="mail" size={15} /> {m.email ?? 'No email'}</span>
                          <span className="inline-flex items-center gap-1.5"><Icon name="card" size={15} /> {appLabel}</span>
                        </div>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className={clsx('num text-[17px]', net > 0 ? 'text-moneyin' : net < 0 ? 'text-overdue' : 'text-ink-soft')}>{net > 0 ? '+' : net < 0 ? '−' : ''}{formatINR(Math.abs(net))}</p>
                        <p className="text-[11px] text-ink-soft">{net > 0 ? 'to receive' : net < 0 ? 'to pay' : 'settled'}</p>
                        {m.monthlyBudgetPaise ? <p className="text-[11px] text-ink-faint mt-1">Budget {formatINR(m.monthlyBudgetPaise)}</p> : null}
                      </div>
                    </div>

                    {!m.isVirtual && (
                      <div className="flex items-center gap-2.5 mt-4">
                        <div className="meter flex-1"><span style={{ width: `${percent}%` }} /></div>
                        <span className="text-[11.5px] font-bold text-ink-soft">{percent}% profile</span>
                      </div>
                    )}
                    {missing.length > 0 && <p className="text-[11.5px] text-pending font-semibold mt-1.5">Missing: {missing.join(', ')}</p>}

                    <div className="flex flex-wrap gap-2 mt-4">
                      {canEdit ? (
                        <button className="btn-primary !px-3.5 !py-2 !text-[13px]" onClick={() => openEdit(m)}><Icon name="settings" size={16} /> Profile</button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-line-light px-3 py-2 text-[12px] font-semibold text-ink-soft" title="Only this member can edit their claimed profile"><Icon name="shield" size={15} /> Locked profile</span>
                      )}
                      {!m.isVirtual && (!room.cloud || me?.id === m.id) && <button className="btn-outline !px-3.5 !py-2 !text-[13px]" onClick={() => { if (setCurrentMember(m.id)) navigate('/room/my') }}><Icon name="users" size={16} /> Open dashboard</button>}
                      {room.cloud && !m.claimed && !m.isVirtual && isCloudAdmin && (
                        <button className="btn-outline !px-3.5 !py-2 !text-[13px]" onClick={() => makeCloudInvite(m.id)} disabled={cloudInviteBusy}><Icon name="share" size={16} /> Personal invite</button>
                      )}
                      {room.cloud && m.claimed && me?.id !== m.id && isCloudAdmin && (
                        <button className="btn-ghost !px-3 !py-2 !text-[13px]" onClick={() => resetMemberLogin(m)} disabled={resetBusyId === m.id}><Icon name="shield" size={16} /> {resetBusyId === m.id ? 'Resetting…' : 'Login reset'}</button>
                      )}
                      {m.upiId && <button className="btn-outline !px-3.5 !py-2 !text-[13px]" onClick={() => copyText(m.upiId!, `UPI ID for ${m.name}`)}><Icon name="copy" size={16} /> UPI copy</button>}
                      {missing.length > 0 && <a className="btn-outline !px-3.5 !py-2 !text-[13px]" href={profileRequestLink(m)} target="_blank" rel="noreferrer"><Icon name="phone" size={16} /> Ask on WhatsApp</a>}
                      {(!room.cloud || canEdit) && <button className="btn-ghost !px-3 !py-2 !text-[13px]" onClick={() => updateMember(m.id, { isVirtual: !m.isVirtual })}>{m.isVirtual ? 'Make real member' : 'Make virtual'}</button>}
                      {!room.cloud && members.length > 1 && <button className="btn-danger !px-3 !py-2 !text-[13px]" onClick={() => handleRemove(m)} aria-label={`Remove ${m.name}`}><Icon name="x" size={16} /> Remove</button>}
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
          {visibleMembers.length === 0 && <p className="text-center text-[13.5px] text-ink-soft py-8">No member matches "{search}".</p>}
        </SectionCard>

        <div className="space-y-5 xl:sticky xl:top-24">
          {/* Add member */}
          <SectionCard title="Add member" sub="Add a name and optional payment details">
            <label className="label" htmlFor="new-member-name">Nickname *</label>
            <input id="new-member-name" className="input" placeholder="Example: Priya or Landlord" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !detailsOpen && handleAdd()} />
            <label className="flex items-start gap-2.5 mt-3 text-[13px] text-ink-soft cursor-pointer">
              <input type="checkbox" checked={isVirtual} onChange={(e) => setIsVirtual(e.target.checked)} className="mt-0.5 h-5 w-5 rounded accent-primary" />
              <span><b className="text-ink">Tracking-only name</b> (landlord or maid) — not counted in equal splits; used only to track money.</span>
            </label>
            <button type="button" onClick={() => setDetailsOpen((v) => !v)} className="btn-outline w-full mt-4" aria-expanded={detailsOpen}>
              <Icon name="wallet" size={18} /> {detailsOpen ? 'Hide payment details' : 'Add personal and UPI details'}
            </button>
            <AnimatePresence initial={false}>
              {detailsOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .25, ease }} className="overflow-hidden">
                  <div className="pt-4"><MemberProfileFields idPrefix="add-member" value={addProfile} onChange={setAddProfile} /></div>
                </motion.div>
              )}
            </AnimatePresence>
            <button className="btn-primary w-full mt-4" onClick={handleAdd}><Icon name="plus" /> Add member</button>
          </SectionCard>

          {/* Invite */}
          <SectionCard title="Room invite" sub="Share a link so another member can join">
            <div className="rounded-2xl bg-primary/10 border border-primary/25 px-5 py-4 text-center">
              <p className="text-[11px] uppercase tracking-[0.15em] text-ink-soft font-bold">{room.cloud ? 'Room Login ID' : 'Room code'}</p>
              <p className="font-display font-bold text-primary tracking-[0.08em] text-[22px] sm:text-[25px] leading-tight break-all font-mono">{room.cloud ? (room.loginId ?? cloud.roomLoginId ?? room.code) : room.code}</p>
              {room.cloud && <p className="text-[11.5px] text-ink-soft mt-1">Short code: <span className="font-mono font-bold">{room.code}</span></p>}
            </div>

            {room.cloud && (
              <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                <p className="font-display font-bold flex items-center gap-2"><Icon name="shield" size={18} /> Cloud join link</p>
                <p className="text-[12.5px] text-ink-soft mt-1.5 leading-relaxed">The member opens the link, claims their name, enters the shared Room Password and creates a personal password.</p>
                {cloudInviteLink ? (
                  <>
                    <textarea className="input resize-y mt-3 !text-[11px] font-mono" rows={3} readOnly value={cloudInviteLink} aria-label="Cloud join link" onFocus={(e) => e.currentTarget.select()} />
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button className="btn-primary !px-3" onClick={() => copyText(cloudInviteLink, 'Cloud join link')}><Icon name="copy" size={17} /> Link copy</button>
                      <a className="btn-outline !px-3" href={cloudWaLink} target="_blank" rel="noreferrer"><Icon name="phone" size={17} /> WhatsApp</a>
                      <button className="btn-outline !px-3" onClick={() => makeCloudInvite()} disabled={!isCloudAdmin || cloudInviteBusy}><Icon name="sparkles" size={17} /> New link</button>
                      <button className="btn-outline !px-3" onClick={() => copyText(room.loginId ?? cloud.roomLoginId ?? '', 'Room Login ID')}><Icon name="copy" size={17} /> Login ID</button>
                    </div>
                    {cloudInviteExpiry && <p className="text-[11.5px] text-ink-faint mt-2">Link valid until {new Date(cloudInviteExpiry).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>}
                  </>
                ) : (
                  <button className="btn-primary w-full mt-3" onClick={() => makeCloudInvite()} disabled={!isCloudAdmin || cloudInviteBusy}>
                    <Icon name="share" size={17} /> {cloudInviteBusy ? 'Creating…' : isCloudAdmin ? 'Create cloud share link' : 'Ask an admin for an invite'}
                  </button>
                )}
                <p className="text-[11.5px] leading-relaxed text-ink-soft mt-3"><b className="text-ink">Important:</b> Do not send the Room Password in the same public message as the link. Share it separately. Each member creates their own personal password.</p>
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <p className="font-display font-bold flex items-center gap-2"><Icon name="share" size={18} /> {room.cloud ? 'Offline backup packet' : 'Full join link for another device'}</p>
              <p className="text-[12.5px] text-ink-soft mt-1.5 leading-relaxed">{room.cloud ? 'Use the cloud link above for this room. This packet is only an offline backup and does not update the server.' : 'This link contains the room, members and current expenses. Your roommate can open it and select or add their profile.'}</p>
              {inviteLink ? (
                <>
                  <textarea className="input resize-y mt-3 !text-[11px] font-mono" rows={3} readOnly value={inviteLink} aria-label="Full join link" onFocus={(e) => e.currentTarget.select()} />
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button className="btn-primary !px-3" onClick={copyInviteLink}><Icon name="copy" size={17} /> Copy link</button>
                    <a className="btn-outline !px-3" href={waLink} target="_blank" rel="noreferrer"><Icon name="phone" size={17} /> WhatsApp</a>
                    <button className="btn-outline !px-3" onClick={makeInviteLink} disabled={inviteBusy}><Icon name="sparkles" size={17} /> Refresh link</button>
                    <button className="btn-outline !px-3" onClick={downloadSyncFile}><Icon name="download" size={17} /> Sync file</button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-2 mt-3">
                  <button className="btn-primary !px-3" onClick={makeInviteLink} disabled={inviteBusy}><Icon name="share" size={17} /> {inviteBusy ? 'Creating…' : 'Create full link'}</button>
                  <button className="btn-outline !px-3" onClick={downloadSyncFile}><Icon name="download" size={17} /> Sync file</button>
                </div>
              )}
            </div>

            <button className="btn-outline w-full mt-3" onClick={() => copyText(roomCode, 'Invite code')}><Icon name="copy" size={17} /> Copy code only</button>
            <p className="text-[12px] leading-relaxed text-ink-soft mt-3.5 flex gap-2"><Icon name="shield" size={17} className="text-primary shrink-0 mt-0.5" /> <span><b className="text-ink">Note:</b> {room.cloud ? 'Send cloud links only to roommates. Offline packets contain room data and UPI IDs; do not post them publicly.' : 'The full link contains room data and UPI IDs. Send it only to roommates. Offline changes require a new link or file.'}</span></p>
          </SectionCard>

          {/* Room settings */}
          <SectionCard title="Room settings" sub="Room name and expense cycle">
            <label className="label" htmlFor="rename-room">Room name</label>
            <div className="flex gap-2">
              <input id="rename-room" className="input flex-1" placeholder={room.name} value={rename} onChange={(e) => setRename(e.target.value)} />
              <button className="btn-outline !px-3.5" onClick={() => { if (!rename.trim()) return; updateRoom({ name: rename.trim() }); setRename(''); pushToast({ message: 'Room name updated.', tone: 'ok' }) }}>Save</button>
            </div>

            <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 px-3.5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Active cycle</p>
              <p className="font-display font-bold mt-1">{new Date(activeCycle.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} – {new Date(activeCycle.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              <p className="text-[11.5px] text-ink-soft mt-0.5">{activeCycle.mode === 'custom' ? 'Custom date range' : `Monthly · starts on day ${room.rentCycleDay}`}</p>
            </div>

            <span className="label mt-5">Monthly fixed date</span>
            <div className="flex flex-wrap gap-2">
              {[1, 5, 10, 15, 20, 25].map((d) => {
                const active = room.cycleMode !== 'custom' && room.rentCycleDay === d
                return <button key={d} onClick={() => { updateRoom({ rentCycleDay: d, cycleMode: 'monthly' }); pushToast({ message: `The monthly cycle now starts on day ${d}.`, tone: 'ok' }) }} className={active ? 'chip-on' : 'chip-off'} aria-pressed={active}>Day {d}</button>
              })}
              <button onClick={() => { const d = Math.min(new Date().getDate(), 28); updateRoom({ rentCycleDay: d, cycleMode: 'monthly' }); pushToast({ message: `Monthly cycle set to start on day ${d}.`, tone: 'ok' }) }} className="chip-off">Use today's date</button>
            </div>

            <span className="label mt-5">Custom date range</span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-primary !px-3" onClick={() => startCycleToday(30)}><Icon name="check" size={17} /> 30 days from today</button>
              <button type="button" className="btn-outline !px-3" onClick={() => startCycleToday(7)}><Icon name="check" size={17} /> 7 days from today</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="label" htmlFor="cycle-start">Start date</label>
                <input id="cycle-start" type="date" className="input" value={cycleStartInput} onChange={(e) => setCycleStartInput(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="cycle-end">End date</label>
                <input id="cycle-end" type="date" className="input" value={cycleEndInput} onChange={(e) => setCycleEndInput(e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn-accent w-full mt-3" onClick={saveCustomCycle}><Icon name="check" /> Save custom cycle</button>
            <p className="text-[11.5px] text-ink-soft mt-2">Dashboard, History and Reports use this cycle. Overall balances remain unchanged.</p>
          </SectionCard>
        </div>
      </div>

      {/* Edit profile sheet */}
      <AnimatePresence>
        {editing && (
          <motion.div className="fixed inset-0 z-[130] flex items-end md:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/55 backdrop-blur-[3px]" onClick={() => setEditingId('')} aria-hidden="true" />
            <motion.div role="dialog" aria-modal="true" aria-label={`Profile for ${editing.name}`}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full md:max-w-[680px] max-h-[94dvh] overflow-y-auto scrollbar-thin rounded-t-[28px] md:rounded-[24px] bg-surface-card text-ink shadow-lift3d border border-line-light"
>
              <div className="sticky top-0 z-10 bg-surface-card/95 backdrop-blur border-b border-line-light px-5 py-4 flex items-center gap-3">
                <Avatar name={editing.name} color={editing.color} size={46} />
                <div className="flex-1"><h2 className="text-[19px] leading-none">Profile · {editing.name}</h2><p className="text-[12px] text-ink-soft mt-1">Personal and payment details</p></div>
                <span className="badge-ok rounded-full px-2.5 py-1 text-[11px] font-bold">{profileCompletion(profileDraftToMember(editProfile))}%</span>
                <button onClick={() => setEditingId('')} className="btn-ghost !px-2.5" aria-label="Close"><Icon name="x" /></button>
              </div>
              <div className="p-5 space-y-5">
                <div className="max-w-sm">
                  <label className="label" htmlFor="edit-nickname">Nickname *</label>
                  <input id="edit-nickname" className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <MemberProfileFields idPrefix="edit-member" value={editProfile} onChange={setEditProfile} />
              </div>
              <div className="sticky bottom-0 bg-surface-card/95 backdrop-blur border-t border-line-light px-5 py-3.5 flex gap-2" style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom,0px))' }}>
                <button className="btn-outline flex-1" onClick={() => setEditingId('')}>Cancel</button>
                <button className="btn-primary flex-[2]" onClick={saveEdit}><Icon name="check" /> Save profile</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
