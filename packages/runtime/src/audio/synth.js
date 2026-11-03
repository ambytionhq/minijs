// Turns numbers into sound. No browser needed, so games, the Studio's pictures of
// sounds and the tests all hear the same thing. See docs/sound.md.

/** @import { SoundSettings } from '@minijs/lang' */
import { DEFAULT_SOUND } from '@minijs/lang'

export const SAMPLE_RATE = 44100
const MAX_SECONDS = 4

/**
 * @typedef {object} SongNote
 * @property {number} step Which step it starts on, from 0.
 * @property {number} note MIDI number (60 is middle C). In drum tracks: 0 kick, 1 snare, 2 hat, 3 clap.
 * @property {number} length In steps.
 */

/**
 * @typedef {object} SongTrack
 * @property {string} name
 * @property {'square' | 'sine' | 'triangle' | 'saw' | 'drums'} wave
 * @property {number} volume 0 to 100
 * @property {boolean} muted
 * @property {Array<[number, number, number]>} notes step, note, length
 */

/**
 * @typedef {object} Song
 * @property {'music'} minijs
 * @property {number} version
 * @property {number} tempo Beats per minute.
 * @property {number} steps Steps in the loop. Four steps make a beat.
 * @property {string} scale
 * @property {number} root
 * @property {SongTrack[]} tracks
 */

/**
 * Same results every time for the same seed.
 * @param {number} seed
 * @returns {() => number} numbers from -1 to 1
 */
function noiseSource(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return (s / 2147483647.5) - 1
  }
}

/**
 * @param {string} wave
 * @param {number} phase 0 to 1
 * @returns {number}
 */
function waveAt(wave, phase) {
  switch (wave) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2)
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5)
    case 'saw':
      return 2 * phase - 1
    default:
      return phase < 0.5 ? 1 : -1
  }
}

/**
 * Length of a sound in seconds, without its echo.
 * @param {SoundSettings} s
 */
function bodySeconds(s) {
  return Math.max(0.005, s.attack + s.hold + s.fade)
}

/**
 * Length of the rendered sound in seconds, echo included.
 * @param {Partial<SoundSettings>} settings
 * @returns {number}
 */
export function soundSeconds(settings) {
  const s = { ...DEFAULT_SOUND, ...settings }
  return Math.min(MAX_SECONDS, bodySeconds(s) + (s.echo > 0 ? 0.42 : 0))
}

/**
 * Make the samples for a sound, from -1 to 1.
 * @param {Partial<SoundSettings>} settings
 * @param {number} [rate=SAMPLE_RATE]
 * @returns {Float32Array}
 */
export function renderSound(settings, rate = SAMPLE_RATE) {
  const s = { ...DEFAULT_SOUND, ...settings }
  const body = Math.min(MAX_SECONDS, bodySeconds(s))
  const length = Math.max(1, Math.floor(soundSeconds(s) * rate))
  const out = new Float32Array(length)
  const noise = noiseSource(0x2f6e2b1)
  const bodyLength = Math.floor(body * rate)
  const volume = s.volume / 100
  const crunchSteps = s.crunch > 0 ? Math.max(2, Math.round(32 - s.crunch * 0.3)) : 0
  const holdEvery = s.crunch > 0 ? 1 + Math.floor(s.crunch / 12) : 1
  // Muffle is a simple one-pole low-pass filter.
  const cutoff = 1 - (Math.min(s.muffle, 99) / 100) ** 0.45
  let filtered = 0
  let phase = 0
  let noiseValue = 0
  let noiseClock = 1
  let held = 0
  const slideSpan = Math.max(s.hold + s.fade, 0.001)
  for (let i = 0; i < bodyLength; i++) {
    const t = i / rate
    const slide = Math.min(1, Math.max(0, (t - s.attack) / slideSpan))
    const eased = s.steps > 0 ? Math.min(s.steps, Math.floor(slide * (s.steps + 1))) / s.steps : slide
    let freq = s.pitch * (s.pitchEnd / s.pitch) ** eased
    if (s.wobble > 0 && s.wobbleDepth > 0) {
      freq *= 1 + Math.sin(t * s.wobble * Math.PI * 2) * (s.wobbleDepth / 100) * 0.25
    }
    let sample
    if (s.wave === 'noise') {
      // Noise "pitch" is how often it picks a new random value.
      noiseClock += freq * 8
      if (noiseClock >= rate / 2) {
        noiseClock = 0
        noiseValue = noise()
      }
      sample = noiseValue
    } else {
      phase = (phase + freq / rate) % 1
      sample = waveAt(s.wave, phase)
    }
    let envelope = 1
    if (t < s.attack) envelope = t / Math.max(s.attack, 0.0001)
    else if (t > s.attack + s.hold) envelope = Math.max(0, 1 - (t - s.attack - s.hold) / Math.max(s.fade, 0.0001))
    sample *= envelope * envelope
    if (s.muffle > 0) {
      filtered += cutoff * (sample - filtered)
      sample = filtered
    }
    if (crunchSteps > 0) {
      if (i % holdEvery === 0) held = Math.round(sample * crunchSteps) / crunchSteps
      sample = held
    }
    out[i] = sample * volume
  }
  if (s.echo > 0) {
    const delay = Math.floor(0.14 * rate)
    const amount = (s.echo / 100) * 0.6
    for (let i = delay; i < length; i++) out[i] += out[i - delay] * amount
  }
  for (let i = 0; i < length; i++) out[i] = Math.max(-1, Math.min(1, out[i]))
  // A very short fade at the ends stops clicks.
  const edge = Math.min(32, length >> 1)
  for (let i = 0; i < edge; i++) out[length - 1 - i] *= i / edge
  return out
}

