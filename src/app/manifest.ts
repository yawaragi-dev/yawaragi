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
 *
 * `id` is what Chrome computed before there was one (`start_url`), so phones
 * that already installed the app keep it as the same app. The screenshots
 * turn Chrome's install sheet into its larger dialog; they are captured by
 * `scripts/capture-install-screenshots.ts`. The shortcuts are what a long
 * press on the icon offers. English only: the manifest is one file for both
 * locales, and the proxy puts the visitor in their own once the app opens.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/home',
    name: 'Yawaragi',
    short_name: 'Yawaragi',
    description: 'A companion for discovering sake.',
    start_url: '/home',
    scope: '/',
    lang: 'en',
    dir: 'ltr',
    categories: ['food', 'lifestyle', 'education'],
    display: 'standalone',
    background_color: '#1b1a19',
    theme_color: '#1b1a19',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    screenshots: [
      { src: '/screenshots/home.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Home: scan a label, your recent tastings' },
      { src: '/screenshots/palate.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Palate: your taste on six flavor axes' },
      { src: '/screenshots/search.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Search: browse sakes by prefecture or flavor' },
    ],
    shortcuts: [
      { name: 'Scan a label', url: '/scan', icons: [{ src: '/icons/shortcut-scan.png', sizes: '96x96', type: 'image/png' }] },
      { name: 'Search', url: '/search', icons: [{ src: '/icons/shortcut-search.png', sizes: '96x96', type: 'image/png' }] },
    ],
  }
}
