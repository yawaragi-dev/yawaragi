import { describe, expect, it } from 'vitest'
import { canonicalGermanLegalRedirect } from './canonical-german-legal-paths'

describe('canonical German legal URLs', () => {
  it('sends a German user typing the lowercase imprint URL to the capitalised canonical', () => {
    expect(canonicalGermanLegalRedirect('/de/impressum')).toBe('/de/Impressum')
  })

  it('sends a German user typing the lowercase privacy URL to the capitalised canonical', () => {
    expect(canonicalGermanLegalRedirect('/de/datenschutz')).toBe(
      '/de/Datenschutz',
    )
  })

  it('ignores a single trailing slash so /de/impressum/ still reaches the canonical', () => {
    expect(canonicalGermanLegalRedirect('/de/impressum/')).toBe('/de/Impressum')
  })

  it('leaves the already-canonical capitalised URL alone (no redirect loop)', () => {
    expect(canonicalGermanLegalRedirect('/de/Impressum')).toBeNull()
    expect(canonicalGermanLegalRedirect('/de/Datenschutz')).toBeNull()
  })

  it('does not touch the English locale — English legal paths stay lowercase', () => {
    expect(canonicalGermanLegalRedirect('/en/impressum')).toBeNull()
    expect(canonicalGermanLegalRedirect('/en/imprint')).toBeNull()
  })

  it('does not touch non-legal German paths', () => {
    expect(canonicalGermanLegalRedirect('/de/suggest')).toBeNull()
    expect(canonicalGermanLegalRedirect('/de')).toBeNull()
    expect(canonicalGermanLegalRedirect('/de/')).toBeNull()
  })

  it('derives its map from the routing pathnames manifest, not a hardcoded pair', () => {
    // Every capitalised German-localised pathname in the manifest must have a
    // lowercase → canonical entry, so adding a future capitalised German legal
    // noun to routing.ts wires up the redirect without touching this module.
    expect(canonicalGermanLegalRedirect('/de/datenschutz')).toBe(
      '/de/Datenschutz',
    )
    expect(canonicalGermanLegalRedirect('/de/impressum')).toBe('/de/Impressum')
  })
})
