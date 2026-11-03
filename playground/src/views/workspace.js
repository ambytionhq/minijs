// The project workspace: files (or a lesson) on the left, the open file in the
// middle, the running game and its details on the right.

import { compile } from '@minijs/lang'
import { start } from '@minijs/runtime'
import { IS_DESKTOP } from '../desktop/env.js'
import { ProjectAssetLoader, usableSrc } from '../files/project-assets.js'
import { basename, dirname, fileKind, isInside, join, nameProblem } from '../files/paths.js'
import { freeName } from '../files/project.js'
import { startPerf } from '../perf.js'
import { firstFile, rememberOpenFile } from '../projects/registry.js'
import { replaceRoute } from '../router.js'
import { saveFile } from '../share/save-file.js'
import { loadSetting, saveSetting } from '../storage.js'
import { NEW_FILE } from '../templates.js'
import { fileThumb } from '../tools/file-thumbs.js'
import { VISUAL_KINDS, newFileText, openTool, visualKind } from '../tools/index.js'
import { insertDeclaration, readProgram } from '../tools/machine-edit.js'
import { createConsole } from '../ui/console.js'
import { confirmAction } from '../ui/dialog.js'
import { createFileTree } from '../ui/file-tree.js'
import { toast } from '../ui/toast.js'

/** @import { MiniError, Program } from '@minijs/lang' */
/** @import { Game } from '@minijs/runtime' */
/** @import { Entry, ProjectFs } from '../files/project.js' */
/** @import { ExamplesFs } from '../files/examples-fs.js' */
/** @import { Editor } from '../editor.js' */
/** @import { Tool, ToolContext, VisualKind } from '../tools/index.js' */

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
const toggleFiles = $('toggle-files')
toggleFiles.addEventListener('click', () => {
  const expanded = filesPane.classList.toggle('is-expanded')
  toggleFiles.setAttribute('aria-expanded', String(expanded))
})
const lessonPane = $('lesson-pane')
const editorBox = $('editor')
const editorLoading = $('editor-loading')
const preview = $('preview')
const toolHost = $('tool-host')
const statesHost = $('states-host')
const viewSwitch = $('view-switch')
const viewTextButton = /** @type {HTMLButtonElement} */ ($('view-text'))
const viewStatesButton = /** @type {HTMLButtonElement} */ ($('view-states'))
const workspaceGrid = /** @type {HTMLElement} */ (view.querySelector('.workspace'))
const muteButton = /** @type {HTMLButtonElement} */ ($('mute'))
const previewAudio = /** @type {HTMLAudioElement} */ ($('preview-audio'))
const previewImage = /** @type {HTMLImageElement} */ ($('preview-image'))
const previewInfo = $('preview-info')
const previewUse = $('preview-use')
const uploadInput = /** @type {HTMLInputElement} */ ($('upload-input'))

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
let saving = Promise.resolve()
/** @type {string | null} */
let previewUrl = null
/** @type {CompileWatcher | null} */
let watcher = null
let mounted = false

