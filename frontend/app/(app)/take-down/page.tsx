'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { CrownArt } from '@/components/CrownArt'
import { ActionPill, Button, Card, ErrorText, Loading, PageHeader } from '@/components/ui'
import { api } from '@/lib/api'
import type { Today } from '@/lib/types'

/** Take-down day (B08): photos are asked for when the hairline is actually visible. */
export default function TakeDownPage() {
  const qc = useQueryClient()
  const today = useQuery({ queryKey: ['today'], queryFn: () => api<Today>('/rhythm/today') })
  const mark = useMutation({
    mutationFn: (id: string) => api(`/rhythm/periods/${id}`, { method: 'PATCH', json: { stage: 'take_down' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today'] }),
  })
  if (today.isLoading) return <Loading />
  const p = today.data?.period
  const inStyle = p && (p.stage === 'install' || p.stage === 'wear')

  return (
    <div className="space-y-5">
      <PageHeader
        title={<>Take-down <em>day</em></>}
        lead="With your hairline and edges visible, it's the easiest time to see how they're doing. A quick check takes a few minutes, and photos stay optional."
        back={{ href: '/today', label: 'Today' }}
      />
      <div aria-hidden="true" className="art-panel h-40 overflow-hidden rounded-sheet sm:h-52">
        <CrownArt viewBox="50 40 240 150" markers={[{ zone: 'hairline', selected: true }, { zone: 'left_temple', selected: true }, { zone: 'right_temple', selected: true }]} />
      </div>
      {p && inStyle && (
        <Card className="p-6">
          <p>
            Taking out your <strong>{p.style_name.toLowerCase()}</strong> today, after {p.day} days?
          </p>
          <Button variant="dark" className="mt-4" onClick={() => mark.mutate(p.id)} disabled={mark.isPending}>Yes, mark today as take-down</Button>
          <ErrorText error={mark.error} />
        </Card>
      )}
      {p?.stage === 'take_down' && <p className="font-semibold">Marked as take-down day.</p>}
      <ActionPill
        href="/check?kind=take_down&zones=hairline,left_temple,right_temple"
        title="Start the take-down check"
        body="Your hairline and temples: a few questions each, then photos if you like"
      />
      <p className="text-[0.95rem] text-muted">
        Not today? That&apos;s fine. <Link href="/today" className="font-semibold text-ink underline underline-offset-4">Back to Today</Link>
      </p>
    </div>
  )
}
