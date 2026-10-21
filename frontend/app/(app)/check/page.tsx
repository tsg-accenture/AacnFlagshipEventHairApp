'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { ConsentPrompt } from '@/components/ConsentPrompt'
import { CrownMap } from '@/components/CrownMap'
import { StatusChip } from '@/components/Status'
import { IconCamera } from '@/components/icons'
import { Button, Card, ChoiceGroup, ErrorText, LinkButton, Loading, Notice, PageHeader, Toggle } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { useConsents, useHealth, useSetConsent } from '@/lib/hooks'
import { faceBlurAvailable, preparePhoto, type Prepared } from '@/lib/photo'
import type { Assessment, Quality, ZoneId, ZonesContent } from '@/lib/types'
import { ZONES } from '@/lib/types'

type Stage = 'zones' | 'questions' | 'photos' | 'results'

function CheckFlow() {
  const params = useSearchParams()
  const kind = params.get('kind') === 'take_down' ? 'take_down' : 'check'
  const preset = (params.get('zones') ?? '').split(',').filter((z): z is ZoneId => (ZONES as string[]).includes(z))
  const qc = useQueryClient()
  const content = useQuery({ queryKey: ['content', 'zones'], queryFn: () => api<ZonesContent>('/content/zones') })
  const consents = useConsents()
  const health = useHealth()
  const [stage, setStage] = useState<Stage>('zones')
  const [zones, setZones] = useState<ZoneId[]>(preset)
  const [answers, setAnswers] = useState<Partial<Record<ZoneId, Record<string, string>>>>({})
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  if (content.isLoading || consents.isLoading) return <Loading />
  if (!content.data || !consents.data) return <ErrorText error={content.error ?? consents.error} />
  const c = content.data
  const names = Object.fromEntries(c.zones.map((z) => [z.id, z.name])) as Record<ZoneId, string>
  const healthOk = consents.data.state.health_data.granted
  const toggle = (z: ZoneId) => setZones((s) => (s.includes(z) ? s.filter((x) => x !== z) : [...s, z]))

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const ordered = ZONES.filter((z) => zones.includes(z))
      const a = await api<Assessment>('/assessments', { json: { kind, zones: ordered, answers } })
      setAssessment(a)
      setStage('photos')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    if (!assessment) return
    setBusy(true)
    setError(null)
    try {
      const done = await api<Assessment>(`/assessments/${assessment.id}/run`, { method: 'POST' })
      setAssessment(done)
      setStage('results')
      qc.invalidateQueries({ queryKey: ['map'] })
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['journey'] })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const stepNo = { zones: 1, questions: 2, photos: 3, results: 4 }[stage]

  return (
    <div className="space-y-6">
      <PageHeader
        title={kind === 'take_down' ? <>Take-down <em>check</em></> : <>Crown Map <em>check</em></>}
        lead={stage === 'results' ? undefined : 'Pick the zones you want to check, answer a few questions, then add photos if you like.'}
        back={{ href: '/map', label: 'Crown Map' }}
      >
        {stage !== 'results' && (
          <div className="mt-4 flex max-w-sm items-center gap-3">
            <ol className="flex flex-1 gap-1.5" aria-hidden="true">
              {[1, 2, 3].map((n) => <li key={n} className={`h-2 flex-1 rounded-full ${n <= stepNo ? 'bg-ink' : 'bg-track'}`} />)}
            </ol>
            <p className="shrink-0 font-semibold">Step {stepNo} of 3</p>
          </div>
        )}
      </PageHeader>

      {!healthOk && <ConsentPrompt type="health_data" />}

      {stage === 'zones' && (
        <>
          <div className="grid gap-6 md:grid-cols-2 md:items-center">
            <CrownMap states={{}} selected={zones} onSelect={toggle} title="Zones to check" />
            <fieldset>
              <legend className="title-md mb-3">Which <em>zones</em>?</legend>
              <div className="grid gap-2">
                {c.zones.map((z) => {
                  const on = zones.includes(z.id)
                  return (
                    <button
                      key={z.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(z.id)}
                      className={`flex min-h-14 items-center justify-between rounded-full py-2 pl-5 pr-2 font-semibold transition-colors hc-border ${on ? 'bg-ink text-surface' : 'border border-line bg-surface hover:bg-raised'}`}
                    >
                      {z.name}
                      <span aria-hidden="true" className={`inline-flex min-h-10 items-center rounded-full px-3 text-[0.88rem] ${on ? 'bg-lime text-on-lime' : 'bg-panel'}`}>{on ? 'Selected' : 'Add'}</span>
                    </button>
                  )
                })}
                <Button variant="quiet" onClick={() => setZones(zones.length === 5 ? [] : [...ZONES])}>
                  {zones.length === 5 ? 'Clear all' : "I'm not sure: check all five"}
                </Button>
              </div>
            </fieldset>
          </div>
          <Button variant="primary" disabled={!zones.length || !healthOk} onClick={() => setStage('questions')}>
            Next: questions for {zones.length || 'no'} zone{zones.length === 1 ? '' : 's'}
          </Button>
        </>
      )}

      {stage === 'questions' && (
        <>
          {ZONES.filter((z) => zones.includes(z)).map((z) => (
            <Card key={z} className="p-6">
              <h2 className="title-md">{names[z]}</h2>
              <div className="mt-4 space-y-5">
                {c.questions.map((q) => (
                  <ChoiceGroup
                    key={q.field}
                    legend={q.text}
                    name={`${z}-${q.field}`}
                    options={q.options}
                    columns={q.options.length === 2 ? 2 : 3}
                    value={answers[z]?.[q.field]}
                    onChange={(v) => setAnswers((a) => ({ ...a, [z]: { ...(a[z] ?? {}), [q.field]: v } }))}
                  />
                ))}
              </div>
            </Card>
          ))}
          <ErrorText error={error} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setStage('zones')}>Back</Button>
            <Button variant="primary" disabled={busy || !healthOk} onClick={create}>Next: photos (optional)</Button>
          </div>
        </>
      )}

      {stage === 'photos' && assessment && (
        <PhotoStep
          assessment={assessment}
          content={c}
          aiEnabled={!!health.data?.ai_enabled}
          analysisOk={consents.data.state.analysis.granted}
          retentionOk={consents.data.state.photo_retention.granted}
          busy={busy}
          error={error}
          onRun={run}
        />
      )}

      {stage === 'results' && assessment && <Results a={assessment} />}
    </div>
  )
}

