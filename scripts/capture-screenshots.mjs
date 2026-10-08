// Sharp 2x screenshots of the Studio and the showcase games, for the README
// and the website. Drives a headless Chrome over the DevTools protocol, so it
// can press keys and wait for real gameplay instead of grabbing title screens.
//
// Needs: `npm run build` (the Studio in playground/dist) and
// `npm run games:export` (site/public/play). Chrome is found in the usual
// places, or set CHROME=/path/to/chrome.
//
// Run: node scripts/capture-screenshots.mjs

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const STUDIO = join(ROOT, 'playground/dist')
const PLAY = join(ROOT, 'site/public/play')
const DOCS_OUT = join(ROOT, 'docs/screenshots')
const SITE_OUT = join(ROOT, 'site/public/shots')

const CHROME_PATHS = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
})

/** Serve a folder at /studio/ and another at /play/. */
function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let base = null
    let rest = ''
    if (url.pathname.startsWith('/studio/')) {
      base = STUDIO
      rest = url.pathname.slice('/studio/'.length) || 'index.html'
    } else if (url.pathname.startsWith('/play/')) {
      base = PLAY
      rest = url.pathname.slice('/play/'.length)
    }
    const file = base ? join(base, normalize(decodeURIComponent(rest)).replace(/^(\.\.[/\\])+/, '')) : ''
    if (!base || !existsSync(file)) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  return new Promise((resolve) => server.listen(0, () => resolve(server)))
}

/** Minimal DevTools protocol client over the WebSocket built into Node 22. */
class Cdp {
  /** @param {string} url */
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    return new Cdp(ws)
  }

  /** @param {WebSocket} ws */
  constructor(ws) {
    this.ws = ws
    this.id = 0
    /** @type {Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>} */
    this.pending = new Map()
    /** @type {Array<{ method: string; fn: (params: any) => void }>} */
    this.waiters = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data))
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) p?.reject(new Error(msg.error.message))
        else p?.resolve(msg.result)
      } else if (msg.method) {
        this.waiters = this.waiters.filter((w) => {
          if (w.method !== msg.method) return true
          w.fn(msg.params)
          return false
        })
      }
    })
  }

  /** @param {string} method @param {object} [params] @param {string} [sessionId] */
  send(method, params = {}, sessionId) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  /** @param {string} method */
  once(method) {
    return new Promise((fn) => this.waiters.push({ method, fn }))
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const KEYS = /** @type {Record<string, [string, number]>} */ ({
  ArrowRight: ['ArrowRight', 39],
  ArrowLeft: ['ArrowLeft', 37],
  ArrowUp: ['ArrowUp', 38],
  ArrowDown: ['ArrowDown', 40],
  Space: [' ', 32],
  Enter: ['Enter', 13],
})

/** One browser tab with helpers. */
class Page {
  /** @param {Cdp} cdp @param {string} sessionId */
  constructor(cdp, sessionId) {
    this.cdp = cdp
    this.session = sessionId
  }

  /** @param {string} method @param {object} [params] */
  send(method, params) {
    return this.cdp.send(method, params, this.session)
  }

  /** @param {{ width: number; height: number; scale?: number; mobile?: boolean; dark?: boolean }} view */
  async setView({ width, height, scale = 2, mobile = false, dark = true }) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile })
    await this.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
        { name: 'prefers-reduced-motion', value: 'no-preference' },
      ],
    })
  }

  /** @param {string} url */
  async go(url) {
    await this.send('Page.navigate', { url })
    await sleep(1200)
    await this.eval('document.fonts.ready.then(() => true)')
  }

  /** @param {string} expression */
  async eval(expression) {
    const result = /** @type {any} */ (await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))
    return result.result?.value
  }

  /** @param {string} key @param {'keyDown' | 'keyUp'} type */
  async key(key, type) {
    const [k, code] = KEYS[key] ?? [key, key.toUpperCase().charCodeAt(0)]
    await this.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code: key === 'Space' ? 'Space' : key.length === 1 ? `Key${key.toUpperCase()}` : key,
      windowsVirtualKeyCode: code,
    })
  }

  /** Hold keys for a while. @param {string[]} keys @param {number} ms */
  async hold(keys, ms) {
    for (const k of keys) await this.key(k, 'keyDown')
    await sleep(ms)
    for (const k of keys) await this.key(k, 'keyUp')
  }

  /** @param {string} key */
  async tap(key) {
    await this.hold([key], 80)
  }

  /** @param {number} x @param {number} y */
  async click(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
    }
  }

  /** @param {string} file @param {'png' | 'webp' | 'jpeg'} [format] */
  async shot(file, format = 'webp') {
    const { data } = /** @type {any} */ (await this.send('Page.captureScreenshot', { format, quality: format === 'png' ? undefined : 90 }))
    writeFileSync(file, Buffer.from(data, 'base64'))
    console.log(`wrote ${file}`)
  }
}

