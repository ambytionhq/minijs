// Tilemaps, autotile, particles, sound and state machines, running for real.
import { compile } from '@minijs/lang'
import { describe, expect, it } from 'vitest'
import { RecordingAudio } from '../src/audio/output.js'
import { encodeWav, parseSong, renderSong, renderSound, soundSeconds } from '../src/audio/synth.js'
import { StaticAssetLoader } from '../src/assets.js'
import { ManualInput } from '../src/input.js'
import { RecordingRenderer } from '../src/render/renderer.js'
import { drawWorld } from '../src/render/draw-world.js'
import { Simulation } from '../src/simulation.js'
import { MAX_PARTICLES, ParticleSystem } from '../src/particles.js'
import { E, N, NE, NW, S, SE, SW, TERRAIN_PIECES, W, frameToRgba, parseTilemap, parseTileset, terrainMask } from '../src/tiles/format.js'
import { DEFAULT_PARTICLES, PARTICLE_PRESETS, SOUND_PRESETS } from '@minijs/lang'

const P = '0'
const blank = (w, h, ch = P) => ch.repeat(w * h)

const TILESET = JSON.stringify({
  minijs: 'tileset',
  version: 1,
  tileWidth: 16,
  tileHeight: 16,
  palette: ['#336633'],
  tiles: [
    { key: 'w', name: 'wall', kind: 'plain', solid: 'solid', frames: [blank(16, 16)] },
    { key: 't', name: 'ledge', kind: 'plain', solid: 'top', frames: [blank(16, 16)] },
    { key: 'l', name: 'lava', kind: 'plain', solid: 'none', fps: 6, frames: [blank(16, 16), blank(16, 16, '.')] },
    { key: 'g', name: 'grass', kind: 'terrain', solid: 'solid', frames: [blank(64, 48)] },
  ],
})

/**
 * @param {string[]} rows
 * @param {object} [extra]
 */
const tilemap = (rows, extra = {}) =>
  JSON.stringify({
    minijs: 'tilemap',
    version: 1,
    tileset: 'set.tileset',
    width: rows[0].length,
    height: rows.length,
    layers: [{ name: 'Ground', rows }],
    things: [],
    ...extra,
  })

/**
 * @param {string} source
 * @param {Record<string, string | ArrayBuffer>} [files]
 * @param {RecordingAudio} [audio]
 */
async function game(source, files = {}, audio) {
  const { program, errors } = compile(source)
  expect(errors).toEqual([])
  const input = new ManualInput()
  const sim = await Simulation.create(/** @type {any} */ (program), {
    input,
    audio,
    assets: new StaticAssetLoader({}, { 'set.tileset': TILESET, ...files }),
    random: () => 0.5,
  })
  return { sim, input }
}

/** @param {Simulation} sim @param {number} n */
const run = (sim, n) => {
  for (let i = 0; i < n; i++) sim.tick()
}

describe('tile files', () => {
  it('repairs what it can and refuses what it can not', () => {
    expect(parseTileset('{nope')).toBeNull()
    expect(parseTileset('{"minijs":"tilemap"}')).toBeNull()
    const set = parseTileset('{"minijs":"tileset","tileWidth":15,"tiles":[{"key":"a","frames":["0"]},{"key":"a"}]}')
    expect(set?.tileWidth).toBe(16)
    expect(set?.tiles.map((t) => t.key)).toEqual(['a', 'b'])
    expect(set?.tiles[0].frames[0].length).toBe(16 * 16)
    const map = parseTilemap('{"minijs":"tilemap","width":3,"height":2,"layers":[{"rows":["abcdef"]}],"things":[{"thing":"Coin","x":1,"y":2},{"x":1}]}')
    expect(map?.layers[0].rows).toEqual(['abc', '...'])
    expect(map?.things).toEqual([{ thing: 'coin', x: 1, y: 2 }])
  })

  it('turns pixels into colors', () => {
    const set = /** @type {any} */ (parseTileset(TILESET))
    const rgba = frameToRgba(set, '0.', 2, 1)
    expect([...rgba]).toEqual([0x33, 0x66, 0x33, 255, 0, 0, 0, 0])
  })
})

