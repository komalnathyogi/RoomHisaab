# RoomHisaab

**A shared money notebook for roommates, flats, PGs and hostels.**

Write a shared bill once. RoomHisaab shows who paid, each person’s share, and who needs to pay whom. When money is due, it can prepare an exact UPI payment link or QR.

RoomHisaab is made for people who want clear shared expenses without long forms or confusing calculations. It works on Android phones and desktop browsers.

## Version 7.2.3 release candidate (work in progress)

The package version is `7.2.3-rc.0`. This candidate provides one sticky landing navigation with eight same-page destinations, route-specific create/join/sign-in actions, a seeded one-to-ten-member demo, and an expense-first Quick Pay form. Quick Pay requires the user to choose when to open the scanner or payment app, preserves the draft, and requires manual payment confirmation. The guided-tour invitation is globally one-time, with manual replay from Help. About Us is available in More for personal and shared rooms. Demo data remains isolated and demo actions never launch a real payment. This is not a production release: physical Android/iOS camera and QR testing, UPI handoff, cloud behaviour, backup recovery, production configuration, and full manual accessibility/performance checks remain outstanding. No claim is made that physical scanner behaviour is fixed.

## Start here

- **New room?** Choose **Create Room**. Start on your own or add the people who share expenses; you can add members later.
- **Joining a room?** Open the invitation link shared by the room owner and follow the join steps.
- **Already have an account?** Sign in with your room details and your own personal account.
- **Just looking around?** Choose **Try Demo**. The demo is for learning; it is not your real room.

Inside a room, the usual steps are:

1. **Add members if needed** and their names. A one-person room is fine; members can be added later. Add a UPI ID if someone wants to receive UPI payments.
2. **Write an expense**: start with what was bought and how much it cost.
3. **Check the split**: RoomHisaab works out each person’s share and updates the room balance.
4. **Pay pending money**: open the exact QR or UPI app, check the name and amount, and approve in that app. Record the payment in RoomHisaab.

The **Help** page has a short walkthrough, examples, and answers.

## What you can do

- **Home:** see room spending, balances, recent activity and the next useful action.
- **Add Expense:** record a bill and choose its payment method and status separately. Unpaid expenses stay out of room balances until marked paid.
- **Quick Pay:** choose it separately from Add Expense in the mobile Add sheet or desktop sidebar. It first opens the expense form; only **Scan Seller QR** opens the scanner. The item, amount, payer, split and payment-app choice stay in the draft when the scanner closes or you return from a payment app. Check any amount mismatch and seller details, then confirm payment manually before saving as paid. Permission errors keep retry, image-upload and manual UPI options. Physical-device camera behaviour still needs testing.
- **Import Expenses:** prepare an expense from a bank message, statement file or spoken words. Check it before confirming; it is not saved as a confirmed bill until you approve it.
- **Recurring Bills:** set up repeated bills, such as rent or Wi-Fi. When a bill is due, RoomHisaab prepares it for review; it never marks the bill as paid automatically.
- **Settle Up:** see who should pay whom, open an exact-amount UPI QR/link, and record a payment. The other person can confirm it.
- **Expenses and Reports:** find old bills, restore recent deletions for 30 days on this device, and compare room or member spending by week, month, monthly period or chosen dates.
- **Your balance:** view your own share and payment details while still seeing the room’s shared expenses.
- **Members:** manage room members and their payment profiles.
- **Settings:** choose preferences, export or back up data, manage account recovery, and open About RoomHisaab before the Danger Zone.
- **About and Contact:** the public site and Settings share product information, the developer profile and supplied portrait, and a direct email link. Contact email: 1komalnathyogi1@gmail.com.
- **Help:** search for a task, use the split calculator or look up a word. The guided-tour invitation appears once globally outside the demo; start or replay the tour from More → Help → Start Guided Tour.

RoomHisaab supports cash and UPI records, equal or custom shares, monthly or chosen date periods, dark mode, a phone-friendly layout, and installable app shortcuts. A 3D room scene adds depth to the experience; it loads only when its area is near the screen and the browser is idle, and it pauses for reduced-motion preferences. The app also reduces motion across page transitions and controls when that setting is enabled. Network or device delays can still affect response time; no website can guarantee zero latency.

## Clear payment rules

RoomHisaab can create an exact-amount UPI QR or link and open a payment app. It **cannot read a bank account, silently take money, or prove from the bank that a payment succeeded**. Check the receiver and amount inside your UPI app before approving. Then return to RoomHisaab and record or confirm the payment. Final shared balances follow the app’s member-confirmation rules.

