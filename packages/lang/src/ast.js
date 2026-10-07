// The minijs AST. This is the contract between @minijs/lang (which produces it)
// and @minijs/runtime (which consumes it). See docs/spec.md section 4.
//
// Conventions:
// - Every node that can be the subject of an error carries `loc`.
// - Names (things, variables, animations) are stored lowercase.
// - Colors are stored as valid CSS color strings ("skyblue", "#ff8800").
// - Keys are stored as canonical KeyName values (see keys.js).
// - The tree is plain data: JSON-serializable, no classes, no cycles.

/** @import { KeyName, MouseButton, PadButton } from './keys.js' */

/**
 * @typedef {object} Loc
 * @property {number} line 1-based line number.
 * @property {number} col 1-based column number.
 */

/**
 * @typedef {object} Program
 * @property {GameSettings} game
 * @property {VarDecl[]} vars
 * @property {ThingDecl[]} things
 * @property {ControlDecl[]} controls
 * @property {Rule[]} rules
 */

/**
 * @typedef {object} GameSettings
 * @property {number} width
 * @property {number} height
 * @property {boolean} pixelArt
 * @property {string} background
 * @property {number} gravity
 * @property {boolean} touchButtons Show on-screen arrows and A/B buttons on touch screens.
 * @property {Loc | null} loc Location of the `game` block, or null when the file has none.
 */

/** @type {Readonly<Omit<GameSettings, 'loc'>>} */
export const DEFAULT_GAME_SETTINGS = {
  width: 480,
  height: 270,
  pixelArt: false,
  background: 'black',
  gravity: 0,
  touchButtons: false,
}

/**
 * @typedef {object} VarDecl
 * @property {string} name
 * @property {number} initial
 * @property {Loc} loc
 */

/**
 * @typedef {object} Point
 * @property {number} x
 * @property {number} y
 * @property {Loc} loc
 */

/**
 * @typedef {object} Size
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {(
 *   | { kind: 'box'; color: string; w: number; h: number; loc: Loc }
 *   | { kind: 'circle'; color: string; r: number; loc: Loc }
 *   | { kind: 'image'; src: string; loc: Loc }
 * )} Look
 */

/**
 * @typedef {object} AnimationDecl
 * @property {string} name
 * @property {string[]} frames
 * @property {number} fps
 * @property {Loc} loc
 */

/**
 * @typedef {object} ThingDecl
 * @property {string} name
 * @property {Look} look
 * @property {AnimationDecl[]} animations
 * @property {Size | null} size
 * @property {Point[]} starts
 * @property {boolean} solid
 * @property {boolean} fixed
 * @property {boolean} falls
 * @property {boolean} cameraFollows
 * @property {Loc} loc
 */

/**
 * A key name, or 'any' for "any key".
 * @typedef {KeyName | 'any'} KeyChoice
 */

/**
 * One physical input a control listens to. `pad` is 1-based.
 * @typedef {(
 *   | { kind: 'key'; key: KeyChoice }
 *   | { kind: 'mouse'; button: MouseButton }
 *   | { kind: 'pad'; pad: number; button: PadButton }
 * )} InputSource
 */

/**
 * A named action fed by several inputs: `control jump` with `space key`, `gamepad a`, ...
 * @typedef {object} ControlDecl
 * @property {string} name
 * @property {InputSource[]} sources
 * @property {Loc} loc
 */

/** @typedef {'left' | 'right' | 'up' | 'down'} Direction */

/** @typedef {'x' | 'y' | 'vx' | 'vy' | 'width' | 'height'} InstanceProp */

/**
 * Props that `set <thing> <prop> to <expr>` may assign.
 * @typedef {'x' | 'y' | 'vx' | 'vy'} SettableProp
 */

/** @typedef {'+' | '-' | '*' | '/'} BinaryOp */

/**
 * @typedef {(
 *   | { kind: 'number'; value: number; loc: Loc }
 *   | { kind: 'var'; name: string; loc: Loc }
 *   | { kind: 'prop'; thing: string; prop: InstanceProp; loc: Loc }
 *   | { kind: 'count'; thing: string; loc: Loc }
 *   | { kind: 'mouse'; axis: 'x' | 'y'; loc: Loc }
 *   | { kind: 'random'; min: Expr; max: Expr; loc: Loc }
 *   | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr; loc: Loc }
 *   | { kind: 'stick'; pad: number; side: 'left' | 'right'; axis: 'x' | 'y'; loc: Loc }
 * )} Expr
 */

