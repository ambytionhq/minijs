// The states picture: a game's `states` blocks drawn as boxes and arrows. Drag between
// boxes to add an arrow, click a box to change what it does. Every change is written
// back into the .mini text, so the picture and the words always agree. While the game
// runs, the box each copy is in lights up.

import { storageKeyPart } from './states-layout.js'
import { addMachine, addState, addTransition, arrows, changeTransition, lineText, makeStart, readProgram, readSection, removeState, renameState, writeSection } from './machine-edit.js'
import { loadSetting, saveSetting } from '../storage.js'
import { openDialog } from '../ui/dialog.js'
import { fill, group, h, icon, iconButton, textButton } from './ui.js'

/** @import { MachineDecl, Program } from '@minijs/lang' */

/**
 * @typedef {object} StatesViewOptions
 * @property {() => string} getText
 * @property {(text: string) => void} setText
 * @property {() => import('@minijs/runtime').Game | null} game
 * @property {string} key Where to remember box positions.
 * @property {(message: string) => void} toast
 */

const NODE_W = 172
const NODE_H = 76

const KEYS = ['space', 'enter', 'up', 'down', 'left', 'right', 'a', 'd', 'w', 's', 'e', 'r', 'x', 'z', 'shift', 'escape']

/** Names a state may have: the same as other names in the language. @param {string} name */
const cleanName = (name) => name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '')

/**
 * @param {HTMLElement} host
 * @param {StatesViewOptions} options
 */
