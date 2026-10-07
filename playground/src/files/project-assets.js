// Loads `looks like "hero.png"` pictures from the open project. A picture path
// is looked up next to the running .mini file first, then in its assets folder.

import { config } from '@minijs/runtime'
import { dirname, join } from './paths.js'

/** @import { ProjectFs } from './project.js' */
/** @typedef {{ src: string; width: number; height: number; source: CanvasImageSource | null; missing: boolean }} LoadedImage */

/**
 * Where to look for `src` used by the game file at `gamePath`.
 * @param {string} gamePath
 * @param {string} src
 */
export function imageCandidates(gamePath, src) {
  const dir = dirname(gamePath)
  return [...new Set([join(dir, src), join(dir, 'assets', src), join(src), join('assets', src)])]
}

export class ProjectAssetLoader {
  /**
   * @param {ProjectFs} fs
   * @param {string} gamePath
   */
  constructor(fs, gamePath) {
    this.fs = fs
    this.gamePath = gamePath
  }

  /**
   * @param {string} src
   * @returns {Promise<LoadedImage>}
   */
  async load(src) {
    for (const path of imageCandidates(this.gamePath, src)) {
      if (!(await this.fs.exists(path).catch(() => false))) continue
      try {
        const blob = await this.fs.readBlob(path)
        const image = await decode(blob)
        return { src, width: image.naturalWidth, height: image.naturalHeight, source: image, missing: false }
      } catch {
        break
      }
    }
    return { src, width: config.PLACEHOLDER_SIZE, height: config.PLACEHOLDER_SIZE, source: null, missing: true }
  }
}

/**
 * @param {Blob} blob
 * @returns {Promise<HTMLImageElement>}
 */
function decode(blob) {
  const url = URL.createObjectURL(blob)
  const image = new Image()
  // Load events, not decode(): decode() can stall in background tabs.
  return new Promise((resolve, reject) => {
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('not a picture'))
    }
    image.src = url
  })
}
