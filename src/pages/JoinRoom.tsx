import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { usePersistentState } from '../hooks/usePersistentDraft'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import {
  MemberProfileFields,
  emptyMemberProfile,
  profileCompletion,
  profileDraftError,
  profileDraftToMember,
  type MemberProfileDraft,
} from '../components/MemberProfileFields'
import { createRoomSyncPacket, decodeRoomSyncPacket, parseRoomSyncPacketText, type RoomSyncPacket } from '../lib/share'
import { APP } from '../lib/constants'
import { formatINR } from '../lib/money'
import clsx from 'clsx'

export default function JoinRoom() {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, ready, applyRoomSyncPacket, pushToast } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [packet, setPacket] = useState<RoomSyncPacket | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [mode, setMode] = usePersistentState<'existing' | 'new'>('joinroom.mode', 'existing')
  const [selectedId, setSelectedId] = usePersistentState('joinroom.selectedId', '')
  const [nickname, setNickname] = usePersistentState('joinroom.nickname', '')
  const [profile, setProfile] = usePersistentState<MemberProfileDraft>('joinroom.profile', () => emptyMemberProfile())
  const [replaceRoom, setReplaceRoom] = usePersistentState('joinroom.replaceRoom', false)
  const [joinError, setJoinError] = useState('')
  const [pasteText, setPasteText] = useState('')

  const rawPacket = useMemo(() => new URLSearchParams(location.hash.replace(/^#/, '')).get('packet') ?? '', [location.hash])
  const queryCode = useMemo(() => new URLSearchParams(location.search).get('code')?.toUpperCase() ?? '', [location.search])
  const queryRoom = useMemo(() => new URLSearchParams(location.search).get('room') ?? '', [location.search])

  useEffect(() => {
    if (!ready) return
    let alive = true
    ;(async () => {
      setLoading(true)
      setLoadError('')
      let next: RoomSyncPacket | null = null
      if (rawPacket) {
        next = await decodeRoomSyncPacket(rawPacket)
        if (!next && alive) setLoadError('Could not read the invite link. Ask for the complete link or use a sync file.')
      } else if (queryCode && state.room?.code === queryCode) {
        // Short link usi device/browser par kaam karta hai jahan room pehle se saved hai.
        next = createRoomSyncPacket(state)
      }
      if (!alive) return
      setPacket(next)
      const first = next?.members.find((m) => !m.isVirtual)
      if (first) setSelectedId((prev) => prev || first.id)
      setLoading(false)
    })()
    return () => { alive = false }
    // state poora dependency nahi rakha — warna har edit par invite reset hoga
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rawPacket, queryCode, state.room?.id, state.room?.code])

  const realMembers = packet?.members.filter((m) => !m.isVirtual) ?? []
  const totalExpenses = packet?.expenses.filter((e) => !e.deleted && e.status === 'confirmed').reduce((s, e) => s + e.amountPaise, 0) ?? 0
  const differentCurrentRoom = !!packet && !!state.room && state.room.id !== packet.room.id && state.room.code !== packet.room.code
  const roomFull = (packet?.members.length ?? 0) >= 8

  async function loadFromText(text: string) {
    if (!text.trim()) return
    setLoading(true)
    setLoadError('')
    const next = await parseRoomSyncPacketText(text)
    if (!next) {
      setLoadError('This invite data is not valid. Use a full join link or sync file from the Members page.')
    } else {
      setPacket(next)
      const first = next.members.find((m) => !m.isVirtual)
      if (first) setSelectedId(first.id)
      pushToast({ message: `Invite loaded for ${next.room.name}.`, tone: 'ok' })
    }
    setLoading(false)
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    await loadFromText(await file.text())
  }

  function join() {
    if (!packet) return
    setJoinError('')
    if (mode === 'new') {
      if (!nickname.trim()) { setJoinError('Enter the nickname to show in the room.'); return }
      const err = profileDraftError(profile)
      if (err) { setJoinError(err); return }
    }
    const result = applyRoomSyncPacket(packet, {
      memberId: mode === 'existing' ? selectedId : undefined,
      newMemberName: mode === 'new' ? nickname : undefined,
      newMemberDetails: mode === 'new' ? profileDraftToMember(profile) : undefined,
      replaceDifferentRoom: replaceRoom,
    })
    if (!result.ok) { setJoinError(result.error ?? 'Could not join the room.'); return }
    navigate('/room/my')
  }

  return (
    <div className="min-h-dvh bg-surface-page text-ink">
      <header className="border-b border-line-light bg-surface-page/90 sticky sm:backdrop-blur top-0 z-30">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-[64px] flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid place-items-center h-10 w-10 rounded-2xl bg-primary-solid text-primary-on shadow-fab"><Icon name="rupee" size={21} /></span>
            <span className="font-display font-bold text-[17px]">{APP.name}</span>
          </Link>
          <span className="flex-1" />
          {state.room && <Link to="/room" className="btn-outline !px-3.5 !py-2 !text-[13px] whitespace-nowrap">Open my room</Link>}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-7 pb-14">
        <p className="kicker">Room invite</p>
        <h1 className="text-[27px] sm:text-[34px] mt-1">Join a RoomHisaab room</h1>
        <p className="text-ink-soft text-[14.5px] mt-1.5 max-w-2xl">Select your name or join as a new member with your personal and UPI details.</p>

        {loading ? (
          <div className="card p-8 mt-6 text-center">
            <span className="icon-tile h-14 w-14 mx-auto"><Icon name="users" size={26} /></span>
            <p className="font-display font-bold mt-3">Checking invite…</p>
            <p className="text-[13px] text-ink-soft mt-1">Loading the room, members and expenses.</p>
          </div>
        ) : packet ? (
          <>
            <section className="relative overflow-hidden rounded-[26px] bg-[#15172F] text-[#F1F0FF] border border-white/10 shadow-lift3d p-5 sm:p-6 mt-6">
              <div className="absolute -right-16 -top-20 hidden h-48 w-48 rounded-full bg-[#4F46C8]/35 blur-3xl sm:block" aria-hidden="true" />
              <div className="relative flex flex-wrap items-center gap-4">
                <span className="grid place-items-center h-14 w-14 rounded-[20px] bg-white/10 text-[#A8A0FF]"><Icon name="home" size={27} /></span>
                <div className="flex-1 min-w-[210px]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A8A0FF]">You are invited</p>
                  <h2 className="text-[24px] text-white mt-1 leading-tight">{packet.room.name}</h2>
                  <p className="text-[13px] text-[#C5C3E1] mt-1">Code {packet.room.code} · {packet.members.length} members · {formatINR(totalExpenses)} in expenses · {new Date(packet.exportedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} </p>
                </div>
                <div className="flex -space-x-1.5">
                  {packet.members.slice(0, 6).map((m) => <Avatar key={m.id} name={m.name} color={m.color} size={36} className="ring-2 ring-[#15172F]" />)}
                </div>
              </div>
            </section>

            <section className="card p-5 sm:p-6 mt-5">
              <h2 className="text-[19px]">Who are you?</h2>
              <div className="grid grid-cols-2 gap-2 mt-3" role="group" aria-label="Join method">
                <button type="button" onClick={() => setMode('existing')} className={clsx('rounded-2xl border p-3.5 text-left', mode === 'existing' ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-line-light')} aria-pressed={mode === 'existing'}>
                  <span className="font-display font-bold block">I am in the list</span>
                  <span className="text-[12px] text-ink-soft">An admin already added my name</span>
                </button>
                <button type="button" onClick={() => !roomFull && setMode('new')} disabled={roomFull} className={clsx('rounded-2xl border p-3.5 text-left', mode === 'new' ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-line-light', roomFull && 'opacity-50')} aria-pressed={mode === 'new'}>
                  <span className="font-display font-bold block">I am a new member</span>
                  <span className="text-[12px] text-ink-soft">{roomFull ? 'The room is full (8 members)' : 'I will add my own details'}</span>
                </button>
              </div>

              {mode === 'existing' ? (
                <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
                  {realMembers.map((m) => {
                    const active = selectedId === m.id
                    return (
                      <button key={m.id} type="button" onClick={() => setSelectedId(m.id)} className={clsx('rounded-2xl border p-3.5 flex items-center gap-3 text-left transition-all active:scale-[.99]', active ? 'border-primary bg-primary/10 ring-2 ring-primary/25' : 'border-line-light hover:border-primary/50')} aria-pressed={active}>
                        <Avatar name={m.name} color={m.color} size={42} />
                        <span className="flex-1 min-w-0">
                          <span className="block font-display font-bold truncate">{m.name}</span>
                          <span className="block text-[11.5px] text-ink-soft truncate">{m.fullName ?? 'Complete the profile after joining'} · {profileCompletion(m)}%</span>
                        </span>
                        {active && <Icon name="check" className="text-primary" />}
                      </button>
                    )
                  })}
                  {realMembers.length === 0 && <p className="text-[13px] text-ink-soft sm:col-span-2">This packet has no real members. Join as a new member.</p>}
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <div className="max-w-sm">
                    <label className="label" htmlFor="join-nickname">Nickname *</label>
                    <input id="join-nickname" className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Example: Priya" autoComplete="nickname" />
                  </div>
                  <MemberProfileFields idPrefix="join-profile" value={profile} onChange={setProfile} />
                </div>
              )}

              {differentCurrentRoom && (
                <label className="mt-5 flex items-start gap-3 rounded-2xl border border-pending/35 bg-pending/10 p-4 cursor-pointer">
                  <input type="checkbox" checked={replaceRoom} onChange={(e) => setReplaceRoom(e.target.checked)} className="mt-0.5 h-5 w-5 rounded accent-primary" />
                  <span className="text-[13px] text-ink-soft"><b className="text-ink">Note:</b> “{state.room?.name}” is open in this browser. Joining will replace it on screen. Back up the local data first if needed. I understand.</span>
                </label>
              )}

              <div className="mt-5 rounded-2xl bg-primary/5 border border-primary/20 p-4 flex gap-3 text-[12.5px] text-ink-soft">
                <Icon name="shield" size={20} className="text-primary shrink-0 mt-0.5" />
                <p><b className="text-ink">Privacy:</b> Invite links contain room data and saved UPI profiles. Send them only to roommates. RoomHisaab never asks for a PIN or OTP.</p>
              </div>

              {joinError && <p className="mt-4 rounded-xl border border-overdue/30 bg-overdue/10 px-3.5 py-2.5 text-[13px] font-semibold text-overdue" role="alert">{joinError}</p>}

              <button type="button" onClick={join} className="btn-primary w-full !py-3.5 !text-[16px] mt-5">
                <Icon name="check" /> Join and open my dashboard
              </button>
              <p className="text-center text-[12px] text-ink-soft mt-3">After joining, you can view all room purchases and balances.</p>
            </section>
          </>
        ) : (
          <section className="card p-5 sm:p-6 mt-6">
            <span className="icon-tile h-12 w-12"><Icon name="share" size={23} /></span>
            <h2 className="text-[20px] mt-3">{queryCode ? `Code ${queryCode} was found, but the room data is not on this device` : 'An invite link or sync file is required'}</h2>
            <p className="text-[13.5px] text-ink-soft mt-1.5 leading-relaxed">
              {queryRoom ? <>To join “{queryRoom}”, </> : 'To join, '}ask the room admin for a <b className="text-ink">Full Join Link</b> from Members → Room invite. A short code alone cannot transfer local room data to another device. Paste the link below:
            </p>
            {loadError && <p className="mt-3 rounded-xl border border-overdue/30 bg-overdue/10 px-3.5 py-2.5 text-[13px] font-semibold text-overdue" role="alert">{loadError}</p>}
            <label className="label mt-4" htmlFor="join-paste">Paste the full join link</label>
            <textarea id="join-paste" className="input resize-y" rows={4} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="https://.../join#packet=gz_..." />
            <div className="grid sm:grid-cols-2 gap-2.5 mt-3">
              <button type="button" className="btn-primary" onClick={() => loadFromText(pasteText)} disabled={!pasteText.trim()}><Icon name="check" /> Check link</button>
              <button type="button" className="btn-outline" onClick={() => fileRef.current?.click()}><Icon name="download" /> Open sync file</button>
              <input ref={fileRef} type="file" accept="application/json,.json,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
            <div className="mt-5 grid sm:grid-cols-2 gap-2.5">
              <Link to="/onboarding" className="btn-outline">Create a new room</Link>
              <Link to="/" className="btn-ghost">Go to Home</Link>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
