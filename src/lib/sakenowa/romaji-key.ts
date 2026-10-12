/**
 * One key for every way a Japanese name gets written in Latin letters.
 *
 * A sake's name reaches us in Latin from three hands that do not agree: the
 * catalogue's transliteration (modified Hepburn, usually), an importer's
 * label (whatever the brewery's export department chose), and a visitor's
 * keyboard. The differences are few and regular, so instead of matching
 * fuzzily — which cannot tell Sanwa from Miwa — both sides are reduced to
 * the same key and compared exactly.
 *
 * What the key ignores:
 *
 * - case, spacing, hyphens, apostrophes and dots: `Sawa no Hana`,
 *   `sawanohana`, `SAWA-NO-HANA`;
 * - how a long vowel is written: `ō`, `ô`, `ou`, `oh`, `oo` → `o`; `ū`, `uu`
 *   → `u`; `aa`, `ii`, `ee` likewise. So `Fudoh`, `Fudō`, `Fudou`;
 * - the romanisation system: Kunrei and Nihon-shiki spellings are turned
 *   into Hepburn — `si`→`shi`, `ti`→`chi`, `tu`→`tsu`, `hu`→`fu`, `zi`/`di`
 *   →`ji`, `du`→`zu`, `sya`→`sha`, `tya`→`cha`, `zya`/`jya`/`dya`→`ja`;
 * - `m` for `n` before `b`, `p`, `m`: `Namba` / `Nanba`, `gemmai` / `genmai`;
 * - `l` for `r`, the particle `wo` for `o`, old `kwa` / `gwa` / `ye`:
 *   `Yebisu` / `Ebisu`;
 * - `tch` for `cch`: `matcha` / `maccha`.
 *
 * What it does not ignore, on purpose: `ei` against `e` (keeps Meiri and
 * Meri apart for little gain), voicing (`taruzake` / `tarusake`, see
 * {@link looseRomajiKey}), and anything that is a different reading rather
 * than a different spelling — `Kitashika` for 北鹿 is wrong, not a variant.
 *
 * Both sides of every comparison must go through this function. It is not
 * a display form.
 */
export function romajiKey(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '')
      // Old and rare spellings first, so the rules below see plain syllables.
      .replace(/kwa/g, 'ka')
      .replace(/gwa/g, 'ga')
      .replace(/ye/g, 'e')
      .replace(/wo/g, 'o')
      .replace(/l/g, 'r')
      .replace(/tch/g, 'cch')
      // Kunrei / Nihon-shiki → Hepburn. Palatalised syllables before the
      // plain ones, or `sya` would become `shiya`.
      .replace(/sy([auo])/g, 'sh$1')
      .replace(/ty([auo])/g, 'ch$1')
      .replace(/(?:zy|jy|dy)([auo])/g, 'j$1')
      .replace(/si/g, 'shi')
      .replace(/ti/g, 'chi')
      .replace(/tu/g, 'tsu')
      .replace(/(?<![sc])hu/g, 'fu')
      .replace(/[zd]i/g, 'ji')
      .replace(/du/g, 'zu')
      .replace(/m(?=[bpm])/g, 'n')
      // Long vowels last: the rules above can create or expose them.
      .replace(/o[ouh]/g, 'o')
      .replace(/uu/g, 'u')
      .replace(/aa/g, 'a')
      .replace(/ii/g, 'i')
      .replace(/ee/g, 'e')
  )
}

/**
 * {@link romajiKey} with voicing removed as well: `g`→`k`, `z`→`s`, `j`→`sh`,
 * `d`→`t`, `b`/`p`/`f`→`h`.
 *
 * A compound's second word is often voiced when spoken (rendaku: `sake`
 * becomes `-zake`, `kura` `-gura`), and whether a transliteration writes that
 * is close to arbitrary — the catalogue has `Tarusake` where the label says
 * `Taruzake`. This key makes the two meet.
 *
 * It also makes `kame` meet `game`, so it is not evidence on its own. Use it
 * only where something else already agrees (the brewery), or to rank a
 * search result below the exact ones.
 */
export function looseRomajiKey(text: string): string {
  return romajiKey(text)
    .replace(/j/g, 'sh')
    .replace(/g/g, 'k')
    .replace(/z/g, 's')
    .replace(/d/g, 't')
    .replace(/[bpf]/g, 'h')
}
