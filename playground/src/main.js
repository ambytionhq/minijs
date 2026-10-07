// Playground wiring: projects and files on the left, the open file in the middle,
// the running game and its details on the right.

import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import '@phosphor-icons/web/regular'
import './styles.css'

import { compile } from '@minijs/lang'
import { start } from '@minijs/runtime'
import { createEditor } from './editor.js'
import { EXAMPLES } from './examples.js'
import { canOpenFolders, forgetFolder, pickFolder, rememberedFolders } from './files/disk-fs.js'
import { ExamplesFs } from './files/examples-fs.js'
import { IdbFs, createBrowserProject, deleteBrowserProject, listBrowserProjects, renameBrowserProject } from './files/idb-fs.js'
import { imageCandidates, ProjectAssetLoader } from './files/project-assets.js'
import { basename, dirname, extname, fileKind, isInside, join, nameProblem } from './files/paths.js'
import { freeName } from './files/project.js'
import { startPerf } from './perf.js'
import { loadSetting, saveSetting } from './storage.js'
import { NEW_FILE, STARTER_GAME } from './templates.js'
import { createConsole } from './ui/console.js'
import { createFileTree } from './ui/file-tree.js'

/** @import { MiniError, Program } from '@minijs/lang' */
/** @import { Game } from '@minijs/runtime' */
/** @import { Entry, ProjectFs } from './files/project.js' */
/** @import { DiskFs } from './files/disk-fs.js' */

const COMPILE_DELAY_MS = 300
const SAVE_DELAY_MS = 400

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id))
const projectPicker = /** @type {HTMLSelectElement} */ ($('project'))
const canvas = /** @type {HTMLCanvasElement} */ ($('game'))
const stage = $('stage')
const fileName = $('file-name')
const runName = $('run-name')
const saveStatus = $('save-status')
const filesStatus = $('files-status')
const projectName = $('project-name')
const projectActions = $('project-actions')
const editorBox = $('editor')
const preview = $('preview')
const previewImage = /** @type {HTMLImageElement} */ ($('preview-image'))
const previewInfo = $('preview-info')
const previewUse = $('preview-use')
const uploadInput = /** @type {HTMLInputElement} */ ($('upload-input'))

// Keep the desktop layout exactly one screen tall under the top bar.
const topbar = /** @type {HTMLElement} */ (document.querySelector('.topbar'))
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--topbar-height', `${topbar.offsetHeight}px`)
}).observe(topbar)

const assetUrls = /** @type {Record<string, string>} */ (
  import.meta.glob('../../examples/assets/*', { query: '?url', import: 'default', eager: true })
)
const examples = new ExamplesFs(
  EXAMPLES,
  new Map(Object.entries(assetUrls).map(([path, url]) => [basename(path), url])),
)

// ---------------------------------------------------------------------------
// State

/** @type {ProjectFs} */
let fs = examples
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
/** @type {DiskFs[]} */
let diskFolders = []
/** @type {string | null} Which file the game last ran, for console messages. */
let lastRun = null
let compileTimer = 0
let saveTimer = 0
/** @type {(() => Promise<void>) | null} */
let pendingSave = null
/** @type {string | null} */
let previewUrl = null

const editor = createEditor(editorBox, '')

const consolePanel = createConsole(/** @type {HTMLElement} */ (document.querySelector('.console-pane')), {
  onPick: (p) => {
    if (runPath !== openPath && runPath) void openFile(runPath).then(() => editor.jumpTo(p.line, p.col))
    else editor.jumpTo(p.line, p.col)
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
    await flushSave()
    await fs.remove(path)
    const lostOpen = openPath !== null && isInside(openPath, path)
    if (runPath !== null && isInside(runPath, path)) runPath = null
    await refreshTree()
    if (lostOpen) await openFirstFile()
  },
  onMove: async (from, toDir) => {
    await moveEntry(from, join(toDir, basename(from)))
  },
  onUpload: (files, dir) => upload(files, dir),
  onProblem: showFilesProblem,
})

// ---------------------------------------------------------------------------
// Status lines

/** @param {string} message */
function showFilesProblem(message) {
  filesStatus.textContent = message
  window.clearTimeout(filesProblemTimer)
  filesProblemTimer = window.setTimeout(() => (filesStatus.textContent = ''), 6000)
}
let filesProblemTimer = 0

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
  projectName.textContent = fs.name
}

// ---------------------------------------------------------------------------
// Projects

