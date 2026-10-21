'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { ArticleCard, articleIcon } from '@/components/ArticleCard'
import { CrownArt } from '@/components/CrownArt'
import { IconAsk, IconSearch } from '@/components/icons'
import { Markdown } from '@/components/Markdown'
import { ReviewBadge, Sources } from '@/components/Sources'
import { Button, Card, Chip, ErrorText, Loading, Notice, PageHeader } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { shortDate, useHealth } from '@/lib/hooks'
import type { Article, CoachReply } from '@/lib/types'

// Library filters (board 2's chips). Each one matches articles by their topics.
const FILTERS: [string, string[]][] = [
  ['All', []],
  ['Styles and tension', ['tension', 'braids', 'styles', 'take-down', 'extensions']],
  ['Wash day', ['wash-day', 'routine', 'moisture', 'conditioner']],
  ['Scalp', ['scalp', 'flaking', 'itch', 'dandruff']],
  ['Treatments', ['heat', 'relaxers', 'dye', 'breakage']],
  ['Getting checked', ['get-checked', 'referral', 'gp', 'dermatologist', 'early-signs']],
  ['Wellbeing', ['wellbeing', 'support']],
]

const STARTERS = [
  'How tight should my braids be?',
  'How often should I wash my hair?',
  'How long can I keep braids in?',
  'Why is my scalp itchy under my wig?',
]

function AskInner() {
  const article = useSearchParams().get('article')
  return article ? <ArticleView id={article} /> : <Coach />
}

