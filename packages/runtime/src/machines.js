// State machines. A thing's copies each have their own current state, stored in the
// world next to their position; `states game` keeps one state for the whole game.
// Every tick, states that were just reached get entered first, then normal rules run,
// then each state's `always` lines and `go to` checks. Only one `go to` per copy per tick.

/** @import { Action, MachineDecl, Rule, TransitionDecl } from '@minijs/lang' */
/** @import { Catalog } from './catalog.js' */
/** @import { TouchIndex } from './collide.js' */
/** @import { ActionFn, BoolFn, RuleContext } from './lower/context.js' */
/** @import { CompiledRule } from './rules.js' */
/** @import { TextLayer } from './text.js' */
import { TICKS_PER_SECOND } from './config.js'
import { lowerActions } from './lower/action.js'
import { lowerCondition } from './lower/condition.js'
import { eachTarget } from './lower/context.js'
import { compileTrigger, withBinding } from './rules.js'

const NOTHING = () => {}

/**
 * @typedef {object} LiveState
 * @property {string} name
 * @property {ActionFn} enter
 * @property {ActionFn} leave
 * @property {ActionFn | null} always
 * @property {Array<{ to: number; ticks: number; check: BoolFn | null }>} checks
 * @property {ActionFn[]} onEnter Rules like `when enemy enters chase`.
 * @property {ActionFn[]} onLeave
 * @property {number} firstSlot Text this state shows goes away when it is left: slots from here...
 * @property {number} endSlot ...up to here.
 */

export class Machine {
  /** @type {LiveState[]} */
  states = []
  /** Thing type, or -1 for the game. */
  type = -1
  /** The game's current state, or -1 before it starts. Things keep theirs in the world. */
  gameState = -1
  gameTicks = 0
  /** @type {TextLayer | null} */
  text = null

  /**
   * Move to a state: leave lines, then enter lines.
   * @param {RuleContext} c
   * @param {number} id the instance, or -1 for the game
   * @param {number} to
   */
  go(c, id, to) {
    if (this.type < 0) {
      const from = this.gameState
      if (from >= 0) this.runLeave(c, from)
      this.gameState = to
      this.gameTicks = 0
      this.runEnter(c, to)
      return
    }
    const world = c.world
    const from = world.state[id]
    withBinding(c, this.type, id, null, (bound) => {
      if (from >= 0) this.runLeave(bound, from)
      world.state[id] = to
      world.stateTicks[id] = 0
      this.runEnter(bound, to)
    })
  }

  /**
   * @param {RuleContext} c
   * @param {number} index
   * @private
   */
  runEnter(c, index) {
    const state = this.states[index]
    state.enter(c)
    for (let i = 0; i < state.onEnter.length; i++) state.onEnter[i](c)
  }

  /**
   * @param {RuleContext} c
   * @param {number} index
   * @private
   */
  runLeave(c, index) {
    const state = this.states[index]
    state.leave(c)
    for (let i = 0; i < state.onLeave.length; i++) state.onLeave[i](c)
    if (this.text !== null) {
      for (let i = state.firstSlot; i < state.endSlot; i++) this.text.slots[i].visible = false
    }
  }
}

export class MachineSet {
  /** @type {Machine[]} */
  machines = []
  /** Rules inside states, and `go to` lines that wait for an event, run with the normal rules. @type {CompiledRule[]} */
  rules = []

  /** @param {Catalog} catalog */
  constructor(catalog) {
    for (const decl of catalog.program.machines ?? []) {
      const machine = new Machine()
      machine.type = decl.thing === null ? -1 : catalog.typeId(decl.thing)
      this.machines.push(machine)
    }
  }

  /**
   * Second step, after rules can look machines up: turn every line into something that runs.
   * @param {Catalog} catalog
   * @param {TextLayer} text
   * @param {TouchIndex} touches
   */
  compile(catalog, text, touches) {
    const decls = catalog.program.machines ?? []
    decls.forEach((decl, m) => {
      const machine = this.machines[m]
      machine.text = text
      machine.states = decl.states.map((s) => {
        const firstSlot = text.slots.length
        const enter = actionsOrNothing(s.enter, catalog, text)
        const always = s.always.length > 0 ? lowerActions(s.always, catalog, text) : null
        const endSlot = text.slots.length
        return {
          name: s.name,
          enter,
          leave: actionsOrNothing(s.leave, catalog, text),
          always,
          checks: [],
          onEnter: [],
          onLeave: [],
          firstSlot,
          endSlot,
        }
      })
    })
    decls.forEach((decl, m) => {
      const machine = this.machines[m]
      decl.states.forEach((s, index) => {
        for (const rule of s.rules) this.rules.push(this.stateRule(rule, machine, index, catalog, text, touches))
        for (const t of s.transitions) this.addTransition(t, decl, machine, index, catalog, touches)
      })
    })
  }

  /**
   * @param {Rule} rule
   * @param {Machine} machine
   * @param {number} index
   * @param {Catalog} catalog
   * @param {TextLayer} text
   * @param {TouchIndex} touches
   * @returns {CompiledRule}
   * @private
   */
  stateRule(rule, machine, index, catalog, text, touches) {
    const actions = lowerActions(rule.actions, catalog, text)
    return compileTrigger(rule.trigger, onlyInState(machine, index, actions), catalog, touches, this)
  }

