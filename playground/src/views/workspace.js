// The project workspace: files (or a lesson) on the left, the open file in the
// middle, the running game and its details on the right.

import { compile } from '@minijs/lang'
import { start } from '@minijs/runtime'
import { IS_DESKTOP } from '../desktop/env.js'
import { imageCandidates, ProjectAssetLoader } from '../files/project-assets.js'
import { basename, dirname, fileKind, isInside, join, nameProblem } from '../files/paths.js'
import { freeName } from '../files/project.js'
import { startPerf } from '../perf.js'
import { firstFile, rememberOpenFile } from '../projects/registry.js'
import { replaceRoute } from '../router.js'
import { NEW_FILE } from '../templates.js'
import { createConsole } from '../ui/console.js'
import { confirmAction } from '../ui/dialog.js'
import { createFileTree } from '../ui/file-tree.js'
import { toast } from '../ui/toast.js'

/** @import { MiniError, Program } from '@minijs/lang' */
/** @import { Game } from '@minijs/runtime' */
/** @import { Entry, ProjectFs } from '../files/project.js' */
/** @import { ExamplesFs } from '../files/examples-fs.js' */
/** @import { Editor } from '../editor.js' */

/**
 * Something that wants to hear about every compile (the tutorial).
 * @typedef {object} CompileWatcher
 * @property {(result: { program: Program | null; errors: MiniError[]; text: string }) => void} onCompile
 */

const COMPILE_DELAY_MS = 300
const SAVE_DELAY_MS = 400

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id))
const view = $('view-workspace')
const canvas = /** @type {HTMLCanvasElement} */ ($('game'))
const stage = $('stage')
const fileName = $('file-name')
const runName = $('run-name')
const saveStatus = $('save-status')
const filesStatus = $('files-status')
const projectTitle = $('project-title')
const projectKind = $('project-kind')
const projectActions = $('project-actions')
const filesPane = $('files-pane')
const lessonPane = $('lesson-pane')
const editorBox = $('editor')
const editorLoading = $('editor-loading')
const preview = $('preview')
const previewImage = /** @type {HTMLImageElement} */ ($('preview-image'))
const previewInfo = $('preview-info')
const previewUse = $('preview-use')
const uploadInput = /** @type {HTMLInputElement} */ ($('upload-input'))
const topbar = /** @type {HTMLElement} */ (view.querySelector('.topbar'))

// Keep the desktop layout exactly one screen tall under the top bar.
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--topbar-height', `${topbar.offsetHeight}px`)
}).observe(topbar)

// ---------------------------------------------------------------------------
// State

/** @type {ProjectFs | null} */
let fs = null
/** @type {Entry[]} */
let entries = []
/** @type {string | null} */
let openPath = null
/** @type {string | null} The .mini file the game runs. Stays put while you look at other files. */
let runPath = null
/** @type {Game | null} */
let game = null
/** @type {Promise<Game> | null} */
let starting = null
/** @type {MiniError[]} */
let compileProblems = []
/** @type {MiniError[]} */
let runtimeProblems = []
/** @type {string | null} */
let lastRun = null
let compileTimer = 0
let saveTimer = 0
/** @type {(() => Promise<void>) | null} */
let pendingSave = null
/** @type {string | null} */
let previewUrl = null
/** @type {CompileWatcher | null} */
let watcher = null
let mounted = false

/** @type {Editor | null} */
let editor = null
/** @type {Promise<Editor> | null} */
let editorReady = null

/** Load CodeMirror on first use, so the projects page opens fast. */
function getEditor() {
  editorReady ??= import('../editor.js').then(({ createEditor }) => {
    editorLoading.remove()
    const e = createEditor(editorBox, '')
    e.onChange(onEdit)
    editor = e
    return e
  })
  return editorReady
}

const consolePanel = createConsole(/** @type {HTMLElement} */ (view.querySelector('.console-pane')), {
  onPick: (p) => {
    const jump = () => editor?.jumpTo(p.line, p.col)
    if (runPath !== openPath && runPath) void openFile(runPath).then(jump)
    else jump()
  },
  onTouchButtons: (on) => {
    if (!game) return
    game.options.touchButtons = on ? 'always' : 'auto'
    game.updateTouchButtons()
  },
})

