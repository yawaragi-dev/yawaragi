/**
 * Web Audio synthesised sounds — no external assets, no licensing.
 *
 * All sounds are short oscillator-based tones. Quality is "8-bit chiptune"
 * which matches the pixel-art aesthetic. The class is lazily initialised
 * (no AudioContext until the user enables sound) so we don't trip the
 * browser's "audio without user gesture" warnings.
 */

export type SoundKind = 'jump' | 'dodge' | 'milestone' | 'gameover' | 'start'

export class SoundEngine {
  private ctx: AudioContext | null = null
  private enabled = false

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (enabled && !this.ctx) {
      this.ctx = new AudioContext()
    }
  }

  isEnabled() {
    return this.enabled
  }

  play(kind: SoundKind) {
    if (!this.enabled || !this.ctx) return

    switch (kind) {
      case 'jump':
        this.tone(440, 0.08, 'square', 0.15, 880)
        break
      case 'dodge':
        this.tone(660, 0.05, 'triangle', 0.08)
        break
      case 'milestone':
        this.tone(523, 0.12, 'sine', 0.18, 784)
        break
      case 'gameover':
        this.tone(330, 0.15, 'square', 0.2, 110)
        break
      case 'start':
        this.tone(523, 0.06, 'square', 0.12)
        setTimeout(() => this.tone(784, 0.08, 'square', 0.12), 80)
        break
    }
  }

  private tone(
    startHz: number,
    durationSec: number,
    type: OscillatorType,
    gain: number,
    endHz?: number,
  ) {
    if (!this.ctx) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(startHz, ctx.currentTime)
    if (endHz !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        endHz,
        ctx.currentTime + durationSec,
      )
    }
    g.gain.setValueAtTime(gain, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + durationSec + 0.02)
  }
}
