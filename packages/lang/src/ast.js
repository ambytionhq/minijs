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
 * @property {MapDecl[]} maps
 * @property {Rule[]} rules
 * @property {TilemapDecl[]} tilemaps
 * @property {SoundDecl[]} sounds
 * @property {MusicDecl[]} music
 * @property {ParticlesDecl[]} particles
 * @property {MachineDecl[]} machines
 */

/**
 * @typedef {object} GameSettings
 * @property {number} width
 * @property {number} height
 * @property {boolean} pixelArt
 * @property {string} background
 * @property {number} gravity
 * @property {boolean} touchButtons Show on-screen arrows and A/B buttons on touch screens.
 * @property {{ x1: number; y1: number; x2: number; y2: number } | null} cameraBounds The camera never shows outside this area.
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
  cameraBounds: null,
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

/**
 * A level drawn with letters. Each letter in `rows` that appears in `legend`
 * places one of that thing at (x + column * tileW, y + row * tileH).
 * `.` and spaces are empty.
 * @typedef {object} MapDecl
 * @property {number} x
 * @property {number} y
 * @property {number} tileW
 * @property {number} tileH
 * @property {Array<{ text: string; loc: Loc }>} rows `loc` is the opening quote of the row.
 * @property {Array<{ char: string; thing: string; loc: Loc }>} legend
 * @property {Loc} loc
 */

/**
 * A level painted in Studio and saved as a `.tilemap` file.
 * @typedef {object} TilemapDecl
 * @property {string} name
 * @property {string} src
 * @property {number} x
 * @property {number} y
 * @property {boolean} hidden Starts switched off; `switch to tilemap` or `show tilemap` turns it on.
 * @property {Loc} loc
 */

/**
 * A sound: a preset with changes (`like`), or a file (.sound, .wav, .mp3, .ogg, .m4a).
 * @typedef {object} SoundDecl
 * @property {string} name
 * @property {string | null} src
 * @property {string | null} preset
 * @property {Partial<import('./presets.js').SoundSettings>} settings
 * @property {Loc} loc
 */

/**
 * Looping background music from a file (.music, .wav, .mp3, .ogg, .m4a).
 * @typedef {object} MusicDecl
 * @property {string} name
 * @property {string} src
 * @property {number} volume 0 to 100
 * @property {Loc} loc
 */

/**
 * A particle effect: a preset with changes (`like`), or a `.particles` file.
 * @typedef {object} ParticlesDecl
 * @property {string} name
 * @property {string | null} src
 * @property {string | null} preset
 * @property {Partial<import('./presets.js').ParticleSettings>} settings
 * @property {Loc} loc
 */

/**
 * `go to <state> when ...` or `go to <state> after N seconds`. `after` counts from entering the state.
 * @typedef {object} TransitionDecl
 * @property {string} to
 * @property {Trigger} trigger
 * @property {Loc} loc
 */

/**
 * @typedef {object} StateDecl
 * @property {string} name
 * @property {Action[]} enter
 * @property {Action[]} leave
 * @property {Action[]} always
 * @property {Rule[]} rules Rules that only count during this state.
 * @property {TransitionDecl[]} transitions
 * @property {Loc} loc
 */

/**
 * A state machine. `thing` is null for `states game`: one state for the whole game.
 * Otherwise every copy of the thing has its own current state.
 * @typedef {object} MachineDecl
 * @property {string | null} thing
 * @property {StateDecl[]} states The first one is where it starts.
 * @property {Loc} loc
 */

/**
 * Every trigger and action list in a program, inside state machines too.
 * @param {Program} program
 * @returns {Array<{ trigger: Trigger | null; actions: Action[] }>}
 */
export function allRules(program) {
  /** @type {Array<{ trigger: Trigger | null; actions: Action[] }>} */
  const out = program.rules.map((r) => ({ trigger: r.trigger, actions: r.actions }))
  for (const machine of program.machines ?? []) {
    for (const state of machine.states) {
      out.push({ trigger: null, actions: state.enter }, { trigger: null, actions: state.leave }, { trigger: null, actions: state.always })
      for (const r of state.rules) out.push({ trigger: r.trigger, actions: r.actions })
      for (const t of state.transitions) out.push({ trigger: t.trigger, actions: [] })
    }
  }
  return out
}

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
 *   | { kind: 'stateTime'; thing: string | null; loc: Loc }
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
 *   | { kind: 'inState'; thing: string | null; state: string; loc: Loc }
 *   | { kind: 'onTile'; thing: string; tile: string; loc: Loc }
 *   | { kind: 'touchingTile'; thing: string; tile: string | null; loc: Loc }
 *   | { kind: 'tileAt'; tile: string; x: Expr; y: Expr; loc: Loc }
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
 *   | { kind: 'touchTile'; thing: string; tile: string | null; guard: Condition | null; loc: Loc }
 *   | { kind: 'stateChange'; thing: string | null; state: string; change: 'enters' | 'leaves'; guard: Condition | null; loc: Loc }
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
 *   | { kind: 'playSound'; name: string; volume: Expr | null; pitch: Expr | null; from: string | null; loc: Loc }
 *   | { kind: 'playMusic'; name: string; loc: Loc }
 *   | { kind: 'stopMusic'; loc: Loc }
 *   | { kind: 'setVolume'; channel: 'sound' | 'music'; value: Expr; loc: Loc }
 *   | { kind: 'burst'; name: string; thing: string | null; x: Expr | null; y: Expr | null; loc: Loc }
 *   | { kind: 'startParticles'; name: string; where: 'thing' | 'point' | 'screen'; thing: string | null; x: Expr | null; y: Expr | null; loc: Loc }
 *   | { kind: 'stopParticles'; name: string; thing: string | null; loc: Loc }
 *   | { kind: 'setState'; thing: string | null; state: string; loc: Loc }
 *   | { kind: 'setTile'; tile: string | null; x: Expr | null; y: Expr | null; loc: Loc }
 *   | { kind: 'showTilemap'; name: string; show: boolean; loc: Loc }
 *   | { kind: 'switchTilemap'; name: string; loc: Loc }
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
