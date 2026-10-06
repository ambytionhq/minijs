import type { CompareOp, Condition } from '@minijs/lang'
import type { Catalog } from '../catalog.ts'
import { keyIndex } from '../input.ts'
import type { BoolFn, NumFn } from './context.ts'
import { lowerExpr } from './expr.ts'

export function lowerCondition(condition: Condition, catalog: Catalog): BoolFn {
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

function lowerCompare(op: CompareOp, left: NumFn, right: NumFn): BoolFn {
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
