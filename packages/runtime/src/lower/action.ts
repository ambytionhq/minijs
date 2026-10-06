import type { Action, Direction, SettableProp, TextPart, TextPosition } from '@minijs/lang'
import type { Catalog } from '../catalog.ts'
import { formatNumber, type TextLayer } from '../text.ts'
import { eachTarget, type ActionFn, type NumFn } from './context.ts'
import { lowerExpr } from './expr.ts'

function axisSign(dir: Direction): { horizontal: boolean; sign: number } {
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

export function lowerActions(actions: readonly Action[], catalog: Catalog, text: TextLayer): ActionFn {
  const fns = actions.map((a) => lowerAction(a, catalog, text))
  const n = fns.length
  if (n === 1) return fns[0]!
  return (c) => {
    for (let i = 0; i < n; i++) fns[i]!(c)
  }
}

export function lowerAction(action: Action, catalog: Catalog, text: TextLayer): ActionFn {
  switch (action.kind) {
    case 'move': {
      const amount = lowerExpr(action.amount, catalog)
      const { horizontal, sign } = axisSign(action.dir)
      return eachTarget(
        catalog.typeId(action.thing),
        horizontal
          ? (c, id) => {
              c.world.mx[id] = c.world.mx[id]! + sign * amount(c)
            }
          : (c, id) => {
              c.world.my[id] = c.world.my[id]! + sign * amount(c)
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
              c.world.vx[id] = c.world.vx[id]! + sign * amount(c)
            }
          : (c, id) => {
              c.world.vy[id] = c.world.vy[id]! + sign * amount(c)
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
        c.vars[slot] = c.vars[slot]! + amount(c)
      }
    }
    case 'subtractVar': {
      const slot = catalog.varId(action.name)
      const amount = lowerExpr(action.amount, catalog)
      return (c) => {
        c.vars[slot] = c.vars[slot]! - amount(c)
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
    case 'showText':
      return lowerShowText(action.parts, action.at, action.color, catalog, text)
    case 'stopGame':
      return (c) => c.control.stop()
    case 'restartGame':
      return (c) => c.control.restart()
  }
}

function lowerSetProp(t: number, prop: SettableProp, value: NumFn): ActionFn {
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

function lowerShowText(
  parts: readonly TextPart[],
  at: TextPosition | null,
  color: string,
  catalog: Catalog,
  text: TextLayer,
): ActionFn {
  const literals: string[] = []
  const values: NumFn[] = []
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
    const slot = c.text.slots[slotIndex]!
    let changed = !slot.visible
    for (let i = 0; i < valueCount; i++) {
      const v = values[i]!(c)
      if (v !== slot.values[i]) {
        slot.values[i] = v
        changed = true
      }
    }
    if (changed) {
      let s = literals[0]!
      for (let i = 0; i < valueCount; i++) s += formatNumber(slot.values[i]!) + literals[i + 1]!
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
