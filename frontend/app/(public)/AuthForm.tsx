'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CrownArt } from '@/components/CrownArt'
import { CrownMark } from '@/components/icons'
import { Button, ErrorText, TextField } from '@/components/ui'
import { api } from '@/lib/api'
import { safeNext } from '@/lib/nav'
import type { Me } from '@/lib/types'

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter()
  const params = useSearchParams()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [adult, setAdult] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'register') {
        const me = await api<Me>('/auth/register', { json: { email, password, display_name: name || null, confirm_adult: adult } })
        qc.setQueryData(['me'], me)
        router.push('/privacy/receipt?next=/start')
      } else {
        const me = await api<Me>('/auth/login', { json: { email, password } })
        qc.setQueryData(['me'], me)
        router.push(safeNext(params.get('next'), me.onboarded ? '/today' : '/start'))
      }
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl gap-8 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center lg:gap-14 lg:px-10">
      {/* Art panel: a close-up of the braids (decorative) */}
      <div aria-hidden="true" className="art-panel relative hidden h-[calc(100dvh-3rem)] max-h-[48rem] overflow-hidden rounded-sheet lg:block">
        <CrownArt viewBox="40 40 260 300" />
        <p className="glass absolute inset-x-6 bottom-6 rounded-sheet p-5 font-serif text-[1.6rem] leading-snug">
          Your routine, check-ins and any photos stay <em className="font-bold text-accent">private</em> to you.
        </p>
      </div>

      <div className="flex flex-col">
        <Link href="/" className="flex items-center gap-2.5 self-start">
          <CrownMark size={36} />
          <span className="font-serif text-[1.5rem] font-medium leading-none">Crown <em className="font-bold text-accent">AI</em></span>
        </Link>
        <div aria-hidden="true" className="art-panel mt-6 h-28 overflow-hidden rounded-sheet lg:hidden">
          <CrownArt viewBox="60 120 220 90" />
        </div>
        <h1 className="title mt-8 lg:mt-12">{mode === 'login' ? <>Welcome <em>back</em></> : <>Create your <em>account</em></>}</h1>
        <p className="mt-2 text-muted">
          {mode === 'login' ? 'Sign in to see your Today screen.' : 'Your routine, check-ins and any photos stay private to you.'}
        </p>
        <form onSubmit={submit} className="mt-8 space-y-5 rounded-sheet border border-line bg-surface p-5 hc-border sm:p-6" noValidate>
          {mode === 'register' && (
            <TextField id="name" label="What should we call you?" hint="Optional" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          )}
          <TextField id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            hint={mode === 'register' ? 'At least 10 characters.' : undefined}
            required
            minLength={mode === 'register' ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'register' && (
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]" />
              <span>I&apos;m 18 or over. <span className="text-muted">Crown AI is for adults at launch.</span></span>
            </label>
          )}
          <ErrorText error={error} />
          <Button type="submit" variant="primary" className="w-full" disabled={busy || (mode === 'register' && !adult)}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        <p className="mt-6 text-center">
          {mode === 'login' ? (
            <>New here? <Link href="/register" className="font-semibold underline underline-offset-4">Create an account</Link></>
          ) : (
            <>Already have an account? <Link href="/login" className="font-semibold underline underline-offset-4">Sign in</Link></>
          )}
        </p>
      </div>
    </main>
  )
}
