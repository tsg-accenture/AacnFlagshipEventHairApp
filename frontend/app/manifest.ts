import type { MetadataRoute } from 'next'

// Installable as a web app from Phase 0 (plan). Offline support arrives in Phase 6.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Crown AI',
    short_name: 'Crown AI',
    description: 'Hair and scalp care for Black hair, built around your routine.',
    start_url: '/today',
    display: 'standalone',
    background_color: '#ebebe8',
    theme_color: '#ebebe8',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
