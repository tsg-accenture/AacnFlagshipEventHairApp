import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Providers } from '@/components/Providers'
import { PREFS_BOOT_SCRIPT } from '@/lib/prefs'
import './globals.css'

// Fonts are self-hosted from Fontsource packages (no request to Google at build time or in the browser).
const playfair = localFont({
  src: [
    { path: '../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2', weight: '400 900', style: 'normal' },
    { path: '../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2', weight: '400 900', style: 'italic' },
  ],
  variable: '--font-playfair',
  display: 'swap',
})
const manrope = localFont({
  src: '../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
  weight: '200 800',
  variable: '--font-manrope',
  display: 'swap',
})
const atkinson = localFont({
  src: [
    { path: '../node_modules/@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2', weight: '200 800', style: 'normal' },
    { path: '../node_modules/@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-italic.woff2', weight: '200 800', style: 'italic' },
  ],
  variable: '--font-atkinson',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: { default: 'Crown AI', template: '%s · Crown AI' },
  description: 'Hair and scalp care for Black hair, built around your routine. General guidance and signposting; it does not diagnose.',
  applicationName: 'Crown AI',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ebebe8' },
    { media: '(prefers-color-scheme: dark)', color: '#111211' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${playfair.variable} ${manrope.variable} ${atkinson.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
