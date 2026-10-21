'use client'

import Link from 'next/link'
import { useConsents, useSetConsent } from '@/lib/hooks'
import type { ConsentType } from '@/lib/types'
import { IconShield } from './icons'
import { Button, ErrorText } from './ui'

/** Just-in-time consent (B02): asks for one specific OK at the moment it's needed, with the receipt wording. */
export function ConsentPrompt({ type, onGranted, compact = false }: { type: ConsentType; onGranted?: () => void; compact?: boolean }) {
  const { data } = useConsents()
  const set = useSetConsent()
  const c = data?.receipt.consents[type]
  if (!c) return null
  return (
    <div className="rounded-sheet border-2 border-ink bg-surface p-5 sm:p-6" role="region" aria-label={`Permission: ${c.title}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime text-on-lime hc-border"><IconShield size={22} /></span>
        <p className="text-[1.1rem] font-semibold leading-snug">{c.title}?</p>
      </div>
      {!compact && (
        <dl className="mt-3 grid gap-2 text-[0.95rem]">
          <div>
            <dt className="inline font-semibold">What: </dt>
            <dd className="inline text-muted">{c.what}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Why: </dt>
            <dd className="inline text-muted">{c.why}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Where: </dt>
            <dd className="inline text-muted">{c.where}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">How long: </dt>
            <dd className="inline text-muted">{c.how_long}</dd>
          </div>
        </dl>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="dark"
          disabled={set.isPending}
          onClick={() => set.mutate({ type, granted: true, source: 'just_in_time' }, { onSuccess: () => onGranted?.() })}
        >
          Yes, that's OK
        </Button>
        <Link href="/privacy/receipt" className="min-h-11 content-center font-semibold underline underline-offset-4">
          See all permissions
        </Link>
      </div>
      <p className="mt-3 text-[0.9rem] text-muted">You can switch this off any time in Settings.</p>
      <ErrorText error={set.error} />
    </div>
  )
}
