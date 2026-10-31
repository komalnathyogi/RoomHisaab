import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const widths = [320, 360, 375, 390, 414, 430, 480, 768, 1024, 1280, 1440, 1920]

async function openDemo(page: import('@playwright/test').Page, mode: 'personal' | 'shared') {
  await page.goto('/')
  await page.locator('#demo').scrollIntoViewIfNeeded()
  if (mode === 'personal') await page.locator('#demo').getByRole('button', { name: '1 Member', exact: true }).click()
  else await page.locator('#demo').getByRole('button', { name: '3 Members', exact: true }).click()
  await page.locator('#demo').getByRole('button', { name: 'Start Demo' }).click()
  await expect(page).toHaveURL(/\/room$/)
}

test('landing preview switches between one member and shared examples', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Room Expenses/i })).toBeVisible()
  await page.locator('#preview').getByRole('button', { name: '3 Members', exact: true }).click()
  await expect(page.getByText('Green Villa · Total Spent')).toBeVisible()
  await page.locator('#preview').getByRole('button', { name: '1 Member', exact: true }).click()
  await expect(page.getByText('My Room · Total Spent')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
})

test('landing anchors update the hash, respect reduced motion, and restore scroll on Back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveCount(8)
  await expect(page.getByRole('link', { name: 'How It Works' }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Create Room', exact: true }).first().click()
  await expect(page).toHaveURL(/#create-room$/)
  await page.getByRole('link', { name: 'Join Room', exact: true }).first().click()
  await expect(page).toHaveURL(/#join-room$/)
  await page.getByRole('link', { name: 'Sign In', exact: true }).first().click()
  await expect(page).toHaveURL(/#sign-in$/)
  await page.getByRole('link', { name: 'How It Works' }).first().click()
  await expect(page).toHaveURL(/#how-it-works$/)
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).scrollBehavior)).toBe('auto')
  for (const [label, hash] of [['Features', '#features'], ['Try Demo', '#demo'], ['About Us', '#about'], ['Contact Us', '#contact']]) {
    await page.getByRole('link', { name: label, exact: true }).first().click()
    await expect(page).toHaveURL(new RegExp(`${hash}$`))
    await expect(page.locator('header').getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'location')
  }
  await page.locator('#sign-in').getByRole('link', { name: 'Sign In to My Room' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goBack()
  await expect(page).toHaveURL(/#contact$/)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400)
})

test('member-count demo is sample-only, switchable, repeatable and safely exits', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/demo')
  await expect(page).toHaveURL(/#demo$/)
  await expect(page.getByRole('heading', { name: 'Try RoomHisaab' })).toBeVisible()
  await expect(page.getByText('3 Members', { exact: true }).first()).toBeVisible()
  await page.locator('#demo').getByRole('button', { name: '5 Members', exact: true }).click()
  await page.locator('#demo').getByRole('button', { name: 'Start Demo' }).click()
  await expect(page).toHaveURL(/\/room$/)
  await expect(page.getByLabel('Demo mode controls')).toBeVisible()
  await expect(page.getByText('Demo Mode — Sample Data')).toBeVisible()
  await expect(page.getByText(/5 sample members/)).toBeVisible()
  await expect(page.getByTestId('welcome-tour')).toHaveCount(0)
  await expect(page.getByText("You're Exploring a Demo")).toBeVisible()
  await page.getByRole('button', { name: 'Switch Member' }).click()
  await expect(page.getByRole('dialog', { name: 'Choose a Demo Member' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button').nth(1).click()
  await expect(page.getByText(/Viewing as/)).toBeVisible()
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('roomhisaab.v1.demo') ?? '{}'))
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset Demo' }).click()
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('roomhisaab.v1.demo') ?? '{}').members?.length)).toBe(5)
  const reset = await page.evaluate(() => JSON.parse(localStorage.getItem('roomhisaab.v1.demo') ?? '{}'))
  expect(reset.members.map((member: { name: string }) => member.name)).toEqual(original.members.map((member: { name: string }) => member.name))
  expect(reset.expenses.map((expense: { description: string; amountPaise: number }) => [expense.description, expense.amountPaise])).toEqual(original.expenses.map((expense: { description: string; amountPaise: number }) => [expense.description, expense.amountPaise]))
  await page.getByLabel('Demo mode controls').getByRole('button', { name: 'Generate New Demo' }).click()
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('roomhisaab.v1.demo') ?? '{}').room?.demoSeed)).not.toBe(reset.room.demoSeed)
  await expect(page.getByTestId('welcome-tour')).toHaveCount(0)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Demo mode controls').getByRole('button', { name: 'Exit Demo', exact: true }).click()
  await expect(page).toHaveURL('/')
})

