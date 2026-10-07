# minijs Reference Spec

Status: approved design, v1 scope. This document is the source of truth. If code and spec disagree, fix one of them deliberately and note it in `handoffs/handoff.md`.

## 1. Product

minijs is the easiest rules-based 2D game engine for people who cannot code well. Users write plain-English-ish text in a `.mini` file. Game logic is a list of `when ... then ...` rules. It must never feel like scary code: no brackets, no semicolons, no `=`, friendly errors that say what to do.

v1 delivers the **engine only**: language package, runtime package, a dev playground page, and examples. A real editor (web or desktop) is a later project that will consume `@minijs/lang` for squiggles and `@minijs/runtime` for play.

v1 target genres: **top-down arcade** and **platformer**.

### Non-goals for v1

Sound, levels and tilemaps, emoji looks, user-defined functions or macros, per-instance custom variables, `wait` inside rules, rotation, scaling, particle effects, networking, WebGL renderer, editor UI, desktop packaging.

## 2. Architecture

```
minijs/
  packages/
    lang/        @minijs/lang      plain JavaScript, no DOM
      ast        AST types: the contract between lang and runtime
      errors     MiniError shape and helpers
      keys       canonical key names shared with runtime
      colors     CSS named colors + hex validation
      lexer      indentation-aware tokens
      parser     tokens -> AST
      checker    name resolution, validation, "did you mean" hints
      compile    source -> { program, errors }
    runtime/     @minijs/runtime   browser + headless
      world      struct-of-arrays instance storage, spawn/remove
      catalog    thing types resolved from AST + loaded assets
      lower      AST -> closures (expressions, conditions, actions, triggers)
      rules      compiled rule set, pre- and post-physics phases
      physics    velocity, gravity, move displacement, solid push-out
      spatial    spatial hash broadphase
      collide    touching pairs for rules
      input      keyboard + mouse state, edge detection
      text       persistent text slots
      render     Renderer interface, Canvas2D, Null, world drawing
      assets     image loading with placeholder fallback
      loop       fixed-timestep loop with render interpolation
      simulation headless tick orchestrator
      game       start(): wires everything to a canvas
  playground/    Vite dev page: source pane, game canvas, error list
  examples/      *.mini sample games
  docs/          spec + stage plans
```

Hard boundary: `@minijs/lang` never imports `@minijs/runtime`. Runtime may import types and constants from lang.

Data flow:

```
source text -> lang.compile() -> { program: Program | null, errors: MiniError[] }
errors non-empty -> show them, do not run
program -> runtime.start(program, canvas, options) -> Promise<Game>
runtime problems -> Game emits 'error' with the same MiniError shape
```

## 3. Performance goals ("runs on a potato, flies on a beast")

1. **Closure lowering.** Checked AST is lowered once into plain JS closures. No AST walking or string lookups per tick. Every closure keeps its source location for runtime errors. No `eval`, no `new Function`.
2. **Struct-of-arrays world.** Instance data in growable `Float64Array`/`Int32Array`/`Uint8Array` columns. Removed slots go to a free list. Per-type dense id lists with swap-remove.
3. **Zero allocation in the hot loop.** Tick code allocates no objects, arrays, or closures. Spawns and removals are deferred into preallocated queues.
4. **Spatial hash broadphase.** Only thing types that appear in a `touches` rule, or are `solid`, enter the hash. Typical cost O(n).
5. **Fixed 60 Hz update, decoupled render.** Logic always ticks at 1/60 s. Max 5 catch-up steps per frame; excess time is dropped (no death spiral). Render runs at display rate with interpolation between previous and current positions, so 120/144 Hz screens look smooth.
6. **Renderer interface.** Canvas2D ships in v1. A batched WebGL renderer can implement the same interface later.
7. **Cheap scaling.** `pixel art` mode renders at internal resolution and scales by an integer factor with smoothing off. Non-pixel-art mode caps devicePixelRatio at 2. Offscreen things are culled.
8. **Budget.** Benchmark: 2,000 moving things with a touch rule and solids. Target mean tick time under 4 ms on a mid laptop (leaves headroom inside the 16.6 ms frame). Tracked by `npm run bench`.

