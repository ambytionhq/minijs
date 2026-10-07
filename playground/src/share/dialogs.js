// Share, export and import dialogs.

import { compile } from '@minijs/lang'
import playerSource from 'virtual:minijs-player'
import { fileKind } from '../files/paths.js'
import { createProject } from '../projects/registry.js'
import { go } from '../router.js'
import { openDialog } from '../ui/dialog.js'
import { toast } from '../ui/toast.js'
import { MAX_HTML_BYTES, collectImages, downloadName, exportHtml } from './export-html.js'
import { LONG_CODE, MAX_CODE, decodePack, encodePack, packFiles, packProject, shareLink } from './pack.js'
import { saveFile } from './save-file.js'
import { readZip, stripCommonFolder, writeZip } from './zip.js'

/** @import { ProjectFs } from '../files/project.js' */
/** @import { Pack } from './pack.js' */

/** Where share links point when the Studio isn't on a public web address (desktop app, file://). */
export const PUBLIC_STUDIO_URL = 'https://minijs.ambytion.net/studio/'

function studioBase() {
  const local = location.protocol === 'http:' || location.protocol === 'https:'
  return local ? `${location.origin}${location.pathname}` : PUBLIC_STUDIO_URL
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

/**
 * @param {string} icon
 * @param {string} label
 * @param {string} [className]
 */
function button(icon, label, className = 'btn') {
  const b = /** @type {HTMLButtonElement} */ (el('button', className))
  b.type = 'button'
  b.innerHTML = `<i class="ph ${icon}" aria-hidden="true"></i>`
  b.append(label)
  return b
}

/**
 * @param {string} text
 * @param {HTMLButtonElement} b
 */
async function copy(text, b) {
  try {
    await navigator.clipboard.writeText(text)
    const old = b.lastChild?.textContent
    if (b.lastChild) b.lastChild.textContent = 'Copied'
    setTimeout(() => {
      if (b.lastChild && old) b.lastChild.textContent = old
    }, 1600)
  } catch {
    toast('The browser did not allow copying. Select the text and copy it yourself.', { tone: 'error' })
  }
}

/**
 * @param {{ fs: ProjectFs; runPath: string; name: string }} project
 */
export async function openShareDialog({ fs, runPath, name }) {
  const pack = await packProject(fs, runPath, name)
  const code = await encodePack(pack)
  return openDialog({
    title: 'Share this game',
    description: 'The whole game lives inside the link, so nothing is uploaded anywhere. It also works offline: paste the link or the code into minijs Studio.',
    width: '560px',
    render(body) {
      if (code.length > MAX_CODE) {
        body.append(
          el('p', '', 'This game is too big for a link because of its pictures. Export the project as a zip and send that instead.'),
        )
        return
      }
      /** @param {string} label @param {string} value @param {string} help */
      const row = (label, value, help) => {
        const box = el('div', 'share-row')
        const id = `share-${Math.random().toString(36).slice(2, 7)}`
        const l = /** @type {HTMLLabelElement} */ (el('label', '', label))
        l.htmlFor = id
        const input = /** @type {HTMLInputElement} */ (el('input', 'share-input'))
        input.id = id
        input.readOnly = true
        input.value = value
        input.addEventListener('focus', () => input.select())
        const b = button('ph-copy', 'Copy')
        b.addEventListener('click', () => void copy(value, b))
        const line = el('div', 'share-line')
        line.append(input, b)
        box.append(l, line, el('p', 'muted small', help))
        return box
      }
      body.append(
        row('Play link', shareLink(code, 'play', studioBase()), 'Opens straight into the game.'),
        row('Remix link', shareLink(code, 'open', studioBase()), 'Opens the game with its code, ready to change.'),
        row('Game code', code, 'For pasting into minijs Studio with no internet: Projects, then "Paste a game".'),
      )
      const files = Object.keys(pack.files).length
      const size = code.length < 1000 ? `${code.length} characters` : `${(code.length / 1000).toFixed(1)}k characters`
      const info = el('p', 'muted small', `${files} ${files === 1 ? 'file' : 'files'}, ${size}.`)
      if (code.length > LONG_CODE) info.textContent += ' That is long: some chat apps cut long links, so the zip export may travel better.'
      body.append(info)
    },
  })
}

/**
 * @param {{ fs: ProjectFs; runPath: string; name: string }} project
 */
export function openExportDialog({ fs, runPath, name }) {
  return openDialog({
    title: 'Export',
    width: '560px',
    render(body, close) {
      /** @param {string} icon @param {string} title @param {string} text @param {string} action @param {() => Promise<void>} fn */
      const option = (icon, title, text, action, fn) => {
        const card = el('div', 'export-option')
        const i = el('i', `ph ${icon}`)
        i.setAttribute('aria-hidden', 'true')
        const words = el('div', 'export-words')
        words.append(el('h3', '', title), el('p', 'muted small', text))
        const b = button('ph-download-simple', action, 'btn btn-primary')
        b.addEventListener('click', async () => {
          b.disabled = true
          try {
            await fn()
            close()
          } catch (error) {
            toast(error instanceof Error ? error.message : String(error), { tone: 'error' })
          } finally {
            b.disabled = false
          }
        })
        card.append(i, words, b)
        return card
      }
      body.append(
        option(
          'ph-globe-simple',
          'Game as one file',
          'A single .html file that plays in any browser, even with no internet. Send it to anyone.',
          'Download',
          async () => {
            const { program } = compile(await fs.readText(runPath))
            if (!program) throw new Error('Fix the problems in the game before exporting it.')
            const images = await collectImages(fs, runPath, program)
            const html = exportHtml({ title: name, program, images, playerSource })
            if (html.length > MAX_HTML_BYTES) throw new Error('This game is too big to export as one file. Try smaller pictures.')
            await saveFile(new Blob([html], { type: 'text/html' }), downloadName(name, 'html'))
          },
        ),
        option(
          'ph-file-zip',
          'Whole project',
          'Every file in a .zip, to back up, move to another computer, or open again with "Import".',
          'Download',
          async () => {
            /** @type {Record<string, string | Blob>} */
            const files = {}
            for (const entry of await fs.list()) {
              if (entry.kind !== 'file') continue
              const kind = fileKind(entry.path)
              files[entry.path] = kind === 'mini' || kind === 'text' ? await fs.readText(entry.path) : await fs.readBlob(entry.path)
            }
            await saveFile(await writeZip(files), downloadName(name, 'zip'))
          },
        ),
      )
    },
  })
}

/**
 * Save a shared game as a new project and open it.
 * @param {Pack} pack
 */
export async function savePack(pack) {
  const project = await createProject(pack.name, packFiles(pack))
  go({ view: 'project', project: project.id, file: pack.main })
}

/** Paste a link or code from someone else. */
export function openPasteDialog() {
  return openDialog({
    title: 'Paste a game',
    description: 'Paste a minijs link or game code. This works without internet.',
    width: '560px',
    render(body, close) {
      const form = el('form', 'form')
      const id = 'paste-input'
      const label = /** @type {HTMLLabelElement} */ (el('label', '', 'Link or code'))
      label.htmlFor = id
      const area = /** @type {HTMLTextAreaElement} */ (el('textarea', 'paste-area'))
      area.id = id
      area.rows = 4
      area.spellcheck = false
      const error = el('p', 'form-error')
      error.setAttribute('role', 'alert')
      const found = el('div', 'paste-found')
      found.hidden = true
      form.append(label, area, error, found)
      body.append(form)

      /** @type {Pack | null} */
      let pack = null
      const read = async () => {
        error.textContent = ''
        found.hidden = true
        pack = null
        if (!area.value.trim()) return
        pack = await decodePack(area.value)
        if (!pack) {
          error.textContent = 'This link or code is broken or cut off. Ask for it again, or copy the whole thing.'
          return
        }
        const p = pack
        found.replaceChildren()
        const files = Object.keys(p.files).length
        found.append(el('p', '', `${p.name}, ${files} ${files === 1 ? 'file' : 'files'}.`))
        const actions = el('div', 'dialog-actions')
        const play = button('ph-play', 'Play')
        play.addEventListener('click', async () => {
          close()
          go({ view: 'play', code: /** @type {string} */ (await encodePack(p)) })
        })
        const keep = button('ph-floppy-disk', 'Save as a project', 'btn btn-primary')
        keep.addEventListener('click', async () => {
          close()
          await savePack(p)
        })
        actions.append(play, keep)
        found.append(actions)
        found.hidden = false
      }
      area.addEventListener('input', () => void read())
      form.addEventListener('submit', (e) => e.preventDefault())
    },
  })
}

/**
 * Turn a .zip from "Export" (or any folder zipped up) into a project.
 * @param {File} file
 */
export async function importZip(file) {
  const raw = stripCommonFolder(await readZip(file))
  /** @type {Record<string, string | Blob>} */
  const files = {}
  const decoder = new TextDecoder()
  for (const [path, bytes] of Object.entries(raw)) {
    const kind = fileKind(path)
    files[path] = kind === 'mini' || kind === 'text' ? decoder.decode(bytes) : new Blob([bytes])
  }
  if (!Object.keys(files).some((p) => fileKind(p) === 'mini')) {
    throw new Error('There is no game file (.mini) in that zip.')
  }
  const name = file.name.replace(/\.zip$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imported game'
  const project = await createProject(name, files)
  go({ view: 'project', project: project.id, file: null })
}
