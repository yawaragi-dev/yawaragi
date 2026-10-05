import { describe, expect, it } from 'vitest'
import { backupFileName, backupPath, backupsToPrune } from '@/lib/collection/backup-storage'

describe('backup names', () => {
  it('names a backup by its instant, in a form that sorts by time as a plain string', () => {
    expect(backupFileName(Date.UTC(2026, 9, 5, 3, 30, 12, 345))).toBe('2026-10-05T03-30-12Z.json')
  })

  it("keeps each user's backups under their own prefix, and a crafted id inside it", () => {
    expect(backupPath('user_abc', 'x.json')).toBe('user_abc/x.json')
    expect(backupPath('../evil', 'x.json')).toBe('___evil/x.json')
  })
})

describe('retention', () => {
  const day = (d: number) => backupFileName(Date.UTC(2026, 0, d, 3, 30))

  it('keeps the newest ones and returns the rest for deletion', () => {
    const names = [day(3), day(1), day(4), day(2)]
    expect(backupsToPrune(names, 2)).toEqual([day(2), day(1)])
  })

  it('deletes nothing until there are more than it keeps', () => {
    expect(backupsToPrune([day(1), day(2)], 30)).toEqual([])
  })

  it('never deletes a file this job did not write', () => {
    expect(backupsToPrune(['notes.txt', 'manual-copy.json', day(1)], 0)).toEqual([day(1)])
  })
})
