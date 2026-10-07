// Image loading. Every image the program can show is loaded before the game
// starts, so natural sizes are known when instances are created. A failed load
// never throws: it yields a placeholder and an `image-missing` error.

/** @import { Loc, Look, MiniError, Program } from '@minijs/lang' */
import { miniError } from '@minijs/lang'
import { PLACEHOLDER_SIZE } from './config.js'

/**
 * @typedef {object} LoadedImage
 * @property {string} src
 * @property {number} width
 * @property {number} height
 * @property {CanvasImageSource | null} source Drawable source. Null for missing images and for headless loaders.
 * @property {boolean} missing True when loading failed; drawn as a placeholder box.
 */

/**
 * @typedef {object} AssetLoader
 * @property {(src: string) => Promise<LoadedImage>} load
 */

/**
 * @param {string} src
 * @returns {LoadedImage}
 */
function placeholder(src) {
  return { src, width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE, source: null, missing: true }
}

/** Loads images with the DOM Image element, relative to a base URL. */
export class BrowserAssetLoader {
  /** @type {string} */
  base

  constructor(base = '') {
    this.base = base === '' || base.endsWith('/') ? base : `${base}/`
  }

  /**
   * @param {string} src
   * @returns {Promise<LoadedImage>}
   */
  load(src) {
    return new Promise((resolve) => {
      const image = new Image()
      image.onload = () =>
        resolve({ src, width: image.naturalWidth, height: image.naturalHeight, source: image, missing: false })
      image.onerror = () => resolve(placeholder(src))
      image.src = this.base + src
    })
  }
}

/**
 * Loader with fixed, known sizes and no real pixels. For tests and headless
 * tools. Unknown paths behave like missing files.
 */
export class StaticAssetLoader {
  /** @type {ReadonlyMap<string, { width: number; height: number }>} */
  sizes

  /** @param {Record<string, { width: number; height: number }>} [sizes={}] */
  constructor(sizes = {}) {
    this.sizes = new Map(Object.entries(sizes))
  }

  /**
   * @param {string} src
   * @returns {Promise<LoadedImage>}
   */
  load(src) {
    const size = this.sizes.get(src)
    if (!size) return Promise.resolve(placeholder(src))
    return Promise.resolve({ src, width: size.width, height: size.height, source: null, missing: false })
  }
}

/**
 * @param {Look} look
 * @param {Map<string, Loc>} out
 */
function addLook(look, out) {
  if (look.kind === 'image' && !out.has(look.src)) out.set(look.src, look.loc)
}

/**
 * Every image path the program can display, with the first place it is used.
 * @param {Program} program
 * @returns {Map<string, Loc>}
 */
export function collectImageSources(program) {
  const out = new Map()
  for (const thing of program.things) {
    addLook(thing.look, out)
    for (const animation of thing.animations) {
      for (const frame of animation.frames) {
        if (!out.has(frame)) out.set(frame, animation.loc)
      }
    }
  }
  for (const rule of program.rules) {
    for (const action of rule.actions) {
      if (action.kind === 'changeLook') addLook(action.look, out)
    }
  }
  return out
}

/**
 * @typedef {object} LoadResult
 * @property {Map<string, LoadedImage>} images
 * @property {MiniError[]} errors
 */

/**
 * @param {Program} program
 * @param {AssetLoader} loader
 * @returns {Promise<LoadResult>}
 */
export async function loadImages(program, loader) {
  const sources = collectImageSources(program)
  const entries = [...sources.entries()]
  const loaded = await Promise.all(entries.map(([src]) => loader.load(src)))
  const images = new Map()
  /** @type {MiniError[]} */
  const errors = []
  entries.forEach(([src, loc], i) => {
    const image = loaded[i]
    images.set(src, image)
    if (image.missing) {
      errors.push(
        miniError(
          'image-missing',
          loc,
          `I couldn't load the picture "${src}".`,
          'Check the file name and that the file is in your assets folder. I drew a pink box instead.',
        ),
      )
    }
  })
  return { images, errors }
}
