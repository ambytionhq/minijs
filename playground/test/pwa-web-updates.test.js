import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/desktop/env.js', () => ({ IS_DESKTOP: false }))
let pwa
let workerEvents
let serviceEvents
let registration
let reload

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubEnv('DEV', false)
  workerEvents = {}
  serviceEvents = {}
  reload = vi.fn()
  registration = {
    waiting: null,
    installing: { state: 'installing', addEventListener: (event, fn) => { workerEvents[event] = fn } },
    update: vi.fn().mockResolvedValue(),
    addEventListener: (event, fn) => { workerEvents[event] = fn },
  }
  vi.stubGlobal('window', { setInterval, setTimeout })
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn() })
  vi.stubGlobal('location', { reload })
  vi.stubGlobal('navigator', {
    serviceWorker: {
      controller: null,
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: (event, fn) => { serviceEvents[event] = fn },
    },
  })
  pwa = await import('../src/pwa.js')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('web update acceptance', () => {
  it('does not reload or interrupt work when offline support first activates', async () => {
    await pwa.startOffline()
    serviceEvents.controllerchange()
    expect(reload).not.toHaveBeenCalled()
    workerEvents.updatefound()
    registration.installing.state = 'installed'
    workerEvents.statechange()
    serviceEvents.controllerchange()
    expect(reload).not.toHaveBeenCalled()
  })

  it('activates a waiting worker and reloads once only after acceptance', async () => {
    const postMessage = vi.fn()
    registration.waiting = { postMessage }
    await pwa.startOffline()
    serviceEvents.controllerchange()
    expect(reload).not.toHaveBeenCalled()
    await pwa.applyUpdate()
    expect(postMessage).toHaveBeenCalledWith('skip-waiting')
    serviceEvents.controllerchange()
    serviceEvents.controllerchange()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads an accepted update already activated in another tab', async () => {
    await pwa.startOffline()
    await pwa.applyUpdate()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not silently accept an update before registration succeeds', async () => {
    await expect(pwa.applyUpdate()).rejects.toThrow('Offline updates are not available yet')
    expect(reload).not.toHaveBeenCalled()
  })

  it('registers offline support and background timers only once', async () => {
    await pwa.startOffline()
    await pwa.startOffline()
    expect(navigator.serviceWorker.register).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(1)
  })
})
