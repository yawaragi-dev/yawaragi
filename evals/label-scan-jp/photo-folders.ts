import type { GroundTruthFile } from './schemas'

/**
 * `photos/` is published with the repository; `photos/local/` is ignored by
 * git. Which folder a photo belongs in is its entry's `provenance.localOnly`,
 * so the two must agree: a local-only photo left in `photos/` would be
 * committed with the next `git add`, and a photo in `photos/local/` that is
 * not marked reads, to anyone without the file, as a photo that went missing.
 *
 * Returns one sentence per photo in the wrong folder; none when all is well.
 * A photo with no ground-truth entry is the runner's to report, not this.
 */
export function photosInTheWrongFolder(
  groundTruth: GroundTruthFile,
  published: readonly string[],
  local: readonly string[],
): string[] {
  const problems: string[] = []
  const localSet = new Set(local)
  for (const file of published) {
    if (localSet.has(file)) {
      problems.push(`${file} is in both photos/ and photos/local/; keep one.`)
    } else if (groundTruth[file]?.provenance.localOnly) {
      problems.push(`${file} is marked localOnly but sits in photos/; move it to photos/local/.`)
    }
  }
  for (const file of local) {
    const entry = groundTruth[file]
    if (entry && !entry.provenance.localOnly) {
      problems.push(`${file} sits in photos/local/ but is not marked localOnly; mark it or move it to photos/.`)
    }
  }
  return problems
}
