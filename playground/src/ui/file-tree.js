// File tree for the open project. Flat list of rows indented by depth, so it
// stays fast for big folders. Keyboard: up/down move, left/right fold, Enter
// opens, F2 renames, Delete removes. Drag a row onto a folder to move it; drop
// files from your computer to add them.

import { basename, dirname, fileKind, isInside, nameProblem } from '../files/paths.js'

/** @import { Entry } from '../files/project.js' */

/**
 * @typedef {object} TreeHandlers
 * @property {(path: string) => void} onOpen
 * @property {(path: string, name: string) => Promise<void>} onRename
 * @property {(path: string) => Promise<void>} onDelete
 * @property {(from: string, toDir: string) => Promise<void>} onMove
 * @property {(files: File[], dir: string) => Promise<void>} onUpload
 * @property {(message: string) => void} onProblem Shows a short message near the tree.
 */

/**
 * @typedef {object} TreeView
 * @property {Entry[]} entries
 * @property {boolean} readOnly
 * @property {string | null} openPath
 * @property {string | null} runPath
 * @property {ReadonlySet<string>} edited
 */

/** @param {string} path */
function iconFor(path) {
  switch (fileKind(path)) {
    case 'mini':
      return 'ph-game-controller'
    case 'image':
      return 'ph-image'
    case 'text':
      return 'ph-file-text'
    default:
      return 'ph-file'
  }
}

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

/** @param {string} icon */
function iconEl(icon) {
  const i = el('i', `ph ${icon}`)
  i.setAttribute('aria-hidden', 'true')
  return i
}

const DRAG_TYPE = 'application/x-minijs-path'

/**
 * @param {HTMLElement} root
 * @param {TreeHandlers} handlers
 */
