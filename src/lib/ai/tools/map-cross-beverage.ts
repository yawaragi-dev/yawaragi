import { tool } from 'ai'
import { z } from 'zod'
import { CrossBeverageMapSchema, type CrossBeverageMap } from '@/lib/schemas/cross-beverage-map'
import {
  CROSS_BEVERAGE_DESCRIPTOR_ALIASES,
  CROSS_BEVERAGE_MAP,
} from './cross-beverage-data'

/**
 * `mapCrossBeverage` — AI SDK 6 tool that resolves a Western-beverage
 * descriptor (`smoky`, `tannic`, `hoppy-west-coast`, ...) plus a beverage
 * category (`whisky` | `wine` | `beer` | `spirit` | `fortified` | `cider`)
 * into a position on the 6-axis FlavorProfile — the deterministic table
 * lookup behind the cross-beverage half of Phase 4's suggest action.
 *
 * Tool boundary — what this enforces
 * ----------------------------------
 * The LLM is forbidden (CLAUDE.md "Cross-beverage disclaimers") from
 * inventing new cross-beverage mappings. Enforcement lives HERE, at the
 * tool boundary, not just in the S5 (#143) system prompt. The input schema
 * constrains `descriptor` to the closed union of canonical descriptors +
 * alias keys present in the data file at module-load time — anything the
 * LLM emits that isn't in that union gets rejected by the AI SDK before
 * `execute` is ever called.
 *
 * The `execute` path still has to handle "descriptor typed by the LLM that
 * schema-parses but isn't in the runtime table" as a defensive belt on top
 * of the suspenders (a future PR could reorder imports or freeze the enum
 * at a stale snapshot), so it emits a structured tool-boundary error the
 * LLM can read ("no mapping for `X`; known descriptors near it: ...")
 * rather than throwing or silently falling back.
 *
 * Provenance
 * ----------
 * Every success return carries `source: 'cross_beverage_map'`. The UI
 * detects this literal and renders `<HeuristicDisclaimer />` alongside
 * the recommendation (CLAUDE.md "Cross-beverage disclaimers", ADR-0005
 * §"deterministic-but-heuristic source").
 *
 * Companion schemas / data
 * ------------------------
 * - `CrossBeverageMapSchema` (row shape, source literal, beverage enum) —
 *   `src/lib/schemas/cross-beverage-map.ts`. Reused, never duplicated.
 * - `CROSS_BEVERAGE_MAP` (row data) + `CROSS_BEVERAGE_DESCRIPTOR_ALIASES`
 *   (visitor-vocabulary redirects) — `./cross-beverage-data.ts`. Consumed,
 *   never modified.
 *
 * Parallel structure
 * ------------------
 * Mirrors the vision + MCP registries (`src/lib/ai/vision/registry.ts`,
 * `src/lib/ai/mcp/registry.ts`): closed-set discipline enforced at the
 * boundary, unknown values produce structured errors with the known set
 * as a hint. The same anti-typo posture that catches `VISION_PROVIDER=
 * anthorpic-haiku` catches an LLM asking for `peat-smoked`.
 */

// Build the closed-set descriptor list at module load. Combining canonical
// descriptors (from `CROSS_BEVERAGE_MAP`) with alias keys means the visitor
// (and the LLM speaking on their behalf) can use either form and both pass
// schema validation. `Set` dedupes if a future audit ever puts the same
// string in both places — belt-and-suspenders, keeps the zod enum from
// throwing at import time on `Duplicate values`.
const KNOWN_DESCRIPTORS = Array.from(
  new Set<string>([
    ...CROSS_BEVERAGE_MAP.map((row) => row.descriptor),
    ...Object.keys(CROSS_BEVERAGE_DESCRIPTOR_ALIASES),
  ]),
).sort()

// zod's `z.enum([...])` requires a non-empty tuple at the type level. We
// know the array is non-empty because the data file ships with 62+ rows;
// the assertion below documents that invariant. If someone ever nukes
// `cross-beverage-data.ts` this file will fail to load, which is fine —
// the tool has no meaning without a data table.
if (KNOWN_DESCRIPTORS.length === 0) {
  throw new Error(
    'mapCrossBeverage: CROSS_BEVERAGE_MAP and CROSS_BEVERAGE_DESCRIPTOR_ALIASES are both empty — the tool cannot register with an empty descriptor set.',
  )
}
const [FIRST_DESCRIPTOR, ...REST_DESCRIPTORS] = KNOWN_DESCRIPTORS as [string, ...string[]]

