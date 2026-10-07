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

  /** @param {Expr} e */
  function walkExpr(e) {
    switch (e.kind) {
      case 'var':
        return variable(e.name, e.loc)
      case 'prop':
      case 'count':
        thing(e.thing, e.loc)
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
        thing(cond.thing, cond.loc)
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
      case 'showText':
        for (const part of a.parts) if (part.kind === 'expr') walkExpr(part.expr)
        if (a.at) {
          walkExpr(a.at.x)
          walkExpr(a.at.y)
        }
        return
    }
  }

  for (const rule of program.rules) {
    walkTrigger(rule.trigger)
    for (const action of rule.actions) walkAction(action)
  }
  return errors
}
