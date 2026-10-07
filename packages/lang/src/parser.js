// Top-level parser: game settings, variables, things and rules. See docs/spec.md section 4.2.
// One statement per line. An error inside a line skips that line; an error in a
// block header skips the whole indented block.

import { DEFAULT_GAME_SETTINGS } from './ast.js'
import { Cursor, ParseError, RESERVED, expected, fail } from './cursor.js'
import { didYouMean, miniError } from './errors.js'
import { isMouseAhead, parseKeyName, parseMouseButton, parsePadButton } from './parse-expr.js'
import { parseAction, parseColorWords, parseLook, parseTrigger } from './parse-rule.js'

/** @import { AnimationDecl, ControlDecl, MapDecl, GameSettings, InputSource, Look, Loc, Program, Rule, ThingDecl, VarDecl } from './ast.js' */
/** @import { MiniError } from './errors.js' */
/** @import { Token } from './lexer.js' */

/**
 * @typedef {object} ParseResult
 * @property {Program} program
 * @property {MiniError[]} errors
 */

const TOP_WORDS = ['game', 'thing', 'control', 'map', 'when', 'always']
const MAP_WORDS = ['tiles', 'at']
const GAME_WORDS = ['size', 'pixel', 'background', 'gravity', 'touch']
const THING_WORDS = ['looks', 'animation', 'size', 'starts', 'solid', 'fixed', 'falls', 'camera']

/**
 * @param {Token[]} tokens
 * @returns {ParseResult}
 */
export function parse(tokens) {
  return new Parser(tokens).run()
}

class Parser {
  /** @param {Token[]} tokens */
  constructor(tokens) {
    this.c = new Cursor(tokens)
    /** @type {MiniError[]} */
    this.errors = []
    /** @type {GameSettings} */
    this.game = { ...DEFAULT_GAME_SETTINGS, loc: null }
    /** @type {VarDecl[]} */
    this.vars = []
    /** @type {ThingDecl[]} */
    this.things = []
    /** @type {ControlDecl[]} */
    this.controls = []
    /** @type {MapDecl[]} */
    this.maps = []
    /** @type {Rule[]} */
    this.rules = []
  }

  /** @returns {ParseResult} */
  run() {
    const c = this.c
    while (c.peek().kind !== 'eof') {
      const t = c.peek()
      if (t.kind === 'newline' || t.kind === 'dedent') {
        c.next()
        continue
      }
      if (t.kind === 'indent') {
        this.unexpectedIndent()
        continue
      }
      try {
        this.statement()
      } catch (e) {
        this.record(e)
        c.skipBlock()
      }
    }
    return {
      program: {
        game: this.game,
        vars: this.vars,
        things: this.things,
        controls: this.controls,
        maps: this.maps,
        rules: this.rules,
      },
      errors: this.errors,
    }
  }

  /** @param {unknown} e */
  record(e) {
    if (!(e instanceof ParseError)) throw e
    this.errors.push(e.error)
  }

  /** Report an indented block nobody asked for and skip it. */
  unexpectedIndent() {
    const c = this.c
    this.errors.push(
      miniError(
        'indent-unexpected',
        c.peek().loc,
        'This line is indented more than I expected.',
        'Only indent lines that belong to the line above, like the actions under a "when".',
      ),
    )
    let depth = 0
    while (c.peek().kind !== 'eof') {
      const t = c.next()
      if (t.kind === 'indent') depth++
      else if (t.kind === 'dedent' && --depth === 0) return
    }
  }

  /**
   * After a header line: parse each line of its indented block (if any) with `line`.
   * @param {() => void} line
   * @returns {boolean} whether there was a block
   */
  block(line) {
    const c = this.c
    if (c.peek().kind !== 'indent') return false
    c.next()
    while (c.peek().kind !== 'dedent' && c.peek().kind !== 'eof') {
      if (c.peek().kind === 'indent') {
        this.unexpectedIndent()
        continue
      }
      try {
        line()
        c.expectEndOfLine()
      } catch (e) {
        this.record(e)
        c.skipLine()
      }
    }
    if (c.peek().kind === 'dedent') c.next()
    return true
  }

  statement() {
    const c = this.c
    const t = c.peek()
    if (t.kind !== 'word') throw expected(t, 'game, thing, when or always')
    switch (t.text) {
      case 'game':
        return this.gameBlock()
      case 'thing':
        return this.thingBlock()
      case 'control':
        return this.controlBlock()
      case 'map':
        return this.mapBlock()
      case 'when':
      case 'always':
        return this.ruleBlock()
    }
    if (c.isWord('starts', 1)) return this.variable()
    throw fail(
      'unknown-word',
      t.loc,
      `I don't know what "${t.text}" means here.`,
      didYouMean(t.text, TOP_WORDS) ??
        'Lines at the left edge start with game, thing, control, map, when, always, or a name followed by "starts at".',
    )
  }

