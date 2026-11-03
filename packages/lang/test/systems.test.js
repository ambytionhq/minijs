// The tilemap, sound, music, particle and state machine parts of the language.
import { describe, expect, it } from 'vitest'
import { compile, PARTICLE_PRESETS, SOUND_PRESETS } from '../src/index.js'

/** @param {string} src */
function ok(src) {
  const { program, errors } = compile(src)
  expect(errors).toEqual([])
  return /** @type {NonNullable<typeof program>} */ (program)
}

/** @param {string} src */
const codes = (src) => compile(src).errors.map((e) => e.code)

const THING = 'thing enemy\n  looks like red box 8 by 8\nthing player\n  looks like blue box 8 by 8\n'

describe('tilemap lines', () => {
  it('reads a tilemap with its settings', () => {
    const p = ok('tilemap level "level.tilemap"\n  at 16, 32\n  hidden\n')
    expect(p.tilemaps).toMatchObject([{ name: 'level', src: 'level.tilemap', x: 16, y: 32, hidden: true }])
  })

  it('needs a file', () => {
    expect(codes('tilemap level\n')).toEqual(['expected'])
  })

  it('reads tile triggers, conditions and actions', () => {
    const p = ok(`${THING}when player touches lava tile and player is on grass tile
  remove the tile
  set the tile to water
  set tile at tile x + 16, tile y to grass
  remove tile at 0, 0
when player touches any tile
  stop player
when player is touching lava tile or tile at 0, 0 is lava
  stop player
`)
    expect(p.rules[0].trigger).toMatchObject({ kind: 'touchTile', thing: 'player', tile: 'lava', guard: { kind: 'onTile', tile: 'grass' } })
    expect(p.rules[0].actions.map((a) => [a.kind, /** @type {any} */ (a).tile])).toEqual([
      ['setTile', null],
      ['setTile', 'water'],
      ['setTile', 'grass'],
      ['setTile', null],
    ])
    expect(p.rules[1].trigger).toMatchObject({ kind: 'touchTile', tile: null })
    expect(p.rules[2].trigger).toMatchObject({ kind: 'condition', condition: { kind: 'or', left: { kind: 'touchingTile' }, right: { kind: 'tileAt', tile: 'lava' } } })
  })

  it('still reads touching a thing', () => {
    expect(ok(`${THING}when player touches enemy\n  stop player\n`).rules[0].trigger).toMatchObject({ kind: 'touch', a: 'player', b: 'enemy' })
  })

  it('switches, shows and hides maps, and checks the names', () => {
    const p = ok('tilemap two "two.tilemap"\nalways\n  switch to tilemap two\n  show tilemap two\n  hide tilemap two\n')
    expect(p.rules[0].actions.map((a) => a.kind)).toEqual(['switchTilemap', 'showTilemap', 'showTilemap'])
    expect(compile('tilemap two "t.tilemap"\nalways\n  show tilemap too\n').errors[0]).toMatchObject({ code: 'unknown-tilemap', hint: 'Did you mean "two"?' })
  })
})

describe('sound and music lines', () => {
  it('reads ready-made sounds with changes', () => {
    const p = ok('sound ding like coin\n  pitch 500 to 900\n  fade 0.3 seconds\n  volume 40\n  wobble 6 by 30\n')
    expect(p.sounds[0]).toMatchObject({ name: 'ding', preset: 'coin', src: null, settings: { pitch: 500, pitchEnd: 900, fade: 0.3, volume: 40, wobble: 6, wobbleDepth: 30 } })
  })

  it('reads sounds from files and music with a volume', () => {
    const p = ok('sound boom "boom.mp3"\nmusic theme "theme.music"\n  volume 60\n')
    expect(p.sounds[0]).toMatchObject({ src: 'boom.mp3', preset: null })
    expect(p.music[0]).toMatchObject({ name: 'theme', src: 'theme.music', volume: 60 })
  })

  it('reads play sound with its options, in any order', () => {
    const p = ok(`${THING}sound ding like coin\nmusic theme "t.music"\nalways\n  play sound ding pitch 120 from the enemy volume 50\n  play music theme\n  stop music\n  set music volume to 40\n  set sound volume to 20\n`)
    expect(p.rules[0].actions[0]).toMatchObject({ kind: 'playSound', name: 'ding', from: 'enemy', volume: { value: 50 }, pitch: { value: 120 } })
    expect(p.rules[0].actions.slice(1).map((a) => a.kind)).toEqual(['playMusic', 'stopMusic', 'setVolume', 'setVolume'])
  })

  it('suggests presets and rejects bad settings', () => {
    expect(compile('sound a like coyn\n').errors[0]).toMatchObject({ code: 'unknown-preset', hint: 'Did you mean "coin"?' })
    expect(codes('sound a\n  wave wiggly\n')).toEqual(['unknown-word'])
    expect(codes('sound a\n  volume 400\n')).toEqual(['bad-number'])
  })

  it('every preset exists under the names the docs use', () => {
    expect(Object.keys(SOUND_PRESETS)).toContain('explosion')
    expect(Object.keys(PARTICLE_PRESETS)).toContain('snow')
  })

  it('keeps old games working: words stay usable as names', () => {
    const p = ok('sound starts at 1\nmusic starts at 2\nthing states\n  looks like red box 1 by 1\nalways\n  add sound to music\n')
    expect(p.vars.map((v) => v.name)).toEqual(['sound', 'music'])
    const q = ok('thing music\n  looks like red box 1 by 1\nalways\n  stop music\n')
    expect(q.rules[0].actions[0]).toMatchObject({ kind: 'halt', thing: 'music' })
    const r = ok('thing hero\n  looks like "a.png"\n  animation sound "a.png" at 2 fps\nalways\n  play sound on hero\n')
    expect(r.rules[0].actions[0]).toMatchObject({ kind: 'playAnimation', animation: 'sound' })
  })
})

