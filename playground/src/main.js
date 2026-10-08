// minijs Studio: routes between the projects page, the workspace, the tutorial
// and full-screen play, and keeps the app up to date.

import '@fontsource/geist-sans/latin-400.css'
import '@fontsource/geist-sans/latin-500.css'
import '@fontsource/geist-sans/latin-600.css'
import '@fontsource/geist-sans/latin-700.css'
import '@fontsource/geist-mono/latin-400.css'
import '@fontsource/geist-mono/latin-500.css'
import './icons.css'
import './styles.css'

import { IS_DESKTOP } from './desktop/env.js'
import { MemoryFs } from './files/memory-fs.js'
import { createLessonPanel } from './learn/lesson-panel.js'
import { FIRST_GAME } from './learn/lessons.js'
import { EXAMPLES } from './projects/examples.js'
import { createProject, projectById, tutorialProject } from './projects/registry.js'
import { applyUpdate, checkForUpdates, onUpdateProgress, onUpdateState, startOffline, updateVersion } from './pwa.js'
import { go, parseRoute } from './router.js'
import { decodePack, packFiles } from './share/pack.js'
import { openExportDialog, openShareDialog, savePack } from './share/dialogs.js'
import { askText, confirmAction } from './ui/dialog.js'
import { openHelp } from './ui/help.js'
import { toast } from './ui/toast.js'
import { appearanceControl, startAppearance } from './ui/appearance.js'
import { mountHome, newGame, noAccess, openFolder, unmountHome } from './views/home.js'
import { mountPlay, unmountPlay } from './views/play.js'

/** @import { Route } from './router.js' */
/** @import { ProjectFs } from './files/project.js' */

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error))

let routing = Promise.resolve()
/** @type {typeof import('./views/workspace.js') | null} */
let workspaceModule = null
/** @type {Promise<typeof import('./views/workspace.js')> | null} */
let workspaceReady = null

function getWorkspace() {
  workspaceReady ??= import('./views/workspace.js').then((module) => {
    workspaceModule = module
    return module
  }).catch((error) => {
    workspaceReady = null
    throw error
  })
  return workspaceReady
}
startAppearance()
document.querySelector('.workspace-settings')?.append(appearanceControl())
const skipLink = document.querySelector('.skip-link')
skipLink?.addEventListener('click', (event) => {
  event.preventDefault()
  const target = document.querySelector('.view:not([hidden]) main')
  target?.focus()
  target?.scrollIntoView()
})

/** @param {Route} route */
async function show(route) {
  if (route.view !== 'home') unmountHome()
  if (route.view !== 'play' && route.view !== 'demo') await unmountPlay()
  if (route.view !== 'project' && route.view !== 'learn') await workspaceModule?.unmountWorkspace()

  switch (route.view) {
    case 'home':
      await mountHome()
      return
    case 'project': {
      const project = await projectById(route.project)
      if (!project) {
        toast('That project is gone.', { tone: 'error' })
        go({ view: 'home' })
        return
      }
      if (project.type === 'disk' && !(await /** @type {any} */ (project).ensureAccess())) {
        toast(noAccess(project.name), { tone: 'error' })
        go({ view: 'home' })
        return
      }
      await (await getWorkspace()).mountWorkspace({ project, file: route.file })
      return
    }
    case 'learn':
      await showLesson()
      return
    case 'demo': {
      const example = [...EXAMPLES.values()].find((e) => e.info.folder === route.example)
      if (!example) {
        go({ view: 'home' })
        return
      }
      await mountPlay({
        title: example.info.name,
        fs: example.fs,
        main: example.info.main,
        remixLabel: 'See how it works',
        onRemix: () => go({ view: 'project', project: example.fs.id, file: example.info.main }),
      })
      return
    }
    case 'play': {
      const pack = await decodePack(route.code)
      if (!pack) {
        toast('This link is broken or cut off. Ask for it again.', { tone: 'error', seconds: 8 })
        go({ view: 'home' })
        return
      }
      await mountPlay({
        title: pack.name,
        fs: new MemoryFs(pack.name, packFiles(pack)),
        main: pack.main,
        remixLabel: 'Save and edit',
        onRemix: () => void savePack(pack).catch((e) => toast(message(e), { tone: 'error' })),
      })
      return
    }
    case 'open': {
      const pack = await decodePack(route.code)
      if (!pack) {
        toast('This link is broken or cut off. Ask for it again.', { tone: 'error', seconds: 8 })
        go({ view: 'home' })
        return
      }
      const ok = await confirmAction({
        title: `Save "${pack.name}"?`,
        message: 'Someone shared this game with you. Save it as a new project so you can play and change it.',
        action: 'Save it',
      })
      if (ok) await savePack(pack).catch((e) => toast(message(e), { tone: 'error' }))
      else go({ view: 'home' })
      return
    }
  }
}

