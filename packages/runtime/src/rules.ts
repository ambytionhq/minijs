// Rule compilation. Each AST rule becomes a CompiledRule: a trigger check plus
// a lowered action list. Pre-physics rules run before physics, post-physics
// rules (touches, leaves the screen) after. Both phases keep source order.

import type { Rule, Trigger } from '@minijs/lang'
import type { Catalog } from './catalog.ts'
import type { TouchIndex, PairHandler } from './collide.ts'
import { TICKS_PER_SECOND } from './config.ts'
import { keyIndex } from './input.ts'
import { lowerActions } from './lower/action.ts'
import { lowerCondition } from './lower/condition.ts'
import type { ActionFn, BoolFn, RuleContext } from './lower/context.ts'
import type { TextLayer } from './text.ts'

export interface CompiledRule {
  readonly post: boolean
  run(c: RuleContext): void
  /** Clear per-rule state (condition edges). Called on restart. */
  reset(): void
}

function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICKS_PER_SECOND))
}

function pre(run: (c: RuleContext) => void, reset: () => void = () => {}): CompiledRule {
  return { post: false, run, reset }
}

function post(run: (c: RuleContext) => void): CompiledRule {
  return { post: true, run, reset: () => {} }
}

/** Run actions with one instance bound to its type, restoring any previous binding. */
function withBinding(c: RuleContext, typeId: number, id: number, guard: BoolFn | null, actions: ActionFn): void {
  const previous = c.bound[typeId]!
  c.bound[typeId] = id
  if (guard === null || guard(c)) actions(c)
  c.bound[typeId] = previous
}

export function compileRule(rule: Rule, catalog: Catalog, text: TextLayer, touches: TouchIndex): CompiledRule {
  const actions = lowerActions(rule.actions, catalog, text)
  return compileTrigger(rule.trigger, actions, catalog, touches)
}

function compileTrigger(trigger: Trigger, actions: ActionFn, catalog: Catalog, touches: TouchIndex): CompiledRule {
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
          ? (c: RuleContext) => c.input.isPressed(key)
          : trigger.state === 'held'
            ? (c: RuleContext) => c.input.isHeld(key)
            : (c: RuleContext) => c.input.isReleased(key)
      return pre((c) => {
        if (fired(c) && (guard === null || guard(c))) actions(c)
      })
    }
    case 'mouseClick': {
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      if (trigger.thing === null) {
        return pre((c) => {
          if (c.input.isClicked() && (guard === null || guard(c))) actions(c)
        })
      }
      const t = catalog.typeId(trigger.thing)
      return pre((c) => {
        if (!c.input.isClicked()) return
        const px = c.input.mouseX + c.camera.x
        const py = c.input.mouseY + c.camera.y
        const world = c.world
        const list = world.lists[t]!
        const count = world.counts[t]!
        for (let i = 0; i < count; i++) {
          const id = list[i]!
          if (world.removing[id] === 1) continue
          const x = world.x[id]!
          const y = world.y[id]!
          if (px >= x && px <= x + world.w[id]! && py >= y && py <= y + world.h[id]!) {
            withBinding(c, t, id, guard, actions)
          }
        }
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
      const handler: PairHandler = (c, idA, idB) => {
        const previousA = c.bound[a]!
        const previousB = c.bound[b]!
        c.bound[a] = idA
        // For `x touches x` only one binding slot exists; the first instance wins.
        if (b !== a) c.bound[b] = idB
        if (guard === null || guard(c)) actions(c)
        c.bound[a] = previousA
        c.bound[b] = previousB
      }
      return post((c) => touches.forEachPair(c, a, b, handler))
    }
    case 'leavesScreen': {
      const t = catalog.typeId(trigger.thing)
      const guard = trigger.guard ? lowerCondition(trigger.guard, catalog) : null
      return post((c) => {
        const world = c.world
        const list = world.lists[t]!
        const count = world.counts[t]!
        for (let i = 0; i < count; i++) {
          const id = list[i]!
          if (world.leftScreen[id] === 1 && world.removing[id] === 0) withBinding(c, t, id, guard, actions)
        }
      })
    }
  }
}

export class RuleSet {
  private readonly pre: CompiledRule[]
  private readonly post: CompiledRule[]
  private readonly all: CompiledRule[]

  constructor(rules: readonly Rule[], catalog: Catalog, text: TextLayer, touches: TouchIndex) {
    this.all = rules.map((r) => compileRule(r, catalog, text, touches))
    this.pre = this.all.filter((r) => !r.post)
    this.post = this.all.filter((r) => r.post)
  }

  runPre(c: RuleContext): void {
    const rules = this.pre
    for (let i = 0; i < rules.length; i++) rules[i]!.run(c)
  }

  runPost(c: RuleContext): void {
    const rules = this.post
    for (let i = 0; i < rules.length; i++) rules[i]!.run(c)
  }

  reset(): void {
    for (const rule of this.all) rule.reset()
  }
}
