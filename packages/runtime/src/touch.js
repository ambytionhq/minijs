// On-screen buttons for touch screens (`touch buttons` in the game block).
// Arrows press the arrow keys, A presses space, B presses enter, so a game
// written for the keyboard plays on a phone without changes.

/** @import { KeyName } from '@minijs/lang' */
/** @import { Input } from './input.js' */

/** @type {ReadonlyArray<{ key: KeyName; label: string; area: string }>} */
const PAD = [
  { key: 'up', label: '↑', area: 'up' },
  { key: 'left', label: '←', area: 'left' },
  { key: 'right', label: '→', area: 'right' },
  { key: 'down', label: '↓', area: 'down' },
]

/** @type {ReadonlyArray<{ key: KeyName; label: string }>} */
const ACTIONS = [
  { key: 'enter', label: 'B' },
  { key: 'space', label: 'A' },
]

/** True on devices whose main pointer is a finger. */
export function hasTouchScreen() {
  return typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
}

/**
 * @param {Input} input
 * @param {KeyName} key
 * @param {string} label
 */
function makeButton(input, key, label) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.setAttribute('aria-label', key === 'space' ? 'A (space)' : key === 'enter' ? 'B (enter)' : `${key} arrow`)
  Object.assign(button.style, {
    // Sized from the game area (the layer is a size container), so small screens keep the game visible.
    width: 'clamp(26px, 15cqmin, 56px)',
    height: 'clamp(26px, 15cqmin, 56px)',
    padding: '0',
    borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.35)',
    background: 'rgba(20,20,24,0.4)',
    color: 'rgba(255,255,255,0.92)',
    font: '600 clamp(12px, 7cqmin, 20px) system-ui, sans-serif',
    touchAction: 'none',
    userSelect: 'none',
    webkitUserSelect: 'none',
    pointerEvents: 'auto',
  })
  /** @param {PointerEvent} e */
  const down = (e) => {
    e.preventDefault()
    try {
      // Keep receiving this finger's events even if it slides off the button.
      button.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic or already-ended pointers can't be captured; the press still counts.
    }
    button.style.background = 'rgba(255,255,255,0.35)'
    input.keyDown(key)
  }
  const up = () => {
    button.style.background = 'rgba(20,20,24,0.4)'
    input.keyUp(key)
  }
  button.addEventListener('pointerdown', down)
  button.addEventListener('pointerup', up)
  button.addEventListener('pointercancel', up)
  button.addEventListener('lostpointercapture', up)
  button.addEventListener('contextmenu', (e) => e.preventDefault())
  return button
}

/**
 * Put the buttons over `parent` (the canvas's container). Returns a function that removes them.
 * @param {HTMLElement} parent
 * @param {Input} input
 * @returns {() => void}
 */
export function createTouchButtons(parent, input) {
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'
  const layer = document.createElement('div')
  layer.dataset.minijsTouch = ''
  Object.assign(layer.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: 'clamp(4px, 3cqmin, 14px)',
    pointerEvents: 'none',
    zIndex: '1',
    containerType: 'size',
  })

  const pad = document.createElement('div')
  Object.assign(pad.style, {
    display: 'grid',
    gridTemplateAreas: '". up ." "left . right" ". down ."',
    gap: 'clamp(2px, 1cqmin, 6px)',
  })
  for (const { key, label, area } of PAD) {
    const button = makeButton(input, key, label)
    button.style.gridArea = area
    pad.append(button)
  }

  const actions = document.createElement('div')
  Object.assign(actions.style, { display: 'flex', gap: 'clamp(4px, 3cqmin, 14px)', alignItems: 'flex-end' })
  for (const { key, label } of ACTIONS) {
    const button = makeButton(input, key, label)
    if (key === 'space') button.style.marginBottom = 'clamp(12px, 8cqmin, 30px)'
    actions.append(button)
  }

  layer.append(pad, actions)
  parent.append(layer)
  return () => layer.remove()
}
