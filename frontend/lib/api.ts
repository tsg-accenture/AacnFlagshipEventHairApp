// Same-origin API client. Requests go to /api/v1/* and Next.js forwards them to FastAPI.
// Writes carry the CSRF token from the readable crown_csrf cookie (double-submit).

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : detailMessage(detail) ?? `Request failed (${status})`)
    this.status = status
    this.detail = detail
  }
  get consent(): string | null {
    const d = this.detail as { code?: string; consent?: string } | null
    return d && typeof d === 'object' && d.code === 'consent_required' ? (d.consent ?? null) : null
  }
  get aiUnavailable(): boolean {
    const d = this.detail as { code?: string } | null
    return this.status === 503 && !!d && typeof d === 'object' && d.code === 'ai_unavailable'
  }
}

function detailMessage(detail: unknown): string | null {
  if (detail && typeof detail === 'object') {
    const d = detail as { message?: string; support?: { message?: string } }
    if (typeof d.message === 'string') return d.message
    if (typeof d.support?.message === 'string') return d.support.message
  }
  if (Array.isArray(detail)) {
    // FastAPI validation errors
    const first = detail[0] as { msg?: string; loc?: string[] } | undefined
    if (first?.msg) return first.msg.replace(/^Value error, /, '')
  }
  return null
}

export function csrfToken(): string {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/(?:^|;\s*)crown_csrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

type Options = { method?: string; json?: unknown; body?: BodyInit; signal?: AbortSignal }

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? (opts.json !== undefined || opts.body ? 'POST' : 'GET')
  const headers: Record<string, string> = {}
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken()
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
    credentials: 'same-origin',
    signal: opts.signal,
  })
  if (!res.ok) {
    let detail: unknown = `Request failed (${res.status})`
    try {
      const data = await res.json()
      detail = data?.detail ?? detail
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail)
  }
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) return (await res.json()) as T
  return (await res.blob()) as T
}

export async function download(path: string, filename: string, json?: unknown): Promise<void> {
  const blob = await api<Blob>(path, json === undefined ? {} : { json })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
