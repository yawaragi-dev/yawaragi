/**
 * Sicily theme sprite pack — a pizzaiolo (Sicilian pizza maker) running
 * through a Mediterranean coastal town, evading rolling pizzas, arancini,
 * and cannoli on the way to a wood-fired oven (the boss).
 *
 * Dimensions match the Shibuya theme exactly so the engine never has to
 * know which theme is active:
 *   - Player: 16 × 24
 *   - Obstacle 'beer'       (pizza):     12 × 16
 *   - Obstacle 'sake'       (cannolo):   8 × 20
 *   - Obstacle 'strongzero' (arancino):  10 × 18
 *   - Obstacle 'boss'       (oven):      18 × 32
 *   - Milestone 'hachiko'   (Vespa):     18 × 22
 *   - Milestone 'scramble'  (cobbles):   36 × 4
 *   - Milestone 'tower'     (campanile): 14 × 60
 *   - Milestone 'train'     (Etna):      80 × 22
 */

import type { Sprite } from '../sprites'

/* ---------- Palette ---------- */

const HAT_WHITE = '#fafafa' // chef's toque
const APRON = '#fef3c7' // amber-100 — light apron / shirt
const TROUSERS = '#1f2937' // gray-800 — dark trousers
const SKIN = '#fbcf9f' // warm tan
const HAIR_DARK = '#1c1917' // stone-900
const APRON_STRAP = '#b91c1c' // red-700 — apron tie / kerchief
const APRON_SHADOW = '#fbbf24' // amber-400 — fold shadow

// Food
const PIZZA_CRUST = '#d97706' // amber-600 — wood-fired crust
const PIZZA_CRUST_DARK = '#92400e' // amber-800 — char marks
const TOMATO = '#dc2626' // red-600 — sauce
const CHEESE = '#fef3c7' // amber-100 — mozzarella
const BASIL = '#15803d' // green-700 — basil leaf
const ARANCINO_OUTSIDE = '#c2410c' // orange-700 — breaded outside
const ARANCINO_HIGHLIGHT = '#fdba74' // orange-300 — toasted crumb highlight
const CANNOLO_SHELL = '#b45309' // amber-700 — fried tube
const CANNOLO_SHELL_DARK = '#78350f' // amber-900 — shadow
const RICOTTA = '#fef9c3' // yellow-100 — ricotta filling
const CHOC_CHIP = '#3f2a14' // dark chocolate chip

// Oven (boss)
const OVEN_STONE = '#a8a29e' // stone-400
const OVEN_STONE_DARK = '#57534e' // stone-600
const OVEN_MOUTH = '#1c1917' // dark interior
const OVEN_FIRE = '#f97316' // orange-500
const OVEN_FIRE_BRIGHT = '#fde047' // yellow-300

// Sicilian landscape
const TERRACOTTA = '#c2410c' // roof terracotta
const STUCCO = '#fde68a' // amber-200 — sun-bleached wall
const CYPRESS = '#166534' // green-800
const CAMPANILE = '#facc15' // yellow-400 — sandstone bell tower
const CAMPANILE_SHADOW = '#a16207' // yellow-700
const BELL = '#52525b' // zinc-600
const VESPA_BODY = '#0ea5e9' // sky-500 — classic Vespa colour
const VESPA_DARK = '#0c4a6e' // sky-900
const VESPA_TYRE = '#1c1917'
const VESPA_SEAT = '#1f2937'
const VESPA_CHROME = '#e5e7eb'

// Etna
const ETNA_DARK = '#3f3f46' // zinc-700 — basalt slope
const ETNA_LIGHT = '#71717a' // zinc-500 — sunlit slope
const ETNA_SNOW = '#f4f4f5' // zinc-100 — summit snow
const ETNA_LAVA = '#dc2626' // red-600 — lava glow
const SMOKE = '#a8a29e' // stone-400

// Cobblestones (piazza floor)
const COBBLE = '#a8a29e'

/* ---------- Pizzaiolo (player) — 16 × 24 ---------- */

