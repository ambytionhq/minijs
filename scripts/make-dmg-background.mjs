// The picture behind the icons when someone opens the minijs Studio .dmg on a
// Mac. Drawn as a small web page (Geist type, a Phosphor arrow, Cloud Hopper's
// pixel art) and photographed by headless Chrome at 1x and 2x, then joined
// into one Retina-ready TIFF so it stays sharp on every Mac.
//
// The window is 660 by 420 points. Finder places the app icon centre at
// (170, 214) and the Applications folder at (490, 214), matching
// `bundle.macOS.dmg` in apps/desktop/src-tauri/tauri.conf.json.
//
// Run: node scripts/make-dmg-background.mjs  (macOS: uses `tiffutil`)

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'apps/desktop/src-tauri/dmg')
const WIDTH = 660
const HEIGHT = 420
const APP = { x: 170, y: 214 }
const APPS = { x: 490, y: 214 }

const CHROME = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].find((p) => p && existsSync(p))

const font = (weight) =>
  pathToFileURL(join(ROOT, `node_modules/@fontsource/geist-sans/files/geist-sans-latin-${weight}-normal.woff2`)).href
const phosphor = pathToFileURL(join(ROOT, 'node_modules/@phosphor-icons/web/src/light/Phosphor-Light.woff2')).href
const arrowGlyph = (() => {
  // Read the arrow's code point from Phosphor's own stylesheet instead of hard-coding it.
  const css = readFileSync(join(ROOT, 'node_modules/@phosphor-icons/web/src/light/style.css'), 'utf8')
  const match = css.match(/\.ph-light\.ph-arrow-right:before\s*\{\s*content:\s*"\\([0-9a-f]+)"/i)
  if (!match) throw new Error('Could not find ph-arrow-right in Phosphor Light')
  return String.fromCodePoint(Number.parseInt(match[1], 16))
})()

const asset = (name) => pathToFileURL(join(ROOT, 'examples/cloud-hopper/assets', name)).href

// Finder always draws the icon names in black, so the picture stays light:
// Cloud Hopper's sky, its pixel clouds, and a strip of its grass.
const page = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @font-face { font-family: Geist; src: url("${font(400)}") format("woff2"); font-weight: 400; }
  @font-face { font-family: Geist; src: url("${font(500)}") format("woff2"); font-weight: 500; }
  @font-face { font-family: Geist; src: url("${font(600)}") format("woff2"); font-weight: 600; }
  @font-face { font-family: PhosphorLight; src: url("${phosphor}") format("woff2"); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    position: relative;
    font-family: Geist, sans-serif;
    -webkit-font-smoothing: antialiased;
    background:
      radial-gradient(300px 180px at 50% 58%, rgba(255, 255, 255, 0.75), transparent 72%),
      linear-gradient(180deg, #bfe4ff 0%, #dcf0ff 48%, #f1f9ff 100%);
  }
  .pixel { position: absolute; image-rendering: pixelated; }
  .cloud-a { left: 26px; top: 30px; width: 120px; opacity: 0.95; }
  .cloud-b { left: 532px; top: 24px; width: 96px; opacity: 0.85; }
  h1 {
    position: absolute; top: 50px; left: 0; right: 0;
    text-align: center; font-size: 20px; font-weight: 600; letter-spacing: -0.015em; color: #18181b;
  }
  p.sub {
    position: absolute; top: 80px; left: 0; right: 0;
    text-align: center; font-size: 13px; color: #3f4a57;
  }
  .arrow {
    position: absolute; left: ${(APP.x + APPS.x) / 2}px; top: ${APP.y}px;
    transform: translate(-50%, -50%);
    width: 56px; height: 56px; border-radius: 999px;
    display: grid; place-items: center;
    background: rgba(255, 255, 255, 0.85);
    box-shadow: inset 0 0 0 1px rgba(4, 120, 87, 0.22), 0 8px 24px rgba(40, 110, 170, 0.18);
    font-family: PhosphorLight; font-size: 28px; color: #047857;
  }
  footer {
    position: absolute; bottom: 56px; left: 0; right: 0; text-align: center;
    font-size: 12px; color: #3f4a57;
  }
  footer b { color: #18181b; font-weight: 600; }
  .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 36px; }
  .grass {
    position: absolute; left: 0; right: 0; top: 0; height: 18px;
    background: url("${asset('grass.png')}") repeat-x 0 0 / 18px 18px; image-rendering: pixelated;
  }
  .dirt {
    position: absolute; left: 0; right: 0; top: 18px; bottom: 0;
    background: url("${asset('dirt.png')}") repeat 0 0 / 18px 18px; image-rendering: pixelated;
  }
</style>
</head>
<body>
  <img class="pixel cloud-a" src="${asset('sky-cloud.png')}" alt="" />
  <img class="pixel cloud-b" src="${asset('sky-cloud.png')}" alt="" />
  <h1>Drag minijs Studio into Applications</h1>
  <p class="sub">Then open it from Launchpad or your Applications folder.</p>
  <div class="arrow">${arrowGlyph}</div>
  <footer>First time? Right-click the app and choose <b>Open</b>.</footer>
  <div class="ground"><div class="grass"></div><div class="dirt"></div></div>
</body>
</html>`

function shoot(htmlFile, scale, out) {
  execFileSync(CHROME, [
    '--headless=new',
    '--hide-scrollbars',
    '--disable-gpu',
    '--no-first-run',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--force-device-scale-factor=${scale}`,
    '--virtual-time-budget=2000',
    `--screenshot=${out}`,
    pathToFileURL(htmlFile).href,
  ], { stdio: 'ignore' })
  if (!existsSync(out)) throw new Error(`Chrome did not write ${out}`)
}

if (!CHROME) throw new Error('Chrome not found. Set CHROME=/path/to/chrome.')
const work = mkdtempSync(join(tmpdir(), 'minijs-dmg-'))
try {
  const html = join(work, 'background.html')
  writeFileSync(html, page)
  const one = join(OUT, 'background.png')
  const two = join(OUT, 'background@2x.png')
  execFileSync('mkdir', ['-p', OUT])
  shoot(html, 1, one)
  shoot(html, 2, two)
  // One file with both sizes: Finder picks the sharp one on Retina screens.
  execFileSync('tiffutil', ['-cathidpicheck', one, two, '-out', join(OUT, 'background.tiff')])
  console.log(`wrote ${join(OUT, 'background.tiff')} (plus the 1x and 2x PNGs)`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
