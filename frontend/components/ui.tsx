'use client'

import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { IconArrowUpRight, IconBack, IconChevronsRight } from './icons'

type Variant = 'primary' | 'dark' | 'secondary' | 'quiet' | 'danger'

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-2.5 text-[1rem] font-semibold transition-[background-color,filter,transform] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
const variants: Record<Variant, string> = {
  // Lime is the one action colour; black is the strong secondary, as on the reference boards.
  primary: 'bg-lime text-on-lime hover:brightness-95 hc-border',
  dark: 'bg-ink text-surface hover:brightness-110',
  secondary: 'border border-line bg-surface text-ink hover:bg-raised hc-border',
  quiet: 'min-h-11 px-2 text-ink underline-offset-4 hover:underline',
  danger: 'border-2 border-check bg-surface text-check hover:bg-check-tint',
}

export function Button({ variant = 'secondary', className = '', ...props }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props} />
}

export function LinkButton({ variant = 'secondary', className = '', ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />
}

/** Round icon-only control (the boards' white circles). Always pass a label. */
export function IconButton({
  label, href, onClick, children, tone = 'light', size = 'md', className = '',
}: { label: string; href?: string; onClick?: () => void; children: ReactNode; tone?: 'light' | 'dark' | 'lime'; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dims = { sm: 'h-11 w-11', md: 'h-12 w-12', lg: 'h-14 w-14' }[size]
  const tones = {
    light: 'bg-surface text-ink border border-line hover:bg-raised hc-border',
    dark: 'bg-ink text-surface hover:brightness-110',
    lime: 'bg-lime text-on-lime hover:brightness-95 hc-border',
  }[tone]
  const cls = `inline-flex shrink-0 items-center justify-center rounded-full transition-[filter,background-color] ${dims} ${tones} ${className}`
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={cls}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cls}>
      {children}
    </button>
  )
}

