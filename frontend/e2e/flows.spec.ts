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

const demoProducts = {
  version: 'v1',
  is_demo: true,
  disclaimer: 'Fictional products and ownership labels for demonstration only. These are not real brands or treatments for hair loss.',
  items: [
    { id: 'demo-gentle-cleanse', name: 'Gentle Cleanse Shampoo', brand: 'Demo Crown Care A', description: 'Fictional example of a shampoo for routine cleansing.', is_demo: true, ownership_badge: 'black owned' },
    { id: 'demo-soft-touch', name: 'Soft Touch Conditioner', brand: 'Demo Crown Care B', description: 'Fictional example of a rinse-out conditioner for a regular wash routine.', is_demo: true, ownership_badge: 'black owned' },
    { id: 'demo-lightweight-moisture', name: 'Lightweight Moisture Spray', brand: 'Demo Crown Care C', description: 'Fictional example of a lightweight spray for a general moisture routine.', is_demo: true, ownership_badge: null },
  ],
}

function healthResponse(demoProductsEnabled: boolean) {
  return {
    status: 'ok', app_env: 'test', ai_mode: 'fake', ai_mode_setting: 'fake',
    openai_key_set: false, ai_enabled: true, library_ready: true,
    rules_version: 'v1', rules_status: 'draft', library_includes_drafts: true,
    demo_products_enabled: demoProductsEnabled,
  }
}

test('trusted recommendations render in a safe, ordered product shelf', async ({ page }) => {
  let history: Record<string, unknown>[] = []
  await page.route('**/api/v1/health', (route) => route.fulfill({ json: healthResponse(true) }))
  await page.route('**/api/v1/coach/history', (route) => route.fulfill({ json: history }))
  await page.route('**/api/v1/coach/ask', async (route) => {
    const request = route.request().postDataJSON() as { question: string }
    const answer = {
      id: `reply-${history.length + 1}`,
      created_at: new Date().toISOString(),
      question: request.question,
      kind: 'answer',
      text: 'Loosen or remove sections that pull and choose a looser style. If thinning continues or worries you, contact your GP.',
      action: 'Ask your stylist for less tension around your hairline.',
      signpost: true,
      professional_guidance: 'If thinning continues or worries you, contact your GP and ask whether a dermatologist referral is appropriate.',
      links: [{ name: 'Find a GP', url: 'https://www.nhs.uk/service-search/find-a-gp' }],
      sources: [{
        article_id: 'tight-styles-and-your-edges',
        title: 'Tight styles and your edges',
        sources: [{ name: 'British Association of Dermatologists', url: 'https://www.skinhealthinfo.org.uk/condition/traction-alopecia' }],
        status: 'draft',
        reviewer: null,
        review_date: null,
      }],
      demo_ai: true,
      demo_products: demoProducts,
    }
    history = [answer, ...history]
    await route.fulfill({ json: answer })
  })

  await register(page)
  await page.goto('/ask')
  await page.getByLabel('Your question').fill('My hairline is thinning after protective styles. What should I do?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()

  const reply = page.getByRole('heading', { name: 'Recommendations' }).locator('xpath=ancestor::article[1]')
  await expect(reply.getByText('General hair-care recommendations, not clinical advice or a diagnosis.')).toBeVisible()
  await expect(reply.getByRole('heading', { name: 'Next steps' })).toBeVisible()
  await expect(reply.getByRole('heading', { name: 'When to seek professional support' })).toBeVisible()
  await expect(reply.getByRole('link', { name: 'Find a GP' })).toBeVisible()
  await expect(reply.getByText('Draft: not yet reviewed by an advisor')).toBeVisible()
  await expect(reply.getByRole('heading', { name: 'Example products — demonstration only' })).toBeVisible()
  await expect(reply.getByText(demoProducts.disclaimer)).toBeVisible()
  await expect(reply.getByText('Demo product', { exact: true })).toHaveCount(3)
  await expect(reply.getByText('black owned', { exact: true })).toHaveCount(2)
  await expect(reply).not.toContainText(/can't suggest|cannot suggest|products are unavailable/i)
  await expect(reply).not.toContainText(/treats hair loss|restores? hairlines?|prevents? hair loss/i)
  await expect(reply.getByRole('link', { name: /buy|shop|purchase/i })).toHaveCount(0)
  await expect(reply.getByRole('button', { name: /buy|shop|purchase/i })).toHaveCount(0)
  const orderedSections = await reply.locator('h3, h4').allTextContents()
  expect(orderedSections).toEqual([
    'Recommendations',
    'Next steps',
    'When to seek professional support',
    'Example products — demonstration only',
    'Gentle Cleanse Shampoo',
    'Soft Touch Conditioner',
    'Lightweight Moisture Spray',
  ])
  await expect(reply.getByText('Sources for these recommendations')).toBeVisible()
  await axe(page, 'trusted recommendations')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Example products — demonstration only' })).toHaveCount(1)
  await page.getByLabel('Your question').fill('Another question about thinning edges.')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Example products — demonstration only' })).toHaveCount(2)
  await expect(page.getByRole('heading', { name: 'Recommendations' })).toHaveCount(2)
})

test('trusted recommendations stay hidden when current capability is off', async ({ page }) => {
  await page.route('**/api/v1/health', (route) => route.fulfill({ json: healthResponse(false) }))
  await page.route('**/api/v1/coach/history', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/v1/coach/ask', (route) => route.fulfill({
    json: {
      id: 'cached-shelf',
      created_at: new Date().toISOString(),
      question: 'My hairline is thinning after protective styles.',
      kind: 'answer',
      text: 'Choose a looser style and contact your GP if thinning continues.',
      signpost: true,
      professional_guidance: 'Contact your GP if thinning continues or worries you.',
      links: [],
      sources: [],
      demo_ai: true,
      demo_products: demoProducts,
    },
  }))
  await register(page)
  await page.goto('/ask')
  await page.getByLabel('Your question').fill('My hairline is thinning after protective styles.')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recommendations' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Example products — demonstration only' })).toHaveCount(0)
  await expect(page.getByText('General hair-care recommendations, not clinical advice or a diagnosis.')).toBeVisible()
})

