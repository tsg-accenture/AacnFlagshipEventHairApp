'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { IconShield } from '@/components/icons'
import { Button, Card, ErrorText, Loading, PageHeader, Ring, Toggle } from '@/components/ui'
import { useConsents, useSetConsent } from '@/lib/hooks'
import { safeNext } from '@/lib/nav'
import type { ConsentType } from '@/lib/types'

const ORDER: ConsentType[] = ['health_data', 'analysis', 'photo_retention', 'sharing', 'reminders']

function Receipt() {
  const router = useRouter()
  const next = useSearchParams().get('next')
  const { data, isLoading, error } = useConsents()
  const set = useSetConsent()
  if (isLoading) return <Loading />
  if (!data) return <ErrorText error={error} />
  const onCount = ORDER.filter((t) => data.state[t].granted).length
  return (
    <>
      <PageHeader
        title={<>Your data <em>receipt</em></>}
        lead="What we collect, why, where it goes, who sees it and for how long. Each switch is separate, and everything is off until you turn it on. Using Crown AI with questions only is a real option."
        back={next ? undefined : { href: '/settings', label: 'Settings' }}
      />
      <div className="glass mb-5 flex items-center gap-4 rounded-full py-2 pl-2 pr-5 shadow-soft">
        <span className="relative inline-flex" aria-hidden="true">
          <Ring value={onCount} max={ORDER.length} tone="ink" size={48} />
          <span className="absolute inset-0 flex items-center justify-center"><IconShield size={20} /></span>
        </span>
        <p className="leading-tight">
          <span className="block font-semibold">{onCount} of {ORDER.length} switched on</span>
          <span className="block text-[0.88rem] text-muted">Change any of them here or in Settings</span>
        </p>
      </div>
      <ul className="space-y-3">
        {ORDER.map((t) => {
          const c = data.receipt.consents[t]
          const on = data.state[t].granted
          return (
            <Card as="li" key={t} className="p-5">
              <Toggle
                label={c.title}
                checked={on}
                disabled={set.isPending}
                onChange={(v) => set.mutate({ type: t, granted: v, source: next ? 'receipt_onboarding' : 'receipt' })}
                description={c.required_for ? `Needed for: ${c.required_for.toLowerCase()}.` : undefined}
              />
              <details className="mt-3 text-[0.95rem]">
                <summary className="min-h-11 cursor-pointer content-center font-semibold underline underline-offset-4">The details</summary>
                <dl className="mt-2 grid gap-2">
                  {(['what', 'why', 'where', 'who', 'how_long'] as const).map((k) => (
                    <div key={k}>
                      <dt className="font-semibold">{{ what: 'What', why: 'Why', where: 'Where', who: 'Who', how_long: 'How long' }[k]}</dt>
                      <dd className="text-muted">{c[k]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </Card>
          )
        })}
      </ul>
      <ErrorText error={set.error} />
      <p className="mt-6 text-[0.9rem] text-muted">Wording version {data.receipt.version}. Each change you make is logged with the date and this version.</p>
      {next && (
        <div className="mt-6">
          <Button variant="primary" onClick={() => router.push(safeNext(next, '/start'))}>
            Continue
          </Button>
        </div>
      )}
    </>
  )
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Receipt />
    </Suspense>
  )
}
