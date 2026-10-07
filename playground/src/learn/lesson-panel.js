// The tutorial panel that sits where the files usually are. It checks every
// compile against the current step and lights up "Next" when the step is done.

import { loadSetting, saveSetting } from '../storage.js'

/** @import { MiniError, Program } from '@minijs/lang' */
/** @import { Lesson } from './lessons.js' */

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

/** Paragraph where `backticks` become <code>. @param {string} text */
function richText(text) {
  const p = el('p')
  text.split(/(`[^`]+`)/).forEach((part) => {
    if (part.startsWith('`') && part.endsWith('`')) p.append(el('code', '', part.slice(1, -1)))
    else if (part) p.append(part)
  })
  return p
}

/**
 * @param {{
 *   lesson: Lesson
 *   onApply: (apply: (text: string) => string) => void
 *   onFinish: (action: 'keep' | 'showcase' | 'again') => void
 * }} options
 */
export function createLessonPanel({ lesson, onApply, onFinish }) {
  const key = `lesson:${lesson.id}:step`
  let index = Math.min(Number(loadSetting(key) ?? '0') || 0, lesson.steps.length)
  /** @type {{ program: Program | null; errors: MiniError[] } | null} */
  let latest = null
  let done = false
  let checkRun = 0

  const root = el('div', 'lesson')
  const head = el('div', 'lesson-head')
  const kicker = el('p', 'lesson-kicker')
  const progress = el('span', 'lesson-progress')
  kicker.append(el('span', '', lesson.title), progress)
  head.append(kicker)
  const body = el('div', 'lesson-body')
  const status = el('div', 'lesson-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  const nav = el('div', 'lesson-nav')
  const back = /** @type {HTMLButtonElement} */ (el('button', 'btn', 'Back'))
  back.type = 'button'
  const doIt = /** @type {HTMLButtonElement} */ (el('button', 'btn', 'Do it for me'))
  doIt.type = 'button'
  const next = /** @type {HTMLButtonElement} */ (el('button', 'btn btn-primary', 'Next'))
  next.type = 'button'
  nav.append(back, doIt, next)
  root.append(head, body, status, nav)

  function render() {
    saveSetting(key, String(index))
    body.replaceChildren()
    if (index >= lesson.steps.length) {
      progress.textContent = 'Finished'
      body.append(
        el('h2', 'lesson-title', 'You made a game.'),
        richText('It has a hero, gravity, jumping, coins, a score and a way to win. That is a real platformer.'),
        richText('Ideas to try next: change the colors, add a `lives starts at 3` number and some spikes, or use pictures with `looks like "hero.png"`.'),
      )
      const finish = el('div', 'lesson-finish')
      /** @type {Array<[string, 'keep' | 'showcase' | 'again', string]>} */
      const choices = [
        ['Keep it as a project', 'keep', 'btn btn-primary'],
        ['Play the showcase games', 'showcase', 'btn'],
        ['Start the lesson again', 'again', 'link-btn'],
      ]
      for (const [label, action, cls] of choices) {
        const b = /** @type {HTMLButtonElement} */ (el('button', cls, label))
        b.type = 'button'
        b.addEventListener('click', () => onFinish(action))
        finish.append(b)
      }
      body.append(finish)
      status.hidden = true
      nav.hidden = true
      return
    }
    status.hidden = false
    nav.hidden = false
    const step = lesson.steps[index]
    progress.textContent = `Step ${index + 1} of ${lesson.steps.length}`
    body.append(el('h2', 'lesson-title', step.title), ...step.say.map(richText))
    const example = el('figure', 'lesson-example')
    const caption = el('figcaption', '', 'For example')
    const pre = el('pre')
    pre.append(el('code', '', step.example))
    example.append(caption, pre)
    body.append(example)
    back.disabled = index === 0
    void check()
  }

  function setStatus(/** @type {'waiting' | 'done' | 'problem'} */ state, /** @type {string} */ text) {
    status.dataset.state = state
    status.replaceChildren()
    const icon = el('i', `ph ${state === 'done' ? 'ph-check-circle' : state === 'problem' ? 'ph-warning-circle' : 'ph-circle-dashed'}`)
    icon.setAttribute('aria-hidden', 'true')
    status.append(icon, el('span', '', text))
    next.disabled = state !== 'done'
    doIt.hidden = state === 'done'
  }

  async function check() {
    const step = lesson.steps[index]
    if (!step) return
    const run = ++checkRun
    if (!latest) {
      setStatus('waiting', 'Waiting for your game to load.')
      return
    }
    if (!latest.program) {
      setStatus('problem', 'Fix the problems under the game first. Click one to jump to it.')
      return
    }
    const missing = await step.check(latest.program)
    if (run !== checkRun) return
    done = missing === null
    if (done) setStatus('done', 'Done. Nice work.')
    else setStatus('waiting', `Not yet: ${missing}`)
  }

  back.addEventListener('click', () => {
    index = Math.max(0, index - 1)
    render()
  })
  next.addEventListener('click', () => {
    if (!done) return
    index++
    render()
  })
  doIt.addEventListener('click', () => {
    const step = lesson.steps[index]
    if (step) onApply(step.apply)
  })

  render()

  return {
    element: root,
    /** @param {{ program: Program | null; errors: MiniError[] }} result */
    onCompile(result) {
      latest = result
      void check()
    },
    restart() {
      index = 0
      render()
    },
  }
}
