'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { ConsentType, Health, Me } from './types'

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), retry: false, staleTime: 30_000 })
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: () => api<Health>('/health'), staleTime: 5 * 60_000 })
}

export type Receipt = {
  version: string
  consents: Record<ConsentType, { title: string; what: string; why: string; where: string; who: string; how_long: string; required_for?: string }>
}

export function useConsents() {
  return useQuery({
    queryKey: ['consents'],
    queryFn: () => api<{ state: Me['consents']; receipt: Receipt }>('/consents'),
  })
}

export function useSetConsent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ type, granted, source = 'settings' }: { type: ConsentType; granted: boolean; source?: string }) =>
      api(`/consents/${type}`, { method: 'PUT', json: { granted, source } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consents'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
