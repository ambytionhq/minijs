// Engine-wide constants. See docs/spec.md sections 3 and 5.

/** Logic always runs at this rate, regardless of display refresh rate. */
export const TICKS_PER_SECOND = 60
export const TICK_MS = 1000 / TICKS_PER_SECOND

/** Max logic steps per rendered frame. Extra time is dropped (no death spiral). */
export const MAX_STEPS_PER_FRAME = 5

/** Frames longer than this (tab was hidden, debugger pause) are clamped. */
export const MAX_FRAME_MS = 250

/** Live instance cap. Exceeding it stops the game with `too-many-things`. */
export const MAX_INSTANCES = 10_000

/** Starting capacity of instance storage. Grows by doubling. */
export const INITIAL_CAPACITY = 256

/** Spatial hash cell size in world pixels. */
export const CELL_SIZE = 64

/**
 * Tolerance for overlap tests. Solid push-out needs real penetration deeper
 * than this, so a thing resting exactly on the ground is not "inside" it.
 * Touch tests are inclusive by this much, so edge contact counts as touching.
 */
export const EPSILON = 0.0001

/** Max substeps when a fast thing moves more than half its own size in one tick. */
export const MAX_SUBSTEPS = 8

/** Size used for images that failed to load. */
export const PLACEHOLDER_SIZE = 16
export const PLACEHOLDER_COLOR = '#ff00ff'

/** Text rendering, in internal pixels. */
export const TEXT_FONT_PX = 10
export const TEXT_FONT_FAMILY = 'monospace'

/** Non-pixel-art rendering never uses more than this devicePixelRatio. */
export const MAX_DEVICE_PIXEL_RATIO = 2
