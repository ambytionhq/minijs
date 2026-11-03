// Where a game's sound goes. Simulation talks to this small interface, so tests
// can listen in and games with sound turned off cost nothing.

/** @import { MiniError } from '@minijs/lang' */
/** @import { GameData } from '../game-data.js' */
import { SAMPLE_RATE, renderSong, renderSound } from './synth.js'

/**
 * @typedef {object} AudioOutput
 * @property {(data: GameData) => Promise<MiniError[]>} prepare Get every sound ready before the game starts.
 * @property {(name: string, volume: number, pitch: number, pan: number) => void} playSound volume and pitch: 1 is normal. pan: -1 left to 1 right.
 * @property {(name: string) => void} playMusic Loops until stopped. Replaces what was playing.
 * @property {() => void} stopMusic
 * @property {(channel: 'sound' | 'music', volume: number) => void} setVolume 0 to 1.
 * @property {() => void} stopAll Silence, and back to normal volume.
 * @property {() => void} destroy
 */

/** Silence. @implements {AudioOutput} */
export class NullAudio {
  async prepare() {
    return []
  }
  playSound() {}
  playMusic() {}
  stopMusic() {}
  setVolume() {}
  stopAll() {}
  destroy() {}
}

/**
 * @typedef {(
 *   | { op: 'sound'; name: string; volume: number; pitch: number; pan: number }
 *   | { op: 'music'; name: string }
 *   | { op: 'stopMusic' }
 *   | { op: 'volume'; channel: 'sound' | 'music'; volume: number }
 *   | { op: 'stopAll' }
 * )} AudioCall
 */

/** Writes down what it was asked to play. For tests. @implements {AudioOutput} */
export class RecordingAudio {
  /** @type {AudioCall[]} */
  calls = []
  async prepare() {
    return []
  }
  /** @param {string} name @param {number} volume @param {number} pitch @param {number} pan */
  playSound(name, volume, pitch, pan) {
    this.calls.push({ op: 'sound', name, volume, pitch, pan })
  }
  /** @param {string} name */
  playMusic(name) {
    this.calls.push({ op: 'music', name })
  }
  stopMusic() {
    this.calls.push({ op: 'stopMusic' })
  }
  /** @param {'sound' | 'music'} channel @param {number} volume */
  setVolume(channel, volume) {
    this.calls.push({ op: 'volume', channel, volume })
  }
  stopAll() {
    this.calls.push({ op: 'stopAll' })
  }
  destroy() {}
}

/** More sounds than this at once would only be noise, so the extras are skipped. */
const MAX_VOICES = 32

/**
 * Real sound through the Web Audio API. Browsers only allow sound after someone
 * clicks or presses a key, so it wakes up on the first one of those. Sound effects
 * asked for before that are dropped; music waits and starts then.
 * @implements {AudioOutput}
 */
export class WebAudioOutput {
  /** @type {AudioContext | null} */
  ctx = null
  /** @type {GainNode | null} */
  master = null
  /** @type {GainNode | null} */
  soundBus = null
  /** @type {GainNode | null} */
  musicBus = null
  /** @type {Map<string, AudioBuffer>} */
  sounds = new Map()
  /** @type {Map<string, { buffer: AudioBuffer; volume: number }>} */
  music = new Map()
  /** Rendered sounds, kept across restarts so editing a game stays quick. @type {Map<string, AudioBuffer>} */
  cache = new Map()
  /** @type {AudioBufferSourceNode | null} */
  current = null
  /** @type {GainNode | null} */
  currentGain = null
  /** @type {string | null} */
  currentName = null
  voices = 0
  muted = false
  /** @type {(() => void) | null} */
  removeUnlock = null

  /**
   * @param {{ muted?: boolean }} [options]
   */
  constructor(options = {}) {
    this.muted = options.muted ?? false
  }

  /** @private */
  ensure() {
    if (this.ctx) return this.ctx
    const Context = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext
    if (!Context) return null
    const ctx = new Context()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 1
    this.master.connect(ctx.destination)
    this.soundBus = ctx.createGain()
    this.soundBus.connect(this.master)
    this.musicBus = ctx.createGain()
    this.musicBus.connect(this.master)
    const unlock = () => {
      void ctx.resume()
      if (ctx.state === 'running') this.removeUnlock?.()
    }
    const events = ['pointerdown', 'keydown', 'touchend']
    for (const name of events) window.addEventListener(name, unlock, { capture: true })
    this.removeUnlock = () => {
      for (const name of events) window.removeEventListener(name, unlock, { capture: true })
      this.removeUnlock = null
    }
    void ctx.resume()
    return ctx
  }

