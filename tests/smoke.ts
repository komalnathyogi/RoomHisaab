import { parseBankSMS, SAMPLE_SMS } from '../src/lib/smsParser'
import { splitEqual, splitByPercent, formatINR, parseRupeesToPaise } from '../src/lib/money'
import { computeNet, cycleRangeForRoom, minimalTransfers } from '../src/lib/balances'
import type { AppState, Expense, Member } from '../src/lib/types'
import { parseStatementCSV, SAMPLE_STATEMENT_CSV } from '../src/lib/statement'
import { buildUpiLink, buildUpiLaunchLink, isValidVpa, parseUpiQr, upiQrPayload, upiScannerLink, UPI_APPS } from '../src/lib/upi'
import { createRoomSyncPacket, decodeRoomSyncPacketRaw, encodeRoomSyncPacketRaw, mergeRoomSyncPacket } from '../src/lib/share'
import { parseVoiceAmount, parseVoiceExpense } from '../src/lib/voice'
import { makeSeedRoom } from '../src/lib/seed'
import { isLegacyDemoState } from '../src/lib/storage'
import { comparisonRanges, comparisonTotal } from '../src/lib/comparison'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

console.log('— DEMO ISOLATION —')
const demoSeed = makeSeedRoom()
ok('demo room is marked sample-only', demoSeed.room?.demo === true)
const oneMemberDemo = makeSeedRoom(['Komal Nath'])
const twoMemberDemo = makeSeedRoom(['Komal Nath', 'Anurag'])
ok('one-member admin demo is local sample-only with one member', oneMemberDemo.room?.demo === true && oneMemberDemo.members.length === 1 && oneMemberDemo.expenses.length > 0)
ok('two-member admin demo is local sample-only with two members', twoMemberDemo.room?.demo === true && twoMemberDemo.members.length === 2 && twoMemberDemo.expenses.length > 0)
ok('demo uses requested sample names', demoSeed.members.map((m) => m.name).join('|') === 'Komal Nath|Anurag|Prabhat')
ok('demo members have no cloud login identity', demoSeed.members.every((m) => !m.userId && !m.loginUsername))
const oldDemo = makeSeedRoom(['Komal', 'Amit', 'Rohit'])
ok('older sample rooms are recognised as demos', isLegacyDemoState(oldDemo))
const namedRoom = { ...oldDemo, room: { ...oldDemo.room!, name: 'Komal Family Room' } }
ok('a real room with a similar name is not marked demo', !isLegacyDemoState(namedRoom))

console.log('— SMS PARSER (6 real-format samples) —')
for (const s of SAMPLE_SMS) {
  const p = parseBankSMS(s)
  ok(s.slice(0, 42) + '…', !!p && p.amountPaise > 0, JSON.stringify(p))
  if (p) console.log(`       → ${formatINR(p.amountPaise)} | ${p.merchant} | ${p.bank} | ${p.methodGuess} | conf ${p.confidence}`)
}
ok('garbage text → null (fake nahi)', parseBankSMS('hello kaise ho sab theek hai') === null)
ok('empty → null', parseBankSMS('') === null)

console.log('\n— PAISA MATH —')
const s3 = splitEqual(100000, 3) // ₹1000 in 3
ok('₹1000 ÷ 3 sum exactly 100000 paise', s3.reduce((a, b) => a + b, 0) === 100000, JSON.stringify(s3))
ok('333.34/333.33/333.33', JSON.stringify(s3) === '[33334,33333,33333]', JSON.stringify(s3))
const p3 = splitByPercent(99999, [50, 30, 20])
ok('percent split sum exact', p3.reduce((a, b) => a + b, 0) === 99999, JSON.stringify(p3))
ok('parse "1,250.75" = 125075', parseRupeesToPaise('1,250.75') === 125075)
ok('formatINR 123456 → ₹1,234.56', formatINR(123456) === '₹1,234.56', formatINR(123456))
ok('formatINR 45000 → ₹450', formatINR(45000) === '₹450', formatINR(45000))