export function createFileTree(root, handlers) {
  root.setAttribute('role', 'tree')
  root.setAttribute('aria-label', 'Project files')

  /** @type {TreeView} */
  let view = { entries: [], readOnly: true, openPath: null, runPath: null, edited: new Set() }
  /** @type {Set<string>} */
  const collapsed = new Set()
  /** @type {string | null} */
  let selected = null
  /** @type {string | null} */
  let renaming = null

  /** Folders whose parents are all open. */
  const visibleEntries = () =>
    view.entries.filter((e) => {
      for (let d = dirname(e.path); d !== ''; d = dirname(d)) if (collapsed.has(d)) return false
      return true
    })

  /** @param {string} path */
  const rowFor = (path) => /** @type {HTMLElement | null} */ (root.querySelector(`[data-path="${CSS.escape(path)}"]`))

  function render() {
    const focusedPath = /** @type {HTMLElement | null} */ (document.activeElement)?.dataset?.path ?? null
    root.replaceChildren()
    const entries = visibleEntries()
    if (entries.length === 0) {
      const empty = el('p', 'tree-empty', view.readOnly ? 'No files.' : 'No files yet. Make one with the buttons above, or drop files here.')
      root.append(empty)
    }
    for (const entry of entries) root.append(renderRow(entry))
    if (focusedPath) rowFor(focusedPath)?.focus()
  }

  /** @param {Entry} entry */
  function renderRow(entry) {
    const isDir = entry.kind === 'dir'
    const depth = entry.path.split('/').length - 1
    const row = el('div', 'tree-row')
    row.dataset.path = entry.path
    row.dataset.kind = entry.kind
    row.setAttribute('role', 'treeitem')
    row.setAttribute('aria-level', String(depth + 1))
    row.tabIndex = entry.path === (selected ?? view.openPath) ? 0 : -1
    row.style.setProperty('--depth', String(depth))
    if (isDir) row.setAttribute('aria-expanded', String(!collapsed.has(entry.path)))
    if (entry.path === view.openPath) row.setAttribute('aria-current', 'true')
    if (entry.path === selected) row.setAttribute('aria-selected', 'true')

    row.append(
      isDir ? iconEl(collapsed.has(entry.path) ? 'ph-caret-right' : 'ph-caret-down') : el('span', 'caret-space'),
      iconEl(isDir ? (collapsed.has(entry.path) ? 'ph-folder' : 'ph-folder-open') : iconFor(entry.path)),
    )

    if (renaming === entry.path) {
      row.append(renameInput(entry))
    } else {
      const label = el('span', 'tree-name', basename(entry.path))
      row.append(label)
      if (entry.path === view.runPath) {
        const run = el('span', 'tree-tag', 'running')
        row.append(run)
      } else if (view.edited.has(entry.path)) {
        row.append(el('span', 'tree-tag', 'edited'))
      }
      if (!view.readOnly) {
        const actions = el('span', 'tree-actions')
        actions.append(
          actionButton('ph-pencil-simple', `Rename ${basename(entry.path)}`, () => startRename(entry.path)),
          actionButton('ph-trash', `Delete ${basename(entry.path)}`, () => remove(entry.path)),
        )
        row.append(actions)
      }
    }

    row.addEventListener('click', () => activate(entry))
    row.addEventListener('keydown', (e) => onKey(e, entry))
    if (!view.readOnly) wireDrag(row, entry)
    return row
  }

  /**
   * @param {string} icon
   * @param {string} label
   * @param {() => void} fn
   */
  function actionButton(icon, label, fn) {
    const b = el('button', 'icon-btn')
    b.type = 'button'
    b.title = label
    b.setAttribute('aria-label', label)
    b.tabIndex = -1
    b.append(iconEl(icon))
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      fn()
    })
    return b
  }

  /** @param {Entry} entry */
  function activate(entry) {
    selected = entry.path
    if (entry.kind === 'dir') {
      if (collapsed.has(entry.path)) collapsed.delete(entry.path)
      else collapsed.add(entry.path)
      render()
      rowFor(entry.path)?.focus()
    } else {
      handlers.onOpen(entry.path)
    }
  }

  /**
   * @param {KeyboardEvent} e
   * @param {Entry} entry
   */
  function onKey(e, entry) {
    if (renaming) return
    const rows = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.tree-row')])
    const index = rows.findIndex((r) => r.dataset.path === entry.path)
    /** @param {number} i */
    const focusAt = (i) => {
      const target = rows[Math.max(0, Math.min(rows.length - 1, i))]
      if (!target) return
      selected = target.dataset.path ?? null
      for (const r of rows) r.tabIndex = r === target ? 0 : -1
      target.focus()
    }
    switch (e.key) {
      case 'ArrowDown':
        focusAt(index + 1)
        break
      case 'ArrowUp':
        focusAt(index - 1)
        break
      case 'Home':
        focusAt(0)
        break
      case 'End':
        focusAt(rows.length - 1)
        break
      case 'ArrowRight':
        if (entry.kind === 'dir' && collapsed.has(entry.path)) {
          collapsed.delete(entry.path)
          render()
        } else focusAt(index + 1)
        break
      case 'ArrowLeft':
        if (entry.kind === 'dir' && !collapsed.has(entry.path)) {
          collapsed.add(entry.path)
          render()
        } else {
          const parent = dirname(entry.path)
          if (parent !== '') focusAt(rows.findIndex((r) => r.dataset.path === parent))
        }
        break
      case 'Enter':
      case ' ':
        activate(entry)
        break
      case 'F2':
        if (!view.readOnly) startRename(entry.path)
        break
      case 'Delete':
      case 'Backspace':
        if (!view.readOnly) remove(entry.path)
        break
      default:
        return
    }
    e.preventDefault()
  }

  /** @param {Entry} entry */
  function renameInput(entry) {
    const input = /** @type {HTMLInputElement} */ (el('input', 'tree-rename'))
    const name = basename(entry.path)
    input.value = name
    input.setAttribute('aria-label', `New name for ${name}`)
    let done = false
    const finish = async (/** @type {boolean} */ save) => {
      if (done) return
      done = true
      renaming = null
      const next = input.value.trim()
      if (!save || next === name) {
        render()
        rowFor(entry.path)?.focus()
        return
      }
      const problem = nameProblem(next)
      if (problem) {
        handlers.onProblem(problem)
        render()
        return
      }
      try {
        await handlers.onRename(entry.path, next)
      } catch (error) {
        handlers.onProblem(error instanceof Error ? error.message : String(error))
        render()
      }
    }
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') void finish(true)
      if (e.key === 'Escape') void finish(false)
    })
    input.addEventListener('blur', () => void finish(true))
    input.addEventListener('click', (e) => e.stopPropagation())
    queueMicrotask(() => {
      input.focus()
      // Select the name without its extension, like file managers do.
      const dot = name.lastIndexOf('.')
      input.setSelectionRange(0, entry.kind === 'file' && dot > 0 ? dot : name.length)
    })
    return input
  }

  /** @param {string} path */
  function startRename(path) {
    for (let d = dirname(path); d !== ''; d = dirname(d)) collapsed.delete(d)
    renaming = path
    selected = path
    render()
  }

  /** @param {string} path */
  async function remove(path) {
    const isDir = view.entries.some((e) => e.path === path && e.kind === 'dir')
    const what = isDir ? `the folder "${basename(path)}" and everything in it` : `"${basename(path)}"`
    if (!confirm(`Delete ${what}? This can't be undone.`)) return
    try {
      await handlers.onDelete(path)
    } catch (error) {
      handlers.onProblem(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * @param {HTMLElement} row
   * @param {Entry} entry
   */
  function wireDrag(row, entry) {
    row.draggable = true
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData(DRAG_TYPE, entry.path)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    })
    const target = entry.kind === 'dir' ? entry.path : dirname(entry.path)
    row.addEventListener('dragover', (e) => {
      if (!e.dataTransfer) return
      e.preventDefault()
      e.stopPropagation()
      highlight(target)
    })
    row.addEventListener('drop', (e) => {
      e.preventDefault()
      e.stopPropagation()
      highlight(null)
      void drop(e, target)
    })
  }

  /** @param {string | null} dir */
  function highlight(dir) {
    root.classList.toggle('drop-root', dir === '')
    for (const r of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('.tree-row'))) {
      r.classList.toggle('drop-target', dir !== null && dir !== '' && r.dataset.path === dir)
    }
  }

  /**
   * @param {DragEvent} e
   * @param {string} dir
   */
  async function drop(e, dir) {
    if (view.readOnly || !e.dataTransfer) return
    const from = e.dataTransfer.getData(DRAG_TYPE)
    try {
      if (from) {
        if (dirname(from) === dir || isInside(dir, from)) return
        await handlers.onMove(from, dir)
      } else if (e.dataTransfer.files.length > 0) {
        await handlers.onUpload([...e.dataTransfer.files], dir)
      }
    } catch (error) {
      handlers.onProblem(error instanceof Error ? error.message : String(error))
    }
  }

  // Dropping on empty space puts things at the top level.
  root.addEventListener('dragover', (e) => {
    if (view.readOnly) return
    e.preventDefault()
    highlight('')
  })
  root.addEventListener('dragleave', (e) => {
    if (e.target === root) highlight(null)
  })
  root.addEventListener('drop', (e) => {
    e.preventDefault()
    highlight(null)
    void drop(e, '')
  })

  return {
    /** @param {TreeView} next */
    render(next) {
      view = next
      if (selected && !next.entries.some((e) => e.path === selected)) selected = null
      render()
    },
    startRename,
    /** @param {string | null} path */
    select(path) {
      selected = path
      if (path) for (let d = dirname(path); d !== ''; d = dirname(d)) collapsed.delete(d)
    },
    /** Folder new files go into: the selected folder, or the selected file's folder. */
    targetDir() {
      const path = selected ?? view.openPath
      if (!path) return ''
      const entry = view.entries.find((e) => e.path === path)
      return entry?.kind === 'dir' ? path : dirname(path)
    },
    resetFolds() {
      collapsed.clear()
      selected = null
    },
  }
}
