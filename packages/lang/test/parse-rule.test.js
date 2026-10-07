import { describe, expect, it } from 'vitest'
import { parseAction, parseLook, parseTrigger } from '../src/parse-rule.js'
import { cursor, parseErrorOf, strip } from './helpers.js'

/** @param {string} src */
const trig = (src) => strip(parseTrigger(cursor(src)))
/** @param {string} src */
const act = (src) => strip(parseAction(cursor(src)))
/** @param {string} src */
const look = (src) => strip(parseLook(cursor(src)))

const n = (/** @type {number} */ value) => ({ kind: 'number', value })
const v = (/** @type {string} */ name) => ({ kind: 'var', name })

describe('triggers', () => {
  it('parses every event trigger', () => {
    expect(trig('game starts')).toEqual({ kind: 'gameStarts', guard: null })
    expect(trig('mouse is clicked')).toEqual({ kind: 'mouseClick', button: 'left', state: 'pressed', thing: null, guard: null })
    expect(trig('mouse is clicked on the button')).toEqual({
      kind: 'mouseClick',
      button: 'left',
      state: 'pressed',
      thing: 'button',
      guard: null,
    })
    expect(trig('every 2 seconds')).toEqual({ kind: 'every', seconds: 2, guard: null })
    expect(trig('every 1 second')).toEqual({ kind: 'every', seconds: 1, guard: null })
    expect(trig('after 0.5 seconds')).toEqual({ kind: 'after', seconds: 0.5, guard: null })
    expect(trig('space key is pressed')).toEqual({ kind: 'key', key: 'space', state: 'pressed', guard: null })
    expect(trig('left key is held')).toEqual({ kind: 'key', key: 'left', state: 'held', guard: null })
    expect(trig('q key is released')).toEqual({ kind: 'key', key: 'q', state: 'released', guard: null })
    expect(trig('the player touches the coin')).toEqual({ kind: 'touch', a: 'player', b: 'coin', guard: null })
    expect(trig('player touches coin')).toEqual({ kind: 'touch', a: 'player', b: 'coin', guard: null })
    expect(trig('rock leaves the screen')).toEqual({ kind: 'leavesScreen', thing: 'rock', guard: null })
    expect(trig('the rock leaves screen')).toEqual({ kind: 'leavesScreen', thing: 'rock', guard: null })
  })
  it('accepts guards on event triggers', () => {
    expect(trig('up key is pressed and player is on ground')).toEqual({
      kind: 'key',
      key: 'up',
      state: 'pressed',
      guard: { kind: 'onGround', thing: 'player' },
    })
    expect(trig('left key is held and score is 3')).toMatchObject({ kind: 'key', state: 'held' })
    expect(trig('player touches coin and score is below 5')).toMatchObject({ kind: 'touch', guard: { op: 'below' } })
  })
  it('falls back to a condition', () => {
    expect(trig('score is 10')).toEqual({
      kind: 'condition',
      condition: { kind: 'compare', op: 'is', left: v('score'), right: n(10) },
    })
  })
  it('rejects zero seconds', () => {
    expect(parseErrorOf(() => parseTrigger(cursor('every 0 seconds')))).toEqual({
      code: 'bad-number',
      message: '"0" is too small here.',
      hint: 'Use a number bigger than 0.',
      line: 1,
      col: 7,
    })
  })
  it('reports a bad key state', () => {
    expect(parseErrorOf(() => parseTrigger(cursor('up key is down')))).toMatchObject({
      code: 'expected',
      message: 'I expected "pressed", "held" or "released" here, but found "down".',
    })
  })
})