  /**
   * @param {TransitionDecl} t
   * @param {MachineDecl} decl
   * @param {Machine} machine
   * @param {number} index
   * @param {Catalog} catalog
   * @param {TouchIndex} touches
   * @private
   */
  addTransition(t, decl, machine, index, catalog, touches) {
    const to = decl.states.findIndex((s) => s.name === t.to)
    const trigger = t.trigger
    const state = machine.states[index]
    if (trigger.kind === 'after') {
      state.checks.push({
        to,
        ticks: Math.max(1, Math.round(trigger.seconds * TICKS_PER_SECOND)),
        check: trigger.guard ? lowerCondition(trigger.guard, catalog) : null,
      })
    } else if (trigger.kind === 'condition') {
      state.checks.push({ to, ticks: 0, check: lowerCondition(trigger.condition, catalog) })
    } else {
      // Something that happens, like a key press or a touch: go when it does.
      const go = machine.type < 0
        ? (/** @type {RuleContext} */ c) => {
            if (machine.gameState === index) machine.go(c, -1, to)
          }
        : eachTarget(machine.type, (c, id) => {
            if (c.world.state[id] === index) machine.go(c, id, to)
          })
      this.rules.push(compileTrigger(trigger, go, catalog, touches, this))
    }
  }

  /**
   * `when enemy enters chase`: run these lines with the state change.
   * @param {string | null} thing
   * @param {string} stateName
   * @param {'enters' | 'leaves'} change
   * @param {ActionFn} actions
   * @param {BoolFn | null} guard
   * @param {Catalog} catalog
   */
  addHook(thing, stateName, change, actions, guard, catalog) {
    const m = catalog.machineIndex(thing)
    const machine = this.machines[m]
    const state = machine.states.find((s) => s.name === stateName)
    if (!state) return
    const run = guard === null ? actions : (/** @type {RuleContext} */ c) => {
      if (guard(c)) actions(c)
    }
    if (change === 'enters') state.onEnter.push(run)
    else state.onLeave.push(run)
  }

  /**
   * Enter the first state of new copies, and of the game on its first tick.
   * @param {RuleContext} c
   */
  enterNew(c) {
    for (let m = 0; m < this.machines.length; m++) {
      const machine = this.machines[m]
      if (machine.type < 0) {
        if (machine.gameState < 0) machine.go(c, -1, 0)
        continue
      }
      const world = c.world
      const list = world.lists[machine.type]
      const count = world.counts[machine.type]
      for (let i = 0; i < count; i++) {
        const id = list[i]
        if (world.state[id] < 0 && world.removing[id] === 0) machine.go(c, id, 0)
      }
    }
  }

  /**
   * `always` lines and `go to` checks, once per tick.
   * @param {RuleContext} c
   */
  step(c) {
    for (let m = 0; m < this.machines.length; m++) {
      const machine = this.machines[m]
      if (machine.type < 0) {
        if (machine.gameState < 0) continue
        const state = machine.states[machine.gameState]
        if (state.always !== null) state.always(c)
        const before = machine.gameState
        const next = firstReady(c, state, machine.gameTicks)
        machine.gameTicks++
        if (next >= 0 && machine.gameState === before) machine.go(c, -1, next)
        continue
      }
      const world = c.world
      const type = machine.type
      const list = world.lists[type]
      const count = world.counts[type]
      for (let i = 0; i < count; i++) {
        const id = list[i]
        const index = world.state[id]
        if (index < 0 || world.removing[id] === 1) continue
        const state = machine.states[index]
        const previous = c.bound[type]
        c.bound[type] = id
        if (state.always !== null) state.always(c)
        const next = world.state[id] === index ? firstReady(c, state, world.stateTicks[id]) : -1
        world.stateTicks[id] = world.stateTicks[id] + 1
        if (next >= 0) machine.go(c, id, next)
        c.bound[type] = previous
      }
    }
  }

  /** Back to the start. Things' states live in the world, which is rebuilt on restart. */
  reset() {
    for (const machine of this.machines) {
      machine.gameState = -1
      machine.gameTicks = 0
    }
    for (const rule of this.rules) rule.reset()
  }
}

/**
 * @param {readonly Action[]} actions
 * @param {Catalog} catalog
 * @param {TextLayer} text
 * @returns {ActionFn}
 */
function actionsOrNothing(actions, catalog, text) {
  return actions.length > 0 ? lowerActions(actions, catalog, text) : NOTHING
}

/**
 * @param {RuleContext} c
 * @param {LiveState} state
 * @param {number} ticks how long it has been in this state
 * @returns {number} state to go to, or -1
 */
function firstReady(c, state, ticks) {
  const checks = state.checks
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i]
    if (ticks + 1 >= check.ticks && (check.check === null || check.check(c))) return check.to
  }
  return -1
}

/**
 * Run lines only when the machine is in this state. For things, per copy.
 * @param {Machine} machine
 * @param {number} index
 * @param {ActionFn} actions
 * @returns {ActionFn}
 */
function onlyInState(machine, index, actions) {
  if (machine.type < 0) {
    return (c) => {
      if (machine.gameState === index) actions(c)
    }
  }
  const type = machine.type
  return eachTarget(type, (c, id) => {
    if (c.world.state[id] !== index) return
    const previous = c.bound[type]
    c.bound[type] = id
    actions(c)
    c.bound[type] = previous
  })
}