/** Rebuild the project picker from what exists now. */
async function refreshProjectPicker() {
  projectPicker.replaceChildren()
  const builtIn = document.createElement('optgroup')
  builtIn.label = 'Built in'
  builtIn.append(new Option('Examples', examples.id))
  projectPicker.append(builtIn)

  try {
    const projects = await listBrowserProjects()
    if (projects.length > 0) {
      const group = document.createElement('optgroup')
      group.label = 'In this browser'
      for (const p of projects) group.append(new Option(p.name, `browser:${p.id}`))
      projectPicker.append(group)
    }
  } catch {
    // No IndexedDB (private mode in some browsers): examples still work.
  }

  if (canOpenFolders()) {
    try {
      diskFolders = await rememberedFolders()
    } catch {
      diskFolders = []
    }
    if (diskFolders.length > 0) {
      const group = document.createElement('optgroup')
      group.label = 'Folders on this computer'
      for (const d of diskFolders) group.append(new Option(d.name, d.id))
      projectPicker.append(group)
    }
  }
  projectPicker.value = fs.id
}

/**
 * Find a project by the id stored in the picker.
 * @param {string} id
 * @returns {Promise<ProjectFs | null>}
 */
async function projectById(id) {
  if (id === examples.id) return examples
  if (id.startsWith('browser:')) {
    const projectId = id.slice('browser:'.length)
    const record = (await listBrowserProjects()).find((p) => p.id === projectId)
    return record ? new IdbFs(record.id, record.name) : null
  }
  return diskFolders.find((d) => d.id === id) ?? null
}

/**
 * Switch to another project and open its last file (or its first game).
 * @param {ProjectFs} next
 */
async function openProject(next) {
  await flushSave()
  if (next.type === 'disk') {
    const disk = /** @type {DiskFs} */ (next)
    if (!(await disk.ensureAccess())) {
      showFilesProblem(`The browser did not allow access to "${disk.name}".`)
      projectPicker.value = fs.id
      return
    }
  }
  fs = next
  saveSetting('project', fs.id)
  openPath = null
  runPath = null
  tree.resetFolds()
  await refreshTree()
  const remembered = loadSetting(`open:${fs.id}`)
  if (remembered && entries.some((e) => e.path === remembered && e.kind === 'file')) await openFile(remembered)
  else await openFirstFile()
  renderProjectActions()
  projectPicker.value = fs.id
}

/** Open the first game file in the project, or show an empty editor. */
async function openFirstFile() {
  const first = entries.find((e) => e.kind === 'file' && fileKind(e.path) === 'mini')
  if (first) {
    await openFile(first.path)
    return
  }
  openPath = null
  editor.load('', true)
  showEditor(true)
  updateHeaders()
  renderTree()
  setSaveStatus('')
}

function renderProjectActions() {
  projectActions.replaceChildren()
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
      Promise.resolve(fn()).catch((error) => showFilesProblem(error instanceof Error ? error.message : String(error)))
    })
    projectActions.append(b)
  }

  if (fs.type === 'examples') {
    action('Copy to my projects', copyExamplesToProject)
    if (openPath && examples.isEdited(openPath)) {
      action('Reset this example', async () => {
        if (!openPath) return
        if (!confirm(`Throw away your changes to ${basename(openPath)}?`)) return
        await examples.reset(openPath)
        await openFile(openPath)
      })
    }
  } else if (fs.type === 'browser') {
    const project = /** @type {IdbFs} */ (fs)
    action('Rename project', async () => {
      const name = prompt('New name for this project:', project.name)?.trim()
      if (!name) return
      await renameBrowserProject(project.projectId, name)
      project.name = name
      updateHeaders()
      await refreshProjectPicker()
    })
    action('Delete project', async () => {
      if (!confirm(`Delete the project "${project.name}" and all its files? This can't be undone.`)) return
      await deleteBrowserProject(project.projectId)
      await refreshProjectPicker()
      await openProject(examples)
    })
  } else if (fs.type === 'disk') {
    const folder = /** @type {DiskFs} */ (fs)
    action('Forget this folder', async () => {
      if (!confirm(`Remove "${folder.name}" from the list? The files stay on your computer.`)) return
      await forgetFolder(folder.id)
      await refreshProjectPicker()
      await openProject(examples)
    })
  }
}

async function copyExamplesToProject() {
  const name = prompt('Name for your copy:', 'My examples')?.trim()
  if (!name) return
  const files = await examples.snapshot()
  const copy = await createBrowserProject(name, files)
  const keep = openPath
  await refreshProjectPicker()
  await openProject(copy)
  if (keep) await openFile(keep)
}

