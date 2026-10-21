'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArticleCard } from '@/components/ArticleCard'
import { CrownMap } from '@/components/CrownMap'
import { IconArrowUpRight, IconBell, IconCalendar, IconChevronsRight, IconDrop, IconPlus, IconSparkle, IconWand } from '@/components/icons'
import { RhythmStrip, stageWord } from '@/components/Rhythm'
import { STATE_TEXT, STATE_WORDS, StateIcon, StatusChip } from '@/components/Status'
import {
  ActionPill, Avatar, Button, Card, CornerLink, ErrorText, Loading, Panel, Ring, RingTile, SectionHead, TextField, TickBar, inputClass,
} from '@/components/ui'
import { api } from '@/lib/api'
import { dayMonth, greeting } from '@/lib/hooks'
import type { Article, CheckIn, MapZone, Period, Today, TodayCard, ZoneStateId } from '@/lib/types'

const KINDS: [string, string][] = [
  ['braids', 'Braids'], ['twists', 'Twists'], ['locs', 'Locs'], ['cornrows', 'Cornrows'], ['wig', 'Wig'],
  ['weave', 'Weave or extensions'], ['natural', 'My own hair, out'], ['other', 'Something else'],
]
const STAGE_ORDER: Period['stage'][] = ['install', 'wear', 'take_down', 'rest']
const DAY = 864e5

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY)
}

export default function TodayPage() {
  const today = useQuery({ queryKey: ['today'], queryFn: () => api<Today>('/rhythm/today') })
  const map = useQuery({ queryKey: ['map'], queryFn: () => api<{ zones: MapZone[] }>('/map') })
  const checkins = useQuery({ queryKey: ['checkins'], queryFn: () => api<CheckIn[]>('/checkins?limit=200') })
  const articles = useQuery({ queryKey: ['articles'], queryFn: () => api<Article[]>('/library/articles') })
  const [adding, setAdding] = useState(false)

  if (today.isLoading) return <Loading />
  if (!today.data) return <ErrorText error={today.error} />
  const t = today.data
  const p = t.period
  const cards = t.cards
  const hasLime = cards.some((c) => ['wash_day', 'onboarding', 'take_down'].includes(c.type))
  const learn = cards.find((c) => c.type === 'learn')

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Avatar name={t.name} size={60} />
        <div className="min-w-0">
          <h1>
            <span className="block text-[1rem] font-medium text-muted">{greeting()}{t.name ? ',' : ''}</span>
            {t.name && <span className="title block"><em>{t.name}</em></span>}
          </h1>
          <p className="mt-1 text-[1rem] text-muted">
            {p ? `Day ${p.day} of ${p.style_name.toLowerCase()} · ${stageWord(p.stage)}` : 'No style on your rhythm yet'}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <div className="min-w-0 space-y-5">
          <RhythmPanel period={p} zones={map.data?.zones} checkins={checkins.data} onAdd={() => setAdding(true)} />
          {adding && <AddStyle onDone={() => setAdding(false)} />}

          {cards.filter((c) => c.type !== 'learn').map((c, i) => (
            <TodayCardView key={`${c.type}-${i}`} card={c} />
          ))}

          <ActionPill
            href="/plan"
            tone={hasLime ? 'dark' : 'lime'}
            title="Your care plan for this style"
            body="Daily, weekly and wash-day steps, written up for you"
            icon={<IconWand />}
          />
        </div>

        <div className="min-w-0 space-y-5">
          {map.data && <CrownMapCard zones={map.data.zones} />}
          {articles.data && <ForYou articles={articles.data} pick={learn?.article} />}
        </div>
      </div>
    </div>
  )
}

