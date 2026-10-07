// Modal dialogs on the native <dialog> element: Escape closes, focus returns to
// what opened it, and the page behind can't be clicked.

/**
 * @typedef {object} DialogOptions
 * @property {string} title
 * @property {string} [description]
 * @property {(body: HTMLElement, close: (value?: unknown) => void) => void} render fills the body
 * @property {string} [width] CSS width, default 480px
 */

/**
 * Open a dialog. Resolves with the value passed to close(), or undefined when dismissed.
 * @param {DialogOptions} options
 * @returns {Promise<unknown>}
 */
export function openDialog({ title, description, render, width = '480px' }) {
  const opener = /** @type {HTMLElement | null} */ (document.activeElement)
  const dialog = document.createElement('dialog')
  dialog.className = 'dialog'
  dialog.style.setProperty('--dialog-width', width)
  const head = document.createElement('div')
  head.className = 'dialog-head'
  const h = document.createElement('h2')
  h.id = `dialog-title-${Math.random().toString(36).slice(2, 8)}`
  h.textContent = title
  dialog.setAttribute('aria-labelledby', h.id)
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'icon-btn'
  closeButton.setAttribute('aria-label', 'Close')
  closeButton.innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>'
  head.append(h, closeButton)
  dialog.append(head)
  if (description) {
    const p = document.createElement('p')
    p.className = 'dialog-description'
    p.textContent = description
    dialog.append(p)
  }
  const body = document.createElement('div')
  body.className = 'dialog-body'
  dialog.append(body)
  document.body.append(dialog)

  return new Promise((resolve) => {
    /** @type {unknown} */
    let result
    const close = (/** @type {unknown} */ value) => {
      result = value
      dialog.close()
    }
    dialog.addEventListener('close', () => {
      dialog.remove()
      opener?.focus?.()
      resolve(result)
    })
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close()
    })
    closeButton.addEventListener('click', () => close())
    render(body, close)
    dialog.showModal()
    const first = /** @type {HTMLElement | null} */ (body.querySelector('input, textarea, select, button.btn-primary'))
    first?.focus()
  })
}

/**
 * Ask for a short piece of text, like a name. Resolves null when cancelled.
 * @param {{ title: string; label: string; value?: string; action: string; validate?: (v: string) => string | null }} options
 * @returns {Promise<string | null>}
 */
export async function askText({ title, label, value = '', action, validate }) {
  const result = await openDialog({
    title,
    render(body, close) {
      const form = document.createElement('form')
      form.className = 'form'
      const id = `ask-${Math.random().toString(36).slice(2, 8)}`
      form.innerHTML = `<label for="${id}">${label}</label><input id="${id}" autocomplete="off" spellcheck="false"><p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">${action}</button></div>`
      const input = /** @type {HTMLInputElement} */ (form.querySelector('input'))
      const error = /** @type {HTMLElement} */ (form.querySelector('.form-error'))
      input.value = value
      input.select()
      form.querySelector('[data-cancel]')?.addEventListener('click', () => close(null))
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        const v = input.value.trim()
        const problem = v === '' ? 'Type a name first.' : (validate?.(v) ?? null)
        if (problem) {
          error.textContent = problem
          input.setAttribute('aria-invalid', 'true')
          return
        }
        close(v)
      })
      body.append(form)
    },
  })
  return typeof result === 'string' ? result : null
}

/**
 * Yes or no. Resolves true only when confirmed.
 * @param {{ title: string; message: string; action: string; danger?: boolean }} options
 */
export async function confirmAction({ title, message, action, danger = false }) {
  const result = await openDialog({
    title,
    render(body, close) {
      const p = document.createElement('p')
      p.textContent = message
      const actions = document.createElement('div')
      actions.className = 'dialog-actions'
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'btn'
      cancel.textContent = 'Cancel'
      cancel.addEventListener('click', () => close(false))
      const ok = document.createElement('button')
      ok.type = 'button'
      ok.className = danger ? 'btn btn-danger' : 'btn btn-primary'
      ok.textContent = action
      ok.addEventListener('click', () => close(true))
      actions.append(cancel, ok)
      body.append(p, actions)
    },
  })
  return result === true
}
