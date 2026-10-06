// Image loading. Every image the program can show is loaded before the game
// starts, so natural sizes are known when instances are created. A failed load
// never throws: it yields a placeholder and an `image-missing` error.

import { miniError, type Loc, type Look, type MiniError, type Program } from '@minijs/lang'
import { PLACEHOLDER_SIZE } from './config.ts'

export interface LoadedImage {
  src: string
  width: number
  height: number
  /** Drawable source. Null for missing images and for headless loaders. */
  source: CanvasImageSource | null
  /** True when loading failed; drawn as a placeholder box. */
  missing: boolean
}

export interface AssetLoader {
  load(src: string): Promise<LoadedImage>
}

function placeholder(src: string): LoadedImage {
  return { src, width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE, source: null, missing: true }
}

/** Loads images with the DOM Image element, relative to a base URL. */
export class BrowserAssetLoader implements AssetLoader {
  private readonly base: string

  constructor(base = '') {
    this.base = base === '' || base.endsWith('/') ? base : `${base}/`
  }

  load(src: string): Promise<LoadedImage> {
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
export class StaticAssetLoader implements AssetLoader {
  private readonly sizes: ReadonlyMap<string, { width: number; height: number }>

  constructor(sizes: Record<string, { width: number; height: number }> = {}) {
    this.sizes = new Map(Object.entries(sizes))
  }

  load(src: string): Promise<LoadedImage> {
    const size = this.sizes.get(src)
    if (!size) return Promise.resolve(placeholder(src))
    return Promise.resolve({ src, width: size.width, height: size.height, source: null, missing: false })
  }
}

function addLook(look: Look, out: Map<string, Loc>): void {
  if (look.kind === 'image' && !out.has(look.src)) out.set(look.src, look.loc)
}

/** Every image path the program can display, with the first place it is used. */
export function collectImageSources(program: Program): Map<string, Loc> {
  const out = new Map<string, Loc>()
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

export interface LoadResult {
  images: Map<string, LoadedImage>
  errors: MiniError[]
}

export async function loadImages(program: Program, loader: AssetLoader): Promise<LoadResult> {
  const sources = collectImageSources(program)
  const entries = [...sources.entries()]
  const loaded = await Promise.all(entries.map(([src]) => loader.load(src)))
  const images = new Map<string, LoadedImage>()
  const errors: MiniError[] = []
  entries.forEach(([src, loc], i) => {
    const image = loaded[i]!
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