function Coach() {
  const qc = useQueryClient()
  const health = useHealth()
  const history = useQuery({ queryKey: ['coach-history'], queryFn: () => api<CoachReply[]>('/coach/history') })
  const articles = useQuery({ queryKey: ['articles'], queryFn: () => api<Article[]>('/library/articles') })
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [latest, setLatest] = useState<CoachReply | null>(null)
  const [filter, setFilter] = useState('All')

  async function ask(question: string) {
    if (!question.trim()) return
    setBusy(true)
    setError(null)
    try {
      const r = await api<CoachReply>('/coach/ask', { json: { question } })
      setLatest(r)
      setQ('')
      qc.invalidateQueries({ queryKey: ['coach-history'] })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const aiOff = health.data && !health.data.ai_enabled
  const past = (history.data ?? []).filter((h) => h.id !== latest?.id)

  return (
    <div>
      <PageHeader
        title={<>Ask the Hair <em>Coach</em></>}
        lead="Answers come only from our library, with the sources shown. It's general information: it can't tell you what's causing a change in your own hair."
      />
      {health.data?.ai_enabled && !health.data.library_ready && (
        <div className="mb-4">
          <Notice title="The library is still being prepared">
            The backend embeds the library for the AI in use when it starts, which takes a moment. Until then the Coach can&apos;t find
            passages to answer from. If this stays, check the backend terminal.
          </Notice>
        </div>
      )}
      {aiOff ? (
        <Notice title="The Hair Coach needs AI set up">Add an OpenAI key to backend/.env, or set AI_MODE=fake to try it. You can still read the library below.</Notice>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(q)
          }}
          className="glass rounded-sheet p-4 shadow-soft sm:p-5"
        >
          <label htmlFor="question" className="flex items-center gap-2 font-semibold">
            <IconAsk size={20} />
            Your question
          </label>
          <div className="mt-3 flex items-end gap-2 rounded-[1.75rem] border border-line-strong bg-surface p-2 pl-4 focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[var(--focus)] hc-border">
            <textarea
              id="question"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="For example: how tight should my braids be?"
              className="min-h-14 flex-1 resize-none bg-transparent py-2 outline-none placeholder:text-muted"
            />
            <Button type="submit" variant="primary" className="shrink-0" disabled={busy || !q.trim()}>{busy ? 'Finding…' : 'Ask'}</Button>
          </div>
          <p className="mt-3 text-[0.88rem] text-muted">
            Your question is sent to OpenAI to find and write the answer, so leave out your name. Questions we can&apos;t answer yet
            are shown to our advisor, without your name, so the library can grow.
          </p>
          {!latest && !past.length && (
            <div className="mt-4">
              <p className="text-[0.92rem] font-semibold text-muted">Try one of these</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="min-h-11 rounded-full border border-line bg-surface px-4 text-[0.95rem] hover:bg-raised hc-border">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      )}
      <div className="mt-4"><ErrorText error={error instanceof ApiError && error.status === 429 ? error : error} /></div>

      <div className="mt-6 space-y-4" aria-live="polite">
        {latest && <Reply r={latest} />}
        {past.map((r) => <Reply key={r.id} r={r} />)}
      </div>

      <section className="mt-10" aria-labelledby="library-title">
        <h2 id="library-title" className="title-md">The <em>library</em></h2>
        <div className="scroller -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter the library">
          <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface"><IconSearch size={20} /></span>
          {FILTERS.map(([name]) => (
            <Chip key={name} active={filter === name} onClick={() => setFilter(name)}>{name}</Chip>
          ))}
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(articles.data ?? [])
            .filter((a) => {
              const topics = FILTERS.find(([n]) => n === filter)?.[1] ?? []
              return !topics.length || a.topics.some((t) => topics.includes(t))
            })
            .map((a, i) => (
              <li key={a.id}>
                <ArticleCard article={a} index={i} />
              </li>
            ))}
        </ul>
      </section>
    </div>
  )
}

function Reply({ r }: { r: CoachReply }) {
  const border = r.kind === 'support' || r.kind === 'see_someone_now' ? 'border-2 border-ink' : ''
  return (
    <Card as="article" className={`p-6 ${border}`}>
      <p className="ml-auto w-fit max-w-[90%] rounded-[1.25rem] rounded-br-md bg-ink px-4 py-2.5 text-surface">
        <span className="sr-only">You asked, </span>{r.question}
      </p>
      <p className="mt-1 text-right text-[0.8rem] text-muted">{shortDate(r.created_at)}</p>
      <p className="mt-3 max-w-[68ch] text-[1.08rem]">{r.text}</p>
      {r.action && <p className="mt-3 rounded-tile bg-lime-tint px-4 py-3 font-semibold hc-border">{r.action}</p>}
      {!!r.links?.length && (
        <ul className="mt-3 space-y-1">
          {r.links.map((l) => (
            <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">{l.name}</a></li>
          ))}
        </ul>
      )}
      <Sources sources={r.sources} />
      {r.kind === 'answer' && (
        <p className="mt-3 text-[0.85rem] text-muted">
          {r.demo_ai ? 'Demo AI: a canned reply built from the passage, not from OpenAI.' : 'Written by AI from the passages above only.'}
        </p>
      )}
    </Card>
  )
}

function ArticleView({ id }: { id: string }) {
  const a = useQuery({ queryKey: ['article', id], queryFn: () => api<Article>(`/library/articles/${id}`) })
  if (a.isLoading) return <Loading />
  if (!a.data) return <ErrorText error={a.error} />
  const art = a.data
  const Icon = articleIcon(art)
  return (
    <article>
      <PageHeader title={art.title} lead={art.summary} back={{ href: '/ask', label: 'Ask' }}>
        <p className="mt-3 [&>span]:ml-0"><ReviewBadge status={art.status} reviewer={art.reviewer} date={art.review_date} /></p>
      </PageHeader>
      <div aria-hidden="true" className="art-panel relative mb-6 h-40 overflow-hidden rounded-sheet sm:h-52">
        <CrownArt viewBox="90 110 170 110" />
        <span className="glass absolute left-4 top-4 inline-flex h-12 w-12 items-center justify-center rounded-full"><Icon size={22} /></span>
      </div>
      <Markdown text={art.body_md ?? ''} />
      <div className="mt-8 rounded-card border border-line bg-surface p-5 hc-border">
        <h2 className="font-semibold">Sources</h2>
        <ul className="mt-2 space-y-1">
          {art.sources.map((s) => (
            <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{s.name}</a></li>
          ))}
        </ul>
        <p className="mt-4 text-[0.9rem] text-muted">General information, not a diagnosis. If you&apos;re worried, talk to your GP or a pharmacist.</p>
      </div>
    </article>
  )
}

export default function AskPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AskInner />
    </Suspense>
  )
}