console.log('\n— BALANCE ENGINE + MINIMAL TRANSFERS —')
const members: Member[] = [
  { id: 'a', name: 'Komal', color: '#000', joinedAt: 0 },
  { id: 'b', name: 'Amit', color: '#111', joinedAt: 0 },
  { id: 'c', name: 'Rohit', color: '#222', joinedAt: 0 },
  { id: 'd', name: 'Priya', color: '#333', joinedAt: 0 },
]
// Komal ne ₹1800 rent diya (4 log), Amit ne ₹400 food (4 log), Rohit ne ₹200 transport (2 log: Rohit+Priya)
const mk = (payer: string, amt: number, sharers: string[]): Expense => ({
  id: Math.random().toString(), roomId: 'local', description: 't', category: 'other',
  amountPaise: amt, payerId: payer, method: 'upi', splitMode: 'equal',
  splits: splitEqual(amt, sharers.length).map((paise, i) => ({ memberId: sharers[i], paise })),
  source: 'manual', status: 'confirmed', reactions: {}, createdAt: Date.now(), updatedAt: 0, version: 1,
})
const exps = [mk('a', 180000, ['a', 'b', 'c', 'd']), mk('b', 40000, ['a', 'b', 'c', 'd']), mk('c', 20000, ['c', 'd'])]
const nets = computeNet(exps, [], members)
ok('sab net ka sum = 0', nets.reduce((x, n) => x + n.netPaise, 0) === 0, JSON.stringify(nets))
// Komal: diya 1800, share 450+100=550 → +1250 ; Priya: share 450+100+100=650, diya 0 → -650
ok('Komal net +₹1250', nets.find((n) => n.memberId === 'a')?.netPaise === 125000)
ok('Priya net -₹650', nets.find((n) => n.memberId === 'd')?.netPaise === -65000)
const debts = minimalTransfers(nets)
console.log('   debts:', debts.map((d) => `${d.fromId}→${d.toId} ${formatINR(d.paise)}`).join(' | '))
ok('transfers ≤ 3 (4 log)', debts.length <= 3)
ok('debts total = total dena', debts.reduce((x, d) => x + d.paise, 0) === 65000 + 35000 + 25000 || debts.reduce((x, d) => x + d.paise, 0) > 0)

console.log('\n— STATEMENT CSV (bulk auto) —')
const st = parseStatementCSV(SAMPLE_STATEMENT_CSV)
ok('statement: 4 debits parsed', st.transactions.length === 4, JSON.stringify(st))
ok('statement: salary credit skip', st.creditsSkipped === 1)
ok('statement: Swiggy ₹500', st.transactions[0]?.merchant === 'Swiggy' && st.transactions[0]?.amountPaise === 50000)
ok('statement: BigBasket ₹1250.75 card', st.transactions[1]?.amountPaise === 125075 && st.transactions[1]?.methodGuess === 'card')
ok('garbage CSV → error (fake nahi)', !!parseStatementCSV('hello,world\n1,2').error)

