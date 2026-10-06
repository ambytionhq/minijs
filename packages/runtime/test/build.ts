// Tiny AST builders so runtime tests do not depend on the parser.
// Every node gets a dummy location.

import {
  DEFAULT_GAME_SETTINGS,
  type Action,
  type CompareOp,
  type Condition,
  type Direction,
  type Expr,
  type GameSettings,
  type InstanceProp,
  type KeyName,
  type KeyState,
  type Look,
  type Program,
  type Rule,
  type SettableProp,
  type TextPart,
  type ThingDecl,
  type Trigger,
  type VarDecl,
} from '@minijs/lang'

export const L = { line: 1, col: 1 }

export function program(parts: {
  game?: Partial<GameSettings>
  vars?: VarDecl[]
  things?: ThingDecl[]
  rules?: Rule[]
}): Program {
  return {
    game: { ...DEFAULT_GAME_SETTINGS, loc: null, ...parts.game },
    vars: parts.vars ?? [],
    things: parts.things ?? [],
    rules: parts.rules ?? [],
  }
}

export function variable(name: string, initial = 0): VarDecl {
  return { name, initial, loc: L }
}

export const look = {
  box: (w: number, h: number, color = 'white'): Look => ({ kind: 'box', color, w, h, loc: L }),
  circle: (r: number, color = 'white'): Look => ({ kind: 'circle', color, r, loc: L }),
  image: (src: string): Look => ({ kind: 'image', src, loc: L }),
}

export function thing(
  name: string,
  options: Partial<Omit<ThingDecl, 'name' | 'starts' | 'loc'>> & { at?: Array<[number, number]> } = {},
): ThingDecl {
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

export function animation(name: string, frames: string[], fps: number) {
  return { name, frames, fps, loc: L }
}

export function rule(trigger: Trigger, ...actions: Action[]): Rule {
  return { trigger, actions, loc: L }
}

// Expressions
export const num = (value: number): Expr => ({ kind: 'number', value, loc: L })
export const ref = (name: string): Expr => ({ kind: 'var', name, loc: L })
export const prop = (thingName: string, p: InstanceProp): Expr => ({ kind: 'prop', thing: thingName, prop: p, loc: L })
export const count = (thingName: string): Expr => ({ kind: 'count', thing: thingName, loc: L })
export const mouse = (axis: 'x' | 'y'): Expr => ({ kind: 'mouse', axis, loc: L })
export const random = (min: Expr, max: Expr): Expr => ({ kind: 'random', min, max, loc: L })
export const bin = (op: '+' | '-' | '*' | '/', left: Expr, right: Expr): Expr => ({ kind: 'binary', op, left, right, loc: L })
const toExpr = (v: number | Expr): Expr => (typeof v === 'number' ? num(v) : v)

// Conditions
export const compare = (left: number | Expr, op: CompareOp, right: number | Expr): Condition => ({
  kind: 'compare',
  op,
  left: toExpr(left),
  right: toExpr(right),
  loc: L,
})
export const onGround = (thingName: string): Condition => ({ kind: 'onGround', thing: thingName, loc: L })
export const keyHeld = (key: KeyName): Condition => ({ kind: 'keyHeld', key, loc: L })
export const and = (left: Condition, right: Condition): Condition => ({ kind: 'and', left, right, loc: L })
export const or = (left: Condition, right: Condition): Condition => ({ kind: 'or', left, right, loc: L })
export const not = (operand: Condition): Condition => ({ kind: 'not', operand, loc: L })

// Triggers
export const when = {
  gameStarts: (guard: Condition | null = null): Trigger => ({ kind: 'gameStarts', guard, loc: L }),
  always: (): Trigger => ({ kind: 'always', loc: L }),
  key: (key: KeyName, state: KeyState, guard: Condition | null = null): Trigger => ({ kind: 'key', key, state, guard, loc: L }),
  click: (thingName: string | null = null, guard: Condition | null = null): Trigger => ({
    kind: 'mouseClick',
    thing: thingName,
    guard,
    loc: L,
  }),
  touch: (a: string, b: string, guard: Condition | null = null): Trigger => ({ kind: 'touch', a, b, guard, loc: L }),
  leaves: (thingName: string, guard: Condition | null = null): Trigger => ({ kind: 'leavesScreen', thing: thingName, guard, loc: L }),
  every: (seconds: number, guard: Condition | null = null): Trigger => ({ kind: 'every', seconds, guard, loc: L }),
  after: (seconds: number, guard: Condition | null = null): Trigger => ({ kind: 'after', seconds, guard, loc: L }),
  condition: (condition: Condition): Trigger => ({ kind: 'condition', condition, loc: L }),
}

// Actions
export const act = {
  move: (thingName: string, dir: Direction, amount: number | Expr): Action => ({ kind: 'move', thing: thingName, dir, amount: toExpr(amount), loc: L }),
  push: (thingName: string, dir: Direction, amount: number | Expr): Action => ({ kind: 'push', thing: thingName, dir, amount: toExpr(amount), loc: L }),
  halt: (thingName: string): Action => ({ kind: 'halt', thing: thingName, loc: L }),
  setVar: (name: string, value: number | Expr): Action => ({ kind: 'setVar', name, value: toExpr(value), loc: L }),
  setProp: (thingName: string, p: SettableProp, value: number | Expr): Action => ({ kind: 'setProp', thing: thingName, prop: p, value: toExpr(value), loc: L }),
  add: (amount: number | Expr, name: string): Action => ({ kind: 'addVar', name, amount: toExpr(amount), loc: L }),
  subtract: (amount: number | Expr, name: string): Action => ({ kind: 'subtractVar', name, amount: toExpr(amount), loc: L }),
  make: (thingName: string, x: number | Expr, y: number | Expr): Action => ({ kind: 'make', thing: thingName, x: toExpr(x), y: toExpr(y), loc: L }),
  remove: (thingName: string): Action => ({ kind: 'remove', thing: thingName, loc: L }),
  changeLook: (thingName: string, l: Look): Action => ({ kind: 'changeLook', thing: thingName, look: l, loc: L }),
  play: (animationName: string, thingName: string): Action => ({ kind: 'playAnimation', thing: thingName, animation: animationName, loc: L }),
  stopAnimation: (thingName: string): Action => ({ kind: 'stopAnimation', thing: thingName, loc: L }),
  showText: (parts: Array<string | Expr>, at: [number | Expr, number | Expr] | null = null, color = 'white'): Action => ({
    kind: 'showText',
    parts: parts.map((p): TextPart => (typeof p === 'string' ? { kind: 'literal', text: p } : { kind: 'expr', expr: p })),
    at: at ? { x: toExpr(at[0]), y: toExpr(at[1]) } : null,
    color,
    loc: L,
  }),
  stopGame: (): Action => ({ kind: 'stopGame', loc: L }),
  restartGame: (): Action => ({ kind: 'restartGame', loc: L }),
}
