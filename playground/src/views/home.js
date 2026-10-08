// The projects page: showcase games, your projects, folders, small examples and
// the tutorial. Game cards show a live frame of the real game, and start
// playing while the pointer is over them.

import { canOpenFolders, forgetFolder, pickFolder } from '../files/folders.js'
import { IdbFs, deleteBrowserProject, renameBrowserProject } from '../files/idb-fs.js'
import { MemoryFs } from '../files/memory-fs.js'
import { fileKind } from '../files/paths.js'
import { FIRST_GAME } from '../learn/lessons.js'
import { EXAMPLES } from '../projects/examples.js'
import { createProject, firstFile, listProjects, timeAgo } from '../projects/registry.js'
import { IS_DESKTOP } from '../desktop/env.js'
import { APP_VERSION, checkForUpdates, onUpdateState } from '../pwa.js'
import { go } from '../router.js'
import { importZip, openPasteDialog } from '../share/dialogs.js'
import { saveFile } from '../share/save-file.js'
import { writeZip } from '../share/zip.js'
import { downloadName } from '../share/export-html.js'
import { loadSetting } from '../storage.js'
import { STARTER_GAME } from '../templates.js'
import { askText, confirmAction } from '../ui/dialog.js'
import { openHelp } from '../ui/help.js'
import { createPreview } from '../ui/thumbnail.js'
import { toast } from '../ui/toast.js'
import { appearanceControl } from '../ui/appearance.js'

/** @import { ProjectFs } from '../files/project.js' */

const view = /** @type {HTMLElement} */ (document.getElementById('view-home'))

/** @type {Array<() => void>} */
let cleanup = []
let generation = 0

/** One-line descriptions for the small examples. */
const BASICS = /** @type {Record<string, string>} */ ({
  'platformer.mini': 'Run, jump and collect coins',
  'coin-dash.mini': 'Top-down chase with lives',
  'dodge.mini': 'Falling rocks and a score',
  'clicker.mini': 'Click things, buy helpers',
  'hero.mini': 'Pictures and a walk cycle',
  'controls.mini': 'Every kind of input at once',
})

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

/** @param {string} name */
function icon(name) {
  const i = el('i', `ph ${name}`)
  i.setAttribute('aria-hidden', 'true')
  return i
}

/**
 * @param {string} iconName
 * @param {string} label
 * @param {string} [className]
 */
function button(iconName, label, className = 'btn') {
  const b = /** @type {HTMLButtonElement} */ (el('button', className))
  b.type = 'button'
  b.append(icon(iconName), label)
  return b
}

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error))

/** Start live previews when a card scrolls into view; play while hovered. */
const previews = new IntersectionObserver(
  (items) => {
    for (const item of items) {
      if (!item.isIntersecting) continue
      previews.unobserve(item.target)
      const start = /** @type {any} */ (item.target).startPreview
      if (typeof start === 'function') void start()
    }
  },
  { rootMargin: '200px' },
)

/**
 * A preview box that renders the game and plays it on hover or focus.
 * @param {ProjectFs} fs
 * @param {string | null} path
 * @param {string} className
 */
function previewBox(fs, path, className) {
  const box = el('div', className)
  box.classList.add('preview-loading')
  const currentGeneration = generation
  const canvas = /** @type {HTMLCanvasElement} */ (el('canvas'))
  canvas.setAttribute('aria-hidden', 'true')
  box.append(canvas)
  if (!path) {
    box.classList.remove('preview-loading')
    box.classList.add('preview-empty')
    box.append(icon('ph-game-controller'))
    return box
  }
  const lazyBox = /** @type {any} */ (box)
  lazyBox.startPreview = async () => {
    try {
      const preview = await createPreview(canvas, fs, path)
      box.classList.remove('preview-loading')
      if (currentGeneration !== generation) {
        preview?.destroy()
        return
      }
      if (!preview) {
        box.classList.add('preview-empty')
        box.append(icon('ph-warning-circle'))
        return
      }
      const card = box.closest('.card') ?? box
      card.addEventListener('pointerenter', preview.play)
      card.addEventListener('pointerleave', preview.pause)
      card.addEventListener('focusin', preview.play)
      card.addEventListener('focusout', preview.pause)
      cleanup.push(preview.destroy)
    } catch {
      box.classList.remove('preview-loading')
      box.classList.add('preview-empty')
      box.append(icon('ph-warning-circle'))
    }
  }
  previews.observe(box)
  return box
}

