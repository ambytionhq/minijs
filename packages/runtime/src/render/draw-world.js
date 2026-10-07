// Draws a simulation through any Renderer, interpolating positions by alpha
// (0 = previous tick, 1 = current tick). Culls instances outside the view.

import { TICKS_PER_SECOND } from '../config.js'
/** @import { Simulation } from '../simulation.js' */
/** @import { Renderer } from './renderer.js' */

/**
 * @param {Renderer} renderer
 * @param {Simulation} sim
 * @param {number} alpha
 */
export function drawWorld(renderer, sim, alpha) {
  const world = sim.world
  const catalog = sim.catalog
  const camera = sim.camera
  const viewW = sim.program.game.width
  const viewH = sim.program.game.height
  const camX = camera.prevX + (camera.x - camera.prevX) * alpha
  const camY = camera.prevY + (camera.y - camera.prevY) * alpha

  renderer.begin(sim.program.game.background)

  for (let t = 0; t < catalog.types.length; t++) {
    const type = catalog.types[t]
    const list = world.lists[t]
    const count = world.counts[t]
    for (let i = 0; i < count; i++) {
      const id = list[i]
      const w = world.w[id]
      const h = world.h[id]
      const px = world.prevX[id]
      const py = world.prevY[id]
      const x = px + (world.x[id] - px) * alpha - camX
      const y = py + (world.y[id] - py) * alpha - camY
      if (x + w < 0 || y + h < 0 || x > viewW || y > viewH) continue

      const anim = world.anim[id]
      const animation = anim >= 0 ? type.animations[anim] : null
      if (animation !== null && animation.frames.length > 0) {
        const frames = animation.frames
        const frame = Math.floor((world.animTicks[id] * animation.fps) / TICKS_PER_SECOND) % frames.length
        renderer.image(frames[frame], x, y, w, h)
        continue
      }

      const look = catalog.looks[world.look[id]]
      switch (look.kind) {
        case 'box':
          renderer.box(x, y, w, h, look.color)
          break
        case 'circle':
          renderer.ellipse(x, y, w, h, look.color)
          break
        case 'image':
          renderer.image(look.image, x, y, w, h)
          break
      }
    }
  }

  for (const slot of sim.text.slots) {
    if (!slot.visible) continue
    if (slot.centered) renderer.text(slot.text, viewW / 2, viewH / 2, slot.color, 'center')
    else renderer.text(slot.text, slot.x, slot.y, slot.color, 'left')
  }

  renderer.end()
}