  /**
   * A name being declared. Reserved words are reported (not thrown) so parsing goes on.
   * @param {string} what
   * @param {string} example suffix for the hint's example name, e.g. "wall" -> left-wall
   * @returns {string}
   */
  declaredName(what, example) {
    const t = this.c.peek()
    if (t.kind !== 'word') throw expected(t, what)
    this.c.next()
    if (RESERVED.has(t.text)) {
      this.errors.push(
        miniError(
          'name-clash',
          t.loc,
          `"${t.text}" is a special word in minijs, so it can't be a name.`,
          `Pick another name, like ${t.text}-${example}.`,
        ),
      )
    }
    return t.text
  }

  gameBlock() {
    const c = this.c
    const word = c.next()
    if (this.game.loc !== null) {
      throw fail('duplicate-game', word.loc, 'There is more than one "game" block.', 'Put all game settings in one block.')
    }
    c.expectEndOfLine()
    this.game.loc = word.loc
    const game = this.game
    this.block(() => {
      const t = c.peek()
      if (c.acceptWord('size')) {
        game.width = c.expectPositive('a width')
        c.expectWord('by')
        game.height = c.expectPositive('a height')
      } else if (c.acceptWords('pixel', 'art')) {
        game.pixelArt = true
      } else if (c.acceptWords('touch', 'buttons')) {
        game.touchButtons = true
      } else if (c.acceptWord('background')) {
        game.background = parseColorWords(c, 'a color')
      } else if (c.acceptWord('gravity')) {
        const at = c.peek()
        const value = c.expectNumber()
        if (value < 0) {
          throw fail('bad-number', at.loc, `"${value}" is too small here.`, 'Use 0 or a bigger number.')
        }
        game.gravity = value
      } else {
        throw this.unknownLine(t, GAME_WORDS)
      }
    })
  }

  thingBlock() {
    const c = this.c
    const word = c.next()
    const name = this.declaredName('a name for the thing', 'wall')
    c.expectEndOfLine()
    /** @type {Look | null} */
    let look = null
    // A broken "looks like" line already has its own error; don't also say the look is missing.
    let triedLook = false
    /** @type {ThingDecl} */
    const thing = {
      name,
      look: { kind: 'box', color: 'white', w: 10, h: 10, loc: word.loc },
      animations: [],
      size: null,
      starts: [],
      solid: false,
      fixed: false,
      falls: false,
      cameraFollows: false,
      loc: word.loc,
    }
    this.block(() => {
      const t = c.peek()
      if (c.acceptWords('looks', 'like')) {
        triedLook = true
        const parsed = parseLook(c)
        if (look !== null) {
          throw fail(
            'duplicate-look',
            t.loc,
            `The thing "${name}" has more than one "looks like" line.`,
            `Keep one. To change its look during the game, use: change ${name} to look like ...`,
          )
        }
        look = parsed
      } else if (c.acceptWord('animation')) {
        thing.animations.push(this.animation(t.loc))
      } else if (c.acceptWord('size')) {
        const w = c.expectPositive('a width')
        c.expectWord('by')
        thing.size = { w, h: c.expectPositive('a height') }
      } else if (c.acceptWord('starts')) {
        c.expectWord('at')
        const x = c.expectNumber()
        if (c.peek().kind !== 'comma') throw expected(c.peek(), 'a comma', 'Write a position like: starts at 40, 100')
        c.next()
        thing.starts.push({ x, y: c.expectNumber(), loc: t.loc })
      } else if (c.acceptWord('solid')) {
        thing.solid = true
      } else if (c.acceptWord('fixed')) {
        thing.fixed = true
      } else if (c.acceptWord('falls')) {
        thing.falls = true
      } else if (c.acceptWords('camera', 'follows')) {
        thing.cameraFollows = true
      } else {
        throw this.unknownLine(t, THING_WORDS)
      }
    })
    if (look === null && !triedLook) {
      this.errors.push(
        miniError(
          'missing-look',
          word.loc,
          `The thing "${name}" needs a look.`,
          'Add a line like: looks like gold circle 4',
        ),
      )
    } else if (look !== null) {
      thing.look = look
    }
    this.things.push(thing)
  }

  /**
   * `animation NAME "a.png", "b.png" at N fps`, after `animation` was consumed.
   * @param {Loc} loc
   * @returns {AnimationDecl}
   */
  animation(loc) {
    const c = this.c
    const name = this.declaredName('a name for the animation', 'move')
    const frames = [c.expectString('a picture in quotes, like "walk-1.png"').text]
    while (c.peek().kind === 'comma') {
      c.next()
      frames.push(c.expectString('a picture in quotes').text)
    }
    c.expectWord('at', 'Write it like: animation walk "a.png", "b.png" at 8 fps')
    const fps = c.expectPositive('a speed')
    c.expectWord('fps')
    return { name, frames, fps, loc }
  }