test('trusted recommendations remain readable with accessibility preferences', async ({ page }) => {
  let history: Record<string, unknown>[] = []
  await page.route('**/api/v1/health', (route) => route.fulfill({ json: healthResponse(true) }))
  await page.route('**/api/v1/coach/history', (route) => route.fulfill({ json: history }))
  await page.route('**/api/v1/coach/ask', async (route) => {
    const request = route.request().postDataJSON() as { question: string }
    const answer = {
      id: 'preference-reply',
      created_at: new Date().toISOString(),
      question: request.question,
      kind: 'answer',
      text: 'Choose looser styles to reduce tension. Contact your GP if thinning continues.',
      action: 'Ask your stylist for less tension.',
      signpost: true,
      professional_guidance: 'If thinning continues or worries you, contact your GP.',
      links: [{ name: 'Find a GP', url: 'https://www.nhs.uk/service-search/find-a-gp' }],
      sources: [{
        article_id: 'tight-styles-and-your-edges',
        title: 'Tight styles and your edges',
        sources: [{ name: 'British Association of Dermatologists', url: 'https://www.skinhealthinfo.org.uk/condition/traction-alopecia' }],
        status: 'draft',
        reviewer: null,
        review_date: null,
      }],
      demo_ai: true,
      demo_products: demoProducts,
    }
    history = [answer]
    await route.fulfill({ json: answer })
  })

  await register(page)
  await page.goto('/ask')
  await page.getByLabel('Your question').fill('My hairline is thinning after braids.')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Example products — demonstration only' })).toBeVisible()

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Match my device', exact: true }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  await page.getByRole('button', { name: 'High contrast', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high')
  await page.getByRole('button', { name: 'Larger', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-text', 'larger')
  await page.getByRole('button', { name: 'Easier to read (Atkinson Hyperlegible)', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-font', 'readable')

  await page.goto('/ask')
  await expect(page.getByRole('heading', { name: 'Example products — demonstration only' })).toBeVisible()
  await expect(page.getByText('black owned', { exact: true })).toHaveCount(2)
  await axe(page, 'trusted recommendations with accessibility preferences')
})

test('trusted recommendations stay suppressed for negative answers and failed health', async ({ page }) => {
  await page.route('**/api/v1/health', (route) => route.fulfill({
    status: 503,
    json: { detail: { message: 'Health capability is temporarily unavailable.' } },
  }))
  await page.route('**/api/v1/coach/history', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/v1/coach/ask', async (route) => {
    const { question } = route.request().postDataJSON() as { question: string }
    const kind = question.includes('urgent') ? 'see_someone_now'
      : question.includes('support') ? 'support' : 'out_of_scope'
    await route.fulfill({
      json: {
        id: `negative-${kind}`,
        created_at: new Date().toISOString(),
        question,
        kind,
        text: 'This response needs no product shelf.',
        action: 'Contact a professional if needed.',
        signpost: kind === 'see_someone_now',
        links: [],
        sources: [],
        demo_ai: true,
        demo_products: demoProducts,
      },
    })
  })

  await register(page)
  await page.goto('/ask')
  await expect(page.getByRole('alert').filter({ hasText: 'Health capability is temporarily unavailable.' })).toBeVisible()
  const textarea = page.getByLabel('Your question')
  for (const question of [
    'urgent hair concern',
    'wellbeing support concern',
    'an out of scope question',
  ]) {
    await textarea.fill(question)
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    await expect(page.getByText('This response needs no product shelf.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Recommendations' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Example products — demonstration only' })).toHaveCount(0)
    await expect(page.getByRole('article').filter({ hasText: question })).toBeVisible()
  }
})

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
