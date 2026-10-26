import type { FlavorProfile } from '@/lib/schemas/flavor-profile'

/**
 * The made-up bottle the landing's hero loop is drawn with — design v1.8, K3.
 *
 * The landing sits **before** the 18+ gate, where no real sake's name, flavor
 * chart or rating may appear (JMStV; CLAUDE.md "Age gate"). So the loop does
 * not show a catalogue sake: it shows "Mihon (見本)", which means "sample" and
 * cannot be read as a real bottle. Everything here is invented — there is no
 * brand id, no brewery and no Sakenowa row behind it, and nothing on the
 * landing looks one up. Open decision 16 records the name check (catalogue and
 * web clear; a J-PlatPat class 33 search still pending).
 */
export const DEMO_BOTTLE = {
  /** Shown as the bottle's Latin name; not translated, it is a name. */
  name: 'Mihon',
  kanji: '見本',
  /** The rating the loop's tap gives — the fourth star. */
  rating: 4,
  /**
   * The bottle's made-up flavor chart: rich and mellow, low on dry and light,
   * so the six bars read as a shape rather than six equal stubs.
   */
  flavor: { f1: 0.34, f2: 0.68, f3: 0.82, f4: 0.46, f5: 0.3, f6: 0.22 },
} as const satisfies {
  name: string
  kanji: string
  rating: number
  flavor: FlavorProfile
}

/**
 * The made-up palate the loop's last frame grows into. Rich first, mellow
 * second, so §12's own title rule names it "Rich, umami-forward" — the title
 * K1 asks for — without the landing hard-coding the words.
 */
export const DEMO_PALATE: FlavorProfile = {
  f1: 0.42,
  f2: 0.7,
  f3: 0.78,
  f4: 0.5,
  f5: 0.36,
  f6: 0.3,
}
