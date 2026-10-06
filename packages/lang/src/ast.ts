// The minijs AST. This is the contract between @minijs/lang (which produces it)
// and @minijs/runtime (which consumes it). See docs/spec.md section 4.
//
// Conventions:
// - Every node that can be the subject of an error carries `loc`.
// - Names (things, variables, animations) are stored lowercase.
// - Colors are stored as valid CSS color strings ("skyblue", "#ff8800").
// - Keys are stored as canonical KeyName values (see keys.ts).
// - The tree is plain data: JSON-serializable, no classes, no cycles.

import type { KeyName } from './keys.ts'

export interface Loc {
  /** 1-based line number. */
  line: number
  /** 1-based column number. */
  col: number
}

export interface Program {
  game: GameSettings
  vars: VarDecl[]
  things: ThingDecl[]
  rules: Rule[]
}

export interface GameSettings {
  width: number
  height: number
  pixelArt: boolean
  background: string
  gravity: number
  /** Location of the `game` block, or null when the file has none. */
  loc: Loc | null
}

export const DEFAULT_GAME_SETTINGS: Readonly<Omit<GameSettings, 'loc'>> = {
  width: 480,
  height: 270,
  pixelArt: false,
  background: 'black',
  gravity: 0,
}

export interface VarDecl {
  name: string
  initial: number
  loc: Loc
}

export interface Point {
  x: number
  y: number
  loc: Loc
}

export interface Size {
  w: number
  h: number
}

export type Look =
  | { kind: 'box'; color: string; w: number; h: number; loc: Loc }
  | { kind: 'circle'; color: string; r: number; loc: Loc }
  | { kind: 'image'; src: string; loc: Loc }

export interface AnimationDecl {
  name: string
  frames: string[]
  fps: number
  loc: Loc
}

export interface ThingDecl {
  name: string
  look: Look
  animations: AnimationDecl[]
  size: Size | null
  starts: Point[]
  solid: boolean
  fixed: boolean
  falls: boolean
  cameraFollows: boolean
  loc: Loc
}

export type Direction = 'left' | 'right' | 'up' | 'down'

export type InstanceProp = 'x' | 'y' | 'vx' | 'vy' | 'width' | 'height'

/** Props that `set <thing> <prop> to <expr>` may assign. */
export type SettableProp = 'x' | 'y' | 'vx' | 'vy'

export type BinaryOp = '+' | '-' | '*' | '/'

export type Expr =
  | { kind: 'number'; value: number; loc: Loc }
  | { kind: 'var'; name: string; loc: Loc }
  | { kind: 'prop'; thing: string; prop: InstanceProp; loc: Loc }
  | { kind: 'count'; thing: string; loc: Loc }
  | { kind: 'mouse'; axis: 'x' | 'y'; loc: Loc }
  | { kind: 'random'; min: Expr; max: Expr; loc: Loc }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr; loc: Loc }

export type CompareOp = 'is' | 'isNot' | 'above' | 'below'

export type Condition =
  | { kind: 'compare'; op: CompareOp; left: Expr; right: Expr; loc: Loc }
  | { kind: 'onGround'; thing: string; loc: Loc }
  | { kind: 'keyHeld'; key: KeyName; loc: Loc }
  | { kind: 'and'; left: Condition; right: Condition; loc: Loc }
  | { kind: 'or'; left: Condition; right: Condition; loc: Loc }
  | { kind: 'not'; operand: Condition; loc: Loc }

export type KeyState = 'pressed' | 'held' | 'released'

export type Trigger =
  | { kind: 'gameStarts'; guard: Condition | null; loc: Loc }
  | { kind: 'always'; loc: Loc }
  | { kind: 'key'; key: KeyName; state: KeyState; guard: Condition | null; loc: Loc }
  | { kind: 'mouseClick'; thing: string | null; guard: Condition | null; loc: Loc }
  | { kind: 'touch'; a: string; b: string; guard: Condition | null; loc: Loc }
  | { kind: 'leavesScreen'; thing: string; guard: Condition | null; loc: Loc }
  | { kind: 'every'; seconds: number; guard: Condition | null; loc: Loc }
  | { kind: 'after'; seconds: number; guard: Condition | null; loc: Loc }
  | { kind: 'condition'; condition: Condition; loc: Loc }

export type TextPart =
  | { kind: 'literal'; text: string }
  | { kind: 'expr'; expr: Expr }

export interface TextPosition {
  x: Expr
  y: Expr
}

export type Action =
  | { kind: 'move'; thing: string; dir: Direction; amount: Expr; loc: Loc }
  | { kind: 'push'; thing: string; dir: Direction; amount: Expr; loc: Loc }
  | { kind: 'halt'; thing: string; loc: Loc }
  | { kind: 'setVar'; name: string; value: Expr; loc: Loc }
  | { kind: 'setProp'; thing: string; prop: SettableProp; value: Expr; loc: Loc }
  | { kind: 'addVar'; name: string; amount: Expr; loc: Loc }
  | { kind: 'subtractVar'; name: string; amount: Expr; loc: Loc }
  | { kind: 'make'; thing: string; x: Expr; y: Expr; loc: Loc }
  | { kind: 'remove'; thing: string; loc: Loc }
  | { kind: 'changeLook'; thing: string; look: Look; loc: Loc }
  | { kind: 'playAnimation'; thing: string; animation: string; loc: Loc }
  | { kind: 'stopAnimation'; thing: string; loc: Loc }
  | { kind: 'showText'; parts: TextPart[]; at: TextPosition | null; color: string; loc: Loc }
  | { kind: 'stopGame'; loc: Loc }
  | { kind: 'restartGame'; loc: Loc }

export interface Rule {
  trigger: Trigger
  actions: Action[]
  loc: Loc
}

/** Default color for `show text` when no `in <color>` is given. */
export const DEFAULT_TEXT_COLOR = 'white'
