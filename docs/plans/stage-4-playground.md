# Stage 4: Playground, Examples, Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Status: DONE (2026-10-06, Claude Opus 5.5).** `npm test` 206/206, bench 1.62 ms mean for 2,000 things. Deviations are listed under "As built" at the bottom.

**Goal:** A dev playground page where you type `.mini` text and watch the game run live, a set of example games, CI, and a README that teaches the language.

**Architecture:** `playground/` is a Vite + plain JavaScript app in the npm workspace. Left pane: CodeMirror 6 editor with lint diagnostics from `compile()`. Right pane: canvas driven by `@minijs/runtime` `start()`, plus a problems list and a small perf readout. Recompile on a 300 ms debounce; when there are no errors, `game.reload(program)`. Example games live in `examples/` and are tested headlessly.

**Tech Stack:** Vite 7, plain JavaScript (no TypeScript), CodeMirror 6 (`codemirror`, `@codemirror/lint`, `@codemirror/state`, `@codemirror/view`), `@phosphor-icons/web` for icons, Vitest.

**Language note (2026-10-05):** The project is plain JavaScript. Signatures and snippets below use TypeScript notation only as shorthand for shapes; write `.js` files, drop type annotations, and put types in JSDoc (`@param`, `@returns`, `@typedef`, `/** @import { X } from '...' */`).

## Read first

1. `docs/spec.md` (whole file).
2. `docs/plans/stage-3-engine.md` "Public interfaces later stages rely on".
3. `packages/lang/src/index.js` after Stage 2 (`compile`, `MiniError`, `formatError`).
4. The `design-taste-frontend` skill (the user asked for it). Apply its universal rules to the playground page (see Global Constraints). Its landing-page rules (hero, bento, logo wall) do not apply: this is a tool page, which that skill lists as out of scope for layout patterns.

## Global Constraints

- Design read: "Dev tool page for people who can't code well, calm and friendly, leaning toward native CSS with tokens." Dials: `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 5`.
- Zero em dashes or en dashes in any visible text. Use hyphens, commas, or periods.
- One accent color used everywhere (suggestion: emerald `#10b981` family, desaturated). Neutrals from one family (zinc). No purple glow, no gradients on text, no pure `#000`/`#fff`.
- Light and dark mode via CSS custom properties on `:root`, switched by `prefers-color-scheme`, both tested.
- Font: `Geist` + `Geist Mono` self-hosted via `@fontsource/geist-sans` and `@fontsource/geist-mono` (no Google Fonts link). Not Inter.
- Icons only from `@phosphor-icons/web`. No hand-drawn SVG icons, no emoji in UI.
- One corner radius scale: 8px for panels and inputs, full pill for buttons.
- Buttons: labels one line, 1 to 2 words ("Run", "Stop", "Restart"). WCAG AA contrast for every button, input, and error text in both themes.
- Animate only `transform`/`opacity`; honor `prefers-reduced-motion`.
- Layout: two columns at >= 1024px (editor 1fr, game 1fr), stacked below that, 16px side gutters, no horizontal page scroll at 375px wide. Use CSS grid; `min-height: 100dvh`, never `100vh`.
- Problems list copy comes straight from `MiniError.message` and `hint`. Never show stack traces, error codes, or the word "error" alone; heading is "Problems".
- `localStorage` access always wrapped in try/catch; page must work without it.
- Do not commit unless the user asks.

## File map

| File | Responsibility |
|---|---|
| `examples/platformer.mini` | spec section 7 game |
| `examples/coin-dash.mini` | top-down: collect coins, avoid a patrolling enemy, lives |
| `examples/dodge.mini` | falling rocks spawn at random x, leaves-the-screen scoring |
| `examples/clicker.mini` | `mouse is clicked on`, counters, text |
| `examples/hero.mini` + `examples/assets/*.png` | image looks and animation |
| `scripts/make-example-assets.mjs` | generates the small PNGs for `hero.mini` (no binary blobs hand-written) |
| `packages/runtime/test/examples.test.js` | every example compiles clean and runs 600 headless ticks with no errors |
| `playground/package.json`, `vite.config.js`, `index.html` | app shell |
| `playground/src/main.js` | wiring: editor, compile loop, game, problems, toolbar |
| `playground/src/editor.js` | CodeMirror setup, lint source, jump-to-line |
| `playground/src/problems.js` | render problems list |
| `playground/src/storage.js` | safe localStorage helpers |
| `playground/src/examples.js` | `import.meta.glob('../../examples/*.mini', { query: '?raw', eager: true })` |
| `playground/src/perf.js` | fps and tick time readout |
| `playground/src/styles.css` | tokens + layout |
| `playground/test/storage.test.js` | storage fallback behavior |
| `.github/workflows/ci.yml` | install, test |
| `README.md` | rewrite: what minijs is, quick start, language cheat sheet |

---

### Task 1: Example games and headless example tests

**Files:** `examples/*.mini`, `scripts/make-example-assets.mjs`, `examples/assets/`, `packages/runtime/test/examples.test.js`

