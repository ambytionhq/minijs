// The sound editor: sliders on the right, a picture of the sound in the middle. Every
// change plays straight away. Nothing is recorded, so sounds stay small and easy to change.

import { DEFAULT_SOUND, SOUND_PRESETS, SOUND_WAVES } from '@minijs/lang'
import { encodeWav, parseSoundFile, renderSound, stringifyAsset } from '@minijs/runtime'
import { playSamples } from './preview-audio.js'
import { assetName, choice, createHistory, cssColor, fitCanvas, group, h, iconButton, slider, textButton, toggle, usageStrip, wireUndoKeys } from './ui.js'

/** @import { SoundSettings } from '@minijs/lang' */
/** @import { Tool, ToolContext } from './index.js' */

const WAVE_INFO = /** @type {Record<string, { icon: string; label: string; help: string }>} */ ({
  square: { icon: 'wave-square', label: 'Square', help: 'Buzzy, like old game consoles' },
  sine: { icon: 'wave-sine', label: 'Smooth', help: 'Soft and pure, like a whistle' },
  triangle: { icon: 'wave-triangle', label: 'Soft', help: 'Gentle and round' },
  saw: { icon: 'wave-sawtooth', label: 'Sharp', help: 'Bright and harsh, good for lasers' },
  noise: { icon: 'wind', label: 'Noise', help: 'Crashes, hits and explosions' },
})

/**
 * @param {HTMLElement} host
 * @param {string} text
 * @param {ToolContext} ctx
 * @returns {Tool}
 */
