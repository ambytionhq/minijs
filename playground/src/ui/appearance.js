import { loadSetting, saveSetting } from '../storage.js'

const system = window.matchMedia('(prefers-color-scheme: dark)')
const choices = ['system', 'light', 'dark']
let preference = loadSetting('appearance') ?? 'system'
try {
  preference = localStorage.getItem('minijs-site-theme') ?? preference
} catch {}
if (!choices.includes(preference)) preference = 'system'

function apply() {
  const root = document.documentElement
  if (preference === 'system') delete root.dataset.theme
  else root.dataset.theme = preference
  const dark = preference === 'dark' || (preference === 'system' && system.matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', dark ? '#171918' : '#f6f7f4')
    meta.removeAttribute('media')
  })
  document.querySelectorAll('[data-appearance]').forEach((select) => {
    select.value = preference
  })
}

export function startAppearance() {
  apply()
  system.addEventListener('change', apply)
  window.addEventListener('storage', (event) => {
    if (event.key !== 'minijs-site-theme') return
    preference = choices.includes(event.newValue) ? event.newValue : 'system'
    apply()
  })
  document.addEventListener('change', (event) => {
    const select = event.target
    if (!(select instanceof HTMLSelectElement) || !select.hasAttribute('data-appearance')) return
    if (!choices.includes(select.value)) return
    preference = select.value
    saveSetting('appearance', preference)
    try { localStorage.setItem('minijs-site-theme', preference) } catch {}
    apply()
  })
}

export function appearanceControl() {
  const label = document.createElement('label')
  label.className = 'appearance-control'
  const icon = document.createElement('i')
  icon.className = 'ph ph-palette'
  icon.setAttribute('aria-hidden', 'true')
  const select = document.createElement('select')
  select.setAttribute('data-appearance', '')
  select.setAttribute('aria-label', 'Appearance')
  for (const value of choices) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = `${value[0].toUpperCase()}${value.slice(1)}`
    select.append(option)
  }
  select.value = preference
  const arrow = document.createElement('i')
  arrow.className = 'ph ph-caret-down appearance-arrow'
  arrow.setAttribute('aria-hidden', 'true')
  label.append(icon, select, arrow)
  return label
}
