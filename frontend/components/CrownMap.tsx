'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import type { ZoneId, ZoneStateId } from '@/lib/types'
import { ART_H, ART_W, CrownArt, ZONE_POINTS } from './CrownArt'
import { STATE_WORDS, StateIcon } from './Status'

const NAMES: Record<ZoneId, string> = {
  hairline: 'Hairline',
  left_temple: 'Left temple',
  right_temple: 'Right temple',
  crown: 'Crown',
  nape: 'Nape',
}

// Callouts sit in two columns over the art, like the boards' "Scalp health · Good" pills.
// `top` is in art units; `end` is a point hidden under the pill where the dashed connector stops.
const CALLOUTS: Record<ZoneId, { side: 'left' | 'right'; top: number; end: { x: number; y: number } }> = {
  hairline: { side: 'right', top: 20, end: { x: 300, y: 42 } },
  left_temple: { side: 'left', top: 158, end: { x: 40, y: 180 } },
  right_temple: { side: 'right', top: 158, end: { x: 300, y: 180 } },
  crown: { side: 'left', top: 246, end: { x: 40, y: 268 } },
  nape: { side: 'right', top: 316, end: { x: 300, y: 338 } },
}

const TEXT: Record<ZoneStateId, string> = {
  calm: 'text-calm',
  watch: 'text-watch',
  get_checked: 'text-check',
  not_checked: 'text-notc',
}

const ORDER: ZoneId[] = ['hairline', 'left_temple', 'right_temple', 'crown', 'nape']

/**
 * The Crown Map: the braided crown art with a glowing dot per zone and a callout pill per zone.
 * - With `hrefBase`, each pill links to that zone's page.
 * - With `selected` + `onSelect` (the Check flow), pills toggle zones for pointer users; the page keeps
 *   its own list of zone buttons for keyboards and screen readers.
 * - `compact` drops the pills (small previews).
 */
export function CrownMap({
  states,
  selected,
  onSelect,
  hrefBase,
  title = 'Crown Map',
  compact = false,
  className = '',
}: {
  states: Partial<Record<ZoneId, ZoneStateId>>
  selected?: ZoneId[]
  onSelect?: (z: ZoneId) => void
  hrefBase?: string
  title?: string
  compact?: boolean
  className?: string
}) {
  const [patterns, setPatterns] = useState(false)
  useEffect(() => {
    setPatterns(document.documentElement.getAttribute('data-patterns') === 'on')
  }, [])
  const st = (z: ZoneId): ZoneStateId => states[z] ?? 'not_checked'
  const selecting = !!selected
  const summary = selecting
    ? `${title}. Selected: ${ORDER.filter((z) => selected!.includes(z)).map((z) => NAMES[z]).join(', ') || 'none'}`
    : `${title}. ${ORDER.map((z) => `${NAMES[z]}: ${STATE_WORDS[st(z)]}`).join('; ')}`

  const markers = ORDER.map((zone) => (selecting ? { zone, selected: selected!.includes(zone) } : { zone, state: st(zone) }))
  const connectors = compact ? [] : ORDER.map((zone) => ({ zone, to: CALLOUTS[zone].end, via: 'h' as const }))

  return (
    <div className={`art-panel overflow-hidden rounded-sheet ${className}`}>
      <div className={`relative mx-auto w-full ${compact ? 'h-full' : ''}`}>
        <div role="img" aria-label={summary} className={`relative w-full ${compact ? 'h-full min-h-48' : ''}`}>
          <CrownArt markers={markers} connectors={connectors} patterns={patterns} viewBox={compact ? '58 50 224 300' : undefined} />
        </div>
        {!compact && (
          <>
            <span
              aria-hidden="true"
              className="glass absolute left-[3%] top-[3%] inline-flex items-center gap-1 rounded-full px-3 py-1 text-[0.75rem] font-semibold text-ink"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5 10 7H2z" fill="currentColor" /></svg>
              Front
            </span>
            {ORDER.map((zone) => {
              const c = CALLOUTS[zone]
              const pos = {
                top: `${(c.top / ART_H) * 100}%`,
                [c.side]: '3%',
              } as CSSProperties
              const s = st(zone)
              const on = selected?.includes(zone)
              const pillCls =
                'absolute flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full bg-surface py-1.5 pl-2.5 pr-4 text-left shadow-soft hc-border'
              const body = selecting ? (
                <>
                  <span aria-hidden="true" className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${on ? 'bg-lime text-on-lime' : 'border-2 border-dashed border-line-strong'}`}>
                    {on && (
                      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.4l2.6 2.6L11 4.4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[0.82rem] font-semibold text-ink">{NAMES[zone]}</span>
                    <span className="block text-[0.75rem] font-medium text-muted">{on ? 'Selected' : 'Tap to add'}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className={TEXT[s]}>
                    <StateIcon state={s} size={18} />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[0.82rem] font-semibold text-ink">{NAMES[zone]}</span>
                    <span className={`block text-[0.78rem] font-semibold ${TEXT[s]}`}>{STATE_WORDS[s]}</span>
                  </span>
                </>
              )
              if (selecting) {
                // Pointer shortcut only: the page's zone buttons are the accessible control.
                return (
                  <div key={zone} aria-hidden="true" onClick={() => onSelect?.(zone)} className={`${pillCls} cursor-pointer`} style={pos}>
                    {body}
                  </div>
                )
              }
              if (hrefBase) {
                return (
                  <Link key={zone} href={`${hrefBase}/${zone}`} className={`${pillCls} hover:bg-panel`} style={pos}>
                    {body}
                  </Link>
                )
              }
              return (
                <div key={zone} aria-hidden="true" className={pillCls} style={pos}>
                  {body}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

export { ZONE_POINTS, ART_W }
