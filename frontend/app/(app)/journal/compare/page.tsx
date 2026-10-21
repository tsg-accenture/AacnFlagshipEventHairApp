'use client'

import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { StatusChip } from '@/components/Status'
import { Button, ErrorText, Loading, Notice, PageHeader, inputClass } from '@/components/ui'
import { api } from '@/lib/api'
import { shortDate } from '@/lib/hooks'
import type { ZoneId, ZoneStateId } from '@/lib/types'
import { ZONES } from '@/lib/types'

type Journey = { assessments: { id: string; created_at: string; photos: { id: string; zone: string }[] }[] }
type Compare = {
  zone: string
  from: { assessment_id: string; date: string; photo_id: string | null; state: ZoneStateId; reasons: string[] }
  to: { assessment_id: string; date: string; photo_id: string | null; state: ZoneStateId; reasons: string[] }
  limits: string
}
const NAMES: Record<ZoneId, string> = { hairline: 'Hairline and edges', left_temple: 'Left temple', right_temple: 'Right temple', crown: 'Crown', nape: 'Nape' }

/** Before and after for one zone (A10). The slider works by tap, keys or drag; the buttons need no dragging at all. */
function CompareInner() {
  const initial = useSearchParams().get('zone') as ZoneId | null
  const journey = useQuery({ queryKey: ['journey'], queryFn: () => api<Journey>('/journey') })
  const [zone, setZone] = useState<ZoneId>(initial && ZONES.includes(initial) ? initial : 'hairline')
  const withPhoto = useMemo(
    () => (journey.data?.assessments ?? []).filter((a) => a.photos.some((p) => p.zone === zone)).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [journey.data, zone],
  )
  const [fromId, setFromId] = useState<string | null>(null)
  const [toId, setToId] = useState<string | null>(null)
  const from = fromId ?? withPhoto[0]?.id
  const to = toId ?? withPhoto[withPhoto.length - 1]?.id
  const cmp = useQuery({
    queryKey: ['compare', zone, from, to],
    queryFn: () => api<Compare>(`/journey/compare?zone=${zone}&from=${from}&to=${to}`),
    enabled: !!from && !!to && from !== to,
  })
  const [split, setSplit] = useState(50)

  if (journey.isLoading) return <Loading />
  return (
    <div className="space-y-5">
      <PageHeader title="Compare a zone" lead="See one zone side by side across two checks. Only photos you chose to keep are here." back={{ href: '/journal', label: 'Journal' }} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block font-semibold">Zone</span>
          <select value={zone} onChange={(e) => { setZone(e.target.value as ZoneId); setFromId(null); setToId(null) }} className={inputClass}>
            {ZONES.map((z) => <option key={z} value={z}>{NAMES[z]}</option>)}
          </select>
        </label>
        {withPhoto.length >= 2 && (
          <>
            <label className="block">
              <span className="mb-1 block font-semibold">Before</span>
              <select value={from} onChange={(e) => setFromId(e.target.value)} className={inputClass}>
                {withPhoto.map((a) => <option key={a.id} value={a.id}>{shortDate(a.created_at)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">After</span>
              <select value={to} onChange={(e) => setToId(e.target.value)} className={inputClass}>
                {withPhoto.map((a) => <option key={a.id} value={a.id}>{shortDate(a.created_at)}</option>)}
              </select>
            </label>
          </>
        )}
      </div>

      {withPhoto.length < 2 && <Notice>You need two checks with a kept photo of this zone to compare.</Notice>}
      {from === to && withPhoto.length >= 2 && <Notice>Pick two different dates.</Notice>}
      <ErrorText error={cmp.error} />

      {cmp.data && cmp.data.from.photo_id && cmp.data.to.photo_id && (
        <>
          {/* Phone and tablet: wipe between the two. Laptop: side by side as well. */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sheet border border-line bg-raised">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/v1/photos/${cmp.data.to.photo_id}`} alt={`After, ${shortDate(cmp.data.to.date)}`} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/v1/photos/${cmp.data.from.photo_id}`} alt={`Before, ${shortDate(cmp.data.from.date)}`} className="h-full w-full object-cover" />
            </div>
            <div aria-hidden="true" className="absolute inset-y-0 w-1 bg-surface" style={{ left: `calc(${split}% - 2px)` }} />
          </div>
          <label className="block">
            <span className="mb-1 block font-semibold">Slide between before and after</span>
            <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="w-full accent-[var(--ink)]" aria-valuetext={`${split}% before`} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setSplit(100)}>Show before</Button>
            <Button onClick={() => setSplit(50)}>Half and half</Button>
            <Button onClick={() => setSplit(0)}>Show after</Button>
          </div>
          <div className="hidden gap-4 lg:grid lg:grid-cols-2">
            {(['from', 'to'] as const).map((k) => (
              <figure key={k}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1/photos/${cmp.data![k].photo_id}`} alt="" className="aspect-[4/3] w-full rounded-card object-cover" />
                <figcaption className="mt-2 flex items-center gap-2">{shortDate(cmp.data![k].date)} <StatusChip state={cmp.data![k].state} /></figcaption>
              </figure>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 lg:hidden">
            <p>Before ({shortDate(cmp.data.from.date)}): <StatusChip state={cmp.data.from.state} /></p>
            <p>After ({shortDate(cmp.data.to.date)}): <StatusChip state={cmp.data.to.state} /></p>
          </div>
          <Notice>{cmp.data.limits}</Notice>
        </>
      )}
    </div>
  )
}

export default function ComparePage() {
  return (
    <Suspense fallback={<Loading />}>
      <CompareInner />
    </Suspense>
  )
}