/** Board 1's "Your hair health" block, with real counts only: day in style, stage, zones checked, weekly check-in. */
function RhythmPanel({ period: p, zones, checkins, onAdd }: { period: Period | null; zones?: MapZone[]; checkins?: CheckIn[]; onAdd: () => void }) {
  const checked = zones ? zones.filter((z) => z.state !== 'not_checked').length : 0
  const last = checkins?.[0]
  const since = last ? Math.floor((Date.now() - new Date(last.created_at).getTime()) / DAY) : null
  const due = since === null || since >= 7
  const planned = p?.take_down_planned ? daysBetween(p.install_date, p.take_down_planned) : null
  const stageIdx = p ? STAGE_ORDER.indexOf(p.stage) : -1
  const live = p && p.stage !== 'ended'

  return (
    <Panel aria-labelledby="rhythm-title">
      <div className="flex items-center gap-3 px-1 pb-3 pt-1">
        <span aria-hidden="true" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface text-ink hc-border">
          <IconCalendar />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="rhythm-title" className="text-[1.2rem] font-semibold leading-tight">Your hair rhythm</h2>
          <p className="text-[0.95rem] text-muted">
            {live ? `${p.style_name} · since ${dayMonth(p.install_date)}` : 'Add a style to start your rhythm'}
          </p>
        </div>
        <CornerLink href="/journal" label="Open your journal" />
      </div>

      {live && (
        <div className="space-y-3 px-1 pb-4">
          <RhythmStrip stage={p.stage} />
          {planned !== null && (p.stage === 'install' || p.stage === 'wear') && (
            <div className="rounded-tile bg-surface px-4 py-3 hc-border">
              <div className="flex items-baseline justify-between gap-3 text-[0.88rem]">
                <span className="font-semibold">Day {p.day} of {planned}</span>
                <span className="text-muted">Take-down {dayMonth(p.take_down_planned!)}</span>
              </div>
              <div className="mt-2">
                <TickBar value={p.day} max={planned} label={`Day ${p.day} of ${planned} planned days`} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {live ? (
          <>
            <RingTile
              label="Day in style"
              value={`Day ${p.day}`}
              sub={planned !== null ? `of ${planned} planned` : 'No take-down date yet'}
              ring={planned !== null ? <Ring value={p.day} max={planned} tone="teal" /> : <Ring value={0} max={1} dashed />}
              sr={planned !== null ? `Day ${p.day} of ${planned} planned days in this style.` : `Day ${p.day} in this style. No take-down date yet.`}
            />
            <RingTile
              label="Rhythm stage"
              value={stageWord(p.stage)}
              sub={`Stage ${stageIdx + 1} of 4`}
              ring={<Ring value={stageIdx} max={4} segments={4} tone="violet" />}
              sr={`Rhythm stage: ${stageWord(p.stage)}, stage ${stageIdx + 1} of 4.`}
            />
          </>
        ) : null}
        <RingTile
          href="/map"
          label="Zones checked"
          value={<>{checked}<span className="text-[1rem] text-muted"> / 5</span></>}
          sub="on your Crown Map"
          ring={<Ring value={checked} max={5} tone="olive" />}
          sr={`${checked} of 5 zones checked on your Crown Map.`}
        />
        <RingTile
          href="/journal"
          label="Weekly check-in"
          value={due ? 'Due' : `${7 - (since ?? 0)} days`}
          sub={due ? 'Takes a minute' : 'until the next one'}
          ring={<Ring value={due ? 7 : since ?? 0} max={7} tone="ink" />}
          sr={due ? 'Your weekly check-in is due.' : `Next weekly check-in in ${7 - (since ?? 0)} days.`}
        />
      </div>

      <RhythmControls period={p} onAdd={onAdd} />
    </Panel>
  )
}

/** Board 1's reminder row: a white pill and a lime round action. */
function RhythmControls({ period, onAdd }: { period: Period | null; onAdd: () => void }) {
  const qc = useQueryClient()
  const router = useRouter()
  const move = useMutation({
    mutationFn: (stage: Period['stage']) => api(`/rhythm/periods/${period!.id}`, { method: 'PATCH', json: { stage } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today'] }),
  })

  let title = 'No style on your rhythm yet'
  let sub = 'Add the style you have in now'
  let action: { label: string; run: () => void; add?: boolean } = { label: 'Add your current style', run: onAdd, add: true }
  if (period && (period.stage === 'install' || period.stage === 'wear')) {
    title = period.take_down_planned ? `Take-down ${dayMonth(period.take_down_planned)}` : 'Take-down day'
    sub = 'When it comes, start your take-down check'
    action = { label: "It's take-down day", run: () => router.push('/take-down') }
  } else if (period?.stage === 'take_down') {
    title = 'Take-down in progress'
    sub = 'Give your hair some rest days next'
    action = { label: 'Start rest days', run: () => move.mutate('rest') }
  } else if (period?.stage === 'rest') {
    title = period.rest_until ? `Resting until ${dayMonth(period.rest_until)}` : 'Rest days'
    sub = 'Add your next style when it goes in'
    action = { label: 'New install', run: onAdd, add: true }
  }

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex min-h-16 flex-1 items-center gap-3 rounded-full bg-surface py-2 pl-2 pr-5 hc-border">
          <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink">
            <IconBell size={20} />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[0.95rem] font-semibold">{title}</span>
            <span className="block text-[0.82rem] text-muted">{sub}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={action.run}
          aria-label={action.label}
          title={action.label}
          disabled={move.isPending}
          className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-lime text-on-lime transition-[filter] hover:brightness-95 disabled:opacity-50 hc-border"
        >
          {action.add ? <IconPlus /> : <IconChevronsRight />}
        </button>
      </div>
      <div className="mt-2"><ErrorText error={move.error} /></div>
    </div>
  )
}

function TodayCardView({ card }: { card: TodayCard }) {
  const router = useRouter()
  switch (card.type) {
    case 'checkin':
      return (
        <Card className="p-6">
          <p className="label">{card.title}</p>
          <h2 className="mt-1 text-[1.3rem] font-semibold leading-snug">{card.question}</h2>
          {card.needs_consent ? (
            <p className="mt-2 text-muted">Check-ins need your OK to keep hair-health information. You&apos;ll be asked on the next screen.</p>
          ) : null}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {card.options?.map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => router.push(`${card.href}?${card.field}=${v}`)}
                className="min-h-13 rounded-full border border-line bg-panel px-2 font-semibold transition-colors hover:border-ink hover:bg-surface hc-border"
              >
                {label}
              </button>
            ))}
          </div>
        </Card>
      )
    case 'wash_day':
      return <ActionPill href={card.href} title={card.title} body={card.body} icon={<IconDrop />} />
    case 'onboarding':
      return <ActionPill href={card.href} title={card.title} body={card.body} icon={<IconSparkle />} />
    case 'take_down':
      return <ActionPill href={card.href} title={card.title} body={card.body ?? 'Start your take-down check'} />
    case 'get_checked':
      return (
        <Card className="border-2 border-check p-6">
          <StatusChip state="get_checked" label={card.title} />
          <p className="mt-3">{card.body}</p>
          <Link href={card.href} className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-surface">
            See what to do
            <IconArrowUpRight size={18} />
          </Link>
        </Card>
      )
    default:
      return (
        <Card>
          <h2 className="text-[1.15rem] font-semibold">{card.title}</h2>
          {card.body && <p className="mt-1 text-muted">{card.body}</p>}
          <Link href={card.href} className="mt-3 inline-flex min-h-11 items-center gap-1 font-semibold underline underline-offset-4">
            Open
          </Link>
        </Card>
      )
  }
}

/** Board 2's "Your hair health" card: words on the left, the art on the right. States, not scores. */
function CrownMapCard({ zones }: { zones: MapZone[] }) {
  const states = Object.fromEntries(zones.map((z) => [z.zone, z.state]))
  const groups = (['get_checked', 'watch', 'calm', 'not_checked'] as ZoneStateId[])
    .map((s) => ({ s, z: zones.filter((x) => x.state === s) }))
    .filter((g) => g.z.length)
  return (
    <section aria-labelledby="map-title" className="overflow-hidden rounded-sheet border border-line bg-surface hc-border">
      <div className="grid grid-cols-[1fr_7.5rem] sm:grid-cols-[1fr_11rem]">
        <div className="p-5 pr-3">
          <h2 id="map-title" className="title-md">Your Crown <em>Map</em></h2>
          <ul className="mt-3 space-y-2">
            {groups.map(({ s, z }) => (
              <li key={s}>
                <p className="flex items-start gap-2 text-[0.95rem] leading-snug">
                  <span className={`mt-0.5 ${STATE_TEXT[s]}`}><StateIcon state={s} /></span>
                  <span>
                    <span className="font-semibold">{STATE_WORDS[s]}</span>
                    <span className="text-muted"> · {s === 'not_checked' && z.length > 1 ? `${z.length} zones` : z.map((x) => x.name).join(', ')}</span>
                  </span>
                </p>
              </li>
            ))}
          </ul>
          <Link href="/map" className="mt-5 inline-flex min-h-12 items-center gap-2 whitespace-nowrap rounded-full bg-ink px-5 font-semibold text-surface">
            See the map
            <IconArrowUpRight size={18} />
          </Link>
        </div>
        <CrownMap states={states} compact title="Crown Map preview" className="flex h-full items-center !rounded-none" />
      </div>
    </section>
  )
}

/** "For you": library reads as cards with a close-up of the braid art, in place of the boards' product shelf. */
function ForYou({ articles, pick }: { articles: Article[]; pick?: string }) {
  const sorted = pick ? [...articles].sort((a, b) => (a.id === pick ? -1 : b.id === pick ? 1 : 0)) : articles
  return (
    <section aria-labelledby="foryou">
      <SectionHead title={<span id="foryou">For you</span>} href="/ask" linkLabel="See all" />
      <ul className="scroller -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-1 lg:overflow-visible lg:px-0">
        {sorted.slice(0, 5).map((a, i) => (
          <li key={a.id} className="w-64 shrink-0 lg:w-auto">
            <ArticleCard article={a} index={i} layout="auto" />
          </li>
        ))}
      </ul>
    </section>
  )
}

function AddStyle({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('braids')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [takeDown, setTakeDown] = useState('')
  const add = useMutation({
    mutationFn: () =>
      api('/rhythm/periods', {
        json: { style_name: name || KINDS.find((k) => k[0] === kind)?.[1], style_kind: kind, install_date: date, take_down_planned: takeDown || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
      onDone()
    },
  })
  return (
    <Card className="p-6">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <h2 className="title-md">Add your current style</h2>
        <div>
          <label htmlFor="kind" className="mb-1.5 block font-semibold">Style</label>
          <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <TextField id="style-name" label="Name it (optional)" placeholder="Knotless braids" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <TextField id="install" label="Install date" type="date" max={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} required />
        <TextField id="takedown" label="Planned take-down (optional)" type="date" min={date} value={takeDown} onChange={(e) => setTakeDown(e.target.value)} />
        <ErrorText error={add.error} />
        <div className="flex gap-2">
          <Button type="submit" variant="dark" disabled={add.isPending}>Save style</Button>
          <Button onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Card>
  )
}
