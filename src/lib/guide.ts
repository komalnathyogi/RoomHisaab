import type { IconName } from '../components/Icon'

export interface PageHelpContent {
  pageName: string
  icon: IconName
  purpose: string
  firstStep: string
  example: string
  actionLabel: string
  actionTo: string
}

export interface GuideTask {
  id: string
  icon: IconName
  title: string
  body: string
  to: string
  cta: string
  keywords: string
}

export interface GlossaryItem {
  term: string
  meaning: string
  example: string
  keywords: string
}

export interface GuideFaq {
  question: string
  answer: string
  keywords: string
}

export const PAGE_HELP: Record<string, PageHelpContent> = {
  '/room': {
    pageName: 'Home',
    icon: 'home',
    purpose: 'This is the front page of your room. It shows the total spending, who should pay whom, and what needs your attention.',
    firstStep: 'First look at “Needs your attention”. If nothing is pending, use Add Expense when someone buys something.',
    example: 'Komal Nath pays ₹900 for 3 people. Each share is ₹300, so Anurag and Prabhat should return ₹300 each to Komal Nath.',
    actionLabel: 'Take the 1-minute tour',
    actionTo: '/room?tour=1',
  },
  '/room/my': {
    pageName: 'Home',
    icon: 'users',
    purpose: 'This page is only about your money: what you paid, your share of room expenses, and whether you should receive or pay money.',
    firstStep: 'Check the large amount first. “You should receive” means money comes back to you. “You need to pay” means money is pending from you.',
    example: 'If you paid ₹900 for everyone and your own share is ₹300, the remaining ₹600 should come back to you.',
    actionLabel: 'Open Home',
    actionTo: '/room',
  },
  '/room/buy': {
    pageName: 'Add Expense',
    icon: 'scan',
    purpose: 'Use this page when you are buying something now, or when you have already bought and paid for something.',
    firstStep: 'Type only two things first: what you bought and the amount. Then choose “Pay now” or “Already paid”.',
    example: 'Type “Milk and bread”, enter ₹180, pay in your UPI app if needed, then save. The purchase appears in Expenses and balances.',
    actionLabel: 'See saved purchases',
    actionTo: '/room/history',
  },
  '/inbox': {
    pageName: 'Import Expenses',
    icon: 'sparkles',
    purpose: 'This page saves typing. RoomHisaab reads a bank SMS, statement file, shared text, or your voice and prepares the expense for you.',
    firstStep: 'Paste or speak the expense, check the amount and person carefully, then press Confirm. Nothing is final until you confirm it.',
    example: 'Paste “Rs.1,240 debited for electricity” and the app fills ₹1,240 and a suggested category.',
    actionLabel: 'Add manually instead',
    actionTo: '/room?add=1',
  },
  '/room/payments': {
    pageName: 'Settle Up',
    icon: 'qr',
    purpose: 'Use this page only for money that is already pending between room members. It creates an exact QR or opens a UPI app.',
    firstStep: 'Find your name, check who receives the money and the amount, then tap Pay. Enter your UPI PIN only inside your payment app.',
    example: '“Anurag → Komal Nath ₹300” means Anurag should pay ₹300 to Komal Nath. Record the payment, then Komal Nath confirms it.',
    actionLabel: 'See who pays whom',
    actionTo: '/room',
  },
  '/room/history': {
    pageName: 'Expenses',
    icon: 'receipt',
    purpose: 'This is the room notebook. Every saved purchase and bill appears here, newest first.',
    firstStep: 'Use search when you want to find an old bill. You can edit only entries that belong to you in a cloud room.',
    example: 'Search “electricity” to see who paid it, the amount, the date, and how it was divided.',
    actionLabel: 'Add a new purchase',
    actionTo: '/room/buy',
  },
  '/room/insights': {
    pageName: 'Reports',
    icon: 'chart',
    purpose: 'Reports show charts and totals. No money moves on this page and tapping a chart does not change any balance.',
    firstStep: 'Look at the biggest category first. That tells the room where most money is going.',
    example: 'If Food is 40% of spending, food is the room’s biggest cost in that period.',
    actionLabel: 'Open expense list',
    actionTo: '/room/history',
  },
  '/room/members': {
    pageName: 'Members & UPI',
    icon: 'users',
    purpose: 'This page manages the people in the room, invite links, and each person’s UPI ID for receiving payments.',
    firstStep: 'Make sure every real member has a correct UPI ID. A QR cannot be created for a person whose UPI ID is missing.',
    example: 'To invite a roommate, create the cloud join link here and share the Room Password separately. Never ask for their personal password.',
    actionLabel: 'Open Settle Up',
    actionTo: '/room/payments',
  },
  '/room/rules': {
    pageName: 'Recurring Bills',
    icon: 'bolt',
    purpose: 'Recurring Bills is for work you do again and again, such as rent or WiFi every month and simple rules for repeated shops.',
    firstStep: 'Add a monthly bill once: name, amount, date, and who normally pays it. RoomHisaab will add it when it is due.',
    example: 'Set “WiFi ₹799 on day 5”. Next month, the bill is prepared automatically instead of being typed again.',
    actionLabel: 'See saved entries',
    actionTo: '/room/history',
  },
  '/settings': {
    pageName: 'Settings',
    icon: 'settings',
    purpose: 'Settings controls your login safety, theme, backup, and app preferences. It is not used for daily expenses.',
    firstStep: 'For a cloud room, create and safely save your Personal Recovery Key before you ever forget your password.',
    example: 'Download a backup before using anything in the Danger zone. A backup helps you restore room records.',
    actionLabel: 'Open Help & Guide',
    actionTo: '/room/guide',
  },
}

