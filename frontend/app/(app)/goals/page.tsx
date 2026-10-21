'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { IconGoal, IconPlus } from '@/components/icons'
import { Button, Card, ErrorText, Loading, Notice, PageHeader, inputClass } from '@/components/ui'
import { api } from '@/lib/api'
import { shortDate, useHealth } from '@/lib/hooks'
import type { Goal, Support } from '@/lib/types'

const PRESETS: [string, string][] = [
  ['Healthy edges', 'edges'], ['More moisture', 'moisture'], ['Less breakage', 'breakage'], ['Length retention', 'length'], ['A comfortable scalp', 'scalp'],
]

/** Goals and milestones (FR12): celebrate progress, and be honest that photos and feelings aren't measurements. */
export default function GoalsPage() {
  const qc = useQueryClient()
  const health = useHealth()
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => api<Goal[]>('/goals') })
  const [custom, setCustom] = useState('')
  const [support, setSupport] = useState<Support | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['goals'] })
  const onSaved = (r: unknown) => {
    const res = r as { saved?: boolean; support?: Support }
    if (res && res.saved === false && res.support) setSupport(res.support)
    refresh()
  }
  const add = useMutation({ mutationFn: (g: { title: string; area: string }) => api('/goals', { json: g }), onSuccess: onSaved })
  if (goals.isLoading) return <Loading />
  const have = new Set((goals.data ?? []).map((g) => g.title))
  const canType = !!health.data?.ai_enabled

  return (
    <div className="space-y-5">
      <PageHeader title="Goals" lead="Pick what you're working towards and note milestones as you go." />
      <Notice>
        Progress here is your own record. Photos and how your hair feels change with light, products and styles, so treat
        milestones as encouragement rather than measurements.
      </Notice>
      <div className="flex flex-wrap gap-2">
        {PRESETS.filter(([t]) => !have.has(t)).map(([title, area]) => (
          <Button key={title} onClick={() => add.mutate({ title, area })} disabled={add.isPending} className="pl-3">
            <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-lime text-on-lime"><IconPlus size={16} /></span>
            <span className="sr-only">Add </span>{title}
          </Button>
        ))}
      </div>
      {canType && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (custom.trim()) add.mutate({ title: custom.trim(), area: 'other' }, { onSuccess: () => setCustom('') })
          }}
        >
          <label htmlFor="custom-goal" className="sr-only">Your own goal</label>
          <input id="custom-goal" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={120} placeholder="Or write your own goal" className={`flex-1 ${inputClass}`} />
          <Button type="submit" variant="dark" disabled={!custom.trim() || add.isPending}>Add</Button>
        </form>
      )}
      <ErrorText error={add.error} />
      {support && <SupportBox support={support} />}
      <ul className="space-y-3">
        {(goals.data ?? []).map((g) => <GoalCard key={g.id} goal={g} onChange={onSaved} canType={canType} />)}
      </ul>
    </div>
  )
}

function SupportBox({ support }: { support: Support }) {
  return (
    <div role="alert" className="rounded-sheet border-2 border-ink bg-surface p-5">
      <p>{support.message}</p>
      <ul className="mt-3 space-y-1">
        {support.links.map((l) => (
          <li key={l.url}><a className="font-semibold underline underline-offset-4" href={l.url} target="_blank" rel="noopener noreferrer">{l.name}</a></li>
        ))}
      </ul>
      <p className="mt-3 text-muted">That wasn&apos;t saved.</p>
    </div>
  )
}

function GoalCard({ goal, onChange, canType }: { goal: Goal; onChange: (r: unknown) => void; canType: boolean }) {
  const [text, setText] = useState('')
  const patch = useMutation({ mutationFn: (body: object) => api(`/goals/${goal.id}`, { method: 'PATCH', json: body }), onSuccess: onChange })
  const del = useMutation({ mutationFn: () => api(`/goals/${goal.id}`, { method: 'DELETE' }), onSuccess: onChange })
  return (
    <Card as="li">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${goal.status === 'reached' ? 'bg-lime text-on-lime' : 'bg-raised'}`}><IconGoal size={22} /></span>
          <h2 className="text-[1.15rem] font-semibold">{goal.title}</h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-[0.9rem] font-semibold hc-border ${goal.status === 'active' ? 'bg-ink text-surface' : 'bg-raised'}`}>
          {{ active: 'In progress', reached: 'Reached', paused: 'Paused' }[goal.status]}
        </span>
      </div>
      {goal.milestones.length > 0 && (
        <ol className="mt-4 space-y-1.5 border-l-2 border-dashed border-line-strong pl-4">
          {goal.milestones.map((m, i) => (
            <li key={i}><span className="text-muted">{shortDate(m.date)}:</span> {m.note}</li>
          ))}
        </ol>
      )}
      {canType && (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) patch.mutate({ milestone: text.trim() }, { onSuccess: () => setText('') })
          }}
        >
          <label htmlFor={`m-${goal.id}`} className="sr-only">Add a milestone to {goal.title}</label>
          <input id={`m-${goal.id}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Add a milestone" className={`flex-1 ${inputClass}`} />
          <Button type="submit" disabled={!text.trim() || patch.isPending}>Add</Button>
        </form>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {goal.status !== 'reached' && <Button variant="quiet" onClick={() => patch.mutate({ status: 'reached' })}>Mark as reached</Button>}
        {goal.status === 'active' && <Button variant="quiet" onClick={() => patch.mutate({ status: 'paused' })}>Pause</Button>}
        {goal.status !== 'active' && <Button variant="quiet" onClick={() => patch.mutate({ status: 'active' })}>Back in progress</Button>}
        <Button variant="quiet" onClick={() => del.mutate()}>Remove</Button>
      </div>
      <ErrorText error={patch.error ?? del.error} />
    </Card>
  )
}
