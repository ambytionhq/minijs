// Pixel art draws at the game's native resolution, then the browser scales
// the canvas with nearest-neighbor sampling. Smooth mode caps DPR at 2.

/** @import { LoadedImage } from '../assets.js' */
import { MAX_DEVICE_PIXEL_RATIO, PLACEHOLDER_COLOR, TEXT_FONT_FAMILY, TEXT_FONT_PX } from '../config.js'
/** @import { Renderer, TextAlign } from './renderer.js' */

/**
 * @typedef {object} CanvasScale
 * @property {number} canvasWidth Backing store size in device pixels.
 * @property {number} canvasHeight
 * @property {number} cssWidth CSS display size in CSS pixels.
 * @property {number} cssHeight
 * @property {number} scale Device pixels per internal pixel.
 */

/**
 * Fit an internal resolution into an available CSS box. Pure, for testing.
 * @param {number} internalWidth
 * @param {number} internalHeight
 * @param {number} availableCssWidth
 * @param {number} availableCssHeight
 * @param {number} devicePixelRatio
 * @param {boolean} pixelArt
 * @returns {CanvasScale}
 */
export function computeScale(
  internalWidth,
  internalHeight,
  availableCssWidth,
  availableCssHeight,
  devicePixelRatio,
  pixelArt,
) {
  const fit = Math.max(0, Math.min(availableCssWidth / internalWidth, availableCssHeight / internalHeight))
  if (pixelArt) {
    // A larger backing store redraws the same pixels many times on Retina
    // displays. Keep those pixels native, while fitting the entire game into
    // any CSS box, including embeds smaller than the game's resolution.
    return {
      canvasWidth: internalWidth,
      canvasHeight: internalHeight,
      cssWidth: internalWidth * fit,
      cssHeight: internalHeight * fit,
      scale: 1,
    }
  }
  const ratio = Math.min(devicePixelRatio, MAX_DEVICE_PIXEL_RATIO)
  const cssFit = Math.max(fit, 0.0001)
  const scale = cssFit * ratio
  return {
    canvasWidth: Math.max(1, Math.round(internalWidth * scale)),
    canvasHeight: Math.max(1, Math.round(internalHeight * scale)),
    cssWidth: internalWidth * cssFit,
    cssHeight: internalHeight * cssFit,
    scale,
  }
}

export class Canvas2DRenderer {
  /** @type {HTMLCanvasElement} */
  canvas
  /** @type {CanvasRenderingContext2D} */
  ctx
  /** @type {number} */
  width
  /** @type {number} */
  height
  /** @type {boolean} */
  pixelArt
  scale = 1

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} width
   * @param {number} height
   * @param {boolean} pixelArt
   */
  constructor(canvas, width, height, pixelArt) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.')
    this.canvas = canvas
    this.ctx = ctx
    this.width = width
    this.height = height
    this.pixelArt = pixelArt
    this.resize(width, height, 1)
  }

  /**
   * Fit into an available CSS box. Call on container resize.
   * @param {number} availableCssWidth
   * @param {number} availableCssHeight
   * @param {number} devicePixelRatio
   * @returns {CanvasScale}
   */
  resize(availableCssWidth, availableCssHeight, devicePixelRatio) {
    const fit = computeScale(
      this.width,
      this.height,
      availableCssWidth,
      availableCssHeight,
      devicePixelRatio,
      this.pixelArt,
    )
    // Setting either dimension clears the canvas and resets its context.
    if (this.canvas.width !== fit.canvasWidth) this.canvas.width = fit.canvasWidth
    if (this.canvas.height !== fit.canvasHeight) this.canvas.height = fit.canvasHeight
    this.canvas.style.width = `${fit.cssWidth}px`
    this.canvas.style.height = `${fit.cssHeight}px`
    this.canvas.style.imageRendering = this.pixelArt ? 'pixelated' : 'auto'
    this.scale = fit.scale
    return fit
  }

  /** @param {string} background */
  begin(background) {
    const ctx = this.ctx
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    ctx.imageSmoothingEnabled = !this.pixelArt
    ctx.fillStyle = background
    ctx.fillRect(0, 0, this.width, this.height)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {string} color
   */
  box(x, y, w, h, color) {
    this.ctx.fillStyle = color
    if (this.pixelArt) this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    else this.ctx.fillRect(x, y, w, h)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {string} color
   */
  ellipse(x, y, w, h, color) {
    const ctx = this.ctx
    if (this.pixelArt) {
      x = Math.round(x)
      y = Math.round(y)
    }
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  /**
   * @param {LoadedImage} image
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  image(image, x, y, w, h) {
    if (image.source === null) {
      this.box(x, y, w, h, PLACEHOLDER_COLOR)
      return
    }
    if (this.pixelArt) this.ctx.drawImage(image.source, Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    else this.ctx.drawImage(image.source, x, y, w, h)
  }

  /**
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {string} color
   * @param {TextAlign} align
   */
  text(text, x, y, color, align) {
    const ctx = this.ctx
    ctx.font = `${TEXT_FONT_PX}px ${TEXT_FONT_FAMILY}`
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.textBaseline = align === 'center' ? 'middle' : 'top'
    ctx.fillText(text, this.pixelArt ? Math.round(x) : x, this.pixelArt ? Math.round(y) : y)
  }

  end() {}
}
