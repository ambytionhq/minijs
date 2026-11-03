// Rule compilation. Each AST rule becomes a CompiledRule: a trigger check plus
// a lowered action list. Pre-physics rules run before physics, post-physics
// rules (touches, leaves the screen) after. Both phases keep source order.

/** @import { Rule, Trigger } from '@minijs/lang' */
/** @import { MachineSet } from './machines.js' */
/** @import { Catalog } from './catalog.js' */
/** @import { TouchIndex, PairHandler } from './collide.js' */
import { TICKS_PER_SECOND } from './config.js'
import { keyIndex, mouseIndex, padIndex } from './input.js'
import { lowerActions } from './lower/action.js'
import { lowerCondition } from './lower/condition.js'
/** @import { ActionFn, BoolFn, RuleContext } from './lower/context.js' */
/** @import { TextLayer } from './text.js' */

/**
 * @typedef {object} CompiledRule
 * @property {boolean} post
 * @property {(c: RuleContext) => void} run
 * @property {() => void} reset Clear per-rule state (condition edges). Called on restart.
 */

/**
 * @param {number} seconds
 * @returns {number}
 */
function secondsToTicks(seconds) {
  return Math.max(1, Math.round(seconds * TICKS_PER_SECOND))
}

/**
 * @param {(c: RuleContext) => void} run
 * @param {() => void} [reset=() => {}]
 * @returns {CompiledRule}
 */
function pre(run, reset = () => {}) {
  return { post: false, run, reset }
}

/**
 * @param {(c: RuleContext) => void} run
 * @returns {CompiledRule}
 */
function post(run) {
  return { post: true, run, reset: () => {} }
}

/**
 * Run actions with one instance bound to its type, restoring any previous binding.
 * @param {RuleContext} c
 * @param {number} typeId
 * @param {number} id
 * @param {BoolFn | null} guard
 * @param {ActionFn} actions
 */
export function withBinding(c, typeId, id, guard, actions) {
  const previous = c.bound[typeId]
  c.bound[typeId] = id
  if (guard === null || guard(c)) actions(c)
  c.bound[typeId] = previous
}

/**
 * @param {Rule} rule
 * @param {Catalog} catalog
 * @param {TextLayer} text
 * @param {TouchIndex} touches
 * @param {MachineSet | null} [machines]
 * @returns {CompiledRule}
 */
export function compileRule(rule, catalog, text, touches, machines = null) {
  const actions = lowerActions(rule.actions, catalog, text)
  return compileTrigger(rule.trigger, actions, catalog, touches, machines)
}

/**
 * @param {Trigger} trigger
 * @param {ActionFn} actions
 * @param {Catalog} catalog
 * @param {TouchIndex} touches
 * @param {MachineSet | null} [machines]
 * @returns {CompiledRule}
 */
