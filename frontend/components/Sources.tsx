import Link from 'next/link'
import type { SourceCard } from '@/lib/types'

/** Where an answer came from: the library article, its outside sources and its review status (FR08, NFR02). */
export function Sources({ sources, label = 'From our library' }: { sources: SourceCard[]; label?: string }) {
  if (!sources.length) return null
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="text-[0.9rem] font-semibold text-muted">{label}</p>
      <ul className="mt-2 space-y-3">
        {sources.map((s) => (
          <li key={s.article_id} className="text-[0.95rem]">
            <Link href={`/ask?article=${s.article_id}`} className="font-semibold underline underline-offset-4">
              {s.title}
            </Link>
            <ReviewBadge status={s.status} reviewer={s.reviewer} date={s.review_date} />
            <ul className="mt-1 space-y-0.5">
              {s.sources.map((src) => (
                <li key={src.url}>
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-muted underline underline-offset-4 hover:text-ink">
                    {src.name}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ReviewBadge({ status, reviewer, date, compact = false }: { status: string; reviewer: string | null; date: string | null; compact?: boolean }) {
  if (status === 'reviewed') {
    return (
      <span className="ml-2 inline-block rounded-full bg-lime-tint px-2 py-0.5 text-[0.8rem] font-semibold text-ink hc-border">
        Reviewed{reviewer ? ` by ${reviewer}` : ''}
        {date ? `, ${new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
      </span>
    )
  }
  return (
    <span className="ml-2 inline-block rounded-full border border-watch px-2 py-0.5 text-[0.8rem] font-semibold text-watch">
      {compact ? (
        <>
          Draft<span className="sr-only">: not yet reviewed by an advisor</span>
        </>
      ) : (
        'Draft: not yet reviewed by an advisor'
      )}
    </span>
  )
}
