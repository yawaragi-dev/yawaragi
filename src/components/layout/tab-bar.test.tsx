import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { TabBar, isTabActive, type TabBarMessages } from './tab-bar'

// The real provider, not a mock: `usePathname` from `@/i18n/navigation` calls
// `useLocale()` internally, so next-intl's context is part of this component's
// actual environment rather than an incidental dependency.
function renderTabBar(messages: TabBarMessages) {
  return render(
    <NextIntlClientProvider locale="de" messages={{}}>
      <TabBar messages={messages} />
    </NextIntlClientProvider>,
  )
}

// The German catalogue's real values. Rendering with German rather than
// English is the cheapest proof the labels come from the message object
// instead of being hardcoded — an English-labelled tab bar would pass a test
// written in English and fail every German visitor. ADR-0008 makes this the
// only place German tabs can be observed: the e2e suite can't reach a German
// app screen while DE is unlaunched.
const GERMAN: TabBarMessages = {
  navLabel: 'Hauptbereiche',
  home: 'Start',
  scan: 'Scannen',
  collection: 'Sammlung',
  palate: 'Palate',
}

describe('TabBar', () => {
  it('shows the four sections in the locale the caller supplies', () => {
    renderTabBar(GERMAN)

    const bar = screen.getByTestId('tab-bar')
    expect(bar.getAttribute('aria-label')).toBe('Hauptbereiche')
    expect(screen.getByTestId('tab-home').textContent).toBe('Start')
    expect(screen.getByTestId('tab-scan').textContent).toBe('Scannen')
    expect(screen.getByTestId('tab-collection').textContent).toBe('Sammlung')
    expect(screen.getByTestId('tab-palate').textContent).toBe('Palate')
  })

  it('claims no current tab on a screen outside every tab', () => {
    // The mocked pathname is '/', the landing page. Marking a tab current
    // there would tell the reader they are somewhere they are not — and the
    // design's real rule ("the tab you came from stays highlighted") needs a
    // history stack, so guessing is the wrong fallback.
    renderTabBar(GERMAN)

    for (const id of ['tab-home', 'tab-scan', 'tab-collection', 'tab-palate']) {
      expect(screen.getByTestId(id).getAttribute('aria-current')).toBeNull()
    }
  })
})

describe('isTabActive', () => {
  it('is active on the tab screen and on anything nested under it', () => {
    expect(isTabActive('/scan', '/scan')).toBe(true)
    expect(isTabActive('/scan/result', '/scan')).toBe(true)
  })

  it('is not active for a path that merely starts with the same letters', () => {
    // `/homework`.startsWith('/home') is true, which is exactly the bug the
    // separator in the prefix check exists to prevent.
    expect(isTabActive('/homework', '/home')).toBe(false)
    expect(isTabActive('/profiles', '/profile')).toBe(false)
  })

  it('is not active on an unrelated screen', () => {
    expect(isTabActive('/collection', '/home')).toBe(false)
    expect(isTabActive('/', '/home')).toBe(false)
  })
})