## 4. Language

### 4.1 Lexical rules

- File extension `.mini`. UTF-8.
- Indentation defines blocks. The first indented line sets the indent unit (for example 2 spaces, 4 spaces, or 1 tab). Mixing tabs and spaces in one file is `indent-mixed`. Indent that is not a multiple of the unit is `indent-uneven`. Jumping more than one level deeper is `indent-unexpected`.
- `#` starts a comment to end of line (outside strings), except a hex color: `#` immediately followed by exactly 3 or 6 hex digits and then a space or end of line is a color token (`background #1a2b3c`).
- Blank lines are ignored.
- Keywords are case-insensitive. Thing and variable names are case-insensitive and stored lowercase.
- Names: letters, digits, `_`, `-`; must start with a letter. Example: `big-rock`, `enemy2`. Because `-` is allowed in names, math needs spaces: `score - 1`, not `score-1`.
- Numbers: `12`, `3.5`, `-4`, `.5` is not allowed (write `0.5`).
- Strings: double quotes, single line. `{` ... `}` inside a `show text` string interpolates an expression.
- Commas separate coordinate pairs and frame lists.
- Filler words `a`, `an`, `the` are accepted and ignored where the grammar marks them optional.

### 4.2 Top-level blocks

A file is a sequence of top-level statements:

```
game                      # optional settings block, at most one
<name> starts at <number> # global variable, any number of these
thing <name>              # thing type block
when <trigger>            # rule block
always                    # rule block that fires every tick
```

### 4.3 `game` block

```
game
  size 480 by 270           # internal resolution, default 480 by 270
  pixel art                 # crisp integer scaling, default off
  background navy           # color, default black
  gravity 0.4               # pixels per tick^2 for things that fall, default 0
```

### 4.4 Variables

```
score starts at 0
lives starts at 3
```

Global numbers only. Name must not clash with a thing name or keyword.

### 4.5 `thing` block

```
thing player
  looks like "hero-idle.png"            # or: looks like red box 16 by 16 / looks like gold circle 6
  animation walk "hero-1.png", "hero-2.png", "hero-3.png" at 8 fps
  size 16 by 16                         # optional, overrides look size
  starts at 40, 100                     # optional, repeatable: one instance per line
  solid                                 # takes part in solid push-out
  fixed                                 # never moved by physics or push-out
  falls                                 # affected by game gravity
  camera follows                        # camera centers on first instance
```

Rules:
- `looks like` is required, exactly once.
- A thing with no `starts at` has no instances at game start (it is a template for `make`).
- At most one thing may have `camera follows`.
- Coordinates are world pixels, origin top-left, y grows downward. A thing's position is its top-left corner.
- Size resolution order: `size` line, else box `W by H`, else circle `2r by 2r`, else image natural size.

Looks:
- `<color> box <w> by <h>`
- `<color> circle <r>`
- `"<image path>"` relative to the assets base URL.

Colors: any CSS named color (`red`, `skyblue`), multi-word forms joined (`sky blue` -> `skyblue`), or `#rgb` / `#rrggbb`.

### 4.6 Rules

```
when <trigger>
  <action>
  <action>

always
  <action>
```

Rules are checked top to bottom.

#### Triggers

| Trigger | Fires |
|---|---|
| `game starts` | once, first tick |
| `<key> key is pressed` | tick the key goes down |
| `<key> key is held` | every tick the key is down |
| `<key> key is released` | tick the key goes up |
| `mouse is clicked` | tick the mouse button goes down |
| `mouse is clicked on <thing>` | once per clicked instance under the pointer |
| `<thing> touches <thing>` | every tick, once per overlapping pair (edges touching counts) |
| `<thing> leaves the screen` | once when an instance becomes fully outside the camera view |
| `every <n> seconds` | every n seconds, first time at n |
| `after <n> seconds` | once at n |
| `<condition>` | once when the condition becomes true (rising edge); again only after it was false |

