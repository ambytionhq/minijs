// The particle editor. Click the big picture to set off the effect and watch it change
// as you move the sliders. Uses the same code as the game, so what you see is what you get.

import { DEFAULT_PARTICLES, PARTICLE_PRESETS } from '@minijs/lang'
import { Canvas2DRenderer, ParticleSystem, parseParticles, stringifyAsset } from '@minijs/runtime'
import { assetName, choice, createHistory, cssColor, fill, fitCanvas, group, h, iconButton, prefersReducedMotion, slider, textButton, toggle, usageStrip, wireUndoKeys } from './ui.js'

/** @import { ParticleSettings } from '@minijs/lang' */
/** @import { Tool, ToolContext } from './index.js' */

const BACKDROPS = [
  { value: '#101218', label: 'Night' },
  { value: '#7cc7ef', label: 'Sky' },
  { value: '#3f7a3f', label: 'Grass' },
  { value: '#f2f4f3', label: 'Paper' },
]

/** Nice colors for "Surprise me". */
const SURPRISE_COLORS = [
  ['#fff6c2', '#ffd24a'],
  ['#ffffff', '#9fe6ff', '#6f8cff'],
  ['#fff0a8', '#ff9a2e', '#d6371f'],
  ['#e38bb4', '#8d5fb5'],
  ['#c9e265', '#3f7a3f'],
  ['#ffffff', '#c4cdd5', '#5e6a7d'],
]

/**
 * @param {HTMLElement} host
 * @param {string} text
 * @param {ToolContext} ctx
 * @returns {Tool}
 */