- [x] **Step 1: Write the failing test**

```js
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compile } from '@minijs/lang'
import { describe, expect, it } from 'vitest'
import { StaticAssetLoader } from '../src/assets.js'
import { ManualInput } from '../src/input.js'
import { Simulation } from '../src/simulation.js'

const dir = join(import.meta.dirname, '../../../examples')
const files = readdirSync(dir).filter((f) => f.endsWith('.mini'))

describe('examples', () => {
  it('has at least five examples', () => expect(files.length).toBeGreaterThanOrEqual(5))
  for (const file of files) {
    it(`${file} compiles and runs 600 ticks cleanly`, async () => {
      const { program, errors } = compile(readFileSync(join(dir, file), 'utf8'))
      expect(errors).toEqual([])
      const sizes = { 'hero-idle.png': { width: 16, height: 16 }, 'hero-1.png': { width: 16, height: 16 }, 'hero-2.png': { width: 16, height: 16 }, 'hero-3.png': { width: 16, height: 16 } }
      const input = new ManualInput()
      const sim = await Simulation.create(program!, { input, assets: new StaticAssetLoader(sizes), random: () => 0.5 })
      input.keyDown('right')
      for (let i = 0; i < 600; i++) sim.tick()
      expect(sim.errors).toEqual([])
    })
  }
})
```

- [x] **Step 2: Run, expect FAIL** (no examples).
- [x] **Step 3: Write the examples.** `platformer.mini` is spec section 7 verbatim. Each other example: 25 to 60 lines, a comment header saying what it shows, uses only spec features. `hero.mini` uses `looks like "hero-idle.png"` and `animation walk "hero-1.png", "hero-2.png", "hero-3.png" at 8 fps`, playing `walk` while left/right is held and `stop animation on hero` on release.
- [x] **Step 4: Asset script.** `scripts/make-example-assets.mjs` writes 16x16 PNGs with `node:zlib` (`deflateSync`) and a hand-built PNG chunk writer (signature, IHDR, IDAT, IEND, CRC32 table). Each frame is a flat-colored character silhouette with the legs offset per frame. Run `node scripts/make-example-assets.mjs` to create `examples/assets/hero-idle.png`, `hero-1.png`, `hero-2.png`, `hero-3.png`.
- [x] **Step 5: Run, expect PASS.**

### Task 2: Playground shell

**Files:** `playground/package.json`, `playground/vite.config.js`, `playground/index.html`, `playground/src/styles.css`, root `package.json`

- [x] **Step 1:** Add `"playground"` back to root `workspaces` and add root script `"dev": "npm run dev -w playground"`.
- [x] **Step 2:** `playground/package.json`:

```json
{
  "name": "@minijs/playground",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": {
    "@minijs/lang": "0.0.0",
    "@minijs/runtime": "0.0.0",
    "codemirror": "^6.0.0",
    "@codemirror/lint": "^6.8.0",
    "@codemirror/state": "^6.5.0",
    "@codemirror/view": "^6.38.0",
    "@phosphor-icons/web": "^2.1.0",
    "@fontsource/geist-sans": "^5.2.0",
    "@fontsource/geist-mono": "^5.2.0"
  },
  "devDependencies": { "vite": "^7.0.0" }
}
```

Verify each package exists on npm (`npm view <name> version`) before installing; adjust versions to what exists.

- [x] **Step 3:** `vite.config.js` serves `examples/assets` as the asset base: `publicDir: '../examples'` so `"hero-1.png"` resolves at `/assets/hero-1.png` with `assetsBase: '/assets/'`.
- [x] **Step 4:** `index.html` structure: `<header>` (name, example picker `<select>`, Run/Stop/Restart buttons), `<main class="split">` with `<section class="editor-pane">` and `<section class="game-pane">` (canvas wrapper with fixed aspect from game size, problems list below, perf readout). Labels above controls; the picker has a visible `<label>`.
- [x] **Step 5:** `styles.css` defines tokens on `:root` (`--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-text`, `--danger`), dark overrides under `@media (prefers-color-scheme: dark)`, body background explicit, grid layout per Global Constraints.
- [x] **Step 6:** `npm install`, `npm run dev`, open the page; empty editor and black canvas render with no console errors in both color schemes.

### Task 3: Editor with live diagnostics

**Files:** `playground/src/editor.js`, `playground/src/main.js`

**Interfaces (Produces):**

```js
export interface Editor {
  getText(): string
  setText(text: string): void
  onChange(fn: (text: string) => void): void
  setProblems(errors: MiniError[]): void   // drives CodeMirror lint diagnostics
  jumpTo(line: number, col: number): void
}
export function createEditor(parent: HTMLElement, initial: string): Editor
```

- [x] Map each `MiniError` to a CodeMirror `Diagnostic` spanning from (line, col) to the end of that word (or end of line). `message` = `${error.message}${error.hint ? ' ' + error.hint : ''}`, severity `error`.
- [x] `main.js` loop: on change, debounce 300 ms, `compile(text)`; `editor.setProblems(errors)`; `renderProblems(errors)`; if `program` then `game ? game.reload(program) : (game = await start(program, canvas, { assetsBase: '/assets/' }))`. Runtime errors from `game.on('error')` are appended to the problems list (not the editor).
- [x] While there are compile errors the last good game keeps running, and the problems list says so in one line above the list: "Showing your last working version."
- [x] Clicking a problem calls `editor.jumpTo(line, col)`.