// Palette legend:
//  1 = chef's hat white
//  2 = apron / shirt
//  3 = skin
//  4 = trousers (legs)
//  5 = hair / shoes
//  6 = apron strap / kerchief (red)
//  7 = hat shadow / apron fold (amber)

const PIZZAIOLO_PALETTE = {
  '1': HAT_WHITE,
  '2': APRON,
  '3': SKIN,
  '4': TROUSERS,
  '5': HAIR_DARK,
  '6': APRON_STRAP,
  '7': APRON_SHADOW,
}

// Standing — tall white toque, apron, dark trousers. Kept for parity with
// the Shibuya SALARYMAN_STANDING export even though the renderer only
// reads the run/jump frames.
export const PIZZAIOLO_STANDING: Sprite = {
  palette: PIZZAIOLO_PALETTE,
  pixels: [
    '....111111......', // hat top
    '...11111111.....',
    '...11111111.....',
    '...11111111.....',
    '....111111......', // hat band
    '.....3333.......', // forehead
    '....333333......', // face
    '....353553......', // hair tufts + eyes (5=hair)
    '....333333......',
    '.....3333.......', // chin
    '...266666662....', // shoulder + red kerchief tie
    '..22227722222...', // apron top with fold
    '.222222222222...',
    '.222222222222...',
    '.222222222222...',
    '.222227222222...', // apron seam
    '.222222222222...',
    '.222222222222...',
    '..2222...2222...', // legs split into trousers
    '..4444...4444...',
    '..4444...4444...',
    '..4444...4444...',
    '..5555...5555...', // shoes
    '.55555...55555..',
  ],
}

// Run A — left leg forward
export const PIZZAIOLO_RUN_A: Sprite = {
  palette: PIZZAIOLO_PALETTE,
  pixels: [
    '....111111......',
    '...11111111.....',
    '...11111111.....',
    '...11111111.....',
    '....111111......',
    '.....3333.......',
    '....333333......',
    '....353553......',
    '....333333......',
    '.....3333.......',
    '...266666662....',
    '..22227722222...',
    '.222222222222...',
    '.222222222222...',
    '.222222222222...',
    '.222227222222...',
    '.222222222222...',
    '.222222222222...',
    '..2222...2222...',
    '...444.....44...', // left leg forward, right leg back
    '...44.......4...',
    '...44.......4...',
    '...55.......5...',
    '..555.......55..',
  ],
}

// Run B — right leg forward
export const PIZZAIOLO_RUN_B: Sprite = {
  palette: PIZZAIOLO_PALETTE,
  pixels: [
    '....111111......',
    '...11111111.....',
    '...11111111.....',
    '...11111111.....',
    '....111111......',
    '.....3333.......',
    '....333333......',
    '....353553......',
    '....333333......',
    '.....3333.......',
    '...266666662....',
    '..22227722222...',
    '.222222222222...',
    '.222222222222...',
    '.222222222222...',
    '.222227222222...',
    '.222222222222...',
    '.222222222222...',
    '..2222...2222...',
    '..44........44..', // mirrored — right leg forward
    '..4........444..',
    '..4........444..',
    '..5........555..',
    '.55........5555.',
  ],
}

// Jumping — both legs tucked, arms out
export const PIZZAIOLO_JUMPING: Sprite = {
  palette: PIZZAIOLO_PALETTE,
  pixels: [
    '....111111......',
    '...11111111.....',
    '...11111111.....',
    '...11111111.....',
    '....111111......',
    '.....3333.......',
    '....333333......',
    '....353553......',
    '....333333......',
    '.....3333.......',
    '2.2266666622.2..', // arms flung out
    '22.227722222.22.',
    '.222222222222...',
    '.222222222222...',
    '.222222222222...',
    '.222227222222...',
    '.222222222222...',
    '.222222222222...',
    '..22.2222.22....', // legs tucked
    '...44.44.44.....',
    '....44..44......',
    '....44..44......',
    '....55..55......',
    '...555..555.....',
  ],
}

