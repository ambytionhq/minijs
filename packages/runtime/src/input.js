// Input with edge detection. Raw events latch into "pressed since last tick"
// and "released since last tick", so a tap shorter than one tick still fires
// both `is pressed` and `is released` (and counts as held for that tick).
//
// Three kinds of buttons share that latch logic: keyboard keys (plus one
// "any key" slot), mouse buttons, and gamepad buttons. Gamepads have no
// events worth trusting, so they are polled at the start of every tick.

/** @import { KeyChoice, KeyName, MouseButton, PadButton } from '@minijs/lang' */
import { KEY_NAMES, MAX_PADS, MOUSE_BUTTONS, PAD_BUTTONS, keyNameFromCode } from '@minijs/lang'

/** Slot for "any key", after the real keys. */
export const ANY_KEY = KEY_NAMES.length

/** @type {ReadonlyMap<string, number>} */
const KEY_INDEX = new Map([...KEY_NAMES.map((name, i) => [name, i]), ['any', ANY_KEY]])

/** @type {ReadonlyMap<string, number>} */
const MOUSE_INDEX = new Map(MOUSE_BUTTONS.map((name, i) => [name, i]))

/** @type {ReadonlyMap<string, number>} */
const PAD_INDEX = new Map(PAD_BUTTONS.map((name, i) => [name, i]))

const PAD_BUTTON_COUNT = PAD_BUTTONS.length

/** Stick values smaller than this read as 0, so worn sticks don't drift. */
export const STICK_DEADZONE = 0.15

/**
 * @param {KeyChoice} name
 * @returns {number}
 */
export function keyIndex(name) {
  return /** @type {number} */ (KEY_INDEX.get(name))
}

/**
 * @param {MouseButton} button
 * @returns {number}
 */
export function mouseIndex(button) {
  return /** @type {number} */ (MOUSE_INDEX.get(button))
}

/**
 * Slot of a gamepad button. `pad` is 1-based.
 * @param {number} pad
 * @param {PadButton} button
 * @returns {number}
 */
export function padIndex(pad, button) {
  return (pad - 1) * PAD_BUTTON_COUNT + /** @type {number} */ (PAD_INDEX.get(button))
}

/**
 * Slot of a stick axis. `pad` is 1-based.
 * @param {number} pad
 * @param {'left' | 'right'} side
 * @param {'x' | 'y'} axis
 */
export function stickIndex(pad, side, axis) {
  return (pad - 1) * 4 + (side === 'left' ? 0 : 2) + (axis === 'x' ? 0 : 1)
}

/** One family of latched buttons. */
export class Buttons {
  /** @param {number} size */
  constructor(size) {
    this.raw = new Uint8Array(size)
    this.latchPressed = new Uint8Array(size)
    this.latchReleased = new Uint8Array(size)
    this.held = new Uint8Array(size)
    this.pressed = new Uint8Array(size)
    this.released = new Uint8Array(size)
  }

  /** @param {number} i */
  down(i) {
    if (this.raw[i] === 1) return false
    this.raw[i] = 1
    this.latchPressed[i] = 1
    return true
  }

  /** @param {number} i */
  up(i) {
    if (this.raw[i] === 0) return false
    this.raw[i] = 0
    this.latchReleased[i] = 1
    return true
  }

  releaseAll() {
    for (let i = 0; i < this.raw.length; i++) this.up(i)
  }

  snapshot() {
    for (let i = 0; i < this.raw.length; i++) {
      this.pressed[i] = this.latchPressed[i]
      this.released[i] = this.latchReleased[i]
      this.held[i] = this.raw[i] | this.latchPressed[i]
      this.latchPressed[i] = 0
      this.latchReleased[i] = 0
    }
  }
}

export class Input {
  /** Pointer position in internal (screen) pixels. */
  mouseX = 0
  mouseY = 0

  keys = new Buttons(KEY_NAMES.length + 1)
  mouse = new Buttons(MOUSE_BUTTONS.length)
  pads = new Buttons(MAX_PADS * PAD_BUTTON_COUNT)
  /** Raw stick values per pad: left x, left y, right x, right y. */
  rawSticks = new Float64Array(MAX_PADS * 4)
  /** Stick values with the deadzone applied, fixed for the tick. */
  sticks = new Float64Array(MAX_PADS * 4)
  /** 1 when that gamepad is plugged in. */
  padConnected = new Uint8Array(MAX_PADS)
  /** How many real keys are down, for "any key". */
  keysDown = 0

