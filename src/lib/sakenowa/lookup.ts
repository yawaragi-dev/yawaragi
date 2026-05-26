import 'server-only'
import type { Pool } from 'pg'
import type { Brand } from '../schemas/brand'
import { type BrandRow, rowToBrand } from './db'
import { getServerDbPool } from '../supabase/server-client'

const SELECT_BRAND_BY_ID = `
  SELECT brand_id, name, name_kanji, brewery_id, source, confidence
  FROM brands
  WHERE brand_id = $1
`

export async function lookupBrandFromPool(brandId: number, pool: Pool): Promise<Brand | null> {
  const { rows } = await pool.query<BrandRow>(SELECT_BRAND_BY_ID, [brandId])
  if (rows.length === 0) return null
  return rowToBrand(rows[0])
}

/**
 * Read-side helper. Server-only. Server components and route handlers call
 * this; tests should use `lookupBrandFromPool(brandId, testcontainerPool)`
 * instead so they don't depend on a `DATABASE_URL` env var.
 */
export async function lookupBrand(brandId: number): Promise<Brand | null> {
  return lookupBrandFromPool(brandId, getServerDbPool())
}