A website cannot guarantee that every phone or UPI app will return to it after payment. If the return prompt does not appear, open the room and record the payment there.

## Accounts and room privacy

Room details are shared with that room’s members. Each person also signs in with their own personal account, so one member cannot use the shared room password to edit another person’s personal profile or entries. Access is protected by Supabase authentication and database rules.

**Remember login** saves only a safe sign-in hint; it does not save a password. Passwords, recovery keys, one-time codes and UPI PINs must never be put in project files, drafts, screenshots or chat messages. Create and keep a Personal Recovery Key somewhere private before you need it.

## Run the website on your computer

You need [Node.js](https://nodejs.org/) and [Git](https://git-scm.com/), both free. Open this project folder in VS Code, then run:

```bash
npm install --include=dev
```

Create a local `.env.local` file in the same folder as `package.json`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Use the Project URL and **publishable** key from your Supabase project. Never put a Supabase secret/service-role key in a browser app. Keep `.env.local` private; it is excluded from Git.

Start the local website:

```bash
npm run dev
```

Open the local address shown in the terminal. To stop the website, press `Ctrl + C` in that terminal.

Before sharing a change, run:

```bash
npm run check
```

This checks TypeScript, 70 app smoke checks, colour contrast and the production build. Additional scripts run Chromium browser tests, an automated axe accessibility scan, ESLint, and the npm dependency audit. Browser tests do not replace physical-device, live-payment, cloud, deployment, screen-reader, or manual accessibility verification. To make a production build alone, run `npm run build`.

## Put this project on GitHub

Create a **private** repository on GitHub first. In the VS Code terminal, from this project folder, run:

```bash
git init
git add .
git commit -m "Add RoomHisaab"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the last address with your own GitHub repository address. `.env.local`, `node_modules` and the built `dist` folder are excluded from Git. Check that `.env.local` is not listed before pushing. Never push passwords or secret keys.

## Supabase and Vercel setup

RoomHisaab uses **Supabase** for sign-in and cloud room data, and **Vercel** to host the website. Create free accounts on their websites if you do not already have them.

1. Create a Supabase project and copy its Project URL and publishable key into Vercel’s project environment variables. Use the same two `VITE_` names shown above.
2. In Supabase Authentication, set the site URL and allowed redirect URLs to your Vercel website address. Add your local development address while testing.
3. Apply the SQL migrations in `supabase/migrations/` only when setting up a **new** database, and follow their order. If using an existing RoomHisaab database, first check which migrations have already been applied. Do not run a migration twice or reset a live database to solve a deployment issue.
4. Import this repository into Vercel and set the project root to this folder. Vercel detects Vite; the build command is `npm run build` and the output folder is `dist`.
5. Add the two Supabase environment variables to Vercel for the Production environment (and Preview if needed), then deploy. Redeploy after changing environment variables; an old build will not pick them up.
6. Test the deployed site: create or join a test room, sign in as separate members, add a small test expense, verify the shared view and member permissions, then remove only test data you created.

Do not publish real user data or secrets in a public test room. A successful local build does not by itself prove that your Supabase or Vercel project is configured correctly; test your own deployment.

## Project map

```text
src/pages/                 Website pages
src/components/            Shared interface and dialogs
src/lib/                   Expense, payment, guide and cloud logic
src/hooks/                 Reusable app behaviour
public/                    Icons, install settings and offline worker
supabase/migrations/       Database changes, applied in order
tests/                     Smoke and colour-contrast checks
```

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Open the website on your computer |
| `npm run check` | Run typecheck, smoke tests, contrast checks and build the site |
| `npm run test:e2e` | Run Playwright product tests in Chromium |
| `npm run test:a11y` | Run the landing-page axe accessibility test |
| `npm run lint` | Run ESLint |
| `npm audit` | Check dependencies for reported vulnerabilities |
| `npm run build` | Create the production website in `dist/` |
| `npm run preview` | Preview the built website locally |
| `npm run typecheck` | Check TypeScript files |
| `npm run smoke` | Run the app’s small logic checks |
| `npm run contrast` | Check the colour contrast pairs |

## Notes

- RoomHisaab uses Indian rupees (INR) and UPI links. The user’s UPI app controls and approves every payment.
- Internet access is needed for Supabase sign-in and cloud rooms. A cloud backup restored as a local copy is separate from the live room.
- The 3D view is decorative. All important amounts and actions are also shown as ordinary text and buttons.
- This repository does not promise automatic bank verification, bank transaction reading, or automatic money transfer.
