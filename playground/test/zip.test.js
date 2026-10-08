import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crc32, readZip, stripCommonFolder, writeZip } from '../src/share/zip.js'

describe('zip', () => {
  it('round-trips text, pictures and folders', async () => {
    const png = new Uint8Array(300).map((_, i) => i % 7)
    const zip = await writeZip({
      'game.mini': 'game\n  size 320 by 180\n'.repeat(20),
      'assets/hero.png': new Blob([png]),
      'levels/one/ünïcode.mini': 'thing a',
    })
    const files = await readZip(zip)
    expect(Object.keys(files).sort()).toEqual(['assets/hero.png', 'game.mini', 'levels/one/ünïcode.mini'])
    expect(new TextDecoder().decode(files['game.mini'])).toBe('game\n  size 320 by 180\n'.repeat(20))
    expect(files['assets/hero.png']).toEqual(png)
  })

  it('computes standard CRC32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('reads zips made by system ZIP tools and skips junk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minijs-zip-'))
    mkdirSync(join(dir, 'My Game/assets'), { recursive: true })
    writeFileSync(join(dir, 'My Game/game.mini'), 'game\n')
    writeFileSync(join(dir, 'My Game/assets/a.png'), new Uint8Array([1, 2, 3]))
    writeFileSync(join(dir, 'My Game/.DS_Store'), 'x')
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::CreateFromDirectory(
          (Join-Path (Get-Location) 'My Game'),
          (Join-Path (Get-Location) 'out.zip'),
          [System.IO.Compression.CompressionLevel]::Optimal,
          $true
        )
      `], { cwd: dir, timeout: 20_000 })
    } else {
      execFileSync('zip', ['-qr', 'out.zip', 'My Game'], { cwd: dir })
    }
    const files = stripCommonFolder(await readZip(new Blob([readFileSync(join(dir, 'out.zip'))])))
    expect(Object.keys(files).sort()).toEqual(['assets/a.png', 'game.mini'])
  }, 30_000)

  it('reads its own output with system ZIP tools', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minijs-unzip-'))
    writeFileSync(join(dir, 'p.zip'), new Uint8Array(await (await writeZip({ 'a/b.txt': 'hello hello hello hello' })).arrayBuffer()))
    const text = process.platform === 'win32'
      ? execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `
          Add-Type -AssemblyName System.IO.Compression.FileSystem
          $zip = [System.IO.Compression.ZipFile]::OpenRead((Join-Path (Get-Location) 'p.zip'))
          $reader = [System.IO.StreamReader]::new($zip.GetEntry('a/b.txt').Open())
          try { [Console]::Write($reader.ReadToEnd()) }
          finally { $reader.Dispose(); $zip.Dispose() }
        `], { cwd: dir, timeout: 20_000 }).toString()
      : execFileSync('unzip', ['-p', 'p.zip', 'a/b.txt'], { cwd: dir }).toString()
    expect(text).toBe('hello hello hello hello')
  }, 30_000)

  it('refuses non-zips', async () => {
    await expect(readZip(new Blob(['nope']))).rejects.toThrow('This is not a zip file')
  })
})
