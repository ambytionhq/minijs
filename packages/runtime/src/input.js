// Input with edge detection. Raw events latch into "pressed since last tick"
// and "released since last tick", so a tap shorter than one tick still fires
// both `is pressed` and `is released` (and counts as held for that tick).

/** @import { KeyName } from '@minijs/lang' */
import { KEY_NAMES, keyNameFromCode } from '@minijs/lang'

/** @type {ReadonlyMap<string, number>} */
const KEY_INDEX = new Map(KEY_NAMES.map((name, i) => [name, i]))

/**
 * @param {KeyName} name
 * @returns {number}
 */
export function keyIndex(name) {
  return KEY_INDEX.get(name)
}

export class Input {
  /** Pointer position in internal (screen) pixels. */
  mouseX = 0
  mouseY = 0

  rawDown = new Uint8Array(KEY_NAMES.length)
  latchPressed = new Uint8Array(KEY_NAMES.length)
  latchReleased = new Uint8Array(KEY_NAMES.length)
  held = new Uint8Array(KEY_NAMES.length)
  pressed = new Uint8Array(KEY_NAMES.length)
  released = new Uint8Array(KEY_NAMES.length)
  rawMouseDown = false
  latchClick = false
  clicked = false

  /** @param {KeyName} name */
  keyDown(name) {
    const i = keyIndex(name)
    if (this.rawDown[i] === 1) return
    this.rawDown[i] = 1
    this.latchPressed[i] = 1
  }

  /** @param {KeyName} name */
  keyUp(name) {
    const i = keyIndex(name)
    if (this.rawDown[i] === 0) return
    this.rawDown[i] = 0
    this.latchReleased[i] = 1
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  pointerMove(x, y) {
    this.mouseX = x
    this.mouseY = y
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  pointerDown(x, y) {
    this.pointerMove(x, y)
    if (this.rawMouseDown) return
    this.rawMouseDown = true
    this.latchClick = true
  }

  pointerUp() {
    this.rawMouseDown = false
  }

  /** Release everything, e.g. when the window loses focus. */
  releaseAll() {
    for (let i = 0; i < this.rawDown.length; i++) {
      if (this.rawDown[i] === 1) {
        this.rawDown[i] = 0
        this.latchReleased[i] = 1
      }
    }
    this.rawMouseDown = false
  }

  /** Called once at the start of every tick. */
  snapshot() {
    for (let i = 0; i < this.rawDown.length; i++) {
      this.pressed[i] = this.latchPressed[i]
      this.released[i] = this.latchReleased[i]
      this.held[i] = this.rawDown[i] | this.latchPressed[i]
      this.latchPressed[i] = 0
      this.latchReleased[i] = 0
    }
    this.clicked = this.latchClick
    this.latchClick = false
  }

  /**
   * @param {number} index
   * @returns {boolean}
   */
  isPressed(index) {
    return this.pressed[index] === 1
  }

  /**
   * @param {number} index
   * @returns {boolean}
   */
  isHeld(index) {
    return this.held[index] === 1
  }

  /**
   * @param {number} index
   * @returns {boolean}
   */
  isReleased(index) {
    return this.released[index] === 1
  }

  /** @returns {boolean} */
  isClicked() {
    return this.clicked
  }
}

/** Input driven by code. Used by tests and headless tools. */
export class ManualInput extends Input {
  /**
   * Press and release within the same tick window.
   * @param {KeyName} name
   */
  tap(name) {
    this.keyDown(name)
    this.keyUp(name)
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  click(x, y) {
    this.pointerDown(x, y)
    this.pointerUp()
  }
}

/**
 * Keys whose default browser behavior (scrolling) is suppressed while the game listens.
 * @type {ReadonlySet<KeyName>}
 */
const CAPTURED = new Set(['left', 'right', 'up', 'down', 'space'])

/** Input bound to browser keyboard and pointer events. */
export class BrowserInput extends Input {
  /** @type {Array<() => void>} */
  cleanup = []

  /**
   * Listen to keys on `keyTarget` (usually window) and pointer on `canvas`.
   * `internalWidth/Height` convert pointer coordinates to internal pixels.
   * @param {Window} keyTarget
   * @param {HTMLCanvasElement} canvas
   * @param {number} internalWidth
   * @param {number} internalHeight
   */
  attach(keyTarget, canvas, internalWidth, internalHeight) {
    /** @param {KeyboardEvent} event */
    const onKeyDown = (event) => {
      const name = keyNameFromCode(event.code)
      if (name === null) return
      if (CAPTURED.has(name)) event.preventDefault()
      this.keyDown(name)
    }
    /** @param {KeyboardEvent} event */
    const onKeyUp = (event) => {
      const name = keyNameFromCode(event.code)
      if (name !== null) this.keyUp(name)
    }
    /**
     * @param {PointerEvent} event
     * @returns {[number, number]}
     */
    const toInternal = (event) => {
      const rect = canvas.getBoundingClientRect()
      const sx = rect.width > 0 ? internalWidth / rect.width : 1
      const sy = rect.height > 0 ? internalHeight / rect.height : 1
      return [(event.clientX - rect.left) * sx, (event.clientY - rect.top) * sy]
    }
    /** @param {PointerEvent} event */
    const onPointerMove = (event) => {
      const [x, y] = toInternal(event)
      this.pointerMove(x, y)
    }
    /** @param {PointerEvent} event */
    const onPointerDown = (event) => {
      const [x, y] = toInternal(event)
      this.pointerDown(x, y)
    }
    const onPointerUp = () => this.pointerUp()
    const onBlur = () => this.releaseAll()

    keyTarget.addEventListener('keydown', onKeyDown)
    keyTarget.addEventListener('keyup', onKeyUp)
    keyTarget.addEventListener('blur', onBlur)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerdown', onPointerDown)
    keyTarget.addEventListener('pointerup', onPointerUp)
    this.cleanup.push(
      () => keyTarget.removeEventListener('keydown', onKeyDown),
      () => keyTarget.removeEventListener('keyup', onKeyUp),
      () => keyTarget.removeEventListener('blur', onBlur),
      () => canvas.removeEventListener('pointermove', onPointerMove),
      () => canvas.removeEventListener('pointerdown', onPointerDown),
      () => keyTarget.removeEventListener('pointerup', onPointerUp),
    )
  }

  detach() {
    for (const fn of this.cleanup) fn()
    this.cleanup.length = 0
    this.releaseAll()
  }
}
