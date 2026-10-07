// Live previews of games on project cards: a frame of the real game, which
// starts playing (with nobody at the controls) while the pointer is over it.

import { compile } from '@minijs/lang'
import { Canvas2DRenderer, ManualInput, Simulation, drawWorld } from '@minijs/runtime'
import { ProjectAssetLoader } from '../files/project-assets.js'

/** @import { ProjectFs } from '../files/project.js' */

/**
 * @param {HTMLCanvasElement} canvas inside a sized box
 * @param {ProjectFs} fs
 * @param {string} path
 * @param {{ warmTicks?: number }} [options]
 * @returns {Promise<{ play: () => void; pause: () => void; destroy: () => void } | null>} null when the game has problems
 */
export async function createPreview(canvas, fs, path, { warmTicks = 40 } = {}) {
  const { program } = compile(await fs.readText(path))
  if (!program) return null
  const sim = await Simulation.create(program, {
    input: new ManualInput(),
    assets: new ProjectAssetLoader(fs, path),
    random: mulberry(7),
  })
  const { width, height, pixelArt } = program.game
  const renderer = new Canvas2DRenderer(canvas, width, height, pixelArt)
  const box = /** @type {HTMLElement} */ (canvas.parentElement)
  // Letterbox in the game's own sky color, so the preview fills the card.
  box.style.background = program.game.background
  const fit = () => {
    const rect = box.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) renderer.resize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2))
    drawWorld(renderer, sim, 1)
  }
  for (let i = 0; i < warmTicks; i++) sim.tick()
  fit()
  const observer = new ResizeObserver(fit)
  observer.observe(box)

  let raf = 0
  let last = 0
  /** @param {number} now */
  const frame = (now) => {
    // Fixed 60 ticks a second, like the real game, however fast the screen is.
    const steps = last === 0 ? 1 : Math.min(4, Math.round((now - last) / (1000 / 60)))
    last = now
    for (let i = 0; i < steps; i++) sim.tick()
    drawWorld(renderer, sim, 1)
    raf = requestAnimationFrame(frame)
  }
  return {
    play() {
      if (raf || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      last = 0
      raf = requestAnimationFrame(frame)
    },
    pause() {
      cancelAnimationFrame(raf)
      raf = 0
    },
    destroy() {
      cancelAnimationFrame(raf)
      observer.disconnect()
    },
  }
}

/** Small seeded random, so previews look the same every time. @param {number} seed */
function mulberry(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
