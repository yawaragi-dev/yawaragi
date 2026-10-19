import type { MetadataRoute } from 'next'

/**
 * The web app manifest (design v1.8, block O): what a phone uses when the
 * visitor adds Yawaragi to the home screen. The app never prompts for that;
 * Account → Help says how.
 *
 * `start_url` is the locale-less `/home`, which the proxy sends to the
 * visitor's locale (cookie, then `Accept-Language`), so one manifest serves
 * both. The colours are the Ginshu ground, so the splash and the status bar
 * match the app (dark-only, ADR-0023).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Yawaragi',
    short_name: 'Yawaragi',
    description: 'A companion for discovering sake.',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    background_color: '#1b1a19',
    theme_color: '#1b1a19',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
