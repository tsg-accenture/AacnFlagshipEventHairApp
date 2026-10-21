'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import type { JSX } from 'react'
import { IconCalendar, IconChevronsRight, IconClock, IconDrop, IconSparkle, IconSun, IconWand } from '@/components/icons'
import { ActionPill, Button, ErrorText, Loading, PageHeader } from '@/components/ui'
import { api } from '@/lib/api'
import { shortDate, useHealth } from '@/lib/hooks'
import type { Plan } from '@/lib/types'

const SECTION_ICON: Record<string, (p: { size?: number }) => JSX.Element> = {
  daily: IconSun,
  weekly: IconCalendar,
  monthly: IconClock,
  for_you: IconSparkle,
  seasonal: IconDrop,
}

/** Care plan (FR07), as board 2's "Personalised hair care" rows. Items come from advisor templates; AI only writes the intro. */
export default function PlanPage() {
  const qc = useQueryClient()
  const health = useHealth()
  const plan = useQuery({ queryKey: ['plan'], queryFn: () => api<Plan>('/plans/current') })
  const refresh = useMutation({
    mutationFn: () => api<Plan>('/plans/refresh', { method: 'POST' }),
    onSuccess: (p) => qc.setQueryData(['plan'], p),
  })
  if (plan.isLoading) return <Loading />
  if (!plan.data) return <ErrorText error={plan.error} />
  const p = plan.data
  return (
    <div className="space-y-6">
      <PageHeader title={<>My care <em>plan</em></>} lead={p.intro} back={{ href: '/today', label: 'Today' }}>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[0.86rem] text-muted hc-border">
          <IconWand size={16} />
          {p.intro_source === 'ai' && p.intro_written_at ? `Intro written by AI from the plan items on ${shortDate(p.intro_written_at)}. ` : ''}
          Items come from draft care templates.
        </p>
      </PageHeader>

      <ActionPill href="/wash-day" title="Start wash-day mode" body="One step at a time, with a timer" icon={<IconDrop />} />

      <div className="grid gap-6 lg:grid-cols-2">
        {p.sections.filter((s) => s.items.length || s.note).map((s) => {
          const Icon = SECTION_ICON[s.id] ?? IconSparkle
          return (
            <section key={s.id} aria-labelledby={`sec-${s.id}`}>
              <h2 id={`sec-${s.id}`} className="title-md mb-3">{s.title}</h2>
              {s.items.length ? (
                <ul className="space-y-2.5">
                  {s.items.map((i) => (
                    <li key={i.id} className="flex min-h-[4.5rem] items-center gap-4 rounded-tile border border-line bg-surface p-3 hc-border">
                      <span aria-hidden="true" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-raised">
                        <Icon size={22} />
                      </span>
                      <span className="min-w-0 flex-1 leading-snug">{i.text}</span>
                      {i.article && (
                        <Link
                          href={`/ask?article=${i.article}`}
                          aria-label={`Why: ${i.text}`}
                          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-panel px-3 text-[0.9rem] font-semibold hover:bg-raised hc-border"
                        >
                          Why
                          <IconChevronsRight size={16} />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-tile border border-dashed border-line-strong p-4 text-muted">{s.note}</p>
              )}
            </section>
          )
        })}
      </div>

      {health.data?.ai_enabled && (
        <div>
          <Button variant="dark" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? 'Updating…' : 'Update my plan'}</Button>
          <p className="mt-2 text-[0.9rem] text-muted">Rewrites the short intro above from your current items, style and goals.</p>
        </div>
      )}
      <ErrorText error={refresh.error} />
    </div>
  )
}