const tree = createFileTree($('file-tree'), {
  onOpen: (path) => void openFile(path),
  onRename: async (path, name) => {
    await moveEntry(path, join(dirname(path), name))
  },
  onDelete: async (path) => {
    if (!fs) return
    await flushSave()
    // Keep the deleted files for a moment so "Undo" can put them back.
    const target = fs
    const doomed = entries.filter((e) => isInside(e.path, path))
    /** @type {Array<[string, Blob]>} */
    const saved = []
    for (const e of doomed) if (e.kind === 'file') saved.push([e.path, await target.readBlob(e.path)])
    const dirs = doomed.filter((e) => e.kind === 'dir').map((e) => e.path)
    await target.remove(path)
    const lostOpen = openPath !== null && isInside(openPath, path)
    if (runPath !== null && isInside(runPath, path)) runPath = null
    await refreshTree()
    if (lostOpen) await openFirst()
    toast(`Deleted ${basename(path)}.`, {
      action: 'Undo',
      seconds: 10,
      onAction: async () => {
        for (const d of dirs) await target.mkdir(d)
        for (const [p, blob] of saved) {
          if (fileKind(p) === 'mini' || fileKind(p) === 'text') await target.writeText(p, await blob.text())
          else await target.writeBlob(p, blob)
        }
        if (fs === target) await refreshTree()
      },
    })
  },
  onMove: async (from, toDir) => {
    await moveEntry(from, join(toDir, basename(from)))
  },
  onUpload: (files, dir) => upload(files, dir),
  onProblem: showFilesProblem,
})

// ---------------------------------------------------------------------------
// Mounting

/**
 * Open a project in the workspace.
 * @param {{ project: ProjectFs; file?: string | null; lessonPanel?: HTMLElement | null; watch?: CompileWatcher | null }} options
 */
export async function mountWorkspace({ project, file = null, lessonPanel = null, watch = null }) {
  if (mounted && fs !== project) await unmountWorkspace()
  const sameProject = mounted && fs === project
  fs = project
  watcher = watch
  mounted = true
  view.hidden = false
  filesPane.hidden = lessonPanel !== null
  lessonPane.hidden = lessonPanel === null
  lessonPane.replaceChildren(...(lessonPanel ? [lessonPanel] : []))
  projectTitle.textContent = project.name
  projectKind.textContent = lessonPanel
    ? 'Lesson'
    : project.type === 'examples'
      ? 'Example'
      : project.type === 'disk'
        ? 'Folder on this computer'
        : IS_DESKTOP
          ? 'In this app'
          : 'In this browser'
  document.title = `${project.name} | minijs Studio`
  await getEditor()
  if (!sameProject) {
    tree.resetFolds()
    consolePanel.log('info', `Opened ${project.name}`)
  }
  await refreshTree()
  const target = file && entries.some((e) => e.path === file && e.kind === 'file') ? file : await firstFile(project)
  if (target) await openFile(target)
  else await openFirst()
  renderProjectActions()
}

/** Leave the workspace: save, stop the game, free the canvas. */
export async function unmountWorkspace() {
  if (!mounted) return
  await flushSave()
  window.clearTimeout(compileTimer)
  game?.destroy()
  game = null
  starting = null
  lastRun = null
  consolePanel.setGame(null)
  compileProblems = []
  runtimeProblems = []
  fs = null
  openPath = null
  runPath = null
  watcher = null
  mounted = false
  view.hidden = true
}

/**
 * Change the open file's whole text as if it was typed (saved, compiled, undoable).
 * @param {(text: string) => string} change
 */
export async function changeOpenText(change) {
  const e = await getEditor()
  const next = change(e.getText())
  e.replaceAll(next)
  await flushSave()
  window.clearTimeout(compileTimer)
  await update()
}

// ---------------------------------------------------------------------------
// Status lines

let filesProblemTimer = 0
/** @param {string} message */
function showFilesProblem(message) {
  filesStatus.textContent = message
  window.clearTimeout(filesProblemTimer)
  filesProblemTimer = window.setTimeout(() => (filesStatus.textContent = ''), 6000)
}

/**
 * @param {string} text
 * @param {'ok' | 'busy' | 'error'} [state='ok']
 */
