import { describe, expect, it } from 'vitest'
import de from '~/messages/de.json'
import en from '~/messages/en.json'
import { GUIDE_ENTRIES, GUIDE_SLUGS, guideEntriesIn, isGuideSlug } from '@/lib/guide/entries'
import { GUIDE_GROUPS } from '@/lib/schemas/guide-entry'

type EntryMessages = {
  title: string
  answer: string
  factsTitle: string
  facts: Record<string, { term: string; value: string; note?: string }>
  detail?: Record<string, string>
}
const catalogues = {
  en: en.learn.entries as Record<string, EntryMessages>,
  de: de.learn.entries as Record<string, EntryMessages>,
}

describe('the Learn entries', () => {
  it('have distinct slugs, and only link to entries that exist', () => {
    expect(new Set(GUIDE_SLUGS).size).toBe(GUIDE_SLUGS.length)
    for (const entry of GUIDE_ENTRIES) {
      for (const related of entry.related) {
        expect(isGuideSlug(related), `${entry.slug} → ${related}`).toBe(true)
        expect(related).not.toBe(entry.slug)
      }
    }
  })

  it('are all hand-written, each naming where its facts come from', () => {
    for (const entry of GUIDE_ENTRIES) {
      expect(entry.source).toBe('manual_curation')
      expect(entry.sources.length).toBeGreaterThan(0)
    }
  })

  it('open with exactly one "start here" entry, and leave no group empty', () => {
    expect(guideEntriesIn('start').map((e) => e.slug)).toEqual(['how-to-read-a-label'])
    for (const group of GUIDE_GROUPS) expect(guideEntriesIn(group).length).toBeGreaterThan(0)
  })

  it.each(['en', 'de'] as const)('have their words in %s for every fact and paragraph they list', (locale) => {
    const words = catalogues[locale]
    // No entry in the catalogue without a page, and none the other way round.
    expect(Object.keys(words).sort()).toEqual([...GUIDE_SLUGS].sort())

    for (const entry of GUIDE_ENTRIES) {
      const w = words[entry.slug]!
      expect(w.title && w.answer && w.factsTitle, entry.slug).toBeTruthy()
      expect(Object.keys(w.facts), entry.slug).toEqual(entry.facts.map((f) => f.id))
      for (const fact of entry.facts) {
        const f = w.facts[fact.id]!
        expect(f.term && f.value, `${entry.slug}.${fact.id}`).toBeTruthy()
        // A note is there exactly when the entry says it is, so the page
        // never asks for a string that does not exist.
        expect(f.note !== undefined, `${entry.slug}.${fact.id}.note`).toBe(fact.note)
      }
      expect(Object.keys(w.detail ?? {}), entry.slug).toEqual(
        Array.from({ length: entry.paragraphs }, (_, i) => `p${i + 1}`),
      )
    }
  })

  it('never use promotional or health language (JMStV)', () => {
    const text = JSON.stringify([en.learn, de.learn]).toLowerCase()
    for (const banned of ['buy now', 'healthy', 'gesund', 'kaufen', 'good for you']) {
      expect(text).not.toContain(banned)
    }
  })
})
