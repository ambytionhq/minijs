/** @import { Action, Direction, SettableProp, TextPart, TextPosition } from '@minijs/lang' */
/** @import { Catalog } from '../catalog.js' */
/** @import { TextLayer } from '../text.js' */
import { formatNumber } from '../text.js'
/** @import { ActionFn, NumFn } from './context.js' */
import { eachTarget } from './context.js'
import { EMIT_WHERE } from '../particles.js'
import { lowerExpr } from './expr.js'

/**
 * @param {Direction} dir
 * @returns {{ horizontal: boolean; sign: number }}
 */
function axisSign(dir) {
  switch (dir) {
    case 'left':
      return { horizontal: true, sign: -1 }
    case 'right':
      return { horizontal: true, sign: 1 }
    case 'up':
      return { horizontal: false, sign: -1 }
    case 'down':
      return { horizontal: false, sign: 1 }
  }
}

/**
 * @param {readonly Action[]} actions
 * @param {Catalog} catalog
 * @param {TextLayer} text
 * @returns {ActionFn}
 */
export function lowerActions(actions, catalog, text) {
  const fns = actions.map((a) => lowerAction(a, catalog, text))
  const n = fns.length
  if (n === 1) return fns[0]
  return (c) => {
    for (let i = 0; i < n; i++) fns[i](c)
  }
}

/**
 * @param {Action} action
 * @param {Catalog} catalog
 * @param {TextLayer} text
 * @returns {ActionFn}
 */