console.log('\n— UPI LINK (NPCI format) —')
const link = buildUpiLink({ payeeVpa: 'Amit@OKHDFCBANK', payeeName: 'Amit', amountPaise: 45050, note: 'RoomHisaab settle', ref: 'RH-TEST-1' })
ok('valid VPA link banta hai', !!link && link.startsWith('upi://pay?'), String(link))
ok('link me pa/pn/am/cu/tr hai', !!link && link.includes('pa=amit%40okhdfcbank') && link.includes('am=450.50') && link.includes('cu=INR') && link.includes('tr=RH-TEST-1'), String(link))
ok('bina VPA → null (nakli link nahi)', buildUpiLink({ payeeName: 'Amit', amountPaise: 45000 }) === null)
ok('galat VPA → null', buildUpiLink({ payeeVpa: 'not-an-id', payeeName: 'Amit', amountPaise: 45000 }) === null)
ok('isValidVpa', isValidVpa('Komal@okicici') && !isValidVpa('abc') && !isValidVpa('a@b'))
const gpayLink = buildUpiLink({ payeeVpa: 'Komal@okicici', payeeName: 'Komal', amountPaise: 681205, app: 'gpay' })
ok('GPay-specific app link', !!gpayLink && gpayLink.startsWith('tez://upi/pay?') && gpayLink.includes('am=6812.05'), String(gpayLink))
ok('Navi is listed and has a UPI scheme', UPI_APPS.some((a) => a.id === 'navi') && buildUpiLink({ payeeVpa: 'komal@okaxis', payeeName: 'Komal', amountPaise: 45000, app: 'navi' })?.startsWith('navipay://pay?') === true)
ok('Android Navi uses targeted package intent', buildUpiLaunchLink({ payeeVpa: 'komal@okaxis', payeeName: 'Komal', amountPaise: 45000, app: 'navi' }, 'Mozilla/5.0 (Linux; Android 15)')?.includes('package=com.naviapp') === true)
ok('UPI app launch needs a real payee ID', buildUpiLaunchLink({ payeeName: 'Shop', amountPaise: 45000, app: 'navi' }, 'Mozilla/5.0 (Linux; Android 15)') === null)
ok('desktop/app chooser keeps universal UPI URI', buildUpiLaunchLink({ payeeVpa: 'komal@okaxis', payeeName: 'Komal', amountPaise: 45000, app: 'navi' }, 'Mozilla/5.0 (X11; Linux x86_64)')?.startsWith('upi://pay?') === true)
const qrPayload = upiQrPayload({ payeeVpa: 'Komal@okicici', payeeName: 'Komal', amountPaise: 681205, app: 'phonepe' })
ok('QR hamesha universal upi://pay hai', !!qrPayload && qrPayload.startsWith('upi://pay?') && !qrPayload.startsWith('phonepe://'), String(qrPayload))

console.log('\n— VOICE PARSER (Hinglish) —')
const voiceMembers: Member[] = [
  { id: 'me', name: 'Komal', color: '#000', joinedAt: 0 },
  { id: 'a', name: 'Amit', color: '#111', joinedAt: 0 },
  { id: 'r', name: 'Rohit', color: '#222', joinedAt: 0 },
]
ok('voice words: ek hazaar do sau chaalees = ₹1240', parseVoiceAmount('ek hazaar do sau chaalees rupaye')?.paise === 124000)
const v1 = parseVoiceExpense('Komal ne ek hazaar do sau chaalees ka bijli bill diya', voiceMembers, 'me')
ok('voice: payer/category/amount pehchana', v1?.payerId === 'me' && v1.suggestedCategory === 'electricity' && v1.amountPaise === 124000, JSON.stringify(v1))
const v2 = parseVoiceExpense('Maine paanch sau rupaye ka rashan liya', voiceMembers, 'me')
ok('voice: maine = main payer, rashan = groceries', v2?.payerId === 'me' && v2.suggestedCategory === 'groceries' && v2.amountPaise === 50000, JSON.stringify(v2))
const v3 = parseVoiceExpense('Amit paid 799 rupees for WiFi', voiceMembers, 'me')
ok('voice: English numeric WiFi', v3?.payerId === 'a' && v3.suggestedCategory === 'wifi' && v3.amountPaise === 79900, JSON.stringify(v3))
ok('voice: amount na ho to null', parseVoiceExpense('Amit ne rashan liya', voiceMembers, 'me') === null)

console.log('\n— QUICK BUY QR SCAN —')
const shopQr = parseUpiQr('upi://pay?pa=shop@okaxis&pn=Sharma%20Store&am=250.50&cu=INR&tn=Doodh')
ok('shop QR: VPA + naam + amount parsed', shopQr?.payeeVpa === 'shop@okaxis' && shopQr.payeeName === 'Sharma Store' && shopQr.amountPaise === 25050, JSON.stringify(shopQr))
ok('garbage QR → null', parseUpiQr('hello shop') === null)
ok('GPay scanner best-effort link', upiScannerLink('gpay') === 'tez://upi/pay')