/** @param {string} title @param {string} [subtitle] @param {HTMLElement[]} [extra] */
function sectionHead(title, subtitle, extra = []) {
  const head = el('div', 'section-head')
  const words = el('div')
  words.append(el('h2', '', title))
  if (subtitle) words.append(el('p', 'muted', subtitle))
  head.append(words, ...extra)
  return head
}

/** @param {string} name */
export function noAccess(name) {
  return IS_DESKTOP
    ? `I can't find the folder "${name}". It may have been moved or deleted.`
    : `The browser did not allow access to "${name}".`
}

export async function newGame() {
  const name = await askText({ title: 'New game', label: 'Name', value: 'My game', action: 'Create' })
  if (!name) return
  try {
    const project = await createProject(name, { 'game.mini': STARTER_GAME })
    go({ view: 'project', project: project.id, file: 'game.mini' })
  } catch (error) {
    toast(`I couldn't make the project: ${message(error)}`, { tone: 'error' })
  }
}

/** Pick a folder on this computer and open it, offering a starter game if it has none. */
export async function openFolder() {
  try {
    const folder = await pickFolder()
    if (!folder) return
    const list = await folder.list()
    if (!list.some((e) => fileKind(e.path) === 'mini')) {
      const ok = await confirmAction({
        title: 'Add a starter game?',
        message: `"${folder.name}" has no game files yet. Add a starter game.mini so there is something to play?`,
        action: 'Add it',
      })
      if (ok) await folder.writeText('game.mini', STARTER_GAME)
    }
    go({ view: 'project', project: folder.id, file: null })
  } catch (error) {
    toast(message(error), { tone: 'error' })
  }
}

/**
 * A small menu that opens under a button.
 * @param {HTMLButtonElement} trigger
 * @param {Array<[string, string, () => void | Promise<void>, boolean?]>} items icon, label, action, danger
 */
function attachMenu(trigger, items) {
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')
  trigger.addEventListener('click', (e) => {
    e.stopPropagation()
    document.querySelector('.menu')?.remove()
    const menu = el('div', 'menu')
    menu.setAttribute('role', 'menu')
    for (const [iconName, label, fn, danger] of items) {
      const item = button(iconName, label, danger ? 'menu-item menu-danger' : 'menu-item')
      item.setAttribute('role', 'menuitem')
      item.addEventListener('click', () => {
        close()
        Promise.resolve(fn()).catch((error) => toast(message(error), { tone: 'error' }))
      })
      menu.append(item)
    }
    const rect = trigger.getBoundingClientRect()
    menu.style.top = `${rect.bottom + window.scrollY + 6}px`
    menu.style.left = `${Math.max(12, rect.right + window.scrollX - 200)}px`
    document.body.append(menu)
    trigger.setAttribute('aria-expanded', 'true')
    const firstItem = /** @type {HTMLElement | null} */ (menu.firstElementChild)
    firstItem?.focus()
    const close = () => {
      menu.remove()
      trigger.setAttribute('aria-expanded', 'false')
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
    /** @param {KeyboardEvent} ev */
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        close()
        trigger.focus()
      }
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault()
        const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('.menu-item')])
        const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement))
        items[(i + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      }
    }
    setTimeout(() => {
      document.addEventListener('click', close)
      document.addEventListener('keydown', onKey)
    })
  })
}

/** @param {ProjectFs} fs */
async function projectZip(fs) {
  /** @type {Record<string, string | Blob>} */
  const files = {}
  for (const entry of await fs.list()) {
    if (entry.kind !== 'file') continue
    const kind = fileKind(entry.path)
    files[entry.path] = kind === 'mini' || kind === 'text' ? await fs.readText(entry.path) : await fs.readBlob(entry.path)
  }
  return writeZip(files)
}