export const GUIDE_TASKS: GuideTask[] = [
  {
    id: 'buy-now',
    icon: 'scan',
    title: 'I am buying something now',
    body: 'Type the item and amount, pay by cash or UPI, then save it.',
    to: '/room/buy',
    cta: 'Open Add Expense',
    keywords: 'buy shop purchase pay now cash upi qr seller store',
  },
  {
    id: 'already-paid',
    icon: 'check',
    title: 'I already paid outside the app',
    body: 'Choose “Already paid” in Add Expense. No payment app opens; the purchase is only written in the room notebook.',
    to: '/room/buy',
    cta: 'Add paid purchase',
    keywords: 'already paid cash upi card outside payment done',
  },
  {
    id: 'manual-bill',
    icon: 'plus',
    title: 'I want full control over a bill',
    body: 'Use Add Expense when you need a special split, selected members, percentage, or exact shares.',
    to: '/room?add=1',
    cta: 'Add an expense',
    keywords: 'manual bill custom split percent exact selected member payer',
  },
  {
    id: 'auto-capture',
    icon: 'sparkles',
    title: 'I do not want to type',
    body: 'Paste a bank SMS, upload a statement CSV, share text, or speak. Check the result, then confirm it.',
    to: '/inbox',
    cta: 'Open Import Expenses',
    keywords: 'sms csv voice microphone automatic import bank statement clipboard',
  },
  {
    id: 'who-pays',
    icon: 'home',
    title: 'I want to know who pays whom',
    body: 'Home combines all expenses and shows the smallest clear list of pending payments.',
    to: '/room',
    cta: 'See balances',
    keywords: 'balance owe debt who pays receive pending settle total',
  },
  {
    id: 'pay-pending',
    icon: 'qr',
    title: 'I need to pay pending money',
    body: 'Open Settle Up for an exact QR or UPI app link. Approve the payment only inside your UPI app.',
    to: '/room/payments',
    cta: 'Open Settle Up',
    keywords: 'pay qr upi app pending settle transfer money receive',
  },
  {
    id: 'my-money',
    icon: 'users',
    title: 'I want only my money summary',
    body: 'See what you paid, your own share, and whether money should come to you or go from you.',
    to: '/room/my',
    cta: 'Open Home',
    keywords: 'my money personal my share i paid receive pay profile',
  },
  {
    id: 'old-expense',
    icon: 'receipt',
    title: 'I want to find an old expense',
    body: 'Search every saved purchase by name, member, category, payment method, or period.',
    to: '/room/history',
    cta: 'Open Expenses',
    keywords: 'old search history bill receipt record edit delete expense',
  },
  {
    id: 'reports',
    icon: 'chart',
    title: 'I want to see where money went',
    body: 'Reports turn the same expenses into simple charts by category, member, week, and payment method.',
    to: '/room/insights',
    cta: 'Open Reports',
    keywords: 'chart report graph category budget month spending analysis',
  },
  {
    id: 'invite',
    icon: 'share',
    title: 'I want to add or invite a roommate',
    body: 'Create the join link in Members & UPI. Also save each member’s UPI ID for payment QR codes.',
    to: '/room/members',
    cta: 'Open Members & UPI',
    keywords: 'invite roommate member join link upi id profile phone whatsapp',
  },
  {
    id: 'monthly',
    icon: 'bolt',
    title: 'The same bill comes every month',
    body: 'Set rent, WiFi, maid, or another repeated bill once in Recurring Bills.',
    to: '/room/rules',
    cta: 'Open Recurring Bills',
    keywords: 'rent wifi monthly recurring automatic bill rule repeat',
  },
  {
    id: 'safety',
    icon: 'shield',
    title: 'I need login, backup, or recovery',
    body: 'Use Settings for the Personal Recovery Key, backup download, theme, and account options.',
    to: '/settings',
    cta: 'Open Settings',
    keywords: 'password forgot recovery key backup restore theme login account danger',
  },
]