/** @typedef {'is' | 'isNot' | 'above' | 'below'} CompareOp */

/**
 * @typedef {(
 *   | { kind: 'compare'; op: CompareOp; left: Expr; right: Expr; loc: Loc }
 *   | { kind: 'onGround'; thing: string; loc: Loc }
 *   | { kind: 'keyHeld'; key: KeyChoice; loc: Loc }
 *   | { kind: 'mouseHeld'; button: MouseButton; loc: Loc }
 *   | { kind: 'mouseOver'; thing: string; loc: Loc }
 *   | { kind: 'padHeld'; pad: number; button: PadButton; loc: Loc }
 *   | { kind: 'controlHeld'; name: string; loc: Loc }
 *   | { kind: 'and'; left: Condition; right: Condition; loc: Loc }
 *   | { kind: 'or'; left: Condition; right: Condition; loc: Loc }
 *   | { kind: 'not'; operand: Condition; loc: Loc }
 * )} Condition
 */

/** @typedef {'pressed' | 'held' | 'released'} KeyState */

/**
 * @typedef {(
 *   | { kind: 'gameStarts'; guard: Condition | null; loc: Loc }
 *   | { kind: 'always'; loc: Loc }
 *   | { kind: 'key'; key: KeyChoice; state: KeyState; guard: Condition | null; loc: Loc }
 *   | { kind: 'mouseClick'; button: MouseButton; state: KeyState; thing: string | null; guard: Condition | null; loc: Loc }
 *   | { kind: 'pad'; pad: number; button: PadButton; state: KeyState; guard: Condition | null; loc: Loc }
 *   | { kind: 'control'; name: string; state: KeyState; guard: Condition | null; loc: Loc }
 *   | { kind: 'touch'; a: string; b: string; guard: Condition | null; loc: Loc }
 *   | { kind: 'leavesScreen'; thing: string; guard: Condition | null; loc: Loc }
 *   | { kind: 'every'; seconds: number; guard: Condition | null; loc: Loc }
 *   | { kind: 'after'; seconds: number; guard: Condition | null; loc: Loc }
 *   | { kind: 'condition'; condition: Condition; loc: Loc }
 * )} Trigger
 */

/**
 * @typedef {(
 *   | { kind: 'literal'; text: string }
 *   | { kind: 'expr'; expr: Expr }
 * )} TextPart
 */

/**
 * @typedef {object} TextPosition
 * @property {Expr} x
 * @property {Expr} y
 */

/**
 * @typedef {(
 *   | { kind: 'move'; thing: string; dir: Direction; amount: Expr; loc: Loc }
 *   | { kind: 'push'; thing: string; dir: Direction; amount: Expr; loc: Loc }
 *   | { kind: 'halt'; thing: string; loc: Loc }
 *   | { kind: 'setVar'; name: string; value: Expr; loc: Loc }
 *   | { kind: 'setProp'; thing: string; prop: SettableProp; value: Expr; loc: Loc }
 *   | { kind: 'addVar'; name: string; amount: Expr; loc: Loc }
 *   | { kind: 'subtractVar'; name: string; amount: Expr; loc: Loc }
 *   | { kind: 'make'; thing: string; x: Expr; y: Expr; loc: Loc }
 *   | { kind: 'remove'; thing: string; loc: Loc }
 *   | { kind: 'changeLook'; thing: string; look: Look; loc: Loc }
 *   | { kind: 'playAnimation'; thing: string; animation: string; loc: Loc }
 *   | { kind: 'stopAnimation'; thing: string; loc: Loc }
 *   | { kind: 'showText'; parts: TextPart[]; at: TextPosition | null; color: string; loc: Loc }
 *   | { kind: 'log'; parts: TextPart[]; loc: Loc }
 *   | { kind: 'stopGame'; loc: Loc }
 *   | { kind: 'restartGame'; loc: Loc }
 * )} Action
 */

/**
 * @typedef {object} Rule
 * @property {Trigger} trigger
 * @property {Action[]} actions
 * @property {Loc} loc
 */

/** Default color for `show text` when no `in <color>` is given. */
export const DEFAULT_TEXT_COLOR = 'white'
