// Tutorial lessons. Each step says what to do, checks the compiled game, and
// can do the step for you. Checks look at the program (and, for gravity, a
// short headless run), never at exact spelling, so any working answer passes.

import { ManualInput, Simulation, StaticAssetLoader } from '@minijs/runtime'

/** @import { Action, Condition, Program, Rule } from '@minijs/lang' */

/**
 * @typedef {object} Step
 * @property {string} title
 * @property {string[]} say paragraphs; text in `backticks` is shown as code
 * @property {string} example code the step adds or changes
 * @property {(program: Program) => Promise<string | null> | string | null} check null when done, else what is missing
 * @property {(text: string) => string} apply does the step for you
 */

/**
 * @typedef {object} Lesson
 * @property {string} id
 * @property {string} title
 * @property {string} starter
 * @property {Step[]} steps
 */

/** @param {Rule} rule */
const actions = (rule) => rule.actions
/** @param {Program} p @param {(a: Action) => boolean} fn */
const anyAction = (p, fn) => p.rules.some((r) => actions(r).some(fn))

/** @param {Condition | null} c @param {(c: Condition) => boolean} fn @returns {boolean} */
function anyCondition(c, fn) {
  if (c === null) return false
  if (fn(c)) return true
  if (c.kind === 'and' || c.kind === 'or') return anyCondition(c.left, fn) || anyCondition(c.right, fn)
  if (c.kind === 'not') return anyCondition(c.operand, fn)
  return false
}

/** The thing the player controls: the first thing with a start position. @param {Program} p */
const hero = (p) => p.things.find((t) => t.starts.length > 0) ?? null

/**
 * Add `block` at the end, separated by a blank line.
 * @param {string} text
 * @param {string} block
 */
function append(text, block) {
  return `${text.replace(/\s*$/, '')}\n\n${block}\n`
}

/**
 * Add lines inside the block that starts with `header` (e.g. "game" or "thing player").
 * @param {string} text
 * @param {string} header
 * @param {string[]} lines
 */
function addToBlock(text, header, lines) {
  const all = text.split('\n')
  const at = all.findIndex((l) => l.trim().toLowerCase() === header)
  if (at < 0) return append(text, [header, ...lines.map((l) => `  ${l}`)].join('\n'))
  let end = at + 1
  while (end < all.length && (all[end].startsWith(' ') || all[end].startsWith('\t'))) end++
  all.splice(end, 0, ...lines.map((l) => `  ${l}`))
  return all.join('\n')
}

/** @param {Program} program @param {number} ticks */
async function runHeadless(program, ticks) {
  const sim = await Simulation.create(program, { input: new ManualInput(), assets: new StaticAssetLoader() })
  for (let i = 0; i < ticks; i++) sim.tick()
  return sim
}