$('new-project').addEventListener('click', async () => {
  const name = prompt('Name for the new project:', 'My game')?.trim()
  if (!name) return
  try {
    const project = await createBrowserProject(name, { 'game.mini': STARTER_GAME })
    await refreshProjectPicker()
    await openProject(project)
  } catch (error) {
    showFilesProblem(error instanceof Error ? error.message : String(error))
  }
})

const openFolderButton = $('open-folder')
openFolderButton.hidden = !canOpenFolders()
openFolderButton.addEventListener('click', async () => {
  try {
    const folder = await pickFolder()
    if (!folder) return
    const list = await folder.list()
    if (!list.some((e) => fileKind(e.path) === 'mini')) {
      if (confirm(`"${folder.name}" has no game files yet. Add a starter game.mini?`)) {
        await folder.writeText('game.mini', STARTER_GAME)
      }
    }
    await refreshProjectPicker()
    await openProject(folder)
  } catch (error) {
    showFilesProblem(error instanceof Error ? error.message : String(error))
  }
})

projectPicker.addEventListener('change', async () => {
  const next = await projectById(projectPicker.value)
  if (next) await openProject(next)
  else {
    showFilesProblem('That project is gone.')
    await refreshProjectPicker()
  }
})

// ---------------------------------------------------------------------------
// Files

async function refreshTree() {
  try {
    entries = await fs.list()
  } catch (error) {
    entries = []
    showFilesProblem(error instanceof Error ? error.message : String(error))
  }
  renderTree()
}

function renderTree() {
  /** @type {Set<string>} */
  const edited = new Set()
  if (fs.type === 'examples') {
    for (const e of entries) if (e.kind === 'file' && examples.isEdited(e.path)) edited.add(e.path)
  }
  tree.render({ entries, readOnly: fs.readOnly, openPath, runPath, edited })
  for (const id of ['new-file', 'new-folder', 'upload']) {
    /** @type {HTMLButtonElement} */ ($(id)).disabled = fs.readOnly
  }
}

/** @param {boolean} on show the editor (true) or the picture preview (false) */
function showEditor(on) {
  editorBox.hidden = !on
  preview.hidden = on
}

/**
 * Open a file: game and text files in the editor, pictures in the preview.
 * @param {string} path
 */
async function openFile(path) {
  await flushSave()
  const kind = fileKind(path)
  tree.select(path)
  try {
    if (kind === 'mini' || kind === 'text') {
      const text = await fs.readText(path)
      openPath = path
      editor.load(text, kind === 'mini')
      showEditor(true)
      setSaveStatus(fs.type === 'examples' && examples.isEdited(path) ? 'Edited, kept in this browser' : '')
      if (kind === 'mini') {
        runPath = path
        update()
      } else {
        editor.setProblems([])
      }
    } else {
      openPath = path
      await showPreview(path, kind === 'image')
      setSaveStatus('')
    }
    saveSetting(`open:${fs.id}`, path)
  } catch (error) {
    showFilesProblem(error instanceof Error ? error.message : String(error))
  }
  updateHeaders()
  renderTree()
  renderProjectActions()
}

/**
 * @param {string} path
 * @param {boolean} isImage
 */
async function showPreview(path, isImage) {
  showEditor(false)
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = null
  previewImage.hidden = !isImage
  previewUse.replaceChildren()
  const blob = await fs.readBlob(path)
  const size = blob.size < 1024 ? `${blob.size} bytes` : `${(blob.size / 1024).toFixed(1)} KB`
  if (!isImage) {
    previewInfo.textContent = `${basename(path)}, ${size}. The playground can't show this kind of file.`
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
 * Wait for an image to load (or fail). `decode()` can stall in background tabs; load events don't.
 * @param {HTMLImageElement} img
 * @returns {Promise<void>}
 */
function imageLoaded(img) {
  if (img.complete) return Promise.resolve()
  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(), { once: true })
    img.addEventListener('error', () => resolve(), { once: true })
  })
}

/**
 * Rename or move, keeping the open file and the running file pointed at the right place.
 * @param {string} from
 * @param {string} to
 */