test('opening and exiting a demo restores the saved real room without overwriting it', async ({ page }) => {
  const now = Date.now()
  await page.addInitScript((createdAt: number) => {
    const realState = {
      version: 1,
      room: { id: 'real-room-fixture', name: 'My saved room', code: 'REAL42', rentCycleDay: 1, createdAt, mode: 'personal' },
      members: [{ id: 'real-member-fixture', name: 'Real Member', color: '#5046C8', joinedAt: createdAt }],
      expenses: [], settlements: [], recurring: [], rules: [], merchants: [], inbox: [],
      profile: { id: 'profile-real', memberId: 'real-member-fixture', name: 'Real Member', theme: 'system', language: 'en', reduceMotion: false, onboarded: true },
    }
    localStorage.setItem('roomhisaab.v1', JSON.stringify(realState))
    localStorage.setItem('roomhisaab.v1.demo.active', '0')
  }, now)
  await page.goto('/')
  await page.locator('#demo').scrollIntoViewIfNeeded()
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('#demo').getByRole('button', { name: 'Start Demo' }).click()
  await expect(page.getByLabel('Demo mode controls')).toBeVisible()
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('roomhisaab.v1') ?? '{}').room?.name)).toBe('My saved room')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Demo mode controls').getByRole('button', { name: 'Exit Demo', exact: true }).click()
  await expect(page).toHaveURL('/')
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('roomhisaab.v1.demo.active'))).toBe('0')
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('roomhisaab.v1') ?? '{}'))
  expect(restored.room.name).toBe('My saved room')
  expect(restored.members[0].name).toBe('Real Member')
  expect(restored.room.demo).not.toBe(true)
})

test('demo member selector enforces the 1-to-10 range and starts at the chosen count', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.locator('#demo').scrollIntoViewIfNeeded()
  const increase = page.locator('#demo').getByRole('button', { name: 'Increase member count' })
  for (let count = 3; count < 10; count++) await increase.click()
  await expect(page.locator('#demo').getByText('10 Members', { exact: true })).toBeVisible()
  await expect(increase).toBeDisabled()
  await page.locator('#demo').getByRole('button', { name: '2 Members', exact: true }).click()
  await page.locator('#demo').getByRole('button', { name: 'Start Demo' }).click()
  await expect(page.getByText(/2 sample members/)).toBeVisible()
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('roomhisaab.v1.demo') ?? '{}').members?.length)).toBe(2)
})

