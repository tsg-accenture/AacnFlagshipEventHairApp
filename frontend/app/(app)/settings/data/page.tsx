'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, Card, ErrorText, PageHeader, inputClass } from '@/components/ui'
import { api, download } from '@/lib/api'

/** Export and delete without a support ticket (plan: user rights). */
export default function DataPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null)

  async function exportData() {
    setBusy('export')
    setError(null)
    try {
      await download('/me/export', 'crown-ai-export.zip')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  async function del() {
    setBusy('delete')
    setError(null)
    try {
      await api('/me', { method: 'DELETE' })
      qc.clear()
      router.push('/')
    } catch (e) {
      setError(e)
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Export or delete my data" back={{ href: '/settings', label: 'Settings' }} />
      <Card>
        <h2 className="title-md">Export</h2>
        <p className="mt-1 text-muted">A zip file with everything Crown AI holds about you: your profile, permissions history, styles, check-ins, checks, Coach questions and any photos you kept.</p>
        <Button variant="dark" className="mt-4" onClick={exportData} disabled={busy !== null}>{busy === 'export' ? 'Preparing…' : 'Download my data'}</Button>
      </Card>
      <Card className="border-2 border-check">
        <h2 className="title-md">Delete my account</h2>
        <p className="mt-1">This permanently deletes your account, every record and every stored photo. It can&apos;t be undone.</p>
        <label htmlFor="confirm" className="mt-4 block font-semibold">Type DELETE to confirm</label>
        <input id="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className={`mt-1.5 max-w-xs ${inputClass}`} />
        <div className="mt-4">
          <Button variant="danger" disabled={confirm !== 'DELETE' || busy !== null} onClick={del}>{busy === 'delete' ? 'Deleting…' : 'Delete everything'}</Button>
        </div>
      </Card>
      <ErrorText error={error} />
    </div>
  )
}
