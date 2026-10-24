import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { usePersistentState } from '../hooks/usePersistentDraft'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import {
  MemberProfileFields,
  emptyMemberProfile,
  profileDraftError,
  profileDraftToMember,
  type MemberProfileDraft,
} from '../components/MemberProfileFields'
import { APP } from '../lib/constants'
import { parseCloudInviteLocation, previewCloudInvite, type CloudInvitePreview } from '../lib/cloud'
import { cloudErrorMessage, normalizeLoginUsername } from '../lib/supabase'
import clsx from 'clsx'

export default function CloudJoin() {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, cloud, cloudClaimInvite, cloudOpenRoom, pushToast } = useStore()
  const { token, roomLoginId: linkRoomLoginId } = useMemo(
    () => parseCloudInviteLocation(location.search, location.hash),
    [location.search, location.hash],
  )

  const [preview, setPreview] = useState<CloudInvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [mode, setMode] = usePersistentState<'existing' | 'new'>('cloudjoin.mode', 'existing')
  const [selectedId, setSelectedId] = usePersistentState('cloudjoin.selectedId', '')
  const [nickname, setNickname] = usePersistentState('cloudjoin.nickname', '')
  const [username, setUsername] = usePersistentState('cloudjoin.username', '')
  // Passwords are never saved as drafts.
  const [roomPassword, setRoomPassword] = useState('')
  const [personalPassword, setPersonalPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profile, setProfile] = usePersistentState<MemberProfileDraft>('cloudjoin.profile', () => emptyMemberProfile())
  const [replaceLocal, setReplaceLocal] = usePersistentState('cloudjoin.replaceLocal', false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setLoadError('')
      try {
        const next = await previewCloudInvite(token)
        if (!alive) return
        if (!next.ok || !next.room) {
          setPreview(next)
          setLoadError(next.error ?? 'Could not verify the invite.')
          return
        }
        setPreview(next)
        const target = next.target_member_id
          ? next.members?.find((m) => m.id === next.target_member_id)
          : next.members?.find((m) => !m.is_virtual && !m.claimed)
        if (target) {
          setSelectedId((prev) => next.members?.some((m) => m.id === prev) ? prev : target.id)
          setNickname((prev) => prev || target.display_name)
          setUsername((prev) => prev || normalizeLoginUsername(target.display_name))
          setMode('existing')
        } else {
          setMode('new')
        }
      } catch (err) {
        if (alive) setLoadError(cloudErrorMessage(err))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [token])

  const members = preview?.members ?? []
  const claimable = members.filter((m) => !m.is_virtual && !m.claimed && (!preview?.target_member_id || m.id === preview.target_member_id))
  const claimed = members.filter((m) => !m.is_virtual && m.claimed)
  const roomLoginId = preview?.room?.login_id ?? linkRoomLoginId
  const differentLocalRoom = Boolean(preview?.room && state.room && state.room.id !== preview.room.id)
  const alreadyAvailable = preview?.room ? cloud.availableRooms.some((r) => r.roomId === preview.room?.id) : false
  const roomFull = members.filter((m) => m.status === 'active' || m.status === 'invited').length >= (preview?.room?.max_members ?? 8)

  function selectMember(id: string) {
    const member = members.find((m) => m.id === id)
    setSelectedId(id)
    if (member) {
      setNickname(member.display_name)
      setUsername(normalizeLoginUsername(member.display_name))
    }
  }

  async function join() {
    setError('')
    if (!preview?.room) return
    const selected = members.find((m) => m.id === selectedId)
    const displayName = nickname.trim() || selected?.display_name || ''
    if (mode === 'existing' && !selectedId) { setError('Select your name from the list.'); return }
    if (!displayName) { setError('Enter your nickname.'); return }
    if (!normalizeLoginUsername(username)) { setError('Use at least 2 characters: letters, numbers, dot or underscore.'); return }
    if (!roomPassword) { setError('Enter the shared Room Password from the room admin.'); return }
    if (personalPassword.length < 8) { setError('Your personal password must contain at least 8 characters.'); return }
    if (personalPassword !== confirmPassword) { setError('The personal passwords do not match.'); return }
    const profileError = profileDraftError(profile)
    if (profileError) { setError(profileError); return }

    setBusy(true)
    const result = await cloudClaimInvite({
      token,
      roomLoginId,
      roomPassword,
      username,
      personalPassword,
      memberId: mode === 'existing' ? selectedId : undefined,
      displayName,
      details: profileDraftToMember(profile),
    }, replaceLocal)
    setBusy(false)
    if (!result.ok) { setError(result.error ?? 'Could not join the room.'); return }
    pushToast({ message: `${displayName}, you joined the cloud room.`, tone: 'ok' })
    navigate('/room/my')
  }

  async function openAlreadyJoined() {
    if (!preview?.room) return
    setBusy(true)
    const result = await cloudOpenRoom(preview.room.id, replaceLocal)
    setBusy(false)
    if (!result.ok) { setError(result.error ?? 'Could not open the room.'); return }
    navigate('/room/my')
  }

  return (
    <div className="min-h-dvh bg-surface-page text-ink">
      <header className="border-b border-line-light bg-surface-page/90 sticky sm:backdrop-blur top-0 z-30">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-[64px] flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid place-items-center h-10 w-10 rounded-2xl bg-primary-solid text-primary-on shadow-fab"><Icon name="rupee" size={21} /></span>
            <span className="font-display font-bold text-[17px]">{APP.name}</span>
          </Link>
          <span className="flex-1" />
          <Link to={`/login${roomLoginId ? `?room=${encodeURIComponent(roomLoginId)}` : ''}`} className="btn-outline !px-3.5 !py-2 !text-[13px] whitespace-nowrap">Login</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-7 pb-14">
        <p className="kicker">Cloud room invite</p>
        <h1 className="text-[27px] sm:text-[34px] mt-1">Join the room and create your login</h1>
        <p className="text-ink-soft text-[14.5px] mt-1.5 max-w-3xl">
          Claim your name, enter the shared Room Password and create a personal password. Your personal login protects your entries.
        </p>

        {loading ? (
          <div className="card p-8 mt-6 text-center">
            <span className="icon-tile h-14 w-14 mx-auto"><Icon name="users" size={26} /></span>
            <p className="font-display font-bold mt-3">Checking cloud invite…</p>
            <p className="text-[13px] text-ink-soft mt-1">Loading the room and member list.</p>
          </div>
        ) : !preview?.room ? (
          <section className="card p-5 sm:p-6 mt-6">
            <span className="icon-tile h-12 w-12"><Icon name="share" size={23} /></span>
            <h2 className="text-[20px] mt-3">This invite link is not valid</h2>
            <p className="text-[13.5px] text-ink-soft mt-1.5">{loadError || preview?.error || 'Ask for a new invite link.'}</p>
            <div className="grid sm:grid-cols-2 gap-2.5 mt-5">
              <Link to="/login" className="btn-primary">I already have a login</Link>
              <Link to="/join" className="btn-outline">Offline join file/link</Link>
            </div>
          </section>
        ) : (
          <>
            <section className="relative overflow-hidden rounded-[26px] bg-[#15172F] text-[#F1F0FF] border border-white/10 shadow-lift3d p-5 sm:p-6 mt-6">
              <div className="absolute -right-16 -top-20 hidden h-48 w-48 rounded-full bg-[#4F46C8]/35 blur-3xl sm:block" aria-hidden="true" />
              <div className="relative flex flex-wrap items-center gap-4">
                <span className="grid place-items-center h-14 w-14 rounded-[20px] bg-white/10 text-[#A8A0FF]"><Icon name="home" size={27} /></span>
                <div className="flex-1 min-w-[220px]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A8A0FF]">You are invited</p>
                  <h2 className="text-[24px] text-white mt-1 leading-tight">{preview.room.name}</h2>
                  <p className="text-[13px] text-[#C5C3E1] mt-1">Room Login ID <b className="text-white font-mono">{preview.room.login_id}</b> · {members.length} members · link expires {preview.expires_at ? new Date(preview.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</p>
                </div>
                <div className="flex -space-x-1.5">
                  {members.slice(0, 6).map((m) => <Avatar key={m.id} name={m.display_name} color={m.color_hex} size={36} className="ring-2 ring-[#15172F]" />)}
                </div>
              </div>
            </section>

            {alreadyAvailable && (
              <section className="card p-5 mt-5 border-primary/30 bg-primary/5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="icon-tile h-11 w-11"><Icon name="check" size={21} /></span>
                  <div className="flex-1 min-w-[220px]">
                    <p className="font-display font-bold">You are already signed in to this room</p>
                    <p className="text-[12.5px] text-ink-soft">Open your dashboard to continue.</p>
                  </div>
                  <button type="button" className="btn-primary" onClick={openAlreadyJoined} disabled={busy}>Open dashboard</button>
                </div>
              </section>
            )}

            <section className="card p-5 sm:p-6 mt-5">
              <h2 className="text-[19px]">1) Who are you?</h2>
              <div className="grid grid-cols-2 gap-2 mt-3" role="group" aria-label="Join method">
                <button type="button" onClick={() => setMode('existing')} disabled={!claimable.length}
                  className={clsx('rounded-2xl border p-3.5 text-left', mode === 'existing' ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-line-light', !claimable.length && 'opacity-50')} aria-pressed={mode === 'existing'}>
                  <span className="font-display font-bold block">I am in the list</span>
                  <span className="text-[12px] text-ink-soft">The creator already added my name</span>
                </button>
                <button type="button" onClick={() => !roomFull && !preview.target_member_id && setMode('new')} disabled={roomFull || Boolean(preview.target_member_id)}
                  className={clsx('rounded-2xl border p-3.5 text-left', mode === 'new' ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-line-light', (roomFull || preview.target_member_id) && 'opacity-50')} aria-pressed={mode === 'new'}>
                  <span className="font-display font-bold block">I am a new member</span>
                  <span className="text-[12px] text-ink-soft">{preview.target_member_id ? 'This link is for a specific member' : roomFull ? 'The room is full' : 'I will add my own details'}</span>
                </button>
              </div>

              {mode === 'existing' ? (
                <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
                  {claimable.map((m) => {
                    const active = selectedId === m.id
                    return (
                      <button key={m.id} type="button" onClick={() => selectMember(m.id)}
                        className={clsx('rounded-2xl border p-3.5 flex items-center gap-3 text-left transition-all active:scale-[.99]', active ? 'border-primary bg-primary/10 ring-2 ring-primary/25' : 'border-line-light hover:border-primary/50')} aria-pressed={active}>
                        <Avatar name={m.display_name} color={m.color_hex} size={42} />
                        <span className="flex-1 min-w-0">
                          <span className="block font-display font-bold truncate">{m.display_name}</span>
                          <span className="block text-[11.5px] text-ink-soft">{m.has_upi ? 'UPI profile is ready' : 'Complete the profile after claiming'}</span>
                        </span>
                        {active && <Icon name="check" className="text-primary" />}
                      </button>
                    )
                  })}
                  {claimable.length === 0 && <p className="text-[13px] text-ink-soft sm:col-span-2">No unclaimed members remain. If you already created a login, use the Login page.</p>}
                  {claimed.length > 0 && (
                    <p className="text-[12px] text-ink-faint sm:col-span-2">Already claimed: {claimed.map((m) => m.display_name).join(', ')} — these members use their personal logins.</p>
                  )}
                </div>
              ) : null}

              <div className="grid sm:grid-cols-2 gap-3 mt-5">
                <div>
                  <label className="label" htmlFor="cloud-join-nickname">Nickname shown in the room *</label>
                  <input id="cloud-join-nickname" className="input" value={nickname} onChange={(e) => {
                    setNickname(e.target.value)
                    if (!username || username === normalizeLoginUsername(nickname)) setUsername(normalizeLoginUsername(e.target.value))
                  }} placeholder="Amit" autoComplete="nickname" />
                </div>
                <div>
                  <label className="label" htmlFor="cloud-join-username">Your login username *</label>
                  <input id="cloud-join-username" className="input font-mono" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="amitkumar" autoComplete="username" autoCapitalize="off" spellCheck={false} />
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-display font-bold text-[16px]">Your personal and UPI details</h3>
                <p className="text-[12.5px] text-ink-soft mt-1">Add any missing details. Existing profile details remain unchanged.</p>
                <div className="mt-4"><MemberProfileFields idPrefix="cloud-join-profile" value={profile} onChange={setProfile} /></div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mt-6 rounded-[22px] border border-primary/20 bg-primary/5 p-4">
                <div>
                  <label className="label" htmlFor="cloud-room-password">Shared Room Password *</label>
                  <input id="cloud-room-password" type="password" className="input !bg-surface-card" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} autoComplete="off" />
                </div>
                <div>
                  <label className="label" htmlFor="cloud-personal-password">Your personal password *</label>
                  <input id="cloud-personal-password" type="password" className="input !bg-surface-card" value={personalPassword} onChange={(e) => setPersonalPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <div>
                  <label className="label" htmlFor="cloud-confirm-password">Confirm personal password *</label>
                  <input id="cloud-confirm-password" type="password" className="input !bg-surface-card" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <p className="sm:col-span-3 text-[12px] leading-relaxed text-ink-soft flex gap-2"><Icon name="shield" size={17} className="text-primary shrink-0 mt-0.5" /> <span>Do not share your personal password. Never enter a UPI PIN or OTP here.</span></p>
              </div>

              {differentLocalRoom && (
                <label className="mt-5 flex items-start gap-3 rounded-2xl border border-pending/35 bg-pending/10 p-4 cursor-pointer">
                  <input type="checkbox" checked={replaceLocal} onChange={(e) => setReplaceLocal(e.target.checked)} className="mt-0.5 h-5 w-5 rounded accent-primary" />
                  <span className="text-[13px] text-ink-soft"><b className="text-ink">Note:</b> “{state.room?.name}” is open in this browser. Joining will open the cloud room instead. Back up local data first if needed. I understand.</span>
                </label>
              )}

              {error && <p className="mt-4 rounded-xl border border-overdue/30 bg-overdue/10 px-3.5 py-2.5 text-[13px] font-semibold text-overdue" role="alert">{error}</p>}

              <button type="button" onClick={join} className="btn-primary w-full !py-3.5 !text-[16px] mt-5" disabled={busy}>
                <Icon name="check" /> {busy ? 'Joining…' : 'Join and open my dashboard'}
              </button>
              <p className="text-center text-[12px] text-ink-soft mt-3">You can view all room activity, but you can change only your own expenses.</p>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