async function moveEntry(from, to) {
  const problem = nameProblem(basename(to))
  if (problem) throw new Error(problem)
  await flushSave()
  await fs.rename(from, to)
  /** @param {string | null} p */
  const moved = (p) => (p !== null && isInside(p, from) ? to + p.slice(from.length) : p)
  openPath = moved(openPath)
  runPath = moved(runPath)
  if (openPath) saveSetting(`open:${fs.id}`, openPath)
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
  let added = 0
  for (const file of files) {
    const path = join(dir, file.name)
    const problem = nameProblem(file.name)
    if (problem) {
      showFilesProblem(`${file.name}: ${problem}`)
      continue
    }
    if (await fs.exists(path)) {
      if (!confirm(`"${file.name}" is already there. Replace it?`)) continue
    }
    const kind = fileKind(path)
    if (kind === 'mini' || kind === 'text') await fs.writeText(path, await file.text())
    else await fs.writeBlob(path, file)
    added++
  }
  await refreshTree()
  if (added === 1 && files.length === 1) await openFile(join(dir, files[0].name))
  // New pictures may be ones the running game was missing.
  if (added > 0 && files.some((f) => fileKind(f.name) === 'image')) update()
}

$('new-file').addEventListener('click', async () => {
  try {
    const path = await freeName(fs, tree.targetDir(), 'untitled', '.mini')
    await fs.writeText(path, NEW_FILE)
    await refreshTree()
    await openFile(path)
    tree.startRename(path)
  } catch (error) {
    showFilesProblem(error instanceof Error ? error.message : String(error))
  }
})

$('new-folder').addEventListener('click', async () => {
  try {
    const path = await freeName(fs, tree.targetDir(), 'new folder', '')
    await fs.mkdir(path)
    await refreshTree()
    tree.startRename(path)
  } catch (error) {
    showFilesProblem(error instanceof Error ? error.message : String(error))
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
    showFilesProblem(error instanceof Error ? error.message : String(error))
  }
})

$('refresh').addEventListener('click', async () => {
  await refreshTree()
  if (runPath) update()
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

editor.onChange((text) => {
  const path = openPath
  if (path === null) return
  const target = fs
  pendingSave = async () => {
    setSaveStatus('Saving', 'busy')
    try {
      await target.writeText(path, text)
      if (target.type === 'examples') {
        setSaveStatus(examples.isEdited(path) ? 'Edited, kept in this browser' : 'Same as the original')
        renderTree()
        renderProjectActions()
      } else {
        setSaveStatus('Saved')
      }
    } catch (error) {
      setSaveStatus(`Not saved: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void flushSave(), SAVE_DELAY_MS)
  setSaveStatus('Editing', 'busy')
  if (path === runPath) {
    window.clearTimeout(compileTimer)
    compileTimer = window.setTimeout(update, COMPILE_DELAY_MS)
  }
})

window.addEventListener('beforeunload', () => {
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
async function update() {
  const path = runPath
  if (path === null) return
  const target = fs
  const text = path === openPath ? editor.getText() : await target.readText(path).catch(() => null)
  if (text === null || path !== runPath || target !== fs) return
  const { program, errors } = compile(text)
  compileProblems = errors
  if (path === openPath) editor.setProblems(errors)
  showProblems()
  if (program) await run(program, path)
}

/**
 * @param {Program} program
 * @param {string} path
 */
async function run(program, path) {
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
  if (!(e.ctrlKey || e.metaKey)) return
  if (e.key === 's' || e.key === 'Enter') {
    e.preventDefault()
    window.clearTimeout(compileTimer)
    void flushSave().then(update)
  }
})

// ---------------------------------------------------------------------------
// Start

startPerf($('perf'), () => game?.simulation.tickCount ?? null)

async function boot() {
  await refreshProjectPicker()
  const saved = loadSetting('project')
  /** @type {ProjectFs} */
  let first = examples
  if (saved && saved.startsWith('browser:')) {
    first = (await projectById(saved).catch(() => null)) ?? examples
  } else if (saved && saved.startsWith('disk:')) {
    const folder = diskFolders.find((d) => d.id === saved)
    // Browsers ask again for folder access after a reload, and only after a click.
    if (folder) showFilesProblem(`Pick "${folder.name}" from Project to open it again.`)
  }
  await openProject(first)
  // Older playground versions remembered an example by name.
  const legacy = loadSetting('example')
  if (first === examples && legacy && EXAMPLES.has(legacy) && !loadSetting(`open:${examples.id}`)) {
    await openFile(`${legacy}.mini`)
  }
}

void boot()

// Dev builds only: let browser tooling inspect the running game.
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__minijs', {
    get: () => ({ game, editor, fs, openPath, runPath, entries, openFile, openProject, examples, extname }),
  })
}