export function lowerAction(action, catalog, text) {
  switch (action.kind) {
    case 'move': {
      const amount = lowerExpr(action.amount, catalog)
      const { horizontal, sign } = axisSign(action.dir)
      return eachTarget(
        catalog.typeId(action.thing),
        horizontal
          ? (c, id) => {
              c.world.mx[id] = c.world.mx[id] + sign * amount(c)
            }
          : (c, id) => {
              c.world.my[id] = c.world.my[id] + sign * amount(c)
            },
      )
    }
    case 'push': {
      const amount = lowerExpr(action.amount, catalog)
      const { horizontal, sign } = axisSign(action.dir)
      return eachTarget(
        catalog.typeId(action.thing),
        horizontal
          ? (c, id) => {
              c.world.vx[id] = c.world.vx[id] + sign * amount(c)
            }
          : (c, id) => {
              c.world.vy[id] = c.world.vy[id] + sign * amount(c)
            },
      )
    }
    case 'halt':
      return eachTarget(catalog.typeId(action.thing), (c, id) => {
        c.world.vx[id] = 0
        c.world.vy[id] = 0
      })
    case 'setVar': {
      const slot = catalog.varId(action.name)
      const value = lowerExpr(action.value, catalog)
      return (c) => {
        c.vars[slot] = value(c)
      }
    }
    case 'addVar': {
      const slot = catalog.varId(action.name)
      const amount = lowerExpr(action.amount, catalog)
      return (c) => {
        c.vars[slot] = c.vars[slot] + amount(c)
      }
    }
    case 'subtractVar': {
      const slot = catalog.varId(action.name)
      const amount = lowerExpr(action.amount, catalog)
      return (c) => {
        c.vars[slot] = c.vars[slot] - amount(c)
      }
    }
    case 'setProp':
      return lowerSetProp(catalog.typeId(action.thing), action.prop, lowerExpr(action.value, catalog))
    case 'make': {
      const t = catalog.typeId(action.thing)
      const x = lowerExpr(action.x, catalog)
      const y = lowerExpr(action.y, catalog)
      return (c) => c.world.queueSpawn(t, x(c), y(c))
    }
    case 'remove':
      return eachTarget(catalog.typeId(action.thing), (c, id) => c.world.queueRemove(id))
    case 'changeLook': {
      const look = catalog.lookId(action.look)
      return eachTarget(catalog.typeId(action.thing), (c, id) => {
        c.world.look[id] = look
        c.world.anim[id] = -1
      })
    }
    case 'playAnimation': {
      const t = catalog.typeId(action.thing)
      const animation = catalog.animationId(t, action.animation)
      return eachTarget(t, (c, id) => {
        if (c.world.anim[id] === animation) return
        c.world.anim[id] = animation
        c.world.animTicks[id] = 0
      })
    }
    case 'stopAnimation':
      return eachTarget(catalog.typeId(action.thing), (c, id) => {
        c.world.anim[id] = -1
      })
    case 'log':
      return lowerLog(action.parts, catalog)
    case 'showText':
      return lowerShowText(action.parts, action.at, action.color, catalog, text)
    case 'playSound':
      return lowerPlaySound(action, catalog)
    case 'playMusic': {
      const name = action.name
      return (c) => c.audio.playMusic(name)
    }
    case 'stopMusic':
      return (c) => c.audio.stopMusic()
    case 'setVolume': {
      const value = lowerExpr(action.value, catalog)
      const channel = action.channel
      return (c) => c.audio.setVolume(channel, Math.max(0, Math.min(100, value(c))) / 100)
    }
    case 'burst': {
      const effect = catalog.particleIds.get(action.name) ?? 0
      if (!catalog.particleIds.has(action.name)) return () => {}
      if (action.thing !== null) {
        return eachTarget(catalog.typeId(action.thing), (c, id) => {
          c.particles.burst(effect, c.world.x[id] + c.world.w[id] / 2, c.world.y[id] + c.world.h[id] / 2)
        })
      }
      const x = lowerExpr(/** @type {import('@minijs/lang').Expr} */ (action.x), catalog)
      const y = lowerExpr(/** @type {import('@minijs/lang').Expr} */ (action.y), catalog)
      return (c) => c.particles.burst(effect, x(c), y(c))
    }
    case 'startParticles': {
      const effect = catalog.particleIds.get(action.name) ?? 0
      if (!catalog.particleIds.has(action.name)) return () => {}
      if (action.where === 'thing') {
        return eachTarget(catalog.typeId(/** @type {string} */ (action.thing)), (c, id) => {
          c.particles.start(effect, EMIT_WHERE.thing, id, 0, 0)
        })
      }
      if (action.where === 'screen') return (c) => c.particles.start(effect, EMIT_WHERE.screen, -1, 0, 0)
      const x = lowerExpr(/** @type {import('@minijs/lang').Expr} */ (action.x), catalog)
      const y = lowerExpr(/** @type {import('@minijs/lang').Expr} */ (action.y), catalog)
      return (c) => c.particles.start(effect, EMIT_WHERE.point, -1, x(c), y(c))
    }
    case 'stopParticles': {
      const effect = catalog.particleIds.get(action.name) ?? 0
      if (!catalog.particleIds.has(action.name)) return () => {}
      if (action.thing === null) return (c) => c.particles.stop(effect, -1)
      return eachTarget(catalog.typeId(action.thing), (c, id) => c.particles.stop(effect, id))
    }
    case 'setState': {
      const state = catalog.stateId(action.thing, action.state)
      const m = catalog.machineIndex(action.thing)
      if (action.thing === null) {
        return (c) => {
          const machine = c.machines.machines[m]
          if (machine.gameState !== state) machine.go(c, -1, state)
        }
      }
      return eachTarget(catalog.typeId(action.thing), (c, id) => {
        if (c.world.state[id] !== state) c.machines.machines[m].go(c, id, state)
      })
    }
    case 'setTile': {
      if (action.tile !== null) catalog.tileNameId(action.tile, action.loc)
      const name = action.tile
      if (action.x === null || action.y === null) {
        // `the tile`: the one this rule touched.
        return (c) => {
          if (c.hitMap < 0) return
          const map = c.tiles.maps[c.hitMap]
          const id = name === null ? -1 : (map.idByName.get(name) ?? -2)
          if (id !== -2) c.tiles.setCell(c.hitMap, c.hitLayer, c.hitCol, c.hitRow, id)
        }
      }
      const x = lowerExpr(action.x, catalog)
      const y = lowerExpr(action.y, catalog)
      return (c) => c.tiles.setAt(x(c), y(c), name)
    }
    case 'showTilemap': {
      const name = action.name
      const show = action.show
      return (c) => {
        const index = c.tiles.mapIndex(name)
        if (index >= 0) c.tiles.setVisible(index, show)
      }
    }
    case 'switchTilemap': {
      const name = action.name
      return (c) => c.control.switchTilemap(name)
    }
    case 'stopGame':
      return (c) => c.control.stop()
    case 'restartGame':
      return (c) => c.control.restart()
  }
}

/**
 * @param {Extract<Action, { kind: 'playSound' }>} action
 * @param {Catalog} catalog
 * @returns {ActionFn}
 */