test('Quick Pay opens an expense form first and preserves it when the scanner closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => { const error = new Error('permission denied'); error.name = 'NotAllowedError'; throw error },
        enumerateDevices: async () => [],
      },
    })
  })
  const now = Date.now()
  await page.addInitScript((createdAt: number) => {
    localStorage.setItem('roomhisaab.v1', JSON.stringify({ version: 1, room: { id: 'quick-pay-room', name: 'Quick Pay Room', code: 'QP1234', rentCycleDay: 1, createdAt, mode: 'shared' }, members: [{ id: 'quick-pay-member', name: 'Test Member', color: '#5046C8', joinedAt: createdAt }], expenses: [], settlements: [], recurring: [], rules: [], merchants: [], inbox: [], profile: { id: 'qp-profile', memberId: 'quick-pay-member', name: 'Test Member', theme: 'system', language: 'en', reduceMotion: false, onboarded: true } }))
  }, now)
  await page.goto('/room/buy?mode=scan')
  await expect(page).toHaveURL(/mode=scan$/)
  await expect(page.getByLabel('What did you buy? *')).toBeVisible()
  await expect(page.getByLabel('Amount *')).toBeVisible()
  await expect(page.getByLabel('Who paid?')).toBeVisible()
  await expect(page.getByLabel('Who shares this expense?')).toBeVisible()
  await expect(page.getByLabel('Payment app')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Scan seller QR' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Scan Seller QR' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter what you bought')
  await expect(page.getByRole('dialog', { name: 'Scan seller QR' })).toHaveCount(0)
  await page.getByLabel('What did you buy? *').fill('Preserved groceries')
  await page.getByLabel('Amount *').fill('345')
  await page.getByRole('button', { name: 'Scan Seller QR' }).click()
  await expect(page.getByRole('dialog', { name: 'Scan seller QR' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Camera Access Is Blocked' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible()
  await page.getByRole('button', { name: 'Close QR scanner' }).click()
  await expect(page.getByRole('dialog', { name: 'Scan seller QR' })).toHaveCount(0)
  await expect(page.getByLabel('What did you buy? *')).toHaveValue('Preserved groceries')
  await expect(page.getByLabel('Amount *')).toHaveValue('345')
})

test('desktop Quick Pay button opens the expense form, not the scanner', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const now = Date.now()
  await page.addInitScript((createdAt: number) => {
    localStorage.setItem('roomhisaab.v1', JSON.stringify({ version: 1, room: { id: 'quick-pay-room', name: 'Quick Pay Room', code: 'QP1234', rentCycleDay: 1, createdAt, mode: 'shared' }, members: [{ id: 'quick-pay-member', name: 'Test Member', color: '#5046C8', joinedAt: createdAt }], expenses: [], settlements: [], recurring: [], rules: [], merchants: [], inbox: [], profile: { id: 'qp-profile', memberId: 'quick-pay-member', name: 'Test Member', theme: 'system', language: 'en', reduceMotion: false, onboarded: true } }))
  }, now)
  await page.goto('/room')
  await page.getByRole('button', { name: 'Quick Pay' }).first().click()
  await expect(page).toHaveURL(/\/room\/buy\?mode=scan$/)
  await expect(page.getByLabel('What did you buy? *')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Scan seller QR' })).toHaveCount(0)
  await page.getByLabel('What did you buy? *').fill('Desktop test item')
  await page.getByLabel('Amount *').fill('100')
  await page.getByRole('button', { name: 'Scan Seller QR' }).click()
  await expect(page.getByRole('dialog', { name: 'Scan seller QR' })).toBeVisible()
})

test('one-member navigation hides shared settlements and redirects direct payment route', async ({ page }) => {
  await openDemo(page, 'personal')
  await expect(page.getByRole('link', { name: 'Reports' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Settle Up' })).toHaveCount(0)
  await page.goto('/room/payments')
  await expect(page).toHaveURL(/\/room\/insights$/)
})

test('adding a second member switches to shared mode without changing old personal splits', async ({ page }) => {
  await openDemo(page, 'personal')
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('roomhisaab.v1.demo') ?? '{}').expenses?.length ?? 0)).toBeGreaterThan(0)
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('roomhisaab.v1.demo') ?? '{}'))
  const firstExpense = before.expenses[0]
  await page.goto('/room/members')
  await page.getByLabel('Nickname *').fill('Roommate')
  await page.getByRole('button', { name: 'Add member', exact: true }).click()
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('roomhisaab.v1.demo') ?? '{}').members?.length)).toBe(2)
  const after = await page.evaluate((id) => JSON.parse(localStorage.getItem('roomhisaab.v1.demo') ?? '{}').expenses.find((expense: { id: string }) => expense.id === id), firstExpense.id)
  expect(after.splits).toEqual(firstExpense.splits)
  await expect(page.getByRole('link', { name: 'Settle Up' }).first()).toBeVisible()
})

test('a rapid double click on Save Expense records one expense', async ({ page }) => {
  await openDemo(page, 'personal')
  await page.goto('/room/buy')
  await page.getByLabel('What did you buy? *').fill('Double click test')
  await page.getByLabel('Amount *').fill('250')
  const save = page.getByRole('button', { name: /Save Expense/ }).last()
  await save.dblclick({ delay: 5 })
  await expect(page).toHaveURL((url) => url.pathname === '/room')
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('roomhisaab.v1.demo') ?? '{}').expenses?.filter((expense: { description: string }) => expense.description === 'Double click test').length)).toBe(1)
})

test('global guide invitation is dismissed once and the manual Help tour remains available', async ({ page }) => {
  const now = Date.now()
  await page.addInitScript((createdAt: number) => {
    localStorage.setItem('roomhisaab.v1', JSON.stringify({ version: 1, room: { id: 'tour-room', name: 'Tour Room', code: 'TOUR12', rentCycleDay: 1, createdAt, mode: 'personal' }, members: [{ id: 'tour-member', name: 'Test Member', color: '#5046C8', joinedAt: createdAt }], expenses: [], settlements: [], recurring: [], rules: [], merchants: [], inbox: [], profile: { id: 'tour-profile', memberId: 'tour-member', name: 'Test Member', theme: 'system', language: 'en', reduceMotion: false, onboarded: true } }))
  }, now)
  await page.goto('/room')
  const tour = page.getByTestId('welcome-tour')
  await expect(tour).toBeVisible()
  await tour.getByRole('button', { name: 'Skip tour' }).click()
  await expect(tour).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('roomhisaab.welcomeTour.dismissed.global.v1'))).toBe('1')
  await page.goto('/room/guide')
  await page.goto('/room')
  await page.reload()
  await expect(tour).toHaveCount(0)
  await page.goto('/room/guide')
  await page.getByRole('link', { name: /Start Guided Tour/ }).click()
  await expect(page).toHaveURL(/\/room$/)
  await expect(tour).toBeVisible()
  await tour.getByRole('button', { name: 'Close welcome tour' }).click()
  await expect(tour).toHaveCount(0)
})

