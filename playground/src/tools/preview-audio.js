// Plays sounds while editing them, on one shared speaker connection.

import { SAMPLE_RATE } from '@minijs/runtime'

/** @type {AudioContext | null} */
let ctx = null

export function audioContext() {
  ctx ??= new (window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext)()
  void ctx.resume()
  return ctx
}

/**
 * @param {Float32Array} samples
 * @param {{ loop?: boolean; rate?: number }} [options]
 * @returns {{ stop: () => void; startedAt: number; seconds: number }}
 */
export function playSamples(samples, { loop = false, rate = SAMPLE_RATE } = {}) {
  const c = audioContext()
  const buffer = c.createBuffer(1, samples.length, rate)
  buffer.copyToChannel(samples, 0)
  const source = c.createBufferSource()
  source.buffer = buffer
  source.loop = loop
  source.connect(c.destination)
  source.start()
  return {
    startedAt: c.currentTime,
    seconds: buffer.duration,
    stop() {
      try {
        source.stop()
      } catch {
        // It had already finished.
      }
      source.disconnect()
    },
  }
}