export async function mountHome() {
  unmountHome()
  view.hidden = false
  document.title = 'minijs Studio'
  const lessonStep = Number(loadSetting(`lesson:${FIRST_GAME.id}:step`) ?? '0') || 0
  const lessonDone = lessonStep >= FIRST_GAME.steps.length

  // The projects page is the starting point, with no separate navigation bar.
  const heading = el('header', 'home-heading')
  const brand = el('a', 'brand')
  brand.setAttribute('href', '#/')
  const logo = /** @type {HTMLImageElement} */ (el('img', 'brand-mark'))
  logo.src = './icons/icon-192.png'
  logo.alt = ''
  brand.append(logo, el('span', 'brand-name', 'minijs'), el('span', 'brand-studio', 'Studio'))
  const tools = el('div', 'home-tools')
  const zipInput = /** @type {HTMLInputElement} */ (el('input'))
  zipInput.type = 'file'
  zipInput.accept = '.zip,application/zip'
  zipInput.hidden = true
  zipInput.addEventListener('change', async () => {
    const file = zipInput.files?.[0]
    zipInput.value = ''
    if (!file) return
    try {
      await importZip(file)
    } catch (error) {
      toast(message(error), { tone: 'error' })
    }
  })
  const addMenu = button('ph-folder-open', 'Add existing', 'btn')
  const additions = [
    ['ph-file-zip', 'Import a game', () => zipInput.click()],
    ['ph-clipboard-text', 'Paste a game', () => openPasteDialog()],
  ]
  if (canOpenFolders()) {
    additions.push(['ph-folder-open', 'Open folder', () => openFolder()])
  }
  attachMenu(addMenu, additions)
  const helpBtn = /** @type {HTMLButtonElement} */ (el('button', 'icon-btn icon-btn-lg'))
  helpBtn.type = 'button'
  helpBtn.setAttribute('aria-label', 'Help and language reference')
  helpBtn.title = 'Help'
  helpBtn.append(icon('ph-question'))
  helpBtn.addEventListener('click', () => void openHelp())
  const settings = el('div', 'studio-settings')
  settings.append(helpBtn, appearanceControl())
  const words = el('div', 'home-heading-copy')
  words.append(
    brand,
    el('h1', '', 'Your projects'),
    el('p', 'muted', 'Pick up where you left off, or start something new.'),
  )
  const newBtn = button('ph-plus', 'New game', 'btn btn-primary btn-lg')
  newBtn.addEventListener('click', () => void newGame())
  tools.append(addMenu, newBtn, zipInput)
  heading.append(words, tools)

  const learn = /** @type {HTMLAnchorElement} */ (el('a', 'learn-card'))
  learn.href = '#/learn'
  const learnTop = el('div', 'learn-top')
  learnTop.append(el('span', 'learn-label', 'Tutorial'), el('span', 'learn-time', '10 minutes'))
  const learnCopy = el('div', 'learn-copy')
  learnCopy.append(learnTop, el('h2', '', FIRST_GAME.title), el('p', 'muted', 'Make a platformer, one rule at a time.'))
  const finishedLesson = FIRST_GAME.steps.reduce((source, step) => step.apply(source), FIRST_GAME.starter)
  const lessonPreview = previewBox(new MemoryFs('Tutorial preview', { 'game.mini': finishedLesson }), 'game.mini', 'learn-preview')
  learn.append(learnCopy, lessonPreview)
  const learnGo = el('span', 'learn-go')
  learnGo.append(lessonDone ? 'Open it again' : lessonStep > 0 ? `Continue at step ${lessonStep + 1}` : 'Start the tutorial', icon('ph-arrow-right'))
  learn.append(learnGo)

  // Showcase games.
  const showcase = el('section', 'home-section')
  showcase.append(sectionHead('Find your next idea', 'Try a game, then make your own version.'))
  const bento = el('div', 'showcase-grid')
  const showcases = [...EXAMPLES.values()].filter((e) => e.info.kind === 'showcase')
  const genres = { 'cloud-hopper': 'Platformer', 'star-defender': 'Arcade', 'crypt-dash': 'Adventure' }
  showcases.forEach(({ info, fs }, i) => {
    const card = el('article', `card showcase-card ${i === 0 ? 'is-feature' : ''}`)
    card.append(previewBox(fs, info.main, 'card-preview'))
    const body = el('div', 'card-body')
    const text = el('div', 'card-text')
    text.append(el('span', 'game-genre', genres[info.folder] ?? 'Game'), el('h3', '', info.name), el('p', 'muted', info.blurb))
    const actions = el('div', 'card-actions')
    const play = button('ph-play', 'Play', 'btn btn-primary')
    play.addEventListener('click', () => go({ view: 'demo', example: info.folder }))
    const open = button('ph-code', 'Open', 'btn')
    open.addEventListener('click', () => go({ view: 'project', project: fs.id, file: info.main }))
    actions.append(play, open)
    body.append(text, actions)
    card.append(body)
    bento.append(card)
  })
  showcase.append(bento, learn)

  // Your projects (filled in once loaded).
  const mine = el('section', 'home-section')
  const mineGrid = el('div', 'project-grid')
  mineGrid.setAttribute('aria-busy', 'true')
  for (let i = 0; i < 2; i++) {
    const skeleton = el('div', 'project-skeleton')
    skeleton.setAttribute('aria-hidden', 'true')
    mineGrid.append(skeleton)
  }
  const mineCount = el('span', 'count')
  mine.append(sectionHead('Recently edited', undefined, [mineCount]), mineGrid)

  const folders = el('section', 'home-section')
  folders.hidden = true

  // Small examples.
  const basics = EXAMPLES.get('example:basics')
  const small = el('section', 'home-section')
  if (basics) {
    small.append(sectionHead('Little games to learn from', 'Borrow a rule, try an idea, or start from one of these.'))
    const list = el('div', 'basics-grid')
    for (const [path] of basics.fs.texts) {
      const a = /** @type {HTMLAnchorElement} */ (el('a', 'basics-item'))
      a.href = `#/p/${encodeURIComponent(basics.fs.id)}/${encodeURIComponent(path)}`
      const t = el('div')
      t.append(el('span', 'basics-name', path.replace(/\.mini$/, '').replace(/-/g, ' ')), el('span', 'muted small', BASICS[path] ?? ''))
      const icons = { 'platformer.mini': 'ph-person-simple-run', 'coin-dash.mini': 'ph-coins', 'dodge.mini': 'ph-meteor', 'clicker.mini': 'ph-cursor-click', 'hero.mini': 'ph-image', 'controls.mini': 'ph-game-controller' }
      a.append(icon(icons[path] ?? 'ph-file-code'), t, icon('ph-arrow-up-right'))
      list.append(a)
    }
    small.append(list)
  }

  // Footer with version and updates.
  const footer = el('footer', 'home-footer')
  const version = el('span', '', `minijs Studio ${APP_VERSION}${IS_DESKTOP ? ' for desktop' : ''}`)
  const update = el('span', 'update-state')
  cleanup.push(
    onUpdateState((s) => {
      update.replaceChildren()
      if (s === 'offline-ready') update.append(icon('ph-wifi-slash'), 'Ready to work offline')
      else if (s === 'checking') update.append(icon('ph-arrows-clockwise'), 'Checking for updates')
      else if (s === 'installing') update.append(icon('ph-download-simple'), 'Saving for offline use')
      else if (s === 'update-ready') {
        const b = button('ph-sparkle', IS_DESKTOP ? 'Update ready: install' : 'Update ready: reload', 'link-btn')
        b.addEventListener('click', () => view.dispatchEvent(new CustomEvent('install-update', { bubbles: true })))
        update.append(b)
      } else if (s === 'downloading') update.append(icon('ph-download-simple'), 'Installing the update')
      else if (s === 'error') update.append(icon('ph-warning-circle'), IS_DESKTOP ? 'Could not check for updates' : 'Offline setup unavailable')
    }),
  )
  const company = /** @type {HTMLAnchorElement} */ (el('a', 'muted', 'Made by Ambytion'))
  company.href = 'https://ambytion.net'
  company.target = '_blank'
  company.rel = 'noopener'
  footer.append(version, update, settings, company)
  if (IS_DESKTOP) {
    const check = button('ph-arrows-clockwise', 'Check for updates', 'link-btn')
    check.addEventListener('click', async () => {
      check.disabled = true
      const result = await checkForUpdates()
      check.disabled = false
      if (result === 'newest') toast('You have the newest version of minijs Studio.')
      if (result === 'failed') toast('Could not check for updates. Check your connection and try again.', { tone: 'error' })
    })
    footer.insertBefore(check, company)
  }

  const main = el('main', 'home-main')
  main.id = 'home-content'
  main.tabIndex = -1
  main.append(heading, mine, folders, showcase, small)
  view.replaceChildren(main, footer)

  try {
    await fillProjects(mineGrid, mineCount, folders)
  } catch (error) {
    const retry = button('ph-arrows-clockwise', 'Try again', 'btn')
    retry.addEventListener('click', () => void mountHome())
    mineGrid.replaceChildren(el('p', 'files-status', 'Your projects could not open. Try again in a moment.'), retry)
  } finally {
    mineGrid.setAttribute('aria-busy', 'false')
  }
}

