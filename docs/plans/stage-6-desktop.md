# Stage 6: Desktop App (macOS, Windows, Linux) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: PLANNED, waiting for the user's go-ahead and the decisions at the bottom.** Requires Stage 5 (player bundle and HTML export).

**Goal:** minijs Studio as a real desktop app on all three systems, opening and saving project folders directly, plus "Export as app" that turns one game into its own small app for players.

**Architecture:** Tauri 2. The Studio web build is the app's frontend, unchanged except for one new `ProjectFs` store (`TauriFs`) and a native menu. A second, tiny Tauri app, the **player**, contains only the Stage 5 player bundle and reads its game from a `game/` folder of resources. "Export as app" copies a prebuilt player for the chosen system and writes the game next to it, so people exporting need no compilers. GitHub Actions builds both apps for all three systems.

**Tech Stack:** Tauri 2 (Rust shell, system web view), `@tauri-apps/api`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-shell` (reveal in Finder/Explorer), `tauri-action` in CI. Rust stable is needed on build machines and CI, not by people using the app.

## Why Tauri

| | Tauri 2 | Electron |
|---|---|---|
| Download size | about 5 to 15 MB | about 90 to 150 MB |
| Engine | System web view (WebKit on macOS and Linux, WebView2 on Windows) | Bundled Chromium |
| Folder access | Native, through plugins | Native, through Node |
| Risk | Small differences between web views; our code already targets Safari and Chrome | Same Chromium everywhere |

The Studio is plain web code that already runs in Safari and Chrome, so Tauri's web view differences are low risk and the small download matters for a tool aimed at beginners.

## Read first

1. `docs/plans/stage-5-studio.md` (player bundle, HTML export).
2. `playground/src/files/project.js` and `disk-fs.js` (the store to mirror).
3. Tauri 2 docs for `fs`, `dialog`, capabilities (permissions), bundler, and updater.
4. `design-taste-frontend` for any new UI (menus follow each system's conventions instead).

## Global constraints

- The desktop app and the web Studio share one codebase. Desktop-only code lives behind `isDesktop()` and is loaded dynamically.
- Tauri capabilities allow file access only inside folders the user picked or recent folders; no broad home-directory access.
- No telemetry, no network calls except the optional updater (decision below).
- Do not commit unless the user asks.

## File map

| File | Responsibility |
|---|---|
| `apps/studio-desktop/src-tauri/` | Tauri project: `tauri.conf.json`, `Cargo.toml`, `capabilities/default.json`, `src/main.rs` (menu, file association handling, recent folders) |
| `apps/player/src-tauri/` | Player shell: loads `resources/game/index.html` (the Stage 5 exported HTML), fullscreen toggle, no menus beyond Quit |
| `playground/src/files/tauri-fs.js` | `TauriFs implements ProjectFs` over `@tauri-apps/plugin-fs` |
| `playground/src/desktop/menu.js` | Wire native menu events to Studio actions |
| `playground/src/desktop/export-app.js` | Copy player + write game files for macOS, Windows, Linux |
| `.github/workflows/desktop.yml` | Matrix build on tags, upload installers to the release |
| Tests | `playground/test/tauri-fs.test.js` (with `@tauri-apps/api/mocks`), `playground/test/export-app.test.js` (layout of exported folders) |

---

### Task 1: Scaffold both Tauri apps

- [ ] `npm create tauri-app` style scaffold by hand (no template code left unused). Studio frontend dist = `playground/dist`. Player frontend = a static folder.
- [ ] Root scripts: `npm run desktop:dev`, `npm run desktop:build`, `npm run player:build`.
- [ ] App identity: name "minijs Studio", identifier `dev.minijs.studio` (decision below), icons from Stage 5 `make-icons.mjs` at all required sizes.

### Task 2: `TauriFs`

- [ ] **Test first:** run the same contract suite as `files.test.js` against `TauriFs` with mocked IPC (an in-memory fake file system behind `mockIPC`).
- [ ] Implement list (skip `node_modules`, `.git`, dot folders, 3,000 entry cap like `DiskFs`), read/write text and binary, mkdir, rename (native rename, falls back to copy+delete across devices), remove, exists.
- [ ] Project picker shows "Folders on this computer" from a recent-folders list stored by the Rust side, not IndexedDB handles.

### Task 3: Native menus and file associations

- [ ] File: New Project, Open Folder, Open Recent, Export (HTML, App, Zip), Close Window. Edit: standard. View: Toggle Files, Toggle Console, Zoom. Help: Language Reference, Open Examples.
- [ ] Double-clicking a `.mini` file opens its folder as a project with that file open.
- [ ] Window size and position remembered.

### Task 4: Player app and "Export as app"

- [ ] Player: fixed window sized to the game's aspect ratio (resizable, letterboxed), fullscreen with F11 / Ctrl+Cmd+F, pauses when minimized.
- [ ] CI builds the player for macOS (universal), Windows x64, Linux x64 and attaches them to the release; the Studio downloads the matching player once, on first export, and keeps it (offline afterwards). If the user is offline at first export, it says so and offers the HTML export.
- [ ] Export as app writes:
  - macOS: `<Game>.app` (player bundle copy) with the game in `Contents/Resources/game/`. Unsigned unless signing is set up (decision below); the dialog explains "right-click, Open" the first time.
  - Windows: a folder `<Game>/` with `<Game>.exe` and `game/`, zipped.
  - Linux: a folder with the binary and `game/`, as `.tar.gz`.
- [ ] **Test first** for the folder layouts and file names (pure functions given a fake player tree).

### Task 5: CI and releases

- [ ] `desktop.yml`: on tag `v*`, matrix `macos-latest`, `windows-latest`, `ubuntu-22.04`; install Rust and Node 22; `npm ci`; build Studio web, player bundle, both Tauri apps; upload `.dmg`, `.msi` and `.exe`, `.AppImage` and `.deb`, plus player archives.
- [ ] Smoke test in CI on Linux with `tauri-driver` (WebDriver): app opens, examples load, a game runs 60 ticks with no problems.

### Task 6: Updates (only if the user wants them)

- [ ] Tauri updater with signed update manifests on GitHub Releases. Off by default; Settings has "Check for updates".

## Done when

- [ ] Installers build in CI for all three systems.
- [ ] On each system (user checks the two the agent cannot run): open a folder, edit, save, run, export as app, launch the exported game.
- [ ] All web tests still pass; the web Studio is unaffected when not running in Tauri.
- [ ] `handoffs/handoff.md` updated.

## Decisions for the user before starting

1. **Tauri or Electron?** Recommendation: Tauri (small downloads).
2. **Code signing?** Without it, macOS shows "unidentified developer" (right-click, Open works) and Windows SmartScreen warns. Signing needs an Apple Developer account (99 USD a year) and a Windows code-signing certificate. Recommendation: ship unsigned first, sign later.
3. **App identifier and publisher name** (for example `dev.minijs.studio`, publisher "minijs"). These are hard to change after the first release.
4. **Auto-update:** off, or on through GitHub Releases?