### Task 4: Toolbar, examples, persistence, perf readout

**Files:** `playground/src/examples.js`, `playground/src/storage.js`, `playground/src/perf.js`, `playground/src/problems.js`, `playground/test/storage.test.js`

- [x] Example picker lists every `examples/*.mini` by file name (without extension). Choosing one loads it unless the current text has unsaved edits for a different example; then ask with `confirm()`.
- [x] `storage.js`: `loadSource(key): string | null`, `saveSource(key, text): void`, both try/catch, keyed `minijs:source:<example>`. Test with a `localStorage` stub that throws: functions return null / do nothing, never throw.
- [x] Run = `game.reload(program)` from current text. Stop = `game.stop()`. Restart = `game.reload(game.simulation.program)`.
- [x] Perf readout (`perf.js`): its own `requestAnimationFrame` loop computes fps over a rolling 60 frames, and once per second reads the change in `game.simulation.tickCount` for ticks per second. Show "60 fps" and "60 ticks/s" in Geist Mono, muted color, top-right of the game pane. Hidden below 640px wide. Stop its loop when the page is hidden (`visibilitychange`).
- [x] Focus: clicking the canvas focuses it (`tabindex="0"`) so arrow keys go to the game, not the editor. Show a one-line hint under the canvas: "Click the game, then use the keyboard."

### Task 5: Browser verification

- [x] Run `npm run dev`. With the browser pane: load each example, play it briefly with keys (or `KeyboardEvent` dispatch), confirm movement, collisions, text, and that the problems list is empty.
- [x] Type a typo (`remove cion`) and confirm: underline in editor, problem with "Did you mean "coin"?", clicking it moves the cursor, last good game keeps running.
- [x] Check light and dark mode, 375px and 1280px widths, `prefers-reduced-motion`.
- [x] Run the `design-taste-frontend` pre-flight items that apply to a tool page: em-dash scan, theme lock, color lock, shape lock, button contrast, CTA wrap, form contrast, icons from Phosphor only.
- [x] Save screenshots to `docs/screenshots/` (light and dark).

### Task 6: CI and README

**Files:** `.github/workflows/ci.yml`, `README.md`

- [x] `ci.yml`: on push and pull_request; `actions/checkout@v4`, `actions/setup-node@v4` with Node 22 and npm cache; `npm ci`; `npm test`.
- [x] `README.md`: one-paragraph pitch, a 10-line example, `npm install` / `npm run dev` / `npm test`, a language cheat sheet (blocks, triggers, conditions, expressions, actions; tables copied from spec section 4), links to `docs/spec.md` and the plans. Plain hyphens only.

## Done when

- [x] `npm test` and `npm run bench` pass.
- [x] Playground verified in browser per Task 5 with screenshots saved.
- [x] `handoffs/handoff.md` updated with a new timestamped, model-stamped section.

## As built (2026-10-06)

1. **Runtime change: `keyTarget` start option.** `BrowserInput` listened on `window` and called `preventDefault` on arrows and space, which broke typing in the editor. `start(program, canvas, { keyTarget })` now scopes keys (default still `window`); the playground passes the canvas (`tabindex="0"`). Pointer release is always heard on the window. Spec section 6 mentions it.
2. **Versions:** Vite 8 (current), CodeMirror 6.x. Extra direct deps: `@codemirror/language` + `@lezer/highlight` (light `.mini` coloring in `src/mini-language.js`, cosmetic only) and `@codemirror/commands` (Tab indents).
3. **No confirm when switching examples.** Each example keeps its own saved edits (`minijs:source:<name>`), so switching never loses work. A "Reset example" link restores the original, with a `confirm()` only when there are edits.
4. **Underlines point at the bad name.** Checker errors carry the action's location (`remove the cion` points at `remove`); `toDiagnostic` underlines the quoted name from the message when it is on that line. Tested in `playground/test/editor.test.js`.
5. **Stacked layout puts the game first** (below 1024px) and caps the editor at 60dvh, so phones open on something to play.
6. **Dev hook:** in dev builds only, `window.__minijs` exposes `{ game, editor }` for browser tooling.
7. **Browser verification** was done in a hidden browser pane, where `requestAnimationFrame` is paused. Behavior was checked by sending real `KeyboardEvent`s to the canvas and calling `simulation.tick()` directly: all five examples run with no problems, hero images load, editor keys do not reach the game, typo -> underline + "Did you mean" + click-to-jump + last game keeps running. Real-time feel at 60 fps still needs a person at the keyboard.
8. CI also runs `npm run build`. Screenshots are JPEGs: `docs/screenshots/playground-light.jpg`, `playground-dark-problem.jpg`, `playground-phone-light.jpg`.
