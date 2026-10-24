import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, useRoomData } from '../hooks/useStore'
import { usePersistentState } from '../hooks/usePersistentDraft'
import { useTheme } from '../hooks/useTheme'
import { useAdvancedMode } from '../hooks/useAdvancedMode'
import { PageHead } from '../components/Layout'
import { SectionCard } from '../components/SectionCard'
import { Avatar } from '../components/Avatar'
import { exportJSON } from '../lib/storage'
import { expensesToCSV, settlementsToCSV, download } from '../lib/csv'
import { APP } from '../lib/constants'
import { Icon } from '../components/Icon'
import { UPI_APPS } from '../lib/upi'
import { makeRoomLoginId, normalizeLoginUsername, normalizeRoomLoginId } from '../lib/supabase'
import { cloudErrorMessage, fetchMyRecoveryKeyStatus, replaceMyRecoveryKey, type RecoveryKeyStatus } from '../lib/cloud'
import { generateRecoveryKey, recoveryKeyHint } from '../lib/recovery'
import clsx from 'clsx'

export default function Settings() {
  const nav = useNavigate()
  const { state, cloud, isCloudRoomActive, cloudLogout, cloudRefresh, cloudOpenRoom, cloudMigrateLocalRoom, updateProfile, updateMember, wipeData, resetAll, loadDemo, importState, pushToast, setCurrentMember } = useStore()
  const { room, members, expenses, settlements, me } = useRoomData()
  const { theme, setTheme } = useTheme()
  const [advancedMode, setAdvancedMode] = useAdvancedMode()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [notif, setNotif] = useState<string>(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [migOpen, setMigOpen] = usePersistentState('settings.migration.open', false)
  const [migRoomLoginId, setMigRoomLoginId] = usePersistentState('settings.migration.roomLoginId', '')
  const [migUsername, setMigUsername] = usePersistentState('settings.migration.username', '')
  // Migration passwords are never saved as drafts.
  const [migRoomPassword, setMigRoomPassword] = useState('')
  const [migRoomPassword2, setMigRoomPassword2] = useState('')
  const [migPersonalPassword, setMigPersonalPassword] = useState('')
  const [migPersonalPassword2, setMigPersonalPassword2] = useState('')
  const [migIdentity, setMigIdentity] = usePersistentState('settings.migration.identityConfirmed', false)
  const [migBackupAck, setMigBackupAck] = usePersistentState('settings.migration.backupConfirmed', false)
  const [profileNameDraft, setProfileNameDraft] = usePersistentState('settings.profileName', state.profile.name)
  const [profileNameDirty, setProfileNameDirty] = usePersistentState('settings.profileNameDirty', false)
  const [migBusy, setMigBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [migError, setMigError] = useState('')
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryKeyStatus | null>(null)
  const [recoveryKey, setRecoveryKey] = useState('')
  const [recoverySaved, setRecoverySaved] = useState(false)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')

  useEffect(() => {
    if (room && !room.cloud) setMigRoomLoginId((v) => v || makeRoomLoginId(room.name))
    if (me) setMigUsername((v) => v || normalizeLoginUsername(me.name))
  }, [room?.id, me?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profileNameDirty) setProfileNameDraft(state.profile.name)
  }, [state.profile.name, profileNameDirty, setProfileNameDraft])

  useEffect(() => {
    if (!isCloudRoomActive || !room?.id) return
    let cancelled = false
    fetchMyRecoveryKeyStatus(room.id)
      .then((status) => { if (!cancelled) setRecoveryStatus(status) })
      .catch(() => { if (!cancelled) setRecoveryStatus(null) })
    return () => { cancelled = true }
  }, [isCloudRoomActive, room?.id])

  const p = state.profile

  function saveProfileName() {
    const clean = profileNameDraft.trim()
    if (!clean) { pushToast({ message: 'Enter your name before saving.', tone: 'bad' }); return }
    updateProfile({ name: clean })
    if (me) updateMember(me.id, { name: clean })
    setProfileNameDraft(clean)
    setProfileNameDirty(false)
    pushToast({ message: 'Profile name saved.', tone: 'ok' })
  }

  async function askNotification() {
    if (typeof Notification === 'undefined') { pushToast({ message: 'Notifications are not supported in this browser.', tone: 'bad' }); return }
    const res = await Notification.requestPermission()
    setNotif(res)
    if (res === 'granted') {
      new Notification('RoomHisaab', { body: 'Settlement reminders are on.', icon: '/icon.svg' })
      pushToast({ message: 'Notifications are on.', tone: 'ok' })
    } else {
      pushToast({ message: 'Permission was not granted. Enable notifications in browser settings.', tone: 'warn' })
    }
  }

  async function handleCloudLogout() {
    await cloudLogout()
    nav('/login')
  }

  async function handleSyncNow() {
    if (syncBusy) return
    setSyncBusy(true)
    try {
      const ok = await cloudRefresh()
      pushToast(ok
        ? { message: 'Room data is up to date.', tone: 'ok' }
        : { message: 'Sync could not be completed. Check your connection and try again.', tone: 'bad' })
    } finally {
      setSyncBusy(false)
    }
  }

  async function handleGenerateRecoveryKey() {
    if (!room?.id || recoveryBusy) return
    if (recoveryStatus?.hasKey && !window.confirm('Create a new Personal Recovery Key? The previous unused key will stop working.')) return
    setRecoveryBusy(true)
    setRecoveryError('')
    setRecoveryKey('')
    setRecoverySaved(false)
    try {
      const key = generateRecoveryKey()
      const result = await replaceMyRecoveryKey(room.id, key)
      setRecoveryKey(key)
      setRecoveryStatus({
        hasKey: true,
        keyHint: recoveryKeyHint(key),
        createdAt: typeof result.created_at === 'string' ? result.created_at : new Date().toISOString(),
      })
      pushToast({ message: 'Recovery key created. Save it outside this website.', tone: 'ok' })
    } catch (error) {
      setRecoveryError(cloudErrorMessage(error))
    } finally {
      setRecoveryBusy(false)
    }
  }

  async function copyRecoveryKey() {
    try {
      await navigator.clipboard.writeText(recoveryKey)
      pushToast({ message: 'Recovery key copied. Store it in a password manager.', tone: 'ok' })
    } catch {
      pushToast({ message: 'Select and copy the key manually.', tone: 'warn' })
    }
  }

  function downloadRecoveryKey() {
    if (!recoveryKey || !room) return
    download(
      `roomhisaab-recovery-${room.loginId ?? cloud.roomLoginId ?? 'room'}.txt`,
      [
        'RoomHisaab Personal Recovery Key',
        '',
        `Room: ${room.name}`,
        `Room Login ID: ${room.loginId ?? cloud.roomLoginId ?? ''}`,
        `Username: ${cloud.username ?? ''}`,
        `Recovery key: ${recoveryKey}`,
        '',
        'Keep this private. It works once with the Room Password.',
        'After recovery, create a new key in Settings.',
      ].join('\n'),
    )
  }

  async function handleOpenCloudRoom(roomId: string) {
    const replace = !state.room || state.room.id === roomId || window.confirm('Replace the current local room on this device with the cloud room? Back up local data first if needed.')
    if (!replace) return
    const result = await cloudOpenRoom(roomId, true)
    if (result.ok) nav('/room/my')
    else pushToast({ message: result.error ?? 'Could not open the cloud room.', tone: 'bad' })
  }

  async function handleMigrateLocalRoom() {
    setMigError('')
    if (!room || room.cloud || room.demo || !me || me.isVirtual) { setMigError('A local room and your real member account are required.'); return }
    const roomLoginId = normalizeRoomLoginId(migRoomLoginId)
    const username = normalizeLoginUsername(migUsername)
    if (roomLoginId.length < 3) { setMigError('Room Login ID must contain at least 3 characters.'); return }
    if (username.length < 2) { setMigError('Enter a valid login username.'); return }
    if (migRoomPassword.length < 8 || migPersonalPassword.length < 8) { setMigError('Both passwords must contain at least 8 characters.'); return }
    if (migRoomPassword !== migRoomPassword2) { setMigError('The Room Passwords do not match.'); return }
    if (migPersonalPassword !== migPersonalPassword2) { setMigError('The personal passwords do not match.'); return }
    if (migRoomPassword === migPersonalPassword) { setMigError('Use different shared Room and personal passwords.'); return }
    if (!migIdentity) { setMigError(`Confirm that you are ${me.name}.`); return }
    if (!migBackupAck) { setMigError('Download the JSON backup and confirm.'); return }
    setMigBusy(true)
    const result = await cloudMigrateLocalRoom({
      roomLoginId,
      roomPassword: migRoomPassword,
      username,
      personalPassword: migPersonalPassword,
      currentMemberId: me.id,
    })
    setMigBusy(false)
    if (!result.ok) { setMigError(result.error ?? 'Migration failed. Your local room is unchanged.'); return }
    setMigRoomPassword(''); setMigRoomPassword2(''); setMigPersonalPassword(''); setMigPersonalPassword2('')
    pushToast({ message: 'Local room migrated to the cloud. You can now share an invite link.', tone: 'ok' })
    nav('/room/members')
  }

  async function onImportFile(f: File | undefined) {
    if (!f) return
    const text = await f.text()
    const ok = importState(text)
    if (ok) nav('/room')
  }

  return (
    <>
      <PageHead title="Settings" sub="Login safety, your profile, backup, and appearance" />

      {/* CLOUD ACCOUNT */}
      <SectionCard className="mb-4" title="Cloud account & login" sub="Your room, your member identity, and password recovery">
        {isCloudRoomActive ? (
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="icon-tile h-12 w-12"><Icon name="shield" size={23} /></span>
              <div className="flex-1 min-w-[220px]">
                <p className="font-display font-bold">{room?.name} · Cloud active</p>
                <p className="text-[12.5px] text-ink-soft mt-0.5">
                  Room Login ID <b className="font-mono text-ink">{room?.loginId ?? cloud.roomLoginId}</b> · Username <b className="font-mono text-ink">@{cloud.username}</b> · {cloud.role}
                </p>
                
              </div>
              <span className="badge-ok rounded-full px-2.5 py-1 text-[11px] font-bold">RLS LOCKED</span>
            </div>
            {cloud.error && <p className="mt-3 rounded-xl border border-overdue/30 bg-overdue/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-overdue">{cloud.error}</p>}
            <div className="grid sm:grid-cols-3 gap-2.5 mt-4">
              <button className="btn-outline" onClick={handleSyncNow} disabled={syncBusy} aria-busy={syncBusy}><Icon name="sparkles" size={17} /> {syncBusy ? 'Syncing…' : 'Sync now'}</button>
              <Link to="/room/members" className="btn-outline"><Icon name="share" size={17} /> Invite link</Link>
              <button className="btn-danger" onClick={handleCloudLogout}><Icon name="x" size={17} /> Sign out</button>
            </div>
            <div className="mt-4 rounded-3xl border border-primary/25 bg-primary/5 p-4">
              <div className="flex flex-wrap items-start gap-3">
                <span className="icon-tile h-11 w-11"><Icon name="shield" size={21} /></span>
                <div className="min-w-[220px] flex-1">
                  <p className="font-display font-bold">Personal Recovery Key</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">
                    {recoveryStatus?.hasKey
                      ? `Active key ending in ${recoveryStatus.keyHint ?? '••••'}${recoveryStatus.createdAt ? ` · created ${new Date(recoveryStatus.createdAt).toLocaleDateString()}` : ''}.`
                      : 'Create one now so you can return to this same member and room if you forget your personal password.'}
                  </p>
                </div>
                <button type="button" className="btn-primary !px-4" onClick={handleGenerateRecoveryKey} disabled={recoveryBusy} aria-busy={recoveryBusy}>
                  {recoveryBusy ? 'Creating…' : recoveryStatus?.hasKey ? 'Replace key' : 'Create recovery key'}
                </button>
              </div>
              {recoveryError && <p className="mt-3 rounded-xl border border-overdue/30 bg-overdue/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-overdue" role="alert">{recoveryError}</p>}
              {recoveryKey && (
                <div className="mt-4 rounded-2xl border border-line-light bg-surface-card p-4">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-ink-soft">Save this key now — it is shown only once</p>
                  <p className="mt-2 break-all rounded-xl bg-primary/10 px-3 py-3 font-mono text-[15px] font-bold tracking-wide text-ink" aria-label="Personal Recovery Key">{recoveryKey}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button type="button" className="btn-outline" onClick={copyRecoveryKey}>Copy key</button>
                    <button type="button" className="btn-outline" onClick={downloadRecoveryKey}>Download key file</button>
                  </div>
                  <label className="mt-3 flex cursor-pointer items-start gap-3 text-[12.5px] leading-relaxed text-ink-soft">
                    <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary" checked={recoverySaved} onChange={(e) => setRecoverySaved(e.target.checked)} />
                    <span>I saved this key outside RoomHisaab. It works once with the Room Password, and the server stores only its protected hash.</span>
                  </label>
                  <button type="button" className="btn-ghost mt-2" disabled={!recoverySaved} onClick={() => setRecoveryKey('')}>Hide key</button>
                </div>
              )}
            </div>
            <p className="text-[12px] text-ink-soft leading-relaxed mt-3">Signing out removes the cloud snapshot from this device. Server data remains safe and other members cannot edit your entries.</p>
          </div>
        ) : cloud.availableRooms.length > 0 ? (
          <div>
            <p className="text-[13.5px] text-ink-soft">Your cloud rooms:</p>
            <div className="space-y-2 mt-3">
              {cloud.availableRooms.map((r) => (
                <div key={r.roomId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line-light p-3.5">
                  <span className="icon-tile h-10 w-10"><Icon name="home" size={19} /></span>
                  <div className="flex-1 min-w-[180px]"><p className="font-display font-bold text-[14px]">{r.roomName}</p><p className="text-[11.5px] text-ink-soft font-mono">{r.roomLoginId} · @{r.username}</p></div>
                  <button className="btn-primary !px-3.5" onClick={() => handleOpenCloudRoom(r.roomId)}>Open</button>
                </div>
              ))}
            </div>
            <button className="btn-ghost mt-3" onClick={handleCloudLogout}>Sign out of cloud</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="icon-tile h-12 w-12"><Icon name="shield" size={23} /></span>
            <div className="flex-1 min-w-[220px]">
              <p className="font-display font-bold">{cloud.configured ? 'Not signed in to cloud' : 'Cloud is not configured'}</p>
              <p className="text-[12.5px] text-ink-soft">{cloud.configured ? 'Create a cloud room, join an invite or sign in with your Room Login ID.' : 'Set the Supabase URL and publishable key in the deployment.'}</p>
            </div>
            <div className="flex gap-2">
              <Link to="/login" className="btn-primary !px-3.5">Sign in</Link>
              <Link to="/onboarding" className="btn-outline !px-3.5">Cloud room</Link>
            </div>
          </div>
        )}
      </SectionCard>

      {room && !room.cloud && !room.demo && !isCloudRoomActive && cloud.configured && (
        <SectionCard className="mb-4" title="Move this local room to the cloud" sub="Existing data will be saved in Supabase for member logins">
          <div className="flex flex-wrap items-center gap-3">
            <span className="icon-tile h-12 w-12"><Icon name="sparkles" size={23} /></span>
            <div className="flex-1 min-w-[230px]">
              <p className="font-display font-bold">{room.name} is currently stored only in this browser</p>
              <p className="text-[12.5px] text-ink-soft mt-0.5">{members.length} members · {expenses.filter((e) => !e.deleted).length} expenses · {settlements.length} settlements · {state.recurring.length} recurring bills will be migrated.</p>
              <p className="text-[12px] text-ink-soft mt-1">You will create the owner login as <b className="text-ink">{me?.name ?? 'current member'}</b>. Other members can claim their accounts with an invite and the Room Password.</p>
            </div>
            <button type="button" className="btn-primary !px-4" onClick={() => setMigOpen((v) => !v)} aria-expanded={migOpen}>
              <Icon name="shield" size={18} /> {migOpen ? 'Hide form' : 'Start cloud migration'}
            </button>
          </div>

          {migOpen && (
            <div className="mt-5 border-t border-line-light pt-5">
              <div className="grid sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="label" htmlFor="mig-room-login">Room Login ID (used by all members)</label>
                  <input id="mig-room-login" className="input font-mono" value={migRoomLoginId} onChange={(e) => setMigRoomLoginId(normalizeRoomLoginId(e.target.value))} autoComplete="off" placeholder="Example: shanti-nivas-402" />
                </div>
                <div>
                  <label className="label" htmlFor="mig-username">Your username</label>
                  <input id="mig-username" className="input font-mono" value={migUsername} onChange={(e) => setMigUsername(normalizeLoginUsername(e.target.value))} autoComplete="username" placeholder="Example: Amit" />
                </div>
                <div>
                  <label className="label" htmlFor="mig-room-pass">Shared Room Password</label>
                  <input id="mig-room-pass" className="input" type="password" value={migRoomPassword} onChange={(e) => setMigRoomPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
                </div>
                <div>
                  <label className="label" htmlFor="mig-room-pass2">Confirm Room Password</label>
                  <input id="mig-room-pass2" className="input" type="password" value={migRoomPassword2} onChange={(e) => setMigRoomPassword2(e.target.value)} autoComplete="new-password" placeholder="Repeat Room Password" />
                </div>
                <div>
                  <label className="label" htmlFor="mig-personal-pass">Your personal password</label>
                  <input id="mig-personal-pass" className="input" type="password" value={migPersonalPassword} onChange={(e) => setMigPersonalPassword(e.target.value)} autoComplete="new-password" placeholder="Different from Room Password" />
                </div>
                <div>
                  <label className="label" htmlFor="mig-personal-pass2">Confirm personal password</label>
                  <input id="mig-personal-pass2" className="input" type="password" value={migPersonalPassword2} onChange={(e) => setMigPersonalPassword2(e.target.value)} autoComplete="new-password" placeholder="Repeat personal password" />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-3.5 text-[12.5px] text-ink-soft leading-relaxed">
                <b className="text-ink">Security:</b> The Room Password is only for joining. Every member has a separate personal password and cannot edit another member’s expenses.
              </div>

              <div className="mt-4 space-y-2.5">
                <label className="flex items-start gap-2.5 text-[13px] text-ink-soft cursor-pointer">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#5046C8]" checked={migIdentity} onChange={(e) => setMigIdentity(e.target.checked)} />
                  <span>I confirm that I am <b className="text-ink">{me?.name}</b>.</span>
                </label>
                <label className="flex items-start gap-2.5 text-[13px] text-ink-soft cursor-pointer">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#5046C8]" checked={migBackupAck} onChange={(e) => setMigBackupAck(e.target.checked)} />
                  <span>I have downloaded a local JSON backup.</span>
                </label>
              </div>

              {migError && <p className="mt-3 rounded-xl border border-overdue/30 bg-overdue/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-overdue" role="alert">{migError}</p>}
              <div className="grid sm:grid-cols-[1fr_1.4fr] gap-2.5 mt-4">
                <button type="button" className="btn-outline" onClick={() => { download(`roomhisaab-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJSON(state), 'application/json'); setMigBackupAck(true); pushToast({ message: 'Backup downloaded.', tone: 'ok' }) }}>
                  <Icon name="download" size={17} /> Download backup first
                </button>
                <button type="button" className="btn-primary" disabled={migBusy} onClick={handleMigrateLocalRoom}>
                  <Icon name="sparkles" size={18} /> {migBusy ? 'Migrating…' : 'Save this room to the cloud'}
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* PROFILE */}
      <SectionCard className="mb-4" title="Profile" sub="The name and preferences used for you in this room">
        <div className="flex items-center gap-3 mb-4">
          {me ? <Avatar name={me.name} color={me.color} size={54} /> :
            <span className="grid place-items-center h-[54px] w-[54px] rounded-full bg-primary/15 text-2xl" aria-hidden="true">👋</span>}
          <div className="flex-1 min-w-0">
            <label className="label" htmlFor="my-name">My name</label>
            <div className="flex gap-2">
              <input id="my-name" className="input flex-1" value={profileNameDraft} placeholder="Enter your name"
                onChange={(e) => { setProfileNameDraft(e.target.value); setProfileNameDirty(true) }} />
              <button type="button" className="btn-primary !px-4" onClick={saveProfileName} disabled={!profileNameDirty}>Save</button>
            </div>
            {profileNameDirty && <p className="text-[11.5px] text-ink-faint mt-1.5">Your typed name is kept on this device until you save it.</p>}
          </div>
        </div>
        {members.filter((m) => !m.isVirtual).length > 0 && (
          <div className="mb-4">
            <span className="label">My account</span>
            {isCloudRoomActive ? (
              <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-primary/20 bg-primary/5 px-3.5 py-3">
                <Icon name="shield" size={18} className="text-primary" />
                <p className="flex-1 min-w-[220px] text-[12.5px] text-ink-soft"><b className="text-ink">@{cloud.username}</b> is your signed-in cloud identity. You cannot switch to another member’s dashboard.</p>
                <Link to="/room/my" className="btn-primary !px-3.5 !py-2 !text-[13px]"><Icon name="users" size={16} /> My Dashboard</Link>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {members.filter((m) => !m.isVirtual).map((m) => (
                  <button key={m.id} type="button" onClick={() => { if (setCurrentMember(m.id)) pushToast({ message: `${m.name} is now the active member.`, tone: 'ok' }) }}
                    className={me?.id === m.id ? 'chip-on' : 'chip-off'} aria-pressed={me?.id === m.id}>
                    <Avatar name={m.name} color={m.color} size={20} />{m.name}
                  </button>
                ))}
                <Link to="/room/my" className="btn-ghost !px-3 !py-2 !text-[13px]"><Icon name="users" size={16} /> My Dashboard</Link>
              </div>
            )}
          </div>
        )}
        <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-3.5 flex flex-wrap items-center gap-3">
          <span className="icon-tile h-11 w-11"><Icon name="qr" size={21} /></span>
          <div className="flex-1 min-w-[210px]">
            <p className="font-display font-bold text-[14px]">My payment profile</p>
            <p className="text-[12.5px] text-ink-soft">{me?.upiId ? `${me.upiId} · ${UPI_APPS.find((a) => a.id === (me.preferredUpiApp ?? 'any'))?.label}` : 'Add a UPI ID for QR payments'}</p>
          </div>
          <Link to="/room/members" className="btn-outline !px-3.5 !py-2 !text-[13px]">Manage profile</Link>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <span className="label">Theme</span>
            <div className="flex gap-2">
              {([['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTheme(k)} className={theme === k ? 'chip-on flex-1 justify-center' : 'chip-off flex-1 justify-center'} aria-pressed={theme === k}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Voice language</span>
            <div className="flex gap-2">
              {([['en', 'English'], ['hi', 'Hindi']] as const).map(([k, l]) => (
                <button key={k} onClick={() => updateProfile({ language: k })}
                  className={p.language === k ? 'chip-on flex-1 justify-center' : 'chip-off flex-1 justify-center'} aria-pressed={p.language === k}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <label className="flex items-start gap-2.5 mt-4 text-[13.5px] text-ink-soft cursor-pointer">
          <input type="checkbox" checked={p.reduceMotion} onChange={(e) => updateProfile({ reduceMotion: e.target.checked })}
            className="mt-0.5 h-5 w-5 rounded accent-primary" />
          <span><b className="text-ink">Reduce motion</b> — minimize animations for accessibility.</span>
        </label>
      </SectionCard>

      <SectionCard className="mb-4" title="Interface preferences" sub="Choose a simpler menu or show every tool">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary" checked={advancedMode} onChange={(e) => setAdvancedMode(e.target.checked)} aria-label="Advanced mode" />
          <span className="flex-1"><b className="text-ink">Advanced mode</b><span className="mt-1 block text-[12.5px] leading-relaxed text-ink-soft">{advancedMode ? 'On — show reports, history, automation, auto capture and all navigation options.' : 'Off — keep the menu focused on Home, Add, Payments (for shared rooms), People and Settings.'}</span></span>
          <span className={advancedMode ? 'chip-on' : 'chip-off'} aria-hidden="true">{advancedMode ? 'On' : 'Off'}</span>
        </label>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">Your theme, language and reduced-motion choices are available above. These preferences stay on this device.</p>
      </SectionCard>

      {/* NOTIFICATION + PWA */}
      <SectionCard className="mb-4" title="Reminders and app" sub="Settlement reminders">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-[200px]">
            <p className="font-semibold text-[14.5px]">Browser notifications</p>
            <p className="text-[12.5px] text-ink-soft">
              Status: <b className={clsx(notif === 'granted' ? 'text-moneyin' : notif === 'denied' ? 'text-overdue' : 'text-pending')}>{notif}</b>
            </p>
          </div>
          <button className="btn-primary !px-4" onClick={askNotification} disabled={notif === 'granted'}>
            {notif === 'granted' ? 'Enabled' : 'Enable'}
          </button>
        </div>
        <div className="rounded-xl bg-primary/10 border border-primary/20 p-3.5 text-[13px] text-ink-soft">
          <p className="font-semibold text-ink mb-1">Install on your phone</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>In Chrome, open the <b>⋮ menu</b> and choose <b>Install app</b> or <b>Add to Home screen</b>.</li>
            <li>On iPhone, use Share → <b>Add to Home Screen</b>.</li>
            <li>Open RoomHisaab from the home-screen icon after installation.</li>
          </ol>
        </div>
      </SectionCard>

      {/* DATA */}
      <SectionCard className="mb-4" title="Data backup and export"
        sub={`${expenses.filter(e => !e.deleted).length} expenses · ${settlements.length} settlements · ${members.length} members`}>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <button className="btn-primary" onClick={() => {
            download(`roomhisaab-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJSON(state), 'application/json')
            pushToast({ message: 'Backup downloaded. Keep the file safe.', tone: 'ok' })
          }}><Icon name="download" size={17} /> Backup (JSON) download</button>

          <button className="btn-outline" onClick={() => fileRef.current?.click()}><Icon name="clipboard" size={17} /> Backup restore (Import)</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => onImportFile(e.target.files?.[0])} />

          <button className="btn-outline" onClick={() => {
            download(`roomhisaab-expenses.csv`, expensesToCSV(expenses, members), 'text/csv;charset=utf-8')
            download(`roomhisaab-settlements.csv`, settlementsToCSV(settlements, members), 'text/csv;charset=utf-8')
            pushToast({ message: 'CSV files downloaded.', tone: 'ok' })
          }}><Icon name="download" size={17} /> Excel CSV (expenses + settlements)</button>

          <button className="btn-outline" onClick={() => window.print()}><Icon name="receipt" size={17} /> Print / PDF statement</button>

          {!isCloudRoomActive && <button className="btn-outline" onClick={() => { void loadDemo().then((opened) => { if (opened) nav('/room') }) }}><Icon name="sparkles" size={17} /> Demo room (sample only)</button>}
          <Link to="/onboarding" className="btn-outline"><Icon name="home" size={17} /> Set up a new room</Link>
        </div>

        <div className="mt-4 rounded-xl bg-primary/10 border border-primary/20 p-3.5 text-[13px] text-ink-soft space-y-1.5">
          <p className="font-semibold text-ink">Privacy</p>
          <p>• {isCloudRoomActive ? <>Cloud data is stored in <b>Supabase</b>, with a fast local snapshot on this device. Members can view room activity, but server security allows each member to change only their own expenses and profile.</> : <>Local room data stays in this browser. Cloud rooms also sync with Supabase.</>}</p>
          <p>• Bank SMS and bill photos are processed on this device. Raw SMS text is not uploaded with cloud expenses.</p>
          <p>• Use <b>Members & UPI → Cloud Join Link</b> to invite members, and share the Room Password separately.</p>
          <p>• Keep regular backups. Signing out removes the device snapshot; cloud data returns after sign-in.</p>
          <p>• Room: <b>{room?.name ?? 'none'}</b> · Storage key: <code className="font-mono text-[12px]">{APP.storageKey}</code></p>
        </div>
      </SectionCard>

      {/* DANGER ZONE */}
      <SectionCard className="border-overdue/30" title="Danger zone" sub="These actions cannot be undone. Download a backup first.">
        <div className="grid sm:grid-cols-2 gap-2.5">
          <button className="btn-outline hover:!border-pending hover:!text-pending" onClick={() => {
            if (window.confirm(isCloudRoomActive ? 'Sign out and reset this device? Cloud data will remain on the server.' : 'Reset the room and all local data? Download a backup first if needed.')) {
              resetAll(); pushToast({ message: isCloudRoomActive ? 'This device was reset. Cloud data remains on the server.' : 'Local data was reset.', tone: 'warn' }); nav('/onboarding')
            }
          }}>↺ {isCloudRoomActive ? 'Sign out and reset device' : 'Reset local room'}</button>

          {!confirmWipe ? (
            <button className="btn-danger" onClick={() => setConfirmWipe(true)}><Icon name="x" size={17} /> Delete all local data</button>
          ) : (
            <div className="flex gap-2">
              <button className="btn-outline flex-1" onClick={() => setConfirmWipe(false)}>Cancel</button>
              <button className="btn-danger flex-[2]" onClick={() => { wipeData(); setConfirmWipe(false); nav('/onboarding') }}>
                Delete permanently
              </button>
            </div>
          )}
        </div>
        <p className="text-[12px] text-ink-soft mt-3">Delete permanently removes RoomHisaab data from this browser.</p>
      </SectionCard>

      <p className="text-center text-[12px] text-ink-faint mt-5">
        {APP.name} · {APP.tagline}
      </p>
    </>
  )
}
