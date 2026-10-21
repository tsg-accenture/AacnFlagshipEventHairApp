'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { useHealth, useMe } from '@/lib/hooks'
import { CrownMark, IconAsk, IconCheck, IconGoal, IconJournal, IconMap, IconPlan, IconSearch, IconSettings, IconToday } from './icons'
import { IconButton, Loading, Notice } from './ui'

const TABS = [
  { href: '/today', label: 'Today', Icon: IconToday },
  { href: '/map', label: 'Map', Icon: IconMap },
  { href: '/check', label: 'Check', Icon: IconCheck, centre: true },
  { href: '/ask', label: 'Ask', Icon: IconAsk },
  { href: '/journal', label: 'Journal', Icon: IconJournal },
]
const MORE = [
  { href: '/plan', label: 'My plan', Icon: IconPlan },
  { href: '/goals', label: 'Goals', Icon: IconGoal },
  { href: '/settings', label: 'Settings', Icon: IconSettings },
]

function active(path: string, href: string) {
  return path === href || path.startsWith(href + '/')
}

function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className="flex items-center gap-2.5">
      <CrownMark size={size === 'lg' ? 36 : 32} />
      <span className={`font-serif font-medium leading-none tracking-[-0.01em] ${size === 'lg' ? 'text-[1.6rem]' : 'text-[1.4rem]'}`}>
        Crown <em className="font-bold text-accent">AI</em>
      </span>
    </span>
  )
}

/** Signed-in layout: a floating pill tab bar round a black centre Check on phone and tablet, a floating side bar on laptop. */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const me = useMe()
  const health = useHealth()

  useEffect(() => {
    if (me.error && (me.error as { status?: number }).status === 401) router.replace(`/login?next=${encodeURIComponent(path)}`)
  }, [me.error, path, router])

  const draft = health.data && (health.data.rules_status !== 'reviewed' || health.data.library_includes_drafts)
  const demo = health.data?.ai_mode === 'fake'

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[18.5rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-lime focus:px-4 focus:py-2 focus:text-on-lime">
        Skip to content
      </a>

      {/* Laptop: floating side bar */}
      <aside className="sticky top-0 hidden h-dvh p-4 lg:block">
        <div className="flex h-full flex-col rounded-sheet border border-line bg-surface px-4 py-6 hc-border">
          <Link href="/today" className="mb-8 px-3" aria-label="Crown AI, Today">
            <Wordmark size="lg" />
          </Link>
          <nav aria-label="Main">
            <ul className="space-y-1">
              {[...TABS.filter((t) => !t.centre), ...MORE].map(({ href, label, Icon }) => {
                const on = active(path, href)
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={on ? 'page' : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-full px-4 font-semibold transition-colors ${on ? 'bg-ink text-surface' : 'text-ink hover:bg-raised'}`}
                    >
                      <Icon />
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
          <Link
            href="/check"
            aria-current={active(path, '/check') ? 'page' : undefined}
            className="mt-6 flex min-h-14 items-center justify-between rounded-full bg-lime py-2 pl-5 pr-2 font-semibold text-on-lime hc-border"
          >
            Start a check
            <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink text-surface">
              <IconCheck size={20} />
            </span>
          </Link>
          <div className="mt-auto space-y-2 px-3 text-[0.85rem] text-muted">
            {demo && (
              <p>
                <span className="font-bold text-ink">Demo AI.</span> Replies are canned, not from OpenAI.
                {health.data?.openai_key_set && <> Your key is set but <code>AI_MODE=fake</code> keeps it unused.</>}
              </p>
            )}
            {draft && <p><span className="font-bold text-ink">Draft content.</span> Rules and articles await clinical review.</p>}
            <p>General guidance and signposting. Crown AI doesn&apos;t diagnose.</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phone and tablet top bar */}
        <header className="flex items-center justify-between gap-2 px-4 pt-4 lg:hidden">
          <Link href="/today" aria-label="Crown AI, Today">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            {(demo || draft) && (
              <Link href="/settings#about" className="glass inline-flex min-h-11 items-center rounded-full px-3.5 text-[0.8rem] font-semibold">
                {demo ? 'Demo AI' : 'Draft content'}
              </Link>
            )}
            <IconButton href="/ask" label="Ask the Hair Coach">
              <IconSearch size={22} />
            </IconButton>
            <IconButton href="/settings" label="Settings">
              <IconSettings size={22} />
            </IconButton>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-40 pt-6 lg:max-w-5xl lg:px-10 lg:pb-16 lg:pt-10">
          {me.isLoading ? (
            <Loading />
          ) : me.data ? (
            children
          ) : me.error && (me.error as { status?: number }).status !== 401 ? (
            <Notice tone="error" title="Can't reach Crown AI">
              The app couldn&apos;t reach its server. Check the backend is running (see the README), then reload this page.
            </Notice>
          ) : null}
        </main>
      </div>

      {/* Phone and tablet: floating tab bar. The current tab opens into a black pill with its name. */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
        <ul className="blur-sheet mx-auto flex max-w-md items-center justify-between rounded-full border border-line p-2 shadow-float">
          {TABS.map(({ href, label, Icon, centre }) => {
            const on = active(path, href)
            if (centre) {
              return (
                <li key={href} className="-my-5">
                  <Link
                    href={href}
                    aria-current={on ? 'page' : undefined}
                    aria-label={label}
                    title={label}
                    className="inline-flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-ink text-ink-icon shadow-float ring-[5px] ring-ground"
                  >
                    <Icon size={28} />
                  </Link>
                </li>
              )
            }
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={on ? 'page' : undefined}
                  title={label}
                  className={`inline-flex h-12 items-center justify-center gap-2 rounded-full font-semibold transition-colors ${on ? 'bg-ink px-4 text-surface' : 'w-12 text-ink hover:bg-raised'}`}
                >
                  <Icon />
                  <span className={on ? 'text-[0.9rem]' : 'sr-only'}>{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
