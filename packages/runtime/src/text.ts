// Text slots. Each `show text` action owns one slot (assigned at lowering).
// Running the action again replaces the slot. Slots persist until restart.
// The string is rebuilt only when an interpolated value changed, so an
// `always` rule showing the score does not allocate every tick.

export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 100) / 100)
}

export interface TextSlot {
  visible: boolean
  text: string
  /** Screen position, used when `centered` is false. */
  x: number
  y: number
  centered: boolean
  color: string
  /** Last interpolated values, for change detection. */
  values: Float64Array
}

export class TextLayer {
  readonly slots: TextSlot[] = []

  /** Create a slot. Called during lowering, never during ticks. */
  addSlot(valueCount: number): number {
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

  clear(): void {
    for (const slot of this.slots) {
      slot.visible = false
      slot.text = ''
      slot.values.fill(Number.NaN)
    }
  }
}
