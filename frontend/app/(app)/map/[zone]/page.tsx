'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { CrownArt, ZONE_POINTS } from '@/components/CrownArt'
import { IconCamera, IconShield, IconUser } from '@/components/icons'
import { Sources } from '@/components/Sources'
import { StatusChip } from '@/components/Status'
import { Card, ErrorText, LinkButton, Loading, Notice, PageHeader } from '@/components/ui'
import { api } from '@/lib/api'
import { shortDate } from '@/lib/hooks'
import type { Assessment, MapZone, ZoneId, ZonesContent } from '@/lib/types'

const SEEN_WORDS = { visible: 'Seen', not_visible: 'Not seen', cant_tell: "Couldn't tell" }

function TileHead({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-raised text-ink">{icon}</span>
      <div>
        <h2 className="font-semibold leading-tight">{title}</h2>
        <p className="text-[0.86rem] text-muted">{sub}</p>
      </div>
    </div>
  )
}

/** Zone detail (A07): what the photo showed, what you said, the rules-based state, actions and evidence. */
export default function ZonePage() {
  const { zone } = useParams<{ zone: string }>()
  const map = useQuery({ queryKey: ['map'], queryFn: () => api<{ zones: MapZone[] }>('/map') })
  const content = useQuery({ queryKey: ['content', 'zones'], queryFn: () => api<ZonesContent>('/content/zones') })
  const z = map.data?.zones.find((x) => x.zone === zone)
  const detail = useQuery({
    queryKey: ['assessment', z?.assessment_id],
    queryFn: () => api<Assessment>(`/assessments/${z!.assessment_id}`),
    enabled: !!z?.assessment_id,
  })
  if (map.isLoading || content.isLoading) return <Loading />
  if (!z || !content.data) return <ErrorText error={map.error ?? new Error('Unknown zone')} />
  const az = detail.data?.zones.find((x) => x.zone === zone)
  const signs = Object.fromEntries(content.data.signs.map((s) => [s.id, s]))
  const questions = Object.fromEntries(content.data.questions.map((q) => [q.field, q]))
  const pt = ZONE_POINTS[z.zone as ZoneId]
  // A close-up of the art around this zone, with its marker.
  const crop = `${Math.max(0, pt.x - 95)} ${Math.max(0, pt.y - 70)} 190 140`

  return (
    <div className="space-y-5">
      <PageHeader title={z.name} back={{ href: '/map', label: 'Crown Map' }}>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StatusChip state={z.state} />
          {z.checked_at && <span className="text-muted">Checked {shortDate(z.checked_at)}</span>}
        </div>
      </PageHeader>

      <div aria-hidden="true" className="art-panel h-44 overflow-hidden rounded-sheet sm:h-56">
        <CrownArt viewBox={crop} markers={[{ zone: z.zone as ZoneId, state: z.state }]} />
      </div>

      {!z.assessment_id && (
        <Notice title="Not checked yet">Start a check to see this zone&apos;s state. You can answer questions only, or add a photo.</Notice>
      )}

      {z.explanation && (
        <Card className="p-6">
          <h2 className="title-md">What it <em>means</em></h2>
          <p className="mt-3">{z.explanation.text}</p>
          <p className="mt-3 rounded-tile bg-lime-tint px-4 py-3 font-semibold hc-border">{z.explanation.action}</p>
          <Sources sources={z.explanation.sources} />
          <p className="mt-3 text-[0.85rem] text-muted">
            {z.explanation.source === 'ai'
              ? `Explanation written by ${z.explanation.model === 'fake' ? 'Demo AI (canned, not OpenAI)' : 'AI'} from library passages only.`
              : 'Standard wording for this state.'}
          </p>
        </Card>
      )}

      {az && (
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <TileHead icon={<IconShield size={22} />} title="Rules-based state" sub="Set by written rules, not by AI" />
            <ul className="mt-3 list-disc space-y-1 pl-5">{(az.rules_state?.reasons ?? []).map((r) => <li key={r}>{r}</li>)}</ul>
          </Card>
          <Card>
            <TileHead icon={<IconCamera size={22} />} title="AI observation" sub={`What the photo showed${az.ai_observed?.model === 'fake' ? ' (Demo AI)' : ''}`} />
            {az.ai_observed ? (
              <ul className="mt-3 divide-y divide-line">
                {Object.entries(az.ai_observed.data).map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2 py-1.5"><span>{signs[k]?.name ?? k}</span><span className="font-semibold">{SEEN_WORDS[v]}</span></li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-muted">No photo for this zone.</p>
            )}
          </Card>
          <Card>
            <TileHead icon={<IconUser size={22} />} title="You said" sub="Your answers" />
            {Object.keys(az.you_said).length ? (
              <ul className="mt-3 space-y-1.5">
                {Object.entries(az.you_said).map(([k, v]) => (
                  <li key={k}>
                    <span className="text-muted">{questions[k]?.text ?? k}</span>{' '}
                    <span className="font-semibold">{questions[k]?.options.find((o) => o[0] === v)?.[1] ?? v}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-muted">No answers for this zone.</p>
            )}
          </Card>
        </div>
      )}

      {az?.photo?.kept && (
        <Card>
          <h2 className="font-semibold">Your photo</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/v1/photos/${az.photo.id}`} alt={`Your ${z.name.toLowerCase()} photo`} className="mt-3 max-h-96 rounded-tile object-contain" />
          <Link href={`/journal/compare?zone=${zone}`} className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Compare over time</Link>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">What the signs can look like</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {content.data.signs.map((s) => (
            <li key={s.id} className="flex gap-3">
              <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-tile border border-dashed border-line-strong p-1 text-center text-[0.72rem] text-muted" aria-hidden="true">
                Licensed image pending
              </div>
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-[0.92rem] text-muted">{s.plain}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.88rem] text-muted">{content.data.example_images.note}</p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <LinkButton href={`/check?zones=${zone}`} variant={z.state === 'get_checked' ? 'secondary' : 'primary'}>Check this zone</LinkButton>
        {z.state === 'get_checked' && <LinkButton href="/get-checked" variant="primary">See what to do</LinkButton>}
      </div>
    </div>
  )
}
