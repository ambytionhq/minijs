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

Pushing a tag like `v0.2.0` runs `.github/workflows/release.yml`. The workflow builds all three systems in a draft release in the public **`ambytionhq/minijs`** repository. It checks that the updater manifest contains signed downloads for macOS Intel, macOS Apple silicon, Windows x64 and Linux x64 before publishing. Failed builds leave a draft, so installed apps never discover a partial release.

The app downloads `https://github.com/ambytionhq/minijs/releases/latest/download/latest.json` without authentication. Website downloads point to the same repository. A separate releases repository or personal access token is no longer needed. The workflow uses its scoped `GITHUB_TOKEN` with `contents: write` permission.

Signing setup:

- `TAURI_SIGNING_PRIVATE_KEY`: the contents of the original updater private key, stored as a repository Actions secret. The matching public key stays in `src-tauri/tauri.conf.json`.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: required only if that key has a password. The existing key has no password.
- Keep a secure backup of the original key. Changing it prevents existing installations from trusting later updates.

To release:

1. Bump `version` in the root `package.json`, update the lockfile with `npm install --package-lock-only`, and commit the changes. The desktop app reads its version from the root package.
2. Tag that commit with the matching version, for example `git tag v0.2.0`, then push the commit and tag.
3. Check the **Release desktop app** workflow. It publishes only after all builds and updater checks pass. Manual workflow runs use the root package version and refuse to overwrite an already published version.

The app checks eight seconds after opening, every six hours, after reconnecting, and when returning to the app after five minutes. **Check for updates** is also available in the native menu and the projects-page footer. Installation waits for open saves and refuses to restart if saving failed. Download failures keep the update available to retry.

Installations built with the former `minijs-releases` endpoint need one manual installation of this version to move to the public repository. The endpoint is embedded in the installed binary; making the source repository public cannot change it retroactively.

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
