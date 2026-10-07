// Controls: named actions fed by several inputs (`control jump` with space, up,
// gamepad a, ...). Each tick a control is held when any of its inputs is held;
// it is pressed on the tick it becomes held and released on the tick it stops,
// so holding two of its keys at once still gives one press.

/** @import { ControlDecl, InputSource } from '@minijs/lang' */
/** @import { Input } from './input.js' */
import { keyIndex, mouseIndex, padIndex } from './input.js'

/**
 * @param {InputSource} source
 * @returns {(input: Input) => boolean} true while that input is held this tick
 */
function heldCheck(source) {
  switch (source.kind) {
    case 'key': {
      const i = keyIndex(source.key)
      return (input) => input.keys.held[i] === 1
    }
    case 'mouse': {
      const i = mouseIndex(source.button)
      return (input) => input.mouse.held[i] === 1
    }
    case 'pad': {
      const i = padIndex(source.pad, source.button)
      return (input) => input.pads.held[i] === 1
    }
  }
}

export class ControlState {
  /** @type {string[]} */
  names
  /** @type {Array<Array<(input: Input) => boolean>>} */
  checks
  /** @type {Uint8Array} */
  held
  /** @type {Uint8Array} */
  pressed
  /** @type {Uint8Array} */
  released

  /** @param {readonly ControlDecl[]} controls */
  constructor(controls) {
    this.names = controls.map((c) => c.name)
    this.checks = controls.map((c) => c.sources.map(heldCheck))
    this.held = new Uint8Array(controls.length)
    this.pressed = new Uint8Array(controls.length)
    this.released = new Uint8Array(controls.length)
  }

  /**
   * Call after `input.snapshot()`.
   * @param {Input} input
   */
  update(input) {
    for (let i = 0; i < this.checks.length; i++) {
      const checks = this.checks[i]
      let now = 0
      for (let j = 0; j < checks.length; j++) {
        if (checks[j](input)) {
          now = 1
          break
        }
      }
      const was = this.held[i]
      this.pressed[i] = now & (was ^ 1)
      this.released[i] = was & (now ^ 1)
      this.held[i] = now
    }
  }

  reset() {
    this.held.fill(0)
    this.pressed.fill(0)
    this.released.fill(0)
  }
}
