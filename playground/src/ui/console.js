// The panel under the game: Problems, Console, Watch and Input tabs.
// Watch and Input read the running game a few times a second, only while visible.

import { KEY_NAMES, MAX_PADS, MOUSE_BUTTONS, PAD_BUTTONS } from '@minijs/lang'
import { formatNumber } from '@minijs/runtime'
import { renderProblems } from '../problems.js'

/** @import { MiniError } from '@minijs/lang' */
/** @import { Game } from '@minijs/runtime' */

/** @typedef {'problems' | 'console' | 'watch' | 'input'} TabName */
/** @typedef {'info' | 'log' | 'error'} LogKind */

const MAX_LINES = 500
const REFRESH_MS = 150

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/**
 * Two-column rows: label, value.
 * @param {string} title
 * @param {Array<[string, string]>} rows
 * @param {string} empty shown when there are no rows
 */
function section(title, rows, empty) {
  const box = el('section', 'watch-section')
  box.append(el('h3', '', title))
  if (rows.length === 0) {
    box.append(el('p', 'muted small', empty))
    return box
  }
  const list = el('dl', 'watch-list')
  for (const [k, v] of rows) list.append(el('dt', '', k), el('dd', '', v))
  box.append(list)
  return box
}

/**
 * @param {string} title
 * @param {string[]} chips
 * @param {string} empty
 */
function chipSection(title, chips, empty) {
  const box = el('section', 'watch-section')
  box.append(el('h3', '', title))
  if (chips.length === 0) box.append(el('p', 'muted small', empty))
  else {
    const row = el('div', 'chips')
    for (const c of chips) row.append(el('span', 'chip', c))
    box.append(row)
  }
  return box
}

/** @param {number} tick */
const seconds = (tick) => `${(tick / 60).toFixed(1)}s`

/**
 * @param {HTMLElement} root the console pane
 * @param {{ onPick: (problem: MiniError) => void; onTouchButtons: (on: boolean) => void }} handlers
 */