describe('autotile', () => {
  /** @param {number} mask */
  const pieces = (mask) => [...TERRAIN_PIECES.slice(mask * 8, mask * 8 + 8)]

  it('a cell alone shows the four outer corners', () => {
    expect(pieces(0)).toEqual([0, 0, 2, 0, 0, 2, 2, 2])
  })

  it('a cell surrounded on all sides shows the fill', () => {
    expect(pieces(255)).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
  })

  it('a missing diagonal shows an inner corner, in only that corner', () => {
    expect(pieces(255 & ~NE)).toEqual([1, 1, 3, 0, 1, 1, 1, 1])
    expect(pieces(255 & ~SW)).toEqual([1, 1, 1, 1, 3, 0, 1, 1])
  })

  it('the top row of a block shows top edges', () => {
    expect(pieces(E | W | S | SE | SW)).toEqual([1, 0, 1, 0, 1, 1, 1, 1])
  })

  it('finds neighbors, treating the edge of the map as the same', () => {
    const grid = ['.g.', 'ggg', '.g.']
    const same = (c, r) => c < 0 || r < 0 || c > 2 || r > 2 || grid[r][c] === 'g'
    expect(terrainMask(same, 1, 1)).toBe(N | E | S | W)
    expect(terrainMask(same, 1, 0)).toBe(N | S | NE | SE | SW | NW)
    expect(N | E | S | W | NE | SE | SW | NW).toBe(255)
    expect(SE).toBeGreaterThan(0)
  })

  it('updates neighbors when a tile changes during the game', async () => {
    const { sim } = await game('tilemap m "m.tilemap"\n', { 'm.tilemap': tilemap(['ggg', 'ggg', 'ggg']) })
    const layer = sim.tiles.maps[0].layers[0]
    expect(layer.masks[4]).toBe(255)
    sim.tiles.setAt(0, 0, null)
    expect(layer.masks[4]).toBe(255 & ~NW)
    expect(layer.masks[1] & W).toBe(0)
  })
})

