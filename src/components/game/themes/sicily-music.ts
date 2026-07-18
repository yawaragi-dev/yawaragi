/**
 * 8-bit tarantella loop for the Sicily theme.
 *
 * Tarantella is a fast 6/8 southern-Italian folk dance — driving triplet
 * pulse, dance-around-the-room energy. The melody here is an original
 * motif written to fit on a single chiptune voice (square wave) so it
 * sits behind the SFX without competing.
 *
 * Implementation: one note per beat scheduled via `setTimeout` chain, with
 * a `setInterval` restarting the bar. Mirrors the synth approach in
 * `sounds.ts` — no audio files, no licensing, no external assets.
 *
 * The track is intentionally low-volume (gain 0.05) so jump / dodge SFX
 * stay clearly audible. The renderer calls `start()` once when the user
 * enables sound and `stop()` when sound is disabled or the component
 * unmounts; both are idempotent.
 */

import type { SoundEngine } from '../sounds'
import type { ThemeMusic } from './types'

// MIDI-ish note frequencies (A4 = 440 Hz). Only what the melody needs.
const A3 = 220
const C4 = 261.63
const D4 = 293.66
const E4 = 329.63
const F4 = 349.23
const G4 = 392.0
const A4 = 440.0
const B4 = 493.88
const C5 = 523.25
const D5 = 587.33
const E5 = 659.26

interface Note {
  /** Hz; 0 for a rest. */
  hz: number
  /** Beats (one beat = quarter note at the configured tempo). */
  beats: number
}

// Tarantella in A minor, 6/8 feel. Each "beat" below is an eighth note.
// Two 6-beat bars per phrase, four phrases per loop = 48 eighths.
const TARANTELLA: Note[] = [
  // Bar 1 — dance motif up
  { hz: A4, beats: 1 },
  { hz: B4, beats: 1 },
  { hz: C5, beats: 1 },
  { hz: B4, beats: 1 },
  { hz: A4, beats: 1 },
  { hz: G4, beats: 1 },
  // Bar 2 — down and resolve
  { hz: A4, beats: 1 },
  { hz: G4, beats: 1 },
  { hz: F4, beats: 1 },
  { hz: E4, beats: 1 },
  { hz: D4, beats: 1 },
  { hz: E4, beats: 1 },
  // Bar 3 — up and trill
  { hz: A4, beats: 1 },
  { hz: C5, beats: 1 },
  { hz: E5, beats: 1 },
  { hz: D5, beats: 1 },
  { hz: C5, beats: 1 },
  { hz: B4, beats: 1 },
  // Bar 4 — cadence home
  { hz: C5, beats: 1 },
  { hz: B4, beats: 1 },
  { hz: A4, beats: 1 },
  { hz: G4, beats: 1 },
  { hz: A4, beats: 1 },
  { hz: 0, beats: 1 },
  // Bar 5 — restate motif, octave alt
  { hz: E4, beats: 1 },
  { hz: F4, beats: 1 },
  { hz: G4, beats: 1 },
  { hz: F4, beats: 1 },
  { hz: E4, beats: 1 },
  { hz: D4, beats: 1 },
  // Bar 6 — bass line answer
  { hz: A3, beats: 1 },
  { hz: C4, beats: 1 },
  { hz: E4, beats: 1 },
  { hz: A4, beats: 1 },
  { hz: E4, beats: 1 },
  { hz: C4, beats: 1 },
  // Bar 7 — climbing run
  { hz: A4, beats: 1 },
  { hz: B4, beats: 1 },
  { hz: C5, beats: 1 },
  { hz: D5, beats: 1 },
  { hz: E5, beats: 1 },
  { hz: D5, beats: 1 },
  // Bar 8 — coda
  { hz: C5, beats: 1 },
  { hz: B4, beats: 1 },
  { hz: A4, beats: 1 },
  { hz: A4, beats: 1 },
  { hz: 0, beats: 1 },
  { hz: A4, beats: 1 },
]

// Eighth-note duration in seconds at 168 bpm (fast tarantella).
const BEAT_SEC = 60 / 168 / 2 // = ~0.18 s per eighth

class SicilyMusic implements ThemeMusic {
  private engine: SoundEngine | null = null
  private timers: ReturnType<typeof setTimeout>[] = []
  private looper: ReturnType<typeof setInterval> | null = null

  start(engine: SoundEngine) {
    if (this.engine) return // idempotent
    this.engine = engine
    this.scheduleBar()
    const loopMs = TARANTELLA.reduce((acc, n) => acc + n.beats, 0) * BEAT_SEC * 1000
    this.looper = setInterval(() => this.scheduleBar(), loopMs)
  }

  stop() {
    if (this.looper) {
      clearInterval(this.looper)
      this.looper = null
    }
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
    this.engine = null
  }

  private scheduleBar() {
    const engine = this.engine
    if (!engine) return
    let offsetMs = 0
    for (const note of TARANTELLA) {
      const durationSec = note.beats * BEAT_SEC
      const hz = note.hz
      if (hz > 0) {
        const t = setTimeout(() => {
          // Note: SoundEngine.playTone is exposed below as a public helper
          // for music modules. Falls through silently if the engine is
          // disabled by the time the timer fires.
          engine.playTone(hz, durationSec * 0.95, 'square', 0.05)
        }, offsetMs)
        this.timers.push(t)
      }
      offsetMs += durationSec * 1000
    }
  }
}

export const SICILY_MUSIC: ThemeMusic = new SicilyMusic()