export function createConsole(root, handlers) {
  const tabs = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll('[role="tab"]')])
  /** @param {string} sel */
  const q = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel))
  const problemList = /** @type {HTMLUListElement} */ (q('#problem-list'))
  const noProblems = q('#no-problems')
  const noProblemsText = q('#no-problems-text')
  const stale = q('#stale')
  const logList = q('#log-list')
  const logEmpty = q('#log-empty')
  const watchBody = q('#watch-body')
  const inputBody = q('#input-body')
  const problemCount = q('#problem-count')
  const logCount = q('#log-count')

  /** @type {TabName} */
  let active = 'problems'
  /** @type {Game | null} */
  let game = null
  let unreadLogs = 0
  let touchButtons = false
  let timer = 0

  /** @param {TabName} name */
  function show(name) {
    active = name
    for (const tab of tabs) {
      const on = tab.dataset.tab === name
      tab.setAttribute('aria-selected', String(on))
      tab.tabIndex = on ? 0 : -1
      const panel = q(`#${tab.getAttribute('aria-controls')}`)
      panel.hidden = !on
    }
    if (name === 'console') {
      unreadLogs = 0
      updateLogCount()
      logList.scrollTop = logList.scrollHeight
    }
    refresh()
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => show(/** @type {TabName} */ (tab.dataset.tab)))
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (step === 0) return
      e.preventDefault()
      const next = tabs[(i + step + tabs.length) % tabs.length]
      next.focus()
      show(/** @type {TabName} */ (next.dataset.tab))
    })
  })

  q('#log-clear').addEventListener('click', () => {
    logList.replaceChildren()
    unreadLogs = 0
    updateLogCount()
    logEmpty.hidden = false
  })

  function updateLogCount() {
    logCount.textContent = unreadLogs > 0 ? String(unreadLogs > 99 ? '99+' : unreadLogs) : ''
    logCount.hidden = unreadLogs === 0
  }

  /**
   * @param {LogKind} kind
   * @param {string} text
   * @param {number | null} [tick=null]
   */
  function log(kind, text, tick = null) {
    logEmpty.hidden = true
    const last = /** @type {HTMLElement | null} */ (logList.lastElementChild)
    if (last && last.dataset.kind === kind && last.dataset.text === text) {
      // Same line again (an `always` rule logging every tick): count it instead of flooding.
      const n = Number(last.dataset.count ?? '1') + 1
      last.dataset.count = String(n)
      const badge = /** @type {HTMLElement} */ (last.querySelector('.log-repeat'))
      badge.textContent = `x${n}`
      badge.hidden = false
      const time = /** @type {HTMLElement} */ (last.querySelector('.log-time'))
      if (tick !== null) time.textContent = seconds(tick)
    } else {
      const line = el('li', `log-line log-${kind}`)
      line.dataset.kind = kind
      line.dataset.text = text
      const icon = el('i', `ph ${kind === 'error' ? 'ph-warning-circle' : kind === 'info' ? 'ph-info' : 'ph-caret-right'}`)
      icon.setAttribute('aria-hidden', 'true')
      const repeat = el('span', 'log-repeat')
      repeat.hidden = true
      line.append(icon, el('span', 'log-text', text), repeat, el('span', 'log-time', tick === null ? '' : seconds(tick)))
      logList.append(line)
      while (logList.childElementCount > MAX_LINES) logList.firstElementChild?.remove()
    }
    if (active !== 'console') {
      unreadLogs++
      updateLogCount()
    } else {
      const nearBottom = logList.scrollHeight - logList.scrollTop - logList.clientHeight < 40
      if (nearBottom) logList.scrollTop = logList.scrollHeight
    }
  }

  /**
   * @param {MiniError[]} compileErrors
   * @param {MiniError[]} runtimeErrors
   * @param {boolean} running a game is on screen
   */
  function setProblems(compileErrors, runtimeErrors, running) {
    const all = [...compileErrors, ...runtimeErrors]
    renderProblems(problemList, noProblems, all, handlers.onPick)
    stale.hidden = !(compileErrors.length > 0 && running)
    noProblemsText.textContent = running ? 'No problems. Your game is running.' : 'No problems.'
    problemCount.textContent = String(all.length)
    problemCount.hidden = all.length === 0
  }

  function refreshWatch() {
    if (!game) {
      watchBody.replaceChildren(el('p', 'muted', 'Numbers and things show up here while a game runs.'))
      return
    }
    const sim = game.simulation
    const catalog = sim.catalog
    const vars = catalog.varNames.map((name, i) => /** @type {[string, string]} */ ([name, formatNumber(sim.vars[i])]))
    const things = sim.program.things.map((t, i) => /** @type {[string, string]} */ ([t.name, `${sim.world.counts[i]} on screen`]))
    /** @type {Array<[string, string]>} */
    const status = [
      ['state', sim.stopped ? 'stopped' : 'running'],
      ['time', seconds(sim.tickCount)],
      ['ticks', String(sim.tickCount)],
      ['camera', `${Math.round(sim.camera.x)}, ${Math.round(sim.camera.y)}`],
    ]
    watchBody.replaceChildren(
      section('Numbers', vars, 'This game has no numbers. Add one with a line like: score starts at 0'),
      section('Things', things, 'This game has no things yet.'),
      section('Game', status, ''),
    )
  }

  function refreshInput() {
    if (!game) {
      inputBody.replaceChildren(el('p', 'muted', 'Start a game to see keys, mouse and gamepads here.'))
      return
    }
    const input = game.input
    const keys = KEY_NAMES.filter((_, i) => input.keys.raw[i] === 1)
    const buttons = MOUSE_BUTTONS.filter((_, i) => input.mouse.raw[i] === 1)
    /** @type {HTMLElement[]} */
    const pads = []
    for (let p = 0; p < MAX_PADS; p++) {
      if (input.padConnected[p] !== 1) continue
      const held = PAD_BUTTONS.filter((b, i) => input.pads.raw[p * PAD_BUTTONS.length + i] === 1)
      const s = input.rawSticks
      const stick = (/** @type {number} */ v) => v.toFixed(2)
      pads.push(
        section(`Gamepad ${p + 1}`, [
          ['buttons', held.length ? held.join(' ') : 'none'],
          ['left stick', `${stick(s[p * 4])}, ${stick(s[p * 4 + 1])}`],
          ['right stick', `${stick(s[p * 4 + 2])}, ${stick(s[p * 4 + 3])}`],
        ], ''),
      )
    }
    const controls = game.simulation.controls
    /** @type {Array<[string, string]>} */
    const controlRows = controls.names.map((name, i) => [name, controls.held[i] === 1 ? 'held' : 'up'])

    const toggle = el('label', 'toggle')
    const box = /** @type {HTMLInputElement} */ (el('input'))
    box.type = 'checkbox'
    box.checked = touchButtons
    box.addEventListener('change', () => {
      touchButtons = box.checked
      handlers.onTouchButtons(box.checked)
    })
    toggle.append(box, el('span', '', 'Show touch buttons on this screen'))
    const touch = el('section', 'watch-section')
    touch.append(el('h3', '', 'Touch'), toggle)
    const touchHint = el(
      'p',
      'muted small',
      game.simulation.program.game.touchButtons
        ? 'This game has "touch buttons", so phones and tablets show them.'
        : 'Add "touch buttons" to the game block to show them on phones and tablets.',
    )

    inputBody.replaceChildren(
      chipSection('Keys held', keys, 'No keys held. Click the game, then press keys.'),
      section('Mouse', [
        ['position', `${Math.round(input.mouseX)}, ${Math.round(input.mouseY)}`],
        ['buttons', buttons.length ? buttons.join(' ') : 'none'],
      ], ''),
      ...(pads.length ? pads : [chipSection('Gamepads', [], 'No gamepad yet. Plug one in and press a button.')]),
      section('Controls', controlRows, 'No controls. Make one with a block like: control jump'),
      touch,
    )
    touch.append(touchHint)
  }

  function refresh() {
    if (document.visibilityState !== 'visible') return
    if (active === 'watch') refreshWatch()
    else if (active === 'input' && !inputBody.contains(document.activeElement)) refreshInput()
  }

  timer = window.setInterval(refresh, REFRESH_MS)

  return {
    log,
    setProblems,
    /** @param {Game | null} next */
    setGame(next) {
      game = next
      refresh()
    },
    show,
    get touchButtons() {
      return touchButtons
    },
    destroy() {
      clearInterval(timer)
    },
  }
}
