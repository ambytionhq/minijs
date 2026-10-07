// minijs Studio: routes between the projects page, the workspace, the tutorial
// and full-screen play, and keeps the app up to date.

import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import '@fontsource/geist-sans/700.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import '@phosphor-icons/web/regular'
import './styles.css'

import { MemoryFs } from './files/memory-fs.js'
import { createLessonPanel } from './learn/lesson-panel.js'
import { FIRST_GAME } from './learn/lessons.js'
import { EXAMPLES } from './projects/examples.js'
import { createProject, projectById, tutorialProject } from './projects/registry.js'
import { applyUpdate, onUpdateState, startOffline } from './pwa.js'
import { go, parseRoute } from './router.js'
import { decodePack, packFiles } from './share/pack.js'
import { openExportDialog, openShareDialog, savePack } from './share/dialogs.js'
import { askText, confirmAction } from './ui/dialog.js'
import { openHelp } from './ui/help.js'
import { toast } from './ui/toast.js'
import { mountHome, unmountHome } from './views/home.js'
import { mountPlay, unmountPlay } from './views/play.js'
import { changeOpenText, currentProject, mountWorkspace, openFile, unmountWorkspace } from './views/workspace.js'

/** @import { Route } from './router.js' */
/** @import { ProjectFs } from './files/project.js' */

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error))

let routing = Promise.resolve()

/** @param {Route} route */
async function show(route) {
  if (route.view !== 'home') unmountHome()
  if (route.view !== 'play' && route.view !== 'demo') await unmountPlay()
  if (route.view !== 'project' && route.view !== 'learn') await unmountWorkspace()

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
        toast(`The browser did not allow access to "${project.name}".`, { tone: 'error' })
        go({ view: 'home' })
        return
      }
      await mountWorkspace({ project, file: route.file })
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
    onApply: (apply) => void changeOpenText(apply),
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
        await openFile('game.mini')
      }
      if (action === 'keep') {
        const name = await askText({ title: 'Keep your game', label: 'Name', value: 'My platformer', action: 'Keep it' })
        if (!name) return
        const copy = await createProject(name, { 'game.mini': await project.readText('game.mini') })
        go({ view: 'project', project: copy.id, file: 'game.mini' })
      }
    },
  })
  await mountWorkspace({ project, file: 'game.mini', lessonPanel: panel.element, watch: panel })
}

function route() {
  routing = routing.then(() => show(parseRoute(location.hash))).catch((error) => {
    toast(`Something went wrong: ${message(error)}`, { tone: 'error' })
  })
}

window.addEventListener('hashchange', route)
route()

// Workspace buttons.

/** @param {(p: { fs: ProjectFs; runPath: string; name: string }) => Promise<unknown>} fn */
const withProject = (fn) => () => {
  const p = currentProject()
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
  const p = currentProject()
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
let dismissed = false
onUpdateState((s) => {
  banner.hidden = s !== 'update-ready' || dismissed
})
document.getElementById('update-now')?.addEventListener('click', async () => {
  await unmountWorkspace()
  applyUpdate()
})
document.getElementById('update-later')?.addEventListener('click', () => {
  dismissed = true
  banner.hidden = true
})
void startOffline()
