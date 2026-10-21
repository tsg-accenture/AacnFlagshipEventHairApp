'use client'

import { useId } from 'react'
import type { ZoneId, ZoneStateId } from '@/lib/types'

/*
  An original illustration: a head seen from above (front at the top), with straight-back cornrows.
  It stands in for the model photography on the reference boards, so no stock photo of a real person
  is needed. Everything is computed, deterministic and decorative (aria-hidden).
  Coordinates live in a 340 × 380 box; CrownMap lays its callouts over the same box.
*/
export const ART_W = 340
export const ART_H = 380
const CX = 170
const CY = 200
const RX = 100
const RY = 138

/** Where each zone sits on the drawing. The person's left is on the drawing's left (viewed from above and behind). */
export const ZONE_POINTS: Record<ZoneId, { x: number; y: number }> = {
  hairline: { x: 170, y: 90 },
  left_temple: { x: 92, y: 132 },
  right_temple: { x: 248, y: 132 },
  crown: { x: 170, y: 222 },
  nape: { x: 170, y: 310 },
}

const ROWS = 8
const halfWidth = (y: number) => RX * Math.sqrt(Math.max(0, 1 - ((y - CY) / RY) ** 2)) * 0.93
const f = (n: number) => n.toFixed(1)

type Stitch = { x: number; y: number; rot: number; a: number; b: number }

function buildRows() {
  const rows: { spine: string; width: number; stitches: Stitch[] }[] = []
  for (let k = 0; k < ROWS; k++) {
    const u = -1 + (2 * k + 1) / ROWS
    const y0 = CY - RY * 0.86 + 24 * u * u
    const y1 = CY + RY * 0.87 - 20 * u * u
    const pts: { x: number; y: number }[] = []
    for (let y = y0; y <= y1; y += 2) pts.push({ x: CX + u * halfWidth(y), y })
    const spine = pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ')
    const stitches: Stitch[] = []
    let n = 0
    let y = y0 + 2
    while (y <= y1 - 1) {
      // braid width follows the head's width at this point
      const bw = Math.max(5, (2 / ROWS) * halfWidth(y) * 0.8)
      const x = CX + u * halfWidth(y)
      const xn = CX + u * halfWidth(y + 1)
      const dir = (Math.atan2(1, xn - x) * 180) / Math.PI // row direction, degrees
      const side = n % 2 ? 1 : -1
      stitches.push({ x: x + side * bw * 0.16, y, rot: dir + 90 + side * 40, a: bw * 0.6, b: bw * 0.23 })
      y += Math.max(2.4, bw * 0.36)
      n++
    }
    rows.push({ spine, width: Math.max(4, (2 / ROWS) * halfWidth(CY) * 0.74), stitches })
  }
  return rows
}

function buildEdges() {
  // Laid edges along the hairline: small swoops between the rows.
  const out: string[] = []
  for (let i = 0; i < 9; i++) {
    const u = -0.86 + i * 0.215
    const y = CY - RY * 0.86 + 24 * u * u - 4
    const x = CX + u * halfWidth(y + 4)
    const dir = u < 0 ? -1 : 1
    out.push(`M${f(x)} ${f(y + 2)} q${f(dir * 4)} -6 ${f(dir * 9)} -4 q${f(dir * -3)} 2 ${f(dir * -1)} 5`)
  }
  return out
}

const ROW_DATA = buildRows()
const EDGES = buildEdges()

export type Marker = { zone: ZoneId; state?: ZoneStateId; selected?: boolean }

const STATE_COLOR: Record<ZoneStateId, string> = {
  calm: 'var(--calm)',
  watch: 'var(--watch)',
  get_checked: 'var(--check)',
  not_checked: 'var(--notc)',
}

