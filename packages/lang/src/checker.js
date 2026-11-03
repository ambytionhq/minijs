// Name resolution and cross-checks over a parsed Program. See docs/spec.md section 4.7.

import { didYouMean, miniError } from './errors.js'

/** @import { Action, Condition, Expr, Loc, Program, Trigger } from './ast.js' */
/** @import { MiniError } from './errors.js' */

/**
 * @param {Program} program
 * @returns {MiniError[]}
 */
export function check(program) {
  /** @type {MiniError[]} */
  const errors = []
  /** @type {Map<string, string[]>} thing name -> its animation names */
  const things = new Map()
  /** @type {Set<string>} */
  const vars = new Set()

  for (const t of program.things) {
    if (things.has(t.name)) {
      errors.push(
        miniError('duplicate-thing', t.loc, `There are two things called "${t.name}".`, 'Give each thing its own name.'),
      )
    } else {
      things.set(
        t.name,
        t.animations.map((a) => a.name),
      )
    }
  }
  for (const v of program.vars) {
    if (vars.has(v.name)) {
      errors.push(
        miniError(
          'duplicate-variable',
          v.loc,
          `There are two numbers called "${v.name}".`,
          'Give each number its own name.',
        ),
      )
    } else {
      vars.add(v.name)
    }
  }
  for (const v of program.vars) {
    if (things.has(v.name)) {
      errors.push(
        miniError('name-clash', v.loc, `"${v.name}" is used as both a thing and a number.`, 'Rename one of them.'),
      )
    }
  }
  /** @type {Set<string>} */
  const controls = new Set()
  for (const ctl of program.controls) {
    if (controls.has(ctl.name)) {
      errors.push(
        miniError(
          'duplicate-control',
          ctl.loc,
          `There are two controls called "${ctl.name}".`,
          'Put all its keys and buttons in one control block.',
        ),
      )
    } else if (things.has(ctl.name) || vars.has(ctl.name)) {
      errors.push(
        miniError(
          'name-clash',
          ctl.loc,
          `"${ctl.name}" is used as a control and as a ${things.has(ctl.name) ? 'thing' : 'number'}.`,
          'Rename one of them.',
        ),
      )
    } else {
      controls.add(ctl.name)
    }
  }

  for (const map of program.maps ?? []) {
    /** @type {Map<string, string>} */
    const letters = new Map()
    for (const entry of map.legend) {
      if (letters.has(entry.char)) {
        errors.push(
          miniError('map-letter', entry.loc, `"${entry.char}" is given two meanings in this map.`, 'Keep one line for each letter.'),
        )
        continue
      }
      letters.set(entry.char, entry.thing)
    }
    /** @type {Set<string>} */
    const reported = new Set()
    for (const row of map.rows) {
      const chars = [...row.text]
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i]
        if (ch === '.' || ch === ' ' || letters.has(ch) || reported.has(ch)) continue
        reported.add(ch)
        errors.push(
          miniError(
            'map-letter',
            { line: row.loc.line, col: row.loc.col + 1 + i },
            `I don't know what "${ch}" means in this map.`,
            `Add a line under the rows like: "${ch}" is wall. Use "." for empty tiles.`,
          ),
        )
      }
    }
  }

  /**
   * Names of one kind of declared asset. Each name appears once and clashes with nothing else.
   * @param {Array<{ name: string; loc: Loc }>} decls
   * @param {string} word how to say it, like "sound"
   * @returns {Set<string>}
   */
  function declared(decls, word) {
    /** @type {Set<string>} */
    const names = new Set()
    for (const d of decls) {
      if (names.has(d.name)) {
        errors.push(miniError('duplicate-name', d.loc, `There are two of the ${word} "${d.name}".`, `Give each ${word} its own name.`))
      }
      names.add(d.name)
    }
    return names
  }
  const tilemaps = declared(program.tilemaps ?? [], 'tilemap')
  const sounds = declared(program.sounds ?? [], 'sound')
  const musics = declared(program.music ?? [], 'music')
  const effects = declared(program.particles ?? [], 'particle effect')

  /** @type {Map<string | null, Set<string>>} machine owner (null is the game) -> its states */
  const machines = new Map()
  for (const m of program.machines ?? []) {
    const label = m.thing ?? 'game'
    if (machines.has(m.thing)) {
      errors.push(miniError('duplicate-machine', m.loc, `"${label}" has more than one "states" block.`, 'Put all of its states in one block.'))
      continue
    }
    /** @type {Set<string>} */
    const names = new Set()
    for (const s of m.states) {
      if (names.has(s.name)) {
        errors.push(miniError('duplicate-state', s.loc, `There are two states called "${s.name}" in "${label}".`, 'Give each state its own name.'))
      }
      names.add(s.name)
    }
    machines.set(m.thing, names)
  }

  /**
   * @param {string | null} owner
   * @param {string} state
   * @param {Loc} loc
   */
  function checkState(owner, state, loc) {
    const label = owner ?? 'game'
    const names = machines.get(owner)
    if (!names) {
      errors.push(
        miniError('no-machine', loc, `"${label}" doesn't have any states yet.`, `Add a block like: states ${label}`),
      )
      return
    }
    if (!names.has(state)) {
      errors.push(
        miniError(
          'unknown-state',
          loc,
          `"${label}" has no state called "${state}".`,
          didYouMean(state, names) ?? `Its states are: ${[...names].join(', ')}.`,
        ),
      )
    }
  }

  /**
   * @param {string} name
   * @param {Set<string>} names
   * @param {'unknown-sound' | 'unknown-music' | 'unknown-particles' | 'unknown-tilemap'} code
   * @param {string} word
   * @param {string} example
   * @param {Loc} loc
   */
  function asset(name, names, code, word, example, loc) {
    if (names.has(name)) return
    errors.push(miniError(code, loc, `I don't know the ${word} "${name}".`, didYouMean(name, names) ?? `Add a line like: ${example}`))
  }

  let camera = false
  for (const t of program.things) {
    if (!t.cameraFollows) continue
    if (camera) {
      errors.push(
        miniError(
          'multiple-cameras',
          t.loc,
          'Only one thing can have "camera follows".',
          `Remove "camera follows" from "${t.name}".`,
        ),
      )
    }
    camera = true
  }

  /**
   * @param {string} name
   * @param {Loc} loc
   * @returns {boolean} whether the thing exists
   */
  function thing(name, loc) {
    if (things.has(name)) return true
    if (vars.has(name)) {
      errors.push(miniError('unknown-thing', loc, `"${name}" is a number, not a thing.`))
    } else if (controls.has(name)) {
      errors.push(miniError('unknown-thing', loc, `"${name}" is a control, not a thing.`))
    } else if (effects.has(name)) {
      errors.push(
        miniError('unknown-thing', loc, `"${name}" is a particle effect, not a thing.`, `To stop it, write: stop ${name} on player, or: stop ${name} everywhere`),
      )
    } else {
      errors.push(
        miniError(
          'unknown-thing',
          loc,
          `I don't know what "${name}" is.`,
          didYouMean(name, things.keys()) ?? `Add a "thing ${name}" block, or check the spelling.`,
        ),
      )
    }
    return false
  }

  /**
   * @param {string} name
   * @param {Loc} loc
   */
  function variable(name, loc) {
    if (vars.has(name)) return
    if (things.has(name)) {
      errors.push(
        miniError('unknown-variable', loc, `"${name}" is a thing, not a number.`, `Did you mean "${name} x"?`),
      )
    } else if (controls.has(name)) {
      errors.push(
        miniError('unknown-variable', loc, `"${name}" is a control, not a number.`, `Did you mean "${name} is held"?`),
      )
    } else {
      errors.push(
        miniError(
          'unknown-variable',
          loc,
          `I don't know what "${name}" is.`,
          didYouMean(name, vars) ?? `Make it first with a line like: ${name} starts at 0`,
        ),
      )
    }
  }

  /**
   * @param {string} name
   * @param {Loc} loc
   */
  function control(name, loc) {
    if (controls.has(name)) return
    if (things.has(name) || vars.has(name)) {
      const kind = things.has(name) ? 'thing' : 'number'
      errors.push(
        miniError(
          'unknown-control',
          loc,
          `"${name}" is a ${kind}, not a control.`,
          kind === 'number' ? `To compare it, write something like: ${name} is 3` : null,
        ),
      )
      return
    }
    errors.push(
      miniError(
        'unknown-control',
        loc,
        `I don't know the control "${name}".`,
        didYouMean(name, controls) ?? `Make it first with a block like: control ${name}`,
      ),
    )
  }

  /** @param {Expr} e */
  function walkExpr(e) {
    switch (e.kind) {
      case 'var':
        return variable(e.name, e.loc)
      case 'prop':
        // `tile x` and `tile y` mean the tile a rule just touched, unless a thing is called tile.
        if (e.thing === 'tile' && !things.has('tile') && (e.prop === 'x' || e.prop === 'y')) return
        thing(e.thing, e.loc)
        return
      case 'count':
        thing(e.thing, e.loc)
        return
      case 'stateTime':
        if (e.thing !== null) thing(e.thing, e.loc)
        if (!machines.has(e.thing)) {
          errors.push(miniError('no-machine', e.loc, `"${e.thing ?? 'game'}" doesn't have any states yet.`, `Add a block like: states ${e.thing ?? 'game'}`))
        }
        return
      case 'random':
        walkExpr(e.min)
        walkExpr(e.max)
        return
      case 'binary':
        walkExpr(e.left)
        walkExpr(e.right)
        return
    }
  }

  /** @param {Condition | null} cond */
  function walkCondition(cond) {
    if (cond === null) return
    switch (cond.kind) {
      case 'compare':
        walkExpr(cond.left)
        walkExpr(cond.right)
        return
      case 'onGround':
      case 'mouseOver':
        thing(cond.thing, cond.loc)
        return
      case 'controlHeld':
        control(cond.name, cond.loc)
        return
      case 'inState':
        if (cond.thing !== null && !thing(cond.thing, cond.loc)) return
        checkState(cond.thing, cond.state, cond.loc)
        return
      case 'onTile':
      case 'touchingTile':
        thing(cond.thing, cond.loc)
        return
      case 'tileAt':
        walkExpr(cond.x)
        walkExpr(cond.y)
        return
      case 'and':
      case 'or':
        walkCondition(cond.left)
        walkCondition(cond.right)
        return
      case 'not':
        walkCondition(cond.operand)
        return
    }
  }

  /** @param {Trigger} t */
  function walkTrigger(t) {
    switch (t.kind) {
      case 'always':
        return
      case 'condition':
        return walkCondition(t.condition)
      case 'mouseClick':
        if (t.thing !== null) thing(t.thing, t.loc)
        break
      case 'touch':
        thing(t.a, t.loc)
        thing(t.b, t.loc)
        break
      case 'leavesScreen':
        thing(t.thing, t.loc)
        break
      case 'touchTile':
        thing(t.thing, t.loc)
        break
      case 'stateChange':
        if (t.thing === null || thing(t.thing, t.loc)) checkState(t.thing, t.state, t.loc)
        break
      case 'control':
        control(t.name, t.loc)
        break
    }
    walkCondition(t.guard)
  }

  /** @param {Action} a */
  function walkAction(a) {
    switch (a.kind) {
      case 'move':
      case 'push':
        thing(a.thing, a.loc)
        return walkExpr(a.amount)
      case 'halt':
      case 'remove':
      case 'changeLook':
      case 'stopAnimation':
        thing(a.thing, a.loc)
        return
      case 'setProp':
        thing(a.thing, a.loc)
        return walkExpr(a.value)
      case 'setVar':
        variable(a.name, a.loc)
        return walkExpr(a.value)
      case 'addVar':
      case 'subtractVar':
        walkExpr(a.amount)
        return variable(a.name, a.loc)
      case 'make':
        thing(a.thing, a.loc)
        walkExpr(a.x)
        return walkExpr(a.y)
      case 'playAnimation': {
        if (!thing(a.thing, a.loc)) return
        const names = /** @type {string[]} */ (things.get(a.thing))
        if (!names.includes(a.animation)) {
          errors.push(
            miniError(
              'unknown-animation',
              a.loc,
              `"${a.thing}" has no animation called "${a.animation}".`,
              didYouMean(a.animation, names) ??
                `Add a line like: animation ${a.animation} "a.png", "b.png" at 8 fps`,
            ),
          )
        }
        return
      }
      case 'playSound':
        asset(a.name, sounds, 'unknown-sound', 'sound', `sound ${a.name} like coin`, a.loc)
        if (a.volume) walkExpr(a.volume)
        if (a.pitch) walkExpr(a.pitch)
        if (a.from !== null) thing(a.from, a.loc)
        return
      case 'playMusic':
        asset(a.name, musics, 'unknown-music', 'music', `music ${a.name} "${a.name}.music"`, a.loc)
        return
      case 'stopMusic':
        // An older game may have a thing called music: "stop music" still stops that thing.
        if (things.has('music')) {
          Object.assign(a, { kind: 'halt', thing: 'music' })
        }
        return
      case 'setVolume':
        return walkExpr(a.value)
      case 'burst':
      case 'startParticles':
        asset(a.name, effects, 'unknown-particles', 'particle effect', `particles ${a.name} like sparkle`, a.loc)
        if (a.thing !== null) thing(a.thing, a.loc)
        if (a.x) walkExpr(a.x)
        if (a.y) walkExpr(a.y)
        return
      case 'stopParticles':
        asset(a.name, effects, 'unknown-particles', 'particle effect', `particles ${a.name} like sparkle`, a.loc)
        if (a.thing !== null) thing(a.thing, a.loc)
        return
      case 'setState':
        if (a.thing === null || thing(a.thing, a.loc)) checkState(a.thing, a.state, a.loc)
        return
      case 'setTile':
        if (a.x) walkExpr(a.x)
        if (a.y) walkExpr(a.y)
        return
      case 'showTilemap':
      case 'switchTilemap':
        asset(a.name, tilemaps, 'unknown-tilemap', 'tilemap', `tilemap ${a.name} "${a.name}.tilemap"`, a.loc)
        return
      case 'log':
        for (const part of a.parts) if (part.kind === 'expr') walkExpr(part.expr)
        return
      case 'showText':
        for (const part of a.parts) if (part.kind === 'expr') walkExpr(part.expr)
        if (a.at) {
          walkExpr(a.at.x)
          walkExpr(a.at.y)
        }
        return
    }
  }

  for (const map of program.maps ?? []) {
    for (const entry of map.legend) thing(entry.thing, entry.loc)
  }

  for (const rule of program.rules) {
    walkTrigger(rule.trigger)
    for (const action of rule.actions) walkAction(action)
  }

  for (const m of program.machines ?? []) {
    if (m.thing !== null) thing(m.thing, m.loc)
    /** @param {string} to @param {Loc} loc */
    const target = (to, loc) => {
      const names = machines.get(m.thing)
      if (names && !names.has(to)) checkState(m.thing, to, loc)
    }
    for (const s of m.states) {
      for (const a of [...s.enter, ...s.leave, ...s.always]) walkAction(a)
      for (const r of s.rules) {
        walkTrigger(r.trigger)
        for (const a of r.actions) walkAction(a)
      }
      for (const t of s.transitions) {
        target(t.to, t.loc)
        walkTrigger(t.trigger)
      }
    }
  }
  return errors
}
