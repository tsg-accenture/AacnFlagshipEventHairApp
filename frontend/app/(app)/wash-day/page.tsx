'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { IconBook, IconDrop } from '@/components/icons'
import { Button, ErrorText, IconButton, LinkButton, Loading, Ring } from '@/components/ui'
import { api } from '@/lib/api'
import type { Article } from '@/lib/types'

type Step = { id: string; title: string; body: string; timer?: boolean; optional?: boolean; article?: string }

/** Wash-day mode (B05): one step per screen, big type for wet hands, an optional ring timer. */
export default function WashDayPage() {
  const q = useQuery({ queryKey: ['wash-day'], queryFn: () => api<{ steps: Step[]; timer_presets_minutes: number[] }>('/plans/wash-day') })
  const [i, setI] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [i])

  if (q.isLoading) return <Loading />
  if (!q.data) return <ErrorText error={q.error} />
  const steps = q.data.steps
  const step = steps[i]
  const last = i === steps.length - 1

  return (
    <div className="lg:grid lg:grid-cols-[1fr_19rem] lg:gap-8">
      <div>
        <div className="flex items-center justify-between gap-3">
          <IconButton href="/today" label="Exit wash-day mode">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </IconButton>
          <p className="glass inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold" aria-live="polite">
            <IconDrop size={18} />
            Step {i + 1} of {steps.length}
          </p>
        </div>
        <ol className="mt-4 flex gap-1.5" aria-hidden="true">
          {steps.map((s, n) => (
            <li key={s.id} className={`h-2 flex-1 rounded-full ${n <= i ? 'bg-ink' : 'bg-track'}`} />
          ))}
        </ol>

        <section className="mt-8 min-h-[18rem] rounded-sheet border border-line bg-surface p-6 hc-border sm:p-8">
          <h1 ref={heading} tabIndex={-1} className="font-serif text-[2.5rem] font-medium leading-[1.05] outline-none sm:text-[3.1rem]">
            {step.title}
          </h1>
          {step.optional && <p className="mt-3 inline-flex rounded-full bg-raised px-3 py-1 font-semibold text-muted">Optional step</p>}
          <p className="mt-5 max-w-[34ch] text-[1.5rem] leading-snug">{step.body}</p>
          {step.timer && <Timer key={step.id} presets={q.data.timer_presets_minutes} />}
          {step.article && (
            <Link href={`/ask?article=${step.article}`} className="mt-6 inline-flex min-h-11 items-center font-semibold underline underline-offset-4 lg:hidden">
              Why this step
            </Link>
          )}
        </section>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button className="min-h-16 text-[1.15rem]" disabled={i === 0} onClick={() => setI(i - 1)}>Back</Button>
          {last ? (
            <LinkButton href="/today" variant="primary" className="min-h-16 text-[1.15rem]">Finish</LinkButton>
          ) : (
            <Button variant="primary" className="min-h-16 text-[1.15rem]" onClick={() => setI(i + 1)}>Next step</Button>
          )}
        </div>
      </div>
      <aside className="mt-10 hidden lg:block">
        {step.article ? <WhyPanel id={step.article} /> : <p className="text-muted">No reading for this step.</p>}
        <p className="mt-6 text-[0.92rem] text-muted">Product picks for each step arrive in a later version, with Black-owned badges and any commission shown.</p>
      </aside>
    </div>
  )
}

function WhyPanel({ id }: { id: string }) {
  const a = useQuery({ queryKey: ['article', id], queryFn: () => api<Article>(`/library/articles/${id}`) })
  if (!a.data) return null
  return (
    <div className="rounded-card border border-line bg-surface p-5 hc-border">
      <span aria-hidden="true" className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-raised"><IconBook size={22} /></span>
      <p className="label mt-3">Why this step</p>
      <p className="mt-1 font-semibold">{a.data.title}</p>
      <p className="mt-1 text-muted">{a.data.summary}</p>
      <Link href={`/ask?article=${id}`} className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Read it</Link>
    </div>
  )
}

function Timer({ presets }: { presets: number[] }) {
  const [total, setTotal] = useState<number | null>(null)
  const [left, setLeft] = useState(0)
  const [running, setRunning] = useState(false)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
    return () => clearInterval(t)
  }, [running])
  useEffect(() => {
    if (left === 0) setRunning(false)
  }, [left])
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <div className="mt-6 rounded-tile bg-panel p-5 hc-border">
      {total === null ? (
        <>
          <p className="font-semibold">Set a timer</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map((m) => (
              <Button key={m} className="min-h-14 min-w-16 text-[1.1rem]" onClick={() => { setTotal(m * 60); setLeft(m * 60); setRunning(true) }}>
                {m} min
              </Button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          <span className="relative inline-flex">
            <Ring value={left} max={total} tone="teal" size={132} stroke={10} />
            <span className="num absolute inset-0 flex items-center justify-center font-serif text-[1.7rem] font-medium" role="timer" aria-live={left === 0 ? 'assertive' : 'off'}>
              {left === 0 ? 'Done' : `${mm}:${ss}`}
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" className="min-h-14" onClick={() => setRunning(!running)} disabled={left === 0}>{running ? 'Pause' : 'Resume'}</Button>
            <Button className="min-h-14" onClick={() => { setTotal(null); setRunning(false) }}>Reset</Button>
          </div>
          {left === 0 && <p className="w-full font-semibold">Time&apos;s up.</p>}
        </div>
      )}
    </div>
  )
}
