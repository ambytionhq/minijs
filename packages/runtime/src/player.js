// The standalone player: everything an exported game page needs and nothing
// else (no compiler, no editor). Exported HTML files call MiniPlayer.mount().

import { start } from './game.js'
import { PLACEHOLDER_SIZE } from './config.js'

/** @import { MiniError, Program } from '@minijs/lang' */
/** @import { LoadedImage } from './assets.js' */

/** Loads pictures from data: URLs keyed by the name the game uses. */
export class DataUrlAssetLoader {
  /** @param {Record<string, string>} images picture name in the game -> data URL */
  constructor(images) {
    this.images = images
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
 * Fill `root` with the game: a canvas that fits the window, a "click to play"
 * card (browsers only send keys after a click), and a readable message if
 * something goes wrong.
 * @param {{ root: HTMLElement; program: Program; images: Record<string, string>; title: string }} options
 */
export async function mount({ root, program, images, title }) {
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    display: 'grid',
    placeItems: 'center',
    background: '#0c0c10',
    overflow: 'hidden',
  })
  const frame = el('div', { position: 'relative', width: '100%', height: '100%', display: 'grid', placeItems: 'center' })
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
    assets: new DataUrlAssetLoader(images),
    keyTarget: window,
    touchButtons: 'auto',
  })
  game.on('error', showError)
  game.stop()

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
    canvas.focus()
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