function PhotoStep({
  assessment, content, aiEnabled, analysisOk, retentionOk, busy, error, onRun,
}: {
  assessment: Assessment
  content: ZonesContent
  aiEnabled: boolean
  analysisOk: boolean
  retentionOk: boolean
  busy: boolean
  error: unknown
  onRun: () => void
}) {
  const setConsent = useSetConsent()
  const [blurReady, setBlurReady] = useState(false)
  const [blur, setBlur] = useState(true)
  useEffect(() => {
    faceBlurAvailable().then(setBlurReady)
  }, [])
  const caps = Object.fromEntries(content.zones.map((z) => [z.id, z]))

  return (
    <>
      {!aiEnabled ? (
        <Notice title="Photo checks need AI set up">You can still finish with your answers only.</Notice>
      ) : !analysisOk ? (
        <>
          <p>Photos are optional. To use them, Crown AI needs your OK to analyse them. Keeping them is a separate choice.</p>
          <ConsentPrompt type="analysis" />
        </>
      ) : (
        <>
          <Card>
            <Toggle
              label="Keep my photos"
              checked={retentionOk}
              onChange={(v) => setConsent.mutate({ type: 'photo_retention', granted: v, source: 'check' })}
              description={retentionOk ? 'Kept privately so you can compare zones over time.' : 'Off: each photo is described, then deleted straight away. It is never stored.'}
            />
            {blurReady ? (
              <div className="mt-4 border-t border-line pt-4">
                <Toggle label="Blur faces on this phone first" checked={blur} onChange={setBlur} description="Runs on your device before anything is uploaded." />
              </div>
            ) : (
              <p className="mt-4 border-t border-line pt-4 text-[0.92rem] text-muted">On-device face blur isn&apos;t set up on this server. Frame the photo so your face isn&apos;t in it.</p>
            )}
          </Card>
          <p className="text-[0.95rem] text-muted lg:hidden">Use your back camera. Photos are shrunk on your phone before upload to save data.</p>
          <Notice>
            <span className="hidden lg:inline">A laptop camera can&apos;t see your crown or nape. For those, open this page on your phone, or upload photos someone took for you.</span>
            <span className="lg:hidden">For your crown and nape, ask someone to help, or use a mirror and the camera timer.</span>
          </Notice>
          {assessment.zones.map((z) => (
            <ZonePhoto key={z.zone} assessmentId={assessment.id} zone={z.zone} name={z.name} tip={caps[z.zone]?.capture} blur={blurReady && blur} />
          ))}
        </>
      )}
      <ErrorText error={error} />
      <div>
        <Button variant="primary" disabled={busy} onClick={onRun}>{busy ? 'Checking…' : 'See my results'}</Button>
        <p className="mt-2 text-[0.92rem] text-muted">Zones without a photo use your answers only.</p>
      </div>
    </>
  )
}

