import type { LabelScanExtraction, SeveralBottlesRead } from '@/lib/schemas/label-scan-extraction'

/**
 * `VisionProvider` is the vendor-agnostic seam the Phase 3 scan action calls
 * through (PRD #105 §"Vision provider seam"; slice #108). Its main method,
 * `extractLabel`, takes a JPEG blob and returns a parsed
 * `LabelScanExtraction` whose `source` field is pinned to `'llm_extracted'`
 * at the schema level (see `src/lib/schemas/label-scan-extraction.ts`).
 *
 * Why so small an interface:
 *   - The scan action needs one read per photo, plus a second for a photo
 *     of several bottles (`readBottles`). Anything else (model
 *     warmup, capability discovery, billing introspection) is a future
 *     concern and would deepen the seam beyond its current responsibility.
 *   - A future vendor swap — vendor B for failover, vendor C for finetune
 *     bake-off — is a new registry entry implementing these methods, not
 *     a rewrite of the action. The seam is the protection.
 *
 * Implementations MUST return a value that passes
 * `LabelScanExtractionSchema.parse`; the schema rejects any attempt to
 * relabel the result as something other than `llm_extracted` (PR #100
 * pattern). Implementations SHOULD parse the model output through the
 * schema themselves before returning, so a malformed model response throws
 * at the seam rather than further downstream where the source of the bug
 * is obscured.
 */
export interface VisionProvider {
  /**
   * Reads a sake bottle label image and returns the extracted kanji/kana
   * fields with a confidence score. Throws on any failure to produce a
   * schema-valid extraction — never returns a partial or guess.
   */
  extractLabel(jpegBlob: Blob): Promise<LabelScanExtraction>
  /**
   * Counts the bottles in a photo the label read called `several_bottles`
   * and reads each readable one (design v1.7 §5a). Throws like `extractLabel`.
   */
  readBottles(jpegBlob: Blob): Promise<SeveralBottlesRead>
}
