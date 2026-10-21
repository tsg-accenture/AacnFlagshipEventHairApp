'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CrownMark } from '@/components/icons'
import { Button, ErrorText, Loading, inputClass } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { useConsents, useHealth, useMe, useSetConsent } from '@/lib/hooks'
import type { ConsentType, Support } from '@/lib/types'

type Step = {
  id: string
  say: string
  options?: [string, string][]
  multi?: boolean
  input?: 'text' | 'date'
  optional?: boolean
  only_if?: Record<string, string[]>
  consent?: ConsentType
  needs_consent?: ConsentType
}
type Msg = { from: 'bot' | 'me'; text: string }
type Answers = Record<string, string | string[] | boolean | null>

const PROTECTIVE = ['braids', 'twists', 'locs', 'cornrows', 'wig', 'weave', 'other']

/** Chat-style onboarding with quick replies (B02). Scripted; AI only turns typed text into profile fields. */
export default function StartPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const me = useMe()
  const health = useHealth()
  const consents = useConsents()
  const setConsent = useSetConsent()
  const script = useQuery({ queryKey: ['content', 'onboarding'], queryFn: () => api<{ steps: Step[] }>('/content/onboarding') })
  const [answers, setAnswers] = useState<Answers>({})
  const [log, setLog] = useState<Msg[]>([])
  const [index, setIndex] = useState(0)
  const [multi, setMulti] = useState<string[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [support, setSupport] = useState<Support | null>(null)
  const [saving, setSaving] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const granted = (t: ConsentType) => !!(consents.data?.state[t]?.granted || answers[`consent:${t}`] === true)

  const steps = script.data?.steps ?? []
  const visible = (s: Step, a: Answers) => {
    if (s.only_if) {
      for (const [k, vals] of Object.entries(s.only_if)) if (!vals.includes(String(a[k] ?? ''))) return false
    }
    if (s.needs_consent && !granted(s.needs_consent)) return false
    if (s.needs_consent && s.input === 'text' && health.data && !health.data.ai_enabled) return false
    if (s.consent && consents.data?.state[s.consent]?.granted) return false // already given
    if (s.id === 'name' && me.data?.display_name) return false
    return true
  }
  const nextIndex = (from: number, a: Answers) => {
    let i = from
    while (i < steps.length && !visible(steps[i], a)) i++
    return i
  }
  const current = useMemo(() => {
    const i = nextIndex(index, answers)
    return i < steps.length ? steps[i] : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, answers, steps, consents.data, me.data, health.data])

  useEffect(() => {
    if (current) setLog((l) => (l.length && l[l.length - 1].text === current.say ? l : [...l, { from: 'bot', text: current.say }]))
  }, [current])
  // Block body on purpose: newer browsers return a Promise from scrollIntoView, and an effect
  // must return nothing or a clean-up function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [log])

  function answer(step: Step, value: Answers[string], label: string) {
    const a = { ...answers, [step.id]: value }
    setAnswers(a)
    setLog((l) => [...l, { from: 'me', text: label }])
    setMulti([])
    setText('')
    setIndex(steps.indexOf(step) + 1)
  }

  async function consentAnswer(step: Step, yes: boolean) {
    setError(null)
    if (yes) {
      try {
        await setConsent.mutateAsync({ type: step.consent!, granted: true, source: 'onboarding' })
      } catch (e) {
        setError(e)
        return
      }
    }
    const a = { ...answers, [`consent:${step.consent}`]: yes }
    setAnswers(a)
    setLog((l) => [...l, { from: 'me', text: yes ? "Yes, that's OK" : 'Not now' }])
    setIndex(steps.indexOf(step) + 1)
  }

  async function concernText(step: Step) {
    setError(null)
    try {
      const r = await api<{ fields?: { concerns: string[]; zones: string[] }; support?: Support }>('/onboarding/parse', { json: { text } })
      if (r.support) {
        setSupport(r.support)
        return
      }
      const a = { ...answers, [step.id]: text, concerns: r.fields?.concerns ?? [], zones: r.fields?.zones ?? [] }
      setAnswers(a)
      setLog((l) => [...l, { from: 'me', text }])
      setText('')
      setIndex(steps.indexOf(step) + 1)
    } catch (e) {
      setError(e)
    }
  }

  async function finish() {
    setSaving(true)
    setError(null)
    try {
      const data: Record<string, unknown> = {}
      for (const k of ['route', 'style_kind', 'wash_frequency', 'wash_day', 'treatments', 'goals'])
        if (answers[k] !== undefined && answers[k] !== null) data[k] = answers[k]
      if (granted('health_data')) {
        if (answers.concern_text) data.concern_text = answers.concern_text
        if (answers.concerns) data.concerns = answers.concerns
        if (answers.zones) data.zones = answers.zones
      }
      await api('/profile', { method: 'PUT', json: { display_name: (answers.name as string) || undefined, data, complete_onboarding: true } })
      const kind = answers.style_kind as string | undefined
      if (kind && PROTECTIVE.includes(kind) && answers.install_date) {
        const label = steps.find((s) => s.id === 'style_kind')?.options?.find((o) => o[0] === kind)?.[1] ?? 'My style'
        await api('/rhythm/periods', { json: { style_name: label, style_kind: kind, install_date: answers.install_date } })
      }
      await qc.invalidateQueries()
      router.push(answers.route === 'questions' ? '/ask' : '/today')
    } catch (e) {
      setError(e)
      setSaving(false)
    }
  }

  if (script.isLoading || consents.isLoading || me.isLoading) return <Loading />
  const done = steps.length > 0 && !current

  return (
    <div>
      <h1 className="title">Let&apos;s get you <em>set up</em></h1>
      <p className="mt-2 text-muted">A few quick questions. You can change any answer later.</p>

      <ol className="mt-6 space-y-3" aria-live="polite">
        {log.map((m, i) => (
          <li key={i} className={`flex items-end gap-2 ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
            {m.from !== 'me' && <span className="shrink-0"><CrownMark size={30} /></span>}
            <p className={`max-w-[85%] rounded-[1.5rem] px-4 py-3 ${m.from === 'me' ? 'rounded-br-md bg-ink text-surface' : 'rounded-bl-md border border-line bg-surface hc-border'}`}>
              <span className="sr-only">{m.from === 'me' ? 'You: ' : 'Crown AI: '}</span>
              {m.text}
            </p>
          </li>
        ))}
      </ol>
      <div ref={endRef} />

      {support && (
        <div className="mt-6 rounded-sheet border-2 border-ink bg-surface p-5" role="alert">
          <p>{support.message}</p>
          <ul className="mt-3 space-y-1">
            {support.links.map((l) => (
              <li key={l.url}><a className="font-semibold underline" href={l.url} target="_blank" rel="noopener noreferrer">{l.name}</a></li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        {current && current.consent && (
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" onClick={() => consentAnswer(current, true)} disabled={setConsent.isPending}>Yes, that&apos;s OK</Button>
            <Button onClick={() => consentAnswer(current, false)}>Not now</Button>
          </div>
        )}
        {current && current.options && !current.multi && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick replies">
            {current.options.map(([v, label]) => (
              <Button key={v} onClick={() => answer(current, v, label)}>{label}</Button>
            ))}
          </div>
        )}
        {current && current.options && current.multi && (
          <div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Choose any that apply">
              {current.options.map(([v, label]) => {
                const on = multi.includes(v)
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setMulti((m) => (v === 'none' ? (on ? [] : ['none']) : on ? m.filter((x) => x !== v) : [...m.filter((x) => x !== 'none'), v]))
                    }
                    className={`min-h-11 rounded-full px-5 font-semibold transition-colors hc-border ${on ? 'bg-ink text-surface' : 'border border-line bg-surface hover:bg-raised'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <Button
              variant="primary"
              className="mt-3"
              onClick={() => {
                const picked = multi.filter((v) => v !== 'none')
                const labels = current.options!.filter((o) => multi.includes(o[0])).map((o) => o[1])
                answer(current, picked, labels.join(', ') || 'None of these')
              }}
            >
              Done
            </Button>
          </div>
        )}
        {current && current.input === 'date' && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (text) answer(current, text, new Date(text).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }))
            }}
          >
            <label className="block">
              <span className="mb-1 block font-semibold">Install date</span>
              <input type="date" max={new Date().toISOString().slice(0, 10)} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />
            </label>
            <Button type="submit" variant="primary" disabled={!text}>Save</Button>
            {current.optional && <Button onClick={() => answer(current, null, 'Skip')}>Skip</Button>}
          </form>
        )}
        {current && current.input === 'text' && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!text.trim()) return
              if (current.id === 'concern_text') concernText(current)
              else answer(current, text.trim(), text.trim())
            }}
          >
            <label htmlFor="chat-text" className="sr-only">{current.say}</label>
            <input id="chat-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={current.id === 'name' ? 80 : 2000} className={inputClass} />
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={!text.trim()}>Send</Button>
              {current.optional && <Button onClick={() => answer(current, null, 'Skip')}>Skip</Button>}
            </div>
          </form>
        )}
        {done && (
          <div className="glass rounded-sheet p-6 shadow-soft">
            <p className="title-md">That&apos;s everything <em>for now</em>.</p>
            <p className="mt-1 text-muted">Your Today screen is ready. Photos stay optional, and you can change any of this in Settings.</p>
            <Button variant="primary" className="mt-4" onClick={finish} disabled={saving}>
              {saving ? 'Saving…' : 'Go to Today'}
            </Button>
          </div>
        )}
        <div className="mt-3">
          <ErrorText error={error instanceof ApiError && error.aiUnavailable ? new Error('Typed answers need AI set up. You can skip this question.') : error} />
        </div>
      </div>
    </div>
  )
}
