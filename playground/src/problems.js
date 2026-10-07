// The Problems list under the game. Copy comes straight from MiniError message and hint.

/** @import { MiniError } from '@minijs/lang' */

/**
 * @param {HTMLUListElement} list
 * @param {HTMLElement} empty shown when there are no problems
 * @param {MiniError[]} problems
 * @param {(problem: MiniError) => void} onPick
 */
export function renderProblems(list, empty, problems, onPick) {
  list.replaceChildren(
    ...problems.map((problem) => {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'problem'

      const icon = document.createElement('i')
      icon.className = 'ph ph-warning-circle'
      icon.setAttribute('aria-hidden', 'true')

      const where = document.createElement('span')
      where.className = 'where'
      where.textContent = `Line ${problem.line}`

      const message = document.createElement('span')
      message.className = 'message'
      message.textContent = problem.message

      button.append(icon, where, message)
      if (problem.hint) {
        const hint = document.createElement('span')
        hint.className = 'problem-hint'
        hint.textContent = problem.hint
        button.append(hint)
      }
      button.addEventListener('click', () => onPick(problem))
      item.append(button)
      return item
    }),
  )
  empty.hidden = problems.length > 0
}