function setSaveStatus(text, state = 'ok') {
  saveStatus.textContent = text
  saveStatus.dataset.state = state
}

function updateHeaders() {
  fileName.textContent = openPath ?? 'No file open'
  runName.textContent = runPath ? `Game: ${basename(runPath)}` : 'Game'
}

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error))

function renderProjectActions() {
  projectActions.replaceChildren()
  if (!fs) return
  /**
   * @param {string} label
   * @param {() => void | Promise<void>} fn
   */
  const action = (label, fn) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'link-btn'
    b.textContent = label
    b.addEventListener('click', () => {
      Promise.resolve(fn()).catch((error) => showFilesProblem(message(error)))
    })
    projectActions.append(b)
  }
  if (fs.type === 'examples') {
    const examples = /** @type {ExamplesFs} */ (fs)
    action('Make my own copy', () => view.dispatchEvent(new CustomEvent('copy-project', { bubbles: true })))
    if (openPath && examples.isEdited(openPath)) {
      action('Reset this file', async () => {
        if (!openPath) return
        const ok = await confirmAction({
          title: 'Reset this file?',
          message: `Your changes to ${basename(openPath)} will be thrown away.`,
          action: 'Reset',
          danger: true,
        })
        if (!ok) return
        await examples.reset(openPath)
        await openFile(openPath)
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Files

async function refreshTree() {
  if (!fs) return
  try {
    entries = await fs.list()
  } catch (error) {
    entries = []
    showFilesProblem(message(error))
  }
  renderTree()
}

function renderTree() {
  if (!fs) return
  /** @type {Set<string>} */
  const edited = new Set()
  if (fs.type === 'examples') {
    const examples = /** @type {ExamplesFs} */ (fs)
    for (const e of entries) if (e.kind === 'file' && examples.isEdited(e.path)) edited.add(e.path)
  }
  tree.render({ entries, readOnly: fs.readOnly, openPath, runPath, edited })
  for (const id of ['new-file', 'new-folder', 'upload']) {
    const b = /** @type {HTMLButtonElement} */ ($(id))
    b.disabled = fs.readOnly
  }
}

/** @param {boolean} on show the editor (true) or the picture preview (false) */
function showEditor(on) {
  editorBox.hidden = !on
  preview.hidden = on
}

async function openFirst() {
  const first = fs ? await firstFile(fs) : null
  if (first) {
    await openFile(first)
    return
  }
  openPath = null
  editor?.load('', true)
  showEditor(true)
  updateHeaders()
  renderTree()
  setSaveStatus('')
}

/**
 * Open a file: game and text files in the editor, pictures in the preview.
 * @param {string} path
 */
export async function openFile(path) {
  if (!fs) return
  await flushSave()
  const e = await getEditor()
  const kind = fileKind(path)
  tree.select(path)
  try {
    if (kind === 'mini' || kind === 'text') {
      const text = await fs.readText(path)
      openPath = path
      e.load(text, kind === 'mini')
      showEditor(true)
      const examples = fs.type === 'examples' ? /** @type {ExamplesFs} */ (fs) : null
      setSaveStatus(examples?.isEdited(path) ? 'Edited, kept in this browser' : '')
      if (kind === 'mini') {
        runPath = path
        void update()
      } else {
        e.setProblems([])
      }
    } else {
      openPath = path
      await showPreview(path, kind === 'image')
      setSaveStatus('')
    }
    rememberOpenFile(fs, path)
    replaceRoute({ view: lessonPane.hidden ? 'project' : 'learn', project: fs.id, file: path })
  } catch (error) {
    showFilesProblem(message(error))
  }
  updateHeaders()
  renderTree()
  renderProjectActions()
}

/** @param {HTMLImageElement} img */
function imageLoaded(img) {
  if (img.complete) return Promise.resolve()
  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(undefined), { once: true })
    img.addEventListener('error', () => resolve(undefined), { once: true })
  })
}

/**
 * @param {string} path
 * @param {boolean} isImage
 */
async function showPreview(path, isImage) {
  if (!fs) return
  showEditor(false)
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = null
  previewImage.hidden = !isImage
  previewUse.replaceChildren()
  const blob = await fs.readBlob(path)
  const size = blob.size < 1024 ? `${blob.size} bytes` : `${(blob.size / 1024).toFixed(1)} KB`
  if (!isImage) {
    previewInfo.textContent = `${basename(path)}, ${size}. The Studio can't show this kind of file.`
    return
  }
  previewUrl = URL.createObjectURL(blob)
  previewImage.src = previewUrl
  previewImage.alt = basename(path)
  await imageLoaded(previewImage)
  previewInfo.textContent = `${previewImage.naturalWidth} by ${previewImage.naturalHeight} pixels, ${size}`
  // The shortest name the running game would find this picture by.
  const from = runPath ?? ''
  const runDir = dirname(from)
  const relative = runDir !== '' && isInside(path, runDir) ? path.slice(runDir.length + 1) : path
  const usable = [basename(path), relative, path].find((src) => imageCandidates(from, src).includes(path)) ?? path
  const code = document.createElement('code')
  code.textContent = `looks like "${usable}"`
  previewUse.append('Use it in a game with: ', code)
}

/**
 * Rename or move, keeping the open file and the running file pointed at the right place.
 * @param {string} from
 * @param {string} to
 */
async function moveEntry(from, to) {
  if (!fs) return
  const problem = nameProblem(basename(to))
  if (problem) throw new Error(problem)
  await flushSave()
  await fs.rename(from, to)
  /** @param {string | null} p */
  const moved = (p) => (p !== null && isInside(p, from) ? to + p.slice(from.length) : p)
  openPath = moved(openPath)
  runPath = moved(runPath)
  if (openPath) rememberOpenFile(fs, openPath)
  tree.select(to)
  await refreshTree()
  updateHeaders()
}

/**
 * Add files from the computer into `dir`.
 * @param {File[]} files
 * @param {string} dir
 */
async function upload(files, dir) {
  if (!fs) return
  let added = 0
  for (const file of files) {
    const path = join(dir, file.name)
    const problem = nameProblem(file.name)
    if (problem) {
      showFilesProblem(`${file.name}: ${problem}`)
      continue
    }
    if (await fs.exists(path)) {
      const ok = await confirmAction({
        title: 'Replace the file?',
        message: `"${file.name}" is already there. Replace it with the new one?`,
        action: 'Replace',
      })
      if (!ok) continue
    }
    const kind = fileKind(path)
    if (kind === 'mini' || kind === 'text') await fs.writeText(path, await file.text())
    else await fs.writeBlob(path, file)
    added++
  }
  await refreshTree()
  if (added === 1 && files.length === 1) await openFile(join(dir, files[0].name))
  // New pictures may be ones the running game was missing.
  if (added > 0 && files.some((f) => fileKind(f.name) === 'image')) void update()
}

$('new-file').addEventListener('click', async () => {
  if (!fs) return
  try {
    const path = await freeName(fs, tree.targetDir(), 'untitled', '.mini')
    await fs.writeText(path, NEW_FILE)
    await refreshTree()
    await openFile(path)
    tree.startRename(path)
  } catch (error) {
    showFilesProblem(message(error))
  }
})

$('new-folder').addEventListener('click', async () => {
  if (!fs) return
  try {
    const path = await freeName(fs, tree.targetDir(), 'new folder', '')
    await fs.mkdir(path)
    await refreshTree()
    tree.startRename(path)
  } catch (error) {
    showFilesProblem(message(error))
  }
})

$('upload').addEventListener('click', () => uploadInput.click())
uploadInput.addEventListener('change', async () => {
  const files = [...(uploadInput.files ?? [])]
  uploadInput.value = ''
  if (files.length === 0) return
  try {
    await upload(files, tree.targetDir())
  } catch (error) {
    showFilesProblem(message(error))
  }
})

$('refresh').addEventListener('click', async () => {
  await refreshTree()
  if (runPath) void update()
})

// ---------------------------------------------------------------------------
// Saving

/** Write the editor text to the open file now, if a save is waiting. */
async function flushSave() {
  window.clearTimeout(saveTimer)
  const save = pendingSave
  pendingSave = null
  if (save) await save()
}

/** @param {string} text */
function onEdit(text) {
  const path = openPath
  const target = fs
  if (path === null || target === null) return
  pendingSave = async () => {
    setSaveStatus('Saving', 'busy')
    try {
      await target.writeText(path, text)
      if (target.type === 'examples') {
        const examples = /** @type {ExamplesFs} */ (target)
        setSaveStatus(examples.isEdited(path) ? 'Edited, kept in this browser' : 'Same as the original')
        renderTree()
        renderProjectActions()
      } else {
        setSaveStatus('Saved')
      }
    } catch (error) {
      setSaveStatus(`Not saved: ${message(error)}`, 'error')
    }
  }
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void flushSave(), SAVE_DELAY_MS)
  setSaveStatus('Editing', 'busy')
  if (path === runPath) {
    window.clearTimeout(compileTimer)
    compileTimer = window.setTimeout(() => void update(), COMPILE_DELAY_MS)
  }
}