async function main() {
  const chrome = CHROME_PATHS.find((p) => p && existsSync(p))
  if (!chrome) throw new Error('Chrome not found. Set CHROME=/path/to/chrome.')
  if (!existsSync(join(STUDIO, 'index.html'))) throw new Error('Build the Studio first: npm run build')
  if (!existsSync(join(PLAY, 'cloud-hopper.html'))) throw new Error('Export the games first: npm run games:export')
  mkdirSync(DOCS_OUT, { recursive: true })
  mkdirSync(SITE_OUT, { recursive: true })

  const server = /** @type {import('node:http').Server} */ (await serve())
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port
  const origin = `http://localhost:${port}`
  const profile = mkdtempSync(join(tmpdir(), 'minijs-shots-'))
  const browser = spawn(chrome, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ])
  const wsUrl = await new Promise((resolve, reject) => {
    let text = ''
    browser.stderr.on('data', (chunk) => {
      text += chunk
      const match = text.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) resolve(match[1])
    })
    browser.on('exit', () => reject(new Error(`Chrome exited:\n${text}`)))
  })

  try {
    const cdp = await Cdp.connect(wsUrl)
    const { targetId } = /** @type {any} */ (await cdp.send('Target.createTarget', { url: 'about:blank' }))
    const { sessionId } = /** @type {any} */ (await cdp.send('Target.attachToTarget', { targetId, flatten: true }))
    const page = new Page(cdp, sessionId)
    await page.send('Page.enable')
    await page.send('Runtime.enable')

    // Games, mid-play.
    /** @type {Array<[string, (p: Page) => Promise<void>]>} */
    const games = [
      [
        'cloud-hopper',
        async (p) => {
          await p.tap('Space')
          await sleep(400)
          await p.hold(['ArrowRight'], 700)
          await p.hold(['ArrowRight', 'ArrowUp'], 260)
          await p.hold(['ArrowRight'], 380)
        },
      ],
      [
        'star-defender',
        async (p) => {
          await p.tap('Space')
          await sleep(300)
          await p.hold(['Space', 'ArrowLeft'], 900)
          await p.hold(['Space', 'ArrowRight'], 1400)
          await p.hold(['Space'], 500)
        },
      ],
      [
        'crypt-dash',
        async (p) => {
          await p.tap('Space')
          await sleep(300)
          await p.hold(['ArrowRight'], 500)
          await p.hold(['ArrowDown'], 400)
        },
      ],
    ]
    for (const [name, play] of games) {
      await page.setView({ width: 960, height: 540 })
      await page.go(`${origin}/play/${name}.html`)
      await page.eval('document.querySelector("canvas")?.focus(), true')
      await play(page)
      await page.shot(join(SITE_OUT, `${name}.webp`))
    }

    // Real projects in the disposable screenshot profile make the projects-first
    // home page representative of everyday use.
    for (const [folder, name] of [['cloud-hopper', 'Cloud garden'], ['star-defender', 'Star keeper'], ['crypt-dash', 'Night walk']]) {
      await page.go(`${origin}/studio/#/p/${encodeURIComponent(`example:${folder}`)}/game.mini`)
      await sleep(2000)
      await page.eval('document.querySelector("#project-actions button")?.click(), true')
      await sleep(100)
      await page.eval(`document.querySelector("dialog input").value = ${JSON.stringify(name)}, true`)
      await page.eval('document.querySelector("dialog button[type=submit]")?.click(), true')
      await sleep(800)
    }

    // The Studio, dark and light.
    for (const dark of [true, false]) {
      const mode = dark ? 'dark' : 'light'
      await page.setView({ width: 1440, height: 900, dark })
      await page.go(`${origin}/studio/#/`)
      await sleep(1500)
      await page.shot(join(DOCS_OUT, `studio-home-${mode}.webp`))
      await page.shot(join(SITE_OUT, `studio-home-${mode}.webp`))

      await page.go(`${origin}/studio/#/p/${encodeURIComponent('example:cloud-hopper')}/game.mini`)
      await sleep(2500)
      await page.eval('document.getElementById("game")?.focus(), true')
      await page.tap('Space')
      await sleep(300)
      await page.hold(['ArrowRight'], 900)
      await page.hold(['ArrowRight', 'ArrowUp'], 250)
      await page.hold(['ArrowRight'], 300)
      await page.shot(join(DOCS_OUT, `studio-workspace-${mode}.webp`))
      await page.shot(join(SITE_OUT, `studio-workspace-${mode}.webp`))
    }

    await page.setView({ width: 1440, height: 900, dark: true })
    await page.go(`${origin}/studio/#/learn`)
    await sleep(2500)
    await page.shot(join(DOCS_OUT, 'studio-tutorial.webp'))
    await page.shot(join(SITE_OUT, 'studio-tutorial.webp'))

    await page.setView({ width: 390, height: 844, scale: 3, mobile: true, dark: true })
    await page.go(`${origin}/studio/#/`)
    await sleep(1500)
    await page.shot(join(DOCS_OUT, 'studio-phone.webp'))
  } finally {
    const exited = new Promise((resolve) => browser.once('exit', resolve))
    browser.kill()
    await exited
    server.close()
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

await main()