/**
 * @param {HTMLElement} grid
 * @param {HTMLElement} count
 * @param {HTMLElement} folders
 */
async function fillProjects(grid, count, folders) {
  const list = await listProjects()
  const tutorialId = loadSetting('tutorial-project')
  grid.replaceChildren()
  count.textContent = String(list.browser.length)
  count.hidden = list.browser.length === 0
  if (!list.storageWorks) {
    grid.append(el('p', 'muted', 'This browser is not keeping files (a private window can do that). Open a folder or export your games to keep them.'))
  }
  for (const [index, record] of list.browser.entries()) {
    const fs = new IdbFs(record.id, record.name)
    const card = el('article', `card project-card${index === 0 ? ' is-recent' : ''}`)
    const path = await firstFile(fs).catch(() => null)
    const link = /** @type {HTMLAnchorElement} */ (el('a', 'card-link'))
    link.href = `#/p/${encodeURIComponent(fs.id)}`
    link.setAttribute('aria-label', `Open ${record.name}`)
    card.append(previewBox(fs, path, 'card-preview'))
    const body = el('div', 'card-body')
    const text = el('div', 'card-text')
    const title = el('h3', '', record.name)
    text.append(title, el('p', 'muted small', `${fs.id === tutorialId ? 'Tutorial, ' : ''}edited ${timeAgo(record.updated)}`))
    const continueLabel = el('span', 'project-continue', index === 0 ? 'Continue creating' : 'Open project')
    continueLabel.append(icon('ph-arrow-right'))
    text.append(continueLabel)
    const more = /** @type {HTMLButtonElement} */ (el('button', 'icon-btn'))
    more.type = 'button'
    more.setAttribute('aria-label', `More for ${record.name}`)
    more.append(icon('ph-dots-three'))
    attachMenu(more, [
      [
        'ph-pencil-simple',
        'Rename',
        async () => {
          const name = await askText({ title: 'Rename project', label: 'Name', value: record.name, action: 'Rename' })
          if (!name) return
          await renameBrowserProject(record.id, name)
          await fillProjects(grid, count, folders)
        },
      ],
      [
        'ph-copy',
        'Duplicate',
        async () => {
          /** @type {Record<string, string | Blob>} */
          const files = {}
          for (const e of await fs.list()) if (e.kind === 'file') files[e.path] = await fs.readBlob(e.path)
          for (const [p, b] of Object.entries(files)) {
            const k = fileKind(p)
            if ((k === 'mini' || k === 'text') && b instanceof Blob) files[p] = await b.text()
          }
          await createProject(`${record.name} copy`, files)
          await fillProjects(grid, count, folders)
        },
      ],
      ['ph-file-zip', 'Download zip', async () => void (await saveFile(await projectZip(fs), downloadName(record.name, 'zip')))],
      [
        'ph-trash',
        'Delete',
        async () => {
          const ok = await confirmAction({
            title: 'Delete this project?',
            message: `"${record.name}" and all its files will be gone from ${IS_DESKTOP ? 'this app' : 'this browser'}. Download a zip first if you might want it back.`,
            action: 'Delete',
            danger: true,
          })
          if (!ok) return
          await deleteBrowserProject(record.id)
          await fillProjects(grid, count, folders)
        },
        true,
      ],
    ])
    body.append(text, more)
    card.append(body, link)
    grid.append(card)
  }
  if (list.browser.length === 0 && list.storageWorks) {
    const empty = el('div', 'empty-card')
    const emptyWords = el('div', 'empty-words')
    emptyWords.append(
      el('h3', '', 'Make something that’s yours'),
      el('p', 'muted', 'Your games save as you go. Start with a blank canvas, or learn by making your first platformer.'),
    )
    const actions = el('div', 'empty-actions')
    const create = button('ph-plus', 'Create your first game', 'btn btn-primary')
    create.addEventListener('click', () => void newGame())
    const lesson = /** @type {HTMLAnchorElement} */ (el('a', 'btn btn-ghost', 'Start the tutorial'))
    lesson.href = '#/learn'
    actions.append(create, lesson)
    emptyWords.append(actions)
    empty.append(icon('ph-folder-simple-plus'), emptyWords)
    grid.append(empty)
  }

  folders.replaceChildren()
  folders.hidden = list.folders.length === 0
  if (list.folders.length > 0) {
    folders.append(sectionHead('Your folders', 'Changes save straight into these folders.'))
    const rows = el('div', 'folder-list')
    for (const folder of list.folders) {
      const row = el('div', 'folder-row')
      const open = button('ph-folder-open', folder.name, 'folder-open')
      const where = /** @type {{ root?: string }} */ (folder).root
      if (where) open.title = where
      open.addEventListener('click', async () => {
        if (await folder.ensureAccess()) go({ view: 'project', project: folder.id, file: null })
        else toast(noAccess(folder.name), { tone: 'error' })
      })
      const forget = button('ph-x', 'Forget', 'btn btn-ghost')
      forget.addEventListener('click', async () => {
        await forgetFolder(folder.id)
        await fillProjects(grid, count, folders)
      })
      row.append(open, forget)
      rows.append(row)
    }
    folders.append(rows)
  }
}

export function unmountHome() {
  generation++
  previews.disconnect()
  for (const fn of cleanup) fn()
  cleanup = []
  document.querySelector('.menu')?.remove()
  view.hidden = true
}
