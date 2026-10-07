// Desktop folders: paths on every system, the remembered folder list, and the
// things only real disks have (hidden files, links, folders that move away).
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  TauriFs,
  folderId,
  folderRecords,
  forgetFolderRecord,
  lastPart,
  parentOf,
  rememberFolderPath,
} from '../src/files/tauri-fs.js'
import { nodeBackend, tempFolder } from './node-backend.js'

/** Plain in-memory localStorage for the folder list. */
class MemoryStorage {
  /** @type {Map<string, string>} */
  map = new Map()
  /** @param {string} k */
  getItem(k) {
    return this.map.get(k) ?? null
  }
  /** @param {string} k @param {string} v */
  setItem(k, v) {
    this.map.set(k, v)
  }
  /** @param {string} k */
  removeItem(k) {
    this.map.delete(k)
  }
}

beforeEach(() => {
  globalThis.localStorage = /** @type {any} */ (new MemoryStorage())
})

describe('desktop paths', () => {
  it('names folders and files on macOS, Linux and Windows', () => {
    expect(lastPart('/Users/sam/Games/Cloud Hopper')).toBe('Cloud Hopper')
    expect(lastPart('/Users/sam/Games/Cloud Hopper/')).toBe('Cloud Hopper')
    expect(lastPart('C:\\Users\\Sam\\Games\\Star Defender')).toBe('Star Defender')
    expect(parentOf('/Users/sam/Games/hop/game.mini')).toBe('/Users/sam/Games/hop')
    expect(parentOf('C:\\Games\\hop\\game.mini')).toBe('C:\\Games\\hop')
    expect(parentOf('/game.mini')).toBe('/')
  })

  it('gives the same folder the same id', () => {
    expect(folderId('/a/b')).toBe(folderId('/a/b'))
    expect(folderId('/a/b')).not.toBe(folderId('/a/c'))
    expect(folderId('/a/b')).toMatch(/^disk:[0-9a-z]+$/)
  })

  it('joins Windows paths with backslashes', () => {
    const fs = new TauriFs('C:\\Games\\hop\\', 'disk:x', nodeBackend)
    expect(fs.name).toBe('hop')
    expect(fs.full('')).toBe('C:\\Games\\hop')
    expect(fs.full('levels/one.mini')).toBe('C:\\Games\\hop\\levels\\one.mini')
    const mac = new TauriFs('/Users/sam/hop', 'disk:y', nodeBackend)
    expect(mac.full('levels/../a.mini')).toBe('/Users/sam/hop/a.mini')
  })
})

describe('remembered folders', () => {
  it('keeps newest first, once each, and forgets', () => {
    rememberFolderPath('/a/one')
    rememberFolderPath('/a/two')
    rememberFolderPath('/a/one')
    expect(folderRecords().map((r) => r.name)).toEqual(['one', 'two'])
    forgetFolderRecord(folderId('/a/one'))
    expect(folderRecords().map((r) => r.path)).toEqual(['/a/two'])
  })

  it('survives a damaged list', () => {
    localStorage.setItem('minijs:desktop-folders', '{not json')
    expect(folderRecords()).toEqual([])
    localStorage.setItem('minijs:desktop-folders', '[null, {"path": 3}, {"id": "disk:1", "path": "/x", "name": "x"}]')
    expect(folderRecords()).toEqual([{ id: 'disk:1', path: '/x', name: 'x' }])
  })
})

describe('desktop folder on a real disk', () => {
  it('hides dot files, tool folders and links', async () => {
    const root = await tempFolder()
    await writeFile(join(root, 'game.mini'), 'game')
    await writeFile(join(root, '.DS_Store'), '')
    await mkdir(join(root, 'node_modules', 'x'), { recursive: true })
    await mkdir(join(root, '.git'))
    await symlink(join(root, 'game.mini'), join(root, 'link.mini'))
    const fs = new TauriFs(root, 'disk:t', nodeBackend)
    expect((await fs.list()).map((e) => e.path)).toEqual(['game.mini'])
  })

  it('reports folders that moved away', async () => {
    const fs = new TauriFs(join(await tempFolder(), 'gone'), 'disk:g', nodeBackend)
    expect(await fs.ensureAccess()).toBe(false)
    await expect(fs.list()).rejects.toThrow('I can\'t open the folder "gone". It may have moved.')
  })

  it('refuses to delete the whole folder', async () => {
    const fs = new TauriFs(await tempFolder(), 'disk:r', nodeBackend)
    expect(await fs.ensureAccess()).toBe(true)
    await expect(fs.remove('')).rejects.toThrow('I won\'t delete the whole project folder.')
  })
})
