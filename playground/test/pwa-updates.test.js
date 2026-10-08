import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { findUpdate, installUpdate } = vi.hoisted(() => ({ findUpdate: vi.fn(), installUpdate: vi.fn() }))
vi.mock('../src/desktop/env.js', () => ({ IS_DESKTOP: true }))
vi.mock('../src/desktop/updates.js', () => ({ findUpdate, installUpdate }))
let pwa
let state

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  pwa = await import('../src/pwa.js')
  pwa.onUpdateState((value) => { state = value })
})
afterEach(() => vi.unstubAllGlobals())

describe('desktop update state', () => {
  it('deduplicates checks and reports a real check failure', async () => {
    findUpdate.mockRejectedValue(new Error('Network unavailable'))
    const a = pwa.checkForUpdates()
    const b = pwa.checkForUpdates()
    expect(a).toBe(b)
    await expect(a).resolves.toBe('failed')
    expect(findUpdate).toHaveBeenCalledOnce()
    expect(state).toBe('error')
  })

  it('recovers from an offline check and clears stale version information', async () => {
    findUpdate.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ version: '0.2.0' }).mockResolvedValueOnce(null)
    await pwa.checkForUpdates()
    await expect(pwa.checkForUpdates()).resolves.toBe('found')
    expect(state).toBe('update-ready')
    expect(pwa.updateVersion).toBe('0.2.0')
    await expect(pwa.checkForUpdates()).resolves.toBe('newest')
    expect(state).toBe('offline-ready')
    expect(pwa.updateVersion).toBe('')
  })

  it('retains the ready state after a failed installation for retry', async () => {
    findUpdate.mockResolvedValue({ version: '0.2.0' })
    installUpdate.mockRejectedValueOnce(new Error('Download failed')).mockResolvedValueOnce()
    await pwa.checkForUpdates()
    await expect(pwa.applyUpdate()).rejects.toThrow('Download failed')
    expect(state).toBe('update-ready')
    await pwa.applyUpdate()
    expect(installUpdate).toHaveBeenCalledTimes(2)
  })

  it('keeps automatic checks from interfering with an installation', async () => {
    findUpdate.mockResolvedValue({ version: '0.2.0' })
    let finish
    installUpdate.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await pwa.checkForUpdates()
    const install = pwa.applyUpdate()
    await vi.waitFor(() => expect(state).toBe('downloading'))
    await expect(pwa.checkForUpdates()).resolves.toBe('found')
    expect(findUpdate).toHaveBeenCalledOnce()
    finish()
    await install
  })

  it('refuses installation before an update has been checked', async () => {
    await expect(pwa.applyUpdate()).rejects.toThrow('Check for updates')
    expect(installUpdate).not.toHaveBeenCalled()
  })
})
