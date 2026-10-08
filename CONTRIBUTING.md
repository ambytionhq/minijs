# Working on minijs

This page is for people building minijs itself: the language, the engine, Studio, the website and the desktop app. If you want to make games, see the [documentation](docs/README.md) instead.

## Set up

Needs Node 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open the address it prints to use Studio from source. It reloads as you edit.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Studio with live reload |
| `npm test` | Every test, including compiling and running all the example games |
| `npm run bench` | Speed check: 2,000 moving things per tick (target: under 4 ms) |
| `npm run build` | Builds Studio into `playground/dist` as static files |
| `npm run site:dev` | The landing page with live reload |
| `npm run site:build` | Builds the complete website, Studio and all three playable games into `site/dist` |
| `npm run preview -w site` | Previews the complete website after a site build |
| `npm run desktop:dev` | The desktop app (needs Rust, see [apps/desktop](apps/desktop/README.md)) |
| `npm run desktop:build` | Desktop installers for your system |
| `npm run screenshots` | Regenerates the screenshots in `docs/screenshots` |
| `node scripts/make-example-assets.mjs` | Redraws the hero pictures in `examples/basics/assets` |

## How it fits together

```
packages/lang      compile(source) -> { program, errors }. Plain JavaScript, no browser needed.
packages/runtime   start(program, canvas) runs it in a page. Also runs headless for tests.
playground         minijs Studio: projects, file browser, CodeMirror editor, live game, sharing, export.
apps/desktop       Studio in a native window (Tauri), plus "export as app".
site               The landing page at minijs.ambytion.net.
examples           Sample games. Every one is compiled and run by the tests.
```

`@minijs/lang` never imports `@minijs/runtime`. The [spec](docs/spec.md) is the source of truth for the language and engine. If code and spec disagree, fix one of them on purpose and say so in `handoffs/handoff.md`. The user-facing [language guide](docs/language.md) must stay in sync with both.

## Using the engine in your own page

```js
import { compile } from '@minijs/lang'
import { start } from '@minijs/runtime'

const { program, errors } = compile(source)
if (program) {
  const game = await start(program, canvas, { assetsBase: '/assets/' })
  game.on('error', (e) => console.warn(e.message, e.hint))
  game.on('log', (text) => console.log(text))
}
```

`errors` is a list of `{ code, message, hint, line, col }`. Messages are written for people who don't code; treat their wording as part of the product. The full API, including headless simulation for tests, is in [spec section 6](docs/spec.md#6-public-api).

## Writing for users

Error messages, Studio text and the docs in `docs/` are read by people who have never programmed.

- Plain words. "Thing", not "entity". "Number", not "variable".
- Say what to do, not only what went wrong.
- Short sentences. One idea each.
- Every `mini` code block in `docs/` should compile. Check them after changing the language.

## Deploying the website

Vercel builds are configured in `vercel.json`. The repository-root deployment runs `npm run site:build` and publishes `site/dist`. Projects whose Root Directory is `site` use `site/vercel.json`; enable access to files outside that directory so the build can include the sibling Studio, language, runtime and example workspaces. The site workspace's `npm run build` also builds the complete website from a clean checkout.

To deploy Studio independently, import this repository as a second Vercel project with Root Directory `playground` and access to files outside that directory enabled. `playground/vercel.json` installs the repository's dependencies, builds Studio and publishes `playground/dist`. After deploying, add these rules to the main site's `vercel.json`, replacing `YOUR-STUDIO-PROJECT.vercel.app` with the second project's stable production hostname:

```json
{
  "redirects": [
    { "source": "/studio", "destination": "/studio/", "permanent": true }
  ],
  "rewrites": [
    {
      "source": "/studio/:path*",
      "destination": "https://YOUR-STUDIO-PROJECT.vercel.app/:path*"
    }
  ]
}
```

Merge these fields with the existing build settings. The rewrite forwards Studio pages, assets, manifest and service worker while preserving `/studio/` in the browser. Its relative Vite base supports both the direct project URL and the proxied path. Cloudflare DNS keeps pointing the domain at the main Vercel project; path routing happens in Vercel.

## Releasing the desktop app

Studio checks for signed updates automatically and offers **Install and restart**. It saves open work before installing, and restarting always requires the user's choice. Copies installed before 0.1.1 need one manual install to switch to the public update feed.

Releases live in this public repository. The release workflow uses the repository's `TAURI_SIGNING_PRIVATE_KEY` secret and the public key embedded in the app. Keep that key pair stable so existing installations can verify future updates. Set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only if the signing key has a password.

To release, update the root and desktop package versions and their lockfiles, push a matching `v<version>` tag, and watch **Release desktop app** in GitHub Actions. The workflow builds Mac (Intel and Apple silicon), Windows and Linux installers in a draft. It publishes only after all updater targets and signatures pass checks, then verifies the public `latest.json` download used by the app.

More detail, including signing, is in [apps/desktop/README.md](apps/desktop/README.md).

## Plans

Stage plans live in [`docs/plans/`](docs/plans/). What's next is in [`docs/plans/roadmap-stages-5-7.md`](docs/plans/roadmap-stages-5-7.md).
