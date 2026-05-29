import { z } from 'zod'

const SAKENOWA_BASE_URL = 'https://muro.sakenowa.com/sakenowa-data/api'

export const SakenowaBrand = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  breweryId: z.number().int().positive(),
})
export type SakenowaBrand = z.infer<typeof SakenowaBrand>

const BrandsResponse = z.object({
  brands: z.array(SakenowaBrand),
})

export class SakenowaError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SakenowaError'
  }
}

export async function getBrands(): Promise<SakenowaBrand[]> {
  const url = `${SAKENOWA_BASE_URL}/brands`

  let response: Response
  try {
    response = await fetch(url)
  } catch (cause) {
    throw new SakenowaError(`Network error fetching ${url}`, cause)
  }

  if (!response.ok) {
    throw new SakenowaError(`Sakenowa /brands returned ${response.status} ${response.statusText}`)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    throw new SakenowaError(`Sakenowa /brands returned non-JSON body`, cause)
  }

  const parsed = BrandsResponse.safeParse(body)
  if (!parsed.success) {
    throw new SakenowaError(`Sakenowa /brands response failed schema validation`, parsed.error)
  }

  return parsed.data.brands
}
