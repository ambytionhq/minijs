// Short messages at the bottom of the screen, with an optional action (like Undo).

const region = document.createElement('div')
region.className = 'toasts'
region.setAttribute('role', 'status')
region.setAttribute('aria-live', 'polite')
document.body.append(region)

/**
 * @param {string} message
 * @param {{ action?: string; onAction?: () => void; seconds?: number; tone?: 'info' | 'error' }} [options]
 */
export function toast(message, { action, onAction, seconds = 5, tone = 'info' } = {}) {
  const item = document.createElement('div')
  item.className = `toast toast-${tone}`
  const text = document.createElement('span')
  text.textContent = message
  item.append(text)
  if (action && onAction) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'toast-action'
    button.textContent = action
    button.addEventListener('click', () => {
      onAction()
      item.remove()
    })
    item.append(button)
  }
  region.append(item)
  window.setTimeout(() => item.remove(), seconds * 1000)
}