export function openParticlesTool(host, text, ctx) {
  /** @type {ParticleSettings} */
  let fx = parseParticles(text) ?? { ...DEFAULT_PARTICLES, ...PARTICLE_PRESETS.sparkle }
  /** @type {'burst' | 'steady' | 'follow'} */
  let mode = 'burst'
  let backdrop = BACKDROPS[0].value
  let system = new ParticleSystem([fx])
  let viewW = 0
  let viewH = 0
  let scaleUp = 2
  let pointerX = 0
  let pointerY = 0
  let raf = 0
  let lastBurst = 0

  const serialize = () => stringifyAsset({ minijs: 'particles', version: 1, ...fx })
  const history = createHistory(serialize(), (state) => {
    fx = /** @type {ParticleSettings} */ (parseParticles(state))
    rebuild()
    renderControls()
    ctx.save(state)
    fireOnce()
  }, () => updateUndo())

  /** Save and show the change. */
  const commit = () => {
    const state = serialize()
    history.push(state)
    ctx.save(state)
  }

  /** Update the effect while a slider moves. */
  const live = () => {
    rebuild()
    if (mode === 'burst') fireOnce()
  }

  function rebuild() {
    system = new ParticleSystem([fx])
    applyMode()
  }

  const canvas = h('canvas', { class: 'fx-canvas', 'aria-label': 'Preview. Click to set off the effect.' })
  const box = h('div', { class: 'fx-box', style: { background: backdrop } }, canvas)
  const renderer = new Canvas2DRenderer(canvas, 240, 160, false)

  const fireOnce = () => {
    const now = performance.now()
    if (now - lastBurst < 110) return
    lastBurst = now
    system.burst(0, viewW / 2, viewH / 2)
  }

  function applyMode() {
    system.emitterCount = 0
    if (mode === 'steady') system.start(0, 1, -1, viewW / 2, viewH / 2)
    if (mode === 'follow') system.start(0, 1, -1, pointerX || viewW / 2, pointerY || viewH / 2)
  }

  canvas.addEventListener('pointerdown', (e) => {
    const { x, y } = toView(e)
    if (mode === 'burst') system.burst(0, x, y)
    pointerX = x
    pointerY = y
    if (mode === 'follow') {
      system.emitterX[0] = x
      system.emitterY[0] = y
    }
  })
  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = toView(e)
    pointerX = x
    pointerY = y
    if (mode === 'follow') {
      system.emitterX[0] = x
      system.emitterY[0] = y
    }
    if (mode === 'burst' && e.buttons !== 0) system.burst(0, x, y)
  })

  /** @param {PointerEvent} e */
  function toView(e) {
    const rect = canvas.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * viewW, y: ((e.clientY - rect.top) / rect.height) * viewH }
  }

  const fakeWorld = /** @type {any} */ ({ alive: new Uint8Array(1), x: [0], y: [0], w: [0], h: [0] })
  const fakeCamera = /** @type {any} */ ({ x: 0, y: 0, prevX: 0, prevY: 0 })
  let accumulator = 0
  let last = 0
  /** @param {number} now */
  function frame(now) {
    raf = requestAnimationFrame(frame)
    if (document.visibilityState !== 'visible' || viewW === 0) return
    const delta = last === 0 ? 16 : Math.min(100, now - last)
    last = now
    accumulator += delta
    while (accumulator >= 1000 / 60) {
      system.step(fakeWorld, fakeCamera, viewW, viewH)
      accumulator -= 1000 / 60
    }
    // Set it off again and again, so a change is always on show.
    if (mode === 'burst' && system.count === 0 && !prefersReducedMotion()) fireOnce()
    renderer.begin(backdrop)
    system.draw(renderer, 0, 0, viewW, viewH, 0)
  }

  const stopFit = fitCanvas(canvas, (w, hh, ratio) => {
    scaleUp = w > 480 ? 2.5 : 2
    viewW = Math.round(w / scaleUp)
    viewH = Math.round(hh / scaleUp)
    renderer.width = viewW
    renderer.height = viewH
    renderer.pixelArt = false
    renderer.scale = scaleUp * ratio
    // fitCanvas owns the canvas size, so the renderer draws straight onto it.
    applyMode()
  })

  const undoButton = iconButton('arrow-u-up-left', 'Undo (Ctrl or Cmd + Z)', () => history.undo())
  const redoButton = iconButton('arrow-u-up-right', 'Redo', () => history.redo())
  function updateUndo() {
    undoButton.disabled = !history.canUndo
    redoButton.disabled = !history.canRedo
  }

  const toolbar = h('div', { class: 'tool-toolbar', role: 'toolbar', 'aria-label': 'Preview settings' },
    choice({
      label: 'How to play it',
      hideLabel: true,
      value: mode,
      options: [
        { value: 'burst', label: 'Burst', title: 'One pop, like: burst sparkle on the coin' },
        { value: 'steady', label: 'Steady', title: 'Keeps going, like: start smoke on the chimney' },
        { value: 'follow', label: 'Follow', title: 'Keeps going and follows your pointer' },
      ],
      onChange: (v) => {
        mode = v
        applyMode()
      },
    }),
    h('span', { class: 'tool-toolbar-gap' }),
    choice({
      label: 'Background',
      hideLabel: true,
      value: backdrop,
      options: BACKDROPS.map((b) => ({ value: b.value, label: b.label })),
      onChange: (v) => {
        backdrop = v
        box.style.background = v
      },
    }),
    h('span', { class: 'tool-toolbar-gap' }),
    undoButton,
    redoButton,
  )

  const presets = h('div', { class: 'preset-grid' },
    ...Object.keys(PARTICLE_PRESETS).map((name) => textButton(name, () => {
      fx = { ...PARTICLE_PRESETS[name] }
      commit()
      rebuild()
      renderControls()
      fireOnce()
    })),
    textButton('Surprise me', surprise, { icon: 'dice-five', primary: true }),
  )

  function surprise() {
    const r = (/** @type {number} */ a, /** @type {number} */ b) => a + Math.random() * (b - a)
    const up = Math.random() < 0.5
    fx = {
      ...fx,
      amount: Math.round(r(8, 50)),
      rate: Math.round(r(10, 70)),
      life: [Number(r(0.2, 0.6).toFixed(2)), Number(r(0.7, 1.6).toFixed(2))],
      speed: [Math.round(r(5, 40)), Math.round(r(50, 160))],
      direction: up ? 90 : 0,
      spread: up ? Math.round(r(20, 120)) : 360,
      gravity: Math.round(r(-60, 120)),
      drag: Number(r(0, 0.8).toFixed(2)),
      size: [Math.round(r(2, 7)), Math.round(r(0, 3))],
      colors: SURPRISE_COLORS[Math.floor(Math.random() * SURPRISE_COLORS.length)],
      shape: /** @type {const} */ (['square', 'circle', 'spark'])[Math.floor(Math.random() * 3)],
      glow: Math.random() < 0.5,
    }
    commit()
    rebuild()
    renderControls()
    fireOnce()
  }

  const controls = h('aside', { class: 'tool-column fx-controls' })
  const usage = h('div', { class: 'tool-usage-host' })
  const name = assetName(ctx.path.split('/').pop() ?? 'effect')
  usage.append(usageStrip(ctx, `particles ${name} "${ctx.usableName(ctx.path)}"`, [
    `burst ${name} on the coin`,
    `start ${name} on the player`,
    `stop ${name} on the player`,
    `start ${name} on the screen`,
  ]))

  const root = h('div', { class: 'tool particles-tool', tabindex: -1 },
    h('div', { class: 'tool-body fx-body' },
      h('div', { class: 'tool-column fx-middle' }, toolbar, box, group('Start from', presets)),
      controls,
    ),
    usage,
  )
  host.replaceChildren(root)
  wireUndoKeys(root, history)

  /**
   * A pair of sliders for "from this much to that much".
   * @param {string} label
   * @param {[number, number]} value
   * @param {number} min
   * @param {number} max
   * @param {number} step
   * @param {(v: number) => string} format
   * @param {(v: [number, number]) => void} put
   * @param {[string, string]} names
   * @param {string} [help]
   */
  function rangeField(label, value, min, max, step, format, put, names, help) {
    const current = /** @type {[number, number]} */ ([...value])
    return h('div', { class: 'tool-pair' },
      h('span', { class: 'tool-label', text: label }),
      slider({ label: names[0], min, max, step, value: current[0], format, onInput: (v) => { current[0] = v; put([...current]); live() }, onChange: commit }),
      slider({ label: names[1], min, max, step, value: current[1], format, onInput: (v) => { current[1] = v; put([...current]); live() }, onChange: commit }),
      help ? h('p', { class: 'tool-help', text: help }) : null,
    )
  }

  /**
   * @param {string} label
   * @param {keyof ParticleSettings} key
   * @param {number} min
   * @param {number} max
   * @param {number} step
   * @param {(v: number) => string} format
   * @param {string} [help]
   */
  function numberField(label, key, min, max, step, format, help) {
    return slider({
      label,
      min,
      max,
      step,
      value: /** @type {number} */ (fx[key]),
      format,
      help,
      onInput: (v) => {
        Object.assign(fx, { [key]: v })
        live()
      },
      onChange: commit,
    })
  }

  function directionDial() {
    const dial = h('canvas', { class: 'fx-dial', width: 96, height: 96, role: 'slider', tabIndex: 0, 'aria-label': 'Direction', 'aria-valuemin': 0, 'aria-valuemax': 359 })
    const draw = () => {
      const c = /** @type {CanvasRenderingContext2D} */ (dial.getContext('2d'))
      c.clearRect(0, 0, 96, 96)
      c.strokeStyle = cssColor('--border')
      c.lineWidth = 2
      c.beginPath()
      c.arc(48, 48, 40, 0, Math.PI * 2)
      c.stroke()
      const a = (-fx.direction * Math.PI) / 180
      const half = (Math.min(fx.spread, 360) * Math.PI) / 360
      c.fillStyle = cssColor('--accent')
      c.globalAlpha = 0.35
      c.beginPath()
      c.moveTo(48, 48)
      c.arc(48, 48, 40, a - half, a + half)
      c.closePath()
      c.fill()
      c.globalAlpha = 1
      c.strokeStyle = cssColor('--accent-label')
      c.lineWidth = 3
      c.beginPath()
      c.moveTo(48, 48)
      c.lineTo(48 + Math.cos(a) * 36, 48 + Math.sin(a) * 36)
      c.stroke()
      dial.setAttribute('aria-valuenow', String(Math.round(fx.direction)))
    }
    /** @param {PointerEvent} e */
    const aim = (e) => {
      const rect = dial.getBoundingClientRect()
      const dx = e.clientX - rect.left - rect.width / 2
      const dy = e.clientY - rect.top - rect.height / 2
      fx.direction = Math.round(((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360)
      draw()
      live()
    }
    dial.addEventListener('pointerdown', (e) => {
      dial.setPointerCapture(e.pointerId)
      aim(e)
    })
    dial.addEventListener('pointermove', (e) => {
      if (e.buttons !== 0) aim(e)
    })
    dial.addEventListener('pointerup', commit)
    dial.addEventListener('keydown', (e) => {
      const by = e.key === 'ArrowLeft' ? 15 : e.key === 'ArrowRight' ? -15 : 0
      if (by === 0) return
      e.preventDefault()
      fx.direction = (fx.direction + by + 360) % 360
      draw()
      live()
      commit()
    })
    draw()
    const spread = slider({
      label: 'Spread',
      min: 0,
      max: 360,
      step: 5,
      value: fx.spread,
      format: (v) => (v === 360 ? 'All around' : `${v} degrees`),
      onInput: (v) => {
        fx.spread = v
        draw()
        live()
      },
      onChange: commit,
    })
    return h('div', { class: 'fx-direction' }, dial, h('div', { class: 'tool-grow' }, h('span', { class: 'tool-label', text: 'Which way they fly' }), spread))
  }

  function colorsField() {
    const row = h('div', { class: 'fx-colors' })
    const draw = () => {
      fill(row,
        ...fx.colors.map((color, i) => {
          const input = h('input', {
            type: 'color',
            class: 'fx-color',
            value: toHex(color),
            'aria-label': `Color ${i + 1}`,
            onInput: () => {
              fx.colors = fx.colors.map((c, k) => (k === i ? input.value : c))
              live()
            },
            onChange: commit,
          })
          return h('span', { class: 'fx-color-wrap' },
            input,
            fx.colors.length > 1
              ? iconButton('x', `Remove color ${i + 1}`, () => {
                  fx.colors = fx.colors.filter((_, k) => k !== i)
                  commit()
                  live()
                  draw()
                })
              : null,
          )
        }),
        fx.colors.length < 6
          ? iconButton('plus', 'Add a color', () => {
              fx.colors = [...fx.colors, fx.colors[fx.colors.length - 1]]
              commit()
              live()
              draw()
            })
          : null,
      )
    }
    draw()
    return h('div', { class: 'tool-field' }, h('span', { class: 'tool-label', text: 'Colors, from birth to death' }), row)
  }

  function renderControls() {
    const seconds = (/** @type {number} */ v) => `${v.toFixed(2)} s`
    const px = (/** @type {number} */ v) => `${v} px`
    controls.replaceChildren(
      group('How many',
        numberField('In one burst', 'amount', 1, 150, 1, String),
        numberField('Each second, when steady', 'rate', 1, 200, 1, String),
      ),
      group('Look',
        colorsField(),
        choice({
          label: 'Shape',
          value: fx.shape,
          options: [
            { value: 'square', label: 'Square' },
            { value: 'circle', label: 'Circle' },
            { value: 'spark', label: 'Spark' },
          ],
          onChange: (v) => {
            fx.shape = v
            commit()
            live()
          },
        }),
        rangeField('Size', fx.size, 0, 24, 1, px, (v) => { fx.size = v }, ['At the start', 'At the end']),
        toggle({ label: 'Fade away', value: fx.fade, onChange: (v) => { fx.fade = v; commit(); live() } }),
        toggle({ label: 'Glow', value: fx.glow, help: 'Colors add up like light. Looks best on dark backgrounds.', onChange: (v) => { fx.glow = v; commit(); live() } }),
      ),
      group('Movement',
        directionDial(),
        rangeField('Speed', fx.speed, 0, 400, 1, (v) => `${v}`, (v) => { fx.speed = v }, ['Slowest', 'Fastest'], 'Pixels each second.'),
        numberField('Gravity', 'gravity', -300, 400, 5, (v) => (v === 0 ? 'None' : v < 0 ? `Floats up ${-v}` : `Falls ${v}`)),
        numberField('Air slows them', 'drag', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`),
      ),
      group('Time and place',
        rangeField('How long each one lasts', fx.life, 0.05, 6, 0.05, seconds, (v) => { fx.life = v }, ['Shortest', 'Longest']),
        rangeField('Start area', fx.area, 0, 200, 1, px, (v) => { fx.area = v }, ['Wide', 'Tall']),
      ),
    )
  }

  renderControls()
  updateUndo()
  raf = requestAnimationFrame(frame)

  return {
    destroy() {
      cancelAnimationFrame(raf)
      stopFit()
    },
  }
}

/** Any CSS color as #rrggbb, for color pickers. @param {string} color */
function toHex(color) {
  const c = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'))
  c.fillStyle = '#000000'
  c.fillStyle = color
  const value = /** @type {string} */ (c.fillStyle)
  return value.startsWith('#') ? value : '#ffffff'
}
