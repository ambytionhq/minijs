// Full-screen play: shared links (#/play/<code>) and showcase demos (#/demo/<name>).

import { compile } from '@minijs/lang'
import { start } from '@minijs/runtime'
import { ProjectAssetLoader } from '../files/project-assets.js'

/** @import { Game } from '@minijs/runtime' */
/** @import { ProjectFs } from '../files/project.js' */

const view = /** @type {HTMLElement} */ (document.getElementById('view-play'))
/** @type {Game | null} */
let game = null

/**
 * @param {{ title: string; fs: ProjectFs; main: string; remixLabel: string; onRemix: () => void }} options
 */
export async function mountPlay({ title, fs, main, remixLabel, onRemix }) {
  await unmountPlay()
  view.hidden = false
  document.title = `${title} | minijs`
  view.innerHTML = `
    <header class="play-bar">
      <a class="btn btn-ghost" href="#/"><i class="ph ph-squares-four" aria-hidden="true"></i>Projects</a>
      <h1 class="play-title"></h1>
      <div class="play-tools">
        <button class="btn btn-ghost" type="button" data-remix><i class="ph ph-code" aria-hidden="true"></i><span></span></button>
        <button class="icon-btn icon-btn-lg" type="button" data-full aria-label="Full screen" title="Full screen"><i class="ph ph-corners-out" aria-hidden="true"></i></button>
      </div>
    </header>
    <div class="play-stage"><canvas tabindex="0" aria-label="Game screen"></canvas></div>
    <p class="play-hint"><i class="ph ph-game-controller" aria-hidden="true"></i>Keyboard, mouse, gamepad or touch.</p>`
  const titleEl = /** @type {HTMLElement} */ (view.querySelector('.play-title'))
  titleEl.textContent = title
  const remix = /** @type {HTMLButtonElement} */ (view.querySelector('[data-remix]'))
  const remixText = /** @type {HTMLElement} */ (remix.querySelector('span'))
  remixText.textContent = remixLabel
  remix.addEventListener('click', onRemix)
  const stageEl = /** @type {HTMLElement} */ (view.querySelector('.play-stage'))
  view.querySelector('[data-full]')?.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void stageEl.requestFullscreen?.()
  })
  const canvas = /** @type {HTMLCanvasElement} */ (view.querySelector('canvas'))
  const { program, errors } = compile(await fs.readText(main))
  if (!program) {
    stageEl.replaceChildren()
    const p = document.createElement('p')
    p.className = 'play-error'
    p.textContent = `This game has a problem on line ${errors[0]?.line}: ${errors[0]?.message}`
    stageEl.append(p)
    return
  }
  stageEl.style.setProperty('--game-aspect', `${program.game.width} / ${program.game.height}`)
  game = await start(program, canvas, { assets: new ProjectAssetLoader(fs, main), keyTarget: window, touchButtons: 'auto' })
  canvas.focus()
}

export async function unmountPlay() {
  game?.destroy()
  game = null
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
  view.replaceChildren()
  view.hidden = true
}