describe('actions', () => {
  it('parses movement', () => {
    expect(act('move player left 2')).toEqual({ kind: 'move', thing: 'player', dir: 'left', amount: n(2) })
    expect(act('move the player right 2 * speed')).toMatchObject({ kind: 'move', dir: 'right', amount: { op: '*' } })
    expect(act('push player up 7')).toEqual({ kind: 'push', thing: 'player', dir: 'up', amount: n(7) })
  })
  it('parses the stop family', () => {
    expect(act('stop game')).toEqual({ kind: 'stopGame' })
    expect(act('stop animation on the player')).toEqual({ kind: 'stopAnimation', thing: 'player' })
    expect(act('stop the player')).toEqual({ kind: 'halt', thing: 'player' })
    expect(act('stop player')).toEqual({ kind: 'halt', thing: 'player' })
    expect(act('restart game')).toEqual({ kind: 'restartGame' })
  })
  it('parses set, add and subtract', () => {
    expect(act('set player x to 10')).toEqual({ kind: 'setProp', thing: 'player', prop: 'x', value: n(10) })
    expect(act('set the ball vy to -3')).toEqual({ kind: 'setProp', thing: 'ball', prop: 'vy', value: n(-3) })
    expect(act('set score to 0')).toEqual({ kind: 'setVar', name: 'score', value: n(0) })
    expect(act('add 1 to score')).toEqual({ kind: 'addVar', name: 'score', amount: n(1) })
    expect(act('subtract 1 from lives')).toEqual({ kind: 'subtractVar', name: 'lives', amount: n(1) })
  })
  it('only sets x, y, vx or vy', () => {
    expect(parseErrorOf(() => parseAction(cursor('set player width to 3')))).toEqual({
      code: 'expected',
      message: 'I expected x, y, vx or vy here, but found "width".',
      hint: 'You can only set x, y, vx or vy.',
      line: 1,
      col: 12,
    })
  })
  it('parses make and remove', () => {
    expect(act('make a coin at random 0 to 600, 140')).toEqual({
      kind: 'make',
      thing: 'coin',
      x: { kind: 'random', min: n(0), max: n(600) },
      y: n(140),
    })
    expect(act('make an enemy at 1, 2')).toMatchObject({ thing: 'enemy' })
    expect(act('make rock at player x, player y - 4')).toMatchObject({ thing: 'rock', y: { op: '-' } })
    expect(act('make a at 1, 2')).toMatchObject({ thing: 'a' })
    expect(act('remove the coin')).toEqual({ kind: 'remove', thing: 'coin' })
  })
  it('parses looks and animations', () => {
    expect(act('change player to look like red box 4 by 4')).toEqual({
      kind: 'changeLook',
      thing: 'player',
      look: { kind: 'box', color: 'red', w: 4, h: 4 },
    })
    expect(act('play walk on the player')).toEqual({ kind: 'playAnimation', thing: 'player', animation: 'walk' })
  })
  it('parses text with interpolation, position and color', () => {
    expect(act('show text "Score: {score} / {count of coin}" at 4, 4 in yellow')).toEqual({
      kind: 'showText',
      parts: [
        { kind: 'literal', text: 'Score: ' },
        { kind: 'expr', expr: v('score') },
        { kind: 'literal', text: ' / ' },
        { kind: 'expr', expr: { kind: 'count', thing: 'coin' } },
      ],
      at: { x: n(4), y: n(4) },
      color: 'yellow',
    })
    expect(act('show text "You win!"')).toEqual({
      kind: 'showText',
      parts: [{ kind: 'literal', text: 'You win!' }],
      at: null,
      color: 'white',
    })
    expect(act('show text "hi" in sky blue')).toMatchObject({ color: 'skyblue' })
  })
  it('keeps {{ and lone } as literal text', () => {
    expect(act('show text "{{not math}"')).toMatchObject({ parts: [{ kind: 'literal', text: '{not math}' }] })
  })
  it('points inner text errors inside the string', () => {
    // show text "x {scroe +}"  -> the "}" after "+" is column 22
    expect(parseErrorOf(() => parseAction(cursor('show text "x {scroe +}"')))).toMatchObject({
      code: 'expected',
      line: 1,
      col: 22,
    })
    expect(parseAction(cursor('show text "ab {score}"'))).toMatchObject({
      parts: [{}, { expr: { loc: { line: 1, col: 16 } } }],
    })
  })
  it('reports an unclosed {', () => {
    expect(parseErrorOf(() => parseAction(cursor('show text "a {score"')))).toEqual({
      code: 'expected',
      message: 'I expected "}" to close the "{" in this text.',
      hint: 'Use {score} to show a number inside text.',
      line: 1,
      col: 14,
    })
  })
  it('reports unknown actions with suggestions', () => {
    expect(parseErrorOf(() => parseAction(cursor('jmup player')))).toEqual({
      code: 'unknown-word',
      message: 'I don\'t know how to "jmup".',
      hint: 'Actions start with: move, push, stop, set, add, subtract, make, remove, change, play, show, log, restart.',
      line: 1,
      col: 1,
    })
    expect(parseErrorOf(() => parseAction(cursor('mvoe player left 2')))).toMatchObject({ hint: 'Did you mean "move"?' })
  })
  it('reports bad directions', () => {
    expect(parseErrorOf(() => parseAction(cursor('move player sideways 2')))).toMatchObject({
      code: 'expected',
      message: 'I expected a direction (left, right, up or down) here, but found "sideways".',
    })
  })
})

describe('looks', () => {
  it('parses boxes, circles and images', () => {
    expect(look('dark slate gray box 4 by 8')).toEqual({ kind: 'box', color: 'darkslategray', w: 4, h: 8 })
    expect(look('#ff8800 circle 3')).toEqual({ kind: 'circle', color: '#ff8800', r: 3 })
    expect(look('"hero.png"')).toEqual({ kind: 'image', src: 'hero.png' })
  })
  it('reports unknown colors', () => {
    expect(parseErrorOf(() => parseLook(cursor('blu box 4 by 4')))).toEqual({
      code: 'unknown-color',
      message: 'I don\'t know the color "blu".',
      hint: 'Did you mean "blue"?',
      line: 1,
      col: 1,
    })
    expect(parseErrorOf(() => parseLook(cursor('zzzzzz box 4 by 4')))).toMatchObject({
      hint: 'Try a color like red, sky blue, or #ff8800.',
    })
  })
  it('reports a missing shape', () => {
    expect(parseErrorOf(() => parseLook(cursor('red')))).toMatchObject({
      code: 'expected',
      message: 'I expected "box" or "circle" here, but found the end of the line.',
    })
  })
  it('rejects zero sizes', () => {
    expect(parseErrorOf(() => parseLook(cursor('red box 0 by 4')))).toMatchObject({ code: 'bad-number', col: 9 })
  })
})
