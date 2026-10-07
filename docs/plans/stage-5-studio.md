# Stage 5: minijs Studio (offline web app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: PLANNED, waiting for the user's go-ahead.**

**Goal:** The playground becomes minijs Studio: installable, fully offline after one visit, and able to hand a finished game to anyone as one HTML file, plus project zips and share links.

**Architecture:** Same Vite app in `playground/` (renamed in the UI to "minijs Studio"; folder name stays to keep history). A hand-written service worker precaches the build. A new runtime "player" bundle (runtime only, no compiler, no editor) is built as one IIFE string that the Studio inlines into exported HTML. Zip and share-link code are dependency-free modules using the browser's `CompressionStream`.

**Tech Stack:** Plain JavaScript, Vite 8, Vitest, CodeMirror 6, Phosphor icons, Geist. No new runtime dependencies. Dev-only: `fake-indexeddb` (already present).

**Already done in Stage 4b** (do not rebuild): projects in IndexedDB, disk folders, file tree, uploads, picture preview, autosave, console tabs.

## Read first

1. `docs/spec.md` (whole), `docs/plans/stage-4b-inputs-files.md`.
2. `playground/src/files/project.js` (the `ProjectFs` interface every store follows).
3. The `design-taste-frontend` skill. Same design read and dials as Stage 4 (tool page, `4 / 3 / 5`). Run its pre-flight items that apply to a tool page before calling any task done.
4. The full-output rule: write whole files, never stubs.

## Global constraints

- Zero em dashes or en dashes in visible text. One accent (emerald), zinc neutrals, Geist + Geist Mono, Phosphor only, light and dark, WCAG AA, 8px panels, pill buttons, `prefers-reduced-motion` honored.
- Exported games must run from `file://` with no network, in current Chrome, Edge, Firefox and Safari.
- Every user-facing message is a plain sentence. No stack traces.
- Nothing is uploaded anywhere. Share links carry the game in the URL hash, which browsers do not send to servers.
- Do not commit unless the user asks.

## File map

| File | Responsibility |
|---|---|
| `packages/runtime/src/player.js` | `mountPlayer(root, program, images, options)`: fullscreen canvas, focus, touch buttons, pause on hidden tab, error overlay |
| `packages/runtime/build/player.config.js` | Vite library build of `player.js` to one IIFE file |
| `playground/src/export/html.js` | `exportHtml({ name, program, images }) => string` |
| `playground/src/export/zip.js` | `writeZip(files) => Blob`, `readZip(blob) => Record<string, Blob>` |
| `playground/src/export/share.js` | `encodeShare(source) => string`, `decodeShare(hash) => string \| null` |
| `playground/src/export/dialog.js` | Export dialog UI (HTML game, project zip, share link) |
| `playground/src/sw.js` + `playground/vite-plugin-sw.js` | Service worker and the build plugin that writes its precache list |
| `playground/public-src/manifest.webmanifest`, `scripts/make-icons.mjs` | App manifest and generated PNG icons |
| `playground/src/ui/help.js` | Language reference drawer with search, shortcuts list |
| `playground/src/ui/templates.js` | New-project gallery |
| `playground/src/files/watch.js` | Detect files changed on disk by other programs |
| Tests | `packages/runtime/test/player.test.js`, `playground/test/{zip,share,html,sw-plugin,watch}.test.js` |

---

### Task 1: Split the bundle

- [ ] Lazy-load CodeMirror (`import('./editor.js')`) so the game and file tree paint first; show the file text read-only in a `<pre>` until the editor arrives.
- [ ] Code-split the help drawer and export dialog the same way.
- [ ] Done when `npm run build` has no chunk over 500 KB and first paint shows the running game before the editor.

### Task 2: Runtime player bundle

- [ ] **Test first** (`player.test.js`, jsdom): `mountPlayer` creates one canvas, starts the game, focuses it on click, shows touch buttons when the program asks and the device has touch, pauses the loop on `visibilitychange`, and renders `MiniError`s as a readable overlay instead of throwing.
- [ ] Implement `player.js` on top of `start()`.
- [ ] Library build: `npm run build:player` writes `packages/runtime/dist/player.iife.js` (minified, no source maps). Target under 60 KB.
- [ ] The Studio imports it as a string: `import playerSource from '@minijs/runtime/dist/player.iife.js?raw'`. Add the build to `npm run build` and CI before the Studio build.

### Task 3: Export a game as one HTML file

