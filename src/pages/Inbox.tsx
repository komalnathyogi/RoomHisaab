import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import { useStore, useRoomData } from '../hooks/useStore'
import { loadDraft, usePersistentState } from '../hooks/usePersistentDraft'
import { SAMPLE_SMS, detectMerchant } from '../lib/smsParser'
import { parseStatementCSV, SAMPLE_STATEMENT_CSV } from '../lib/statement'
import { CATEGORIES, catOf } from '../lib/constants'
import { formatINR } from '../lib/money'
import { PageHead } from '../components/Layout'
import { EmptyState } from '../components/EmptyState'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { VOICE_SAMPLES, parseVoiceExpense } from '../lib/voice'
import type { CategoryId } from '../lib/types'

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike
function speechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/**
 * ⭐ AUTO CAPTURE — manual entry kam se kam karne wali screen.
 * 5 automatic raaste: Voice, SMS Share (PWA), Clipboard,
 * Bank statement CSV (bulk), Paste (multi-SMS)
 * Sab parsing browser me — bank data kahin upload nahi hota.
 */
export default function Inbox() {
  const { state, ready, ingestSMS, ingestParsedBatch, acceptInboxItem, ignoreInboxItem, acceptAllHighConfidence, pushToast, isCloudRoomActive } = useStore()
  const { members, me } = useRoomData()
  const [text, setText] = useState('')
  const [voiceOpen, setVoiceOpen] = usePersistentState<boolean>('inbox.voice.open', () => {
    try { return new URLSearchParams(window.location.search).get('voice') === '1' } catch { return false }
  })
  const [voiceText, setVoiceText] = usePersistentState('inbox.voice.text', '')
  const [voiceLang, setVoiceLang] = usePersistentState<'en-IN' | 'hi-IN'>('inbox.voice.language', 'en-IN')
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [voiceSupported] = useState(() => !!speechRecognitionCtor())
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceRef = useRef<HTMLElement | null>(null)
  const [fixing, setFixing] = usePersistentState<string | null>('inbox.fix.id', null)
  const [fixCat, setFixCat] = usePersistentState<CategoryId>('inbox.fix.category', 'other')
  const [fixPayer, setFixPayer] = usePersistentState('inbox.fix.payer', '')
  const [autoConfirm, setAutoConfirm] = useState<boolean>(() => {
    try { return window.localStorage.getItem('roomhisaab.autoConfirm') === '1' } catch { return false }
  })
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const sharedHandled = useRef(false)
  const autoConfirmRef = useRef(autoConfirm)
  useEffect(() => { autoConfirmRef.current = autoConfirm }, [autoConfirm])
  useEffect(() => () => { recognitionRef.current?.abort() }, [])
  useEffect(() => {
    if (ready && loadDraft<'en-IN' | 'hi-IN' | null>('inbox.voice.language', null) === null) {
      setVoiceLang(state.profile.language === 'hi' ? 'hi-IN' : 'en-IN')
    }
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!voiceOpen) return
    const t = window.setTimeout(() => voiceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 320)
    return () => window.clearTimeout(t)
  }, [voiceOpen])

  const items = useMemo(() => state.inbox.filter((i) => i.status === 'new'), [state.inbox])
  const doneCount = state.inbox.filter((i) => i.status === 'confirmed').length
  const highConf = items.filter((i) => i.confidence >= 90).length
  const voiceParsed = useMemo(() => parseVoiceExpense(voiceText, members, me?.id), [voiceText, members, me?.id])

  // Android Messages/UPI app → Share → RoomHisaab (manifest share_target)
  useEffect(() => {
    if (sharedHandled.current) return
    const q = new URLSearchParams(window.location.search)
    const shared = [q.get('text'), q.get('title'), q.get('url')].filter(Boolean).join(' ').trim()
    if (!shared) return
    sharedHandled.current = true
    window.history.replaceState(null, '', window.location.pathname)
    ingestText(shared, 'Shared SMS')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function maybeAutoConfirm(ids: string[]) {
    if (!autoConfirmRef.current) return
    // state update ke baad accept karna hai
    window.setTimeout(() => {
      let n = 0
      for (const id of ids) {
        const item = state.inbox.find((i) => i.id === id) // state may be stale; confidence ids were pre-filtered by caller
        void item
        acceptInboxItem(id); n++
      }
      if (n) pushToast({ message: `${n} item(s) were auto-confirmed at 90%+ confidence.`, tone: 'ok' })
    }, 80)
  }

  function ingestText(rawText: string, label = 'SMS', multi = false) {
    const source = rawText.trim()
    if (!source) { pushToast({ message: 'Paste an SMS first.', tone: 'bad' }); taRef.current?.focus(); return 0 }
    const chunks = multi
      ? source.split(/\n{2,}|(?=\b(?:SBI|HDFC|ICICI|AXIS|Kotak|BOB|PNB|Paytm|PhonePe|Google|Amazon)\b)/i).map((c) => c.trim()).filter(Boolean)
      : [source]
    let ok = 0
    const highIds: string[] = []
    for (const c of chunks) {
      const res = ingestSMS(c)
      if (res.item) {
        ok++
        if (res.item.confidence >= 90) highIds.push(res.item.id)
      } else if (res.error && chunks.length === 1) {
        pushToast({ message: res.error, tone: 'warn' })
      }
    }
    if (ok) {
      pushToast({ message: `${label}: ${ok} expense captured.`, tone: 'ok' })
      maybeAutoConfirm(highIds)
      return ok
    }
    if (chunks.length > 1) pushToast({ message: 'No valid bank SMS was found. Paste the original message text.', tone: 'warn' })
    return 0
  }

  function startListening() {
    const Ctor = speechRecognitionCtor()
    if (!Ctor) {
      setVoiceError('Speech recognition is not supported in this browser. Type the sentence below, or use Chrome on Android.')
      return
    }
    try { recognitionRef.current?.abort() } catch { /* noop */ }
    const rec = new Ctor()
    recognitionRef.current = rec
    rec.lang = voiceLang
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    rec.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i]?.[0]?.transcript ?? ''
      setVoiceText(transcript.trim())
      setVoiceError('')
    }
    rec.onerror = (event) => {
      setListening(false)
      setVoiceError(event.error === 'not-allowed'
        ? 'Microphone permission was denied. Allow microphone access in the browser.'
        : 'The speech was not clear. Please try again.')
    }
    rec.onend = () => setListening(false)
    setVoiceError('')
    setListening(true)
    try { rec.start() } catch { setListening(false); setVoiceError('The microphone could not start. Please try again.') }
  }

  function stopListening() {
    try { recognitionRef.current?.stop() } catch { /* noop */ }
    setListening(false)
  }

  function addVoiceExpense() {
    if (!voiceParsed) {
      pushToast({ message: 'Say the payer, amount and item. Example: “Amit paid five hundred rupees for groceries.”', tone: 'warn' })
      return
    }
    const { added, duplicates } = ingestParsedBatch([{ parsed: voiceParsed, rawText: `VOICE: ${voiceText.trim()}`, source: 'voice' }])
    if (added) {
      pushToast({ message: `Voice expense ready: ${voiceParsed.merchant} · ${formatINR(voiceParsed.amountPaise)}. Review and confirm it below.`, tone: 'ok' })
      setVoiceText('')
    } else if (duplicates) {
      pushToast({ message: 'This voice expense is already in the review queue.', tone: 'warn' })
    }
  }

  async function fromClipboard() {
    try {
      if (!navigator.clipboard?.readText) throw new Error('unsupported')
      const clip = await navigator.clipboard.readText()
      if (!clip.trim()) { pushToast({ message: 'The clipboard is empty. Copy an SMS first.', tone: 'warn' }); return }
      setText(clip)
      ingestText(clip, 'Clipboard', true)
    } catch {
      pushToast({ message: 'Clipboard access was denied. Paste the text manually.', tone: 'warn' })
      taRef.current?.focus()
    }
  }

  async function onStatementFile(file: File | undefined) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { pushToast({ message: 'The CSV is larger than 5 MB. Export a smaller date range.', tone: 'bad' }); return }
    const csv = await file.text()
    const result = parseStatementCSV(csv)
    if (result.error) { pushToast({ message: result.error, tone: 'bad' }); return }
    if (!result.transactions.length) { pushToast({ message: 'No debit expenses were found in the CSV.', tone: 'warn' }); return }
    const batch = result.transactions.map((parsed) => ({
      parsed,
      rawText: `STATEMENT ${parsed.merchant} Rs ${(parsed.amountPaise / 100).toFixed(2)}${parsed.date ? ` ${new Date(parsed.date).toISOString().slice(0, 10)}` : ''}`,
      source: 'sms' as const,
    }))
    const { added, duplicates } = ingestParsedBatch(batch)
    pushToast({
      message: `Statement: ${added} expenses imported${duplicates ? ` · ${duplicates} duplicates skipped` : ''}${result.creditsSkipped ? ` · ${result.creditsSkipped} credits skipped` : ''}`,
      tone: 'ok',
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  function loadSampleStatement() {
    const result = parseStatementCSV(SAMPLE_STATEMENT_CSV)
    const { added, duplicates } = ingestParsedBatch(result.transactions.map((parsed) => ({
      parsed,
      rawText: `SAMPLE STATEMENT ${parsed.merchant} Rs ${(parsed.amountPaise / 100).toFixed(2)}`,
      source: 'sms' as const,
    })))
    pushToast({ message: `Sample statement: ${added} items imported${duplicates ? `, ${duplicates} duplicate` : ''}`, tone: 'ok' })
  }

  function openFix(id: string) {
    const it = state.inbox.find((i) => i.id === id)
    if (!it) return
    const mer = it.parsed ? detectMerchant(it.parsed.merchant) : null
    setFixCat((mer?.category as CategoryId) ?? it.parsed?.suggestedCategory ?? 'other')
    setFixPayer(isCloudRoomActive ? (me?.id ?? '') : (it.parsed?.payerId ?? members[0]?.id ?? ''))
    setFixing(id)
  }

  return (
    <>
      <PageHead title="Import Expenses" sub="Add expenses from a bank message, CSV file, or voice. Review each one before saving."
        right={highConf > 0 ? <button className="btn-primary !px-3.5" onClick={() => { const n = acceptAllHighConfidence(90); pushToast({ message: `${n} items were auto-confirmed.`, tone: 'ok' }) }}><Icon name="bolt" size={18} /> {highConf} auto-confirm</button> : undefined} />

      {/* AUTO METHODS */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2.5 mb-4">
        <button onClick={() => setVoiceOpen((v) => !v)} className={`card p-4 text-left transition-all active:scale-[.98] ${voiceOpen ? '!border-primary/60 bg-primary/5' : 'hover:border-primary/60'}`} aria-expanded={voiceOpen}>
          <span className="icon-tile h-11 w-11"><Icon name="mic" size={21} /></span>
          <span className="block font-display font-bold mt-2.5">Add by voice</span>
          <span className="block text-[12px] text-ink-soft mt-0.5">Say the payer, amount and item.</span>
        </button>
        <button onClick={fromClipboard} className="card p-4 text-left hover:border-primary/60 transition-all active:scale-[.98]">
          <span className="icon-tile h-11 w-11"><Icon name="clipboard" size={21} /></span>
          <span className="block font-display font-bold mt-2.5">From clipboard</span>
          <span className="block text-[12px] text-ink-soft mt-0.5">Parse a copied SMS in one tap.</span>
        </button>
        <button onClick={() => fileRef.current?.click()} className="card p-4 text-left hover:border-primary/60 transition-all active:scale-[.98]">
          <span className="icon-tile h-11 w-11"><Icon name="bank" size={21} /></span>
          <span className="block font-display font-bold mt-2.5">Bank statement</span>
          <span className="block text-[12px] text-ink-soft mt-0.5">Import a bank statement CSV.</span>
        </button>
        <div className="card p-4">
          <span className="icon-tile h-11 w-11"><Icon name="share" size={21} /></span>
          <span className="block font-display font-bold mt-2.5">Share from SMS app</span>
          <span className="block text-[12px] text-ink-soft mt-0.5">After installing the app, RoomHisaab appears in Android Share.</span>
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
          onChange={(e) => void onStatementFile(e.target.files?.[0])} />
      </div>

      {/* VOICE EXPENSE */}
      <AnimatePresence initial={false}>
        {voiceOpen && (
          <motion.section ref={voiceRef} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .28, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden mb-4 scroll-mt-24" aria-labelledby="voice-title">
            <div className="relative overflow-hidden rounded-[24px] bg-[#15172F] text-[#F1F0FF] border border-white/10 shadow-lift3d p-5">
              <div className="absolute -top-20 right-4 h-44 w-44 rounded-full bg-[#4F46C8]/30 blur-3xl" aria-hidden="true" />
              <div className="relative grid lg:grid-cols-[0.9fr_1.1fr] gap-6">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A8A0FF]">Voice expense</p>
                  <h2 id="voice-title" className="text-[23px] text-white mt-1">Tap the microphone and speak</h2>
                  <p className="text-[13px] leading-relaxed text-[#C5C3E1] mt-2">Say who paid, the amount and what was bought. You can correct the result before confirming.</p>
                  <div className="flex flex-wrap items-center gap-3 mt-5">
                    <button type="button" onClick={listening ? stopListening : startListening}
                      className={`h-16 w-16 min-h-[64px] rounded-full grid place-items-center text-white shadow-fab transition-transform active:scale-95 ${listening ? 'bg-accent-solid animate-pulse' : 'bg-gradient-to-br from-[#4F46C8] to-[#DE7726]'}`}
                      aria-label={listening ? 'Stop listening' : 'Start speaking'} aria-pressed={listening}>
                      <Icon name="mic" size={29} />
                    </button>
                    <div>
                      <p className="font-display font-bold">{listening ? 'Listening…' : voiceSupported ? 'Microphone ready' : 'Microphone unavailable'}</p>
                      <p className="text-[12px] text-[#AAA8C9]">{listening ? 'Tap again when finished' : 'Best supported in Chrome on Android'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-5" role="group" aria-label="Voice language">
                    <button type="button" onClick={() => setVoiceLang('en-IN')} className={voiceLang === 'en-IN' ? 'chip-on' : 'chip-off'} aria-pressed={voiceLang === 'en-IN'}>Hinglish / English</button>
                    <button type="button" onClick={() => setVoiceLang('hi-IN')} className={voiceLang === 'hi-IN' ? 'chip-on' : 'chip-off'} aria-pressed={voiceLang === 'hi-IN'}>Hindi</button>
                  </div>
                  {voiceError && <p className="mt-3 rounded-xl border border-[#FF9B8A]/35 bg-[#DE7726]/10 px-3 py-2.5 text-[12.5px] text-[#FFE0C2]" role="alert">{voiceError}</p>}
                </div>

                <div className="rounded-[20px] bg-white text-[#18172B] p-4">
                  <label className="label" htmlFor="voice-text">Speech text</label>
                  <textarea id="voice-text" rows={3} value={voiceText} onChange={(e) => setVoiceText(e.target.value)}
                    className="input resize-y" placeholder="Amit paid ₹1,240 for electricity" />
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {VOICE_SAMPLES.map((sample, i) => <button key={sample} type="button" onClick={() => setVoiceText(sample)} className="chip-off !text-[11px] !py-1">Example {i + 1}</button>)}
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#D7E6DC] bg-[#F3F7F2] p-3.5" aria-live="polite">
                    {voiceParsed ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="num font-display text-[25px] text-[#5046C8]">{formatINR(voiceParsed.amountPaise)}</span>
                          <span className="rounded-full bg-green-100 text-green-800 border border-green-200 px-2 py-0.5 text-[10.5px] font-bold">{voiceParsed.confidence}% sure</span>
                        </div>
                        <dl className="grid grid-cols-3 gap-3 mt-3 text-[12px]">
                          <div><dt className="text-[#514E6B] font-semibold uppercase">Payer</dt><dd className="font-bold truncate">{members.find((m) => m.id === voiceParsed.payerId)?.name ?? me?.name ?? 'You'}</dd></div>
                          <div><dt className="text-[#514E6B] font-semibold uppercase">Expense</dt><dd className="font-bold truncate">{voiceParsed.merchant}</dd></div>
                          <div><dt className="text-[#514E6B] font-semibold uppercase">Method</dt><dd className="font-bold">{voiceParsed.methodGuess.toUpperCase()}</dd></div>
                        </dl>
                      </>
                    ) : (
                      <p className="text-[12.5px] text-[#514E6B]">The payer, category and total will appear here.</p>
                    )}
                  </div>
                  <button type="button" onClick={addVoiceExpense} disabled={!voiceParsed} className="btn-primary w-full mt-3.5"><Icon name="sparkles" /> Add to review queue</button>
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* PASTE BOX */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <label className="label !mb-0 flex-1" htmlFor="sms-in">Paste SMS text</label>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-soft cursor-pointer">
            <input type="checkbox" checked={autoConfirm} className="h-[18px] w-[18px] accent-primary"
              onChange={(e) => {
                setAutoConfirm(e.target.checked)
                autoConfirmRef.current = e.target.checked
                try { window.localStorage.setItem('roomhisaab.autoConfirm', e.target.checked ? '1' : '0') } catch { /* ignore */ }
              }} />
            Auto-confirm 90%+ matches
          </label>
        </div>
        <textarea id="sms-in" ref={taRef} rows={4} value={text} onChange={(e) => setText(e.target.value)}
          className="input !font-mono !text-[12.5px] resize-y"
          placeholder={'SBI: Rs.500.00 debited from a/c XX1234 on 15-10-26 to UPI SWIGGY…'} />
        <div className="flex flex-wrap gap-2 mt-3">
          <button className="btn-primary" onClick={() => { if (ingestText(text, 'SMS')) setText('') }} disabled={!text.trim()}>Auto-parse</button>
          <button className="btn-outline" onClick={() => { if (ingestText(text, 'Multi-SMS', true)) setText('') }} disabled={!text.trim()}>Parse multiple SMS</button>
          <span className="flex-1" />
          <button className="btn-ghost !text-[13px]" onClick={() => setText(SAMPLE_SMS.join('\n\n'))}>SMS samples</button>
          <button className="btn-ghost !text-[13px]" onClick={loadSampleStatement}>Statement sample</button>
        </div>
        <div className="mt-3 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5 text-[12px] text-ink-soft">
          <b className="text-ink">Private by design:</b> SMS and CSV files are parsed in your browser. RoomHisaab never asks for a bank login, OTP or UPI PIN.
          The same shop, amount, and date cannot be added twice.
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <MiniStat label="Pending" value={String(items.length)} tone="pending" />
        <MiniStat label="Confirmed" value={String(doneCount)} tone="ok" />
        <MiniStat label="Shops learned" value={String(state.merchants.length)} tone="primary" />
      </div>

      {/* CARDS */}
      {items.length === 0 ? (
        <EmptyState emoji="📭" title="Inbox is empty"
          body="Paste a bank SMS above. Common shops and bills are recognised automatically." />
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {items.map((it) => {
              const p = it.parsed
              if (!p) return null
              return (
                <SwipeCard key={it.id}
                  onAccept={() => { acceptInboxItem(it.id); pushToast({ message: `${p.merchant} · ${formatINR(p.amountPaise)} confirm ✅`, tone: 'ok' }) }}
                  onIgnore={() => { ignoreInboxItem(it.id); pushToast({ message: 'Item ignored.', tone: 'warn', actionLabel: 'Undo', onAction: () => { /* state me ignored rehta hai, undo ke liye wapas new */ } }) }}
                  onFix={() => openFix(it.id)}>
                  <div className="flex items-start gap-3">
                    <span className="grid place-items-center h-11 w-11 rounded-xl bg-primary/10 border border-primary/25 text-xl shrink-0" aria-hidden="true">
                      {catOf((detectMerchant(p.merchant)?.category as string) ?? 'other').icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-[15px] truncate">{p.merchant}</p>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-bold border ${p.confidence >= 90 ? 'border-moneyin/35 bg-moneyin/10 text-moneyin' : p.confidence >= 60 ? 'border-pending/35 bg-pending/10 text-pending' : 'border-overdue/35 bg-overdue/10 text-overdue'}`}>
                          ✨ {p.confidence}% sure
                        </span>
                      </div>
                      <p className="num text-[19px] font-display mt-0.5">{formatINR(p.amountPaise)}</p>
                      <p className="text-[12px] text-ink-soft mt-0.5">
                        {p.bank} · {p.methodGuess.toUpperCase()} · {p.date ? new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Date not found'}{p.payerId ? ` · Payer: ${members.find((m) => m.id === p.payerId)?.name ?? ''}` : ''}
                      </p>
                      <p className="text-[11.5px] text-ink-faint mt-1.5 line-clamp-2 font-mono">{it.rawText}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button className="btn-primary flex-1" onClick={() => { acceptInboxItem(it.id); pushToast({ message: `${p.merchant} confirm ✅`, tone: 'ok' }) }}>Confirm</button>
                    <button className="btn-outline flex-1" onClick={() => openFix(it.id)}>Fix</button>
                    <button className="btn-danger !px-3.5" onClick={() => { ignoreInboxItem(it.id); pushToast({ message: 'Item ignored.', tone: 'warn' }) }}>Ignore</button>
                  </div>
                  <p className="text-[11px] text-ink-faint text-center mt-2">← swipe ignore · swipe confirm →</p>
                </SwipeCard>
              )
            })}
          </AnimatePresence>
        </ul>
      )}

      {/* FIX SHEET */}
      <AnimatePresence>
        {fixing && (() => {
          const it = state.inbox.find((i) => i.id === fixing)
          const p = it?.parsed
          if (!it || !p) return null
          return (
            <motion.div className="fixed inset-0 z-[130] flex items-end md:items-center justify-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-ink/45 backdrop-blur-[3px]" onClick={() => setFixing(null)} aria-hidden="true" />
              <motion.div role="dialog" aria-modal="true" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="relative w-full md:max-w-md rounded-t-3xl md:rounded-xl2 bg-surface-card text-ink shadow-lift3d border border-line-light p-5 space-y-4 max-h-[90dvh] overflow-y-auto" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom,0px))' }}>
                <h2 className="text-[19px]">Correct expense</h2>
                <div className="card p-3">
                  <p className="num text-[20px] font-display">{formatINR(p.amountPaise)}</p>
                  <p className="text-[13px] text-ink-soft">{p.merchant} · {p.bank}</p>
                </div>
                <div>
                  <span className="label">Category</span>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((c) => (
                      <button key={c.id} className={fixCat === c.id ? 'chip-on' : 'chip-off'} onClick={() => setFixCat(c.id)} aria-pressed={fixCat === c.id}>
                        <span aria-hidden="true">{c.icon}</span>{c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="label">Paid by</span>
                  {isCloudRoomActive ? (
                    <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-[12.5px] text-ink-soft"><b className="text-ink">{me?.name ?? 'You'}</b> — cloud imported expenses are saved under your login.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {members.map((m) => (
                        <button key={m.id} className={fixPayer === m.id ? 'chip-on' : 'chip-off'} onClick={() => setFixPayer(m.id)} aria-pressed={fixPayer === m.id}>
                          <Avatar name={m.name} color={m.color} size={18} />{m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className="btn-outline flex-1" onClick={() => setFixing(null)}>Cancel</button>
                  <button className="btn-primary flex-[2]" onClick={() => {
                    acceptInboxItem(it.id, { category: fixCat, payerId: fixPayer || members[0]?.id })
                    pushToast({ message: 'Corrected expense confirmed.', tone: 'ok' })
                    setFixing(null)
                  }}>Save + confirm</button>
                </div>
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'pending' | 'ok' | 'primary' }) {
  const cls = tone === 'pending' ? 'border-pending/30 bg-pending/10 text-pending' : tone === 'ok' ? 'border-moneyin/30 bg-moneyin/10 text-moneyin' : 'border-primary/30 bg-primary/10 text-primary'
  return (
    <div className={`rounded-xl2 border p-3 ${cls}`}>
      <p className="text-[11px] uppercase tracking-wide font-semibold opacity-80">{label}</p>
      <p className="num text-[22px] font-display">{value}</p>
    </div>
  )
}

/** swipeable card with rubber-band physics */
function SwipeCard({ children, onAccept, onIgnore, onFix }: {
  children: React.ReactNode; onAccept: () => void; onIgnore: () => void; onFix: () => void
}) {
  const x = useMotionValue(0)
  const bg = useTransform(x, [-160, 0, 160], ['rgba(244,63,94,.18)', 'rgba(0,0,0,0)', 'rgba(16,185,129,.18)'])
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const off = info.offset.x, vel = info.velocity.x
    if (off > 110 || vel > 700) { onAccept(); return }
    if (off < -110 || vel < -700) { onIgnore(); return }
    onFix()
  }
  return (
    <motion.li layout drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.22}
      onDragEnd={onDragEnd} style={{ x, backgroundColor: bg }}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, height: 0 }}
      transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
      className="card p-4 cursor-grab active:cursor-grabbing touch-pan-y list-none">
      {children}
    </motion.li>
  )
}