  /** @param {KeyName} name */
  keyDown(name) {
    if (this.keys.down(keyIndex(name)) && this.keysDown++ === 0) this.keys.down(ANY_KEY)
  }

  /** @param {KeyName} name */
  keyUp(name) {
    if (this.keys.up(keyIndex(name)) && --this.keysDown === 0) this.keys.up(ANY_KEY)
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
   * @param {MouseButton} [button='left']
   */
  pointerDown(x, y, button = 'left') {
    this.pointerMove(x, y)
    this.mouse.down(mouseIndex(button))
  }

  /** @param {MouseButton} [button='left'] */
  pointerUp(button = 'left') {
    this.mouse.up(mouseIndex(button))
  }

  /**
   * @param {number} pad 1-based
   * @param {PadButton} button
   */
  padDown(pad, button) {
    this.padConnected[pad - 1] = 1
    this.pads.down(padIndex(pad, button))
  }

  /**
   * @param {number} pad 1-based
   * @param {PadButton} button
   */
  padUp(pad, button) {
    this.pads.up(padIndex(pad, button))
  }

  /**
   * @param {number} pad 1-based
   * @param {'left' | 'right'} side
   * @param {'x' | 'y'} axis
   * @param {number} value -1 to 1
   */
  setStick(pad, side, axis, value) {
    this.padConnected[pad - 1] = 1
    this.rawSticks[stickIndex(pad, side, axis)] = value
  }

  /** Release keys and mouse, e.g. when the window loses focus. Gamepads keep polling. */
  releaseAll() {
    this.keys.releaseAll()
    this.keysDown = 0
    this.mouse.releaseAll()
  }

  /** Read devices that must be polled. Browser input reads gamepads here. */
  poll() {}

  /** Called once at the start of every tick. */
  snapshot() {
    this.poll()
    this.keys.snapshot()
    this.mouse.snapshot()
    this.pads.snapshot()
    for (let i = 0; i < this.rawSticks.length; i++) {
      const v = this.rawSticks[i]
      const size = Math.abs(v)
      // Rescale past the deadzone so small pushes still start from 0.
      this.sticks[i] = size < STICK_DEADZONE ? 0 : (Math.sign(v) * (Math.min(size, 1) - STICK_DEADZONE)) / (1 - STICK_DEADZONE)
    }
  }

  /** @param {number} index from keyIndex */
  isPressed(index) {
    return this.keys.pressed[index] === 1
  }

  /** @param {number} index from keyIndex */
  isHeld(index) {
    return this.keys.held[index] === 1
  }

  /** @param {number} index from keyIndex */
  isReleased(index) {
    return this.keys.released[index] === 1
  }

  /** Left button went down this tick. */
  isClicked() {
    return this.mouse.pressed[0] === 1
  }

  /**
   * @param {number} index from stickIndex
   * @returns {number}
   */
  stick(index) {
    return this.sticks[index]
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
   * @param {MouseButton} [button='left']
   */
  click(x, y, button = 'left') {
    this.pointerDown(x, y, button)
    this.pointerUp(button)
  }
}

/**
 * Keys whose default browser behavior (scrolling, focus moves) is suppressed while the game listens.
 * @type {ReadonlySet<KeyName>}
 */
const CAPTURED = new Set(['left', 'right', 'up', 'down', 'space', 'tab', 'backspace'])

/**
 * Minimal Gamepad shape, so tests can pass plain objects.
 * @typedef {{ connected: boolean; buttons: ReadonlyArray<{ pressed: boolean; value: number }>; axes: ReadonlyArray<number> }} PadLike
 */

/** Input bound to browser keyboard, pointer and gamepad. */
export class BrowserInput extends Input {
  /** @type {Array<() => void>} */
  cleanup = []

  /** @type {() => ArrayLike<PadLike | null>} */
  readPads = () =>
    typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
      ? /** @type {ArrayLike<PadLike | null>} */ (/** @type {unknown} */ (navigator.getGamepads()))
      : []

  /**
   * Copy gamepad state into the pad buttons and sticks. Called at the start of every tick.
   * The browser numbers pads from 0 and may leave holes; minijs numbers the connected ones 1 to 4.
   */
  poll() {
    const list = this.readPads()
    let slot = 0
    for (let i = 0; i < list.length && slot < MAX_PADS; i++) {
      const pad = list[i]
      if (!pad || !pad.connected) continue
      const n = slot + 1
      this.padConnected[slot] = 1
      for (let b = 0; b < PAD_BUTTON_COUNT; b++) {
        const button = pad.buttons[b]
        const down = button !== undefined && (button.pressed || button.value > 0.5)
        if (down) this.pads.down(padIndex(n, PAD_BUTTONS[b]))
        else this.pads.up(padIndex(n, PAD_BUTTONS[b]))
      }
      for (let a = 0; a < 4; a++) this.rawSticks[slot * 4 + a] = pad.axes[a] ?? 0
      slot++
    }
    for (; slot < MAX_PADS; slot++) {
      if (this.padConnected[slot] === 0) continue
      this.padConnected[slot] = 0
      for (let b = 0; b < PAD_BUTTON_COUNT; b++) this.pads.up(padIndex(slot + 1, PAD_BUTTONS[b]))
      this.rawSticks.fill(0, slot * 4, slot * 4 + 4)
    }
  }

  /**
   * Listen to keys on `keyTarget` (usually window, or a focusable canvas) and pointer on `canvas`.
   * Pointer release is always heard on the window, so dragging off the canvas still ends a click.
   * `internalWidth/Height` convert pointer coordinates to internal pixels.
   * @param {EventTarget} keyTarget
   * @param {HTMLCanvasElement} canvas
   * @param {number} internalWidth
   * @param {number} internalHeight
   */
  attach(keyTarget, canvas, internalWidth, internalHeight) {
    /** @param {Event} e */
    const onKeyDown = (e) => {
      const event = /** @type {KeyboardEvent} */ (e)
      const name = keyNameFromCode(event.code)
      if (name === null) return
      if (CAPTURED.has(name)) event.preventDefault()
      this.keyDown(name)
    }
    /** @param {Event} e */
    const onKeyUp = (e) => {
      const event = /** @type {KeyboardEvent} */ (e)
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
    const buttonOf = (event) => MOUSE_BUTTONS[event.button] ?? null
    /** @param {PointerEvent} event */
    const onPointerMove = (event) => {
      const [x, y] = toInternal(event)
      this.pointerMove(x, y)
    }
    /** @param {PointerEvent} event */
    const onPointerDown = (event) => {
      const button = buttonOf(event)
      if (button === null) return
      const [x, y] = toInternal(event)
      this.pointerDown(x, y, button)
    }
    /** @param {Event} e */
    const onPointerUp = (e) => {
      const button = buttonOf(/** @type {PointerEvent} */ (e))
      if (button !== null) this.pointerUp(button)
    }
    /** @param {Event} e Right-click belongs to the game, not the browser menu. */
    const onContextMenu = (e) => e.preventDefault()
    const onBlur = () => this.releaseAll()

    keyTarget.addEventListener('keydown', onKeyDown)
    keyTarget.addEventListener('keyup', onKeyUp)
    keyTarget.addEventListener('blur', onBlur)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('contextmenu', onContextMenu)
    const upTarget = canvas.ownerDocument?.defaultView ?? keyTarget
    upTarget.addEventListener('pointerup', onPointerUp)
    this.cleanup.push(
      () => keyTarget.removeEventListener('keydown', onKeyDown),
      () => keyTarget.removeEventListener('keyup', onKeyUp),
      () => keyTarget.removeEventListener('blur', onBlur),
      () => canvas.removeEventListener('pointermove', onPointerMove),
      () => canvas.removeEventListener('pointerdown', onPointerDown),
      () => canvas.removeEventListener('contextmenu', onContextMenu),
      () => upTarget.removeEventListener('pointerup', onPointerUp),
    )
  }

  detach() {
    for (const fn of this.cleanup) fn()
    this.cleanup.length = 0
    this.releaseAll()
  }
}