function MarkerDot({ m, patterns }: { m: Marker; patterns?: boolean }) {
  const { x, y } = ZONE_POINTS[m.zone]
  if (m.selected !== undefined) {
    return m.selected ? (
      <g className="zone-glow" style={{ color: 'var(--lime)' }}>
        <circle cx={x} cy={y} r="13" style={{ fill: 'var(--lime)', stroke: '#151515' }} strokeWidth="2.5" />
        <path d={`M${x - 5} ${y}l3.4 3.4 6.4-6.8`} fill="none" stroke="#151515" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ) : (
      <g>
        <circle cx={x} cy={y} r="12" fill="rgb(255 255 255 / 0.25)" stroke="#fff" strokeWidth="2" strokeDasharray="4 3.4" />
      </g>
    )
  }
  const s = m.state ?? 'not_checked'
  if (s === 'not_checked') {
    return <circle cx={x} cy={y} r="9" fill="rgb(255 255 255 / 0.22)" stroke="#fff" strokeWidth="2" strokeDasharray="3.4 3" />
  }
  return (
    <g className="zone-glow" style={{ color: '#ffffff' }}>
      <circle cx={x} cy={y} r="16" fill="rgb(255 255 255 / 0.28)" />
      <circle cx={x} cy={y} r="10.5" fill="#ffffff" />
      {patterns ? (
        <g transform={`translate(${x - 7} ${y - 7})`} style={{ color: STATE_COLOR[s] }}>
          {s === 'calm' && <path d="M3 7.4l2.6 2.6L11 4.4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
          {s === 'watch' && <path d="M7 1.6l6 10.8H1z" fill="currentColor" />}
          {s === 'get_checked' && <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill="currentColor" />}
        </g>
      ) : (
        <circle cx={x} cy={y} r="6" style={{ fill: STATE_COLOR[s] }} />
      )}
    </g>
  )
}

/** The braided crown. `markers` adds the glowing zone dots; `connectors` draws dashed elbows to callouts. */
export function CrownArt({
  markers = [],
  connectors = [],
  patterns = false,
  className = '',
  viewBox,
}: {
  markers?: Marker[]
  connectors?: { zone: ZoneId; to: { x: number; y: number }; via?: 'h' | 'v' }[]
  patterns?: boolean
  className?: string
  /** Crop to part of the drawing, e.g. a close-up of the braids for a card thumbnail. */
  viewBox?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = (name: string) => `${name}-${uid}`
  const url = (name: string) => `url(#${id(name)})`
  return (
    <svg
      viewBox={viewBox ?? `0 0 ${ART_W} ${ART_H}`}
      preserveAspectRatio={viewBox ? 'xMidYMid slice' : undefined}
      className={`block ${viewBox ? 'h-full w-full' : 'h-auto w-full'} ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={id('ca-scalp')} cx="45%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#80513a" />
          <stop offset="70%" stopColor="#63402c" />
          <stop offset="100%" stopColor="#47291b" />
        </radialGradient>
        <linearGradient id={id('ca-stitch')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#120904" />
          <stop offset="42%" stopColor="#4b2f1e" />
          <stop offset="58%" stopColor="#3d2517" />
          <stop offset="100%" stopColor="#120904" />
        </linearGradient>
        <radialGradient id={id('ca-sheen')} cx="34%" cy="24%" r="62%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('ca-vignette')} cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.32" />
        </radialGradient>
        <filter id={id('ca-shadow')} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <clipPath id={id('ca-head')}>
          <ellipse cx={CX} cy={CY} rx={RX} ry={RY} />
        </clipPath>
      </defs>

      {/* soft floor shadow */}
      <ellipse cx={CX + 6} cy={CY + 14} rx={RX + 6} ry={RY + 4} fill="#2b1a10" opacity="0.28" filter={url('ca-shadow')} />
      {/* ears */}
      <ellipse cx={CX - RX + 4} cy={CY + 6} rx="8" ry="19" fill="#5a3421" />
      <ellipse cx={CX + RX - 4} cy={CY + 6} rx="8" ry="19" fill="#5a3421" />

      <g clipPath={url('ca-head')}>
        <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill={url('ca-scalp')} />
        {ROW_DATA.map((r, i) => (
          <path key={`s${i}`} d={r.spine} fill="none" stroke="#21130b" strokeWidth={r.width} strokeLinecap="round" />
        ))}
        {ROW_DATA.map((r, i) => (
          <g key={`r${i}`}>
            {r.stitches.map((s, j) => (
              <g key={j} transform={`translate(${f(s.x)} ${f(s.y)}) rotate(${f(s.rot)})`}>
                <path d={`M${f(-s.a)} 0Q0 ${f(-s.b * 2)} ${f(s.a)} 0Q0 ${f(s.b * 2)} ${f(-s.a)} 0Z`} fill={url('ca-stitch')} stroke="#0d0603" strokeOpacity="0.6" strokeWidth="0.45" />
                <path d={`M${f(-s.a * 0.5)} ${f(-s.b * 0.12)}Q0 ${f(-s.b * 0.42)} ${f(s.a * 0.5)} ${f(-s.b * 0.12)}`} fill="none" stroke="#e7b48a" strokeOpacity="0.38" strokeWidth="0.8" strokeLinecap="round" />
              </g>
            ))}
          </g>
        ))}
        <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill={url('ca-sheen')} />
        <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill={url('ca-vignette')} />
      </g>
      <g fill="none" stroke="#1d110a" strokeOpacity="0.7" strokeWidth="1" strokeLinecap="round">
        {EDGES.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {connectors.map(({ zone, to, via = 'h' }) => {
        const p = ZONE_POINTS[zone]
        const d = via === 'h' ? `M${p.x} ${p.y} V${to.y} H${to.x}` : `M${p.x} ${p.y} H${to.x} V${to.y}`
        return (
          <g key={`c-${zone}`}>
            <path d={d} fill="none" stroke="#151515" strokeOpacity="0.35" strokeWidth="3.6" strokeLinejoin="round" />
            <path d={d} fill="none" stroke="#ffffff" strokeWidth="1.6" strokeDasharray="4 4" strokeLinejoin="round" />
          </g>
        )
      })}
      {markers.map((m) => (
        <MarkerDot key={m.zone} m={m} patterns={patterns} />
      ))}
    </svg>
  )
}