/** @type {Tool | null} */
let openedTool = null
/** @type {ReturnType<typeof import('../tools/states-view.js').createStatesView> | null} */
let statesView = null
let showingStates = false
let toolToken = 0
let toolReloadTimer = 0
let muted = loadSetting('muted') === '1'
/** @type {Map<string, Promise<string | null>>} */
const thumbs = new Map()

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
  thumbFor: (path) => {
    if (!fs) return Promise.resolve(null)
    const key = `${fs.id}/${path}`
    let thumb = thumbs.get(key)
    if (!thumb) {
      thumb = fileThumb(path, fs)
      thumbs.set(key, thumb)
    }
    return thumb
  },
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
    ? 'Your first game'
    : project.type === 'examples'
      ? 'Example game'
      : project.type === 'disk'
        ? 'Saved to your folder'
        : 'Saves automatically'
  document.title = `${project.name} | minijs Studio`
  await getEditor()
  if (!sameProject) {
    tree.resetFolds()
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
  closeVisual()
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

/** Refuse to restart for an update if the open work could not be saved. */
export async function prepareWorkspaceUpdate() {
  if (!mounted) return
  const wasInert = view.inert
  view.inert = true
  try {
    await flushSave()
    if (saveStatus.dataset.state === 'error') {
      throw new Error(saveStatus.textContent || 'Your changes could not be saved.')
    }
    await unmountWorkspace()
  } finally {
    view.inert = wasInert
  }
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
  runName.textContent = 'Your game'
  viewSwitch.hidden = !(openPath && fileKind(openPath) === 'mini')
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
  for (const id of ['new-file', 'new-visual', 'new-folder', 'upload']) {
    const b = /** @type {HTMLButtonElement} */ ($(id))
    b.disabled = fs.readOnly
  }
}

/** @param {boolean} on show the editor (true) or the picture preview (false) */
function showEditor(on) {
  editorBox.hidden = !on || showingStates
  statesHost.hidden = !on || !showingStates
  preview.hidden = on
  toolHost.hidden = true
  workspaceGrid.classList.toggle('tool-open', on && showingStates)
}

/** Close the picture editors. Anything waiting to be saved has already been saved. */
function closeVisual() {
  toolToken++
  openedTool?.destroy()
  openedTool = null
  toolHost.replaceChildren()
  toolHost.hidden = true
  statesView?.destroy()
  statesView = null
  showingStates = false
  statesHost.hidden = true
  editorBox.hidden = false
  setViewButtons()
  workspaceGrid.classList.remove('tool-open')
}

function setViewButtons() {
  viewTextButton.setAttribute('aria-checked', String(!showingStates))
  viewStatesButton.setAttribute('aria-checked', String(showingStates))
  viewTextButton.tabIndex = showingStates ? -1 : 0
  viewStatesButton.tabIndex = showingStates ? 0 : -1
}

/** @param {boolean} on */
async function showStates(on) {
  if (on === showingStates || !openPath) return
  const e = await getEditor()
  showingStates = on
  setViewButtons()
  if (on) {
    const { createStatesView } = await import('../tools/states-view.js')
    const path = openPath
    statesView?.destroy()
    statesHost.hidden = false
    editorBox.hidden = true
    workspaceGrid.classList.add('tool-open')
    statesView = createStatesView(statesHost, {
      getText: () => e.getText(),
      setText: (text) => e.replaceAll(text),
      game: () => game,
      key: `${fs?.id ?? ''}/${path}`,
      toast: (message) => toast(message),
    })
  } else {
    statesView?.destroy()
    statesView = null
  }
  showEditor(true)
}

viewTextButton.addEventListener('click', () => void showStates(false))
viewStatesButton.addEventListener('click', () => void showStates(true))
viewSwitch.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  const next = !showingStates
  void showStates(next).then(() => (next ? viewStatesButton : viewTextButton).focus())
})

/**
 * What the picture editors can ask for.
 * @param {string} path
 * @returns {ToolContext}
 */
function toolContext(path) {
  const project = /** @type {ProjectFs} */ (fs)
  return {
    path,
    fs: project,
    readOnly: project.readOnly && project.type !== 'examples',
    save: (text) => saveVisual(path, text),
    addToGame: async (line) => {
      if (!runPath || !fs) {
        toast('Open or make a game file first.')
        return
      }
      const before = await fs.readText(runPath)
      const next = insertDeclaration(before, line)
      if (next !== before) await fs.writeText(runPath, next)
      void update()
      toast(`Added to ${basename(runPath)}: ${line}`)
    },
    gameHasLine: async (line) => {
      if (!runPath || !fs) return false
      const text = await fs.readText(runPath).catch(() => '')
      return text.split('\n').some((l) => l.trim() === line)
    },
    runPath: () => runPath,
    gameThingNames: async () => {
      if (!runPath || !fs) return []
      const text = await fs.readText(runPath).catch(() => '')
      return readProgram(text).things.map((t) => t.name)
    },
    filesOfKind: async (extension) => entries.filter((e) => e.kind === 'file' && e.path.endsWith(`.${extension}`)).map((e) => e.path),
    openFile: (next) => void openFile(next),
    usableName: (target) => (runPath ? usableSrc(runPath, target) : target),
    toast: (message) => toast(message),
    saveFile: async (blob, name) => {
      await saveFile(blob, name)
    },
    game: () => game,
  }
}

/**
 * Save an editor's file soon, and restart the game if it uses that file.
 * @param {string} path
 * @param {string} text
 */
