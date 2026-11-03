// Drawing tiles in the editors, with the same rules the game uses.

import { TERRAIN_PIECES, frameSize, frameToRgba } from '@minijs/runtime'

/** @import { TileDef, Tileset } from '@minijs/runtime/src/tiles/format.js' */

/**
 * Pictures of one frame of every tile, for quick drawing.
 * @param {Tileset} tileset
 * @returns {Array<HTMLCanvasElement[]>} per tile, per frame
 */
export function tileCanvases(tileset) {
  return tileset.tiles.map((tile) => tile.frames.map((frame) => frameCanvas(tileset, tile, frame)))
}

/**
 * @param {Tileset} tileset
 * @param {TileDef} tile
 * @param {string} frame
 * @returns {HTMLCanvasElement}
 */
export function frameCanvas(tileset, tile, frame) {
  const { w, h } = frameSize(tileset, tile)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
  ctx.putImageData(new ImageData(frameToRgba(tileset, frame, w, h), w, h), 0, 0)
  return canvas
}

/**
 * Draw one map cell. Terrain picks its four corner pieces from the neighbor mask.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} picture
 * @param {TileDef} tile
 * @param {number} mask
 * @param {number} tileW
 * @param {number} tileH
 * @param {number} x
 * @param {number} y
 * @param {number} scale
 */
export function drawCell(ctx, picture, tile, mask, tileW, tileH, x, y, scale) {
  if (tile.kind === 'plain') {
    ctx.drawImage(picture, 0, 0, tileW, tileH, x, y, tileW * scale, tileH * scale)
    return
  }
  const halfW = tileW / 2
  const halfH = tileH / 2
  for (let corner = 0; corner < 4; corner++) {
    const offX = corner % 2 === 1 ? halfW : 0
    const offY = corner >= 2 ? halfH : 0
    const at = mask * 8 + corner * 2
    ctx.drawImage(
      picture,
      TERRAIN_PIECES[at] * tileW + offX,
      TERRAIN_PIECES[at + 1] * tileH + offY,
      halfW,
      halfH,
      x + offX * scale,
      y + offY * scale,
      halfW * scale,
      halfH * scale,
    )
  }
}

/**
 * A small picture of a tile, for lists. Terrain shows a single middle piece with its edges around it.
 * @param {Tileset} tileset
 * @param {TileDef} tile
 * @param {number} [frameIndex]
 * @returns {HTMLCanvasElement}
 */
export function tileThumb(tileset, tile, frameIndex = 0) {
  const { tileWidth: w, tileHeight: h } = tileset
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
  const picture = frameCanvas(tileset, tile, tile.frames[frameIndex] ?? tile.frames[0])
  drawCell(ctx, picture, tile, 0, w, h, 0, 0, 1)
  return canvas
}