// Reuse the beverage enum from the single-source-of-truth schema rather
// than duplicating the string list. `.shape.beverage` is Zod's public
// accessor; touching it here means any future widening of the schema
// enum (e.g. adding `sake_cocktail`) surfaces here immediately.
const BeverageEnum = CrossBeverageMapSchema.shape.beverage

const InputSchema = z.object({
  descriptor: z
    .enum([FIRST_DESCRIPTOR, ...REST_DESCRIPTORS])
    .describe(
      'A Western-beverage descriptor from the deterministic cross-beverage table (e.g. "smoky", "tannic", "hoppy-west-coast"). Case-sensitive lowercase; hyphenated compounds are one token. Aliases (e.g. "peaty" for "peated") are accepted.',
    ),
  beverage: BeverageEnum.describe(
    'The Western beverage category the descriptor belongs to. Fixed set — whisky | wine | beer | spirit | fortified | cider — because a descriptor like "dry" can mean different things across categories.',
  ),
})

type MapCrossBeverageInput = z.infer<typeof InputSchema>

/**
 * Structured error the LLM can reason over — "no mapping for X; known
 * descriptors near it: Y". Modelled on `resolveVisionProviderKey`'s
 * unknown-value pattern (which throws a message with the known set),
 * adapted to the AI SDK tool contract: a JSON-serialisable return rather
 * than a throw, so the model sees `{ error, knownDescriptors }` in its
 * tool-result and can retry with a valid input.
 */
type MapCrossBeverageError = {
  readonly error: string
  readonly knownDescriptors: readonly string[]
}

// The success shape is a `CrossBeverageMap` row (already carrying the
// provenance envelope via `parseCrossBeverageMap` at data-file load).
// Explicit union so the tool's declared output covers both branches.
type MapCrossBeverageOutput = CrossBeverageMap | MapCrossBeverageError

const resolveDescriptor = (input: string): string => {
  // Normalise before alias resolution so `Peaty ` and `peaty` both land on
  // `peated`. The alias table itself is keyed by lowercase-no-whitespace,
  // matching the canonical descriptor convention (`cross-beverage-data.ts`
  // JSDoc); the input schema enum keys are also lowercase, so normalisation
  // is a defensive belt catching whatever the LLM emits.
  const normalised = input.trim().toLowerCase()
  return CROSS_BEVERAGE_DESCRIPTOR_ALIASES[normalised] ?? normalised
}

export const mapCrossBeverage = tool({
  description:
    'Look up a cross-beverage descriptor + beverage pair in the deterministic Yawaragi CrossBeverageMap and return the matching 6-axis FlavorProfile position. Use this whenever the user asks for sake that is like a Western beverage descriptor (smoky whisky, tannic wine, hoppy beer, etc.). Do NOT invent mappings beyond what this tool returns — if the tool responds with an `error` field, surface it to the user rather than guessing.',
  inputSchema: InputSchema,
  execute: async ({
    descriptor,
    beverage,
  }: MapCrossBeverageInput): Promise<MapCrossBeverageOutput> => {
    const canonical = resolveDescriptor(descriptor)
    const row = CROSS_BEVERAGE_MAP.find(
      (r) => r.descriptor === canonical && r.beverage === beverage,
    )

    if (row == null) {
      // The known set surfaces to the LLM as a hint. Filter by the current
      // beverage so the model gets category-appropriate suggestions
      // ("peated" isn't a useful hint for a wine query) — same posture as
      // Sakenowa's smart-search: fail informatively.
      const knownForBeverage = CROSS_BEVERAGE_MAP.filter((r) => r.beverage === beverage).map(
        (r) => r.descriptor,
      )
      return {
        error: `No cross-beverage mapping for descriptor "${descriptor}" (resolved: "${canonical}") in beverage "${beverage}". Reply to the user acknowledging this — do not invent a mapping.`,
        knownDescriptors: knownForBeverage,
      }
    }

    return row
  },
})