/** @param {number} note MIDI number */
export const noteFrequency = (note) => 440 * 2 ** ((note - 69) / 12)

/**
 * Seconds in one step of a song.
 * @param {Song} song
 */
export function stepSeconds(song) {
  return 60 / Math.max(20, song.tempo) / 4
}

/**
 * Drum sound samples.
 * @param {number} kind 0 kick, 1 snare, 2 hat, 3 clap
 * @param {number} rate
 * @returns {Float32Array}
 */
function renderDrum(kind, rate) {
  const seconds = [0.22, 0.17, 0.05, 0.13][kind] ?? 0.1
  const out = new Float32Array(Math.floor(seconds * rate))
  const noise = noiseSource(0x51ed27 + kind * 977)
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    const left = 1 - t / seconds
    let v = 0
    if (kind === 0) {
      phase += (45 + 120 * Math.exp(-t * 34)) / rate
      v = Math.sin(phase * Math.PI * 2) * left
    } else if (kind === 1) {
      phase += 190 / rate
      v = (Math.sin(phase * Math.PI * 2) * 0.35 + noise() * 0.65) * left * left
    } else if (kind === 2) {
      v = noise() * left * left * 0.5
    } else {
      const burst = t < 0.03 ? (Math.floor(t / 0.01) % 2 === 0 ? 1 : 0.2) : 1
      v = noise() * left * left * burst * 0.7
    }
    out[i] = v
  }
  return out
}

/**
 * Make the samples for one looping song. Note tails wrap to the start, so the loop is seamless.
 * @param {Song} song
 * @param {number} [rate=SAMPLE_RATE]
 * @returns {Float32Array}
 */
export function renderSong(song, rate = SAMPLE_RATE) {
  const perStep = stepSeconds(song) * rate
  const length = Math.max(1, Math.round(perStep * song.steps))
  const mix = new Float32Array(length)
  for (const track of song.tracks) {
    if (track.muted) continue
    const volume = track.volume / 100
    /** @type {Map<string, Float32Array>} */
    const cache = new Map()
    for (const [step, note, noteLength] of track.notes) {
      if (step >= song.steps) continue
      const key = `${note}/${noteLength}`
      let samples = cache.get(key)
      if (!samples) {
        samples = track.wave === 'drums' ? renderDrum(note, rate) : renderNote(track.wave, note, noteLength * stepSeconds(song), rate)
        cache.set(key, samples)
      }
      const start = Math.round(step * perStep)
      for (let i = 0; i < samples.length; i++) mix[(start + i) % length] += samples[i] * volume * 0.42
    }
  }
  // Keep loud moments from breaking up.
  for (let i = 0; i < length; i++) {
    const v = mix[i]
    mix[i] = v > 1 || v < -1 ? Math.tanh(v) : v
  }
  return mix
}

/**
 * @param {string} wave
 * @param {number} note
 * @param {number} seconds
 * @param {number} rate
 * @returns {Float32Array}
 */
function renderNote(wave, note, seconds, rate) {
  const release = 0.05
  const out = new Float32Array(Math.floor((seconds + release) * rate))
  const freq = noteFrequency(note)
  // Squares and saws are loud, so they sit lower in the mix.
  const level = wave === 'sine' || wave === 'triangle' ? 1 : 0.55
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    phase = (phase + freq / rate) % 1
    let envelope = Math.min(1, t / 0.004) * (0.75 + 0.25 * Math.exp(-t * 12))
    if (t > seconds) envelope *= Math.max(0, 1 - (t - seconds) / release)
    out[i] = waveAt(wave, phase) * envelope * level
  }
  return out
}

/**
 * Read a .music file.
 * @param {string} text
 * @returns {Song | null}
 */
export function parseSong(text) {
  /** @type {any} */
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || raw.minijs !== 'music' || !Array.isArray(raw.tracks)) return null
  const waves = ['square', 'sine', 'triangle', 'saw', 'drums']
  return {
    minijs: 'music',
    version: 1,
    tempo: typeof raw.tempo === 'number' ? Math.max(20, Math.min(300, raw.tempo)) : 120,
    steps: typeof raw.steps === 'number' ? Math.max(4, Math.min(256, Math.round(raw.steps))) : 32,
    scale: typeof raw.scale === 'string' ? raw.scale : 'major-pentatonic',
    root: typeof raw.root === 'number' ? raw.root : 60,
    tracks: raw.tracks
      .filter((t) => t && typeof t === 'object')
      .map((t, i) => ({
        name: typeof t.name === 'string' ? t.name : `Track ${i + 1}`,
        wave: waves.includes(t.wave) ? t.wave : 'square',
        volume: typeof t.volume === 'number' ? Math.max(0, Math.min(100, t.volume)) : 70,
        muted: t.muted === true,
        notes: Array.isArray(t.notes)
          ? t.notes.filter((n) => Array.isArray(n) && n.length === 3 && n.every((v) => typeof v === 'number'))
          : [],
      })),
  }
}

/**
 * A 16-bit WAV file from samples, for "Save as a recording" in Studio.
 * @param {Float32Array} samples
 * @param {number} [rate=SAMPLE_RATE]
 * @returns {ArrayBuffer}
 */
export function encodeWav(samples, rate = SAMPLE_RATE) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  /** @param {number} at @param {string} text */
  const word = (at, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i))
  }
  word(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  word(8, 'WAVE')
  word(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  word(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true)
  }
  return buffer
}
