/** @import { CompareOp, Condition } from '@minijs/lang' */
/** @import { Catalog } from '../catalog.js' */
import { keyIndex, mouseIndex, padIndex } from '../input.js'
import { instanceUnderPointer } from './context.js'
/** @import { BoolFn, NumFn } from './context.js' */
import { lowerExpr } from './expr.js'

/**
 * @param {Condition} condition
 * @param {Catalog} catalog
 * @returns {BoolFn}
 */
export function lowerCondition(condition, catalog) {
  switch (condition.kind) {
    case 'compare':
      return lowerCompare(condition.op, lowerExpr(condition.left, catalog), lowerExpr(condition.right, catalog))
    case 'onGround': {
      const t = catalog.typeId(condition.thing)
      return (c) => {
        const id = c.resolve(t)
        return id >= 0 && c.world.onGround[id] === 1
      }
    }
    case 'keyHeld': {
      const key = keyIndex(condition.key)
      return (c) => c.input.isHeld(key)
    }
    case 'mouseHeld': {
      const i = mouseIndex(condition.button)
      return (c) => c.input.mouse.held[i] === 1
    }
    case 'mouseOver': {
      const t = catalog.typeId(condition.thing)
      return (c) => instanceUnderPointer(c, t) >= 0
    }
    case 'padHeld': {
      const i = padIndex(condition.pad, condition.button)
      return (c) => c.input.pads.held[i] === 1
    }
    case 'controlHeld': {
      const i = catalog.controlId(condition.name)
      return (c) => c.controls.held[i] === 1
    }
    case 'and': {
      const left = lowerCondition(condition.left, catalog)
      const right = lowerCondition(condition.right, catalog)
      return (c) => left(c) && right(c)
    }
    case 'or': {
      const left = lowerCondition(condition.left, catalog)
      const right = lowerCondition(condition.right, catalog)
      return (c) => left(c) || right(c)
    }
    case 'not': {
      const operand = lowerCondition(condition.operand, catalog)
      return (c) => !operand(c)
    }
  }
}

/**
 * @param {CompareOp} op
 * @param {NumFn} left
 * @param {NumFn} right
 * @returns {BoolFn}
 */
function lowerCompare(op, left, right) {
  switch (op) {
    case 'is':
      return (c) => left(c) === right(c)
    case 'isNot':
      return (c) => left(c) !== right(c)
    case 'above':
      return (c) => left(c) > right(c)
    case 'below':
      return (c) => left(c) < right(c)
  }
}
