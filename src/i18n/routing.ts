import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  localePrefix: 'always',
  localeCookie: { name: 'NEXT_LOCALE', maxAge: 60 * 60 * 24 * 365 },
  // Localised external paths for the legal pages. German visitors expect
  // /impressum and /datenschutz (and bookmark / SEO accordingly); the
  // internal app router still resolves to the canonical [locale]/imprint
  // and [locale]/privacy segments. Next-intl's Link, usePathname, redirect,
  // and getPathname consume these mappings automatically.
  //
  // Note: once `pathnames` is set, the navigation utilities become strictly
  // typed against this manifest — every internal path used as a Link href,
  // router.push target, or redirect destination must be listed here, even
  // if it's identical across locales (in which case use the string-shorthand
  // form). Adding a new route requires extending this map in the same
  // change-set.
  pathnames: {
    '/': '/',
    '/imprint': {
      en: '/imprint',
      de: '/Impressum',
    },
    '/privacy': {
      en: '/privacy',
      de: '/Datenschutz',
    },
    '/under-18': '/under-18',
    '/sake/[brandId]': '/sake/[brandId]',
  },
})

export type Locale = (typeof routing.locales)[number]
