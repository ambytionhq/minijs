// Small building blocks shared by the visual editors: sliders, switches, undo, saving.
// Every editor is plain DOM, like the rest of Studio.
//
// Icons named without their "ph-" start, listed here so scripts/subset-studio-icons.py keeps them:
// ph-paint-brush ph-paint-bucket ph-eyedropper ph-selection ph-hand-grabbing ph-person-simple-run
// ph-arrow-down ph-arrow-left ph-arrow-right ph-arrow-u-up-left ph-arrow-u-up-right ph-arrow-up
// ph-check-circle ph-copy ph-cube ph-dice-five ph-download-simple ph-eraser ph-eye ph-eye-slash
// ph-flip-horizontal ph-game-controller ph-grid-four ph-image ph-magic-wand ph-magnifying-glass-minus
// ph-magnifying-glass-plus ph-map-trifold ph-music-notes ph-pencil-simple ph-play ph-plus ph-shuffle
// ph-sparkle ph-speaker-high ph-speaker-slash ph-stack ph-trash ph-tree-structure ph-wave-sawtooth
// ph-wave-sine ph-wave-square ph-wave-triangle ph-wind ph-x

/**
 * Make an element. Props starting with "on" become listeners; `class`, `text` and `aria-*` do what they say.
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...(Node | string | null | undefined | false)} children
 * @returns {any}
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value)
    else if (key === 'style') Object.assign(node.style, value)
    else if (key in node && !key.includes('-') && key !== 'list') /** @type {any} */ (node)[key] = value
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    node.append(child)
  }
  return node
}

/**
 * Replace an element's children, skipping the ones left out with null or false.
 * @param {Element} node
 * @param {...(Node | string | null | undefined | false)} children
 */
export function fill(node, ...children) {
  node.replaceChildren(...children.filter((c) => c !== null && c !== undefined && c !== false))
}

/** @param {string} name Phosphor icon without its "ph-" start */
export function icon(name) {
  return h('i', { class: `ph ph-${name}`, 'aria-hidden': 'true' })
}

/**
 * A round button with only an icon. `label` says what it does, for tooltips and screen readers.
 * @param {string} iconName
 * @param {string} label
 * @param {() => void} onClick
 * @param {{ pressed?: boolean; disabled?: boolean; class?: string }} [options]
 */
export function iconButton(iconName, label, onClick, options = {}) {
  const b = h('button', {
    type: 'button',
    class: `icon-btn tool-icon-btn ${options.class ?? ''}`,
    title: label,
    'aria-label': label,
    disabled: options.disabled,
    onClick,
  }, icon(iconName))
  if (options.pressed !== undefined) b.setAttribute('aria-pressed', String(options.pressed))
  return b
}

/**
 * A button with words.
 * @param {string} text
 * @param {() => void} onClick
 * @param {{ icon?: string; primary?: boolean; title?: string; disabled?: boolean }} [options]
 */
export function textButton(text, onClick, options = {}) {
  return h('button', {
    type: 'button',
    class: `btn tool-btn ${options.primary ? 'btn-primary' : ''}`,
    title: options.title,
    disabled: options.disabled,
    onClick,
  }, options.icon ? icon(options.icon) : null, text)
}

let nextId = 0
const uid = (/** @type {string} */ base) => `${base}-${++nextId}`

/**
 * A labelled slider with its value on the right. `onInput` runs while dragging, `onChange` when let go.
 * @param {object} o
 * @param {string} o.label
 * @param {number} o.min
 * @param {number} o.max
 * @param {number} [o.step]
 * @param {number} o.value
 * @param {(v: number) => string} [o.format]
 * @param {string} [o.help] One line under the slider saying what it does.
 * @param {(v: number) => void} [o.onInput]
 * @param {(v: number) => void} [o.onChange]
 */
