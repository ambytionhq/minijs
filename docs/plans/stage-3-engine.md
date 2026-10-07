# Stage 3: Engine (Runtime) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: DONE** (Claude Opus 5.5, 2026-10-05). 83 runtime tests pass (85 now), originally typecheck clean in TS; converted to plain JS 2026-10-05, bench within budget, browser smoke test passed. This file records what exists, the interfaces later stages rely on, and how it was verified. If you change engine behavior, update this file and `docs/spec.md`.

**Goal:** `@minijs/runtime`: turn a checked `Program` AST into a running game, headless or on a canvas, fast on weak devices and smooth on fast ones.

**Architecture:** AST lowered once into closures (`lower/`). Instances live in a struct-of-arrays `World`. A headless `Simulation` advances fixed 1/60 s ticks: input snapshot, pre-physics rules, physics with spatial-hash push-out, camera, touch index, post-physics rules, deferred spawn/remove flush, animations. `Game` wires a Simulation to `Canvas2DRenderer`, `BrowserInput`, and `FixedLoop`.

**Tech Stack:** Plain JavaScript (ES modules, JSDoc types), Canvas2D, Vitest (tests + bench). No runtime dependencies besides `@minijs/lang` (types, key names, error helpers).

## Global Constraints

- No allocation inside `Simulation.tick()` hot paths (typed arrays, reusable buffers, closures built at lowering time). The only per-tick allocation allowed is a `show text` string when its values changed.
- No `eval` / `new Function`.
- Iteration order everywhere: thing declaration order, then instance creation order.
- Spawns/removals are deferred to end of tick.
- Every user-visible runtime problem is a `MiniError` (codes `image-missing`, `too-many-things`, `runtime-math`).
- Perf budget: 2,000 solid falling things + touch rule, mean tick < 4 ms. Measured 1.75 ms (Apple Silicon laptop, Node 25).

## File map

| File | Responsibility |
|---|---|
| `src/config.js` | constants: tick rate, caps, epsilon, cell size, placeholder, text font, DPR cap |
| `src/assets.js` | `LoadedImage`, `AssetLoader`, `BrowserAssetLoader`, `StaticAssetLoader`, `collectImageSources`, `loadImages` |
| `src/catalog.js` | `Catalog`: type ids, var slots, look table, animation ids, camera type, touch/leave types |
| `src/world.js` | `World`: SoA columns, per-type ordered id lists, deferred spawn/remove queues, growth |
| `src/spatial-hash.js` | `SpatialHash`: bucketed linked lists in typed arrays, stamp dedupe |
| `src/physics.js` | `Physics.step`, `overlapsStrict`, `touchesInclusive`; substepping, sweep-box indexing |
| `src/collide.js` | `TouchIndex`: post-physics hash, `forEachPair` (smaller list drives queries) |
| `src/input.js` | `Input` (latched edges), `ManualInput`, `BrowserInput`, `keyIndex` |
| `src/text.js` | `TextLayer` slots with change detection, `formatNumber` |
| `src/lower/context.js` | `RuleContext`, `eachTarget`, function types |
| `src/lower/expr.js` | `lowerExpr` |
| `src/lower/condition.js` | `lowerCondition` |
| `src/lower/action.js` | `lowerAction`, `lowerActions` |
| `src/rules.js` | `compileRule`, `RuleSet` (pre/post phases, reset) |
| `src/simulation.js` | `Simulation` (create, tick, restart, stop, getVar, instancesOf) |
| `src/render/renderer.js` | `Renderer` interface, `NullRenderer`, `RecordingRenderer` |
| `src/render/canvas2d.js` | `Canvas2DRenderer`, `computeScale` |
| `src/render/draw-world.js` | `drawWorld(renderer, sim, alpha)` |
| `src/loop.js` | `FixedLoop`, `browserScheduler` |
| `src/game.js` | `Game`, `start()` |
| `src/index.js` | public exports |
| `test/build.js` | AST builder helpers (runtime tests do not depend on the parser) |
| `test/helpers.js` | `sim(program)`, `ticks(sim, n)` |
| `bench/tick.bench.js` | perf budget bench |

## Public interfaces later stages rely on

```js
// Browser
start(program: Program, canvas: HTMLCanvasElement, options?: StartOptions): Promise<Game>
interface StartOptions { assetsBase?: string; assets?: AssetLoader; fit?: boolean; random?: () => number; scheduler?: FrameScheduler }
class Game {
  simulation: Simulation
  on(event: 'error', fn: (e: MiniError) => void): () => void   // replays earlier errors
  on(event: 'stop', fn: () => void): () => void
  readonly errors: readonly MiniError[]
  reload(program: Program): Promise<void>
  stop(): void
  destroy(): void
}

// Headless
Simulation.create(program, { input?, assets?, random?, onError?, onStop? }): Promise<Simulation>
new Simulation(program, images: Map<string, LoadedImage>, options?)
sim.tick(); sim.restart(); sim.stop()
sim.tickCount; sim.stopped; sim.errors; sim.camera; sim.text.slots
sim.getVar(name): number
sim.instancesOf(name): InstanceView[]   // { id, x, y, vx, vy, width, height, onGround, animation }
```