/* ---------- Obstacle: Pizza ---------- 12 × 16 ----------
 *
 * Round margherita pizza viewed at a steep angle — circular crust with
 * tomato + cheese centre, basil leaves, char-spotted crust. The flatness
 * leaves the upper rows blank, giving the engine a small visual gap
 * above the obstacle just like the original beer mug.
 *
 *  1 = crust
 *  2 = crust char marks
 *  3 = tomato / sauce
 *  4 = cheese
 *  5 = basil
 */
export const PIZZA: Sprite = {
  palette: {
    '1': PIZZA_CRUST,
    '2': PIZZA_CRUST_DARK,
    '3': TOMATO,
    '4': CHEESE,
    '5': BASIL,
  },
  pixels: [
    '............',
    '............',
    '............',
    '............',
    '............',
    '...111111...', // crust ring top
    '..11343311..',
    '.1134443411.',
    '.1344554431.',
    '.1345554431.',
    '.1334443331.',
    '..21333321..',
    '...211112...',
    '............',
    '............',
    '............',
  ],
}

/* ---------- Obstacle: Cannolo ---------- 8 × 20 ----------
 *
 * Vertical tube pastry with ricotta filling visible at both ends and a
 * chocolate chip embedded mid-shell.
 *
 *  1 = fried shell
 *  2 = shell shadow
 *  3 = ricotta filling
 *  4 = chocolate chip
 */
export const CANNOLO: Sprite = {
  palette: {
    '1': CANNOLO_SHELL,
    '2': CANNOLO_SHELL_DARK,
    '3': RICOTTA,
    '4': CHOC_CHIP,
  },
  pixels: [
    '.333333.',
    '.333333.',
    '.111111.',
    '.121121.',
    '.111111.',
    '.111111.',
    '.114111.',
    '.111441.',
    '.114411.',
    '.111111.',
    '.121121.',
    '.111111.',
    '.111111.',
    '.121121.',
    '.111441.',
    '.114411.',
    '.111111.',
    '.121121.',
    '.333333.',
    '.333333.',
  ],
}

/* ---------- Obstacle: Arancino ---------- 10 × 18 ----------
 *
 * Sicilian fried rice ball. Round, breaded, golden orange with toasted
 * highlights. Slightly tapered to a teardrop (the classic Catania shape).
 *
 *  1 = breaded outside
 *  2 = toasted highlight
 *  3 = darker shadow
 *  4 = basil garnish on top
 */
export const ARANCINO: Sprite = {
  palette: {
    '1': ARANCINO_OUTSIDE,
    '2': ARANCINO_HIGHLIGHT,
    '3': PIZZA_CRUST_DARK,
    '4': BASIL,
  },
  pixels: [
    '....44....',
    '....44....',
    '...4444...', // basil garnish / leaf on top
    '...1111...', // teardrop tip
    '..111111..',
    '.11121211.',
    '.11221221.',
    '1121111121',
    '1121111121',
    '1111121111',
    '1112111211',
    '1121112111',
    '1111121111',
    '1131111131',
    '1311111113',
    '.33111133.',
    '..333333..',
    '...3333...',
  ],
}

/* ---------- Boss obstacle: Wood-fired pizza oven ---------- 18 × 32 ----------
 *
 * Stone dome with a glowing arched mouth. Tall enough that a tap-jump
 * can't clear it (engine assertion: boss height = 32 world units; tap
 * apex ≈ 27.5). Held jump (apex ≈ 72) clears with margin.
 *
 *  1 = stone
 *  2 = stone shadow / mortar
 *  3 = oven mouth interior (dark)
 *  4 = fire glow (orange)
 *  5 = fire bright (yellow)
 */