  controlBlock() {
    const c = this.c
    const word = c.next()
    const name = this.declaredName('a name for the control', 'button')
    c.expectEndOfLine()
    /** @type {InputSource[]} */
    const sources = []
    const hasBlock = this.block(() => {
      sources.push(parseSource(c))
    })
    if (!hasBlock) {
      this.errors.push(
        miniError(
          'expected',
          word.loc,
          'I expected some keys or buttons under this line.',
          'Put them on the next lines, indented, like: space key',
        ),
      )
    }
    this.controls.push({ name, sources, loc: word.loc })
  }

  mapBlock() {
    const c = this.c
    const word = c.next()
    c.expectEndOfLine()
    /** @type {MapDecl} */
    const map = { x: 0, y: 0, tileW: 16, tileH: 16, rows: [], legend: [], loc: word.loc }
    const hasBlock = this.block(() => {
      const t = c.peek()
      if (t.kind === 'string') {
        c.next()
        if (c.acceptWord('is')) {
          if ([...t.text].length !== 1) {
            throw fail(
              'map-letter',
              t.loc,
              'A map letter must be exactly one character.',
              'Write it like: "#" is wall',
            )
          }
          if (t.text === '.' || t.text === ' ') {
            throw fail('map-letter', t.loc, `"${t.text}" always means an empty tile.`, 'Pick another letter, like "#".')
          }
          if (c.isWord('a') || c.isWord('an') || c.isWord('the')) c.next()
          map.legend.push({ char: t.text, thing: c.expectName('the name of a thing').text, loc: t.loc })
        } else {
          map.rows.push({ text: t.text, loc: t.loc })
        }
      } else if (c.acceptWord('tiles')) {
        map.tileW = c.expectPositive('a tile width')
        c.expectWord('by')
        map.tileH = c.expectPositive('a tile height')
      } else if (c.acceptWord('at')) {
        map.x = c.expectNumber()
        if (c.peek().kind !== 'comma') throw expected(c.peek(), 'a comma', 'Write a position like: at 0, 0')
        c.next()
        map.y = c.expectNumber()
      } else {
        throw this.unknownLine(t, MAP_WORDS)
      }
    })
    if (!hasBlock || map.rows.length === 0) {
      this.errors.push(
        miniError(
          'expected',
          word.loc,
          'I expected the rows of the map under this line.',
          'Put each row in quotes, like: "#..c..#", then say what each letter is, like: "#" is wall',
        ),
      )
    }
    this.maps.push(map)
  }

  ruleBlock() {
    const c = this.c
    const word = c.next()
    const trigger = word.text === 'always' ? { kind: /** @type {const} */ ('always'), loc: word.loc } : parseTrigger(c)
    if (c.isWord('or') && trigger.kind !== 'condition' && trigger.kind !== 'always') {
      throw fail(
        'expected',
        c.peek().loc,
        '"or" can\'t join two events, like two key presses.',
        'Make a control that lists both keys or buttons, then use it: when my-control is pressed',
      )
    }
    c.expectEndOfLine()
    /** @type {Rule} */
    const rule = { trigger, actions: [], loc: word.loc }
    const hasBlock = this.block(() => {
      rule.actions.push(parseAction(c))
    })
    if (!hasBlock) {
      // Reported, not thrown: the end of the line is already consumed, so recovery must not skip more.
      this.errors.push(
        miniError('expected', word.loc, 'I expected some actions under this line.', 'Put the actions on the next lines, indented.'),
      )
      return
    }
    this.rules.push(rule)
  }

  variable() {
    const c = this.c
    const t = c.peek()
    const name = this.declaredName('a name', 'count')
    c.expectWord('starts')
    c.expectWord('at')
    const initial = c.expectNumber()
    c.expectEndOfLine()
    this.vars.push({ name, initial, loc: t.loc })
  }

  /**
   * @param {Token} t first token of the line
   * @param {string[]} words keywords valid in this block
   */
  unknownLine(t, words) {
    if (t.kind !== 'word') return expected(t, `a setting like "${words[0]}"`)
    return fail('unknown-word', t.loc, `I don't know what "${t.text}" means here.`, didYouMean(t.text, words))
  }
}

/**
 * One line of a control block: `space key`, `any key`, `right mouse`, `gamepad 2 a`.
 * @param {Cursor} c
 * @returns {InputSource}
 */
function parseSource(c) {
  if (c.isWord('gamepad')) {
    const { pad, button } = parsePadButton(c)
    return { kind: 'pad', pad, button }
  }
  if (c.isWord('mouse') || (isMouseAhead(c) && !c.isWord('mouse'))) {
    return { kind: 'mouse', button: parseMouseButton(c) }
  }
  if (c.isWord('key', 1)) {
    const key = parseKeyName(c)
    c.expectWord('key')
    return { kind: 'key', key }
  }
  throw expected(c.peek(), 'a key or button, like "space key", "mouse" or "gamepad a"')
}
