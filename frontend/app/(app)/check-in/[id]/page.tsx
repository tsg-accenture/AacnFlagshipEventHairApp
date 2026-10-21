'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { ConsentPrompt } from '@/components/ConsentPrompt'
import { Sources } from '@/components/Sources'
import { StateIcon } from '@/components/Status'
import { Button, Card, ChoiceGroup, ErrorText, LinkButton, Loading, Notice, PageHeader, Ring, TextArea } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { useConsents, useHealth } from '@/lib/hooks'
import type { CheckinResult, CheckinTemplate } from '@/lib/types'

const OUTCOME_STYLE = {
  all_good: { tone: 'border-calm', icon: 'calm' as const, text: 'text-calm' },
  ease_the_pull: { tone: 'border-watch', icon: 'watch' as const, text: 'text-watch' },
  too_tight: { tone: 'border-check', icon: 'get_checked' as const, text: 'text-check' },
}

function CheckIn() {
  const { id } = useParams<{ id: string }>()
  const params = useSearchParams()
  const qc = useQueryClient()
  const health = useHealth()
  const consents = useConsents()
  const templates = useQuery({ queryKey: ['checkin-templates'], queryFn: () => api<Record<string, CheckinTemplate>>('/checkins/templates') })
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    params.forEach((v, k) => (init[k] = v))
    return init
  })
  const [note, setNote] = useState('')
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  if (templates.isLoading || consents.isLoading) return <Loading />
  const tpl = templates.data?.[id]
  if (!tpl) return <Notice tone="error">That check-in doesn&apos;t exist.</Notice>
  const needsConsent = !consents.data?.state.health_data.granted
  const answered = tpl.questions.filter((q) => answers[q.field]).length

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const r = await api<CheckinResult>('/checkins', { json: { template: id, answers, note: note.trim() || null } })
      setResult(r)
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['journey'] })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  if (result && result.saved === false) {
    return (
      <div role="alert" className="rounded-sheet border-2 border-ink bg-surface p-6">
        <p className="text-[1.1rem]">{result.support.message}</p>
        <ul className="mt-4 space-y-2">
          {result.support.links.map((l) => (
            <li key={l.url}><a className="font-semibold underline underline-offset-4" href={l.url} target="_blank" rel="noopener noreferrer">{l.name}</a></li>
          ))}
        </ul>
        <p className="mt-4 text-muted">Your note wasn&apos;t saved.</p>
      </div>
    )
  }

  if (result && result.saved) {
    const s = OUTCOME_STYLE[result.outcome]
    return (
      <div className="space-y-5">
        <PageHeader title={<>Thanks for <em>checking in</em></>} />
        <Card className={`border-2 p-6 ${s.tone}`}>
          <p className={`flex items-center gap-2 text-[1.3rem] font-semibold ${s.text}`}>
            <StateIcon state={s.icon} size={24} />
            {result.title}
          </p>
          <p className="mt-3">{result.body}</p>
          <p className="mt-4 rounded-tile bg-lime-tint px-4 py-3 font-semibold hc-border">{result.action}</p>
          {result.article && <Sources sources={[result.article]} label="Why we suggest this" />}
          <p className="mt-4 text-[0.88rem] text-muted">
            Set by written rules ({result.rules_version}
            {result.rules_status !== 'reviewed' ? ', draft awaiting clinical review' : ''}), not by AI.
          </p>
        </Card>
        {result.escalate && (
          <Card className="border-2 border-check p-6">
            <p className="flex items-center gap-2 font-semibold text-check"><StateIcon state="get_checked" />Worth getting checked</p>
            <ul className="mt-2 list-disc pl-5">
              {(result.escalation_reasons.length ? result.escalation_reasons : ['Pain together with lots of bumps.']).map((r) => <li key={r}>{r}</li>)}
            </ul>
            <LinkButton href="/get-checked" variant="dark" className="mt-4">See what to do</LinkButton>
          </Card>
        )}
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/today" variant="dark">Back to Today</LinkButton>
          <LinkButton href="/stylist-note">Write a note for my stylist</LinkButton>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={tpl.title} lead={tpl.intro} back={{ href: '/today', label: 'Today' }} />
      <div className="glass flex items-center gap-4 rounded-full py-2 pl-2 pr-5 shadow-soft" role="status">
        <span className="relative inline-flex" aria-hidden="true">
          <Ring value={answered} max={tpl.questions.length} tone="teal" size={48} />
          <span className="num absolute inset-0 flex items-center justify-center text-[0.85rem] font-semibold">{answered}</span>
        </span>
        <span className="leading-tight">
          <span className="block font-semibold">{answered} of {tpl.questions.length} answered</span>
          <span className="block text-[0.88rem] text-muted">Answer what you can. It takes about a minute.</span>
        </span>
      </div>
      {needsConsent && <ConsentPrompt type="health_data" />}
      {tpl.questions.map((q) => (
        <Card key={q.field} className="p-6">
          <ChoiceGroup
            legend={q.text}
            name={q.field}
            options={q.options}
            value={answers[q.field]}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.field]: v }))}
            size="lg"
          />
        </Card>
      ))}
      {health.data?.ai_enabled && (
        <Card>
          <TextArea id="note" label="Anything else? (optional)" hint="A few words for your diary. Notes are screened for safety before they're saved." value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </Card>
      )}
      <ErrorText error={error instanceof ApiError && error.consent ? new Error('Please give your OK above first.') : error} />
      <Button variant="primary" className="w-full sm:w-auto" disabled={busy || needsConsent || Object.keys(answers).length === 0} onClick={submit}>
        {busy ? 'Saving…' : 'Save check-in'}
      </Button>
    </div>
  )
}

export default function CheckInPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CheckIn />
    </Suspense>
  )
}
