// Input with edge detection. Raw events latch into "pressed since last tick"
// and "released since last tick", so a tap shorter than one tick still fires
// both `is pressed` and `is released` (and counts as held for that tick).

import { KEY_NAMES, keyNameFromCode, type KeyName } from '@minijs/lang'

const KEY_INDEX: ReadonlyMap<string, number> = new Map(KEY_NAMES.map((name, i) => [name, i]))

export function keyIndex(name: KeyName): number {
  return KEY_INDEX.get(name)!
}

export class Input {
  /** Pointer position in internal (screen) pixels. */
  mouseX = 0
  mouseY = 0

  private readonly rawDown = new Uint8Array(KEY_NAMES.length)
  private readonly latchPressed = new Uint8Array(KEY_NAMES.length)
  private readonly latchReleased = new Uint8Array(KEY_NAMES.length)
  private readonly held = new Uint8Array(KEY_NAMES.length)
  private readonly pressed = new Uint8Array(KEY_NAMES.length)
  private readonly released = new Uint8Array(KEY_NAMES.length)
  private rawMouseDown = false
  private latchClick = false
  private clicked = false

  keyDown(name: KeyName): void {
    const i = keyIndex(name)
    if (this.rawDown[i] === 1) return
    this.rawDown[i] = 1
    this.latchPressed[i] = 1
  }

  keyUp(name: KeyName): void {
    const i = keyIndex(name)
    if (this.rawDown[i] === 0) return
    this.rawDown[i] = 0
    this.latchReleased[i] = 1
  }

  pointerMove(x: number, y: number): void {
    this.mouseX = x
    this.mouseY = y
  }

  pointerDown(x: number, y: number): void {
    this.pointerMove(x, y)
    if (this.rawMouseDown) return
    this.rawMouseDown = true
    this.latchClick = true
  }

  pointerUp(): void {
    this.rawMouseDown = false
  }

  /** Release everything, e.g. when the window loses focus. */
  releaseAll(): void {
    for (let i = 0; i < this.rawDown.length; i++) {
      if (this.rawDown[i] === 1) {
        this.rawDown[i] = 0
        this.latchReleased[i] = 1
      }
    }
    this.rawMouseDown = false
  }

  /** Called once at the start of every tick. */
  snapshot(): void {
    for (let i = 0; i < this.rawDown.length; i++) {
      this.pressed[i] = this.latchPressed[i]!
      this.released[i] = this.latchReleased[i]!
      this.held[i] = this.rawDown[i]! | this.latchPressed[i]!
      this.latchPressed[i] = 0
      this.latchReleased[i] = 0
    }
    this.clicked = this.latchClick
    this.latchClick = false
  }

  isPressed(index: number): boolean {
    return this.pressed[index] === 1
  }

  isHeld(index: number): boolean {
    return this.held[index] === 1
  }

  isReleased(index: number): boolean {
    return this.released[index] === 1
  }

  isClicked(): boolean {
    return this.clicked
  }
}

/** Input driven by code. Used by tests and headless tools. */
export class ManualInput extends Input {
  /** Press and release within the same tick window. */
  tap(name: KeyName): void {
    this.keyDown(name)
    this.keyUp(name)
  }

  click(x: number, y: number): void {
    this.pointerDown(x, y)
    this.pointerUp()
  }
}

/** Keys whose default browser behavior (scrolling) is suppressed while the game listens. */
const CAPTURED: ReadonlySet<KeyName> = new Set(['left', 'right', 'up', 'down', 'space'])

/** Input bound to browser keyboard and pointer events. */
export class BrowserInput extends Input {
  private readonly cleanup: Array<() => void> = []

  /**
   * Listen to keys on `keyTarget` (usually window) and pointer on `canvas`.
   * `internalWidth/Height` convert pointer coordinates to internal pixels.
   */
  attach(keyTarget: Window, canvas: HTMLCanvasElement, internalWidth: number, internalHeight: number): void {
    const onKeyDown = (event: KeyboardEvent) => {
      const name = keyNameFromCode(event.code)
      if (name === null) return
      if (CAPTURED.has(name)) event.preventDefault()
      this.keyDown(name)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const name = keyNameFromCode(event.code)
      if (name !== null) this.keyUp(name)
    }
    const toInternal = (event: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect()
      const sx = rect.width > 0 ? internalWidth / rect.width : 1
      const sy = rect.height > 0 ? internalHeight / rect.height : 1
      return [(event.clientX - rect.left) * sx, (event.clientY - rect.top) * sy]
    }
    const onPointerMove = (event: PointerEvent) => {
      const [x, y] = toInternal(event)
      this.pointerMove(x, y)
    }
    const onPointerDown = (event: PointerEvent) => {
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

  detach(): void {
    for (const fn of this.cleanup) fn()
    this.cleanup.length = 0
    this.releaseAll()
  }
}