async function showLesson() {
  /** @type {ProjectFs} */
  let project
  try {
    project = await tutorialProject(FIRST_GAME.starter)
  } catch {
    // No storage (private window): the lesson still works, it just won't be kept.
    project = new MemoryFs('Tutorial', { 'game.mini': FIRST_GAME.starter })
  }
  const panel = createLessonPanel({
    lesson: FIRST_GAME,
    onApply: (apply) => void workspaceModule?.changeOpenText(apply),
    onFinish: async (action) => {
      if (action === 'showcase') go({ view: 'home' })
      if (action === 'again') {
        const ok = await confirmAction({
          title: 'Start the lesson again?',
          message: 'Your tutorial game goes back to an empty sky.',
          action: 'Start again',
        })
        if (!ok) return
        await project.writeText('game.mini', FIRST_GAME.starter)
        panel.restart()
        await workspaceModule?.openFile('game.mini')
      }
      if (action === 'keep') {
        const name = await askText({ title: 'Keep your game', label: 'Name', value: 'My platformer', action: 'Keep it' })
        if (!name) return
        const copy = await createProject(name, { 'game.mini': await project.readText('game.mini') })
        go({ view: 'project', project: copy.id, file: 'game.mini' })
      }
    },
  })
  await (await getWorkspace()).mountWorkspace({ project, file: 'game.mini', lessonPanel: panel.element, watch: panel })
}

function route() {
  if (installing) return
  routing = routing.then(() => show(parseRoute(location.hash))).catch((error) => {
    toast(`Something went wrong: ${message(error)}`, { tone: 'error' })
  })
}

// Workspace buttons.

/** @param {(p: { fs: ProjectFs; runPath: string; name: string }) => Promise<unknown>} fn */
const withProject = (fn) => () => {
  const p = workspaceModule?.currentProject()
  if (!p) {
    toast('Open a game file first.')
    return
  }
  void fn({ fs: p.fs, runPath: p.runPath, name: p.fs.name }).catch((e) => toast(message(e), { tone: 'error' }))
}
document.getElementById('share')?.addEventListener('click', withProject(openShareDialog))
document.getElementById('export')?.addEventListener('click', withProject(openExportDialog))
document.getElementById('help')?.addEventListener('click', () => void openHelp())

// "Make my own copy" of an example.
document.getElementById('view-workspace')?.addEventListener('copy-project', async () => {
  const p = workspaceModule?.currentProject()
  if (!p) return
  const example = EXAMPLES.get(p.fs.id)
  const name = await askText({
    title: 'Make your own copy',
    label: 'Name',
    value: example ? `My ${example.info.name}` : `${p.fs.name} copy`,
    action: 'Make copy',
  })
  if (!name) return
  try {
    const files = example ? await example.fs.snapshot() : {}
    const copy = await createProject(name, files)
    go({ view: 'project', project: copy.id, file: p.runPath })
  } catch (error) {
    toast(message(error), { tone: 'error' })
  }
})

