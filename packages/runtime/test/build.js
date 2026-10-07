// Tiny AST builders so runtime tests do not depend on the parser.
// Every node gets a dummy location.

/** @import { MapDecl, ControlDecl, InputSource, MouseButton, PadButton, Action, CompareOp, Condition, Direction, Expr, GameSettings, InstanceProp, KeyName, KeyState, Look, Program, Rule, SettableProp, TextPart, ThingDecl, Trigger, VarDecl } from '@minijs/lang' */
import { DEFAULT_GAME_SETTINGS } from '@minijs/lang'

export const L = { line: 1, col: 1 }

/**
 * @param {{ game?: Partial<GameSettings>; vars?: VarDecl[]; things?: ThingDecl[]; controls?: ControlDecl[]; maps?: MapDecl[]; rules?: Rule[] }} parts
 * @returns {Program}
 */
export function program(parts) {
  return {
    game: { ...DEFAULT_GAME_SETTINGS, loc: null, ...parts.game },
    vars: parts.vars ?? [],
    things: parts.things ?? [],
    controls: parts.controls ?? [],
    maps: parts.maps ?? [],
    rules: parts.rules ?? [],
  }
}

/**
 * @param {string} name
 * @returns {VarDecl}
 */
export function variable(name, initial = 0) {
  return { name, initial, loc: L }
}

export const look = {
  box: (w, h, color = 'white') => ({ kind: 'box', color, w, h, loc: L }),
  circle: (r, color = 'white') => ({ kind: 'circle', color, r, loc: L }),
  image: (src) => ({ kind: 'image', src, loc: L }),
}

/**
 * @param {string} name
 * @param {Partial<Omit<ThingDecl, 'name' | 'starts' | 'loc'>> & { at?: Array<[number, number]> }} [options={}]
 * @returns {ThingDecl}
 */
export function thing(name, options = {}) {
  return {
    name,
    look: options.look ?? look.box(10, 10),
    animations: options.animations ?? [],
    size: options.size ?? null,
    starts: (options.at ?? []).map(([x, y]) => ({ x, y, loc: L })),
    solid: options.solid ?? false,
    fixed: options.fixed ?? false,
    falls: options.falls ?? false,
    cameraFollows: options.cameraFollows ?? false,
    loc: L,
  }
}

/**
 * @param {string} name
 * @param {string[]} frames
 * @param {number} fps
 */
export function animation(name, frames, fps) {
  return { name, frames, fps, loc: L }
}

/**
 * @param {Trigger} trigger
 * @param {...Action} actions
 * @returns {Rule}
 */
export function rule(trigger, ...actions) {
  return { trigger, actions, loc: L }
}

// Expressions
/**
 * @param {number} value
 * @returns {Expr}
 */
export const num = (value) => ({ kind: 'number', value, loc: L })
/**
 * @param {string} name
 * @returns {Expr}
 */
export const ref = (name) => ({ kind: 'var', name, loc: L })
/**
 * @param {string} thingName
 * @param {InstanceProp} p
 * @returns {Expr}
 */
export const prop = (thingName, p) => ({ kind: 'prop', thing: thingName, prop: p, loc: L })
/**
 * @param {string} thingName
 * @returns {Expr}
 */
export const count = (thingName) => ({ kind: 'count', thing: thingName, loc: L })
/**
 * @param {'x' | 'y'} axis
 * @returns {Expr}
 */
export const mouse = (axis) => ({ kind: 'mouse', axis, loc: L })
/**
 * @param {Expr} min
 * @param {Expr} max
 * @returns {Expr}
 */
export const random = (min, max) => ({ kind: 'random', min, max, loc: L })
/**
 * @param {'+' | '-' | '*' | '/'} op
 * @param {Expr} left
 * @param {Expr} right
 * @returns {Expr}
 */
export const bin = (op, left, right) => ({ kind: 'binary', op, left, right, loc: L })
/**
 * @param {number | Expr} v
 * @returns {Expr}
 */
const toExpr = (v) => (typeof v === 'number' ? num(v) : v)

// Conditions
/**
 * @param {number | Expr} left
 * @param {CompareOp} op
 * @param {number | Expr} right
 * @returns {Condition}
 */
export const compare = (left, op, right) => ({
  kind: 'compare',
  op,
  left: toExpr(left),
  right: toExpr(right),
  loc: L,
})
/**
 * @param {string} thingName
 * @returns {Condition}
 */
export const onGround = (thingName) => ({ kind: 'onGround', thing: thingName, loc: L })
/**
 * @param {KeyName} key
 * @returns {Condition}
 */
export const keyHeld = (key) => ({ kind: 'keyHeld', key, loc: L })
/**
 * @param {Condition} left
 * @param {Condition} right
 * @returns {Condition}
 */
export const and = (left, right) => ({ kind: 'and', left, right, loc: L })
/**
 * @param {Condition} left
 * @param {Condition} right
 * @returns {Condition}
 */
export const or = (left, right) => ({ kind: 'or', left, right, loc: L })
/**
 * @param {Condition} operand
 * @returns {Condition}
 */
export const not = (operand) => ({ kind: 'not', operand, loc: L })

