'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ConsentPrompt } from '@/components/ConsentPrompt'
import { IconScissors } from '@/components/icons'
import { Button, Card, ErrorText, Loading, PageHeader, Toggle } from '@/components/ui'
import { api } from '@/lib/api'
import { useConsents, useHealth } from '@/lib/hooks'

type Item = { id: string; text: string; why: string; suggested: boolean }

/** Stylist note (B07): only the lines you tick are included, and nothing is shared until you share it. */
export default function StylistNotePage() {
  const items = useQuery({ queryKey: ['stylist-items'], queryFn: () => api<{ items: Item[] }>('/stylist-note/items') })
  const consents = useConsents()
  const health = useHealth()
  const [ticked, setTicked] = useState<string[]>([])
  const [polish, setPolish] = useState(false)
  const [note, setNote] = useState<{ text: string; polished: boolean; demo_ai: boolean } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (items.data) setTicked(items.data.items.filter((i) => i.suggested).map((i) => i.id))
  }, [items.data])

  if (items.isLoading || consents.isLoading) return <Loading />
  if (!items.data) return <ErrorText error={items.error} />
  const sharingOk = consents.data?.state.sharing.granted

  async function create() {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      setNote(await api('/stylist-note', { json: { item_ids: ticked, polish } }))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    if (!note) return
    if (navigator.share) {
      try {
        await navigator.share({ title: 'A note for my stylist', text: note.text })
        return
      } catch {
        /* cancelled or unavailable: fall back to copy */
      }
    }
    await navigator.clipboard.writeText(note.text)
    setCopied(true)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={<>A note for my <em>stylist</em></>}
        lead="Your stylist sees your scalp up close at every install. Tick what you want them to know. Only ticked lines go in the note."
        back={{ href: '/today', label: 'Today' }}
      />
      {!sharingOk && <ConsentPrompt type="sharing" compact />}
      <Card className="p-6">
        <fieldset>
          <legend className="title-md">What to include</legend>
          <ul className="mt-3 space-y-2">
            {items.data.items.map((i) => (
              <li key={i.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-tile border border-line p-3 hover:bg-panel has-[:checked]:border-ink has-[:checked]:bg-lime-tint hc-border">
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]" checked={ticked.includes(i.id)} onChange={(e) => setTicked((t) => (e.target.checked ? [...t, i.id] : t.filter((x) => x !== i.id)))} />
                  <span>
                    <span className="block font-semibold">{i.text}</span>
                    <span className="block text-[0.9rem] text-muted">{i.why}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {health.data?.ai_enabled && (
          <div className="mt-4 border-t border-line pt-4">
            <Toggle label="Polish the wording with AI" checked={polish} onChange={setPolish} description="It may only reword the lines you ticked. Anything it adds is thrown away." />
          </div>
        )}
      </Card>
      <ErrorText error={error} />
      <Button variant="primary" disabled={busy || !ticked.length || !sharingOk} onClick={create}>{busy ? 'Writing…' : 'Write my note'}</Button>

      {note && (
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-raised"><IconScissors size={22} /></span>
            <h2 className="title-md">Your note</h2>
          </div>
          <pre className="mt-4 whitespace-pre-wrap rounded-tile bg-panel p-4 font-sans text-[1.05rem] hc-border">{note.text}</pre>
          {note.polished && <p className="mt-2 text-[0.88rem] text-muted">Wording polished by {note.demo_ai ? 'Demo AI' : 'AI'}, checked against your ticked lines.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="dark" onClick={share}>Share or copy</Button>
          </div>
          {copied && <p role="status" className="mt-2 font-semibold">Copied. Paste it into a message to your stylist.</p>}
        </Card>
      )}
    </div>
  )
}
