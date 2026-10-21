import Link from 'next/link'
import { CrownMap } from '@/components/CrownMap'
import { CrownMark, IconBook, IconCalendar, IconCamera } from '@/components/icons'
import { ListRow, StartPill } from '@/components/ui'

const FEATURES = [
  { icon: <IconCalendar />, title: 'Check-ins that notice patterns', sub: 'A minute a week on how your style feels. Repeated soreness gets flagged early.' },
  { icon: <IconBook />, title: 'Answers with sources', sub: 'The Hair Coach answers only from a library you can trace, and says so when it can’t.' },
  { icon: <IconCamera />, title: 'Photos only if you want', sub: 'Pick the zones, choose whether photos are kept, and delete everything whenever you like.' },
]

/** Welcome (boards' onboarding screens): the crown art up top, a sheet with the headline and a "swipe" start. */
export default function Welcome() {
  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-4 pb-10 pt-4 lg:px-10 lg:pt-6">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <CrownMark size={36} />
          <span className="font-serif text-[1.55rem] font-medium leading-none">
            Crown <em className="font-bold text-accent">AI</em>
          </span>
        </span>
        <Link href="/login" className="inline-flex min-h-12 items-center rounded-full border border-line bg-surface px-5 font-semibold hover:bg-raised hc-border">
          Sign in
        </Link>
      </header>

      <div className="mt-5 grid gap-6 lg:mt-10 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-center lg:gap-14">
        {/* The art: an example Crown Map with its callouts */}
        <div className="rise relative mx-auto w-full max-w-[32rem] lg:order-2 lg:max-w-none">
          <CrownMap
            states={{ hairline: 'calm', left_temple: 'watch', right_temple: 'calm', crown: 'calm' }}
            title="An example Crown Map"
            className="pb-20 lg:pb-24"
          />
          <div className="glass absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-full p-2 pr-5 shadow-soft">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-[1.15rem] font-semibold text-ink-icon">9</span>
            <span className="leading-tight">
              <span className="block font-semibold">Day 9 of knotless braids</span>
              <span className="block text-[0.88rem] text-muted">An example: wear stage, check-in on Friday</span>
            </span>
          </div>
        </div>

        <section className="rise-2 lg:order-1">
          <p className="glass inline-flex rounded-full px-4 py-1.5 text-[0.92rem] font-semibold">Know your hair. Look after your crown.</p>
          <h1 className="title-xl mt-5 max-w-[13ch]">
            Your hair, <em>your rhythm.</em>
          </h1>
          <p className="mt-5 max-w-[46ch] text-[1.12rem] text-muted">
            Crown AI helps you look after Black hair through every install, wear, take-down and rest. Check in each week, plan wash
            day, ask questions and see the sources, and know when it&apos;s worth getting checked.
          </p>
          <div className="mt-8 max-w-md">
            <StartPill href="/register" label="Get started" />
            <p className="mt-3 text-center text-[0.98rem] font-semibold">No photos needed to start.</p>
          </div>
        </section>
      </div>

      <section aria-label="What Crown AI does" className="rise-3 mt-12 grid gap-3 sm:grid-cols-3 lg:mt-16">
        {FEATURES.map((f) => (
          <ListRow key={f.title} icon={f.icon} title={<span className="block">{f.title}</span>} sub={f.sub} trailing={<span />} />
        ))}
      </section>

      <footer className="mt-10 text-[0.9rem] text-muted">
        For adults 18 and over. Crown AI gives general guidance and signposting. It doesn&apos;t diagnose.
      </footer>
    </main>
  )
}
