# minijs Studio for desktop

The Studio from `playground/` in a native window for macOS, Windows and Linux, built with [Tauri 2](https://tauri.app). Installers are about 4 MB.

What the desktop app adds to the web Studio:

- **Real folders** with no permission prompts after a restart (`playground/src/files/tauri-fs.js`).
- **Native Save and Open windows** for exports.
- **Double-click a `.mini` file** to open its folder as a project.
- **Export as app:** the game opens straight into play, with its own name and no editor. The Studio copies itself and writes the game beside the copy as `game.minipack`, so nobody needs a compiler (`src-tauri/src/export.rs`).
- **Self-updates:** signed, checked a few seconds after start and every 6 hours, installed only when the person clicks Install.

## Run it

Needs Rust (stable) on top of the usual Node setup. On Linux also `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.

```bash
npm run desktop:dev
```

```bash
npm run desktop:build
```

`MINIJS_PLAYER_GAME=/path/to/game.minipack npm run desktop:dev` starts in exported-game mode.

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Releases and updates

Pushing a tag like `v0.2.0` runs `.github/workflows/release.yml`, which builds all three systems and publishes to **`ambytionhq/minijs-releases`**. That repository must be public: the app downloads updates from `https://github.com/ambytionhq/minijs-releases/releases/latest/download/latest.json`, and a private repository's files can't be downloaded without a login.

One-time setup:

1. Create the public repository `ambytionhq/minijs-releases` (it can stay empty apart from a README).
2. In this repository's settings, add the secrets:
   - `RELEASES_TOKEN`: a fine-grained token with "Contents: read and write" on `minijs-releases`.
   - `TAURI_SIGNING_PRIVATE_KEY`: the contents of the updater private key. It was generated at `~/.tauri/minijs-updater.key` with no password. Keep a backup somewhere safe: if it is lost, installed apps can't accept updates any more.
3. Bump `version` in the root `package.json` (the app reads its version from there), commit, then tag and push.

The matching public key is in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

## Signing

The app is not code-signed yet. macOS asks people to right-click and choose Open the first time; Windows SmartScreen shows "More info, then Run anyway". Exported games are signed ad-hoc on macOS so Apple silicon Macs will start them. To sign properly later, add an Apple Developer ID and a Windows certificate to the release workflow (Tauri's `APPLE_*` and `WINDOWS_CERTIFICATE` settings).

## Layout

| Path | What it is |
|---|---|
| `src-tauri/src/lib.rs` | Plugins, commands (`startup`, `take_opened_files`, `export_app`), opened files |
| `src-tauri/src/menu.rs` | Menu bar for the Studio and for exported games |
| `src-tauri/src/startup.rs` | Finds `game.minipack` beside an exported app |
| `src-tauri/src/export.rs` | Export as app: copy, rename, write the game, ad-hoc sign on macOS |
| `src-tauri/capabilities/default.json` | What the window may do; file access only grows with picked folders |
| `playground/src/desktop/` | The web side: `bridge.js` (menu, save windows, links, full screen), `updates.js` |