---

### Task 1: Config, assets, catalog
- [x] `StaticAssetLoader` for tests; missing images -> 16x16 placeholder with `missing: true` and one `image-missing` error each.
- [x] Size resolution: `size` line > box > circle diameter > image natural size.
- [x] Looks registered once by AST node identity (base looks + `change ... to look like` targets).
- Tests: `simulation.test.js` (images, size, circle).

### Task 2: World storage
- [x] SoA columns grow by doubling; ids reused from a free list; per-type lists stay in creation order (stable compaction after removals).
- [x] `queueRemove` dedupes; `flush()` applies removals then spawns; returns false at `MAX_INSTANCES`.
- Tests: `world.test.js` (7).

### Task 3: Spatial hash
- [x] Power-of-two bucket table sized from expected entries; entries in typed arrays; queries dedupe via stamps; results in a reused `Int32Array`.
- Tests: `spatial-hash.test.js` (5).

### Task 4: Physics
- [x] Gravity only for `falls` and not `fixed`. `fixed` moves only by `move` displacement, no push-out.
- [x] Solids indexed by their swept box; resolution per axis (x then y), nearest blocking edge wins, never snaps behind start.
- [x] Substeps when moving more than half own size (max 8) to stop tunneling.
- [x] Strict overlap needs penetration > `EPSILON` so resting contact does not snag.
- Tests: `physics.test.js` (11): gravity, landing, on ground, walking without snag, walls, ceiling, anti-tunneling, fixed, non-solid pass-through.

### Task 5: Input
- [x] Latched pressed/released so sub-tick taps register; key repeat ignored; `releaseAll` on blur; arrows/space `preventDefault`.
- Tests: `input.test.js` (5).

### Task 6: Lowering and rules
- [x] `RuleContext.resolve(type)`: bound > current > first live > -1 (reads as 0).
- [x] `eachTarget`: bound instance, else every live non-removing instance.
- [x] Triggers: game starts (tick 0), always, key states, mouse click (plain and on thing), every/after (ticks = round(seconds*60), min 1), condition (rising edge, reset on restart), touch (post phase, both types bound), leaves screen (post phase, edge computed once per tick centrally so several rules can share it; spawning offscreen does not count).
- [x] Division by zero -> 0 plus one `runtime-math` error per expression.
- Tests: `rules.test.js` (19), `actions.test.js` (14 incl. text).

### Task 7: Text
- [x] One slot per `show text` action; string rebuilt only when interpolated values change; integers plain, others max 2 decimals; centered when no position.

### Task 8: Simulation
- [x] Tick order per spec 5.1; restart resets world, vars, text, timers, condition edges; `stop game` freezes and fires `onStop` once; `too-many-things` stops the game.
- [x] Camera centers on first `camera follows` instance, keeps previous position for interpolation.
- Tests: `simulation.test.js` (8) incl. determinism with injected RNG.

### Task 9: Rendering and loop
- [x] `drawWorld`: interpolation by alpha, camera offset, culling, animation frame = floor(animTicks * fps / 60) % frames, text last.
- [x] `computeScale`: pixel art integer scale including DPR; smooth mode DPR capped at 2.
- [x] `FixedLoop`: max 5 steps/frame, 250 ms frame clamp, float tolerance at tick boundaries, alpha for interpolation.
- Tests: `render.test.js` (9), `loop.test.js` (5).

### Task 10: Game wiring and browser smoke test
- [x] `Game.start` loads images once, attaches `BrowserInput`, fits canvas to parent via `ResizeObserver`, starts loop. `reload` swaps simulation and renderer.
- [x] Verified in a real browser with a scratch esbuild bundle of the spec section 7 platformer: walking, jumping (left ground mid-jump, landed), coin spawning and collecting, camera follow, pixel-art 6x canvas at DPR 2, no errors.
- Not unit-tested (needs DOM): `game.js`, `Canvas2DRenderer` drawing, `BrowserInput` listeners, `BrowserAssetLoader`. Stage 4 playground exercises them.

### Task 11: Bench
- [x] `npm run bench`: 2,000 things mean 1.75 ms/tick, 200 things 0.22 ms/tick.

## Verification commands

```bash
npm test
```

```bash
npm run bench
```

## Follow-ups for later stages (not v1 blockers)

- WebGL batched renderer implementing `Renderer` for 10k+ sprites.
- Instance cap and cell size could become `game` settings.
- `stop game` could keep key rules alive so `when r key is pressed / restart game` works after a stop.
