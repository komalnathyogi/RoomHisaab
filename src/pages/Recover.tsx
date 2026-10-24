import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { isCloudConfigured, normalizeLoginUsername, normalizeRoomLoginId } from '../lib/supabase'
import { importJSON } from '../lib/storage'
import { isValidRecoveryKey } from '../lib/recovery'
import { usePersistentState } from '../hooks/usePersistentDraft'

type RecoveryPath = 'key' | 'invite' | 'admin' | 'backup'

const inputClass = 'input mt-1.5 !py-3 text-base'

function inviteFromText(value: string): { room: string; invite: string } | null {
  const text = value.trim()
  if (!text) return null
  const roomMatch = text.match(/[?&#]room=([A-Za-z0-9._-]{2,})/i)
  const inviteMatch = text.match(/[?&#]invite=([A-Za-z0-9_-]{16,})/i)
  if (roomMatch && inviteMatch) return { room: roomMatch[1], invite: inviteMatch[1] }
  try {
    const url = new URL(text)
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    const room = url.searchParams.get('room') ?? hash.get('room') ?? ''
    const invite = url.searchParams.get('invite') ?? hash.get('invite') ?? ''
    if (room && invite) return { room, invite }
  } catch {
    // The pasted value may be only a partial URL; the regex above handles that.
  }
  return null
}

export default function Recover() {
  const { state, cloudRecoverWithKey, importState, pushToast } = useStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)

  const [path, setPath] = useState<RecoveryPath>(params.get('room') && params.get('invite') ? 'invite' : 'key')
  const [roomLoginId, setRoomLoginId] = usePersistentState('recover.roomLoginId', '')
  const [oldUsername, setOldUsername] = usePersistentState('recover.oldUsername', '')
  const [newUsername, setNewUsername] = usePersistentState('recover.newUsername', '')
  const [inviteText, setInviteText] = usePersistentState(
    'recover.inviteText',
    params.get('room') && params.get('invite') ? `${window.location.origin}/join#invite=${encodeURIComponent(params.get('invite')!)}&room=${encodeURIComponent(params.get('room')!)}` : '',
  )
  const [recoveryKey, setRecoveryKey] = useState('')
  const [roomPassword, setRoomPassword] = useState('')
  const [personalPassword, setPersonalPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [replaceLocalRoom, setReplaceLocalRoom] = useState(false)
  const [backupSummary, setBackupSummary] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const invite = useMemo(() => inviteFromText(inviteText), [inviteText])
  const adminMessage = useMemo(() => {
    const room = normalizeRoomLoginId(roomLoginId) || 'our room'
    const user = normalizeLoginUsername(oldUsername) || 'my member account'
    return `Hi, I forgot my RoomHisaab personal password for ${room}. Please open Members, choose Login reset for ${user}, then send me the personal invite shown under Cloud join link. My old expenses and balances must stay connected to the same member.`
  }, [oldUsername, roomLoginId])

  const openInvite = () => {
    setError('')
    if (!invite) {
      setError('Paste the complete invite or recovery link.')
      return
    }
    navigate(`/join#invite=${encodeURIComponent(invite.invite)}&room=${encodeURIComponent(invite.room)}`)
  }

  const copyAdminMessage = async () => {
    try {
      await navigator.clipboard.writeText(adminMessage)
      pushToast({ message: 'Recovery request copied.', tone: 'ok' })
    } catch {
      pushToast({ message: 'Copy the recovery request from the text box.', tone: 'bad' })
    }
  }

  const recoverWithKey = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const cleanRoom = normalizeRoomLoginId(roomLoginId)
    const cleanOld = normalizeLoginUsername(oldUsername)
    const cleanNew = normalizeLoginUsername(newUsername)
    if (!isCloudConfigured) return setError('Supabase is not configured on this deployment.')
    if (!cleanRoom || !cleanOld || !cleanNew) return setError('Check the Room Login ID and usernames.')
    if (cleanOld === cleanNew) return setError('Choose a new login username. The old username still belongs to the forgotten login.')
    if (!isValidRecoveryKey(recoveryKey)) return setError('Enter the complete Personal Recovery Key.')
    if (!roomPassword) return setError('Enter the shared Room Password.')
    if (personalPassword.length < 8) return setError('The new personal password must contain at least 8 characters.')
    if (personalPassword !== confirmPassword) return setError('The new personal passwords do not match.')
    if (state.room && !replaceLocalRoom && state.room.loginId !== cleanRoom) {
      return setError('Another room is open on this device. Export a backup, then confirm that the recovered room should replace it here.')
    }

    setBusy(true)
    const result = await cloudRecoverWithKey(
      {
        roomLoginId: cleanRoom,
        oldUsername: cleanOld,
        newUsername: cleanNew,
        roomPassword,
        recoveryKey,
        newPersonalPassword: personalPassword,
      },
      replaceLocalRoom || state.room?.loginId === cleanRoom,
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.error || 'Recovery failed. Check the details and try again.')
      return
    }
    setRecoveryKey('')
    setRoomPassword('')
    setPersonalPassword('')
    setConfirmPassword('')
    pushToast({ message: 'Access restored. Create a new recovery key in Settings.', tone: 'ok' })
    navigate('/room', { replace: true })
  }

  const restoreBackup = async (file: File) => {
    setError('')
    try {
      const text = await file.text()
      const imported = importJSON(text)
      if (!imported?.room) {
        setError('This file is not a valid RoomHisaab backup.')
        return
      }
      setBackupSummary(`${imported.room.name} · ${imported.members.length} members · ${imported.expenses.length} expenses`)
      const confirmed = window.confirm(
        `Restore “${imported.room.name}” on this device?\n\nA cloud backup will open as a local copy. It will not change the live cloud room.`,
      )
      if (!confirmed) return
      if (importState(text)) {
        pushToast({ message: 'Backup restored as a local copy.', tone: 'ok' })
        navigate('/room', { replace: true })
      } else {
        setError('The backup could not be restored.')
      }
    } catch {
      setError('The backup file could not be read.')
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <Link to="/" className="inline-flex items-center gap-2" aria-label="RoomHisaab home">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary-solid via-primary-hover to-accent text-lg font-black text-white shadow-fab">₹</span>
        <span className="font-display text-2xl font-bold text-ink">RoomHisaab</span>
      </Link>

      <header className="mt-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Account recovery</p>
        <h1 className="mt-2 font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">Return to your room</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-ink-soft">
          Use the option that matches what you still have. Recovery reconnects you to the same member record, expenses, settlements, and balances.
        </p>
      </header>

      <div className="mt-7 grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Recovery options">
        {[
          ['key', 'Personal Recovery Key', 'Fastest and works even if you are the only admin.'],
          ['invite', 'Invite or recovery link', 'Open a link shared by a room member.'],
          ['admin', 'Ask a room admin', 'An admin resets your login and sends a targeted invite.'],
          ['backup', 'Restore a backup', 'Open a JSON backup as a local copy on this device.'],
        ].map(([id, title, description]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={path === id}
            onClick={() => { setPath(id as RecoveryPath); setError('') }}
            className={`rounded-3xl border p-4 text-left transition ${path === id ? 'border-primary bg-primary/10 shadow-card' : 'border-line-light bg-surface-card hover:border-primary/50'}`}
          >
            <span className="block font-display text-lg font-bold text-ink">{title}</span>
            <span className="mt-1 block text-sm leading-6 text-ink-soft">{description}</span>
          </button>
        ))}
      </div>

      <section className="mt-5 card rounded-[1.75rem] p-5 sm:p-7">
        {path === 'key' && (
          <form onSubmit={recoverWithKey} className="space-y-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-ink">Recover with your personal key</h2>
              <p className="mt-1 text-sm leading-6 text-ink-soft">You will create a replacement login. Your display name, profile, expenses, and balances stay connected.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-ink">
                Room Login ID
                <input className={inputClass} value={roomLoginId} onChange={(e) => setRoomLoginId(normalizeRoomLoginId(e.target.value))} placeholder="sunset-room-7" autoComplete="off" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Old login username
                <input className={inputClass} value={oldUsername} onChange={(e) => setOldUsername(normalizeLoginUsername(e.target.value))} placeholder="Your previous username" autoComplete="username" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                New login username
                <input className={inputClass} value={newUsername} onChange={(e) => setNewUsername(normalizeLoginUsername(e.target.value))} placeholder="Choose a different username" autoComplete="username" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Shared Room Password
                <input className={inputClass} type="password" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} placeholder="Room Password" autoComplete="current-password" />
              </label>
            </div>
            <label className="block text-sm font-semibold text-ink">
              Personal Recovery Key
              <input className={`${inputClass} font-mono uppercase`} value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())} placeholder="RH-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} />
              <span className="mt-1 block text-xs font-normal leading-5 text-ink-faint">One key works once. After recovery, create a new key in Settings.</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-ink">
                New personal password
                <input className={inputClass} type="password" value={personalPassword} onChange={(e) => setPersonalPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Confirm new password
                <input className={inputClass} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter it again" autoComplete="new-password" />
              </label>
            </div>
            {state.room && (
              <label className="flex items-start gap-3 rounded-2xl border border-amber-300/50 bg-amber-400/10 p-4 text-sm leading-6 text-ink-soft">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-[#4F46C8]" checked={replaceLocalRoom} onChange={(e) => setReplaceLocalRoom(e.target.checked)} />
                <span><strong className="text-ink">Replace the room currently open on this device.</strong> Export a backup first if it contains data you still need.</span>
              </label>
            )}
            {error && <p role="alert" className="rounded-2xl border border-rose-300/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full !py-3.5">
              {busy ? 'Restoring access…' : 'Restore my access'}
            </button>
          </form>
        )}

        {path === 'invite' && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Open an invite or recovery link</h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">Paste the complete link. A targeted recovery invite reconnects the selected member instead of creating a duplicate.</p>
            <label className="mt-4 block text-sm font-semibold text-ink">
              Invite link
              <textarea className={`${inputClass} min-h-28 resize-y`} value={inviteText} onChange={(e) => setInviteText(e.target.value)} placeholder="https://…/join#invite=…&room=…" />
            </label>
            {inviteText && <p className="mt-2 text-sm text-ink-soft">{invite ? 'Link recognized.' : 'The room and invite codes were not found in this text.'}</p>}
            {error && <p role="alert" className="mt-3 rounded-2xl border border-rose-300/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
            <button type="button" onClick={openInvite} className="btn-primary mt-4 w-full !py-3.5">Continue with this link</button>
          </div>
        )}

        {path === 'admin' && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Ask a room admin</h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-ink-soft">
              <li>The admin signs in and opens <strong className="text-ink">Members</strong>.</li>
              <li>They choose <strong className="text-ink">Login reset</strong> for your existing member record.</li>
              <li>RoomHisaab creates a new personal invite. They copy it from <strong className="text-ink">Cloud join link</strong> and send it to you.</li>
              <li>Open the link, enter the Room Password, choose a new username and personal password, then claim the same member.</li>
            </ol>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-ink">Room Login ID<input className={inputClass} value={roomLoginId} onChange={(e) => setRoomLoginId(normalizeRoomLoginId(e.target.value))} placeholder="sunset-room-7" /></label>
              <label className="block text-sm font-semibold text-ink">Your old username<input className={inputClass} value={oldUsername} onChange={(e) => setOldUsername(normalizeLoginUsername(e.target.value))} placeholder="Previous username" /></label>
            </div>
            <label className="mt-4 block text-sm font-semibold text-ink">
              Message for the admin
              <textarea className={`${inputClass} min-h-28 resize-y`} value={adminMessage} readOnly />
            </label>
            <button type="button" onClick={copyAdminMessage} className="btn-primary mt-4 w-full !py-3.5">Copy recovery request</button>
          </div>
        )}

        {path === 'backup' && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Restore a JSON backup</h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">This opens the saved data on this device. A cloud backup becomes a local copy and does not overwrite the live cloud room.</p>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) void restoreBackup(file); e.target.value = '' }} />
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-5 w-full rounded-2xl border border-dashed border-primary/60 bg-primary/10 px-5 py-6 font-bold text-primary">Choose RoomHisaab backup (.json)</button>
            {backupSummary && <p className="mt-3 text-center text-sm text-ink-soft">{backupSummary}</p>}
            {error && <p role="alert" className="mt-3 rounded-2xl border border-rose-300/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
          </div>
        )}
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link to="/login" className="font-semibold text-primary">Back to sign in</Link>
        <Link to="/" className="font-semibold text-ink-soft">Open RoomHisaab home</Link>
      </div>
      <p className="mt-6 rounded-2xl border border-line-light bg-surface-card2 px-4 py-3 text-xs leading-5 text-ink-faint">
        Security note: the shared Room Password alone cannot reset a personal password, because every member may know it. A Personal Recovery Key or an admin-issued targeted invite proves which member is being recovered.
      </p>
    </div>
  )
}
