import { z } from 'zod'

// DetailedNotes (CONTEXT.md, design v1.4 §10, ADR-0024): the optional
// structured tasting sheet on a JournalEntry — look, smell, taste, decide, the
// order professional tasters work in. Never named after a certification body
// (design open decision 6).
//
// Every value is a STABLE KEY or a 1–5 step, never the display word. The words
// ("Slightly hazy", "Leicht trüb") live in `messages/*.json` under
// `detailedNotes.*`, so a copy change or a new locale is not a data migration —
// the same reason a RatingBand is derived on render rather than stored.
//
// Every part and every field is optional: §10 is "fill any part, skip the
// rest; it saves as you go", so a half-filled sheet is the normal state, not an
// incomplete one. An empty part is stored as absent rather than `{}` (the
// action normalises), which is what lets the sheet count "3 of 5 parts filled".
//
// GDPR: part of a JournalEntry, so it inherits that record's lawful basis
// (consent, ADR-0009 RoPA journal row). `serve.with` is the one free-text field
// — who or what the sake was had with ("grilled mackerel", "my sister") — and
// is capped short; it is a tasting context, never repurposed.
//
// Specs ("About the sake": rice, polishing, yeast, SMV) are deliberately NOT
// here. §10 shows them only for the user's own, non-catalogue entries, and
// manual entry is not built. Adding them is a JournalEntry schemaVersion bump.

export const CLARITY = ['clear', 'slightlyHazy', 'cloudy'] as const
export const COLOR = ['waterWhite', 'paleStraw', 'gold', 'amber'] as const
export const NOSE_INTENSITY = ['light', 'medium', 'pronounced'] as const
export const AROMAS = [
  'fruit',
  'flower',
  'steamedRice',
  'lactic',
  'koji',
  'nut',
  'earth',
  'aged',
] as const

/** §10's five palate scales, in the order the sheet draws them. */
export const PALATE_SCALES = ['sweetness', 'acidity', 'umami', 'body', 'finish'] as const

/**
 * The five serving temperatures §10 offers, coolest first. Keys are the
 * Japanese names in romaji — 雪冷え 5°, 花冷え 10°, 常温 20°, ぬる燗 40°,
 * 熱燗 50° — because those ARE the names; the degrees are a gloss.
 */
// Six, as §9's "Serve it" lists them; §10 says "the five Japanese names", but
// 15° 涼冷え sits between the two cold names and 常温 and was missing. Added
// at the maintainer's request; order is the ladder's, coldest first.
export const SERVING_TEMPERATURES = ['yukibie', 'hanabie', 'suzuhie', 'joon', 'nurukan', 'atsukan'] as const
export type ServingTemperature = (typeof SERVING_TEMPERATURES)[number]

/**
 * The serving-temperature ladder's names. Japanese terms, so they are data,
 * not translatable strings — the same footing as `FLAVOR_AXIS_ROMAJI`. Only
 * the explanation of each lives in `messages/*.json`.
 */
export const SERVING_TEMPERATURE_TERMS: Readonly<
  Record<ServingTemperature, { kanji: string; romaji: string; degrees: number }>
> = {
  yukibie: { kanji: '雪冷え', romaji: 'yukibie', degrees: 5 },
  hanabie: { kanji: '花冷え', romaji: 'hanabie', degrees: 10 },
  suzuhie: { kanji: '涼冷え', romaji: 'suzuhie', degrees: 15 },
  joon: { kanji: '常温', romaji: 'jōon', degrees: 20 },
  nurukan: { kanji: 'ぬる燗', romaji: 'nurukan', degrees: 40 },
  atsukan: { kanji: '熱燗', romaji: 'atsukan', degrees: 50 },
}

export const VESSELS = ['ochoko', 'guinomi', 'wineGlass', 'masu'] as const
export const DRINK_AGAIN = ['yes', 'maybe', 'no'] as const
export const OCCASIONS = ['everyday', 'withDinner', 'specialOccasion', 'gift'] as const

export const DETAILED_NOTES_PARTS = ['appearance', 'nose', 'palate', 'serve', 'verdict'] as const
export type DetailedNotesPart = (typeof DETAILED_NOTES_PARTS)[number]

/** A 1–5 step on one of the palate scales. 0 is "not set" and is stored as absent. */
const Step = z.number().int().min(1).max(5)

/** A pick-any list: each key at most once. */
const pickAny = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .refine((list) => new Set(list).size === list.length, 'duplicate value')

export const DetailedNotesSchema = z.object({
  appearance: z
    .object({
      clarity: z.enum(CLARITY).optional(),
      color: z.enum(COLOR).optional(),
    })
    .optional(),
  nose: z
    .object({
      intensity: z.enum(NOSE_INTENSITY).optional(),
      aromas: pickAny(AROMAS).optional(),
    })
    .optional(),
  palate: z
    .object({
      sweetness: Step.optional(),
      acidity: Step.optional(),
      umami: Step.optional(),
      body: Step.optional(),
      finish: Step.optional(),
    })
    .optional(),
  serve: z
    .object({
      temperature: z.enum(SERVING_TEMPERATURES).optional(),
      vessel: z.enum(VESSELS).optional(),
      /** What or who it was had with. Free text, short. */
      with: z.string().max(200).optional(),
    })
    .optional(),
  verdict: z
    .object({
      again: z.enum(DRINK_AGAIN).optional(),
      suits: pickAny(OCCASIONS).optional(),
    })
    .optional(),
})

export type DetailedNotes = z.infer<typeof DetailedNotesSchema>

/** True when a part holds at least one value — what "3 of 5 parts filled" counts. */
export function isPartFilled(notes: DetailedNotes | undefined, part: DetailedNotesPart): boolean {
  const value = notes?.[part]
  if (!value) return false
  return Object.values(value).some((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim().length > 0 : v != null,
  )
}

/**
 * Drop empty values and empty parts, so a stored sheet never carries `{}` or
 * `[]` noise and "filled" means the same thing on every read. Returns
 * `undefined` when nothing is left — an entry with no detailed notes has no
 * `detail` field at all.
 */
export function compactDetailedNotes(notes: DetailedNotes): DetailedNotes | undefined {
  const out: Record<string, Record<string, unknown>> = {}
  for (const part of DETAILED_NOTES_PARTS) {
    const value = notes[part] as Record<string, unknown> | undefined
    if (!value) continue
    const kept: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      if (v == null) continue
      if (Array.isArray(v) && v.length === 0) continue
      if (typeof v === 'string') {
        const trimmed = v.trim()
        if (trimmed.length === 0) continue
        kept[key] = trimmed
        continue
      }
      kept[key] = v
    }
    if (Object.keys(kept).length > 0) out[part] = kept
  }
  return Object.keys(out).length > 0 ? (out as DetailedNotes) : undefined
}
