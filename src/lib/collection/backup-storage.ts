/**
 * Where the daily collection backup is written (ADR-0024 §4) — a narrow port
 * so the backup job is testable without a network, and the vendor is a file
 * swap. Production is a private Supabase Storage bucket
 * (`supabase-backup-storage.ts`).
 *
 * Paths are `<clerkUserId>/<ISO instant>.json`, so a user's backups are one
 * prefix: listing it is the retention input, and deleting it is the erasure.
 */
export interface BackupStorage {
  /** Write one backup. Never overwrites: every backup has its own instant. */
  upload(path: string, body: string): Promise<void>
  /** File names (not full paths) directly under `<prefix>/`. */
  list(prefix: string): Promise<string[]>
  /** Delete these full paths. No-op for an empty list. */
  remove(paths: readonly string[]): Promise<void>
  /** Fetch one backup's contents, for restore. */
  download(path: string): Promise<string>
}

/** The private bucket the backups live in; created on first use. */
export const BACKUP_BUCKET = 'collection-backups'

/** How many backups per user the job keeps. ADR-0024 §4, ADR-0009 RoPA. */
export const BACKUPS_KEPT = 30

/**
 * The object name for a backup taken at `at`. ISO 8601 with the colons and
 * millis replaced, so names sort chronologically as plain strings — which is
 * what lets retention be a string sort — and stay valid on every filesystem
 * a downloaded copy lands on.
 */
export function backupFileName(at: number): string {
  return `${new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-')}.json`
}

/** Full path of a user's backup. User ids are Clerk's `user_…`; sanitised anyway. */
export function backupPath(userId: string, fileName: string): string {
  return `${backupPrefix(userId)}/${fileName}`
}

export function backupPrefix(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * The names to delete so that only the newest `keep` remain. Only names this
 * job writes are considered: anything else in the prefix (a file put there by
 * hand) is not ours to delete.
 */
export function backupsToPrune(names: readonly string[], keep: number = BACKUPS_KEPT): string[] {
  const ours = names.filter((n) => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/.test(n))
  return [...ours].sort().reverse().slice(keep)
}
