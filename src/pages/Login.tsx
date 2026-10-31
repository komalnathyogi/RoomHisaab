import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { usePersistentState } from '../hooks/usePersistentDraft'
import { APP } from '../lib/constants'
import { Icon } from '../components/Icon'
import { getRememberDevicePreference, loadLastLoginHint } from '../lib/authPersistence'

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { state, cloud, cloudLogin, cloudOpenRoom, isCloudRoomActive, pushToast } = useStore()
  const [lastHint] = useState(loadLastLoginHint)
  const [roomLoginId, setRoomLoginId] = usePersistentState('login.roomId', lastHint.roomLoginId)
  const [username, setUsername] = usePersistentState('login.username', lastHint.username)
  // Password is never stored as a draft.
  const [password, setPassword] = useState('')
  const [rememberDevice, setRememberDevice] = useState(() => getRememberDevicePreference())
  const [replaceLocal, setReplaceLocal] = usePersistentState('login.replaceLocal', false)

  useEffect(() => {
    const roomParam = params.get('room')
    const usernameParam = params.get('username')
    if (roomParam) setRoomLoginId(roomParam)
    if (usernameParam) setUsername(usernameParam)
    // Apply explicit link values once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function openSavedRoom(roomId: string) {
    setError('')
    if (state.room && !state.room.demo && state.room.id !== roomId && !replaceLocal) {
      setError('Confirm the local-room option below before opening the saved cloud room.')
      return
    }
    setBusy(true)
    const result = await cloudOpenRoom(roomId, true)
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'The saved login could not open the room. Sign in with your password.')
      return
    }
    pushToast({ message: 'Dashboard opened with your saved login.', tone: 'ok' })
    navigate('/room/my')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!roomLoginId.trim() || !username.trim() || !password) {
      setError('Enter the Room Login ID, username and personal password.')
      return
    }
    setBusy(true)
    const result = await cloudLogin(roomLoginId, username, password, state.room?.demo || replaceLocal, rememberDevice)
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'Sign-in failed.')
      return
    }
    pushToast({ message: 'Welcome back. Your cloud room is open.', tone: 'ok' })
    navigate('/room/my')
  }

  return (
    <div className="min-h-dvh bg-surface-page text-ink">
      <header className="border-b border-line-light bg-surface-page/90 sticky top-0 z-30 sm:backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-[64px] flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid place-items-center h-10 w-10 rounded-2xl bg-primary-solid text-primary-on shadow-fab"><Icon name="rupee" size={21} /></span>
            <span className="font-display font-bold text-[17px]">{APP.name}</span>
          </Link>
          <span className="flex-1" />
          <Link to="/onboarding" className="btn-outline !hidden !px-3.5 !py-2 !text-[13px] whitespace-nowrap min-[560px]:!inline-flex">New room</Link>
          <Link to="/join" className="btn-primary !px-3.5 !py-2 !text-[13px] whitespace-nowrap">Join room</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-5 sm:py-8 pb-14">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_440px] gap-6 items-start">
          <section className="relative order-2 overflow-hidden rounded-[28px] bg-[#15172F] text-[#F1F0FF] border border-white/10 shadow-lift3d p-6 sm:p-8 lg:order-1">
            <div className="absolute -right-20 -top-24 hidden h-64 w-64 rounded-full bg-[#4F46C8]/35 blur-3xl sm:block" aria-hidden="true" />
            <div className="absolute -left-16 bottom-0 hidden h-44 w-44 rounded-full bg-[#DE7726]/20 blur-3xl sm:block" aria-hidden="true" />
            <div className="relative">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#A8A0FF]">Cloud login · open an existing room</p>
              <h1 className="text-[30px] sm:text-[38px] text-white leading-tight mt-2">Open your same room<br />on any device.</h1>
              <p className="text-[#C5C3E1] text-[15px] leading-relaxed mt-4 max-w-xl">
                Sign in to see the room notebook and your own dashboard. Everyone can view room activity, but each member can change only their own entries and profile.
              </p>

              <div className="grid sm:grid-cols-3 gap-3 mt-7">
                <Info icon="home" title="1 · Room Login ID" body="Same for everyone in this room. Ask the room creator if you do not have it." />
                <Info icon="users" title="2 · Your username" body="The personal login name you created when joining. It may be shorter than your display name." />
                <Info icon="shield" title="3 · Personal password" body="Only you should know this. It is not the shared Room Password and never a UPI PIN." />
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 mt-6 text-[13px] leading-relaxed text-[#C5C3E1]">
                <p className="font-display font-bold text-white flex items-center gap-2"><Icon name="check" size={18} className="text-[#A8A0FF]" /> When is the Room Password needed?</p>
                <p className="mt-1.5">Use the shared Room Password only when joining through an invite. Daily sign-in uses your personal password.</p>
              </div>
            </div>
          </section>

          <section className="card order-1 p-5 shadow-lift3d sm:p-6 lg:order-2">
            <span className="icon-tile h-12 w-12"><Icon name="shield" size={23} /></span>
            <h2 className="text-[24px] mt-3">Member login</h2>
            <p className="text-[13.5px] text-ink-soft mt-1">Sign in on any device to open the same cloud room.</p>

            {!cloud.configured && (
              <p className="mt-4 rounded-xl border border-overdue/30 bg-overdue/10 px-3.5 py-2.5 text-[13px] font-semibold text-overdue" role="alert">
                Supabase is not configured. Set VITE_SUPABASE_URL and the publishable key in the deployment.
              </p>
            )}

            {isCloudRoomActive && (
              <div className="mt-4 rounded-2xl border border-moneyin/30 bg-moneyin/10 p-3.5">
                <p className="text-[13.5px] font-display font-bold text-ink flex items-center gap-2"><Icon name="check" size={17} /> You are already signed in</p>
                <p className="text-[12.5px] text-ink-soft mt-1">@{cloud.username} · {state.room?.name}. You do not need to enter your password again.</p>
                <Link to="/room/my" className="btn-primary w-full mt-3 !py-2.5">Open Home</Link>
              </div>
            )}

            {!isCloudRoomActive && cloud.userId && cloud.availableRooms.length > 0 && (
              <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-3.5">
                <p className="text-[13.5px] font-display font-bold text-ink flex items-center gap-2"><Icon name="shield" size={17} /> Saved login found</p>
                <p className="text-[12.5px] text-ink-soft mt-1">Choose a room to continue without entering your password.</p>
                <div className="space-y-2 mt-3">
                  {cloud.availableRooms.map((r) => (
                    <button key={r.roomId} type="button" className="btn-outline w-full justify-between !py-2.5" disabled={busy} onClick={() => openSavedRoom(r.roomId)}>
                      <span>{r.roomName}</span>
                      <span className="font-mono text-[11px]">@{r.username}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4 mt-5">
              <div>
                <label className="label" htmlFor="login-room-id">Room Login ID *</label>
                <input id="login-room-id" className="input font-mono" value={roomLoginId} onChange={(e) => setRoomLoginId(e.target.value.toLowerCase())}
                  placeholder="Example: shanti-niwas-204-ab12c" autoComplete="organization" autoCapitalize="off" spellCheck={false} required />
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">This tells RoomHisaab which room to open. It is shared by members of the same room.</p>
              </div>
              <div>
                <label className="label" htmlFor="login-username">Your username *</label>
                <input id="login-username" className="input font-mono" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="Example: amitkumar" autoComplete="username" autoCapitalize="off" spellCheck={false} required />
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">This tells RoomHisaab which member you are. Use the username created during joining, without spaces.</p>
              </div>
              <div>
                <label className="label" htmlFor="login-password">Your personal password *</label>
                <input id="login-password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password" required />
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <p className="text-[11.5px] text-ink-faint">Never enter a UPI PIN on this website.</p>
                  <Link to="/recover" className="shrink-0 text-[12.5px] font-bold text-primary hover:underline">Forgot password?</Link>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5 cursor-pointer text-[12.5px] text-ink-soft">
                <input type="checkbox" checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)} className="mt-0.5 h-5 w-5 rounded accent-primary" />
                <span>
                  <b className="text-ink">Remember sign-in on this device</b><br />
                  Stay signed in after closing the browser. Only the Room ID and username are remembered; <b className="text-ink">your password is never saved</b>. Turn this off on a shared computer.
                </span>
              </label>

              {state.room && !state.room.demo && (
                <label className="flex items-start gap-3 rounded-2xl border border-pending/35 bg-pending/10 p-3.5 cursor-pointer text-[12.5px] text-ink-soft">
                  <input type="checkbox" checked={replaceLocal} onChange={(e) => setReplaceLocal(e.target.checked)} className="mt-0.5 h-5 w-5 rounded accent-primary" />
                  <span><b className="text-ink">“{state.room.name}” is open on this device.</b> Opening the cloud room will replace the current view. Back up local data first if needed. I understand.</span>
                </label>
              )}

              {error && <p className="rounded-xl border border-overdue/30 bg-overdue/10 px-3.5 py-2.5 text-[13px] font-semibold text-overdue" role="alert">{error}</p>}

              <button type="submit" className="btn-primary w-full !py-3.5 !text-[16px]" disabled={busy || !cloud.configured}>
                <Icon name="check" /> {busy ? 'Signing in…' : 'Open Home'}
              </button>
            </form>

            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <Link to="/join" className="btn-outline !px-3"><Icon name="share" size={17} /> Join with invite</Link>
              <Link to="/onboarding" className="btn-ghost !px-3"><Icon name="home" size={17} /> Create room</Link>
            </div>

            <div className="mt-5 rounded-2xl bg-primary/5 border border-primary/20 p-3.5 text-[12.5px] text-ink-soft leading-relaxed">
              <b className="text-ink">Forgot your password?</b> Use a Personal Recovery Key, an admin recovery invite, or a saved backup to reconnect to the same member and room.
              <Link to="/recover" className="btn-outline w-full mt-3 !py-2.5">Open account recovery</Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function Info({ icon, title, body }: { icon: 'home' | 'users' | 'shield'; title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <Icon name={icon} size={21} className="text-[#A8A0FF]" />
      <p className="font-display font-bold text-white text-[14px] mt-2">{title}</p>
      <p className="text-[12px] text-[#C5C3E1] mt-0.5">{body}</p>
    </div>
  )
}