// Updates: a quiet banner, never a forced reload.
const banner = /** @type {HTMLElement} */ (document.getElementById('update-banner'))
const bannerText = /** @type {HTMLElement} */ (document.getElementById('update-text'))
const updateNow = /** @type {HTMLButtonElement} */ (document.getElementById('update-now'))
const updateLater = /** @type {HTMLButtonElement} */ (document.getElementById('update-later'))
let dismissed = false
let installing = false
onUpdateState((s) => {
  banner.hidden = !(s === 'update-ready' || s === 'downloading') || dismissed
  updateNow.disabled = s === 'downloading'
  if (s === 'update-ready') {
    bannerText.textContent = IS_DESKTOP
      ? `minijs Studio ${updateVersion} is ready to install.`
      : 'A new version of minijs Studio is ready.'
    updateNow.textContent = IS_DESKTOP ? 'Install and restart' : 'Reload'
  }
  if (s === 'error') bannerText.textContent = 'Could not check for updates. Try again when you are online.'
})
onUpdateProgress((done) => {
  bannerText.textContent = done === null ? 'Downloading the update' : `Downloading the update: ${Math.round(done * 100)}%`
})
async function installAvailableUpdate() {
  if (installing) return
  installing = true
  dismissed = false
  updateNow.disabled = true
  let prepared = false
  const views = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.view')])
  // Save open work before the page reloads or the app restarts.
  try {
    await routing
    for (const view of views) view.inert = true
    updateLater.disabled = true
    await workspaceModule?.prepareWorkspaceUpdate()
    prepared = true
    await applyUpdate()
  } catch (error) {
    toast(`The update didn't install: ${message(error)}`, { tone: 'error', seconds: 8 })
  } finally {
    installing = false
    for (const view of views) view.inert = false
    updateLater.disabled = false
    updateNow.disabled = false
    if (prepared) route()
  }
}
updateNow.addEventListener('click', () => void installAvailableUpdate())
document.addEventListener('install-update', () => void installAvailableUpdate())
updateLater?.addEventListener('click', () => {
  dismissed = true
  banner.hidden = true
})

// Desktop menu bar items.
/** @type {Record<string, () => void | Promise<void>>} */
const MENU = {
  'new-project': () => newGame(),
  'open-folder': () => openFolder(),
  projects: () => go({ view: 'home' }),
  share: withProject(openShareDialog),
  export: withProject(openExportDialog),
  tutorial: () => go({ view: 'learn' }),
  reference: () => openHelp(),
  website: async () => {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl('https://minijs.ambytion.net')
  },
  'check-updates': async () => {
    const result = await checkForUpdates()
    if (result === 'newest') toast('You have the newest version of minijs Studio.')
    if (result === 'failed') toast('I couldn\'t check for updates. Are you online?', { tone: 'error' })
  },
}

/**
 * Open .mini files double-clicked in the file manager: their folder becomes the project.
 * @param {string[]} paths
 */
async function openFiles(paths) {
  const { folderForFile } = await import('./files/tauri-fs.js')
  const last = paths[paths.length - 1]
  if (!last) return
  const { fs, file } = await folderForFile(last)
  go({ view: 'project', project: fs.id, file })
}

/**
 * An exported game: play it full window, nothing else.
 * @param {{ game: string | null; title: string | null }} info
 */
async function startPlayer(info) {
  const pack = await decodePack(info.game ?? '')
  if (!pack) {
    document.body.textContent = 'This game file is damaged. Export the game again.'
    return
  }
  const title = info.title || pack.name
  await mountPlay({ title, fs: new MemoryFs(pack.name, packFiles(pack)), main: pack.main, standalone: true })
  document.title = title
}

async function boot() {
  if (IS_DESKTOP) {
    const desktop = await import('./desktop/bridge.js')
    const info = await desktop.startDesktop({
      menu: (id) => { if (!installing) void Promise.resolve(MENU[id]?.()).catch((e) => toast(message(e), { tone: 'error' })) },
      openFiles: (paths) => { if (!installing) void openFiles(paths).catch((e) => toast(message(e), { tone: 'error' })) },
    })
    if (info.game) {
      await startPlayer(info).catch((e) => toast(message(e), { tone: 'error' }))
      requestAnimationFrame(() => void desktop.showWindow())
      return
    }
    window.addEventListener('hashchange', route)
    route()
    await routing
    requestAnimationFrame(() => void desktop.showWindow())
  } else {
    window.addEventListener('hashchange', route)
    route()
  }
  void startOffline()
}

void boot()
