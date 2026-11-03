// The standalone player: everything an exported game page needs and nothing
// else (no compiler, no editor). Exported HTML files call MiniPlayer.mount().

import { start } from './game.js'
import { PLACEHOLDER_SIZE } from './config.js'

/** @import { MiniError, Program } from '@minijs/lang' */
/** @import { LoadedImage } from './assets.js' */

/** Loads pictures from data: URLs keyed by the name the game uses. */
export class DataUrlAssetLoader {
  /**
   * @param {Record<string, string>} images picture name in the game -> data URL
   * @param {Record<string, string>} [files] other files: text as it is, recordings as data URLs
   */
  constructor(images, files = {}) {
    this.images = images
    this.files = files
  }

  /**
   * @param {string} src
   * @returns {Promise<string | null>}
   */
  async loadText(src) {
    return this.files[src] ?? null
  }

  /**
   * @param {string} src
   * @returns {Promise<ArrayBuffer | null>}
   */
  async loadBytes(src) {
    const url = this.files[src]
    if (!url) return null
    try {
      return await (await fetch(url)).arrayBuffer()
    } catch {
      return null
    }
  }

  /**
   * @param {string} src
   * @returns {Promise<LoadedImage>}
   */
  load(src) {
    const url = this.images[src]
    const missing = { src, width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE, source: null, missing: true }
    if (!url) return Promise.resolve(missing)
    return new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve({ src, width: image.naturalWidth, height: image.naturalHeight, source: image, missing: false })
      image.onerror = () => resolve(missing)
      image.src = url
    })
  }
}

/**
 * @param {string} tag
 * @param {Partial<CSSStyleDeclaration>} style
 * @param {string} [text]
 */
function el(tag, style, text) {
  const node = document.createElement(tag)
  Object.assign(node.style, style)
  if (text !== undefined) node.textContent = text
  return node
}

/**
 * A small button to turn the game's sound off and on. The M key does the same.
 * @param {import('./game.js').Game} game
 */
function soundToggle(game) {
  const button = /** @type {HTMLButtonElement} */ (
    el('button', {
      position: 'absolute',
      top: '10px',
      right: '10px',
      padding: '6px 12px',
      borderRadius: '999px',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      background: 'rgba(12, 12, 16, 0.72)',
      color: '#f4f4f5',
      font: '600 12px/1.2 system-ui, sans-serif',
      cursor: 'pointer',
    })
  )
  let muted = false
  const flip = () => {
    muted = !muted
    game.setMuted(muted)
    draw()
  }
  const draw = () => {
    button.textContent = muted ? 'Sound off' : 'Sound on'
    button.setAttribute('aria-pressed', String(muted))
  }
  draw()
  button.type = 'button'
  button.addEventListener('click', () => {
    flip()
    game.canvas.focus({ preventScroll: true })
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      // A game may use M itself, so this only runs for games that don't.
      const usesM = game.simulation.program.rules.some((r) => r.trigger.kind === 'key' && r.trigger.key === 'm')
      if (!usesM) flip()
    }
  })
  return button
}

/**
 * Fill `root` with the game: a canvas that fits the window, a "click to play"
 * card (browsers only send keys after a click), and a readable message if
 * something goes wrong.
 * @param {{ root: HTMLElement; program: Program; images: Record<string, string>; files?: Record<string, string>; title: string }} options
 */
export async function mount({ root, program, images, files = {}, title }) {
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: 'minmax(0, 1fr)',
    placeItems: 'center',
    background: '#0c0c10',
    overflow: 'hidden',
  })
  const frame = el('div', {
    position: 'relative', width: '100%', height: '100%', minWidth: '0', minHeight: '0',
    display: 'grid', placeItems: 'center', gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'minmax(0, 1fr)',
  })
  const canvas = /** @type {HTMLCanvasElement} */ (el('canvas', { display: 'block', outline: 'none' }))
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', `${title}. Use the keyboard, mouse, a gamepad or touch to play.`)
  frame.append(canvas)
  root.append(frame)

  /** @param {MiniError} error */
  const showError = (error) => {
    const box = el(
      'div',
      {
        position: 'absolute',
        left: '50%',
        bottom: '16px',
        transform: 'translateX(-50%)',
        maxWidth: 'min(560px, calc(100% - 32px))',
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'rgba(42, 21, 19, 0.92)',
        color: '#ffd9d4',
        font: '14px/1.4 system-ui, sans-serif',
      },
      `Line ${error.line}: ${error.message}${error.hint ? ` ${error.hint}` : ''}`,
    )
    frame.append(box)
  }

  const game = await start(program, canvas, {
    assets: new DataUrlAssetLoader(images, files),
    keyTarget: window,
    touchButtons: 'auto',
  })
  game.on('error', showError)
  game.stop()

  // Stop spending frames when an embedded game scrolls offscreen. Restarting
  // the loop resets its clock, so returning never fast-forwards the game.
  let visible = true
  const syncPlayback = () => {
    if (game.destroyed) return
    if (!visible || document.hidden) {
      game.loop.stop()
      game.input.releaseAll()
      game.audio?.suspend()
    } else if (!game.simulation.stopped) {
      game.loop.start()
      game.audio?.resume()
    }
  }
  const observer = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting
    syncPlayback()
  })
  observer.observe(root)
  document.addEventListener('visibilitychange', syncPlayback)

  // The whole screen is the button; a small label says what to do.
  const card = el('button', {
    position: 'absolute',
    inset: '0',
    border: '0',
    padding: '0',
    background: 'rgba(12, 12, 16, 0.25)',
    cursor: 'pointer',
  })
  card.setAttribute('aria-label', `Play ${title}`)
  const pill = el(
    'span',
    {
      position: 'absolute',
      left: '50%',
      bottom: '12%',
      transform: 'translateX(-50%)',
      padding: '12px 22px',
      borderRadius: '999px',
      background: 'rgba(12, 12, 16, 0.78)',
      border: '1px solid rgba(255, 255, 255, 0.18)',
      color: '#f4f4f5',
      font: '600 16px/1 system-ui, sans-serif',
      whiteSpace: 'nowrap',
    },
    'Click or tap to play',
  )
  card.append(pill)
  frame.append(card)
  const begin = async () => {
    card.remove()
    await game.reload(program)
    syncPlayback()
    canvas.focus({ preventScroll: true })
    if ((program.sounds ?? []).length > 0 || (program.music ?? []).length > 0) frame.append(soundToggle(game))
  }
  card.addEventListener('click', () => void begin(), { once: true })
  window.addEventListener(
    'keydown',
    (e) => {
      if (card.isConnected && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        void begin()
      }
    },
  )
  return game
}