describe('tilemaps in a game', () => {
  const PLAYER = 'game\n  gravity 0.4\nthing player\n  looks like red box 12 by 12\n  solid\n  falls\n  starts at 2, 2\n'

  it('stands on solid tiles', async () => {
    const { sim } = await game(`${PLAYER}tilemap m "m.tilemap"\n`, { 'm.tilemap': tilemap(['....', '....', 'wwww']) })
    run(sim, 60)
    const p = sim.instancesOf('player')[0]
    expect(p.y).toBe(32 - 12)
    expect(p.onGround).toBe(true)
  })

  it('walks into walls and stops', async () => {
    const { sim } = await game(`thing player\n  looks like red box 12 by 12\n  solid\n  starts at 2, 2\nalways\n  move player right 3\ntilemap m "m.tilemap"\n`, {
      'm.tilemap': tilemap(['..w', '..w']),
    })
    run(sim, 30)
    expect(sim.instancesOf('player')[0].x).toBe(32 - 12)
  })

  it('platforms catch you from above and let you up from below', async () => {
    const { sim, input } = await game(`${PLAYER}tilemap m "m.tilemap"\nwhen space key is pressed\n  push player up 9\n`, {
      'm.tilemap': tilemap(['....', '....', 'tttt', '....', '....', 'wwww']),
    })
    run(sim, 60)
    expect(sim.instancesOf('player')[0].y).toBe(32 - 12)
    // Now from below.
    const { sim: below } = await game(`game\n  gravity 0.4\nthing player\n  looks like red box 12 by 12\n  solid\n  falls\n  starts at 2, 66\nwhen game starts\n  push player up 8\ntilemap m "m.tilemap"\n`, {
      'm.tilemap': tilemap(['....', '....', 'tttt', '....', '....', '....', 'wwww']),
    })
    let highest = 1000
    for (let i = 0; i < 60; i++) {
      below.tick()
      highest = Math.min(highest, below.instancesOf('player')[0].y)
    }
    expect(highest).toBeLessThan(32)
    expect(input).toBeDefined()
  })

  it('does not stop things on tiles that are not solid, or layers that are switched off', async () => {
    const { sim } = await game(`${PLAYER}tilemap m "m.tilemap"\n`, {
      'm.tilemap': tilemap(['....', '....', 'llll', 'xxxx'], {
        layers: [
          { name: 'Decor', rows: ['....', '....', 'llll', 'wwww'], solid: false },
          { name: 'Ground', rows: ['....', '....', '....', '....', 'wwww'] },
        ],
        height: 5,
      }),
    })
    run(sim, 60)
    expect(sim.instancesOf('player')[0].y).toBe(64 - 12)
  })

  it('touching a named tile runs a rule that can change that tile', async () => {
    const { sim } = await game(`thing player\n  looks like red box 8 by 8\n  starts at 16, 0\nscore starts at 0\ntilemap m "m.tilemap"\nwhen player touches lava tile\n  add 1 to score\n  log "tile {tile x}, {tile y}"\n  remove the tile\n`, {
      'm.tilemap': tilemap(['.l.', '...']),
    })
    /** @type {string[]} */
    const logged = []
    sim.onLog = (t) => logged.push(t)
    run(sim, 5)
    expect(sim.getVar('score')).toBe(1)
    expect(logged).toEqual(['tile 16, 0'])
  })

  it('reads and changes tiles from any rule', async () => {
    const { sim } = await game(`thing player\n  looks like red box 8 by 8\n  starts at 8, 8\nyes starts at 0\ntilemap m "m.tilemap"\nwhen tile at 16, 0 is wall\n  add 1 to yes\nwhen player is on wall tile\n  add 10 to yes\nwhen player is touching any tile\n  add 100 to yes\nwhen every 0.5 seconds\n  set tile at 0, 0 to lava\n  remove tile at 16, 0\n`, {
      'm.tilemap': tilemap(['.w.', '...', 'www']),
    })
    run(sim, 2)
    expect(sim.getVar('yes')).toBe(101)
    run(sim, 40)
    expect(sim.tiles.nameIdAt(0, 0)).toBe(sim.catalog.tileNameIds.get('lava'))
    expect(sim.tiles.nameIdAt(16, 0)).toBe(-1)
  })

  it('restart puts every tile back', async () => {
    const { sim } = await game('tilemap m "m.tilemap"\nwhen game starts\n  remove tile at 0, 0\n', { 'm.tilemap': tilemap(['w']) })
    run(sim, 2)
    expect(sim.tiles.nameIdAt(0, 0)).toBe(-1)
    sim.restart()
    expect(sim.tiles.nameIdAt(0, 0)).toBe(sim.catalog.tileNameIds.get('wall'))
  })

  it('places things saved in the map, and switching maps swaps them', async () => {
    const { sim } = await game(`thing coin\n  looks like gold circle 2\nthing hero\n  looks like red box 2 by 2\n  starts at 0, 0\ntilemap one "one.tilemap"\n  at 8, 8\ntilemap two "two.tilemap"\n  hidden\nwhen after 1 second\n  switch to tilemap two\n`, {
      'one.tilemap': tilemap(['w'], { things: [{ thing: 'coin', x: 4, y: 4 }] }),
      'two.tilemap': tilemap(['w'], { things: [{ thing: 'coin', x: 1, y: 1 }, { thing: 'coin', x: 2, y: 2 }] }),
    })
    expect(sim.instancesOf('coin').map((c) => c.x)).toEqual([12])
    run(sim, 61)
    expect(sim.instancesOf('coin').map((c) => c.x)).toEqual([1, 2])
    expect(sim.tiles.firstVisible()?.name).toBe('two')
    expect(sim.instancesOf('hero').length).toBe(1)
    sim.restart()
    expect(sim.instancesOf('coin').map((c) => c.x)).toEqual([12])
  })

  it('keeps the camera inside the map, unless the game says otherwise', async () => {
    const wide = 'w'.repeat(100)
    const source = 'game\n  size 100 by 100\nthing hero\n  looks like red box 2 by 2\n  starts at 0, 0\n  camera follows\ntilemap m "m.tilemap"\n'
    const { sim } = await game(source, { 'm.tilemap': tilemap([wide]) })
    expect(sim.camera.x).toBe(0)
    const { sim: free } = await game(source.replace('size 100 by 100', 'size 100 by 100\n  camera stays inside -500, -500 to 500, 500'), { 'm.tilemap': tilemap([wide]) })
    expect(free.camera.x).toBeLessThan(0)
  })

  it('draws plain tiles, four pieces for terrain, and animated frames', async () => {
    const { sim } = await game('game\n  size 64 by 32\ntilemap m "m.tilemap"\n', { 'm.tilemap': tilemap(['wg..', 'l...']) })
    const r = new RecordingRenderer()
    drawWorld(r, sim, 1)
    const sprites = r.calls.filter((c) => c.op === 'sprite')
    expect(sprites.length).toBe(1 + 4 + 1)
    expect(sprites[0]).toMatchObject({ sw: 16, sh: 16, dx: 0, dy: 0 })
    expect(sprites[1]).toMatchObject({ sw: 8, sh: 8, dx: 16, dy: 0 })
  })

  it('reports missing and broken files without stopping the game', async () => {
    const { sim } = await game('tilemap m "gone.tilemap"\n')
    expect(sim.errors[0]).toMatchObject({ code: 'file-missing', message: 'I couldn\'t find the file "gone.tilemap".' })
    const { sim: b } = await game('tilemap m "m.tilemap"\n', { 'm.tilemap': 'not json' })
    expect(b.errors[0].code).toBe('file-broken')
    const { sim: c } = await game('tilemap m "m.tilemap"\n', { 'm.tilemap': JSON.stringify({ minijs: 'tilemap', tileset: 'nope.tileset', layers: [] }) })
    expect(c.errors[0].message).toContain('nope.tileset')
    run(c, 3)
  })

  it('says so when a rule names a tile that does not exist', async () => {
    const { sim } = await game('thing a\n  looks like red box 1 by 1\ntilemap m "m.tilemap"\nwhen a touches lavva tile\n  stop a\n', { 'm.tilemap': tilemap(['w']) })
    expect(sim.errors[0]).toMatchObject({ code: 'unknown-tile', hint: 'Did you mean "lava"?' })
  })

  it('says so when a map places an unknown thing', async () => {
    const { sim } = await game('tilemap m "m.tilemap"\n', { 'm.tilemap': tilemap(['w'], { things: [{ thing: 'ghost', x: 1, y: 1 }] }) })
    expect(sim.errors[0].message).toContain('"ghost"')
  })
})