function saveVisual(path, text) {
  const target = fs
  if (!target) return
  pendingSave = async () => {
    setSaveStatus('Saving', 'busy')
    try {
      await target.writeText(path, text)
      setSaveStatus('Saved')
      thumbs.delete(`${target.id}/${path}`)
      renderTree()
    } catch (error) {
      setSaveStatus(`Not saved: ${message(error)}`, 'error')
    }
  }
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void flushSave(), SAVE_DELAY_MS)
  setSaveStatus('Editing', 'busy')
  window.clearTimeout(toolReloadTimer)
  toolReloadTimer = window.setTimeout(() => {
    void flushSave().then(async () => {
      if (!runPath || !fs) return
      const source = await fs.readText(runPath).catch(() => '')
      // Tile sets are only named inside tile maps, so any game with a map may use one.
      const used = source.includes(basename(path)) || (path.endsWith('.tileset') && /^tilemap\b/m.test(source))
      if (used) await update()
    })
  }, 650)
}

/**
 * @param {string} path
 * @param {VisualKind} kind
 */
async function showTool(path, kind) {
  if (!fs) return
  const token = ++toolToken
  // The game keeps running beside the editor, so the file has a game to go with.
  if (runPath === null) {
    const first = await firstFile(fs)
    const game = entries.find((e) => e.kind === 'file' && fileKind(e.path) === 'mini')?.path ?? first
    if (game && fileKind(game) === 'mini') {
      runPath = game
      void update()
    }
  }
  const text = await fs.readText(path)
  if (token !== toolToken) return
  openedTool?.destroy()
  editorBox.hidden = true
  preview.hidden = true
  statesHost.hidden = true
  toolHost.hidden = false
  workspaceGrid.classList.add('tool-open')
  toolHost.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted tool-loading', textContent: 'Opening...' }))
  const tool = await openTool(kind, toolHost, text, toolContext(path))
  if (token !== toolToken) {
    tool.destroy()
    return
  }
  openedTool = tool
}

