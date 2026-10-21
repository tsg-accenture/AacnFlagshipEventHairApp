import type { Period } from '@/lib/types'

const STAGES: { id: Period['stage']; label: string }[] = [
  { id: 'install', label: 'Install' },
  { id: 'wear', label: 'Wear' },
  { id: 'take_down', label: 'Take down' },
  { id: 'rest', label: 'Rest' },
]

/** The Hair Rhythm, written out as chips: where you are in your cycle (B03). The current stage is black. */
export function RhythmStrip({ stage }: { stage: Period['stage'] | null }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Your hair rhythm">
      {STAGES.map((s) => {
        const current = s.id === stage
        return (
          <li
            key={s.id}
            aria-current={current ? 'step' : undefined}
            className={`flex min-h-11 items-center justify-center rounded-full px-1 text-center text-[0.8rem] font-semibold leading-tight sm:text-[0.88rem] hc-border ${
              current ? 'bg-ink text-surface' : 'border border-line bg-surface text-muted'
            }`}
          >
            {s.label}
          </li>
        )
      })}
    </ol>
  )
}

export function stageWord(stage: Period['stage']): string {
  return STAGES.find((s) => s.id === stage)?.label ?? 'Ended'
}