Event triggers are recognized first, so `when left key is held and score is 3` is a key event with a guard (fires every tick while held), not a rising-edge condition. Every event trigger may add a guard: `when up key is pressed and player is on ground`. The guard is a condition. For key and mouse triggers, the guard is checked when the event happens. For per-instance triggers (touch, click on, leaves screen), the guard is checked per instance with the instance bound.

Keys: `left right up down space enter shift escape`, letters `a`-`z`, digits `0`-`9`.

#### Conditions

```
<expr> is <expr>
<expr> is not <expr>
<expr> is above <expr>     # also: is more than, is greater than, is bigger than
<expr> is below <expr>     # also: is less than, is smaller than
<thing> is on ground       # also: is on the ground
<key> key is held
<cond> and <cond>
<cond> or <cond>
not <cond>
```

Precedence: `not` > `and` > `or`. No parentheses in v1.

#### Expressions

```
12                     number
score                  variable
player x / player y    instance position (also: vx, vy, width, height)
count of coin          number of live instances
mouse x / mouse y      pointer in world coordinates
random 0 to 300        random integer, inclusive
<expr> + - * / <expr>  arithmetic, usual precedence, left to right
```

#### Actions

| Action | Meaning |
|---|---|
| `move <thing> <dir> <n>` | move n pixels this tick, solid-checked |
| `push <thing> <dir> <n>` | add n to velocity in that direction |
| `stop <thing>` | set velocity to 0 |
| `set <var> to <expr>` | set variable |
| `set <thing> <prop> to <expr>` | set x, y, vx or vy of instance(s) |
| `add <expr> to <var>` | increase variable |
| `subtract <expr> from <var>` | decrease variable |
| `make a <thing> at <expr>, <expr>` | spawn instance (applied end of tick) |
| `remove <thing>` | despawn instance(s) (applied end of tick) |
| `change <thing> to look like <look>` | replace look, stops animation |
| `play <animation> on <thing>` | loop animation, no restart if already playing |
| `stop animation on <thing>` | back to base look |
| `show text "<text>"` | show centered text |
| `show text "<text>" at <expr>, <expr> [in <color>]` | show text at screen position |
| `stop game` | freeze simulation, keep drawing |
| `restart game` | reset everything to start state |

Directions: `left right up down`. `up` is negative y.

#### Which instance does a name mean?

- In a `touches`, `mouse is clicked on`, or `leaves the screen` rule, the named thing types in the trigger refer to the specific instance(s) involved. `the` is optional: `remove the coin` and `remove coin` mean the same.
- Everywhere else a thing name means **every** live instance of that type. Actions apply to each. Expressions like `player x` read the first live instance (or the one currently being acted on, when inside an action applied to that same type). If no instance exists, value is 0.

#### Text

Each `show text` action owns one text slot. Running it again replaces that slot's content. Text stays on screen until `restart game`. Interpolation: `"Score: {score}"`. Integers print without decimals; other numbers print at most 2 decimals. Text position is screen space (HUD), unaffected by camera. Default color white, font `10px monospace` at internal resolution.

### 4.7 Errors

Every error has: `code` (stable string), `message` (plain sentence), optional `hint` (what to do), `line`, `col` (1-based). Typos get Levenshtein suggestions over known names and keywords (distance <= 2): message `I don't know what "cion" is.` hint `Did you mean "coin"?`.

Error codes (lang): `indent-mixed`, `indent-uneven`, `indent-unexpected`, `unknown-word`, `expected`, `unterminated-string`, `bad-number`, `unknown-thing`, `unknown-variable`, `unknown-animation`, `unknown-key`, `unknown-color`, `duplicate-thing`, `duplicate-variable`, `name-clash`, `missing-look`, `duplicate-look`, `multiple-cameras`, `duplicate-game`.

Error codes (runtime): `image-missing`, `too-many-things`, `runtime-math` (division by zero yields 0 plus one warning).

## 5. Runtime semantics

### 5.1 Tick order (fixed 1/60 s)

