import { describe, expect, it } from 'vitest'
import { auditCatalogue } from './audit-i18n-promotional'
import { FORBIDDEN_COPY } from '../src/lib/legal/forbidden-copy'
import enCatalogue from '~/messages/en.json'
import deCatalogue from '~/messages/de.json'

describe('auditCatalogue', () => {
  it('returns the violation with json-path and matched phrase', () => {
    const fixture = {
      landing: {
        cta: "Don't miss our launch!",
        tagline: 'A companion for discovering sake.',
      },
    }
    const violations = auditCatalogue(fixture, FORBIDDEN_COPY)
    expect(violations).toEqual([
      {
        jsonPath: 'landing.cta',
        phrase: "don't miss",
        value: "Don't miss our launch!",
      },
    ])
  })

  it('returns [] for a clean catalogue', () => {
    const clean = { landing: { tagline: 'Discover and learn.' } }
    expect(auditCatalogue(clean, FORBIDDEN_COPY)).toEqual([])
  })

  it('matches case-insensitively', () => {
    const upper = { ad: { headline: 'BUY NOW' } }
    const mixed = { ad: { headline: 'Buy Now while supplies last' } }
    expect(auditCatalogue(upper, FORBIDDEN_COPY)).toHaveLength(1)
    expect(auditCatalogue(mixed, FORBIDDEN_COPY)).toHaveLength(1)
  })

  it('catches a forbidden phrase inside a longer string', () => {
    const fixture = {
      promo: { de: 'Vergiss nicht zu kaufen, der Sake ist toll' },
    }
    const violations = auditCatalogue(fixture, FORBIDDEN_COPY)
    expect(violations).toHaveLength(1)
    expect(violations[0].phrase).toBe('Vergiss nicht zu kaufen')
  })

  it('catches a German phrase placed in an en.json-shaped fixture', () => {
    const fixture = { landing: { tagline: 'Verpasse nicht den Sake' } }
    const violations = auditCatalogue(fixture, FORBIDDEN_COPY)
    expect(violations).toHaveLength(1)
    expect(violations[0].phrase).toBe('Verpasse nicht')
  })

  it('catches an English phrase placed in a de.json-shaped fixture', () => {
    const fixture = { landing: { tagline: "Don't miss out, kaufe jetzt" } }
    const violations = auditCatalogue(fixture, FORBIDDEN_COPY)
    expect(violations.map((v) => v.phrase).sort()).toEqual(["don't miss"])
  })

  it('reports multiple violations across nested paths', () => {
    const fixture = {
      a: { b: { c: 'buy now' } },
      x: { y: 'limited time only' },
    }
    const violations = auditCatalogue(fixture, FORBIDDEN_COPY)
    expect(violations.map((v) => v.jsonPath).sort()).toEqual([
      'a.b.c',
      'x.y',
    ])
  })
})

describe('shipped catalogues', () => {
  it('messages/en.json contains no forbidden phrases', () => {
    expect(auditCatalogue(enCatalogue, FORBIDDEN_COPY)).toEqual([])
  })

  it('messages/de.json contains no forbidden phrases', () => {
    expect(auditCatalogue(deCatalogue, FORBIDDEN_COPY)).toEqual([])
  })
})