// Triggers
export const when = {
  gameStarts: (guard = null) => ({ kind: 'gameStarts', guard, loc: L }),
  always: () => ({ kind: 'always', loc: L }),
  key: (key, state, guard = null) => ({ kind: 'key', key, state, guard, loc: L }),
  click: (thingName = null, guard = null) => ({
    kind: 'mouseClick',
    button: 'left',
    state: 'pressed',
    thing: thingName,
    guard,
    loc: L,
  }),
  /**
   * @param {MouseButton} button
   * @param {KeyState} state
   * @param {string | null} [thingName=null]
   */
  mouse: (button, state, thingName = null, guard = null) => ({ kind: 'mouseClick', button, state, thing: thingName, guard, loc: L }),
  /**
   * @param {number} pad
   * @param {PadButton} button
   * @param {KeyState} state
   */
  pad: (pad, button, state, guard = null) => ({ kind: 'pad', pad, button, state, guard, loc: L }),
  /**
   * @param {string} name
   * @param {KeyState} state
   */
  control: (name, state, guard = null) => ({ kind: 'control', name, state, guard, loc: L }),
  touch: (a, b, guard = null) => ({ kind: 'touch', a, b, guard, loc: L }),
  leaves: (thingName, guard = null) => ({ kind: 'leavesScreen', thing: thingName, guard, loc: L }),
  every: (seconds, guard = null) => ({ kind: 'every', seconds, guard, loc: L }),
  after: (seconds, guard = null) => ({ kind: 'after', seconds, guard, loc: L }),
  condition: (condition) => ({ kind: 'condition', condition, loc: L }),
}

// Actions
export const act = {
  move: (thingName, dir, amount) => ({ kind: 'move', thing: thingName, dir, amount: toExpr(amount), loc: L }),
  push: (thingName, dir, amount) => ({ kind: 'push', thing: thingName, dir, amount: toExpr(amount), loc: L }),
  halt: (thingName) => ({ kind: 'halt', thing: thingName, loc: L }),
  setVar: (name, value) => ({ kind: 'setVar', name, value: toExpr(value), loc: L }),
  setProp: (thingName, p, value) => ({ kind: 'setProp', thing: thingName, prop: p, value: toExpr(value), loc: L }),
  add: (amount, name) => ({ kind: 'addVar', name, amount: toExpr(amount), loc: L }),
  subtract: (amount, name) => ({ kind: 'subtractVar', name, amount: toExpr(amount), loc: L }),
  make: (thingName, x, y) => ({ kind: 'make', thing: thingName, x: toExpr(x), y: toExpr(y), loc: L }),
  remove: (thingName) => ({ kind: 'remove', thing: thingName, loc: L }),
  changeLook: (thingName, l) => ({ kind: 'changeLook', thing: thingName, look: l, loc: L }),
  play: (animationName, thingName) => ({ kind: 'playAnimation', thing: thingName, animation: animationName, loc: L }),
  stopAnimation: (thingName) => ({ kind: 'stopAnimation', thing: thingName, loc: L }),
  showText: (parts, at = null, color = 'white') => ({
    kind: 'showText',
    parts: parts.map((p) => (typeof p === 'string' ? { kind: 'literal', text: p } : { kind: 'expr', expr: p })),
    at: at ? { x: toExpr(at[0]), y: toExpr(at[1]) } : null,
    color,
    loc: L,
  }),
  log: (parts) => ({
    kind: 'log',
    parts: parts.map((p) => (typeof p === 'string' ? { kind: 'literal', text: p } : { kind: 'expr', expr: p })),
    loc: L,
  }),
  stopGame: () => ({ kind: 'stopGame', loc: L }),
  restartGame: () => ({ kind: 'restartGame', loc: L }),
}

/**
 * @param {string} name
 * @param {...InputSource} sources
 * @returns {ControlDecl}
 */
export function control(name, ...sources) {
  return { name, sources, loc: L }
}

/** @param {MouseButton} button */
export const mouseHeld = (button) => ({ kind: 'mouseHeld', button, loc: L })
/** @param {string} thingName */
export const mouseOver = (thingName) => ({ kind: 'mouseOver', thing: thingName, loc: L })
/**
 * @param {number} pad
 * @param {PadButton} button
 */
export const padHeld = (pad, button) => ({ kind: 'padHeld', pad, button, loc: L })
/** @param {string} name */
export const controlHeld = (name) => ({ kind: 'controlHeld', name, loc: L })
/**
 * @param {number} pad
 * @param {'left' | 'right'} side
 * @param {'x' | 'y'} axis
 */
export const stick = (pad, side, axis) => ({ kind: 'stick', pad, side, axis, loc: L })

/**
 * @param {string[]} rows
 * @param {Record<string, string>} legend letter -> thing name
 * @param {{ x?: number; y?: number; tileW?: number; tileH?: number }} [options={}]
 * @returns {MapDecl}
 */
export function map(rows, legend, options = {}) {
  return {
    x: options.x ?? 0,
    y: options.y ?? 0,
    tileW: options.tileW ?? 16,
    tileH: options.tileH ?? 16,
    rows: rows.map((text) => ({ text, loc: L })),
    legend: Object.entries(legend).map(([char, thingName]) => ({ char, thing: thingName, loc: L })),
    loc: L,
  }
}