function lowerPlaySound(action, catalog) {
  const name = action.name
  const volume = action.volume ? lowerExpr(action.volume, catalog) : null
  const pitch = action.pitch ? lowerExpr(action.pitch, catalog) : null
  const from = action.from === null ? -1 : catalog.typeId(action.from)
  return (c) => {
    const v = volume === null ? 1 : Math.max(0, volume(c)) / 100
    const p = pitch === null ? 1 : Math.max(1, pitch(c)) / 100
    if (from < 0) {
      c.audio.playSound(name, v, p, 0)
      return
    }
    // Far-off things sound quieter, and come from their side of the screen.
    const id = c.resolve(from)
    if (id < 0) {
      c.audio.playSound(name, v, p, 0)
      return
    }
    const dx = c.world.x[id] + c.world.w[id] / 2 - (c.camera.x + c.screenWidth / 2)
    const dy = c.world.y[id] + c.world.h[id] / 2 - (c.camera.y + c.screenHeight / 2)
    const reach = Math.max(c.screenWidth, c.screenHeight)
    const distance = Math.min(1, Math.hypot(dx, dy) / (reach * 1.25))
    const pan = Math.max(-1, Math.min(1, dx / (c.screenWidth / 2)))
    c.audio.playSound(name, v * (1 - distance), p, pan * 0.8)
  }
}

/**
 * @param {number} t
 * @param {SettableProp} prop
 * @param {NumFn} value
 * @returns {ActionFn}
 */
function lowerSetProp(t, prop, value) {
  switch (prop) {
    case 'x':
      // Teleports snap: previous position follows so rendering does not smear.
      return eachTarget(t, (c, id) => {
        const v = value(c)
        c.world.x[id] = v
        c.world.prevX[id] = v
      })
    case 'y':
      return eachTarget(t, (c, id) => {
        const v = value(c)
        c.world.y[id] = v
        c.world.prevY[id] = v
      })
    case 'vx':
      return eachTarget(t, (c, id) => {
        c.world.vx[id] = value(c)
      })
    case 'vy':
      return eachTarget(t, (c, id) => {
        c.world.vy[id] = value(c)
      })
  }
}

/**
 * @param {readonly TextPart[]} parts
 * @param {TextPosition | null} at
 * @param {string} color
 * @param {Catalog} catalog
 * @param {TextLayer} text
 * @returns {ActionFn}
 */
function lowerShowText(parts, at, color, catalog, text) {
  /** @type {string[]} */
  const literals = []
  /** @type {NumFn[]} */
  const values = []
  // Normalize to: literal0 value0 literal1 value1 ... literalN
  let pending = ''
  for (const part of parts) {
    if (part.kind === 'literal') {
      pending += part.text
    } else {
      literals.push(pending)
      pending = ''
      values.push(lowerExpr(part.expr, catalog))
    }
  }
  literals.push(pending)

  const slotIndex = text.addSlot(values.length)
  const x = at ? lowerExpr(at.x, catalog) : null
  const y = at ? lowerExpr(at.y, catalog) : null
  const valueCount = values.length

  return (c) => {
    const slot = c.text.slots[slotIndex]
    let changed = !slot.visible
    for (let i = 0; i < valueCount; i++) {
      const v = values[i](c)
      if (v !== slot.values[i]) {
        slot.values[i] = v
        changed = true
      }
    }
    if (changed) {
      let s = literals[0]
      for (let i = 0; i < valueCount; i++) s += formatNumber(slot.values[i]) + literals[i + 1]
      slot.text = s
    }
    slot.visible = true
    slot.color = color
    if (x !== null && y !== null) {
      slot.centered = false
      slot.x = x(c)
      slot.y = y(c)
    } else {
      slot.centered = true
    }
  }
}

/**
 * `log "..."`: builds the line and hands it to the host (the playground console).
 * Allocates a string per run, which is fine for a debugging tool.
 * @param {TextPart[]} parts
 * @param {Catalog} catalog
 * @returns {ActionFn}
 */
function lowerLog(parts, catalog) {
  const pieces = parts.map((p) => (p.kind === 'literal' ? p.text : lowerExpr(p.expr, catalog)))
  return (c) => {
    let s = ''
    for (const piece of pieces) s += typeof piece === 'string' ? piece : formatNumber(piece(c))
    c.control.log(s)
  }
}