export function slider({ label, min, max, step = 1, value, format = String, help, onInput, onChange }) {
  const id = uid('slider')
  const output = h('output', { class: 'tool-slider-value', for: id })
  const input = h('input', { id, type: 'range', min, max, step, class: 'tool-slider' })
  input.value = String(value)
  const fill = () => {
    const v = Number(input.value)
    input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`)
    output.textContent = format(v)
  }
  input.addEventListener('input', () => {
    fill()
    onInput?.(Number(input.value))
  })
  input.addEventListener('change', () => onChange?.(Number(input.value)))
  fill()
  const root = h('div', { class: 'tool-field' },
    h('div', { class: 'tool-slider-head' }, h('label', { for: id, text: label }), output),
    input,
    help ? h('p', { class: 'tool-help', text: help }) : null,
  )
  return Object.assign(root, {
    /** @param {number} v */
    set(v) {
      input.value = String(v)
      fill()
    },
  })
}

/**
 * Pick one of a few choices. Works with arrow keys.
 * @template {string | number} T
 * @param {object} o
 * @param {string} o.label
 * @param {Array<{ value: T; label?: string; icon?: string; title?: string }>} o.options
 * @param {T} o.value
 * @param {(v: T) => void} o.onChange
 * @param {boolean} [o.hideLabel]
 */
export function choice({ label, options, value, onChange, hideLabel }) {
  let current = value
  const row = h('div', { class: 'tool-choice', role: 'radiogroup', 'aria-label': label })
  const buttons = options.map((option, i) => {
    const b = h('button', {
      type: 'button',
      role: 'radio',
      title: option.title ?? option.label,
      'aria-label': option.label ?? option.title,
      onClick: () => pick(option.value, false),
      onKeydown: (/** @type {KeyboardEvent} */ e) => {
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
        if (step === 0) return
        e.preventDefault()
        const next = options[(i + step + options.length) % options.length]
        pick(next.value, true)
      },
    }, option.icon ? icon(option.icon) : null, option.label && !option.icon ? option.label : null, option.label && option.icon ? h('span', { text: option.label }) : null)
    row.append(b)
    return b
  })
  const draw = (focus = false) => {
    buttons.forEach((b, i) => {
      const on = options[i].value === current
      b.setAttribute('aria-checked', String(on))
      b.tabIndex = on ? 0 : -1
      if (on && focus) b.focus()
    })
  }
  /**
   * @param {T} v
   * @param {boolean} focus
   */
  function pick(v, focus) {
    current = v
    draw(focus)
    onChange(v)
  }
  draw()
  const root = h('div', { class: 'tool-field' }, hideLabel ? null : h('span', { class: 'tool-label', text: label }), row)
  return Object.assign(root, {
    /** @param {T} v */
    set(v) {
      current = v
      draw()
    },
  })
}

/**
 * On or off.
 * @param {object} o
 * @param {string} o.label
 * @param {boolean} o.value
 * @param {(v: boolean) => void} o.onChange
 * @param {string} [o.help]
 */
export function toggle({ label, value, onChange, help }) {
  const input = h('input', { type: 'checkbox', class: 'tool-toggle-input', onChange: () => onChange(input.checked) })
  input.checked = value
  const root = h('div', { class: 'tool-field' },
    h('label', { class: 'tool-toggle' }, input, h('span', { class: 'tool-toggle-track' }), h('span', { text: label })),
    help ? h('p', { class: 'tool-help', text: help }) : null,
  )
  return Object.assign(root, {
    /** @param {boolean} v */
    set(v) {
      input.checked = v
    },
  })
}

/**
 * Labelled box with a title.
 * @param {string} title
 * @param {...(Node | null | false)} children
 */
export function group(title, ...children) {
  return h('section', { class: 'tool-group' }, h('h3', { text: title }), ...children)
}

/**
 * Undo and redo for an editor whose whole state fits in a string.
 * @param {string} initial
 * @param {(state: string) => void} apply
 * @param {() => void} [onChange] Runs after every change, for buttons.
 */
export function createHistory(initial, apply, onChange) {
  const MAX = 100
  const past = [initial]
  /** @type {string[]} */
  const future = []
  return {
    /** @param {string} state */
    push(state) {
      if (past[past.length - 1] === state) return
      past.push(state)
      if (past.length > MAX) past.shift()
      future.length = 0
      onChange?.()
    },
    undo() {
      if (past.length < 2) return
      future.push(/** @type {string} */ (past.pop()))
      apply(past[past.length - 1])
      onChange?.()
    },
    redo() {
      const state = future.pop()
      if (state === undefined) return
      past.push(state)
      apply(state)
      onChange?.()
    },
    get canUndo() {
      return past.length > 1
    },
    get canRedo() {
      return future.length > 0
    },
  }
}

/**
 * Ctrl or Cmd + Z anywhere inside `root`, unless someone is typing in a box.
 * @param {HTMLElement} root
 * @param {{ undo: () => void; redo: () => void }} history
 */
export function wireUndoKeys(root, history) {
  root.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
    const target = /** @type {HTMLElement} */ (e.target)
    if (target.tagName === 'INPUT' && /** @type {HTMLInputElement} */ (target).type === 'text') return
    if (target.tagName === 'TEXTAREA') return
    e.preventDefault()
    if (e.shiftKey) history.redo()
    else history.undo()
  })
}

/**
 * Keep a canvas's pixels matched to its size on screen. Redraws when it changes.
 * @param {HTMLCanvasElement} canvas
 * @param {(cssWidth: number, cssHeight: number, ratio: number) => void} draw
 * @returns {() => void} stop watching
 */
export function fitCanvas(canvas, draw) {
  const box = /** @type {HTMLElement} */ (canvas.parentElement)
  const apply = () => {
    const rect = box.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(rect.width * ratio)
    const h2 = Math.round(rect.height * ratio)
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h2) canvas.height = h2
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    draw(rect.width, rect.height, ratio)
  }
  const observer = new ResizeObserver(apply)
  observer.observe(box)
  apply()
  return () => observer.disconnect()
}

/** A CSS variable's color, so canvases follow the light and dark themes. @param {string} name */
export function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The strip along the bottom of an editor: how to use this file in a game, with a
 * button that adds the line for you.
 * @param {import('./index.js').ToolContext} ctx
 * @param {string} declaration e.g. `sound coin "coin.sound"`
 * @param {string[]} examples lines to copy into rules
 */
export function usageStrip(ctx, declaration, examples) {
  const status = h('span', { class: 'tool-usage-status' })
  const add = textButton('Add to my game', async () => {
    await ctx.addToGame(declaration)
    await refresh()
  }, { icon: 'plus', primary: true })
  const refresh = async () => {
    const inGame = await ctx.gameHasLine(declaration)
    const hasGame = ctx.runPath() !== null
    add.hidden = inGame || !hasGame
    status.hidden = !inGame
    if (inGame) status.replaceChildren(icon('check-circle'), 'In your game')
  }
  void refresh()
  /**
   * @param {string} line
   */
  const chip = (line) => {
    const copy = iconButton('copy', `Copy: ${line}`, async () => {
      try {
        await navigator.clipboard.writeText(line)
        ctx.toast('Copied. Paste it under a "when" line in your game.')
      } catch {
        ctx.toast(`Couldn't copy. The line is: ${line}`)
      }
    })
    return h('span', { class: 'tool-usage-line' }, h('code', { text: line }), copy)
  }
  return h('footer', { class: 'tool-usage' },
    h('div', { class: 'tool-usage-main' }, h('code', { text: declaration }), add, status),
    examples.length > 0 ? h('div', { class: 'tool-usage-lines' }, ...examples.map(chip)) : null,
  )
}

/**
 * A name a game can use, made from a file name.
 * @param {string} fileName
 * @returns {string}
 */
export function assetName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '')
  if (base === '') return 'my-file'
  const reserved = new Set('game thing control map when always key mouse gamepad any random count the not and or is to at by of on in left right up down x y vx vy width height text pressed held released'.split(' '))
  return reserved.has(base) ? `my-${base}` : base
}