export function openSoundTool(host, text, ctx) {
  /** @type {SoundSettings} */
  let sound = parseSoundFile(text) ?? { ...SOUND_PRESETS.coin }
  let samples = renderSound(sound)
  let autoPlay = true
  /** @type {{ stop: () => void; startedAt: number; seconds: number } | null} */
  let playing = null
  let playedAt = 0
  let raf = 0
  let cssW = 0
  let cssH = 0
  let ratio = 1

  const serialize = () => stringifyAsset({ minijs: 'sound', version: 1, ...sound })
  const history = createHistory(serialize(), (state) => {
    sound = /** @type {SoundSettings} */ (parseSoundFile(state))
    ctx.save(state)
    changed()
    renderControls()
  }, () => updateUndo())

  const canvas = h('canvas', { class: 'wave-canvas', role: 'img', 'aria-label': 'A picture of the sound. Tall parts are loud.' })
  const waveBox = h('div', { class: 'wave-box', onClick: play }, canvas)
  const lengthInfo = h('span', { class: 'map-info', role: 'status' })

  function changed() {
    samples = renderSound(sound)
    lengthInfo.textContent = `${(samples.length / 44100).toFixed(2)} seconds long.`
    drawWave()
  }

  function drawWave(progress = -1) {
    if (cssW === 0) return
    const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
    c.setTransform(ratio, 0, 0, ratio, 0, 0)
    c.clearRect(0, 0, cssW, cssH)
    const middle = cssH / 2
    c.strokeStyle = cssColor('--border')
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(0, middle + 0.5)
    c.lineTo(cssW, middle + 0.5)
    c.stroke()
    const columns = Math.max(1, Math.floor(cssW))
    const step = samples.length / columns
    c.fillStyle = cssColor('--accent')
    for (let x = 0; x < columns; x++) {
      let low = 0
      let high = 0
      const end = Math.min(samples.length, Math.floor((x + 1) * step))
      for (let i = Math.floor(x * step); i < end; i++) {
        if (samples[i] < low) low = samples[i]
        if (samples[i] > high) high = samples[i]
      }
      const top = middle - high * (middle - 6)
      const bottom = middle - low * (middle - 6)
      c.fillRect(x, top, 1, Math.max(1, bottom - top))
    }
    if (progress >= 0) {
      c.fillStyle = cssColor('--text')
      c.fillRect(progress * cssW, 0, 2, cssH)
    }
  }

  function play() {
    playing?.stop()
    try {
      playing = playSamples(samples)
    } catch {
      ctx.toast('This browser can\'t play sound.')
      return
    }
    playedAt = performance.now()
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(animate)
  }

  function animate() {
    if (!playing) return
    const progress = (performance.now() - playedAt) / 1000 / playing.seconds
    if (progress >= 1) {
      drawWave()
      return
    }
    drawWave(progress)
    raf = requestAnimationFrame(animate)
  }

  /** A slider let go: save it, and let them hear it. */
  const commit = () => {
    const state = serialize()
    history.push(state)
    ctx.save(state)
    if (autoPlay) play()
  }

  const undoButton = iconButton('arrow-u-up-left', 'Undo (Ctrl or Cmd + Z)', () => history.undo())
  const redoButton = iconButton('arrow-u-up-right', 'Redo', () => history.redo())
  function updateUndo() {
    undoButton.disabled = !history.canUndo
    redoButton.disabled = !history.canRedo
  }

  const r = (/** @type {number} */ a, /** @type {number} */ b) => a + Math.random() * (b - a)

  function surprise() {
    const start = Math.round(2 ** r(7, 11))
    sound = {
      ...DEFAULT_SOUND,
      wave: SOUND_WAVES[Math.floor(Math.random() * SOUND_WAVES.length)],
      pitch: start,
      pitchEnd: Math.round(start * 2 ** r(-2.5, 2.5)),
      attack: 0.002,
      hold: Number(r(0.01, 0.2).toFixed(3)),
      fade: Number(r(0.05, 0.45).toFixed(3)),
      volume: 55,
      steps: Math.random() < 0.3 ? Math.round(r(2, 6)) : 0,
      wobble: Math.random() < 0.25 ? Math.round(r(4, 20)) : 0,
      wobbleDepth: Math.round(r(10, 50)),
      muffle: Math.random() < 0.25 ? Math.round(r(10, 60)) : 0,
      crunch: Math.random() < 0.2 ? Math.round(r(10, 60)) : 0,
      echo: Math.random() < 0.2 ? Math.round(r(10, 40)) : 0,
    }
    changed()
    renderControls()
    commit()
  }

  function nudge() {
    const a = (/** @type {number} */ v, /** @type {number} */ by) => Math.max(0, v * (1 + r(-by, by)))
    sound = {
      ...sound,
      pitch: Math.max(30, Math.round(a(sound.pitch, 0.2))),
      pitchEnd: Math.max(30, Math.round(a(sound.pitchEnd, 0.2))),
      hold: Number(a(sound.hold, 0.3).toFixed(3)),
      fade: Number(a(sound.fade, 0.3).toFixed(3)),
    }
    changed()
    renderControls()
    commit()
  }

  async function saveWav() {
    const blob = new Blob([encodeWav(samples)], { type: 'audio/wav' })
    await ctx.saveFile(blob, `${assetName(ctx.path.split('/').pop() ?? 'sound')}.wav`)
  }

  const presets = h('div', { class: 'preset-grid' },
    ...Object.keys(SOUND_PRESETS).map((name) => textButton(name, () => {
      sound = { ...SOUND_PRESETS[name] }
      changed()
      renderControls()
      commit()
      if (!autoPlay) play()
    })),
  )

  const toolbar = h('div', { class: 'tool-toolbar', role: 'toolbar', 'aria-label': 'Sound actions' },
    textButton('Play', play, { icon: 'play', primary: true, title: 'Hear it' }),
    textButton('Surprise me', surprise, { icon: 'dice-five' }),
    textButton('Change it a little', nudge, { icon: 'shuffle' }),
    h('span', { class: 'tool-toolbar-gap' }),
    toggle({ label: 'Play every change', value: autoPlay, onChange: (v) => { autoPlay = v } }),
    h('span', { class: 'tool-toolbar-gap' }),
    iconButton('download-simple', 'Save as a .wav recording', () => void saveWav()),
    undoButton,
    redoButton,
  )

  const controls = h('aside', { class: 'tool-column sound-controls' })
  const name = assetName(ctx.path.split('/').pop() ?? 'sound')
  const usage = usageStrip(ctx, `sound ${name} "${ctx.usableName(ctx.path)}"`, [
    `play sound ${name}`,
    `play sound ${name} volume 50`,
    `play sound ${name} pitch 120`,
    `play sound ${name} from the enemy`,
  ])

  const root = h('div', { class: 'tool sound-tool', tabindex: -1 },
    h('div', { class: 'tool-body sound-body' },
      h('div', { class: 'tool-column sound-middle' }, toolbar, waveBox, lengthInfo, group('Start from', presets)),
      controls,
    ),
    usage,
  )
  host.replaceChildren(root)
  wireUndoKeys(root, history)

  /**
   * @param {string} label
   * @param {keyof SoundSettings} key
   * @param {number} min
   * @param {number} max
   * @param {number} step
   * @param {(v: number) => string} format
   * @param {string} [help]
   */
  function field(label, key, min, max, step, format, help) {
    return slider({
      label,
      min,
      max,
      step,
      value: /** @type {number} */ (sound[key]),
      format,
      help,
      onInput: (v) => {
        Object.assign(sound, { [key]: v })
        changed()
      },
      onChange: commit,
    })
  }

  /**
   * A pitch slider that moves in musical steps, so low notes get as much room as high ones.
   * @param {string} label
   * @param {'pitch' | 'pitchEnd'} key
   */
  function pitchField(label, key) {
    return slider({
      label,
      min: 5,
      max: 12.5,
      step: 0.02,
      value: Math.log2(sound[key]),
      format: (v) => `${Math.round(2 ** v)} Hz`,
      onInput: (v) => {
        sound[key] = Math.round(2 ** v)
        changed()
      },
      onChange: commit,
    })
  }

  function renderControls() {
    const seconds = (/** @type {number} */ v) => `${v.toFixed(3)} s`
    const pct = (/** @type {number} */ v) => `${v}%`
    controls.replaceChildren(
      group('Kind of sound',
        choice({
          label: 'Wave',
          hideLabel: true,
          value: sound.wave,
          options: SOUND_WAVES.map((w) => ({ value: w, icon: WAVE_INFO[w].icon, label: WAVE_INFO[w].label, title: WAVE_INFO[w].help })),
          onChange: (v) => {
            sound.wave = v
            changed()
            commit()
          },
        }),
        h('p', { class: 'tool-help', text: WAVE_INFO[sound.wave].help }),
      ),
      group('Pitch',
        pitchField('Starts at', 'pitch'),
        pitchField('Slides to', 'pitchEnd'),
        field('Steps in the slide', 'steps', 0, 12, 1, (v) => (v === 0 ? 'Smooth' : `${v} jumps`), 'Jumps make it sound like notes, like a coin.'),
      ),
      group('Loudness over time',
        field('Get loud', 'attack', 0, 0.3, 0.001, seconds),
        field('Stay loud', 'hold', 0, 1, 0.005, seconds),
        field('Fade out', 'fade', 0.005, 1.5, 0.005, seconds),
        field('Volume', 'volume', 0, 100, 1, pct),
      ),
      group('Texture',
        field('Wobble speed', 'wobble', 0, 40, 0.5, (v) => (v === 0 ? 'None' : `${v} a second`)),
        field('Wobble amount', 'wobbleDepth', 0, 100, 1, pct),
        field('Muffle', 'muffle', 0, 100, 1, pct, 'Like hearing it through a wall.'),
        field('Crunch', 'crunch', 0, 100, 1, pct, 'Rough and old-fashioned.'),
        field('Echo', 'echo', 0, 100, 1, pct),
      ),
    )
  }

  const stopFit = fitCanvas(canvas, (w, hh, rr) => {
    cssW = w
    cssH = hh
    ratio = rr
    drawWave()
  })
  changed()
  renderControls()
  updateUndo()

  return {
    destroy() {
      cancelAnimationFrame(raf)
      playing?.stop()
      stopFit()
    },
  }
}