function ZonePhoto({ assessmentId, zone, name, tip, blur }: { assessmentId: string; zone: ZoneId; name: string; tip?: string; blur: boolean }) {
  const [prep, setPrep] = useState<Prepared | null>(null)
  const [quality, setQuality] = useState<Quality | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [kept, setKept] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const inputId = `photo-${zone}`

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    setQuality(null)
    setAccepted(false)
    try {
      const p = await preparePhoto(file, blur)
      setPrep(p)
      const fd = new FormData()
      fd.append('zone', zone)
      fd.append('file', p.blob, `${zone}.jpg`)
      const r = await api<{ photo_id: string; quality: Quality; kept: boolean }>(`/assessments/${assessmentId}/photos`, { body: fd })
      setQuality(r.quality)
      setKept(r.kept)
      if (r.quality.ok) setAccepted(true)
    } catch (e) {
      setError(e)
      setPrep(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-raised"><IconCamera size={22} /></span>
        <h2 className="text-[1.15rem] font-semibold">{name}</h2>
      </div>
      {tip && <p className="mt-1 text-[0.95rem] text-muted">{tip}</p>}
      <div className="mt-3 flex flex-wrap items-start gap-4">
        {prep && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={prep.previewUrl} alt={`Your ${name.toLowerCase()} photo`} className="h-32 w-32 rounded-2xl object-cover" />
        )}
        <div className="space-y-2">
          <label htmlFor={inputId} className="inline-flex min-h-12 cursor-pointer items-center rounded-full bg-ink px-6 font-semibold text-surface hover:brightness-110 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]">
            {prep ? 'Retake' : 'Add a photo'}
            <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {busy && <p role="status" className="text-muted">Preparing and checking the photo…</p>}
          {prep && prep.facesBlurred > 0 && <p className="text-[0.92rem] text-muted">Blurred {prep.facesBlurred} face{prep.facesBlurred > 1 ? 's' : ''} before upload.</p>}
        </div>
      </div>
      {quality && !quality.ok && !accepted && (
        <div className="mt-3 rounded-tile border border-watch bg-watch-tint p-4" role="status">
          <ul className="list-disc pl-5">{quality.issues.map((i) => <li key={i.id}>{i.text}</li>)}</ul>
          <p className="mt-2 text-[0.95rem]">You can retake it, or use it anyway: zones we can&apos;t see clearly come back as &ldquo;couldn&apos;t tell&rdquo;.</p>
          <Button className="mt-2" onClick={() => setAccepted(true)}>Use it anyway</Button>
        </div>
      )}
      {accepted && (
        <p className="mt-3 inline-flex rounded-tile bg-lime-tint px-4 py-2 font-semibold hc-border">
          Photo added.{kept === false ? ' It was described, then deleted: it is not stored.' : ''}
        </p>
      )}
      <ErrorText error={error instanceof ApiError && error.consent ? new Error('Photos need your OK to analyse them.') : error} />
    </Card>
  )
}

function Results({ a }: { a: Assessment }) {
  return (
    <>
      <h2 className="title-md">Your results</h2>
      <ul className="space-y-3">
        {a.zones.map((z) => (
          <li key={z.zone}>
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[1.15rem] font-semibold">{z.name}</h3>
                {z.rules_state && <StatusChip state={z.rules_state.state} />}
              </div>
              {z.explanation && <p className="mt-2">{z.explanation.text}</p>}
              {z.explanation && <p className="mt-3 rounded-tile bg-lime-tint px-4 py-3 font-semibold hc-border">{z.explanation.action}</p>}
              <Link href={`/map/${z.zone}`} className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Details and sources</Link>
            </Card>
          </li>
        ))}
      </ul>
      <p className="text-[0.9rem] text-muted">
        States come from written rules ({a.rules_version}). {a.demo_ai ? 'Photo observations came from Demo AI, not OpenAI.' : ''} This is guidance and signposting, not a diagnosis.
      </p>
      <div className="flex flex-wrap gap-2">
        <LinkButton href="/map" variant="primary">See my Crown Map</LinkButton>
        {a.zones.some((z) => z.rules_state?.state === 'get_checked') && <LinkButton href="/get-checked" variant="dark">What to do next</LinkButton>}
      </div>
    </>
  )
}

export default function CheckPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CheckFlow />
    </Suspense>
  )
}