/** The boards' lime banner: a sentence on the left, a black round button on the right. The whole pill is the link. */
export function ActionPill({ href, title, body, icon, tone = 'lime' }: { href: string; title: ReactNode; body?: ReactNode; icon?: ReactNode; tone?: 'lime' | 'dark' }) {
  const t = tone === 'lime' ? 'bg-lime text-on-lime hc-border' : 'bg-ink text-surface'
  const knob = tone === 'lime' ? 'bg-ink text-surface' : 'bg-lime text-on-lime'
  return (
    <Link href={href} className={`group flex min-h-20 items-center justify-between gap-4 rounded-full py-3 pl-7 pr-3 transition-[filter] hover:brightness-[0.97] ${t}`}>
      <span className="min-w-0">
        <span className="block text-[1.08rem] font-semibold leading-snug">{title}</span>
        {body && <span className="mt-0.5 block text-[0.95rem] leading-snug opacity-90">{body}</span>}
      </span>
      <span aria-hidden="true" className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5 ${knob}`}>
        {icon ?? <IconChevronsRight />}
      </span>
    </Link>
  )
}

/** "Swipe to start" look as an ordinary link: faint chevrons, a centred label, a lime knob. */
export function StartPill({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-[4.25rem] items-center justify-center rounded-full border border-line bg-surface/80 px-20 text-[1.05rem] font-semibold shadow-soft backdrop-blur hc-border"
    >
      <span aria-hidden="true" className="absolute left-6 text-line-strong">
        <IconChevronsRight size={20} />
      </span>
      {label}
      <span aria-hidden="true" className="absolute right-2 inline-flex h-[3.25rem] w-[4.5rem] items-center justify-center rounded-full bg-lime text-on-lime transition-transform group-hover:translate-x-0.5 hc-border">
        <IconChevronsRight />
      </span>
    </Link>
  )
}

/** A small round ↗ link in a card's corner. */
export function CornerLink({ href, label }: { href: string; label: string }) {
  return (
    <IconButton href={href} label={label} size="sm">
      <IconArrowUpRight size={20} />
    </IconButton>
  )
}

export function Card({ className = '', children, as: As = 'section', ...rest }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' | 'li' } & Record<string, unknown>) {
  return (
    <As className={`rounded-card border border-line bg-surface p-5 hc-border ${className}`} {...rest}>
      {children}
    </As>
  )
}

/** A frosted container that holds tiles (board 1's "Your hair health" block). */
export function Panel({ className = '', children, as: As = 'section', ...rest }: { className?: string; children: ReactNode; as?: 'section' | 'div' } & Record<string, unknown>) {
  return (
    <As className={`glass rounded-sheet p-3 shadow-soft sm:p-4 ${className}`} {...rest}>
      {children}
    </As>
  )
}

export function PageHeader({
  title, lead, back, children, action,
}: { title: ReactNode; lead?: ReactNode; back?: { href: string; label: string }; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6">
      {(back || action) && (
        <div className="mb-5 flex items-center justify-between gap-3">
          {back ? (
            <IconButton href={back.href} label={`Back to ${back.label}`}>
              <IconBack />
            </IconButton>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      <h1 className="title">{title}</h1>
      {lead && <p className="mt-2 max-w-[60ch] text-muted">{lead}</p>}
      {children}
    </header>
  )
}

/** Section title with an optional "See all" link on the right. */
export function SectionHead({ title, href, linkLabel = 'See all', as: As = 'h2' }: { title: ReactNode; href?: string; linkLabel?: string; as?: 'h2' | 'h3' }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <As className="text-[1.15rem] font-semibold">{title}</As>
      {href && (
        <Link href={href} className="inline-flex min-h-11 items-center text-[0.95rem] font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  )
}

export function Notice({ tone = 'info', children, title }: { tone?: 'info' | 'error' | 'success'; children: ReactNode; title?: string }) {
  const tones = {
    info: 'border-line bg-panel',
    error: 'border-check bg-check-tint',
    success: 'border-ink bg-lime-tint',
  }
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-tile border p-4 text-[0.98rem] hc-border ${tones[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-1' : ''}>{children}</div>
    </div>
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-3 py-6 text-muted">
      <span aria-hidden="true" className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-transparent" />
      {label}…
    </p>
  )
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  return <Notice tone="error">{msg}</Notice>
}

/** Big tappable single-choice pills (wet-hand friendly). A radio group for assistive tech. */
export function ChoiceGroup({
  legend, name, options, value, onChange, columns = 3, size = 'md',
}: {
  legend: ReactNode
  name: string
  options: [string, string][]
  value: string | undefined
  onChange: (v: string) => void
  columns?: 2 | 3 | 4
  size?: 'md' | 'lg'
}) {
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }[columns]
  return (
    <fieldset>
      <legend className="mb-3 text-[1.05rem] font-semibold">{legend}</legend>
      <div className={`grid gap-2 ${cols}`}>
        {options.map(([v, label]) => {
          const id = `${name}-${v}`
          const checked = value === v
          return (
            <label
              key={v}
              htmlFor={id}
              className={`flex cursor-pointer items-center justify-center rounded-full border px-3 text-center font-semibold transition-colors hc-border ${size === 'lg' ? 'min-h-16 text-[1.1rem]' : 'min-h-12'} ${checked ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink hover:bg-raised'} has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]`}
            >
              <input id={id} type="radio" name={name} value={v} checked={checked} onChange={() => onChange(v)} className="sr-only" />
              {label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Filter chips (board 2): the selected one is black. Uses aria-pressed. */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-5 text-[0.95rem] font-semibold transition-colors hc-border ${active ? 'bg-ink text-surface' : 'border border-line bg-surface text-ink hover:bg-raised'}`}
    >
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-semibold">{label}</p>
        {description && <div className="mt-1 text-[0.95rem] text-muted">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 transition-colors ${checked ? 'border-ink bg-ink' : 'border-line-strong bg-raised'}`}
      >
        <span aria-hidden="true" className={`inline-flex h-6 w-6 items-center justify-center rounded-full shadow transition-transform ${checked ? 'translate-x-6 bg-lime' : 'translate-x-0.5 bg-surface'}`} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  )
}

const field = 'w-full rounded-input border border-line-strong bg-surface px-4 text-[1rem] text-ink placeholder:text-muted hc-border'

export function TextField({ label, hint, id, ...props }: ComponentProps<'input'> & { label: string; hint?: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-semibold">{label}</label>
      {hint && <p id={`${id}-hint`} className="mb-1.5 text-[0.92rem] text-muted">{hint}</p>}
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={`min-h-13 ${field}`} {...props} />
    </div>
  )
}

export function TextArea({ label, hint, id, ...props }: ComponentProps<'textarea'> & { label: string; hint?: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-semibold">{label}</label>
      {hint && <p id={`${id}-hint`} className="mb-1.5 text-[0.92rem] text-muted">{hint}</p>}
      <textarea id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={`min-h-28 py-3 ${field}`} {...props} />
    </div>
  )
}

export const inputClass = `min-h-13 ${field}`

/** Board 2's list row: an icon tile, a title and a line under it, and » on the right. */
export function ListRow({
  href, icon, title, sub, onClick, tone = 'light', trailing,
}: { href?: string; icon?: ReactNode; title: ReactNode; sub?: ReactNode; onClick?: () => void; tone?: 'light' | 'dark'; trailing?: ReactNode }) {
  const dark = tone === 'dark'
  const inner = (
    <>
      {icon && (
        <span aria-hidden="true" className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${dark ? 'bg-lime text-on-lime' : 'bg-raised text-ink'}`}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{title}</span>
        {sub && <span className={`mt-0.5 block text-[0.93rem] leading-snug ${dark ? 'opacity-85' : 'text-muted'}`}>{sub}</span>}
      </span>
      {trailing ?? (
        <span aria-hidden="true" className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${dark ? 'bg-surface/15' : 'bg-panel'}`}>
          <IconChevronsRight size={20} />
        </span>
      )}
    </>
  )
  const cls = `flex min-h-[4.5rem] w-full items-center gap-4 rounded-tile p-3 pr-3 text-left transition-colors hc-border ${dark ? 'bg-ink text-surface' : 'border border-line bg-surface hover:bg-panel'}`
  if (href) return <Link href={href} className={cls}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>
  return <div className={cls}>{inner}</div>
}

