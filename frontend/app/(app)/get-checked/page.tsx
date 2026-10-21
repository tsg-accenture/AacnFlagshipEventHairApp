'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ConsentPrompt } from '@/components/ConsentPrompt'
import { IconArrowUpRight, IconDownload, IconShield } from '@/components/icons'
import { StatusChip } from '@/components/Status'
import { Button, Card, ErrorText, Loading, Notice, PageHeader, TextArea, inputClass } from '@/components/ui'
import { download } from '@/lib/api'
import { api } from '@/lib/api'
import { shortDate, useConsents } from '@/lib/hooks'

type Referrals = {
  reasons: { source: string; rule_id: string; reason: string }[]
  snoozed_until: string | null
  links: { id: string; name: string; url: string; why: string }[]
  questions: string[]
  note: string
}
type Journey = { assessments: { id: string; created_at: string; photos: { id: string; zone: string }[] }[] }

/** Get checked (A09, B09): the pattern in your own answers, where to go, a care pack, and "not now". */
export default function GetCheckedPage() {
  const qc = useQueryClient()
  const ref = useQuery({ queryKey: ['referrals'], queryFn: () => api<Referrals>('/referrals') })
  const journey = useQuery({ queryKey: ['journey'], queryFn: () => api<Journey>('/journey') })
  const consents = useConsents()
  const [qs, setQs] = useState<string[]>([])
  const [own, setOwn] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [incCheckins, setIncCheckins] = useState(true)
  const [incZones, setIncZones] = useState(true)
  const [packError, setPackError] = useState<unknown>(null)
  const [packBusy, setPackBusy] = useState(false)
  const notNow = useMutation({
    mutationFn: (days: number) => api('/referrals/not-now', { json: { days } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referrals'] })
      qc.invalidateQueries({ queryKey: ['today'] })
    },
  })

  if (ref.isLoading) return <Loading />
  if (!ref.data) return <ErrorText error={ref.error} />
  const r = ref.data
  const allPhotos = (journey.data?.assessments ?? []).flatMap((a) => a.photos.map((p) => ({ ...p, date: a.created_at })))
  const sharingOk = consents.data?.state.sharing.granted

  async function makePack() {
    setPackBusy(true)
    setPackError(null)
    try {
      await download('/care-pack', 'crown-ai-care-pack.pdf', {
        include_checkins: incCheckins,
        include_zones: incZones,
        photo_ids: photos,
        questions: [...qs, ...(own.trim() ? [own.trim()] : [])],
        note: note.trim() || null,
      })
    } catch (e) {
      setPackError(e)
    } finally {
      setPackBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={<>Get <em>checked</em></>} lead={r.note} back={{ href: '/today', label: 'Today' }} />

      {r.reasons.length ? (
        <Card className="border-2 border-check p-6">
          <StatusChip state="get_checked" label="Why we’re suggesting this" />
          <ul className="mt-2 list-disc space-y-1 pl-5">{r.reasons.map((x) => <li key={x.rule_id + x.reason}>{x.reason}</li>)}</ul>
          <p className="mt-3 text-[0.9rem] text-muted">This comes from your own answers and written rules, not from AI.</p>
        </Card>
      ) : (
        <Notice>Nothing in your check-ins or Crown Map points this way right now. You can still see a professional any time you&apos;re worried.</Notice>
      )}

      <section aria-labelledby="help-title">
        <h2 id="help-title" className="title-md mb-3">Who can <em>help</em></h2>
        <ul className="space-y-2.5">
          {r.links.map((l) => (
            <li key={l.id}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[4.5rem] items-center gap-4 rounded-tile border border-line bg-surface p-3 hover:bg-panel hc-border">
                <span aria-hidden="true" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-raised"><IconShield size={22} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold underline-offset-4">{l.name}<span className="sr-only"> (opens in a new tab)</span></span>
                  <span className="block text-[0.93rem] text-muted">{l.why}</span>
                </span>
                <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel"><IconArrowUpRight size={18} /></span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <Card className="p-6">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lime text-on-lime hc-border"><IconDownload size={22} /></span>
          <h2 className="title-md">Make a care pack for your appointment</h2>
        </div>
        <p className="mt-1 text-muted">A PDF you download and bring. Nothing is sent to anyone.</p>
        {!sharingOk ? (
          <div className="mt-4"><ConsentPrompt type="sharing" compact /></div>
        ) : (
          <div className="mt-4 space-y-5">
            <fieldset>
              <legend className="font-semibold">Include</legend>
              <label className="mt-2 flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--ink)]" checked={incCheckins} onChange={(e) => setIncCheckins(e.target.checked)} />My check-ins and any patterns</label>
              <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--ink)]" checked={incZones} onChange={(e) => setIncZones(e.target.checked)} />My Crown Map zones</label>
            </fieldset>
            {allPhotos.length > 0 && (
              <fieldset>
                <legend className="font-semibold">Photos (only the ones you tick)</legend>
                <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {allPhotos.map((p) => (
                    <label key={p.id} className="block cursor-pointer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/v1/photos/${p.id}`} alt={`${p.zone.replace('_', ' ')}, ${shortDate(p.date)}`} className="aspect-square w-full rounded-2xl object-cover" />
                      <span className="mt-1 flex min-h-11 items-center gap-2 text-[0.9rem]">
                        <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--ink)]" checked={photos.includes(p.id)} onChange={(e) => setPhotos((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                        {p.zone.replace('_', ' ')}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset>
              <legend className="font-semibold">Questions to ask</legend>
              {r.questions.map((q) => (
                <label key={q} className="mt-1 flex min-h-11 items-center gap-3">
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--ink)]" checked={qs.includes(q)} onChange={(e) => setQs((s) => (e.target.checked ? [...s, q] : s.filter((x) => x !== q)))} />
                  {q}
                </label>
              ))}
              <input aria-label="Your own question" placeholder="Add your own question" value={own} onChange={(e) => setOwn(e.target.value)} maxLength={300} className={`mt-2 ${inputClass}`} />
            </fieldset>
            <TextArea id="pack-note" label="In your own words (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500} />
            <ErrorText error={packError} />
            <Button variant="primary" onClick={makePack} disabled={packBusy}>{packBusy ? 'Making your pack…' : 'Download care pack (PDF)'}</Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="title-md">Not now</h2>
        {r.snoozed_until ? (
          <p className="mt-1">We&apos;ll bring this back on {shortDate(r.snoozed_until)}.</p>
        ) : (
          <>
            <p className="mt-1 text-muted">That&apos;s OK. We&apos;ll remind you later on your Today screen.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => notNow.mutate(7)} disabled={notNow.isPending}>Remind me in a week</Button>
              <Button onClick={() => notNow.mutate(14)} disabled={notNow.isPending}>In two weeks</Button>
            </div>
          </>
        )}
        <ErrorText error={notNow.error} />
      </Card>
    </div>
  )
}
