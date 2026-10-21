'use client'

import { useQuery } from '@tanstack/react-query'
import { CrownMap } from '@/components/CrownMap'
import { IconSparkle } from '@/components/icons'
import { STATE_TEXT, STATE_WORDS, StateIcon, StateLegend } from '@/components/Status'
import { ErrorText, ListRow, Loading, PageHeader, Ring, SectionHead } from '@/components/ui'
import { api } from '@/lib/api'
import { dayMonth } from '@/lib/hooks'
import type { MapZone, ZoneId, ZoneStateId } from '@/lib/types'

const COUNTED: { s: ZoneStateId; tone: 'calm' | 'watch' | 'check' }[] = [
  { s: 'calm', tone: 'calm' },
  { s: 'watch', tone: 'watch' },
  { s: 'get_checked', tone: 'check' },
]

/** Crown Map (board 2's "Hair analysis"): the art with callouts, a frosted sheet of counts, then a row per zone. */
export default function MapPage() {
  const q = useQuery({ queryKey: ['map'], queryFn: () => api<{ zones: MapZone[]; rules_status: string }>('/map') })
  if (q.isLoading) return <Loading />
  if (!q.data) return <ErrorText error={q.error} />
  const zones = q.data.zones
  const states = Object.fromEntries(zones.map((z) => [z.zone, z.state])) as Record<ZoneId, ZoneStateId>
  const any = zones.some((z) => z.state !== 'not_checked')

  return (
    <div>
      <PageHeader
        title={<>Crown <em>Map</em></>}
        lead="Five zones. Each state comes from written rules, using what you told us and, if you added photos, what they showed."
      />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-start">
        <div>
          <CrownMap states={states} hrefBase="/map" className="pb-14" />
          <section aria-label="Zones by state" className="glass relative z-10 mx-3 -mt-14 grid grid-cols-3 gap-2 rounded-sheet p-2.5 shadow-soft">
            {COUNTED.map(({ s, tone }) => {
              const n = zones.filter((z) => z.state === s).length
              return (
                <div key={s} className="flex flex-col items-center rounded-tile bg-surface px-1 py-3 text-center hc-border">
                  <span className="relative inline-flex" aria-hidden="true">
                    <Ring value={n} max={5} tone={tone} size={60} stroke={6} />
                    <span className="num absolute inset-0 flex items-center justify-center text-[1.2rem] font-semibold">{n}</span>
                  </span>
                  <span className={`mt-2 inline-flex items-center gap-1 whitespace-nowrap text-[0.84rem] font-semibold ${STATE_TEXT[s]}`} aria-hidden="true">
                    <StateIcon state={s} size={16} />
                    {STATE_WORDS[s]}
                  </span>
                  <span className="sr-only">{`${STATE_WORDS[s]}: ${n} of 5 zones`}</span>
                </div>
              )
            })}
          </section>
        </div>

        <div className="space-y-6">
          <section aria-labelledby="zones-title">
            <SectionHead title={<span id="zones-title">Your zones</span>} />
            <ul className="space-y-2.5">
              {zones.map((z) => (
                <li key={z.zone}>
                  <ListRow
                    href={`/map/${z.zone}`}
                    icon={<span className={STATE_TEXT[z.state]}><StateIcon state={z.state} size={22} /></span>}
                    title={z.name}
                    sub={
                      z.checked_at ? (
                        <>
                          <span className={`font-semibold ${STATE_TEXT[z.state]}`}>{STATE_WORDS[z.state]}</span> · checked {dayMonth(z.checked_at)}
                        </>
                      ) : (
                        'Not checked yet'
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </section>

          <ListRow tone="dark" href="/check" icon={<IconSparkle />} title={any ? 'Check again' : 'Start a check'} sub="Questions first. Photos are optional." />

          <section aria-labelledby="legend-title">
            <h2 id="legend-title" className="mb-3 text-[1.15rem] font-semibold">What the states mean</h2>
            <StateLegend />
            <p className="mt-3 max-w-[62ch] text-[0.92rem] text-muted">
              States are signposts, not a diagnosis. {q.data.rules_status !== 'reviewed' && 'The rules behind them are a draft awaiting sign-off from a clinical adviser.'} You can turn on map patterns and high contrast in Settings.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
