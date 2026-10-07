// Renderer interface. All coordinates are internal (game) pixels in screen
// space; the renderer owns scaling to the real canvas. A WebGL renderer can
// implement this same interface later.

/** @import { LoadedImage } from '../assets.js' */

/** @typedef {'left' | 'center'} TextAlign */

/**
 * @typedef {object} Renderer
 * @property {(background: string) => void} begin
 * @property {(x: number, y: number, w: number, h: number, color: string) => void} box
 * @property {(x: number, y: number, w: number, h: number, color: string) => void} ellipse Ellipse inscribed in the box.
 * @property {(image: LoadedImage, x: number, y: number, w: number, h: number) => void} image
 * @property {(text: string, x: number, y: number, color: string, align: TextAlign) => void} text `y` is the top of the text for left align, the middle for center align.
 * @property {() => void} end
 */

export class NullRenderer {
  begin() {}
  box() {}
  ellipse() {}
  image() {}
  text() {}
  end() {}
}

/**
 * @typedef {(
 *   | { op: 'begin'; background: string }
 *   | { op: 'box'; x: number; y: number; w: number; h: number; color: string }
 *   | { op: 'ellipse'; x: number; y: number; w: number; h: number; color: string }
 *   | { op: 'image'; src: string; x: number; y: number; w: number; h: number }
 *   | { op: 'text'; text: string; x: number; y: number; color: string; align: TextAlign }
 *   | { op: 'end' }
 * )} DrawCall
 */

/** Records draw calls. For tests and debugging tools. */
export class RecordingRenderer {
  /** @type {DrawCall[]} */
  calls = []

  /** @param {string} background */
  begin(background) {
    this.calls = [{ op: 'begin', background }]
  }
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {string} color
   */
  box(x, y, w, h, color) {
    this.calls.push({ op: 'box', x, y, w, h, color })
  }
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {string} color
   */
  ellipse(x, y, w, h, color) {
    this.calls.push({ op: 'ellipse', x, y, w, h, color })
  }
  /**
   * @param {LoadedImage} image
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  image(image, x, y, w, h) {
    this.calls.push({ op: 'image', src: image.src, x, y, w, h })
  }
  /**
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {string} color
   * @param {TextAlign} align
   */
  text(text, x, y, color, align) {
    this.calls.push({ op: 'text', text, x, y, color, align })
  }
  end() {
    this.calls.push({ op: 'end' })
  }
}