describe('particles', () => {
  it('a burst makes the right amount, and they die off', async () => {
    const { sim } = await game('particles fx like hit\nwhen game starts\n  burst fx at 10, 10\n')
    run(sim, 1)
    expect(sim.particles.count).toBe(PARTICLE_PRESETS.hit.amount)
    run(sim, 60)
    expect(sim.particles.count).toBe(0)
  })

  it('bursts at a thing, in the middle of it', async () => {
    const { sim } = await game('thing a\n  looks like red box 10 by 20\n  starts at 100, 100\nparticles fx\n  amount 1\n  speed 0\n  life 5\nwhen game starts\n  burst fx on a\n')
    run(sim, 1)
    const i = sim.particles.effect.findIndex((e) => e >= 0)
    expect(sim.particles.x[i]).toBeCloseTo(105)
    expect(sim.particles.y[i]).toBeCloseTo(110)
  })

  it('keeps going while started, and stops when told or when the thing goes', async () => {
    const { sim } = await game('thing a\n  looks like red box 1 by 1\n  starts at 0, 0\nparticles fx\n  rate 60\n  life 10\nwhen game starts\n  start fx on a\n  start fx on a\nwhen after 1 second\n  stop fx on a\n')
    run(sim, 30)
    expect(sim.particles.emitterCount).toBe(1)
    const halfway = sim.particles.count
    expect(halfway).toBeGreaterThan(25)
    run(sim, 60)
    expect(sim.particles.emitterCount).toBe(0)
    const { sim: s2 } = await game('thing a\n  looks like red box 1 by 1\n  starts at 0, 0\nparticles fx like fire\nwhen game starts\n  start fx on a\nwhen after 1 second\n  remove a\n')
    run(s2, 62)
    expect(s2.particles.emitterCount).toBe(0)
  })

  it('can fall from the top of the screen, following the camera', async () => {
    const { sim } = await game('particles fx like snow\nwhen game starts\n  start fx on the screen\n  start fx at 5, 5\nwhen after 1 second\n  stop fx everywhere\n')
    run(sim, 30)
    expect(sim.particles.emitterCount).toBe(2)
    run(sim, 40)
    expect(sim.particles.emitterCount).toBe(0)
  })

  it('never goes over its limit', () => {
    const system = new ParticleSystem([{ ...DEFAULT_PARTICLES, amount: MAX_PARTICLES + 500 }])
    system.burst(0, 0, 0)
    expect(system.count).toBe(MAX_PARTICLES)
  })

  it('does not change the game\'s own random numbers', async () => {
    let calls = 0
    const { program } = compile('particles fx like explosion\nwhen game starts\n  burst fx at 0, 0\n')
    const sim = await Simulation.create(/** @type {any} */ (program), {
      random: () => {
        calls++
        return 0.5
      },
    })
    run(sim, 10)
    expect(calls).toBe(0)
  })

  it('draws, and restart clears them', async () => {
    const { sim } = await game('game\n  size 100 by 100\nparticles fx like sparkle\nwhen game starts\n  burst fx at 50, 50\n')
    run(sim, 2)
    const r = new RecordingRenderer()
    drawWorld(r, sim, 0.5)
    expect(r.calls.filter((c) => c.op === 'particle').length).toBeGreaterThan(0)
    sim.restart()
    expect(sim.particles.count).toBe(0)
  })

  it('reads effects from files, and reports problems', async () => {
    const file = JSON.stringify({ minijs: 'particles', amount: 3, colors: ['#ff0000'] })
    const { sim } = await game('particles fx "fx.particles"\n  speed 1\nwhen game starts\n  burst fx at 0, 0\n', { 'fx.particles': file })
    run(sim, 1)
    expect(sim.particles.count).toBe(3)
    const { sim: gone } = await game('particles fx "gone.particles"\nwhen game starts\n  burst fx at 0, 0\n')
    expect(gone.errors[0].code).toBe('file-missing')
    run(gone, 2)
  })
})

