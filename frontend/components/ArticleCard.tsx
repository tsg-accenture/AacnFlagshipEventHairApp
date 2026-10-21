'use client'

import Link from 'next/link'
import type { JSX } from 'react'
import type { Article } from '@/lib/types'
import { CrownArt } from './CrownArt'
import { IconBook, IconDrop, IconHeart, IconShield, IconSparkle, IconSun } from './icons'
import { ReviewBadge } from './Sources'

const TOPIC_ICON: [string, (p: { size?: number }) => JSX.Element][] = [
  ['wash-day', IconDrop],
  ['heat', IconSun],
  ['wellbeing', IconHeart],
  ['get-checked', IconShield],
  ['scalp', IconSparkle],
]
// Close-ups of different parts of the braid art, so each card has its own "photo".
const CROPS = ['110 70 120 120', '60 120 110 110', '150 230 120 120', '130 150 100 100', '170 90 110 110', '70 220 110 110', '120 260 100 100', '200 140 90 90', '90 180 120 120']

export function articleIcon(a: Article) {
  return TOPIC_ICON.find(([t]) => a.topics.includes(t))?.[1] ?? IconBook
}

/** A library read as a card with a close-up of the braid art (in place of the boards' product shelf). */
export function ArticleCard({ article: a, index, layout = 'stack' }: { article: Article; index: number; layout?: 'stack' | 'row' | 'auto' }) {
  const Icon = articleIcon(a)
  const row = layout === 'row'
  const auto = layout === 'auto'
  return (
    <Link
      href={`/ask?article=${a.id}`}
      className={`block h-full overflow-hidden rounded-card border border-line bg-surface hover:bg-panel hc-border ${row ? 'grid grid-cols-[7rem_1fr]' : auto ? 'lg:grid lg:grid-cols-[7rem_1fr]' : ''}`}
    >
      <span aria-hidden="true" className={`art-panel relative block ${row ? 'h-full min-h-32' : auto ? 'h-32 lg:h-full lg:min-h-32' : 'h-32'}`}>
        <CrownArt viewBox={CROPS[index % CROPS.length]} />
        <span className="glass absolute left-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink">
          <Icon size={20} />
        </span>
      </span>
      <span className="block p-4">
        <span className="block font-semibold leading-snug">{a.title}</span>
        <span className="mt-1 line-clamp-2 block text-[0.92rem] text-muted">{a.summary}</span>
        <span className="mt-2 block [&>span]:ml-0">
          <ReviewBadge status={a.status} reviewer={a.reviewer} date={a.review_date} compact />
        </span>
      </span>
    </Link>
  )
}
