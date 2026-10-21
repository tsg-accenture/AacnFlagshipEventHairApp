import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Each run registers a fresh account, so the tests don't depend on each other's data.
const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

// Newer browsers return a Promise from scroll methods. Behave like them here, so code that leaks a
// return value into React (for example an effect with an expression body) fails these tests too.
// And fail any test that logs an uncaught error or a console error.
let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  await page.addInitScript(() => {
    const wrap = (target: object, key: string) => {
      const original = (target as Record<string, unknown>)[key] as ((...a: unknown[]) => unknown) | undefined
      if (typeof original !== 'function') return
      Object.defineProperty(target, key, {
        configurable: true,
        writable: true,
        value: function (this: unknown, ...args: unknown[]) {
          original.apply(this, args)
          return Promise.resolve()
        },
      })
    }
    for (const k of ['scrollIntoView', 'scrollTo', 'scrollBy', 'scroll']) wrap(Element.prototype, k)
    for (const k of ['scrollTo', 'scrollBy', 'scroll']) wrap(window, k)
  })
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    // A failed request (for example an expected 401 or 422) also logs a console error: those are fine.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) pageErrors.push(`console: ${m.text()}`)
  })
})
test.afterEach(() => {
  expect(pageErrors, 'errors in the browser console').toEqual([])
})

async function axe(page: Page, name: string) {
  // Let entrance animations finish first, so contrast is measured on the settled page.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`)
  expect(summary, `axe violations on ${name}`).toEqual([])
  // No sideways scrolling: the page must fit the screen at every size.
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width, `page wider than the screen on ${name}`).toBeLessThanOrEqual(page.viewportSize()!.width)
}

async function register(page: Page) {
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Ama')
  await page.getByLabel('Email').fill(unique())
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByLabel(/18 or over/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/privacy\/receipt/)
}

test('welcome page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your hair')
  await expect(page.getByText('No photos needed to start.')).toBeVisible()
  await axe(page, 'welcome')
})

