// The pixel painter: a zoomed grid you can draw on with a mouse, finger or pen.
// Works on one frame as a string of pixel characters. Tools: pencil, eraser, bucket,
// color picker, mirror. It knows nothing about tiles.

import { PIXEL_CHARS, hexToRgb } from '@minijs/runtime'
import { cssColor, fitCanvas } from './ui.js'

/**
 * @typedef {object} PixelCanvasOptions
 * @property {number} width In pixels.
 * @property {number} height
 * @property {() => string[]} palette
 * @property {(index: number) => void} onPickColor The picker tool found a color.
 * @property {(frame: string) => void} onLive Pixels changed during a stroke.
 * @property {(frame: string) => void} onCommit A stroke finished.
 * @property {number} [gridX] Draw a stronger line every this many pixels.
 * @property {number} [gridY]
 * @property {boolean} [readOnly]
 */

/** @typedef {'pencil' | 'eraser' | 'bucket' | 'picker'} PixelTool */

/**
 * @param {HTMLCanvasElement} canvas inside a sized box
 * @param {PixelCanvasOptions} options
 */
export function createPixelCanvas(canvas, options) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
  let { width, height } = options
  /** @type {string[]} */
  let pixels = []
  /** @type {string} */
  let ghost = ''
  /** @type {PixelTool} */
  let tool = 'pencil'
  let color = 1
  let mirror = false
  let drawing = false
  let lastX = -1
  let lastY = -1
  let hoverX = -1
  let hoverY = -1
  let scale = 8
  let originX = 0
  let originY = 0
  let cssW = 0
  let cssH = 0
  let ratio = 1
  let gridX = options.gridX ?? 0
  let gridY = options.gridY ?? 0

  const paintChar = () => (tool === 'eraser' ? '.' : PIXEL_CHARS[color] ?? '.')

  function layout() {
    scale = Math.max(1, Math.floor(Math.min((cssW - 8) / width, (cssH - 8) / height)))
    originX = Math.floor((cssW - width * scale) / 2)
    originY = Math.floor((cssH - height * scale) / 2)
  }

  function draw() {
    if (cssW === 0) return
    layout()
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    const a = cssColor('--checker-a')
    const b = cssColor('--checker-b')
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? a : b
        ctx.fillRect(originX + x * scale, originY + y * scale, scale, scale)
      }
    }
    const palette = options.palette()
    if (ghost.length === width * height) {
      ctx.globalAlpha = 0.25
      paintPixels(ghost, palette)
      ctx.globalAlpha = 1
    }
    paintPixels(pixels, palette)
    // Grid lines, only when pixels are big enough to see them.
    if (scale >= 6) {
      ctx.strokeStyle = cssColor('--border')
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x <= width; x++) {
        ctx.moveTo(originX + x * scale + 0.5, originY)
        ctx.lineTo(originX + x * scale + 0.5, originY + height * scale)
      }
      for (let y = 0; y <= height; y++) {
        ctx.moveTo(originX, originY + y * scale + 0.5)
        ctx.lineTo(originX + width * scale, originY + y * scale + 0.5)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    if (gridX > 0 || gridY > 0) {
      ctx.strokeStyle = cssColor('--text-muted')
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; gridX > 0 && x <= width; x += gridX) {
        ctx.moveTo(originX + x * scale + 0.5, originY)
        ctx.lineTo(originX + x * scale + 0.5, originY + height * scale)
      }
      for (let y = 0; gridY > 0 && y <= height; y += gridY) {
        ctx.moveTo(originX, originY + y * scale + 0.5)
        ctx.lineTo(originX + width * scale, originY + y * scale + 0.5)
      }
      ctx.stroke()
    }
    if (hoverX >= 0 && !options.readOnly) {
      ctx.strokeStyle = cssColor('--focus')
      ctx.lineWidth = 2
      ctx.strokeRect(originX + hoverX * scale + 1, originY + hoverY * scale + 1, scale - 2, scale - 2)
      if (mirror) {
        ctx.strokeRect(originX + (width - 1 - hoverX) * scale + 1, originY + hoverY * scale + 1, scale - 2, scale - 2)
      }
    }
  }

  /**
   * @param {ArrayLike<string>} data
   * @param {string[]} palette
   */
  function paintPixels(data, palette) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = PIXEL_CHARS.indexOf(data[y * width + x])
        if (index <= 0) continue
        ctx.fillStyle = palette[index - 1] ?? '#ff00ff'
        ctx.fillRect(originX + x * scale, originY + y * scale, scale, scale)
      }
    }
  }

  /**
   * @param {PointerEvent} e
   * @returns {[number, number] | null}
   */
  function cell(e) {
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left - originX) / scale)
    const y = Math.floor((e.clientY - rect.top - originY) / scale)
    return x >= 0 && y >= 0 && x < width && y < height ? [x, y] : null
  }

  /** @param {number} x @param {number} y @param {string} ch */
  function put(x, y, ch) {
    pixels[y * width + x] = ch
    if (mirror) pixels[y * width + (width - 1 - x)] = ch
  }

  /** @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {string} ch */
  function line(x0, y0, x1, y1, ch) {
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    let x = x0
    let y = y0
    while (true) {
      put(x, y, ch)
      if (x === x1 && y === y1) return
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x += sx
      }
      if (e2 <= dx) {
        err += dx
        y += sy
      }
    }
  }

  /** @param {number} sx @param {number} sy @param {string} ch */
  function bucket(sx, sy, ch) {
    const from = pixels[sy * width + sx]
    if (from === ch) return
    const stack = [[sx, sy]]
    while (stack.length > 0) {
      const [x, y] = /** @type {number[]} */ (stack.pop())
      if (x < 0 || y < 0 || x >= width || y >= height || pixels[y * width + x] !== from) continue
      pixels[y * width + x] = ch
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
    }
  }

  const frame = () => pixels.join('')

  canvas.addEventListener('pointerdown', (e) => {
    if (options.readOnly || e.button > 2) return
    const at = cell(e)
    if (!at) return
    canvas.setPointerCapture(e.pointerId)
    const [x, y] = at
    // The right mouse button is a quick color picker.
    if (tool === 'picker' || e.button === 2) {
      const index = PIXEL_CHARS.indexOf(pixels[y * width + x])
      if (index > 0) options.onPickColor(index)
      return
    }
    if (tool === 'bucket') {
      bucket(x, y, paintChar())
      draw()
      options.onLive(frame())
      options.onCommit(frame())
      return
    }
    drawing = true
    lastX = x
    lastY = y
    put(x, y, paintChar())
    draw()
    options.onLive(frame())
  })

  canvas.addEventListener('pointermove', (e) => {
    const at = cell(e)
    hoverX = at ? at[0] : -1
    hoverY = at ? at[1] : -1
    if (drawing && at) {
      line(lastX, lastY, at[0], at[1], paintChar())
      lastX = at[0]
      lastY = at[1]
      options.onLive(frame())
    }
    draw()
  })

  const finish = () => {
    if (!drawing) return
    drawing = false
    options.onCommit(frame())
  }
  canvas.addEventListener('pointerup', finish)
  canvas.addEventListener('pointercancel', finish)
  canvas.addEventListener('pointerleave', () => {
    hoverX = -1
    if (!drawing) draw()
  })
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  const stopFit = fitCanvas(canvas, (w, h, r) => {
    cssW = w
    cssH = h
    ratio = r
    draw()
  })

  return {
    /**
     * @param {string} next
     * @param {number} [w]
     * @param {number} [h]
     * @param {{ gridX?: number; gridY?: number }} [grid]
     */
    setFrame(next, w = width, h = height, grid) {
      width = w
      height = h
      pixels = [...next]
      if (grid) {
        gridX = grid.gridX ?? 0
        gridY = grid.gridY ?? 0
      }
      draw()
    },
    /** Show another frame faintly behind this one, for animating. @param {string} next */
    setGhost(next) {
      ghost = next
      draw()
    },
    /** @param {PixelTool} next */
    setTool(next) {
      tool = next
    },
    /** @param {number} index palette position, from 1 */
    setColor(index) {
      color = index
    },
    /** @param {boolean} on */
    setMirror(on) {
      mirror = on
    },
    /** Slide the picture, wrapping around, to check how it repeats. @param {number} dx @param {number} dy */
    shift(dx, dy) {
      const next = new Array(pixels.length)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          next[((y + dy + height) % height) * width + ((x + dx + width) % width)] = pixels[y * width + x]
        }
      }
      pixels = next
      draw()
      options.onLive(frame())
      options.onCommit(frame())
    },
    redraw: draw,
    destroy: stopFit,
  }
}

/**
 * Closest palette color to some red, green and blue, or the position to add a new color.
 * @param {string[]} palette
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number} palette index from 0
 */
export function nearestColor(palette, r, g, b) {
  let best = 0
  let bestDistance = Infinity
  palette.forEach((hex, i) => {
    const [pr, pg, pb] = hexToRgb(hex)
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2
    if (d < bestDistance) {
      best = i
      bestDistance = d
    }
  })
  return best
}
