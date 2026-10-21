'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CrownMap } from '@/components/CrownMap'
import { StateLegend } from '@/components/Status'
import { IconBook, IconDownload, IconGoal, IconShield } from '@/components/icons'
import { Button, Card, ListRow, PageHeader } from '@/components/ui'
import { api } from '@/lib/api'
import { useHealth, useMe } from '@/lib/hooks'
import { DEFAULT_PREFS, readPrefs, savePrefs, type Prefs } from '@/lib/prefs'

function Segmented<K extends keyof Prefs>({ label, k, prefs, set, options }: { label: string; k: K; prefs: Prefs; set: (p: Prefs) => void; options: [Prefs[K], string][] }) {
  return (
    <fieldset>
      <legend className="mb-2 font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={prefs[k] === v}
            onClick={() => set({ ...prefs, [k]: v })}
            className={`min-h-11 rounded-full px-5 font-semibold transition-colors hc-border ${prefs[k] === v ? 'bg-ink text-surface' : 'border border-line bg-surface hover:bg-raised'}`}
          >
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export default function SettingsPage() {
  const me = useMe()
  const health = useHealth()
  const router = useRouter()
  const qc = useQueryClient()
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [mapKey, setMapKey] = useState(0)
  useEffect(() => {
    setPrefs(readPrefs())
  }, [])
  const set = (p: Prefs) => {
    setPrefs(p)
    savePrefs(p)
    setMapKey((n) => n + 1) // re-read the pattern setting in the preview
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    qc.clear()
    router.push('/')
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" lead={me.data ? `Signed in as ${me.data.email}` : undefined} />

      <Card>
        <h2 className="title-md">Colour and <em>contrast</em></h2>
        <p className="mt-1 text-muted">Every state always shows a word and a shape as well as a colour.</p>
        <div className="mt-4 space-y-5">
          <Segmented label="Theme" k="theme" prefs={prefs} set={set} options={[['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']]} />
          <Segmented label="Contrast" k="contrast" prefs={prefs} set={set} options={[['standard', 'Standard'], ['high', 'High contrast']]} />
          <Segmented label="Map patterns" k="patterns" prefs={prefs} set={set} options={[['off', 'Off'], ['on', 'On: shapes inside the map dots']]} />
        </div>
        <div className="mt-5 grid items-center gap-4 border-t border-line pt-5 sm:grid-cols-[14rem_1fr]">
          <CrownMap key={mapKey} states={{ hairline: 'calm', left_temple: 'watch', right_temple: 'get_checked' }} compact title="Preview" className="h-[18.75rem] w-[14rem]" />
          <div>
            <p className="mb-2 font-semibold">Preview</p>
            <StateLegend />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="title-md">Text</h2>
        <div className="mt-4 space-y-5">
          <Segmented label="Text size" k="text" prefs={prefs} set={set} options={[['standard', 'Standard'], ['large', 'Large'], ['larger', 'Larger']]} />
          <Segmented label="Font" k="font" prefs={prefs} set={set} options={[['standard', 'Standard'], ['readable', 'Easier to read (Atkinson Hyperlegible)']]} />
        </div>
        <p className="mt-4 text-[0.92rem] text-muted">These settings are saved on this device. Reduced motion follows your device setting.</p>
      </Card>

      <section aria-labelledby="data-title">
        <h2 id="data-title" className="title-md mb-3">Your <em>data</em></h2>
        <ul className="space-y-2.5">
          <li><ListRow href="/privacy/receipt" icon={<IconShield />} title="Permissions and data receipt" sub="What you've agreed to, and where your data goes" /></li>
          <li><ListRow href="/settings/data" icon={<IconDownload />} title="Export or delete my data" sub="Download everything, or delete your account" /></li>
          <li><ListRow href="/goals" icon={<IconGoal />} title="Goals" sub="What you're working towards" /></li>
          <li><ListRow href="/start" icon={<IconBook />} title="Redo onboarding questions" sub="Change your routine and goals" /></li>
        </ul>
      </section>

      <Card id="about">
        <h2 className="title-md">About this build</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.98rem]">
          <li>Crown AI gives general guidance and signposting. It doesn&apos;t diagnose.</li>
          {health.data?.ai_mode === 'fake' && !health.data.openai_key_set && <li><strong>Demo AI is on.</strong> AI replies are canned so you can try every flow without an OpenAI key.</li>}
          {health.data?.ai_mode === 'fake' && health.data.openai_key_set && (
            <li>
              <strong>Demo AI is on, so your OpenAI key isn&apos;t being used.</strong> <code>AI_MODE=fake</code> in <code>backend/.env</code> keeps
              Demo AI on even with a key. Change it to <code>AI_MODE=auto</code> and restart the backend.
            </li>
          )}
          {health.data?.ai_mode === 'openai' && health.data.ai_enabled && <li><strong>OpenAI is on.</strong> The backend terminal lists every AI call as it happens.</li>}
          {health.data && !health.data.ai_enabled && <li><strong>AI is off.</strong> Add an OpenAI key to the backend to use the Hair Coach and photo checks.</li>}
          {health.data?.ai_enabled && !health.data.library_ready && <li><strong>The library isn&apos;t ready for this AI yet.</strong> The backend embeds it when it starts. If this doesn&apos;t clear, check the backend terminal for errors.</li>}
          {health.data && health.data.rules_status !== 'reviewed' && <li>Rules {health.data.rules_version} are a draft awaiting clinical sign-off.</li>}
          {health.data?.library_includes_drafts && <li>The library includes draft articles not yet reviewed by an advisor.</li>}
        </ul>
      </Card>

      <Button onClick={logout}>Sign out</Button>
    </div>
  )
}