  /**
   * @param {GameData} data
   * @returns {Promise<MiniError[]>}
   */
  async prepare(data) {
    this.stopAll()
    this.sounds.clear()
    this.music.clear()
    /** @type {MiniError[]} */
    const errors = []
    if (data.sounds.size === 0 && data.music.size === 0) return errors
    const ctx = this.ensure()
    if (!ctx) return errors
    for (const [name, sound] of data.sounds) {
      if (sound.samples) this.sounds.set(name, this.fromSynth(ctx, `s:${JSON.stringify(sound.samples)}`, () => renderSound(sound.samples ?? {})))
      else if (sound.bytes) {
        const buffer = await decode(ctx, sound.bytes)
        if (buffer) this.sounds.set(name, buffer)
        else errors.push(sound.problem())
      }
    }
    for (const [name, track] of data.music) {
      const volume = track.volume / 100
      if (track.song) {
        const song = track.song
        this.music.set(name, { buffer: this.fromSynth(ctx, `m:${JSON.stringify(song)}`, () => renderSong(song)), volume })
      } else if (track.bytes) {
        const buffer = await decode(ctx, track.bytes)
        if (buffer) this.music.set(name, { buffer, volume })
        else errors.push(track.problem())
      }
    }
    return errors
  }

  /**
   * @param {AudioContext} ctx
   * @param {string} key
   * @param {() => Float32Array} render
   * @returns {AudioBuffer}
   * @private
   */
  fromSynth(ctx, key, render) {
    const cached = this.cache.get(key)
    if (cached) return cached
    const samples = render()
    const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE)
    buffer.copyToChannel(samples, 0)
    this.cache.set(key, buffer)
    return buffer
  }

  /** @param {string} name @param {number} volume @param {number} pitch @param {number} pan */
  playSound(name, volume, pitch, pan) {
    const ctx = this.ctx
    const buffer = this.sounds.get(name)
    if (!ctx || !buffer || !this.soundBus || ctx.state !== 'running' || this.voices >= MAX_VOICES) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = Math.max(0.05, pitch)
    const gain = ctx.createGain()
    gain.gain.value = Math.max(0, volume)
    source.connect(gain)
    if (pan !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner()
      panner.pan.value = Math.max(-1, Math.min(1, pan))
      gain.connect(panner)
      panner.connect(this.soundBus)
    } else {
      gain.connect(this.soundBus)
    }
    this.voices++
    source.onended = () => {
      this.voices--
      source.disconnect()
      gain.disconnect()
    }
    source.start()
  }

  /** @param {string} name */
  playMusic(name) {
    const ctx = this.ctx
    const track = this.music.get(name)
    if (!ctx || !track || !this.musicBus) return
    if (this.currentName === name && this.current) return
    this.stopMusic()
    const source = ctx.createBufferSource()
    source.buffer = track.buffer
    source.loop = true
    const gain = ctx.createGain()
    gain.gain.value = track.volume
    source.connect(gain)
    gain.connect(this.musicBus)
    source.start()
    this.current = source
    this.currentGain = gain
    this.currentName = name
  }

  stopMusic() {
    if (this.current) {
      try {
        this.current.stop()
      } catch {
        // It had already stopped.
      }
      this.current.disconnect()
      this.currentGain?.disconnect()
    }
    this.current = null
    this.currentGain = null
    this.currentName = null
  }

  /** @param {'sound' | 'music'} channel @param {number} volume */
  setVolume(channel, volume) {
    const bus = channel === 'sound' ? this.soundBus : this.musicBus
    if (bus) bus.gain.value = Math.max(0, Math.min(1, volume))
  }

  stopAll() {
    this.stopMusic()
    if (this.soundBus) this.soundBus.gain.value = 1
    if (this.musicBus) this.musicBus.gain.value = 1
  }

  /** @param {boolean} muted */
  setMuted(muted) {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : 1
  }

  /** Quiet while the game is out of sight. */
  suspend() {
    void this.ctx?.suspend()
  }

  resume() {
    void this.ctx?.resume()
  }

  destroy() {
    this.stopAll()
    this.removeUnlock?.()
    void this.ctx?.close()
    this.ctx = null
    this.master = null
    this.soundBus = null
    this.musicBus = null
    this.cache.clear()
  }
}

/**
 * @param {AudioContext} ctx
 * @param {ArrayBuffer} bytes
 * @returns {Promise<AudioBuffer | null>}
 */
async function decode(ctx, bytes) {
  try {
    return await ctx.decodeAudioData(bytes.slice(0))
  } catch {
    return null
  }
}