export const BOSS_OVEN: Sprite = {
  palette: {
    '1': OVEN_STONE,
    '2': OVEN_STONE_DARK,
    '3': OVEN_MOUTH,
    '4': OVEN_FIRE,
    '5': OVEN_FIRE_BRIGHT,
  },
  pixels: [
    '......111111......', // dome top
    '....1111111111....',
    '...112112121211...',
    '..11112112112111..',
    '.1121111111111121.',
    '.1111212112112111.',
    '11121111111111121.',
    '11112112112112111.',
    '11211111111111121.',
    '11111212121211111.',
    '11211111111111121.',
    '11112112112112111.',
    '11211111111111121.',
    '11111121121121211.',
    '11211111111111121.',
    '11112112112112111.',
    '11211333333333211.',
    '11113344444444311.',
    '11133444554443331.', // arched mouth, fire inside
    '11334555555543331.',
    '11334555665543331.', // glow heart
    '11334555555543331.',
    '11133444554443331.',
    '11113344444443311.',
    '11211333333333211.',
    '11112112112112111.',
    '12211111111111122.',
    '12222112112112221.',
    '22222222222222222.',
    '22222222222222222.',
    '22222222222222222.', // stone base
    '22222222222222222.',
  ],
}

/* ---------- Milestone: Vespa ---------- 18 × 22 ----------
 *
 * A classic Vespa scooter parked sideways. Two wheels, curvy body, mirror.
 *  1 = body (sky blue)
 *  2 = body shadow / dark
 *  3 = tyre
 *  4 = seat
 *  5 = chrome (handlebars / mirror)
 */
export const VESPA: Sprite = {
  palette: {
    '1': VESPA_BODY,
    '2': VESPA_DARK,
    '3': VESPA_TYRE,
    '4': VESPA_SEAT,
    '5': VESPA_CHROME,
  },
  pixels: [
    '..................',
    '..................',
    '..................',
    '...............55.', // mirror
    '...............55.',
    '..............555.',
    '..............5...', // handlebar stem
    '.........44444.5..', // seat
    '.......11111111...', // upper body
    '......1111111111..',
    '.....111111111111.', // body widens
    '....11111111111112',
    '....11111122211112',
    '....11111122211122',
    '....11112222221122',
    '....11122222222222',
    '....11222222222222',
    '....22222222222222',
    '...3333222222333..',
    '..333333..2.333333',
    '..333333..2.333333',
    '...3333.....3333..',
  ],
}

/* ---------- Milestone: Cobblestones ---------- 36 × 4 ----------
 *
 * Italian-piazza cobble pattern — irregular stones in a row, matches the
 * scramble-stripes slot dimensions and reads as ground texture.
 *  1 = light cobble
 *  2 = dark mortar
 */
export const COBBLES: Sprite = {
  palette: {
    '1': COBBLE,
    '2': OVEN_STONE_DARK,
  },
  pixels: [
    '111.11.111.11.111.11.111.11.111.11.1',
    '11.111.11.111.11.111.11.111.11.111.1',
    '111.11.111.11.111.11.111.11.111.11.1',
    '11.111.11.111.11.111.11.111.11.111.1',
  ],
}

/* ---------- Milestone: Campanile (bell tower) ---------- 14 × 60 ----------
 *
 * Tall narrow Sicilian church bell tower with a single arched window
 * housing a bell at the top and a cross above. Sandstone palette.
 *  1 = sandstone wall
 *  2 = stone shadow
 *  3 = bell
 *  4 = cross / dark detail
 */
export const CAMPANILE_SPRITE: Sprite = {
  palette: {
    '1': CAMPANILE,
    '2': CAMPANILE_SHADOW,
    '3': BELL,
    '4': OVEN_MOUTH,
  },
  pixels: [
    '......44......', // cross top
    '......44......',
    '....44444444..',
    '......44......',
    '......44......',
    '.....1111.....', // spire base
    '....111111....',
    '....111111....',
    '...11111111...',
    '...11111111...',
    '..1111111111..', // roof line
    '..1122222211..', // belfry top arch
    '..1133333311..', // bell housing dark inside
    '..1133333311..',
    '..1133333311..',
    '..1133333311..',
    '..1122222211..',
    '..1111111111..',
    '..1111111111..',
    '..1122222211..', // shaft begins
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1112112111..', // window
    '..1112112111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1112112111..',
    '..1112112111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1112112111..',
    '..1112112111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1112112111..',
    '..1112112111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1112112111..',
    '..1112112111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1111111111..',
    '..1122222211..',
    '..1111111111..',
    '..1111111111..',
    '..2222222222..',
    '..2222222222..',
  ],
}