window.addEventListener('pagehide', () => {
  void flushSave()
})

// ---------------------------------------------------------------------------
// Running

function showProblems() {
  consolePanel.setProblems(compileProblems, runtimeProblems, game !== null)
}

/** @param {Program} program */
function sizeStage(program) {
  stage.style.setProperty('--game-aspect', `${program.game.width} / ${program.game.height}`)
}

/** Compile the running file; run it when it has no problems. */
export async function update() {
  const path = runPath
  const target = fs
  if (path === null || target === null) return
  const text = path === openPath && editor ? editor.getText() : await target.readText(path).catch(() => null)
  if (text === null || path !== runPath || target !== fs) return
  const { program, errors } = compile(text)
  compileProblems = errors
  if (path === openPath) editor?.setProblems(errors)
  showProblems()
  watcher?.onCompile({ program, errors, text })
  if (program) await run(program, path)
}

/**
 * @param {Program} program
 * @param {string} path
 */
async function run(program, path) {
  if (!fs) return
  sizeStage(program)
  runtimeProblems = []
  const assets = new ProjectAssetLoader(fs, path)
  if (starting === null) {
    starting = start(program, canvas, {
      assets,
      keyTarget: canvas,
      touchButtons: consolePanel.touchButtons ? 'always' : 'auto',
    }).then((started) => {
      game = started
      game.on('error', (error) => {
        runtimeProblems.push(error)
        consolePanel.log('error', `Line ${error.line}: ${error.message}`, game?.simulation.tickCount ?? null)
        showProblems()
      })
      game.on('log', (text, tick) => consolePanel.log('log', text, tick))
      game.on('stop', () => consolePanel.log('info', 'Game stopped', game?.simulation.tickCount ?? null))
      consolePanel.setGame(game)
      return started
    })
    await starting
    consolePanel.log('info', `Running ${path}`)
  } else {
    const g = await starting
    g.options.assets = assets
    await g.reload(program)
    consolePanel.log('info', lastRun === `${fs.id}/${path}` ? 'Restarted with your changes' : `Running ${path}`)
  }
  lastRun = `${fs.id}/${path}`
  showProblems()
}

