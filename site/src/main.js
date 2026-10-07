// minijs.ambytion.net: reveals, the download button for the visitor's system,
// and the live "Try it here" editor (the real compiler and engine).

import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import '@fontsource/geist-sans/700.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import '@phosphor-icons/web/light'
import './styles.css'

import { compile } from '@minijs/lang'
import { start } from '@minijs/runtime'
import { DEMO_SOURCE } from './demo-source.js'

/** @import { Game } from '@minijs/runtime' */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

// Entry reveals: each `.reveal` settles once, when it is 15% on screen.
function startReveals() {
  const items = document.querySelectorAll('.reveal')
  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    for (const item of items) item.classList.add('is-in')
    return
  }
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-in')
        seen.unobserve(entry.target)
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
  )
  for (const item of items) seen.observe(item)
}

/** @returns {'mac' | 'windows' | 'linux' | null} */
function visitorSystem() {
  const nav = /** @type {Navigator & { userAgentData?: { platform?: string } }} */ (navigator)
  const platform = (nav.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase()
  if (/iphone|ipad|android/.test(navigator.userAgent.toLowerCase())) return null
  if (platform.includes('mac')) return 'mac'
  if (platform.includes('win')) return 'windows'
  if (platform.includes('linux')) return 'linux'
  return null
}

const SYSTEM_NAMES = { mac: 'Mac', windows: 'Windows', linux: 'Linux' }

// Download buttons say which system they are for.
function labelDownloads() {
  const system = visitorSystem()
  const heroLabel = document.querySelector('[data-download-label]')
  const main = document.getElementById('download-main')
  const others = document.getElementById('download-others')
  if (!system) return
  const name = SYSTEM_NAMES[system]
  if (heroLabel) heroLabel.textContent = `Download for ${name}`
  const mainText = main?.querySelector('span')
  if (mainText) mainText.textContent = `Download for ${name}`
  if (!others) return
  const rest = Object.entries(SYSTEM_NAMES).filter(([key]) => key !== system)
  const link = (label) => `<a href="https://github.com/ambytionhq/minijs-releases/releases/latest">${label}</a>`
  others.innerHTML = `Also for ${link(rest[0][1])} and ${link(rest[1][1])}. Free, about 4 MB, and it updates itself.`
}

// The live editor.
function startTryIt() {
  const area = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('try-source'))
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('try-canvas'))
  const status = document.getElementById('try-status')
  const reset = document.getElementById('try-reset')
  if (!area || !canvas || !status || !reset) return

  /** @type {Game | null} */
  let game = null
  let timer = 0
  let runId = 0
  let lastGood = ''

  /** @param {'ok' | 'problem' | 'idle'} tone @param {string} text */
  const say = (tone, text) => {
    status.dataset.tone = tone
    const icon = tone === 'ok' ? 'ph-check-circle' : tone === 'problem' ? 'ph-warning-circle' : 'ph-circle-notch'
    status.innerHTML = `<i class="ph-light ${icon}" aria-hidden="true"></i><span></span>`
    const span = status.querySelector('span')
    if (span) span.textContent = text
  }

  const run = async () => {
    const source = area.value
    const { program, errors } = compile(source)
    if (!program) {
      const first = errors[0]
      const hint = first?.hint ? ` ${first.hint}` : ''
      say('problem', first ? `Line ${first.line}: ${first.message}${hint}` : 'Something is not quite right.')
      return
    }
    if (source === lastGood && game) {
      say('ok', 'Running. Your game is up to date.')
      return
    }
    const id = ++runId
    const hadFocus = document.activeElement === canvas
    game?.destroy()
    game = null
    const next = await start(program, canvas, { keyTarget: canvas, touchButtons: 'never' })
    if (id !== runId) {
      next.destroy()
      return
    }
    game = next
    lastGood = source
    if (hadFocus) canvas.focus()
    say('ok', 'Running. Change something and watch.')
  }

  const schedule = () => {
    window.clearTimeout(timer)
    say('idle', 'Reading your rules')
    timer = window.setTimeout(() => void run().catch((e) => say('problem', String(e?.message ?? e))), 250)
  }

  area.value = DEMO_SOURCE
  area.addEventListener('input', schedule)
  // Tab indents (two spaces) instead of leaving the editor; Shift+Tab still moves focus.
  area.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.shiftKey) return
    event.preventDefault()
    const { selectionStart: a, selectionEnd: b, value } = area
    area.value = `${value.slice(0, a)}  ${value.slice(b)}`
    area.selectionStart = area.selectionEnd = a + 2
    schedule()
  })
  reset.addEventListener('click', () => {
    area.value = DEMO_SOURCE
    lastGood = ''
    schedule()
  })
  // Arrow keys move the player, not the page, while the game has focus.
  canvas.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault()
  })
  canvas.addEventListener('pointerdown', () => canvas.focus())

  // Only start the engine once the editor is near the screen.
  const section = document.getElementById('language')
  if (!section || !('IntersectionObserver' in window)) {
    void run()
    return
  }
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      near.disconnect()
      void run().catch((e) => say('problem', String(e?.message ?? e)))
    },
    { rootMargin: '400px 0px' },
  )
  near.observe(section)
}

startReveals()
labelDownloads()
startTryIt()