- [ ] **Test first** (`html.test.js`): output is a complete document (`<!doctype html>`, charset, viewport, title from project name), contains the player script, `JSON.stringify(program)`, and every image as a `data:` URI; contains no `http` URLs; escapes `</script>` inside strings; fits in one file under 20 MB or returns a plain-language error naming the biggest pictures.
- [ ] `exportHtml` inlines a tiny loader: decode images from data URIs, `mountPlayer(document.body, program, images)`, dark letterbox, cursor hidden while playing with keys, "Click to play" overlay so audio-free autoplay rules and focus are handled.
- [ ] Studio: Export button in the top bar (Phosphor `ph-export`, label "Export"). Dialog option "Game as one file (.html)" downloads `<project>-<game>.html`.
- [ ] Verify in the browser pane: open the exported file through `blob:` in a new tab and from `file://` by hand; play with keys and touch emulation; check light and dark host pages make no difference.

### Task 4: Project zip export and import

- [ ] **Test first** (`zip.test.js`, Node 22 has `CompressionStream`): round trip of text, binary and nested folders; reading zips made by macOS Finder, Windows Explorer and `zip -r` (fixtures checked in as small files); refuses paths with `..`; names stay UTF-8.
- [ ] Implement a small zip writer (local headers, deflate via `CompressionStream('deflate-raw')`, CRC32, central directory) and reader (central directory, stored + deflate entries).
- [ ] Dialog option "Whole project (.zip)". New-project menu gets "Open a project zip" which creates a browser project from it.

### Task 5: Share links

- [ ] **Test first** (`share.test.js`): encode/decode round trip, `#play=` opens straight into the game with the editor collapsed, `#code=` opens the Studio with the file, invalid or truncated hashes return null and show "This link is broken or cut off."
- [ ] Projects with pictures can't be shared by link; the dialog says so and offers the zip instead. Links over 8,000 characters warn that some apps cut long links.
- [ ] Opening a link never overwrites anything: it creates a new browser project named after the game, after asking.

### Task 6: Offline and installable

- [ ] `vite-plugin-sw.js` (test: given a fake bundle, it writes `sw.js` listing every emitted file plus `index.html`, with a version hash that changes when any file changes).
- [ ] `sw.js`: precache on install, cache-first for app files, network-first for nothing (the app has no server data), delete old caches on activate, `skipWaiting` only when the user clicks "Update" in a small banner ("A new version is ready. Update").
- [ ] Manifest: name "minijs Studio", short name "minijs", theme and background colors from the zinc tokens, icons 192 and 512 (plus maskable) generated by `scripts/make-icons.mjs` with the PNG writer from `make-example-assets.mjs` (move the encoder to `scripts/png.mjs` and share it).
- [ ] "Install" button appears only after `beforeinstallprompt`.
- [ ] Verify: build, serve with `vite preview`, load once, stop the server, reload: Studio, examples, fonts, icons and export all work. Lighthouse PWA installability passes.

### Task 7: Help and shortcuts

- [ ] Help drawer (Phosphor `ph-question`, label "Help") with the language reference generated from the README cheat sheet tables at build time, a search box (filters rows as you type), and a shortcuts list: Ctrl/Cmd+S save and run, Ctrl/Cmd+Enter run, Ctrl/Cmd+P quick open file (new: fuzzy file finder), F2 rename, Delete delete, Escape closes dialogs.
- [ ] Quick open (Ctrl/Cmd+P): list of project files, arrow keys, Enter opens.

### Task 8: Templates and safer deletes

- [ ] New project opens a small gallery: Blank, Platformer, Top-down, Clicker, Every input (the `controls.mini` example). Each card shows a thumbnail rendered headlessly at build time (draw one frame with the Canvas2D renderer into PNG via `scripts/make-template-thumbs.mjs` and Playwright, or skip thumbnails if no headless browser is available; then cards are text-only).
- [ ] Deleting a file or folder shows "Deleted level-one.mini. Undo" for 10 seconds; undo restores from memory (blobs kept until the toast closes).

### Task 9: Files changed outside the Studio

- [ ] **Test first** (`watch.test.js` with `MemoryFs`): a poller compares `lastModified` and size for disk projects every 2 s while the window has focus, and once on focus.
- [ ] Open file changed on disk and no unsaved edits: reload it quietly and rerun. With unsaved edits: banner "This file changed on disk. Keep mine / Use the disk version."
- [ ] Tree refreshes when files appear or vanish.

## Done when

- [ ] All tests pass (`npm test`), bench under budget, `npm run build` with no oversized chunks.
- [ ] Offline check passes with the server stopped.
- [ ] An exported HTML game runs from `file://` in Chrome and Safari (Safari checked by the user if no Mac browser automation is available), with keyboard and touch.
- [ ] A project zip made in the Studio opens in the Studio on another browser profile.
- [ ] design-taste-frontend pre-flight passes (dashes, theme lock, color lock, shape lock, contrast, button wrap, Phosphor only).
- [ ] `handoffs/handoff.md` has a new timestamped, model-stamped section.

## Questions for the user before starting

1. Keep the name "minijs Studio" for the app?
2. Is a share-link that contains the whole game in the URL fine, or should links be off by default?
