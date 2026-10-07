/** @import { Expr, InstanceProp } from '@minijs/lang' */
import { miniError } from '@minijs/lang'
/** @import { Catalog } from '../catalog.js' */
/** @import { NumFn } from './context.js' */

/**
 * @param {Expr} expr
 * @param {Catalog} catalog
 * @returns {NumFn}
 */
export function lowerExpr(expr, catalog) {
  switch (expr.kind) {
    case 'number': {
      const value = expr.value
      return () => value
    }
    case 'var': {
      const slot = catalog.varId(expr.name)
      return (c) => c.vars[slot]
    }
    case 'prop':
      return lowerProp(catalog.typeId(expr.thing), expr.prop)
    case 'count': {
      const t = catalog.typeId(expr.thing)
      return (c) => c.world.counts[t]
    }
    case 'mouse':
      return expr.axis === 'x' ? (c) => c.input.mouseX + c.camera.x : (c) => c.input.mouseY + c.camera.y
    case 'random': {
      const min = lowerExpr(expr.min, catalog)
      const max = lowerExpr(expr.max, catalog)
      return (c) => {
        let lo = Math.ceil(min(c))
        let hi = Math.floor(max(c))
        if (hi < lo) {
          const swap = lo
          lo = hi
          hi = swap
        }
        return lo + Math.floor(c.random() * (hi - lo + 1))
      }
    }
    case 'binary': {
      const left = lowerExpr(expr.left, catalog)
      const right = lowerExpr(expr.right, catalog)
      switch (expr.op) {
        case '+':
          return (c) => left(c) + right(c)
        case '-':
          return (c) => left(c) - right(c)
        case '*':
          return (c) => left(c) * right(c)
        case '/': {
          let warned = false
          const loc = expr.loc
          return (c) => {
            const divisor = right(c)
            if (divisor === 0) {
              if (!warned) {
                warned = true
                c.control.error(
                  miniError(
                    'runtime-math',
                    loc,
                    'Something got divided by zero here.',
                    'I used 0 as the answer. Check the number after the "/".',
                  ),
                )
              }
              return 0
            }
            return left(c) / divisor
          }
        }
      }
    }
  }
}

/**
 * @param {number} t
 * @param {InstanceProp} prop
 * @returns {NumFn}
 */
function lowerProp(t, prop) {
  switch (prop) {
    case 'x':
      return (c) => {
        const id = c.resolve(t)
        return id < 0 ? 0 : c.world.x[id]
      }
    case 'y':
      return (c) => {
        const id = c.resolve(t)
        return id < 0 ? 0 : c.world.y[id]
      }
    case 'vx':
      return (c) => {
        const id = c.resolve(t)
        return id < 0 ? 0 : c.world.vx[id]
      }
    case 'vy':
      return (c) => {
        const id = c.resolve(t)
        return id < 0 ? 0 : c.world.vy[id]
      }
    case 'width':
      return (c) => {
        const id = c.resolve(t)
        return id < 0 ? 0 : c.world.w[id]
      }
    case 'height':
      return (c) => {
        const id = c.resolve(t)
        return id < 0 ? 0 : c.world.h[id]
      }
  }
}
