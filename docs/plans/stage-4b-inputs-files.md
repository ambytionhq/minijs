# Stage 4b: Inputs, Console, File Browser (as built)

**Status: DONE (2026-10-06, Claude Opus 5.5).** Built on request after Stage 4; written up after the fact so the stage table stays complete. `npm test` 253/253.

**Asked for:** "add a real file browser on the left, add more things to the problems console area on the bottom right, and make sure it supports a ton of different inputs, including complex ones."

## 1. Inputs (language + runtime)

Spec sections 4.5a, 4.6, 5.1, 6 describe the result. Summary:

| Area | Added |
|---|---|
| Keys | `tab backspace delete ctrl alt`, number-pad digits, `any key` (pressed / held / released, released when the last key goes up) |
| Mouse | left / right / middle buttons, each pressed / held / released, optionally `on <thing>`; condition `mouse is held`, `mouse is over <thing>`; right-click no longer opens the browser menu on the canvas |
| Gamepads | up to 4 pads, 16 standard buttons (`a b x y lb rb lt rt select start ls rs` + d-pad), pressed / held / released; sticks as numbers with a 0.15 deadzone; pads polled once per tick |
| Controls | `control jump` blocks listing keys, mouse buttons and gamepad buttons; one press even when two inputs overlap; works as trigger and condition |
| Touch | `touch buttons` game setting: on-screen arrows + A (space) + B (enter), sized from the game area, shown on touch screens (`touchButtons: 'auto' \| 'always' \| 'never'` start option) |
| Debug | `log "text {expr}"` action, `game.on('log', (text, tick) => ...)` |
| Errors | `unknown-button`, `unknown-control`, `duplicate-control`; `or` between two events explains to use a control |

AST contract changes: `Program.controls`, `GameSettings.touchButtons`, `KeyChoice` (`KeyName | 'any'`), `mouseClick` gained `button` + `state`, new trigger kinds `pad` and `control`, conditions `mouseHeld` `mouseOver` `padHeld` `controlHeld`, expression `stick`, action `log`. `packages/runtime/test/build.js` has builders for all of them.

Runtime files: `input.js` (rewritten around a shared `Buttons` latch for keys, mouse and pads; `BrowserInput.poll()` reads `navigator.getGamepads()`), `controls.js` (new), `touch.js` (new), `rules.js`, `lower/*`, `simulation.js` (`onLog`, controls update after the input snapshot), `game.js` (`log` event, touch buttons).

Tests: `packages/lang/test/inputs.test.js`, `packages/runtime/test/inputs.test.js`, new example `examples/controls.mini` (runs in the examples test).

## 2. Console area (playground)

Tabs under the game: **Problems** (count badge), **Console** (game events, runtime errors, `log` lines with game time, repeats collapsed as `x12`, capped at 500 lines, Clear), **Watch** (every number, how many of each thing, state, time, ticks, camera), **Input** (keys held, mouse position and buttons, each gamepad's buttons and sticks, each control, a switch to show touch buttons on this screen). Watch and Input refresh every 150 ms, only while visible. Code: `playground/src/ui/console.js`.

## 3. File browser (playground)

- **Projects:** built-in Examples (read-only structure, game edits kept in this browser with "Reset this example", "Copy to my projects"), projects in this browser (IndexedDB: New, Rename, Delete), real folders on disk (File System Access API in Chromium browsers: Open folder, remembered across reloads, permission asked again on reopen, Forget).
- **Tree:** folders and files, fold and unfold, open, new game file, new folder, inline rename (F2 or the pencil), delete with confirm, drag to move, drop files from the computer to upload, upload button, reload. Keyboard: arrows, Home, End, Enter, F2, Delete. `running` and `edited` tags.
- **Editor pane:** game files compile and run as you type; other text files edit without running; pictures show a preview with size and the exact `looks like "..."` line to use.
- **Pictures in games** load from the project: next to the running `.mini`, then its `assets/` folder, then the project root.
- Saving is automatic (400 ms after typing stops, flushed before switching files or projects). Ctrl/Cmd+S and Ctrl/Cmd+Enter save and run.

Code: `playground/src/files/` (`paths.js`, `project.js` interface, `memory-fs.js`, `idb.js`, `idb-fs.js`, `disk-fs.js`, `examples-fs.js`, `project-assets.js`), `playground/src/ui/file-tree.js`, `playground/src/main.js`.

Tests: `playground/test/files.test.js` runs one contract suite against the memory and IndexedDB stores (via `fake-indexeddb`), plus examples-store and path tests. The disk store passed the same operations in the browser against the Origin Private File System, which uses the same handle API as a picked folder. The folder picker itself needs a real click and was not automated.

## Verification

- Browser (built-in pane, rAF paused because the pane was hidden): real keyboard and pointer events on the canvas, a fake gamepad through `BrowserInput.readPads`, manual `tick()`s. WASD moved 20 px in 10 ticks, right-mouse dash 28 px, gamepad d-pad + A dash 26 px, full stick 15 px in 5 ticks. Console, Watch, Input tabs filled; touch overlay appeared and its A button presses space.
- File flow in a browser project: new project, folder, file inside it, upload a PNG, preview + "use it" line, game using the uploaded picture, drag to move, delete folder, reload restores project and open file.
- Light, dark, 375 px phone: no horizontal scroll, game first on phones, touch buttons scale with the game.

## Known gaps

- The JS bundle is one 509 KB file (162 KB gzipped), mostly CodeMirror loading up front, so Vite warns about chunk size. Stage 5 splits it.
- Folder access works only in Chromium browsers; others get browser projects only.
- Files changed on disk by other programs show after the reload button, not automatically (Stage 5).