test('member selector and one-member dashboard remain usable in narrow and landscape layouts', async ({ page }) => {
  test.setTimeout(120_000)
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `demo setup overflow at ${width}px`).toBeTruthy()
  }
  await openDemo(page, 'personal')
  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `dashboard overflow at ${viewport.width}x${viewport.height}`).toBeTruthy()
  }
})

test('About and Contact sections use the supplied portrait and appear in Settings', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#about')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Meet the Developer' })).toBeVisible()
  const portrait = page.getByRole('img', { name: 'Portrait of Komal Nath Yogi' })
  await portrait.scrollIntoViewIfNeeded()
  await expect(portrait).toHaveAttribute('src', '/images/developer-komal-nath-yogi.jpg')
  await expect.poll(() => portrait.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512)
  await expect(page.getByRole('link', { name: /Send an Email/ })).toHaveAttribute('href', 'mailto:1komalnathyogi1@gmail.com')

  await openDemo(page, 'personal')
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'About RoomHisaab', exact: true })).toBeVisible()
  await expect(page.getByText('Version 7.2.3-rc.0 · Release candidate')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Danger Zone' })).toBeVisible()
  const aboutHeading = await page.getByRole('heading', { name: 'About RoomHisaab', exact: true }).evaluate((el) => el.getBoundingClientRect().top)
  const dangerHeading = await page.getByRole('heading', { name: 'Danger Zone' }).evaluate((el) => el.getBoundingClientRect().top)
  expect(aboutHeading).toBeLessThan(dangerHeading)
  await page.goto('/room/about')
  await expect(page.getByRole('heading', { name: 'Meet the Developer' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Portrait of Komal Nath Yogi' })).toHaveAttribute('src', '/images/developer-komal-nath-yogi.jpg')
})

test('About Us is available from More for personal and shared rooms', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const mode of ['personal', 'shared'] as const) {
    await openDemo(page, mode)
    await page.getByRole('button', { name: 'More' }).click()
    const more = page.getByRole('dialog', { name: 'More options' })
    await expect(more.getByRole('button', { name: /About Us/ })).toBeVisible()
    await more.getByRole('button', { name: /About Us/ }).click()
    await expect(page).toHaveURL(/\/room\/about$/)
    await expect(page.getByRole('heading', { name: 'Meet the Developer' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Portrait of Komal Nath Yogi' })).toHaveAttribute('src', '/images/developer-komal-nath-yogi.jpg')
    if (mode === 'personal') await page.goto('/')
  }
})

test('landing action sections send users to their existing routes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Create Room Now' }).click()
  await expect(page).toHaveURL(/\/onboarding$/)
  await page.goto('/#join-room')
  await page.getByRole('link', { name: 'Join Room Now' }).click()
  await expect(page).toHaveURL(/\/join$/)
  await page.goto('/#sign-in')
  await page.getByRole('link', { name: 'Sign In to My Room' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/#sign-in')
  await page.getByRole('link', { name: 'Forgot Password?' }).click()
  await expect(page).toHaveURL(/\/recover$/)
})

test('mobile landing menu shows all eight destinations and closes after navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.locator('button[aria-controls="landing-mobile-menu"]').click()
  await expect(page.getByRole('navigation', { name: 'Mobile landing menu' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Mobile landing menu' }).getByRole('link')).toHaveCount(8)
  await page.getByRole('navigation', { name: 'Mobile landing menu' }).getByRole('link', { name: 'About Us', exact: true }).click()
  await expect(page).toHaveURL(/#about$/)
  await expect(page.locator('#about')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Mobile landing menu' })).toHaveCount(0)
})

test('landing page has no horizontal overflow at target widths', async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(hasOverflow, `unexpected horizontal overflow at ${width}px`).toBeFalsy()
  }
})

test('landing page passes axe WCAG 2.2 AA automated checks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Room Expenses/i })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1000) // Let initial entrance transitions settle before measuring contrast.
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length }))).toEqual([])
})