1. Input snapshot: compute pressed/released edges since last tick.
2. Pre-physics rules, in source order: `game starts`, timers, key, mouse, condition, `always`.
3. Physics for each live instance not `fixed`:
   - if `falls`: `vy += gravity`
   - `x += vx + mx`, then if `solid`: push out of other solid instances on x; zero `vx` if blocked
   - `y += vy + my`, then if `solid`: push out on y; if pushed up set `onGround`, zero `vy` if blocked
   - reset `mx`, `my` (the `move` displacement)
4. Rebuild spatial hash; post-physics rules in source order: `touches`, `leaves the screen`.
5. Apply deferred removals, then spawns. Over 10,000 live instances stops the game with `too-many-things`.
6. Advance animation frame counters.

`fixed` instances can still be moved by `move` and `set` (moving platforms): displacement applies directly with no push-out.

### 5.2 Render

`requestAnimationFrame` drives render. Draw position = lerp(previous, current, alpha) where alpha is the fraction of the next tick accumulated. Spawned and teleported instances snap (previous = current). Draw order: thing declaration order, then instance creation order. Text drawn last. Camera centers on the `camera follows` instance, unclamped.

### 5.3 Errors at runtime

Missing image: magenta placeholder, one `image-missing` error emitted, game keeps running.

## 6. Public API

```js
import { compile } from '@minijs/lang'
import { start } from '@minijs/runtime'

const { program, errors } = compile(source)
if (program) {
  const game = await start(program, canvas, { assetsBase: '/assets/' })
  game.on('error', (e) => showError(e))   // replays earlier errors (e.g. missing images) to new listeners
  game.on('stop', () => {})
  await game.reload(nextProgram)
  game.stop()          // stops simulation
  game.destroy()       // removes listeners, cancels frame loop
}
```

Headless (tests, tools):

```js
import { Simulation, NullRenderer, ManualInput } from '@minijs/runtime'
const sim = await Simulation.create(program, { input: new ManualInput(), assets: fakeAssets })
sim.tick()
```

## 7. Example

```
game
  size 320 by 180
  pixel art
  background sky blue
  gravity 0.4

score starts at 0

thing player
  looks like orange box 12 by 16
  starts at 40, 100
  solid
  falls
  camera follows

thing ground
  looks like seagreen box 640 by 20
  starts at 0, 160
  solid
  fixed

thing coin
  looks like gold circle 4

when left key is held
  move player left 2

when right key is held
  move player right 2

when up key is pressed and player is on ground
  push player up 7

when player touches coin
  remove the coin
  add 1 to score

when every 2 seconds
  make a coin at random 0 to 600, 140

when score is 10
  show text "You win!"
  stop game

always
  show text "Score: {score}" at 4, 4
```

## 7a. Known v1 limitations

- `stop game` freezes everything, including key rules. Restarting after a stop needs the host (playground Restart button calls `game.reload`).
- `<thing> touches <same thing>` binds only the first instance of each pair.
- Every shape collides as its bounding box (circles too).
- Camera follow is unclamped (no world bounds).
- `fixed` solid things moved by `move` do not carry riders.

## 8. Testing

- **lang:** golden tests, snippet -> AST. Error tests assert `code`, `line`, `col`, `message`, `hint`. Error wording is product surface.
- **runtime:** headless `Simulation` with `NullRenderer` and `ManualInput`; step N ticks, assert world state. Covers physics, rule order, edge triggers, spawn/remove, text slots, timers.
- **render:** recording renderer asserts draw calls.
- **perf:** `vitest bench` with 2,000 things.
- **examples:** every `examples/*.mini` compiles with zero errors (Stage 4 test).

## 9. Stages

| Stage | Plan | Owner |
|---|---|---|
| 1. Foundation | `docs/plans/stage-1-foundation.md` | Claude Opus 5.5, done |
| 2. Language | `docs/plans/stage-2-language.md` | Claude Opus 5.5, done |
| 3. Engine | `docs/plans/stage-3-engine.md` | Claude Opus 5.5, done |
| 4. Playground, examples, docs | `docs/plans/stage-4-playground.md` | next model |

Stage 2 and Stage 3 are independent: both depend only on the Stage 1 AST contract. Stage 4 needs both.