export const GLOSSARY: GlossaryItem[] = [
  {
    term: 'Room',
    meaning: 'One shared home, flat, PG, or hostel group whose expenses are kept together.',
    example: '“Shanti Niwas 204” is one room.',
    keywords: 'flat pg hostel group home',
  },
  {
    term: 'Member',
    meaning: 'One person in the room whose payments and share are tracked.',
    example: 'Komal Nath, Anurag, and Prabhat are three members.',
    keywords: 'person roommate user profile',
  },
  {
    term: 'Expense',
    meaning: 'One purchase or bill written in the room notebook.',
    example: 'Groceries ₹900 is one expense.',
    keywords: 'bill purchase spend cost entry',
  },
  {
    term: 'Payer',
    meaning: 'The person who actually gave the money to the shop or bill company.',
    example: 'If Komal paid the shop, Komal is the payer—even if everyone shares the cost.',
    keywords: 'paid by person cash upi',
  },
  {
    term: 'Split / Share',
    meaning: 'How one expense is divided between people.',
    example: '₹900 split equally between 3 people means a ₹300 share for each person.',
    keywords: 'divide equal percent exact selected part',
  },
  {
    term: 'Balance',
    meaning: 'The final result after all expenses and confirmed payments are calculated.',
    example: '+₹300 means the person should receive ₹300. −₹300 means the person should pay ₹300.',
    keywords: 'plus minus receive pay net result owe',
  },
  {
    term: 'Settle',
    meaning: 'To clear pending money between members.',
    example: 'Amit pays Komal ₹300 and the balance becomes zero.',
    keywords: 'clear pending payment finish zero',
  },
  {
    term: 'Monthly period',
    meaning: 'The date period used for totals and reports. It does not delete older balances by itself.',
    example: 'A monthly period may run from the 5th of one month to the 4th of the next month.',
    keywords: 'month dates period start end report',
  },
  {
    term: 'UPI ID',
    meaning: 'The address used to receive UPI money, such as a name followed by @ and a bank/app name.',
    example: 'Amit@okhdfcbank is an example format. A UPI ID is not a PIN.',
    keywords: 'vpa payment address receive QR',
  },
  {
    term: 'QR payment',
    meaning: 'A code containing the receiver, exact amount, and note. Scanning fills the payment app; it does not approve payment by itself.',
    example: 'The payer still checks the name and amount, then approves in GPay, PhonePe, Paytm, or BHIM.',
    keywords: 'scan code amount app pin',
  },
  {
    term: 'Room Login ID',
    meaning: 'The shared name that identifies which cloud room a member is opening.',
    example: 'Everyone in the same room uses the same Room Login ID, but not the same personal password.',
    keywords: 'cloud login room id sign in',
  },
  {
    term: 'Room Password',
    meaning: 'A shared joining password used with an invite. It is not used as a member’s daily personal password.',
    example: 'Share it only with people who should join the room.',
    keywords: 'shared invite join password',
  },
  {
    term: 'Personal password',
    meaning: 'A private password for one member only. It protects that member’s identity and entries.',
    example: 'Never share your personal password with roommates.',
    keywords: 'private login username security',
  },
  {
    term: 'Personal Recovery Key',
    meaning: 'A one-time secret key that can reconnect you to the same member and room if you forget your personal password.',
    example: 'Create it in Settings and save it somewhere private before it is needed.',
    keywords: 'forgot password recover lost login key',
  },
  {
    term: 'Import Expenses',
    meaning: 'RoomHisaab reads a bank SMS, statement file, or spoken sentence and prepares the expense for you.',
    example: 'You still check the amount and people before tapping Confirm, so nothing is saved by mistake.',
    keywords: 'automatic sms statement csv voice no typing inbox',
  },
  {
    term: 'Category',
    meaning: 'A simple group name for a bill so reports can show where the money went.',
    example: 'Milk and vegetables can be Groceries. Rent and electricity are separate categories.',
    keywords: 'group food groceries rent report type',
  },
  {
    term: 'Recurring expense',
    meaning: 'The same bill that comes again every month. You set it once and RoomHisaab prepares it on the chosen day.',
    example: 'Rent on day 5 and WiFi on day 10 are recurring expenses.',
    keywords: 'monthly repeat rent wifi automatic bill again',
  },
  {
    term: 'Shop or service',
    meaning: 'The shop, company, app, or person who received the money. Bank messages sometimes call this a merchant.',
    example: 'Zomato, BigBasket, and an electricity company are shops or services in an expense.',
    keywords: 'merchant seller vendor store company zomato swiggy',
  },
]

