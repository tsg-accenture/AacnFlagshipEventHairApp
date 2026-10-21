'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { CrownArt } from '@/components/CrownArt'
import { stageWord } from '@/components/Rhythm'
import { StatusChip } from '@/components/Status'
import { Button, Card, ErrorText, LinkButton, Loading, PageHeader } from '@/components/ui'
import { api } from '@/lib/api'
import { shortDate } from '@/lib/hooks'
import type { CheckIn, Period, ZoneStateId } from '@/lib/types'

type Journey = {
  periods: Period[]
  checkins: CheckIn[]
  assessments: { id: string; kind: string; created_at: string; zones: { zone: string; state: ZoneStateId }[]; photos: { id: string; zone: string }[] }[]
  label: string
}

const WORDS: Record<string, string> = {
  none: 'none', a_little: 'a little', hurts: 'hurts', a_few: 'a few', lots: 'lots', a_lot: 'a lot', fine: 'fine', not_sure: 'not sure', thinner: 'thinner',
}
const OUTCOME: Record<string, ZoneStateId> = { all_good: 'calm', ease_the_pull: 'watch', too_tight: 'get_checked' }
const OUTCOME_WORDS: Record<string, string> = { all_good: 'All good', ease_the_pull: 'Ease the pull', too_tight: 'Too tight' }
const ZONE_NAMES: Record<string, string> = { hairline: 'Hairline', left_temple: 'Left temple', right_temple: 'Right temple', crown: 'Crown', nape: 'Nape' }

/** Journal (B10 + A10): the style ribbon, your diary of check-ins, and the checks you ran. Your record, not an AI judgement. */
export default function JournalPage() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['journey'], queryFn: () => api<Journey>('/journey') })
  const discard = useMutation({
    mutationFn: (id: string) => api(`/assessments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journey'] })
      qc.invalidateQueries({ queryKey: ['map'] })
      qc.invalidateQueries({ queryKey: ['today'] })
    },
  })
  if (q.isLoading) return <Loading />
  if (!q.data) return <ErrorText error={q.error} />
  const j = q.data
  const photoCount = j.assessments.reduce((n, a) => n + a.photos.length, 0)

  return (
    <div className="space-y-8">
      <PageHeader title="Journal" lead={j.label} />

      <section aria-labelledby="ribbon">
        <h2 id="ribbon" className="title-md">Style <em>ribbon</em></h2>
        {j.periods.length ? (
          <ol className="scroller -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2">
            {j.periods.map((p, n) => {
              const cis = j.checkins.filter((c) => c.style_period_id === p.id)
              const sore = cis.filter((c) => c.outcome !== 'all_good').length
              return (
                <li key={p.id} className="w-56 shrink-0 overflow-hidden rounded-card border border-line bg-surface hc-border">
                  <div aria-hidden="true" className="art-panel relative h-20">
                    <CrownArt viewBox={['100 120 140 70', '80 200 140 70', '120 80 140 70'][n % 3]} />
                    {p.stage !== 'ended' && <span className="glass absolute right-2 top-2 rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold">Now</span>}
                  </div>
                  <div className="p-4">
                    <p className="font-semibold">{p.style_name}</p>
                    <p className="text-[0.92rem] text-muted">
                      {shortDate(p.install_date)}
                      {p.take_down_date ? ` to ${shortDate(p.take_down_date)}` : ''}
                    </p>
                    <p className="mt-2 text-[0.92rem]">{stageWord(p.stage)} · {cis.length} check-in{cis.length === 1 ? '' : 's'}</p>
                    {sore > 0 && <p className="text-[0.92rem] text-watch">{sore} flagged tension or soreness</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="mt-2 text-muted">Add your current style on Today to start your ribbon.</p>
        )}
      </section>

      <section aria-labelledby="diary">
        <h2 id="diary" className="title-md">Check-ins</h2>
        {j.checkins.length ? (
          <ul className="mt-3 space-y-2">
            {j.checkins.map((c) => (
              <Card as="li" key={c.id} className="rounded-tile py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {shortDate(c.created_at)}
                    {c.day_in_style ? <span className="font-normal text-muted"> · day {c.day_in_style}</span> : null}
                  </p>
                  <StatusChip state={OUTCOME[c.outcome] ?? 'not_checked'} label={OUTCOME_WORDS[c.outcome] ?? c.outcome} />
                </div>
                <p className="mt-1 text-[0.95rem] text-muted">
                  {(['tightness', 'soreness', 'bumps', 'itch', 'edges'] as const)
                    .filter((f) => c[f])
                    .map((f) => `${f === 'tightness' ? 'tightness' : f}: ${WORDS[c[f] as string] ?? c[f]}`)
                    .join(', ')}
                </p>
                {c.note && <p className="mt-1">&ldquo;{c.note}&rdquo;</p>}
              </Card>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted">No check-ins yet. Your first one shows up on Today.</p>
        )}
      </section>

      <ErrorText error={discard.error} />
      <section aria-labelledby="checks">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="checks" className="title-md">Crown Map checks</h2>
          {photoCount >= 2 && <LinkButton href="/journal/compare">Compare photos</LinkButton>}
        </div>
        {j.assessments.length ? (
          <ul className="mt-3 space-y-2">
            {j.assessments.map((a) => (
              <Card as="li" key={a.id} className="rounded-tile py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{shortDate(a.created_at)} · {a.kind === 'take_down' ? 'Take-down check' : 'Check'}</p>
                  <Button
                    variant="quiet"
                    aria-label={`Delete the check from ${shortDate(a.created_at)}`}
                    disabled={discard.isPending}
                    onClick={() => {
                      if (window.confirm('Delete this check, its answers, results and photos?')) discard.mutate(a.id)
                    }}
                  >
                    Delete
                  </Button>
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {[...a.zones].sort((x, y) => Object.keys(ZONE_NAMES).indexOf(x.zone) - Object.keys(ZONE_NAMES).indexOf(y.zone)).map((z) => (
                    <li key={z.zone}><StatusChip state={z.state} label={`${ZONE_NAMES[z.zone]}: ${{ calm: 'Calm', watch: 'Watch', get_checked: 'Get checked', not_checked: 'Not checked' }[z.state]}`} /></li>
                  ))}
                </ul>
                {a.photos.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {a.photos.map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.id} src={`/api/v1/photos/${p.id}`} alt={`${ZONE_NAMES[p.zone]} photo, ${shortDate(a.created_at)}`} className="h-16 w-16 rounded-2xl object-cover" />
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted">
            No checks yet. <Link href="/check" className="font-semibold text-ink underline underline-offset-4">Start one</Link> when you&apos;re ready.
          </p>
        )}
      </section>
    </div>
  )
}