/** @type {Lesson} */
export const FIRST_GAME = {
  id: 'first-game',
  title: 'Your first game',
  starter: `# My first minijs game.
# Lines that start with # are notes. minijs skips them.

game
  size 320 by 180
  pixel art
  background black
`,
  steps: [
    {
      title: 'Paint the sky',
      say: [
        'Every game starts with a `game` block. It sets the size of the screen and its color.',
        'Change `background black` to a color you like, such as `sky blue`, `navy` or `#ff8800`. The game on the right changes as you type.',
      ],
      example: 'background sky blue',
      check: (p) => (p.game.background !== 'black' ? null : 'The background is still black.'),
      apply: (text) => text.replace(/background\s+black/i, 'background sky blue'),
    },
    {
      title: 'Make a hero',
      say: [
        'Games are made of things. A `thing` block names one kind of thing and says how it looks.',
        '`starts at` puts one on the screen when the game begins. x counts pixels from the left, y from the top.',
      ],
      example: 'thing player\n  looks like orange box 12 by 16\n  starts at 40, 100',
      check: (p) => (hero(p) ? null : 'Add a thing with a "starts at" line so it shows up.'),
      apply: (text) => append(text, 'thing player\n  looks like orange box 12 by 16\n  starts at 40, 100'),
    },
    {
      title: 'Make it move',
      say: [
        'Rules make things happen. A rule starts with `when`, and the lines under it say what to do.',
        'Click the game, then hold the right arrow key.',
      ],
      example: 'when right key is held\n  move player right 2\n\nwhen left key is held\n  move player left 2',
      check: (p) => {
        const h = hero(p)
        if (!h) return 'Your hero is gone. Bring back the thing from the last step.'
        const moves = p.rules.some(
          (r) => (r.trigger.kind === 'key' || r.trigger.kind === 'control') && actions(r).some((a) => a.kind === 'move' && a.thing === h.name),
        )
        return moves ? null : `Add a rule that moves ${h.name} when a key is held.`
      },
      apply: (text) => {
        const name = /thing\s+([a-z][\w-]*)/i.exec(text)?.[1] ?? 'player'
        return append(text, `when right key is held\n  move ${name} right 2\n\nwhen left key is held\n  move ${name} left 2`)
      },
    },
    {
      title: 'Gravity and ground',
      say: [
        'Add `gravity 0.4` to the game block, and `falls` and `solid` to your hero.',
        'Then make some ground: a thing that is `solid` (nothing passes through it) and `fixed` (gravity leaves it alone).',
      ],
      example: 'thing ground\n  looks like seagreen box 640 by 20\n  starts at 0, 160\n  solid\n  fixed',
      check: async (p) => {
        const h = hero(p)
        if (!h) return 'Your hero is gone.'
        if (p.game.gravity <= 0) return 'Add a gravity line to the game block, like: gravity 0.4'
        if (!h.falls) return `Add "falls" to ${h.name}.`
        if (!h.solid) return `Add "solid" to ${h.name}, so it can stand on things.`
        if (!p.things.some((t) => t.solid && t.fixed && t.starts.length > 0)) return 'Make a ground thing that is solid and fixed.'
        const sim = await runHeadless(p, 180)
        const landed = sim.instancesOf(h.name).some((i) => i.onGround)
        return landed ? null : `${h.name} falls but never lands. Put the ground under it.`
      },
      apply: (text) => {
        const name = /thing\s+([a-z][\w-]*)/i.exec(text)?.[1] ?? 'player'
        let out = /gravity\s+[\d.]+/.test(text) ? text : addToBlock(text, 'game', ['gravity 0.4'])
        const extra = ['falls', 'solid'].filter((w) => !new RegExp(`^\\s+${w}\\s*$`, 'm').test(out))
        out = addToBlock(out, `thing ${name}`, extra)
        return /thing\s+ground/.test(out)
          ? out
          : append(out, 'thing ground\n  looks like seagreen box 640 by 20\n  starts at 0, 160\n  solid\n  fixed')
      },
    },
    {
      title: 'Jump',
      say: [
        '`push` gives a thing speed, and gravity slows it back down.',
        'Adding `and player is on ground` stops jumping in mid-air. Try it with the up arrow.',
      ],
      example: 'when up key is pressed and player is on ground\n  push player up 7',
      check: (p) => {
        const h = hero(p)
        if (!h) return 'Your hero is gone.'
        const jumps = p.rules.some(
          (r) =>
            'guard' in r.trigger &&
            anyCondition(r.trigger.guard, (c) => c.kind === 'onGround' && c.thing === h.name) &&
            actions(r).some((a) => a.kind === 'push' && a.dir === 'up' && a.thing === h.name),
        )
        return jumps ? null : `Add a rule that pushes ${h.name} up when a key is pressed and ${h.name} is on the ground.`
      },
      apply: (text) => {
        const name = /thing\s+([a-z][\w-]*)/i.exec(text)?.[1] ?? 'player'
        return append(text, `when up key is pressed and ${name} is on ground\n  push ${name} up 7`)
      },
    },
    {
      title: 'Coins and score',
      say: [
        'A number remembers something, like the score: `score starts at 0`.',
        'A thing with no `starts at` is a pattern you can `make` later. Make a coin every 2 seconds, and when the player touches one, remove it and add to the score.',
      ],
      example:
        'score starts at 0\n\nthing coin\n  looks like gold circle 4\n\nwhen every 2 seconds\n  make a coin at random 20 to 300, 140\n\nwhen player touches coin\n  remove the coin\n  add 1 to score',
      check: (p) => {
        if (p.vars.length === 0) return 'Add a number, like: score starts at 0'
        if (!anyAction(p, (a) => a.kind === 'make')) return 'Add a rule that makes coins.'
        const collect = p.rules.some(
          (r) => r.trigger.kind === 'touch' && actions(r).some((a) => a.kind === 'remove') && actions(r).some((a) => a.kind === 'addVar'),
        )
        return collect ? null : 'Add a "touches" rule that removes the coin and adds to the score.'
      },
      apply: (text) => {
        const name = /thing\s+([a-z][\w-]*)/i.exec(text)?.[1] ?? 'player'
        return append(
          text,
          `score starts at 0\n\nthing coin\n  looks like gold circle 4\n\nwhen every 2 seconds\n  make a coin at random 20 to 300, 140\n\nwhen ${name} touches coin\n  remove the coin\n  add 1 to score`,
        )
      },
    },
    {
      title: 'Show the score',
      say: [
        '`show text` puts words on the screen. Anything inside `{` and `}` is a number that updates by itself.',
        '`always` runs its lines every moment of the game.',
      ],
      example: 'always\n  show text "Score: {score}" at 4, 4',
      check: (p) => {
        const shows = anyAction(p, (a) => a.kind === 'showText' && a.parts.some((part) => part.kind === 'expr'))
        return shows ? null : 'Show some text with a number in {curly brackets}.'
      },
      apply: (text) => {
        const v = /^([a-z][\w-]*)\s+starts at/im.exec(text)?.[1] ?? 'score'
        return append(text, `always\n  show text "Score: {${v}}" at 4, 4`)
      },
    },
    {
      title: 'Win the game',
      say: [
        'A rule can wait for something to become true, like `when score is 5`. It runs once, the moment that happens.',
        'Show a message and `stop game`. Then collect five coins to see it.',
      ],
      example: 'when score is 5\n  show text "You win!"\n  stop game',
      check: (p) => {
        const wins = p.rules.some(
          (r) => r.trigger.kind === 'condition' && actions(r).some((a) => a.kind === 'stopGame' || a.kind === 'showText'),
        )
        return wins ? null : 'Add a rule like "when score is 5" that shows a message or stops the game.'
      },
      apply: (text) => {
        const v = /^([a-z][\w-]*)\s+starts at/im.exec(text)?.[1] ?? 'score'
        return append(text, `when ${v} is 5\n  show text "You win!"\n  stop game`)
      },
    },
  ],
}

export const LESSONS = [FIRST_GAME]
