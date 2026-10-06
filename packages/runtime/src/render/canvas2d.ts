// Canvas2D renderer. Pixel art mode scales by an integer factor with
// smoothing off and rounds positions; smooth mode scales fractionally with
// devicePixelRatio capped at MAX_DEVICE_PIXEL_RATIO.

import type { LoadedImage } from '../assets.ts'
import { MAX_DEVICE_PIXEL_RATIO, PLACEHOLDER_COLOR, TEXT_FONT_FAMILY, TEXT_FONT_PX } from '../config.ts'
import type { Renderer, TextAlign } from './renderer.ts'

export interface CanvasScale {
  /** Backing store size in device pixels. */
  canvasWidth: number
  canvasHeight: number
  /** CSS display size in CSS pixels. */
  cssWidth: number
  cssHeight: number
  /** Device pixels per internal pixel. */
  scale: number
}

/** Fit an internal resolution into an available CSS box. Pure, for testing. */
export function computeScale(
  internalWidth: number,
  internalHeight: number,
  availableCssWidth: number,
  availableCssHeight: number,
  devicePixelRatio: number,
  pixelArt: boolean,
): CanvasScale {
  const fit = Math.min(availableCssWidth / internalWidth, availableCssHeight / internalHeight)
  if (pixelArt) {
    const scale = Math.max(1, Math.floor(fit * devicePixelRatio))
    const canvasWidth = internalWidth * scale
    const canvasHeight = internalHeight * scale
    return {
      canvasWidth,
      canvasHeight,
      cssWidth: canvasWidth / devicePixelRatio,
      cssHeight: canvasHeight / devicePixelRatio,
      scale,
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

export class Canvas2DRenderer implements Renderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly width: number
  private readonly height: number
  private readonly pixelArt: boolean
  private scale = 1

  constructor(canvas: HTMLCanvasElement, width: number, height: number, pixelArt: boolean) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.')
    this.canvas = canvas
    this.ctx = ctx
    this.width = width
    this.height = height
    this.pixelArt = pixelArt
    this.resize(width, height, 1)
  }

  /** Fit into an available CSS box. Call on container resize. */
  resize(availableCssWidth: number, availableCssHeight: number, devicePixelRatio: number): CanvasScale {
    const fit = computeScale(this.width, this.height, availableCssWidth, availableCssHeight, devicePixelRatio, this.pixelArt)
    this.canvas.width = fit.canvasWidth
    this.canvas.height = fit.canvasHeight
    this.canvas.style.width = `${fit.cssWidth}px`
    this.canvas.style.height = `${fit.cssHeight}px`
    if (this.pixelArt) this.canvas.style.imageRendering = 'pixelated'
    this.scale = fit.scale
    return fit
  }

  begin(background: string): void {
    const ctx = this.ctx
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    ctx.imageSmoothingEnabled = !this.pixelArt
    ctx.fillStyle = background
    ctx.fillRect(0, 0, this.width, this.height)
  }

  box(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color
    if (this.pixelArt) this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    else this.ctx.fillRect(x, y, w, h)
  }

  ellipse(x: number, y: number, w: number, h: number, color: string): void {
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

  image(image: LoadedImage, x: number, y: number, w: number, h: number): void {
    if (image.source === null) {
      this.box(x, y, w, h, PLACEHOLDER_COLOR)
      return
    }
    if (this.pixelArt) this.ctx.drawImage(image.source, Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    else this.ctx.drawImage(image.source, x, y, w, h)
  }

  text(text: string, x: number, y: number, color: string, align: TextAlign): void {
    const ctx = this.ctx
    ctx.font = `${TEXT_FONT_PX}px ${TEXT_FONT_FAMILY}`
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.textBaseline = align === 'center' ? 'middle' : 'top'
    ctx.fillText(text, this.pixelArt ? Math.round(x) : x, this.pixelArt ? Math.round(y) : y)
  }

  end(): void {}
}
