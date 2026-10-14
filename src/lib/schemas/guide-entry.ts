import { z } from 'zod'

// A GuideEntry — one page of "Learn", the reference for what a label and a
// bottle mean (design v1.6 §18, ADR-0026).
//
// This is the STRUCTURE of an entry: what it is called in Japanese, which
// facts it lists, what it links to and where its facts come from. The words —
// title, answer, each fact's term and value, the paragraphs — live in
// `messages/{en,de}.json` under `learn.entries.<slug>`, like every other
// user-facing string (ADR-0007). Kanji and romaji are not translatable, so
// they are here.
//
// Provenance (ADR-0005): every entry is `manual_curation`, and that is the
// only source this schema admits. An entry is written by hand from the sources
// it names; nothing here is model-written, which would need the "AI-written"
// badge and has no place in a reference. `verifiedOn` is the day a maintainer
// last checked the entry against those sources.
//
// No personal data.

export const GUIDE_GROUPS = ['start', 'grades', 'styles', 'rice', 'tasting', 'around'] as const
export type GuideGroup = (typeof GUIDE_GROUPS)[number]

const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const GuideSourceSchema = z.object({
  /** How the source is cited on the page. Publisher and title, not translated. */
  label: z.string().min(1),
  url: z.string().url().startsWith('https://'),
})
export type GuideSource = z.infer<typeof GuideSourceSchema>

export const GuideFactSchema = z.object({
  /** The key under `learn.entries.<slug>.facts`. */
  id: z.string().regex(/^[a-z][A-Za-z0-9]*$/),
  /** The Japanese for this fact, shown verbatim beside its value. */
  kanji: z.string().min(1).optional(),
  /** Its reading in romaji, when the term column does not already give it. */
  romaji: z.string().min(1).optional(),
  /** Whether the entry's messages carry a `note` line for this fact. */
  note: z.boolean().default(true),
})
export type GuideFact = z.infer<typeof GuideFactSchema>

export const GuideEntrySchema = z.object({
  slug: Slug,
  group: z.enum(GUIDE_GROUPS),
  /** The term in Japanese, under the title. `null` for an entry about a
   *  subject rather than a term ("How to read a label"). */
  kanji: z.string().min(1).nullable(),
  romaji: z.string().min(1).nullable(),
  /** The titled list. Order is the order on the page. */
  facts: z.array(GuideFactSchema).min(1),
  /** How many paragraphs of detail the messages carry (`detail.p1` …). */
  paragraphs: z.number().int().min(0).max(6),
  /** Other entries to read next, by slug. */
  related: z.array(Slug).max(6),
  /** Where the facts come from. At least one: an entry with no source is not
   *  an entry. */
  sources: z.array(GuideSourceSchema).min(1),
  source: z.literal('manual_curation'),
  /** `YYYY-MM-DD`. */
  verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type GuideEntry = z.infer<typeof GuideEntrySchema>
