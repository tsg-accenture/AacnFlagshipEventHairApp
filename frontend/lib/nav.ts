// Only follow ?next= links that stay on this site. Rejects //evil.example and /\evil.example,
// which browsers treat as other origins.
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || typeof window === 'undefined') return fallback
  try {
    const url = new URL(next, window.location.origin)
    if (url.origin !== window.location.origin) return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}
