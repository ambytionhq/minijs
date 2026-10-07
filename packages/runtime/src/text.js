// Text slots. Each `show text` action owns one slot (assigned at lowering).
// Running the action again replaces the slot. Slots persist until restart.
// The string is rebuilt only when an interpolated value changed, so an
// `always` rule showing the score does not allocate every tick.

/**
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 100) / 100)
}

/**
 * @typedef {object} TextSlot
 * @property {boolean} visible
 * @property {string} text
 * @property {number} x Screen position, used when `centered` is false.
 * @property {number} y
 * @property {boolean} centered
 * @property {string} color
 * @property {Float64Array} values Last interpolated values, for change detection.
 */

export class TextLayer {
  /** @type {TextSlot[]} */
  slots = []

  /**
   * Create a slot. Called during lowering, never during ticks.
   * @param {number} valueCount
   * @returns {number}
   */
  addSlot(valueCount) {
    this.slots.push({
      visible: false,
      text: '',
      x: 0,
      y: 0,
      centered: true,
      color: 'white',
      values: new Float64Array(valueCount).fill(Number.NaN),
    })
    return this.slots.length - 1
  }

  clear() {
    for (const slot of this.slots) {
      slot.visible = false
      slot.text = ''
      slot.values.fill(Number.NaN)
    }
  }
}