$('run').addEventListener('click', async () => {
  window.clearTimeout(compileTimer)
  await flushSave()
  await update()
  canvas.focus()
})
$('stop').addEventListener('click', () => game?.stop())
$('restart').addEventListener('click', async () => {
  if (!game) return
  runtimeProblems = []
  await game.reload(game.simulation.program)
  consolePanel.log('info', 'Restarted')
  showProblems()
  canvas.focus()
})

canvas.addEventListener('pointerdown', () => canvas.focus())

// Ctrl or Cmd + S saves and runs; Ctrl or Cmd + Enter runs.
window.addEventListener('keydown', (e) => {
  if (!mounted || !(e.ctrlKey || e.metaKey)) return
  if (e.key === 's' || e.key === 'Enter') {
    e.preventDefault()
    window.clearTimeout(compileTimer)
    void flushSave().then(update)
  }
})

startPerf($('perf'), () => game?.simulation.tickCount ?? null)

/** What the share and export buttons need. */
export function currentProject() {
  return fs && runPath ? { fs, runPath, program: game?.simulation.program ?? null } : null
}

// Dev builds only: let browser tooling inspect the running game.
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__minijs', {
    configurable: true,
    get: () => ({ game, editor, fs, openPath, runPath, entries, openFile, update }),
  })
}
