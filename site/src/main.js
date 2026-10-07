import '@fontsource/geist-sans/latin-400.css'
import '@fontsource/geist-sans/latin-500.css'
import '@fontsource/geist-mono/latin-400.css'
import '@fontsource/geist-mono/latin-500.css'
import './icons.css'
import './styles.css'

import { DEMO_SOURCE } from './demo-source.js'

/** @import { Game } from '@minijs/runtime' */
const cleanups = []
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
let animateGallery = null

function startAppearance() {
  const select = document.getElementById('theme-select')
  const toggle = document.getElementById('theme-toggle')
  let preference = document.documentElement.dataset.theme || 'system'

  const apply = () => {
    const dark = preference === 'dark' || (preference === 'system' && systemTheme.matches)
    if (preference === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = preference
    select.value = preference
    toggle.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} appearance`)
    document.querySelectorAll('[data-theme-shot]').forEach((img) => {
      img.src = `/shots/studio-${img.dataset.themeShot}-${dark ? 'dark' : 'light'}.webp`
      img.closest('picture')?.querySelector('source')?.setAttribute('media', 'not all')
    })
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.content = dark ? '#171918' : '#f6f7f4'
      meta.removeAttribute('media')
    })
  }
  const choose = (value) => {
    preference = value
    try {
      if (value === 'system') localStorage.removeItem('minijs-site-theme')
      else localStorage.setItem('minijs-site-theme', value)
    } catch {}
    apply()
  }
  select.addEventListener('change', () => choose(select.value))
  toggle.addEventListener('click', () => {
    const dark = preference === 'dark' || (preference === 'system' && systemTheme.matches)
    choose(dark ? 'light' : 'dark')
  })
  systemTheme.addEventListener('change', apply)
  cleanups.push(() => systemTheme.removeEventListener('change', apply))
  apply()
}

async function startMotion() {
  if (reduceMotion.matches) return
  const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
  gsap.registerPlugin(ScrollTrigger)
  animateGallery = (image) => gsap.fromTo(image, { opacity: .4, scale: 1.025 }, { opacity: 1, scale: 1, duration: .5, ease: 'power3.out', clearProps: 'transform,opacity' })
  const media = gsap.matchMedia()
  media.add('(prefers-reduced-motion: no-preference)', () => {
    document.querySelectorAll('.reveal').forEach((item) => {
      const rect = item.getBoundingClientRect()
      if (rect.top < window.innerHeight && rect.bottom > 0) return
      gsap.from(item, {
        y: 24, opacity: 0, duration: .8, ease: 'power3.out', clearProps: 'transform,opacity',
        scrollTrigger: { trigger: item, start: 'top 93%', once: true },
      })
    })
    document.querySelectorAll('.studio-shot').forEach((shot) => {
      // Each screenshot grows into focus as its part of the Studio story arrives.
      gsap.fromTo(shot, { scale: .92 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: shot, start: 'top bottom', end: 'top 35%', scrub: .6 },
      })
      gsap.to(shot, {
        opacity: .35, ease: 'none',
        scrollTrigger: { trigger: shot, start: 'bottom 10%', end: 'bottom top', scrub: .6 },
      })
    })
  })
  media.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
    // The explanation remains readable while the two real product views pass it.
    ScrollTrigger.create({
      trigger: '.studio-layout', start: 'top top',
      end: () => `+=${Math.max(0, document.querySelector('.studio-gallery').offsetHeight - document.querySelector('.studio-copy').offsetHeight)}`,
      pin: '.studio-copy', pinSpacing: false, invalidateOnRefresh: true,
    })
  })
  const refresh = () => ScrollTrigger.refresh()
  window.addEventListener('load', refresh, { once: true })
  void document.fonts.ready.then(refresh)
  cleanups.push(() => { media.revert(); window.removeEventListener('load', refresh) })
}

function startNavigation() {
  if (!('IntersectionObserver' in window)) return
  const links = [...document.querySelectorAll('.nav-links a')]
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      links.forEach((link) => {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location')
        else link.removeAttribute('aria-current')
      })
    }
  }, { rootMargin: '-20% 0px -55% 0px', threshold: 0 })
  links.forEach((link) => { const section = document.querySelector(link.hash); if (section) observer.observe(section) })
  cleanups.push(() => observer.disconnect())
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

function labelDownloads() {
  const system = visitorSystem()
  if (!system) return
  const systems = { mac: 'Mac', windows: 'Windows', linux: 'Linux' }
  document.querySelector('[data-download-label]').textContent = `Download for ${systems[system]}`
  document.querySelector('#download-main span').textContent = `Download for ${systems[system]}`
  const others = document.getElementById('download-others')
  const rest = Object.entries(systems).filter(([key]) => key !== system)
  const link = (label) => `<a href="https://github.com/ambytionhq/minijs-releases/releases/latest">${label}</a>`
  others.innerHTML = `Also for ${link(rest[0][1])} and ${link(rest[1][1])}. Free, about 4&nbsp;MB, and it updates itself.`
}

function startHeroPlayer() {
  const play = document.getElementById('hero-play')
  const close = document.getElementById('hero-close')
  const player = document.getElementById('hero-player')
  const embed = document.getElementById('hero-embed')
  const status = document.getElementById('hero-player-status')
  let loadTimeout = 0
  const help = status.innerHTML
  const stop = () => {
    window.clearTimeout(loadTimeout)
    embed.replaceChildren()
    player.hidden = true
    play.hidden = false
    status.innerHTML = help
    play.focus({ preventScroll: true })
  }
  play.addEventListener('click', () => {
    const iframe = document.createElement('iframe')
    iframe.title = 'Cloud Hopper. Click the game, then use arrow keys to move and space to jump.'
    iframe.allow = 'gamepad; fullscreen'
    iframe.src = '/play/cloud-hopper.html'
    player.hidden = false
    play.hidden = true
    status.textContent = 'Loading Cloud Hopper…'
    iframe.addEventListener('load', () => {
      window.clearTimeout(loadTimeout)
      status.innerHTML = help
    }, { once: true })
    embed.replaceChildren(iframe)
    close.focus({ preventScroll: true })
    loadTimeout = window.setTimeout(() => {
      status.replaceChildren(document.createTextNode('Taking a while? '))
      const link = document.createElement('a')
      link.href = '/play/cloud-hopper.html'
      link.textContent = 'Open full game'
      status.append(link)
    }, 8000)
  })
  close.addEventListener('click', stop)
  player.addEventListener('keydown', (event) => { if (event.key === 'Escape') stop() })
  cleanups.push(() => { window.clearTimeout(loadTimeout); embed.replaceChildren() })
}

function startGameGallery() {
  const cards = [...document.querySelectorAll('.game-card')]
  const announcement = document.getElementById('game-announcement')
  let current = 0
  const feature = (index) => {
    current = (index + cards.length) % cards.length
    cards.forEach((card, i) => {
      card.classList.toggle('is-featured', i === current)
    })
    if (!reduceMotion.matches) animateGallery?.(cards[current].querySelector('img'))
    announcement.textContent = `${cards[current].querySelector('h3').textContent} is featured.`
  }
  document.getElementById('game-prev').addEventListener('click', () => feature(current - 1))
  document.getElementById('game-next').addEventListener('click', () => feature(current + 1))
}

function startRuleMarquee() {
  const toggle = document.getElementById('marquee-toggle')
  const track = document.getElementById('marquee-track')
  let paused = false
  const apply = () => {
    const stopped = paused || reduceMotion.matches
    track.classList.toggle('is-paused', stopped)
    toggle.disabled = reduceMotion.matches
    toggle.setAttribute('aria-pressed', String(stopped))
    toggle.setAttribute('aria-label', stopped ? 'Resume moving rules' : 'Pause moving rules')
    toggle.querySelector('i').className = `ph-light ${stopped ? 'ph-play' : 'ph-pause'}`
  }
  toggle.addEventListener('click', () => { paused = !paused; apply() })
  reduceMotion.addEventListener('change', apply)
  cleanups.push(() => reduceMotion.removeEventListener('change', apply))
  apply()
}

function startTryIt() {
  const area = /** @type {HTMLTextAreaElement} */ (document.getElementById('try-source'))
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('try-canvas'))
  const highlight = document.querySelector('#try-highlight code')
  const status = document.getElementById('try-status')
  const speedButton = document.getElementById('try-speed')
  const colorButton = document.getElementById('try-color')
  if (navigator.maxTouchPoints > 0) document.querySelector('.try-hint').lastChild.textContent = 'Use the on-screen arrows to collect the gem.'
  /** @type {Game | null} */
  let game = null
  let timer = 0
  let revision = 0
  let lastGood = ''
  let active = false
  let disposed = false

  const escape = (text) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  const paint = () => {
    highlight.innerHTML = area.value.split('\n').map((line) => {
      if (line.trimStart().startsWith('#')) return `<span class="code-comment">${escape(line)}</span>`
      return line.split(/("[^"\n]*"|#[a-fA-F0-9]{3,6}\b|\b\d+\b|\b(?:game|thing|when|always|looks like|starts at|starts|make|move|add|remove|show|background|size)\b)/g).map((token) => {
        const text = escape(token)
        if (/^("|#|\d)/.test(token)) return `<span class="code-value">${text}</span>`
        if (/^(game|thing|when|always|looks like|starts at|starts|make|move|add|remove|show|background|size)$/.test(token)) return `<span class="code-keyword">${text}</span>`
        return text
      }).join('')
    }).join('\n') + '\n'
    highlight.style.transform = `translate(${-area.scrollLeft}px, ${-area.scrollTop}px)`
    speedButton.setAttribute('aria-pressed', String(/move player (?:left|right|up|down) 4\b/.test(area.value)))
    colorButton.setAttribute('aria-pressed', String(area.value.includes('looks like #f0f2e9 box')))
  }
  const say = (tone, text) => {
    status.dataset.tone = tone
    area.setAttribute('aria-invalid', String(tone === 'problem'))
    status.replaceChildren()
    const icon = document.createElement('i')
    icon.className = `ph-light ${tone === 'ok' ? 'ph-check-circle' : tone === 'problem' ? 'ph-warning-circle' : 'ph-pencil-simple'}`
    icon.setAttribute('aria-hidden', 'true')
    const message = document.createElement('span')
    message.textContent = text
    status.append(icon, message)
  }
  const run = async (id) => {
    if (disposed || id !== revision) return
    const source = area.value
    if (!source.trim()) { say('problem', 'Write a rule to begin, or choose Start over.'); return }
    const [{ compile }, { start }] = await Promise.all([import('@minijs/lang'), import('@minijs/runtime')])
    if (disposed || id !== revision) return
    const { program, errors } = compile(source)
    if (!program) {
      const first = errors[0]
      say('problem', first ? `Line ${first.line}: ${first.message}${first.hint ? ` ${first.hint}` : ''}` : 'Check your rules or choose Start over.')
      return
    }
    if (source === lastGood && game) { say('ok', 'Running. Your game is up to date.'); return }
    const hadFocus = document.activeElement === canvas
    game?.destroy()
    game = null
    const next = await start(program, canvas, { keyTarget: canvas, touchButtons: 'auto' })
    if (disposed || id !== revision) { next.destroy(); return }
    game = next
    lastGood = source
    if (hadFocus) canvas.focus({ preventScroll: true })
    say('ok', 'Running. Change a rule and watch.')
  }
  const schedule = () => {
    window.clearTimeout(timer)
    const id = ++revision
    paint()
    if (!active) return
    say('idle', 'Reading your rules…')
    timer = window.setTimeout(() => void run(id).catch((error) => {
      if (id === revision && !disposed) say('problem', `${error?.message || 'Could not start the game.'} Choose Start over to try again.`)
    }), 250)
  }
  area.value = DEMO_SOURCE
  paint()
  area.addEventListener('input', schedule)
  area.addEventListener('scroll', () => { highlight.style.transform = `translate(${-area.scrollLeft}px, ${-area.scrollTop}px)` })
  // Native Tab navigation keeps the editor easy to leave with a keyboard.
  area.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    const { selectionStart: a, selectionEnd: b, value } = area
    area.value = `${value.slice(0, a)}  ${value.slice(b)}`
    area.selectionStart = area.selectionEnd = a + 2
    schedule()
  })
  document.getElementById('try-reset').addEventListener('click', () => { area.value = DEMO_SOURCE; lastGood = ''; schedule() })
  speedButton.addEventListener('click', () => {
    const fast = speedButton.getAttribute('aria-pressed') === 'true'
    area.value = area.value.replace(/(move player (?:left|right|up|down)) \d+/g, `$1 ${fast ? '2' : '4'}`)
    schedule()
  })
  colorButton.addEventListener('click', () => {
    const white = colorButton.getAttribute('aria-pressed') === 'true'
    area.value = area.value.replace(/(looks like )#[a-fA-F0-9]{3,6}( box)/, `$1${white ? '#e6c554' : '#f0f2e9'}$2`)
    schedule()
  })
  canvas.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault()
  })
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }))

  const near = new IntersectionObserver((entries) => {
    const visible = entries.some((entry) => entry.isIntersecting)
    if (visible) {
      if (!active) {
        active = true
        schedule()
      }
    } else if (active) {
      active = false
      revision++
      window.clearTimeout(timer)
      game?.destroy()
      game = null
    }
  }, { rootMargin: '120px 0px' })
  near.observe(document.querySelector('.try-panel'))
  cleanups.push(() => { disposed = true; revision++; window.clearTimeout(timer); near.disconnect(); game?.destroy() })
}

startAppearance()
labelDownloads()
startHeroPlayer()
startGameGallery()
startRuleMarquee()
startTryIt()
startNavigation()
const motionObserver = new IntersectionObserver((entries) => {
  if (!entries.some((entry) => entry.isIntersecting)) return
  motionObserver.disconnect()
  void startMotion()
})
document.querySelectorAll('.section-head, .studio-layout, .download-panel').forEach((section) => motionObserver.observe(section))
cleanups.push(() => motionObserver.disconnect())

if (import.meta.hot) import.meta.hot.dispose(() => { cleanups.forEach((cleanup) => cleanup()) })
