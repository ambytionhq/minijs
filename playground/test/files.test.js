// One set of rules every project store must follow, run against each store.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { ExamplesFs } from '../src/files/examples-fs.js'
import { resetDb } from '../src/files/idb.js'
import { IdbFs, createBrowserProject, deleteBrowserProject, listBrowserProjects, renameBrowserProject } from '../src/files/idb-fs.js'
import { MemoryFs } from '../src/files/memory-fs.js'
import { basename, dirname, extname, fileKind, join, nameProblem, normalize } from '../src/files/paths.js'
import { FsError, freeName, sortEntries } from '../src/files/project.js'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  resetDb()
})

/** @param {import('../src/files/project.js').ProjectFs} fs */
const paths = async (fs) => (await fs.list()).map((e) => (e.kind === 'dir' ? `${e.path}/` : e.path))

const STORES = {
  memory: async () => new MemoryFs('test'),
  browser: async () => createBrowserProject('test'),
}

for (const [label, make] of Object.entries(STORES)) {
  describe(`${label} project`, () => {
    it('writes, reads and lists with parents first', async () => {
      const fs = await make()
      await fs.writeText('game.mini', 'game')
      await fs.writeText('levels/one/start.mini', 'thing a')
      await fs.writeBlob('assets/hero.png', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
      expect(await paths(fs)).toEqual(['assets/', 'assets/hero.png', 'levels/', 'levels/one/', 'levels/one/start.mini', 'game.mini'])
      expect(await fs.readText('levels/one/start.mini')).toBe('thing a')
      const blob = await fs.readBlob('assets/hero.png')
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
      expect(await (await fs.readBlob('game.mini')).text()).toBe('game')
    })

    it('makes folders, renames folders with everything inside, and removes', async () => {
      const fs = await make()
      await fs.mkdir('art/tiles')
      await fs.writeText('art/tiles/a.txt', 'a')
      await fs.rename('art', 'pictures')
      expect(await paths(fs)).toEqual(['pictures/', 'pictures/tiles/', 'pictures/tiles/a.txt'])
      await fs.rename('pictures/tiles/a.txt', 'b.txt')
      expect(await fs.readText('b.txt')).toBe('a')
      await fs.remove('pictures')
      expect(await paths(fs)).toEqual(['b.txt'])
      expect(await fs.exists('pictures/tiles')).toBe(false)
    })

    it('refuses clashes and impossible moves', async () => {
      const fs = await make()
      await fs.writeText('a.mini', '1')
      await fs.writeText('b.mini', '2')
      await fs.mkdir('dir')
      await expect(fs.rename('a.mini', 'b.mini')).rejects.toBeInstanceOf(FsError)
      await expect(fs.rename('dir', 'dir/inner')).rejects.toThrow('A folder can\'t go inside itself.')
      await expect(fs.readText('missing.mini')).rejects.toThrow('I can\'t find "missing.mini".')
      await expect(fs.remove('nope')).rejects.toBeInstanceOf(FsError)
      await expect(fs.writeText('a.mini/x.mini', 'x')).rejects.toBeInstanceOf(FsError)
      await expect(fs.writeText('dir', 'x')).rejects.toBeInstanceOf(FsError)
      expect(await fs.readText('a.mini')).toBe('1')
    })

    it('finds free names', async () => {
      const fs = await make()
      await fs.writeText('untitled.mini', '')
      await fs.writeText('untitled 2.mini', '')
      expect(await freeName(fs, '', 'untitled', '.mini')).toBe('untitled 3.mini')
      expect(await freeName(fs, 'levels', 'untitled', '.mini')).toBe('levels/untitled.mini')
    })
  })
}

describe('browser project list', () => {
  it('creates, renames, lists newest first, and deletes with its files', async () => {
    const a = await createBrowserProject('Alpha', { 'game.mini': 'x', 'assets/p.png': new Blob(['p']) })
    await new Promise((r) => setTimeout(r, 2))
    await createBrowserProject('Beta')
    expect((await listBrowserProjects()).map((p) => p.name)).toEqual(['Beta', 'Alpha'])
    expect(await paths(a)).toEqual(['assets/', 'assets/p.png', 'game.mini'])
    await renameBrowserProject(a.projectId, 'Alpha 2')
    expect((await listBrowserProjects()).map((p) => p.name)).toContain('Alpha 2')
    await deleteBrowserProject(a.projectId)
    expect((await listBrowserProjects()).map((p) => p.name)).toEqual(['Beta'])
    expect(await paths(new IdbFs(a.projectId, 'gone'))).toEqual([])
  })

  it('keeps a failed write from landing halfway', async () => {
    const fs = await createBrowserProject('Gamma', { 'a.txt': '1' })
    await expect(fs.writeText('a.txt/b/c.txt', 'x')).rejects.toBeInstanceOf(FsError)
    expect(await paths(fs)).toEqual(['a.txt'])
  })
})

describe('examples project', () => {
  /** @type {Map<string, string>} */
  let saved
  const make = () => {
    saved = new Map()
    return new ExamplesFs({
      id: 'example:test',
      name: 'Test',
      texts: new Map([
        ['dodge.mini', 'game'],
        ['hero.mini', 'thing h'],
      ]),
      assets: new Map([['hero-1.png', 'data:image/png;base64,AA==']]),
      edits: {
        load: (k) => saved.get(k) ?? null,
        save: (k, t) => saved.set(k, t),
        clear: (k) => saved.delete(k),
      },
    })
  }

  it('lists texts and assets, keeps edits per project, and resets', async () => {
    const fs = make()
    expect(await paths(fs)).toEqual(['assets/', 'assets/hero-1.png', 'dodge.mini', 'hero.mini'])
    await fs.writeText('dodge.mini', 'game\n  pixel art')
    expect(saved.has('example:test/dodge.mini')).toBe(true)
    expect(await fs.readText('dodge.mini')).toBe('game\n  pixel art')
    expect(fs.isEdited('dodge.mini')).toBe(true)
    await fs.writeText('dodge.mini', 'game')
    expect(fs.isEdited('dodge.mini')).toBe(false)
    await fs.writeText('hero.mini', 'changed')
    await fs.reset('hero.mini')
    expect(await fs.readText('hero.mini')).toBe('thing h')
  })

  it('refuses structural changes and new files', async () => {
    const fs = make()
    await expect(fs.writeText('new.mini', 'x')).rejects.toBeInstanceOf(FsError)
    await expect(fs.remove('dodge.mini')).rejects.toBeInstanceOf(FsError)
    await expect(fs.rename('dodge.mini', 'd.mini')).rejects.toBeInstanceOf(FsError)
    expect(await fs.exists('assets/hero-1.png')).toBe(true)
    expect(await fs.exists('assets/nope.png')).toBe(false)
  })
})

describe('paths', () => {
  it('normalizes and splits', () => {
    expect(normalize('/a//b/./c/../d/')).toBe('a/b/d')
    expect(normalize('a\\b')).toBe('a/b')
    expect(join('a', '', 'b.png')).toBe('a/b.png')
    expect(dirname('a/b/c.mini')).toBe('a/b')
    expect(dirname('c.mini')).toBe('')
    expect(basename('a/b/c.mini')).toBe('c.mini')
    expect(extname('Hero.PNG')).toBe('png')
    expect(extname('.gitignore')).toBe('')
  })
  it('classifies files', () => {
    expect(['a.mini', 'b.png', 'c.JPG', 'd.md', 'e.json', 'f.zip', 'README'].map(fileKind)).toEqual([
      'mini',
      'image',
      'image',
      'text',
      'text',
      'other',
      'text',
    ])
  })
  it('checks names', () => {
    expect(nameProblem('hero.png')).toBeNull()
    expect(nameProblem('')).toBe('Names can\'t be empty.')
    expect(nameProblem('a/b')).toMatch(/can't contain/)
    expect(nameProblem(' padded ')).toMatch(/space/)
  })
  it('sorts folders before files at each level', () => {
    const sorted = sortEntries([
      { path: 'z.mini', kind: 'file' },
      { path: 'a', kind: 'dir' },
      { path: 'a/b.png', kind: 'file' },
      { path: 'B.mini', kind: 'file' },
      { path: 'a/c', kind: 'dir' },
    ])
    expect(sorted.map((e) => e.path)).toEqual(['a', 'a/c', 'a/b.png', 'B.mini', 'z.mini'])
  })
})
