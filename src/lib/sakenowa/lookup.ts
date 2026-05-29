import 'server-only'
import type { Pool } from 'pg'
import type { Brand } from '../schemas/brand'
import type { Brewery } from '../schemas/brewery'
import type { FlavorChart } from '../schemas/flavor-chart'
import {
  type BrandRow,
  type BreweryRow,
  type FlavorChartRow,
  rowToBrand,
  rowToBrewery,
  rowToFlavorChart,
} from './db'
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

// JOIN-via-brand so the public contract stays brand-keyed (the page has a
// brandId; it shouldn't need to know the brewery_id to fetch a brewery).
const SELECT_BREWERY_BY_BRAND_ID = `
  SELECT b.brewery_id, b.name, b.name_kanji, b.area_id, b.source, b.confidence
  FROM breweries b
  JOIN brands br ON br.brewery_id = b.brewery_id
  WHERE br.brand_id = $1
`

export async function lookupBreweryByBrandFromPool(
  brandId: number,
  pool: Pool,
): Promise<Brewery | null> {
  const { rows } = await pool.query<BreweryRow>(SELECT_BREWERY_BY_BRAND_ID, [brandId])
  if (rows.length === 0) return null
  return rowToBrewery(rows[0])
}

export async function lookupBreweryByBrand(brandId: number): Promise<Brewery | null> {
  return lookupBreweryByBrandFromPool(brandId, getServerDbPool())
}

const SELECT_FLAVOR_CHART_BY_BRAND_ID = `
  SELECT brand_id, f1, f2, f3, f4, f5, f6, source, confidence
  FROM flavor_charts
  WHERE brand_id = $1
`

export async function lookupFlavorChartFromPool(
  brandId: number,
  pool: Pool,
): Promise<FlavorChart | null> {
  const { rows } = await pool.query<FlavorChartRow>(SELECT_FLAVOR_CHART_BY_BRAND_ID, [brandId])
  if (rows.length === 0) return null
  return rowToFlavorChart(rows[0])
}

export async function lookupFlavorChart(brandId: number): Promise<FlavorChart | null> {
  return lookupFlavorChartFromPool(brandId, getServerDbPool())
}