export function compileTrigger(trigger, actions, catalog, touches, machines = null) {
  switch (trigger.kind) {
    case 'gameStarts': {
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      return pre((c) => {
        if (c.tick === 0 && (guard === null || guard(c))) actions(c)
      })
    }
    case 'always':
      return pre(actions)
    case 'key': {
      const key = keyIndex(trigger.key)
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      const fired =
        trigger.state === 'pressed'
          ? (c) => c.input.isPressed(key)
          : trigger.state === 'held'
            ? (c) => c.input.isHeld(key)
            : (c) => c.input.isReleased(key)
      return pre((c) => {
        if (fired(c) && (guard === null || guard(c))) actions(c)
      })
    }
    case 'mouseClick': {
      const i = mouseIndex(trigger.button)
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      const states = trigger.state
      if (trigger.thing === null) {
        return pre((c) => {
          if (c.input.mouse[states][i] === 1 && (guard === null || guard(c))) actions(c)
        })
      }
      const t = catalog.typeId(trigger.thing)
      return pre((c) => {
        if (c.input.mouse[states][i] !== 1) return
        // Every instance under the pointer, top to bottom of the list.
        const world = c.world
        const list = world.lists[t]
        const count = world.counts[t]
        const px = c.input.mouseX + c.camera.x
        const py = c.input.mouseY + c.camera.y
        for (let k = 0; k < count; k++) {
          const id = list[k]
          if (world.removing[id] === 1) continue
          const x = world.x[id]
          const y = world.y[id]
          if (px >= x && px <= x + world.w[id] && py >= y && py <= y + world.h[id]) {
            withBinding(c, t, id, guard, actions)
          }
        }
      })
    }
    case 'pad': {
      const i = padIndex(trigger.pad, trigger.button)
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      const field = trigger.state
      return pre((c) => {
        if (c.input.pads[field][i] === 1 && (guard === null || guard(c))) actions(c)
      })
    }
    case 'control': {
      const i = catalog.controlId(trigger.name)
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      const field = trigger.state
      return pre((c) => {
        if (c.controls[field][i] === 1 && (guard === null || guard(c))) actions(c)
      })
    }
    case 'every': {
      const period = secondsToTicks(trigger.seconds)
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      return pre((c) => {
        if (c.tick > 0 && c.tick % period === 0 && (guard === null || guard(c))) actions(c)
      })
    }
    case 'after': {
      const at = secondsToTicks(trigger.seconds)
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      return pre((c) => {
        if (c.tick === at && (guard === null || guard(c))) actions(c)
      })
    }
    case 'condition': {
      const condition = lowerCondition(trigger.condition, catalog)
      let was = false
      return pre(
        (c) => {
          const now = condition(c)
          if (now && !was) actions(c)
          was = now
        },
        () => {
          was = false
        },
      )
    }
    case 'touch': {
      const a = catalog.typeId(trigger.a)
      const b = catalog.typeId(trigger.b)
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      /** @type {PairHandler} */
      const handler = (c, idA, idB) => {
        const previousA = c.bound[a]
        const previousB = c.bound[b]
        c.bound[a] = idA
        // For `x touches x` only one binding slot exists; the first instance wins.
        if (b !== a) c.bound[b] = idB
        if (guard === null || guard(c)) actions(c)
        c.bound[a] = previousA
        c.bound[b] = previousB
      }
      return post((c) => touches.forEachPair(c, a, b, handler))
    }
    case 'touchTile': {
      const t = catalog.typeId(trigger.thing)
      const nameId = trigger.tile === null ? -1 : catalog.tileNameId(trigger.tile, trigger.loc)
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      const table = catalog.tileTable
      /** @type {import('./lower/context.js').RuleContext | null} */
      let active = null
      /** @type {number} */
      let activeId = -1
      /**
       * @param {number} m
       * @param {number} l
       * @param {number} col
       * @param {number} row
       * @param {number} id
       */
      const visit = (m, l, col, row, id) => {
        if (nameId !== -1 && table[id].nameId !== nameId) return false
        const c = /** @type {import('./lower/context.js').RuleContext} */ (active)
        c.hitMap = m
        c.hitLayer = l
        c.hitCol = col
        c.hitRow = row
        withBinding(c, t, activeId, guard, actions)
        c.hitMap = -1
        return c.world.removing[activeId] === 1
      }
      return post((c) => {
        const world = c.world
        const list = world.lists[t]
        const count = world.counts[t]
        active = c
        for (let i = 0; i < count; i++) {
          const id = list[i]
          if (world.removing[id] === 1) continue
          activeId = id
          c.tiles.forEachTouching(world.x[id], world.y[id], world.w[id], world.h[id], visit)
        }
      })
    }
    case 'stateChange': {
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      machines?.addHook(trigger.thing, trigger.state, trigger.change, actions, guard, catalog)
      return pre(() => {})
    }
    case 'leavesScreen': {
      const t = catalog.typeId(trigger.thing)
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      return post((c) => {
        const world = c.world
        const list = world.lists[t]
        const count = world.counts[t]
        for (let i = 0; i < count; i++) {
          const id = list[i]
          if (world.leftScreen[id] === 1 && world.removing[id] === 0) withBinding(c, t, id, guard, actions)
        }
      })
    }
  }
}

export class RuleSet {
  /** @type {CompiledRule[]} */
  pre
  /** @type {CompiledRule[]} */
  post
  /** @type {CompiledRule[]} */
  all

  /**
   * @param {readonly Rule[]} rules
   * @param {Catalog} catalog
   * @param {TextLayer} text
   * @param {TouchIndex} touches
   * @param {MachineSet | null} [machines] Rules inside states run after the ones outside.
   */
  constructor(rules, catalog, text, touches, machines = null) {
    this.all = rules.map((r) => compileRule(r, catalog, text, touches, machines))
    if (machines) this.all.push(...machines.rules)
    this.pre = this.all.filter((r) => !r.post)
    this.post = this.all.filter((r) => r.post)
  }

  /** @param {RuleContext} c */
  runPre(c) {
    const rules = this.pre
    for (let i = 0; i < rules.length; i++) rules[i].run(c)
  }

  /** @param {RuleContext} c */
  runPost(c) {
    const rules = this.post
    for (let i = 0; i < rules.length; i++) rules[i].run(c)
  }

  reset() {
    for (const rule of this.all) rule.reset()
  }
}