describe('sound', () => {
  it('makes samples that fit the settings', () => {
    const samples = renderSound({ pitch: 440, pitchEnd: 440, attack: 0, hold: 0.1, fade: 0.1, volume: 50 }, 8000)
    expect(samples.length).toBe(Math.floor(0.2 * 8000))
    const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(peak).toBeGreaterThan(0.3)
    expect(peak).toBeLessThanOrEqual(0.5001)
  })

  it('every preset makes a real sound, the same every time', () => {
    for (const [name, preset] of Object.entries(SOUND_PRESETS)) {
      const a = renderSound(preset, 8000)
      expect(a.some((v) => Math.abs(v) > 0.02), name).toBe(true)
      expect(a.every((v) => Number.isFinite(v) && Math.abs(v) <= 1), name).toBe(true)
      expect(renderSound(preset, 8000)).toEqual(a)
    }
  })

  it('an echo makes it longer', () => {
    expect(soundSeconds({ echo: 40 })).toBeGreaterThan(soundSeconds({ echo: 0 }))
  })

  it('tells the speakers what to play', async () => {
    const audio = new RecordingAudio()
    const { sim } = await game(
      'game\n  size 100 by 100\nthing rock\n  looks like red box 2 by 2\n  starts at 149, 49\nsound ding like coin\nsound far like hit\nmusic theme "t.music"\nwhen game starts\n  play sound ding\n  play sound ding volume 50 pitch 200\n  play sound far from rock\n  play music theme\n  set music volume to 40\nwhen after 1 second\n  stop music\n',
      { 't.music': JSON.stringify({ minijs: 'music', tempo: 120, steps: 8, tracks: [] }) },
      audio,
    )
    run(sim, 1)
    expect(audio.calls[0]).toEqual({ op: 'sound', name: 'ding', volume: 1, pitch: 1, pan: 0 })
    expect(audio.calls[1]).toEqual({ op: 'sound', name: 'ding', volume: 0.5, pitch: 2, pan: 0 })
    expect(audio.calls[2]).toMatchObject({ op: 'sound', name: 'far' })
    const far = /** @type {any} */ (audio.calls[2])
    expect(far.volume).toBeLessThan(1)
    expect(far.pan).toBeGreaterThan(0.5)
    expect(audio.calls.slice(3)).toEqual([{ op: 'music', name: 'theme' }, { op: 'volume', channel: 'music', volume: 0.4 }])
    run(sim, 61)
    expect(audio.calls.at(-1)).toEqual({ op: 'stopMusic' })
    sim.restart()
    expect(audio.calls.at(-1)).toEqual({ op: 'stopAll' })
  })

  it('renders songs that loop cleanly', () => {
    const song = /** @type {any} */ (parseSong(JSON.stringify({
      minijs: 'music',
      tempo: 120,
      steps: 8,
      tracks: [
        { name: 'Lead', wave: 'square', volume: 70, notes: [[0, 60, 2], [7, 67, 4]] },
        { name: 'Drums', wave: 'drums', volume: 80, notes: [[0, 0, 1], [4, 1, 1], [6, 2, 1], [2, 3, 1]] },
        { name: 'Off', wave: 'saw', muted: true, notes: [[0, 60, 8]] },
      ],
    })))
    const rate = 8000
    const samples = renderSong(song, rate)
    expect(samples.length).toBe(Math.round((60 / 120 / 4) * 8 * rate))
    // The note on the last step is long enough to wrap around to the start.
    expect(samples.every((v) => Number.isFinite(v))).toBe(true)
    expect(samples.some((v) => Math.abs(v) > 0.1)).toBe(true)
    expect(parseSong('nope')).toBeNull()
  })

  it('can write a WAV file', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), 8000)
    const view = new DataView(wav)
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF')
    expect(view.getInt16(46, true)).toBe(32767)
    expect(wav.byteLength).toBe(50)
  })

  it('reports missing sound files', async () => {
    const { sim } = await game('sound a "a.mp3"\nsound b "b.sound"\nmusic c "c.music"\nmusic d "d.ogg"\n')
    expect(sim.errors.map((e) => e.code)).toEqual(['file-missing', 'file-missing', 'file-missing', 'file-missing'])
  })
})