async function openFirst() {
  const first = fs ? await firstFile(fs) : null
  if (first) {
    await openFile(first)
    return
  }
  closeVisual()
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
  const visual = visualKind(path)
  closeVisual()
  tree.select(path)
  try {
    if (visual) {
      openPath = path
      setSaveStatus('')
      await showTool(path, visual)
    } else if (kind === 'mini' || kind === 'text') {
      const text = await fs.readText(path)
      openPath = path
      e.load(text, kind === 'mini')
      showEditor(true)
      const examples = fs.type === 'examples' ? /** @type {ExamplesFs} */ (fs) : null
      setSaveStatus(examples?.isEdited(path) ? 'Your changes are saved' : '')
      if (kind === 'mini') {
        runPath = path
        void update()
      } else {
        e.setProblems([])
      }
    } else {
      openPath = path
      await showPreview(path, kind)
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
 * @param {import('../files/paths.js').FileKind} kind
 */
async function showPreview(path, kind) {
  if (!fs) return
  showEditor(false)
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = null
  const isImage = kind === 'image'
  previewImage.hidden = !isImage
  previewAudio.hidden = kind !== 'audio'
  previewAudio.pause()
  previewAudio.removeAttribute('src')
  previewUse.replaceChildren()
  const blob = await fs.readBlob(path)
  const size = blob.size < 1024 ? `${blob.size} bytes` : `${(blob.size / 1024).toFixed(1)} KB`
  if (kind === 'audio') {
    previewUrl = URL.createObjectURL(blob)
    previewAudio.src = previewUrl
    previewInfo.textContent = `${basename(path)}, ${size}`
    const name = assetCodeName(path)
    const src = runPath ? usableSrc(runPath, path) : basename(path)
    const code = document.createElement('code')
    code.textContent = `sound ${name} "${src}"`
    const musicCode = document.createElement('code')
    musicCode.textContent = `music ${name} "${src}"`
    previewUse.append('Use it in a game with: ', code, ' or, to loop it: ', musicCode)
    return
  }
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
  const usable = usableSrc(from, path)
  const code = document.createElement('code')
  code.textContent = `looks like "${usable}"`
  previewUse.append('Use it in a game with: ', code)
}

/**
 * A name a game can use, from a file's name.
 * @param {string} path
 */
function assetCodeName(path) {
  const clean = basename(path).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+/, '')
  return clean === '' ? 'my-sound' : clean
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
  const reopen = openPath !== null && visualKind(openPath) !== null && moved(openPath) !== openPath
  openPath = moved(openPath)
  runPath = moved(runPath)
  if (openPath) rememberOpenFile(fs, openPath)
  tree.select(to)
  thumbs.clear()
  await refreshTree()
  updateHeaders()
  // An open editor holds the old name, so open it again under the new one.
  if (reopen && openPath) await openFile(openPath)
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
  // New pictures and sounds may be ones the running game was missing.
  if (added > 0 && files.some((f) => fileKind(f.name) === 'image' || fileKind(f.name) === 'audio')) void update()
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

/**
 * @param {VisualKind} kind
 */
async function newVisual(kind) {
  if (!fs) return
  const dir = tree.targetDir()
  /** @type {{ tileset?: string }} */
  const options = {}
  if (kind === 'tilemap') {
    // A tile map needs tiles. Make a set the first time, so painting can start right away.
    let tileset = entries.find((e) => e.kind === 'file' && e.path.endsWith('.tileset'))?.path
    if (!tileset) {
      tileset = await freeName(fs, dir, VISUAL_KINDS.tileset.base, '.tileset')
      await fs.writeText(tileset, newFileText('tileset'))
    }
    options.tileset = runPath ? usableSrc(runPath, tileset) : basename(tileset)
  }
  const info = VISUAL_KINDS[kind]
  const path = await freeName(fs, dir, info.base, `.${kind}`)
  await fs.writeText(path, newFileText(kind, options))
  await refreshTree()
  await openFile(path)
  tree.startRename(path)
}

const newVisualButton = /** @type {HTMLButtonElement} */ ($('new-visual'))
newVisualButton.addEventListener('click', () => {
  document.querySelector('.menu')?.remove()
  const menu = document.createElement('div')
  menu.className = 'menu visual-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'Make something new')
  const close = () => {
    menu.remove()
    document.removeEventListener('pointerdown', outside, true)
    newVisualButton.setAttribute('aria-expanded', 'false')
  }
  const outside = (/** @type {Event} */ e) => {
    if (!menu.contains(/** @type {Node} */ (e.target))) close()
  }
  for (const [kind, info] of Object.entries(VISUAL_KINDS)) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'menu-item'
    item.setAttribute('role', 'menuitem')
    const glyph = document.createElement('i')
    glyph.className = `ph ph-${info.icon}`
    glyph.setAttribute('aria-hidden', 'true')
    const words = document.createElement('span')
    words.className = 'visual-menu-words'
    const title = document.createElement('strong')
    title.textContent = info.title
    const blurb = document.createElement('small')
    blurb.textContent = info.blurb
    words.append(title, blurb)
    item.append(glyph, words)
    item.addEventListener('click', () => {
      close()
      newVisual(/** @type {VisualKind} */ (kind)).catch((error) => showFilesProblem(message(error)))
    })
    menu.append(item)
  }
  menu.addEventListener('keydown', (e) => {
    const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('.menu-item')])
    const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement))
    if (e.key === 'Escape') {
      close()
      newVisualButton.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus()
    }
  })
  const rect = newVisualButton.getBoundingClientRect()
  menu.style.top = `${rect.bottom + window.scrollY + 6}px`
  menu.style.left = `${Math.max(12, rect.left + window.scrollX)}px`
  document.body.append(menu)
  newVisualButton.setAttribute('aria-expanded', 'true')
  document.addEventListener('pointerdown', outside, true)
  requestAnimationFrame(() => /** @type {HTMLElement} */ (menu.firstElementChild).focus())
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
  if (save) saving = saving.then(save)
  await saving
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
        setSaveStatus(examples.isEdited(path) ? 'Your changes are saved' : 'Same as the original')
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

function drawMute() {
  const label = muted ? 'Turn sound on' : 'Turn sound off'
  muteButton.title = label
  muteButton.setAttribute('aria-label', label)
  muteButton.setAttribute('aria-pressed', String(muted))
  const glyph = /** @type {HTMLElement} */ (muteButton.querySelector('i'))
  glyph.className = `ph ${muted ? 'ph-speaker-slash' : 'ph-speaker-high'}`
}
muteButton.addEventListener('click', () => {
  muted = !muted
  saveSetting('muted', muted ? '1' : '0')
  game?.setMuted(muted)
  drawMute()
})
drawMute()

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
  if (path === openPath) statesView?.refresh()
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
      muted,
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