export const GUIDE_FAQS: GuideFaq[] = [
  {
    question: 'What is RoomHisaab in one sentence?',
    answer: 'RoomHisaab is a shared notebook that remembers who paid for shared things, divides each bill, and clearly shows who should pay whom.',
    keywords: 'what is roomhisaab purpose use',
  },
  {
    question: 'What is the difference between Add Expense or Import Expenses, and Settle Up?',
    answer: 'Add Expense is the fastest way for a purchase. Add Expense gives full split control. Import Expenses prepares an expense from SMS, a file, or voice. Settle Up is only for money that is already pending between members.',
    keywords: 'difference quick buy add expense auto capture payments confuse',
  },
  {
    question: 'What do + and − mean?',
    answer: 'A green + amount means that person should receive money. A red − amount means that person should pay money. Zero means that person is settled and needs no action.',
    keywords: 'plus minus green red balance receive pay zero settled',
  },
  {
    question: 'If I already paid in a shop, what should I tap?',
    answer: 'Open Add Expense, enter the item and amount, choose “Already paid”, choose Cash/UPI/Card, and save. No payment app will open because the real payment is already finished.',
    keywords: 'already paid shop cash upi card quick buy',
  },
  {
    question: 'Does RoomHisaab take money from my bank?',
    answer: 'No. RoomHisaab creates a standard UPI link or QR and opens your payment app. You check the name and amount there and enter the PIN only in that app.',
    keywords: 'bank money pin safety automatic payment QR',
  },
  {
    question: 'After I save an expense, where does it go?',
    answer: 'It appears in Expenses, changes member balances on Home, appears in Reports, and may create a pending payment on the Settle Up page.',
    keywords: 'save expense where history balance report payment',
  },
  {
    question: 'Can another member change my expense?',
    answer: 'In a cloud room, members can see room activity, but server security allows each member to change only their own expenses and profile.',
    keywords: 'edit another member privacy security cloud own expense',
  },
  {
    question: 'Why is there both a Room Password and a personal password?',
    answer: 'The Room Password helps an invited person join the correct room. The personal password proves which member is signing in, so one person cannot act as another member.',
    keywords: 'room password personal password username login difference',
  },
  {
    question: 'What if I forget my personal password?',
    answer: 'Open Forgot password on the Sign in page. Use a Personal Recovery Key if you saved one, ask a room admin for a reset invite, or restore a backup where appropriate.',
    keywords: 'forgot password recover lost login admin invite backup',
  },
  {
    question: 'I am still confused. What is the safest first step?',
    answer: 'Open the demo room or take the 1-minute tour. Demo data is only for learning, and opening pages to look around does not move real money.',
    keywords: 'confused start first demo tour safe learn',
  },
]