type RingTone = 'teal' | 'violet' | 'olive' | 'ink' | 'accent' | 'calm' | 'watch' | 'check' | 'notc'
const RING: Record<RingTone, string> = {
  teal: 'var(--teal)', violet: 'var(--violet)', olive: 'var(--olive)', ink: 'var(--ink)', accent: 'var(--accent)',
  calm: 'var(--calm)', watch: 'var(--watch)', check: 'var(--check)', notc: 'var(--notc)',
}

/** A progress ring for a real count (days, zones, check-ins). Never a made-up score. */
export function Ring({ value, max, tone = 'teal', size = 44, stroke = 5.5, segments, dashed }: { value: number; max: number; tone?: RingTone; size?: number; stroke?: number; segments?: number; dashed?: boolean }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const color = RING[tone]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0 -rotate-90">
      {segments ? (
        Array.from({ length: segments }).map((_, i) => {
          const seg = c / segments
          const gap = Math.min(10, seg * 0.22)
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              style={{ stroke: i === value ? color : 'var(--track)' }}
              strokeDasharray={`${seg - gap} ${c - seg + gap}`}
              strokeDashoffset={-(i * seg) - gap / 2}
            />
          )
        })
      ) : (
        <>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: 'var(--track)' }} strokeDasharray={dashed ? '3 5' : undefined} />
          {frac > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              style={{ stroke: color }}
              strokeDasharray={`${frac * c} ${c}`}
            />
          )}
        </>
      )}
    </svg>
  )
}

/** A white tile with a label, a big value and a ring (board 1). `sr` is the full sentence for screen readers. */
export function RingTile({ label, value, sub, ring, href, sr }: { label: string; value: ReactNode; sub?: ReactNode; ring: ReactNode; href?: string; sr: string }) {
  const body = (
    <>
      <span aria-hidden="true" className="flex items-start justify-between gap-2">
        <span className="label block pt-0.5">{label}</span>
      </span>
      <span aria-hidden="true" className="mt-2 flex items-center justify-between gap-2">
        <span className="num whitespace-nowrap text-[1.4rem] font-semibold leading-none">{value}</span>
        {ring}
      </span>
      {sub && <span aria-hidden="true" className="mt-1.5 block text-[0.82rem] leading-tight text-muted">{sub}</span>}
      <span className="sr-only">{sr}</span>
    </>
  )
  const cls = 'block rounded-tile border border-line bg-surface p-3.5 hc-border'
  return href ? <Link href={href} className={`${cls} hover:bg-panel`}>{body}</Link> : <div className={cls}>{body}</div>
}

/** Board 2's tick bar: progress through a span, drawn as ticks. */
export function TickBar({ value, max, ticks = 28, label }: { value: number; max: number; ticks?: number; label: string }) {
  const on = max > 0 ? Math.round((Math.max(0, Math.min(value, max)) / max) * ticks) : 0
  return (
    <div role="img" aria-label={label} className="flex h-5 items-stretch gap-[3px]">
      {Array.from({ length: ticks }).map((_, i) => (
        <span key={i} className={`w-[3px] rounded-full ${i < on ? 'bg-ink' : 'bg-track'}`} />
      ))}
    </div>
  )
}

/** A round initial for the greeting (no photo is ever needed). */
export function Avatar({ name, size = 52 }: { name: string | null; size?: number }) {
  const letter = (name ?? '').trim().charAt(0).toUpperCase() || '·'
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="art-panel inline-flex shrink-0 items-center justify-center rounded-full font-serif text-[1.45rem] font-semibold text-ink ring-2 ring-surface"
    >
      {letter}
    </span>
  )
}

export function Chevron() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}