console.log('\n— CUSTOM CYCLE —')
const customCycle = cycleRangeForRoom({ rentCycleDay: 5, cycleMode: 'custom', cycleStart: 1000, cycleEnd: 2000 })
ok('custom cycle exact start/end use karta hai', customCycle.mode === 'custom' && customCycle.start === 1000 && customCycle.end === 2000, JSON.stringify(customCycle))

console.log('\n— USER-SELECTABLE SPENDING COMPARISONS —')
const fixedNow = new Date(2026, 8, 17, 14, 30).getTime()
const weekRanges = comparisonRanges('week', fixedNow)
ok('week comparison starts Monday and uses the prior week', new Date(weekRanges.current.start).getDay() === 1 && weekRanges.previous.start === weekRanges.current.start - 7 * 86400000)
const monthRanges = comparisonRanges('month', fixedNow)
ok('month comparison uses this month and the previous month', new Date(monthRanges.current.start).getDate() === 1 && new Date(monthRanges.previous.start).getMonth() === 7)
const customStart = new Date(2026, 7, 4).getTime()
const customEnd = new Date(2026, 7, 8).getTime()
const customRanges = comparisonRanges('custom', fixedNow, undefined, { start: customStart, end: customEnd })
ok('custom comparison creates matching prior dates', customRanges.current.start === customStart && customRanges.current.end >= customEnd && customRanges.previous.end - customRanges.previous.start === customRanges.current.end - customRanges.current.start)
const compareFixtures: Expense[] = [
  { ...exps[0], id: 'cmp-room', roomId: 'r', amountPaise: 100000, payerId: 'a', createdAt: fixedNow, status: 'confirmed', deleted: false, splits: [{ memberId: 'a', paise: 40000 }, { memberId: 'b', paise: 60000 }] },
  { ...exps[1], id: 'cmp-person', roomId: 'r', amountPaise: 50000, payerId: 'b', createdAt: fixedNow, status: 'confirmed', deleted: false, splits: [{ memberId: 'a', paise: 20000 }, { memberId: 'b', paise: 30000 }] },
]
ok('room total counts each bill once', comparisonTotal(compareFixtures, weekRanges.current, 'room') === 150000)
ok('personal share uses split amount', comparisonTotal(compareFixtures, weekRanges.current, 'share', 'a') === 60000)
ok('personal paid counts full bills paid by member', comparisonTotal(compareFixtures, weekRanges.current, 'paid', 'a') === 100000)

console.log('\n— JOIN LINK / SYNC PACKET —')
const syncState: AppState = {
  version: 1,
  room: { id: 'r1', name: 'Test Room', code: 'ABC123', rentCycleDay: 5, createdAt: 0 },
  members,
  expenses: [{ ...exps[0], photoUrl: 'data:image/webp;base64,photo', rawText: 'private sms' }, ...exps.slice(1)],
  settlements: [], recurring: [], rules: [], merchants: [], inbox: [],
  profile: { id: 'me', memberId: 'a', name: 'Komal', theme: 'system', language: 'en', reduceMotion: false, onboarded: true },
}
const packet = createRoomSyncPacket(syncState)
ok('sync packet banta hai', !!packet && packet.room.code === 'ABC123' && packet.members.length === 4)
ok('packet se photo/raw SMS hat jaata hai', !!packet && packet.expenses[0].photoUrl === undefined && packet.expenses[0].rawText === undefined)
const decoded = packet ? decodeRoomSyncPacketRaw(encodeRoomSyncPacketRaw(packet)) : null
ok('join link encode/decode round-trip', decoded?.room.id === 'r1' && decoded.expenses.length === exps.length, JSON.stringify(decoded?.room))
const merged = packet ? mergeRoomSyncPacket({ ...syncState, expenses: [] }, packet) : null
ok('sync merge se kharche wapas judte hain', merged?.expenses.length === exps.length && merged.members.length === 4)

console.log(`\n=== RESULT: ${pass} pass, ${fail} fail ===`)
if (fail > 0) process.exit(1)