describe('state machines', () => {
  const ENEMY = 'thing enemy\n  looks like red box 8 by 8\n  starts at 0, 0\n  starts at 100, 0\n'

  /** @param {Simulation} sim @param {string} thing */
  const states = (sim, thing) =>
    sim.instancesOf(thing).map((i) => (sim.world.state[i.id] < 0 ? null : sim.program.machines.find((m) => m.thing === thing)?.states[sim.world.state[i.id]].name))

  it('every copy starts in the first state, and runs its enter lines once', async () => {
    const { sim } = await game(`n starts at 0\n${ENEMY}states enemy\n  state walk\n    on enter\n      add 1 to n\n  state rest\n`)
    run(sim, 5)
    expect(states(sim, 'enemy')).toEqual(['walk', 'walk'])
    expect(sim.getVar('n')).toBe(2)
  })

  it('always lines only move the copy they belong to', async () => {
    const { sim } = await game(`${ENEMY}states enemy\n  state walk\n    always\n      move enemy right 1\n    go to rest when enemy x is above 104\n  state rest\n`)
    run(sim, 10)
    const list = sim.instancesOf('enemy')
    expect(states(sim, 'enemy')).toEqual(['walk', 'rest'])
    expect(list[0].x).toBe(10)
    expect(list[1].x).toBeLessThan(110)
  })

  it('go to after counts from entering the state', async () => {
    const { sim } = await game(`n starts at 0\n${ENEMY}states enemy\n  state a\n    go to b after 1 second\n  state b\n    on enter\n      add 1 to n\n    on leave\n      add 10 to n\n    go to a after 0.5 seconds\n`)
    run(sim, 59)
    expect(states(sim, 'enemy')).toEqual(['a', 'a'])
    run(sim, 3)
    expect(states(sim, 'enemy')).toEqual(['b', 'b'])
    expect(sim.getVar('n')).toBe(2)
    run(sim, 32)
    expect(states(sim, 'enemy')).toEqual(['a', 'a'])
    expect(sim.getVar('n')).toBe(22)
  })

  it('go to waits for keys and touches', async () => {
    const { sim, input } = await game(`thing hero\n  looks like blue box 8 by 8\n  starts at 2, 0\n${ENEMY}states enemy\n  state idle\n    go to mad when space key is pressed\n    go to hit when enemy touches hero\n  state mad\n  state hit\n`)
    run(sim, 1)
    expect(states(sim, 'enemy')).toEqual(['hit', 'idle'])
    input.keyDown('space')
    run(sim, 1)
    expect(states(sim, 'enemy')).toEqual(['hit', 'mad'])
  })

  it('rules inside a state only count during it', async () => {
    const { sim, input } = await game(`n starts at 0\n${ENEMY}states enemy\n  state a\n    when space key is pressed\n      add 1 to n\n      set enemy state to b\n  state b\n`)
    run(sim, 1)
    input.keyDown('space')
    run(sim, 1)
    expect(sim.getVar('n')).toBe(2)
    expect(states(sim, 'enemy')).toEqual(['b', 'b'])
    input.keyUp('space')
    run(sim, 1)
    input.keyDown('space')
    run(sim, 1)
    expect(sim.getVar('n')).toBe(2)
  })

  it('other rules can read and change states, and hear about changes', async () => {
    const { sim } = await game(`n starts at 0\nm starts at 0\nthing boss\n  looks like red box 8 by 8\n  starts at 0, 0\nstates boss\n  state calm\n  state angry\nwhen after 0.5 seconds\n  set boss state to angry\nwhen boss enters angry\n  add 1 to n\nwhen boss leaves calm\n  add 1 to m\nwhen boss is in angry\n  log "{boss state time}"\n`)
    /** @type {string[]} */
    const lines = []
    sim.onLog = (t) => lines.push(t)
    run(sim, 40)
    expect(sim.getVar('n')).toBe(1)
    expect(sim.getVar('m')).toBe(1)
    expect(lines).toEqual(['0'])
  })

  it('the game itself can have states', async () => {
    const { sim, input } = await game(`t starts at 0\nthing a\n  looks like red box 1 by 1\nstates game\n  state menu\n    on enter\n      show text "Press space"\n    go to playing when space key is pressed\n  state playing\n    always\n      add 1 to t\n    go to over when game state time is above 1\n  state over\n    on enter\n      stop game\nwhen game is in over\n  stop a\n`)
    run(sim, 5)
    expect(sim.getVar('t')).toBe(0)
    input.keyDown('space')
    run(sim, 1)
    run(sim, 30)
    expect(sim.getVar('t')).toBeGreaterThan(20)
    expect(sim.stopped).toBe(false)
    run(sim, 40)
    expect(sim.stopped).toBe(true)
    sim.restart()
    run(sim, 3)
    expect(sim.machines.machines[0].gameState).toBe(0)
  })

  it('text shown in a state goes away when the state ends', async () => {
    const { sim, input } = await game('states game\n  state menu\n    on enter\n      show text "Press space"\n    go to playing when space key is pressed\n  state playing\n    on enter\n      show text "Go!"\nalways\n  show text "Always here"\n')
    run(sim, 2)
    const shown = () => sim.text.slots.filter((s) => s.visible).map((s) => s.text).sort()
    expect(shown()).toEqual(['Always here', 'Press space'])
    input.keyDown('space')
    run(sim, 2)
    expect(shown()).toEqual(['Always here', 'Go!'])
  })

  it('new copies get their own state, even in reused slots', async () => {
    const { sim } = await game('thing bug\n  looks like red box 1 by 1\nstates bug\n  state young\n    go to old after 0.1 seconds\n  state old\nwhen after 0.5 seconds\n  remove bug\nwhen after 0.6 seconds\n  make a bug at 0, 0\nwhen game starts\n  make a bug at 1, 1\n')
    run(sim, 20)
    expect(states(sim, 'bug')).toEqual(['old'])
    run(sim, 18)
    expect(states(sim, 'bug')).toEqual(['young'])
  })

  it('machines see looks changed inside their states', async () => {
    const { sim } = await game('thing bug\n  looks like red box 1 by 1\n  starts at 0, 0\nstates bug\n  state a\n    on enter\n      change bug to look like blue box 3 by 3\n')
    run(sim, 1)
    expect(sim.catalog.looks[sim.world.look[sim.instancesOf('bug')[0].id]].color).toBe('blue')
  })
})
