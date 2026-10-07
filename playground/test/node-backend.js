// The desktop app's file access, played by Node against a real temporary
// folder, so TauriFs is tested on an actual disk.

import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'

/** @type {string[]} */
const made = []

afterAll(async () => {
  await Promise.all(made.map((dir) => rm(dir, { recursive: true, force: true })))
})

/** A fresh empty folder, removed after the tests. */
export async function tempFolder() {
  const dir = await mkdtemp(join(tmpdir(), 'minijs-tauri-fs-'))
  made.push(dir)
  return dir
}

/** @type {import('../src/files/tauri-fs.js').FsBackend} */
export const nodeBackend = {
  async readDir(path) {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile(), isSymlink: e.isSymbolicLink() }))
  },
  async readFile(path) {
    return new Uint8Array(await readFile(path))
  },
  async writeFile(path, data) {
    await writeFile(path, data)
  },
  async mkdir(path, options) {
    await mkdir(path, options)
  },
  async remove(path, options) {
    // Like the app: fails for paths that aren't there.
    await stat(path)
    await rm(path, { recursive: options.recursive })
  },
  async rename(from, to) {
    await rename(from, to)
  },
  async exists(path) {
    try {
      await stat(path)
      return true
    } catch {
      return false
    }
  },
  async stat(path) {
    const info = await stat(path)
    return { isFile: info.isFile(), isDirectory: info.isDirectory() }
  },
}
