import { z } from 'zod'

/**
 * What the visitor's previous scan read, sent back with the next photo so
 * the two can be resolved together (#408).
 *
 * It comes from the browser, so it is untrusted input: bounded, and used
 * only as lookup strings against the public catalogue — never shown as a
 * read, never sent to the vision model (the second photo is read blind).
 *
 * Not personal data: label text held in the tab's memory for a few minutes
 * and echoed to our own server. No new processing operation (ADR-0009).
 */
const NAME_MAX = 120

export const EarlierScanReadSchema = z.object({
  name_ja: z.string().min(1).max(NAME_MAX),
  brewery_ja: z.string().min(1).max(NAME_MAX),
  other_names: z.array(z.string().max(NAME_MAX)).max(12).optional(),
  confidence: z.number().min(0).max(1),
})

export type EarlierScanRead = z.infer<typeof EarlierScanReadSchema>

/** The earlier read from a form field, or null when absent or malformed. */
export function parseEarlierScanRead(raw: unknown): EarlierScanRead | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4000) return null
  try {
    const parsed = EarlierScanReadSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