test('sign up, consent, onboard, check in, ask, check, escalate, share', async ({ page }) => {
  await register(page)
  await axe(page, 'data receipt')
  await page.getByRole('switch', { name: 'Keep my check-ins and hair-health notes' }).click()
  await expect(page.getByRole('switch', { name: 'Keep my check-ins and hair-health notes' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Onboarding chat
  await expect(page).toHaveURL(/\/start/)
  await page.getByRole('button', { name: 'Help with my routine' }).click()
  await page.getByRole('button', { name: 'Braids', exact: true }).click()
  const installed = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)
  await page.getByLabel('Install date').fill(installed)
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Every week' }).click()
  await page.getByRole('button', { name: 'Fri' }).click()
  await page.getByRole('button', { name: 'Heat styling' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Healthy edges' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Not now' }).click() // reminders
  await axe(page, 'onboarding')
  await page.getByRole('button', { name: 'Go to Today' }).click()

  // Today: day 4 of braids, day-3 check-in card answered in place
  await expect(page).toHaveURL(/\/today/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ama')
  await expect(page.getByText(/Day 4 of braids/)).toBeVisible()
  await axe(page, 'today')
  await page.getByRole('button', { name: 'It hurts' }).click()
  await expect(page).toHaveURL(/\/check-in\/day-3\?tightness=hurts/)
  await page.getByText('Lots', { exact: true }).click()
  await axe(page, 'check-in')
  await page.getByRole('button', { name: 'Save check-in' }).click()
  await expect(page.getByText('This sounds too tight')).toBeVisible()
  await expect(page.getByText('Worth getting checked', { exact: true })).toBeVisible()
  await axe(page, 'check-in result')

  // Hair Coach
  await page.goto('/ask')
  await page.getByLabel('Your question').fill('How tight should my braids be? My edges are sore.')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByText('From our library', { exact: true })).toBeVisible()
  await expect(page.getByText('Draft: not yet reviewed by an advisor').first()).toBeVisible()
  await axe(page, 'ask')

  // Crown Map check, questions only
  await page.goto('/check')
  await page.getByRole('button', { name: 'Hairline and edges' }).click()
  await page.getByRole('button', { name: 'Next: questions for 1 zone' }).click()
  await page.locator('label[for="hairline-tender-yes"]').click()
  await page.locator('label[for="hairline-bumps-yes"]').click()
  await axe(page, 'check questions')
  await page.getByRole('button', { name: 'Next: photos (optional)' }).click()
  await page.getByRole('button', { name: 'See my results' }).click()
  await expect(page.getByRole('heading', { name: 'Your results' })).toBeVisible()
  await expect(page.getByText('Get checked').first()).toBeVisible()
  await axe(page, 'check results')

  await page.goto('/map')
  await expect(page.getByRole('img', { name: /Hairline: Get checked/ })).toBeVisible()
  await axe(page, 'map')
  await page.goto('/map/hairline')
  await expect(page.getByText('Rules-based state')).toBeVisible()
  await axe(page, 'zone detail')

  // Get checked: reasons, links, care pack after sharing consent
  await page.goto('/get-checked')
  await expect(page.getByText('Why we’re suggesting this').or(page.getByText("Why we're suggesting this"))).toBeVisible()
  await axe(page, 'get checked')
  await page.getByRole('button', { name: "Yes, that's OK" }).click()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download care pack (PDF)' }).click()])
  expect(dl.suggestedFilename()).toBe('crown-ai-care-pack.pdf')

  // Stylist note
  await page.goto('/stylist-note')
  await page.getByRole('button', { name: 'Write my note' }).click()
  await expect(page.locator('pre')).toContainText('Please keep it loose around my edges and temples.')
  await axe(page, 'stylist note')

  // Journal, wash day, plan, goals, settings
  for (const [path, heading] of [
    ['/journal', 'Journal'], ['/wash-day', 'Set up'], ['/plan', 'My care plan'], ['/goals', 'Goals'], ['/settings', 'Settings'],
    ['/settings/data', 'Export or delete my data'], ['/take-down', 'Take-down day'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading)
    await axe(page, path)
  }

  // High contrast and patterns still pass
  await page.goto('/settings')
  await page.getByRole('button', { name: 'High contrast' }).click()
  await page.getByRole('button', { name: /On: shapes/ }).click()
  await page.getByRole('button', { name: 'Dark' }).click()
  await page.goto('/map')
  await axe(page, 'map, dark high contrast')
})

test('signed-out visitors are sent to sign in', async ({ page }) => {
  await page.goto('/today')
  await expect(page).toHaveURL(/\/login\?next=%2Ftoday/)
  await axe(page, 'login')
})

test('photo check: consent, upload, run, retention off deletes the photo', async ({ page }) => {
  await register(page)
  await page.getByRole('switch', { name: 'Keep my check-ins and hair-health notes' }).click()
  await page.goto('/check?zones=crown')
  await page.getByRole('button', { name: 'Next: questions for 1 zone' }).click()
  await page.getByRole('button', { name: 'Next: photos (optional)' }).click()
  // Just-in-time consent for photo analysis
  await page.getByRole('button', { name: "Yes, that's OK" }).click()
  await expect(page.getByRole('switch', { name: 'Keep my photos' })).toHaveAttribute('aria-checked', 'false')
  await page.locator('#photo-crown').setInputFiles('e2e/fixtures/test-pattern.jpg')
  await expect(page.getByText('Photo added.')).toBeVisible({ timeout: 20_000 })
  await axe(page, 'photo step')
  await page.getByRole('button', { name: 'See my results' }).click()
  await expect(page.getByRole('heading', { name: 'Your results' })).toBeVisible()
  await page.goto('/map/crown')
  await expect(page.getByText('AI observation')).toBeVisible()
  await expect(page.getByText("Couldn't tell")).toBeVisible()
  // Retention was off, so no photo is shown on the zone page
  await expect(page.getByRole('heading', { name: 'Your photo' })).toHaveCount(0)
})

test('sign-in never redirects to another site', async ({ page }) => {
  const email = unique()
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByLabel(/18 or over/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/privacy\/receipt/)
  const home = new URL(page.url()).host
  for (const evil of ['/\\evil.example', '//evil.example', 'https://evil.example/x']) {
    await page.context().clearCookies()
    await page.goto(`/login?next=${encodeURIComponent(evil)}`)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('correct horse battery')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/(start|today)/)
    expect(new URL(page.url()).host).toBe(home)
  }
})