export function createStatesView(host, options) {
  /** @type {Program} */
  let program = readProgram(options.getText())
  /** @type {string | null} which machine: thing name, or null for the game */
  let owner = null
  /** @type {string | null} */
  let selected = null
  /** @type {Record<string, { x: number; y: number }>} */
  let positions = {}
  /** @type {{ from: string; x: number; y: number } | null} */
  let linking = null
  let timer = 0

  const tabs = h('div', { class: 'track-tabs', role: 'tablist', 'aria-label': 'Which states to show' })
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.classList.add('states-arrows')
  svg.setAttribute('aria-hidden', 'true')
  const nodes = h('div', { class: 'states-nodes' })
  const canvas = h('div', { class: 'states-canvas' }, svg, nodes)
  const scroller = h('div', { class: 'states-scroller' }, canvas)
  const inspector = h('aside', { class: 'tool-column states-inspector' })
  const empty = h('div', { class: 'tool-empty' })
  const body = h('div', { class: 'tool-body states-body' },
    h('div', { class: 'tool-column states-middle' }, tabs, scroller, h('p', { class: 'tool-help', text: 'Drag from a box\'s arrow to another box to add a way between them. Click a box to change it.' })),
    inspector,
  )
  const root = h('div', { class: 'tool states-tool' }, empty, body)
  host.replaceChildren(root)

  const machine = () => program.machines.find((m) => m.thing === owner)

  /** @param {string} next */
  function apply(next) {
    options.setText(next)
    program = readProgram(next)
    render()
  }

  const positionKey = () => `states:${options.key}:${storageKeyPart(owner)}`

  function loadPositions() {
    try {
      positions = JSON.parse(loadSetting(positionKey()) ?? '{}') ?? {}
    } catch {
      positions = {}
    }
  }

  /** @param {MachineDecl} m */
  function layout(m) {
    const width = Math.max(scroller.clientWidth, NODE_W * 2 + 120)
    // Roomy when there is space, so the words on arrows can be read.
    const perRow = Math.max(2, Math.floor((width - 32) / (NODE_W + 150)))
    const gap = Math.max(64, Math.min(150, (width - 48 - perRow * NODE_W) / Math.max(1, perRow - 1)))
    m.states.forEach((s, i) => {
      if (positions[s.name]) return
      positions[s.name] = { x: 24 + (i % perRow) * (NODE_W + gap), y: 24 + Math.floor(i / perRow) * (NODE_H + 84) }
    })
  }

  function render() {
    const has = program.machines.length > 0
    empty.hidden = has
    body.hidden = !has
    if (!has) {
      renderEmpty()
      return
    }
    if (!machine()) owner = program.machines[0].thing
    loadPositions()
    const m = /** @type {MachineDecl} */ (machine())
    layout(m)
    if (selected !== null && !m.states.some((s) => s.name === selected)) selected = null
    renderTabs()
    renderNodes(m)
    renderArrows(m)
    renderInspector(m)
    updateLive()
  }

  function renderEmpty() {
    empty.replaceChildren(
      icon('tree-structure'),
      h('h3', { text: 'Nothing has states yet' }),
      h('p', { class: 'muted', text: 'States let something act differently at different times, like an enemy that walks, then chases, then rests.' }),
      h('div', { class: 'tool-row tool-row-center' },
        ...program.things.slice(0, 8).map((t) => textButton(`Give ${t.name} states`, () => {
          owner = t.name
          apply(addMachine(options.getText(), t.name))
        })),
        textButton('Give the whole game states', () => {
          owner = null
          apply(addMachine(options.getText(), null))
        }, { icon: 'game-controller', title: 'A menu, then playing, then game over' }),
      ),
    )
  }

  function renderTabs() {
    const used = new Set(program.machines.map((m) => m.thing))
    const addable = program.things.filter((t) => !used.has(t.name))
    fill(tabs,
      ...program.machines.map((m) => h('button', {
        type: 'button',
        role: 'tab',
        class: 'track-tab',
        'aria-selected': String(m.thing === owner),
        onClick: () => {
          owner = m.thing
          selected = null
          render()
        },
      }, m.thing ?? 'the whole game')),
      addable.length > 0 || !used.has(null) ? iconButton('plus', 'Give something else states', () => void chooseOwner(addable.map((t) => t.name), !used.has(null))) : null,
    )
  }

  /**
   * @param {string[]} names
   * @param {boolean} offerGame
   */
  async function chooseOwner(names, offerGame) {
    const picked = await openDialog({
      title: 'Give something states',
      render(dialogBody, close) {
        dialogBody.append(h('div', { class: 'tool-row' },
          ...names.map((name) => textButton(name, () => close({ owner: name }))),
          offerGame ? textButton('The whole game', () => close({ owner: null })) : null,
        ))
      },
    })
    if (!picked) return
    owner = /** @type {{ owner: string | null }} */ (picked).owner
    selected = null
    apply(addMachine(options.getText(), owner))
  }

  /** @param {MachineDecl} m */
  function renderNodes(m) {
    nodes.replaceChildren(...m.states.map((s, i) => {
      const at = positions[s.name]
      const parts = []
      if (s.enter.length > 0) parts.push('on enter')
      if (s.always.length > 0) parts.push('always')
      if (s.leave.length > 0) parts.push('on leave')
      if (s.rules.length > 0) parts.push(`${s.rules.length} ${s.rules.length === 1 ? 'rule' : 'rules'}`)
      const handle = h('button', {
        type: 'button',
        class: 'state-handle',
        title: `Drag to another box to add a way out of ${s.name}`,
        'aria-label': `Add a way out of ${s.name}`,
        onClick: (/** @type {Event} */ e) => {
          e.stopPropagation()
          selected = s.name
          render()
          inspector.querySelector('select')?.focus()
        },
      }, icon('arrow-right'))
      handle.addEventListener('pointerdown', (e) => startLink(e, s.name))
      const node = h('div', {
        class: 'state-node',
        role: 'button',
        tabIndex: 0,
        'data-state': s.name,
        'aria-pressed': String(selected === s.name),
        style: { transform: `translate(${at.x}px, ${at.y}px)`, width: `${NODE_W}px`, minHeight: `${NODE_H}px` },
        onKeydown: (/** @type {KeyboardEvent} */ e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            select(s.name)
          }
        },
      },
        h('div', { class: 'state-title' },
          i === 0 ? h('span', { class: 'tree-tag', title: 'New copies start here', text: 'start' }) : null,
          h('span', { class: 'state-name', text: s.name }),
          h('span', { class: 'state-count', hidden: true }),
        ),
        h('p', { class: 'state-parts', text: parts.length > 0 ? parts.join(', ') : 'Does nothing yet' }),
        handle,
      )
      wireDrag(node, s.name)
      return node
    }), h('button', {
      type: 'button',
      class: 'btn tool-btn states-add',
      style: { transform: `translate(${24}px, ${Math.max(...m.states.map((s) => positions[s.name].y)) + NODE_H + 28}px)` },
      onClick: () => void newState(),
    }, icon('plus'), 'New state'))
    const right = Math.max(...m.states.map((s) => positions[s.name].x)) + NODE_W + 80
    const bottom = Math.max(...m.states.map((s) => positions[s.name].y)) + NODE_H + 88
    canvas.style.width = `${Math.max(right, 200)}px`
    canvas.style.height = `${bottom}px`
  }

  /** @param {string} name */
  function select(name) {
    selected = name
    const m = machine()
    if (m) {
      for (const n of /** @type {NodeListOf<HTMLElement>} */ (nodes.querySelectorAll('.state-node'))) {
        n.setAttribute('aria-pressed', String(n.dataset.state === name))
      }
      renderArrows(m)
      renderInspector(m)
    }
  }

  async function newState() {
    const m = machine()
    if (!m) return
    const words = ['walk', 'chase', 'rest', 'jump', 'hurt', 'idle', 'menu', 'playing', 'over']
    const fallback = words.find((w) => !m.states.some((s) => s.name === w)) ?? `state-${m.states.length + 1}`
    const value = await askName('New state', 'What is it doing in this state?', fallback)
    if (!value) return
    if (m.states.some((s) => s.name === value)) {
      options.toast(`There is already a state called "${value}".`)
      return
    }
    apply(addState(options.getText(), owner, value))
    select(value)
  }

  /**
   * @param {string} title
   * @param {string} description
   * @param {string} initial
   * @returns {Promise<string | null>}
   */
  async function askName(title, description, initial) {
    const value = await openDialog({
      title,
      description,
      render(dialogBody, close) {
        const input = h('input', { type: 'text', class: 'tool-input', id: 'state-name-input', value: initial, maxLength: 30 })
        const submit = (/** @type {Event} */ e) => {
          e.preventDefault()
          close(cleanName(input.value))
        }
        dialogBody.append(h('form', { class: 'tool-stack', onSubmit: submit },
          h('div', { class: 'tool-field' }, h('label', { class: 'tool-label', for: 'state-name-input', text: 'Name' }), input),
          h('div', { class: 'tool-row tool-row-end' }, h('button', { type: 'submit', class: 'btn btn-primary', text: 'Done' })),
        ))
        queueMicrotask(() => input.select())
      },
    })
    return typeof value === 'string' && value !== '' ? value : null
  }

  /**
   * @param {HTMLElement} node
   * @param {string} name
   */
  function wireDrag(node, name) {
    /** @type {{ x: number; y: number; startX: number; startY: number; moved: boolean } | null} */
    let drag = null
    node.addEventListener('pointerdown', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest('.state-handle')) return
      node.setPointerCapture(e.pointerId)
      drag = { x: e.clientX, y: e.clientY, startX: positions[name].x, startY: positions[name].y, moved: false }
    })
    node.addEventListener('pointermove', (e) => {
      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return
      drag.moved = true
      positions[name] = { x: Math.max(0, drag.startX + dx), y: Math.max(0, drag.startY + dy) }
      node.style.transform = `translate(${positions[name].x}px, ${positions[name].y}px)`
      const m = machine()
      if (m) renderArrows(m)
    })
    node.addEventListener('pointerup', () => {
      if (!drag) return
      const moved = drag.moved
      drag = null
      if (moved) {
        saveSetting(positionKey(), JSON.stringify(positions))
        const m = machine()
        if (m) renderNodes(m)
      } else {
        select(name)
      }
    })
    node.addEventListener('pointercancel', () => {
      drag = null
    })
  }

  /**
   * @param {PointerEvent} e
   * @param {string} from
   */
  function startLink(e, from) {
    e.preventDefault()
    e.stopPropagation()
    const handle = /** @type {HTMLElement} */ (e.currentTarget)
    handle.setPointerCapture(e.pointerId)
    const rect = canvas.getBoundingClientRect()
    linking = { from, x: e.clientX - rect.left, y: e.clientY - rect.top }
    const move = (/** @type {PointerEvent} */ ev) => {
      if (!linking) return
      linking.x = ev.clientX - rect.left
      linking.y = ev.clientY - rect.top
      const m = machine()
      if (m) renderArrows(m)
    }
    const up = (/** @type {PointerEvent} */ ev) => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', cancel)
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.state-node')
      const to = /** @type {HTMLElement | null} */ (under)?.dataset.state
      linking = null
      const m = machine()
      if (m) renderArrows(m)
      if (to) void addArrowDialog(from, to)
    }
    const cancel = () => {
      linking = null
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', cancel)
      const m = machine()
      if (m) renderArrows(m)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', cancel)
  }

  /**
   * Ask what makes it go from one state to another.
   * @param {string} from
   * @param {string} to
   */
  async function addArrowDialog(from, to) {
    const self = owner ?? 'player'
    const things = program.things.map((t) => t.name)
    const condition = await openDialog({
      title: `Go from ${from} to ${to} when...`,
      render(dialogBody, close) {
        const seconds = h('input', { type: 'number', class: 'tool-input', id: 'arrow-seconds', min: 0.1, step: 0.1, value: 2 })
        const key = h('select', { class: 'tool-input', id: 'arrow-key' }, ...KEYS.map((k) => h('option', { value: k, text: k })))
        const a = h('select', { class: 'tool-input', 'aria-label': 'This thing' }, ...things.map((t) => h('option', { value: t, text: t, selected: t === owner })))
        const b = h('select', { class: 'tool-input', 'aria-label': 'Touches this thing' }, ...things.map((t) => h('option', { value: t, text: t })))
        const custom = h('input', { type: 'text', class: 'tool-input', id: 'arrow-custom', placeholder: `${self} x is above 100` })
        /** @type {'time' | 'key' | 'touch' | 'true'} */
        let kind = 'time'
        const preview = h('code', { class: 'states-preview' })
        const line = () => {
          switch (kind) {
            case 'time':
              return `after ${Number(seconds.value) || 1} seconds`
            case 'key':
              return `when ${key.value} key is pressed`
            case 'touch':
              return `when ${a.value} touches ${b.value}`
            case 'true':
              return `when ${custom.value.trim() || `${self} x is above 100`}`
          }
        }
        const refresh = () => {
          preview.textContent = `go to ${to} ${line()}`
        }
        /**
         * @param {'time' | 'key' | 'touch' | 'true'} value
         * @param {string} label
         * @param {HTMLElement} extra
         */
        const option = (value, label, extra) => {
          const radio = h('input', { type: 'radio', name: 'arrow-kind', checked: value === kind, onChange: () => { kind = value; refresh() } })
          return h('label', { class: 'arrow-option' }, radio, h('span', { class: 'arrow-option-label', text: label }), extra)
        }
        for (const field of [seconds, key, a, b, custom]) field.addEventListener('input', refresh)
        refresh()
        dialogBody.append(h('form', {
          class: 'tool-stack',
          onSubmit: (/** @type {Event} */ e) => {
            e.preventDefault()
            close(line())
          },
        },
          option('time', 'Some time has passed', h('span', { class: 'arrow-inline' }, seconds, 'seconds')),
          option('key', 'A key is pressed', key),
          things.length > 0 ? option('touch', 'Two things touch', h('span', { class: 'arrow-inline' }, a, 'touches', b)) : null,
          option('true', 'Something is true', custom),
          preview,
          h('div', { class: 'tool-row tool-row-end' }, h('button', { type: 'submit', class: 'btn btn-primary', text: 'Add it' })),
        ))
      },
    })
    if (typeof condition !== 'string') return
    selected = from
    apply(addTransition(options.getText(), owner, from, condition, to))
  }

  /** @param {MachineDecl} m */
  function renderArrows(m) {
    const ns = 'http://www.w3.org/2000/svg'
    svg.replaceChildren()
    const defs = document.createElementNS(ns, 'defs')
    const marker = document.createElementNS(ns, 'marker')
    marker.setAttribute('id', 'state-arrowhead')
    marker.setAttribute('viewBox', '0 0 10 10')
    marker.setAttribute('refX', '9')
    marker.setAttribute('refY', '5')
    marker.setAttribute('markerWidth', '7')
    marker.setAttribute('markerHeight', '7')
    marker.setAttribute('orient', 'auto-start-reverse')
    const tip = document.createElementNS(ns, 'path')
    tip.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z')
    tip.setAttribute('class', 'state-arrow-tip')
    marker.append(tip)
    defs.append(marker)
    svg.append(defs)

    const text = options.getText()
    /** @type {Map<string, number>} */
    const seen = new Map()
    for (const arrow of arrows(m)) {
      const a = positions[arrow.from]
      const b = positions[arrow.to]
      if (!a || !b) continue
      const pair = `${arrow.from}>${arrow.to}`
      const repeat = seen.get(pair) ?? 0
      seen.set(pair, repeat + 1)
      const path = document.createElementNS(ns, 'path')
      const on = arrow.from === selected
      path.setAttribute('class', on ? 'state-arrow is-on' : 'state-arrow')
      path.setAttribute('marker-end', 'url(#state-arrowhead)')
      let labelX
      let labelY
      if (arrow.from === arrow.to) {
        const x = a.x + NODE_W / 2
        const y = a.y
        const lift = 34 + repeat * 18
        path.setAttribute('d', `M ${x - 26} ${y} C ${x - 44} ${y - lift}, ${x + 44} ${y - lift}, ${x + 26} ${y}`)
        labelX = x
        labelY = y - lift + 4
      } else {
        const fromX = a.x + NODE_W / 2
        const fromY = a.y + NODE_H / 2
        const toX = b.x + NODE_W / 2
        const toY = b.y + NODE_H / 2
        const [sx, sy] = edgePoint(fromX, fromY, toX, toY)
        const [ex, ey] = edgePoint(toX, toY, fromX, fromY)
        // Bend each arrow to its own right, so two-way arrows don't overlap.
        const dx = ex - sx
        const dy = ey - sy
        const length = Math.hypot(dx, dy) || 1
        const bend = 18 + repeat * 22
        const cx = (sx + ex) / 2 - (dy / length) * bend
        const cy = (sy + ey) / 2 + (dx / length) * bend
        path.setAttribute('d', `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`)
        labelX = (sx + 2 * cx + ex) / 4
        labelY = (sy + 2 * cy + ey) / 4
      }
      svg.append(path)
      const words = lineText(text, arrow.line).replace(/^go to \S+\s*/, '')
      const label = document.createElementNS(ns, 'text')
      label.setAttribute('class', on ? 'state-arrow-label is-on' : 'state-arrow-label')
      label.setAttribute('x', String(labelX))
      label.setAttribute('y', String(labelY))
      label.setAttribute('text-anchor', 'middle')
      label.textContent = words.length > 34 ? `${words.slice(0, 33)}...` : words
      svg.append(label)
      // A plate behind the words, so the arrow doesn't run through them.
      const box = label.getBBox()
      const plate = document.createElementNS(ns, 'rect')
      plate.setAttribute('class', 'state-arrow-plate')
      plate.setAttribute('x', String(box.x - 4))
      plate.setAttribute('y', String(box.y - 2))
      plate.setAttribute('width', String(box.width + 8))
      plate.setAttribute('height', String(box.height + 4))
      plate.setAttribute('rx', '4')
      svg.insertBefore(plate, label)
    }
    if (linking && positions[linking.from]) {
      const start = positions[linking.from]
      const line = document.createElementNS(ns, 'path')
      line.setAttribute('class', 'state-arrow is-on')
      line.setAttribute('marker-end', 'url(#state-arrowhead)')
      line.setAttribute('d', `M ${start.x + NODE_W} ${start.y + NODE_H / 2} L ${linking.x} ${linking.y}`)
      svg.append(line)
    }
  }

  /**
   * Where a line from the middle of a box leaves the box.
   * @param {number} x
   * @param {number} y
   * @param {number} toX
   * @param {number} toY
   * @returns {[number, number]}
   */
  function edgePoint(x, y, toX, toY) {
    const dx = toX - x
    const dy = toY - y
    if (dx === 0 && dy === 0) return [x, y]
    const scale = 1 / Math.max(Math.abs(dx) / (NODE_W / 2 + 4), Math.abs(dy) / (NODE_H / 2 + 4))
    return [x + dx * scale, y + dy * scale]
  }

  /** @param {MachineDecl} m */
  function renderInspector(m) {
    const state = m.states.find((s) => s.name === selected)
    if (!state) {
      inspector.replaceChildren(group('States', h('p', {
        class: 'tool-help',
        text: owner === null
          ? 'The game is in one of these states at a time, like a menu, playing, or game over.'
          : `Every ${owner} is in one of these at a time, on its own. Click a box to see what it does.`,
      })))
      return
    }
    const text = options.getText()
    const nameInput = h('input', {
      type: 'text',
      class: 'tool-input',
      id: 'state-name',
      value: state.name,
      maxLength: 30,
      onChange: () => {
        const next = cleanName(nameInput.value)
        if (next === '' || next === state.name || m.states.some((s) => s.name === next)) {
          nameInput.value = state.name
          return
        }
        const saved = positions[state.name]
        if (saved) {
          positions[next] = saved
          delete positions[state.name]
          saveSetting(positionKey(), JSON.stringify(positions))
        }
        selected = next
        apply(renameState(options.getText(), owner, state.name, next))
      },
    })

    /**
     * @param {'enter' | 'always' | 'leave'} section
     * @param {string} title
     * @param {string} help
     * @param {string} example
     */
    const sectionField = (section, title, help, example) => {
      const id = `state-section-${section}`
      const area = h('textarea', {
        id,
        class: 'tool-input tool-code',
        rows: 2,
        spellcheck: false,
        placeholder: example,
        value: readSection(text, owner, state.name, section).join('\n'),
        onChange: () => {
          apply(writeSection(options.getText(), owner, state.name, section, area.value.split('\n')))
        },
      })
      return h('div', { class: 'tool-field' }, h('label', { class: 'tool-label', for: id, text: title }), area, h('p', { class: 'tool-help', text: help }))
    }

    const who = owner ?? 'player'
    const toSelect = h('select', { class: 'tool-input', 'aria-label': 'Go to which state' }, ...m.states.map((s) => h('option', { value: s.name, text: s.name })))
    fill(inspector,
      group('This state',
        h('div', { class: 'tool-field' }, h('label', { class: 'tool-label', for: 'state-name', text: 'Name' }), nameInput),
        m.states[0] === state
          ? h('p', { class: 'tool-help', text: owner === null ? 'The game starts here.' : `Every new ${owner} starts here.` })
          : textButton('Start here instead', () => apply(makeStart(options.getText(), owner, state.name)), { icon: 'play' }),
      ),
      group('What it does',
        sectionField('enter', 'When it starts', 'Runs once, each time it comes into this state.', owner === null ? 'show text "Press space"' : `play walk on ${who}`),
        sectionField('always', 'All the time', 'Runs every moment while in this state.', `move ${who} left 1`),
        sectionField('leave', 'When it stops', 'Runs once, as it goes to another state.', owner === null ? 'stop music' : `stop animation on ${who}`),
      ),
      group('Ways out',
        ...state.transitions.map((t, index) => {
          const input = h('input', {
            type: 'text',
            class: 'tool-input tool-code',
            spellcheck: false,
            'aria-label': `Way out ${index + 1}`,
            value: lineText(text, t.loc.line),
            onChange: () => apply(changeTransition(options.getText(), owner, state.name, index, input.value)),
          })
          return h('div', { class: 'tool-row states-way' }, input, iconButton('trash', 'Remove this way out', () => apply(changeTransition(options.getText(), owner, state.name, index, null))))
        }),
        state.transitions.length === 0 ? h('p', { class: 'tool-help', text: 'It stays here for now.' }) : null,
        h('div', { class: 'tool-row' }, toSelect, textButton('Add', () => void addArrowDialog(state.name, toSelect.value), { icon: 'plus' })),
      ),
      textButton('Delete this state', () => {
        selected = null
        apply(removeState(options.getText(), owner, state.name))
      }, { icon: 'trash' }),
    )
  }

  /** Light up where things are, while the game runs. */
  function updateLive() {
    const game = options.game()
    const m = machine()
    if (!m) return
    const sim = game?.simulation
    /** @type {Map<string, number>} */
    const counts = new Map()
    const running = sim && !sim.stopped
    const live = sim?.program.machines?.find((x) => x.thing === owner)
    if (running && live) {
      if (owner === null) {
        const index = sim.machines.machines[sim.program.machines.indexOf(live)].gameState
        if (index >= 0) counts.set(live.states[index].name, 1)
      } else {
        const list = sim.instancesOf(owner)
        for (const instance of list) {
          const index = sim.world.state[instance.id]
          if (index >= 0) counts.set(live.states[index].name, (counts.get(live.states[index].name) ?? 0) + 1)
        }
      }
    }
    for (const node of /** @type {NodeListOf<HTMLElement>} */ (nodes.querySelectorAll('.state-node'))) {
      const n = counts.get(node.dataset.state ?? '') ?? 0
      node.classList.toggle('is-live', n > 0)
      const badge = /** @type {HTMLElement} */ (node.querySelector('.state-count'))
      badge.hidden = n === 0 || owner === null
      badge.textContent = String(n)
      badge.title = `${n} ${n === 1 ? 'copy is' : 'copies are'} in this state now`
    }
  }

  timer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && !host.hidden) updateLive()
  }, 150)

  render()

  return {
    /** The text changed in the text editor. */
    refresh() {
      program = readProgram(options.getText())
      render()
    },
    destroy() {
      clearInterval(timer)
      host.replaceChildren()
    },
  }
}
