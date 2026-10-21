import type { ZoneStateId } from '@/lib/types'

export const STATE_WORDS: Record<ZoneStateId, string> = {
  calm: 'Calm',
  watch: 'Watch',
  get_checked: 'Get checked',
  not_checked: 'Not checked',
}

export const STATE_TEXT: Record<ZoneStateId, string> = { calm: 'text-calm', watch: 'text-watch', get_checked: 'text-check', not_checked: 'text-notc' }

const TONE: Record<ZoneStateId, { text: string; tint: string }> = {
  calm: { text: 'text-calm', tint: 'bg-calm-tint' },
  watch: { text: 'text-watch', tint: 'bg-watch-tint' },
  get_checked: { text: 'text-check', tint: 'bg-check-tint' },
  not_checked: { text: 'text-notc', tint: 'bg-notc-tint' },
}

/** Each state has its own shape, so it reads without colour: circle+tick, triangle, square+arrow, dashed circle. */
export function StateIcon({ state, size = 18 }: { state: ZoneStateId; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true } as const
  switch (state) {
    case 'calm':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="8" />
          <path d="M6.2 10.3l2.5 2.5 5-5.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'watch':
      return (
        <svg {...common}>
          <path d="M10 2.5l8 14.5H2z" strokeLinejoin="round" />
          <path d="M10 8v4" strokeLinecap="round" />
          <circle cx="10" cy="14.4" r="0.6" fill="currentColor" />
        </svg>
      )
    case 'get_checked':
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="15" height="15" rx="2" />
          <path d="M6.5 10h7M10.5 7l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="8" strokeDasharray="2.6 2.6" />
        </svg>
      )
  }
}

/** Board 2's status pill: a tinted pill with the state's shape and word. */
export function StatusChip({ state, label }: { state: ZoneStateId; label?: string }) {
  const t = TONE[state]
  return (
    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-[0.9rem] font-semibold hc-border ${t.text} ${t.tint}`}>
      <StateIcon state={state} />
      {label ?? STATE_WORDS[state]}
    </span>
  )
}

export function StateLegend() {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="What the states mean">
      {(['calm', 'watch', 'get_checked', 'not_checked'] as ZoneStateId[]).map((s) => (
        <li key={s}>
          <StatusChip state={s} />
        </li>
      ))}
    </ul>
  )
}