/* ---------- Milestone: Mount Etna ---------- 80 × 22 ----------
 *
 * Wide silhouette of Sicily's volcano — broad based, snow-capped, with a
 * curl of smoke rising from the crater.
 *  1 = dark basalt slope
 *  2 = sunlit slope
 *  3 = snow cap
 *  4 = lava glow
 *  5 = smoke
 */
export const ETNA: Sprite = {
  palette: {
    '1': ETNA_DARK,
    '2': ETNA_LIGHT,
    '3': ETNA_SNOW,
    '4': ETNA_LAVA,
    '5': SMOKE,
  },
  pixels: [
    '.......................................5555....................................',
    '......................................5555555..................................',
    '.....................................555555555.................................',
    '.....................................55555555..................................',
    '.....................................333443333.................................',
    '....................................33334433333................................',
    '....................................3334443333.................................',
    '...................................1333333333311...............................',
    '..................................111122333322111..............................',
    '.................................1111112222221111111...........................',
    '...............................1111111122222221111111..........................',
    '..............................11111111122222222211111111.......................',
    '............................1111111111122222222211111111111....................',
    '..........................11111111111112222222221111111111111..................',
    '........................111111111111111222222222111111111111111................',
    '......................11111111111111111222222222111111111111111111..............',
    '....................1111111111111111111222222222111111111111111111111...........',
    '.................11111111111111111111112222222221111111111111111111111111.......',
    '..............111111111111111111111111122222222211111111111111111111111111111...',
    '...........1111111111111111111111111111122222221111111111111111111111111111111..',
    '.......11111111111111111111111111111111122222221111111111111111111111111111111..',
    '1111111111111111111111111111111111111111122222211111111111111111111111111111111.',
  ],
}

/* ---------- Skyline: Sicilian coastal town ---------- 105 × 19 ----------
 *
 * Stucco buildings with terracotta roofs, cypress trees, the silhouette
 * of a dome here and there. Tiles horizontally at parallax speed —
 * dimensions match the Shibuya skyline so the renderer doesn't care.
 *  1 = stucco wall (warm yellow)
 *  2 = terracotta roof
 *  3 = cypress tree (dark green)
 *  4 = window (dark)
 */
export const SKYLINE_SICILY: Sprite = {
  palette: {
    '1': STUCCO,
    '2': TERRACOTTA,
    '3': CYPRESS,
    '4': OVEN_MOUTH,
  },
  pixels: [
    '.......................................................................................................',
    '.......................................................................................................',
    '.................................3.......................................3............................',
    '.................................3...............2.......................3.........................2.',
    '....................2...........33.............2222.........3...........33....................2222...',
    '..........3........222..........33............222222.......333..........33..................222222...',
    '..........3.......22222.........33...........22222222......333.........333................22222222...',
    '.........333.....2222222........33........22222222222222..33333........333.............22222222222222.',
    '........33333...222222222......333.......22222222222222..3333333......3333............2222222222222222',
    '.......3333333.22222222222.....333......222222221111222.33333333.....33333............221111222222222.',
    '...2..3333333.1.1141.4111111...333.....111111111111111111.3333333...333333....2.....1111111114.111111.',
    '..222.333333.11111141411111111.333....1111111411111114111.3333333...333333...222...111411111111111111.',
    '.22222.33333.11141.111111141111.333..1111111411111111.111.3333333...333333...22222.1111111114111111111',
    '11111111.333.11111.111111111111.333.111111111111111111111111.33333..333333.111111111111111111111111111',
    '11141111.333.111111411111111.111.333.11111111141141111.1411111.333..333333.111111141111111141111.11111',
    '11111111.333.111111111111.1111111.33.1111111111111111111111111111.33.33333.111111111111111111111111.11',
    '111111111.3.11111111111111111111111.3.11111111111111111111111111111.3.3333.111111111111111111111111111',
    '111111111111111111111111111111111111.1111111111111111111111111111111111111.1111111111111111111111111111',
    '1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
  ],
}