describe('particle lines', () => {
  it('reads effects with changes', () => {
    const p = ok('particles boom like explosion\n  colors red, sky blue, #fff\n  amount 40\n  life 0.2 to 0.5 seconds\n  size 4\n  direction up\n  no fade\n  glow\n  shape spark\n  area 10 by 2\n')
    expect(p.particles[0]).toMatchObject({
      preset: 'explosion',
      settings: { colors: ['red', 'skyblue', '#fff'], amount: 40, life: [0.2, 0.5], size: [4, 4], direction: 90, fade: false, glow: true, shape: 'spark', area: [10, 2] },
    })
  })

  it('reads hex colors in a list', () => {
    expect(ok('particles a\n  colors #fff0a8, orange, #123\n').particles[0].settings.colors).toEqual(['#fff0a8', 'orange', '#123'])
  })

  it('reads the actions', () => {
    const p = ok(`${THING}particles boom like hit\nalways\n  burst boom at 4, 5\n  burst boom on the enemy\n  start boom on player\n  start boom at 1, 2\n  start boom on the screen\n  stop boom on player\n  stop boom everywhere\n`)
    expect(p.rules[0].actions.map((a) => [a.kind, /** @type {any} */ (a).where ?? /** @type {any} */ (a).thing])).toEqual([
      ['burst', null],
      ['burst', 'enemy'],
      ['startParticles', 'thing'],
      ['startParticles', 'point'],
      ['startParticles', 'screen'],
      ['stopParticles', 'player'],
      ['stopParticles', null],
    ])
  })

  it('points people to the right way to stop an effect', () => {
    const e = compile('particles boom like hit\nalways\n  stop boom\n').errors[0]
    expect(e.message).toBe('"boom" is a particle effect, not a thing.')
    expect(e.hint).toContain('stop boom everywhere')
  })
})

describe('state machine blocks', () => {
  const MACHINE = `${THING}states enemy
  state patrol
    on enter
      stop enemy
    on leave
      stop enemy
    always
      move enemy left 1
    go to rest after 2 seconds
    go to chase when player x is above enemy x
    go to chase when enemy touches player
    when player touches enemy
      stop player
  state chase
  state rest
states game
  state menu
    go to playing when space key is pressed
  state playing
`

  it('reads every kind of line', () => {
    const p = ok(MACHINE)
    const patrol = p.machines[0].states[0]
    expect(p.machines[0].thing).toBe('enemy')
    expect(p.machines[0].states.map((s) => s.name)).toEqual(['patrol', 'chase', 'rest'])
    expect([patrol.enter.length, patrol.leave.length, patrol.always.length, patrol.rules.length]).toEqual([1, 1, 1, 1])
    expect(patrol.transitions.map((t) => [t.to, t.trigger.kind])).toEqual([
      ['rest', 'after'],
      ['chase', 'condition'],
      ['chase', 'touch'],
    ])
    expect(p.machines[1].thing).toBeNull()
  })

  it('reads conditions, numbers, triggers and actions about states', () => {
    const p = ok(`${MACHINE}when enemy enters chase and game is in playing
  set enemy state to rest
  set game state to menu
when game leaves menu
  show text "{enemy state time} {game state time}"
when enemy leaves chase
  stop enemy
when enemy leaves the screen
  stop enemy
when enemy is in chase
  stop enemy
`)
    expect(p.rules[0].trigger).toMatchObject({ kind: 'stateChange', thing: 'enemy', state: 'chase', change: 'enters', guard: { kind: 'inState', thing: null, state: 'playing' } })
    expect(p.rules[0].actions).toMatchObject([{ kind: 'setState', thing: 'enemy', state: 'rest' }, { kind: 'setState', thing: null, state: 'menu' }])
    expect(p.rules[1].trigger).toMatchObject({ kind: 'stateChange', thing: null, change: 'leaves' })
    expect(p.rules[2].trigger).toMatchObject({ kind: 'stateChange', thing: 'enemy', change: 'leaves' })
    expect(p.rules[3].trigger).toMatchObject({ kind: 'leavesScreen' })
    expect(p.rules[4].trigger).toMatchObject({ kind: 'condition', condition: { kind: 'inState', state: 'chase' } })
  })

  it('finds mistakes with helpful messages', () => {
    expect(compile(`${THING}states enemy\n  state patrol\n    go to pattrol after 1 second\n`).errors[0]).toMatchObject({ code: 'unknown-state', hint: 'Did you mean "patrol"?' })
    expect(codes('states ghost\n  state a\n')).toEqual(['unknown-thing'])
    expect(codes(`${THING}always\n  set enemy state to chase\n`)).toEqual(['no-machine'])
    expect(codes(`${THING}always\n  show text "{enemy state time}"\n`)).toEqual(['no-machine'])
    expect(codes(`${THING}states enemy\n  state a\nstates enemy\n  state b\n`)).toEqual(['duplicate-machine'])
    expect(codes(`${THING}states enemy\n  state a\n    jump\n`)).toEqual(['unknown-word'])
    expect(codes(`${THING}states enemy\n  sate a\n`)).toEqual(['unknown-word'])
    expect(compile(`${THING}states enemy\n  state a\n    on enter\n`).errors[0]).toMatchObject({ code: 'expected' })
    expect(compile(`${THING}states enemy\n  state a\n    go to a\n`).errors[0]).toMatchObject({ code: 'expected' })
  })
})
