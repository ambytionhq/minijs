import { beforeEach, describe, expect, it, vi } from 'vitest'

const { check, relaunch } = vi.hoisted(() => ({ check: vi.fn(), relaunch: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }))

function update(version = '0.2.0') {
  return {
    version,
    body: 'New Studio tools',
    close: vi.fn().mockResolvedValue(),
    downloadAndInstall: vi.fn().mockResolvedValue(),
  }
}

let updater
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  relaunch.mockResolvedValue()
  updater = await import('../src/desktop/updates.js')
})

describe('signed desktop updates', () => {
  it('shares overlapping checks and releases replaced updater resources', async () => {
    const first = update()
    let resolveCheck
    check.mockImplementationOnce(() => new Promise((resolve) => { resolveCheck = resolve }))
    const a = updater.findUpdate()
    const b = updater.findUpdate()
    expect(a).toBe(b)
    resolveCheck(first)
    await expect(a).resolves.toEqual({ version: '0.2.0', notes: 'New Studio tools' })
    expect(check).toHaveBeenCalledTimes(1)
    expect(check).toHaveBeenCalledWith({ timeout: 30000 })
    check.mockResolvedValueOnce(update('0.3.0'))
    await updater.findUpdate()
    expect(first.close).toHaveBeenCalledTimes(1)
  })

  it('clears a stale update when the server no longer offers it', async () => {
    const old = update()
    check.mockResolvedValueOnce(old).mockResolvedValueOnce(null)
    await updater.findUpdate()
    await expect(updater.findUpdate()).resolves.toBeNull()
    await expect(updater.installUpdate(vi.fn())).rejects.toThrow('There is no update')
    expect(old.close).toHaveBeenCalledOnce()
    expect(relaunch).not.toHaveBeenCalled()
  })

  it('waits for an in-flight check and installs only once', async () => {
    const next = update()
    let resolveCheck
    let finishDownload
    check.mockImplementationOnce(() => new Promise((resolve) => { resolveCheck = resolve }))
    next.downloadAndInstall.mockImplementation(() => new Promise((resolve) => { finishDownload = resolve }))
    const checking = updater.findUpdate()
    const a = updater.installUpdate(vi.fn())
    const b = updater.installUpdate(vi.fn())
    expect(a).toBe(b)
    resolveCheck(next)
    await checking
    await vi.waitFor(() => expect(next.downloadAndInstall).toHaveBeenCalledOnce())
    await expect(updater.findUpdate()).resolves.toEqual({ version: '0.2.0', notes: 'New Studio tools' })
    expect(check).toHaveBeenCalledTimes(1)
    finishDownload()
    await a
    expect(relaunch).toHaveBeenCalledOnce()
  })

  it('reports bounded byte progress and relaunches only after installation', async () => {
    const next = update()
    const progress = vi.fn()
    check.mockResolvedValue(next)
    next.downloadAndInstall.mockImplementation(async (onEvent) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } })
      onEvent({ event: 'Progress', data: { chunkLength: 45 } })
      onEvent({ event: 'Progress', data: { chunkLength: 80 } })
      onEvent({ event: 'Finished' })
      expect(relaunch).not.toHaveBeenCalled()
    })
    await updater.findUpdate()
    await updater.installUpdate(progress)
    expect(progress.mock.calls.map(([value]) => value)).toEqual([0, .45, 1, 1])
    expect(next.downloadAndInstall.mock.calls[0][1]).toEqual({ timeout: 120000 })
    expect(relaunch).toHaveBeenCalledOnce()
  })

  it('keeps a failed download available for retry without restarting', async () => {
    const next = update()
    check.mockResolvedValue(next)
    next.downloadAndInstall.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce()
    await updater.findUpdate()
    await expect(updater.installUpdate(vi.fn())).rejects.toThrow('Offline')
    expect(relaunch).not.toHaveBeenCalled()
    await updater.installUpdate(vi.fn())
    expect(next.downloadAndInstall).toHaveBeenCalledTimes(2)
    expect(relaunch).toHaveBeenCalledOnce()
  })

  it('handles downloads with unknown length', async () => {
    const next = update()
    const progress = vi.fn()
    check.mockResolvedValue(next)
    next.downloadAndInstall.mockImplementation(async (onEvent) => {
      onEvent({ event: 'Started', data: {} })
      onEvent({ event: 'Progress', data: { chunkLength: 45 } })
      onEvent({ event: 'Finished' })
    })
    await updater.findUpdate()
    await updater.installUpdate(progress)
    expect(progress.mock.calls.map(([value]) => value)).toEqual([null, null, 1])
  })
})
