import { compile } from '@minijs/lang'
import { describe, expect, it } from 'vitest'
import { MemoryFs } from '../src/files/memory-fs.js'
import { collectImages, downloadName, exportHtml } from '../src/share/export-html.js'

const SOURCE = 'thing hero\n  looks like "hero.png"\n  starts at 1, 1\nalways\n  show text "</script><b>hi</b>"\n'

describe('HTML export', () => {
  it('makes one complete page with the player, the game and its pictures', async () => {
    const { program } = compile(SOURCE)
    if (!program) throw new Error('no program')
    const fs = new MemoryFs('p', { 'game.mini': SOURCE, 'assets/hero.png': new Blob([new Uint8Array([1, 2])], { type: 'image/png' }) })
    const images = await collectImages(fs, 'game.mini', program)
    expect(Object.keys(images)).toEqual(['hero.png'])
    const html = exportHtml({ title: 'My <Game>', program, images, playerSource: 'var MiniPlayer={mount:function(){}}; "</script>"' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>My &lt;Game&gt;</title>')
    expect(html).toContain('data:image/png;base64,AQI=')
    // Nothing inside the scripts can close them early.
    const body = html.slice(html.indexOf('<body>'))
    expect(body.match(/<\/script>/g)?.length).toBe(2)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('round-trips the program through the page', () => {
    const { program } = compile(SOURCE)
    if (!program) throw new Error('no program')
    const html = exportHtml({ title: 't', program, images: {}, playerSource: '' })
    const json = /var data = (.*);\n/.exec(html)?.[1] ?? ''
    expect(JSON.parse(json).program).toEqual(JSON.parse(JSON.stringify(program)))
  })

  it('makes safe file names', () => {
    expect(downloadName('Cloud Hopper!', 'html')).toBe('cloud-hopper.html')
    expect(downloadName('***', 'zip')).toBe('game.zip')
  })
})
