// Changes to `states` blocks in a game's text. The states picture calls these, so the
// .mini file stays the one true copy and stays easy to read and edit by hand.

import { lex, parse } from '@minijs/lang'

/** @import { MachineDecl, Program, StateDecl } from '@minijs/lang' */

/**
 * Read a game even when other parts of it have problems.
 * @param {string} text
 * @returns {Program}
 */
export function readProgram(text) {
  return parse(lex(text).tokens).program
}

/**
 * @param {Program} program
 * @param {string | null} owner
 * @returns {MachineDecl | undefined}
 */
function findMachine(program, owner) {
  return program.machines.find((m) => m.thing === owner)
}

/** @param {string} line */
const indentOf = (line) => /^[ \t]*/.exec(line)?.[0] ?? ''

/**
 * @param {string[]} lines
 * @param {number} start index of a block's first line
 * @returns {number} index just after the block, not counting trailing blank lines
 */
function blockEnd(lines, start) {
  const indent = indentOf(lines[start]).length
  let end = start + 1
  let last = start + 1
  while (end < lines.length) {
    const line = lines[end]
    if (line.trim() === '') {
      end++
      continue
    }
    if (indentOf(line).length <= indent) break
    end++
    last = end
  }
  return last
}

/** The one indent step this file uses. @param {string[]} lines */
function indentUnit(lines) {
  for (const line of lines) {
    const indent = indentOf(line)
    if (indent.length > 0 && line.trim() !== '' && !line.trim().startsWith('#')) return indent
  }
  return '  '
}

/**
 * Where the state's own lines go, and how to indent them.
 * @param {string} text
 * @param {string | null} owner
 * @param {string} stateName
 */
function locateState(text, owner, stateName) {
  const lines = text.split('\n')
  const machine = findMachine(readProgram(text), owner)
  const state = machine?.states.find((s) => s.name === stateName)
  if (!state) return null
  const start = state.loc.line - 1
  const unit = indentUnit(lines)
  return { lines, state, start, end: blockEnd(lines, start), inner: indentOf(lines[start]) + unit, unit }
}

/**
 * Add a `states` block for a thing, or for the game when owner is null.
 * @param {string} text
 * @param {string | null} owner
 * @returns {string}
 */
export function addMachine(text, owner) {
  const lines = text.split('\n')
  const unit = indentUnit(lines)
  const block = [`states ${owner ?? 'game'}`, `${unit}state start`]
  const firstRule = lines.findIndex((line) => /^(when\b|always\b)/.test(line))
  if (firstRule === -1) {
    const trimmed = text.replace(/\s+$/, '')
    return `${trimmed}${trimmed === '' ? '' : '\n\n'}${block.join('\n')}\n`
  }
  lines.splice(firstRule, 0, ...block, '')
  return lines.join('\n')
}

/**
 * @param {string} text
 * @param {string | null} owner
 * @param {string} name
 * @returns {string}
 */
export function addState(text, owner, name) {
  const lines = text.split('\n')
  const machine = findMachine(readProgram(text), owner)
  if (!machine) return text
  const start = machine.loc.line - 1
  const end = blockEnd(lines, start)
  const unit = indentUnit(lines)
  lines.splice(end, 0, `${indentOf(lines[start])}${unit}state ${name}`)
  return lines.join('\n')
}

/**
 * Delete a state and every `go to` line that goes to it.
 * @param {string} text
 * @param {string | null} owner
 * @param {string} name
 * @returns {string}
 */
export function removeState(text, owner, name) {
  const found = locateState(text, owner, name)
  if (!found) return text
  const machine = /** @type {MachineDecl} */ (findMachine(readProgram(text), owner))
  /** @type {Set<number>} */
  const remove = new Set()
  for (let i = found.start; i < found.end; i++) remove.add(i)
  for (const s of machine.states) {
    for (const t of s.transitions) if (t.to === name) remove.add(t.loc.line - 1)
  }
  return found.lines.filter((_, i) => !remove.has(i)).join('\n')
}

/**
 * Rename a state everywhere it is mentioned: inside the block and in rules about this owner.
 * @param {string} text
 * @param {string | null} owner
 * @param {string} from
 * @param {string} to
 * @returns {string}
 */
export function renameState(text, owner, from, to) {
  const machine = findMachine(readProgram(text), owner)
  if (!machine) return text
  const lines = text.split('\n')
  const start = machine.loc.line - 1
  const end = blockEnd(lines, start)
  const name = owner ?? 'game'
  const word = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const edge = '(?![A-Za-z0-9_-])'
  const own = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentions = [
    new RegExp(`(\\b${own} is in (?:the )?)${word}${edge}`, 'gi'),
    new RegExp(`(\\b${own} (?:enters|leaves) (?:the )?)${word}${edge}`, 'gi'),
    new RegExp(`(\\bset (?:the )?${own} state to )${word}${edge}`, 'gi'),
  ]
  return lines
    .map((line, i) => {
      let out = line
      if (i > start && i < end) {
        out = out.replace(new RegExp(`^(\\s*state )${word}${edge}`, 'i'), `$1${to}`)
        out = out.replace(new RegExp(`^(\\s*go to )${word}${edge}`, 'i'), `$1${to}`)
      }
      for (const pattern of mentions) out = out.replace(pattern, `$1${to}`)
      return out
    })
    .join('\n')
}

/**
 * Make a state the one every copy starts in, by moving it to the top of its block.
 * @param {string} text
 * @param {string | null} owner
 * @param {string} name
 * @returns {string}
 */
export function makeStart(text, owner, name) {
  const found = locateState(text, owner, name)
  const machine = findMachine(readProgram(text), owner)
  if (!found || !machine || machine.states[0].name === name) return text
  const { lines } = found
  const moved = lines.slice(found.start, found.end)
  lines.splice(found.start, found.end - found.start)
  lines.splice(machine.states[0].loc.line - 1, 0, ...moved)
  return lines.join('\n')
}

/**
 * Add `go to <to> ...` under a state.
 * @param {string} text
 * @param {string | null} owner
 * @param {string} stateName
 * @param {string} condition What follows the state's name, like `after 2 seconds` or `when space key is pressed`.
 * @param {string} to
 * @returns {string}
 */
export function addTransition(text, owner, stateName, condition, to) {
  const found = locateState(text, owner, stateName)
  if (!found) return text
  found.lines.splice(found.end, 0, `${found.inner}go to ${to} ${condition}`)
  return found.lines.join('\n')
}

/**
 * @param {string} text
 * @param {string | null} owner
 * @param {string} stateName
 * @param {number} index which `go to` line, counted within the state
 * @param {string | null} line the new text of it, like `go to rest after 2 seconds`. Null deletes it.
 * @returns {string}
 */
export function changeTransition(text, owner, stateName, index, line) {
  const found = locateState(text, owner, stateName)
  const transition = found?.state.transitions[index]
  if (!found || !transition) return text
  const at = transition.loc.line - 1
  if (line === null) found.lines.splice(at, 1)
  else found.lines[at] = `${indentOf(found.lines[at])}${line.trim()}`
  return found.lines.join('\n')
}

/** @typedef {'enter' | 'leave' | 'always'} SectionName */

/**
 * The action lines under `on enter`, `on leave` or `always`, without their indent.
 * @param {string} text
 * @param {string | null} owner
 * @param {string} stateName
 * @param {SectionName} section
 * @returns {string[]}
 */
export function readSection(text, owner, stateName, section) {
  const found = locateState(text, owner, stateName)
  if (!found) return []
  const head = sectionHead(found.lines, found.start, found.end, section)
  if (head === -1) return []
  const end = blockEnd(found.lines, head)
  return found.lines.slice(head + 1, end).filter((l) => l.trim() !== '').map((l) => l.trim())
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @param {SectionName} section
 */
function sectionHead(lines, start, end, section) {
  const pattern = section === 'always' ? /^\s*always\s*(#.*)?$/ : new RegExp(`^\\s*on ${section}\\s*(#.*)?$`)
  for (let i = start + 1; i < end; i++) if (pattern.test(lines[i])) return i
  return -1
}

/**
 * Replace those action lines. No lines removes the section.
 * @param {string} text
 * @param {string | null} owner
 * @param {string} stateName
 * @param {SectionName} section
 * @param {string[]} actions
 * @returns {string}
 */
export function writeSection(text, owner, stateName, section, actions) {
  const found = locateState(text, owner, stateName)
  if (!found) return text
  const clean = actions.map((a) => a.trim()).filter((a) => a !== '')
  const { lines, start, end, inner, unit } = found
  const head = sectionHead(lines, start, end, section)
  const header = section === 'always' ? `${inner}always` : `${inner}on ${section}`
  const block = clean.length > 0 ? [header, ...clean.map((a) => `${inner}${unit}${a}`)] : []
  if (head !== -1) {
    lines.splice(head, blockEnd(lines, head) - head, ...block)
    return lines.join('\n')
  }
  // Keep the usual order: on enter first, then the rest.
  lines.splice(section === 'enter' ? start + 1 : end, 0, ...block)
  return lines.join('\n')
}

/**
 * The words of a `go to` line, for showing and editing.
 * @param {string} text
 * @param {number} line 1-based
 * @returns {string}
 */
export function lineText(text, line) {
  return (text.split('\n')[line - 1] ?? '').trim()
}

/**
 * The state's rules and `go to` lines in order, for showing as arrows.
 * @param {MachineDecl} machine
 * @returns {Array<{ from: string; to: string; index: number; line: number }>}
 */
export function arrows(machine) {
  /** @type {Array<{ from: string; to: string; index: number; line: number }>} */
  const out = []
  for (const s of machine.states) {
    s.transitions.forEach((t, index) => out.push({ from: s.name, to: t.to, index, line: t.loc.line }))
  }
  return out
}

/**
 * Put a line at the top level of a game: after what it declares, before the first rule.
 * Does nothing if it's already there.
 * @param {string} text
 * @param {string} line
 * @returns {string}
 */
export function insertDeclaration(text, line) {
  if (text.split('\n').some((l) => l.trim() === line)) return text
  const lines = text.split('\n')
  const firstBlock = lines.findIndex((l) => /^(thing|when|always|control|map|states)\b/.test(l))
  if (firstBlock === -1) {
    const trimmed = text.replace(/\s+$/, '')
    return `${trimmed}${trimmed === '' ? '' : '\n\n'}${line}\n`
  }
  // Group with other declarations of the same sort when there are some.
  const before = firstBlock > 0 && lines[firstBlock - 1].trim() === '' ? firstBlock - 1 : firstBlock
  const previous = lines[before - 1] ?? ''
  const joins = /^(tilemap|sound|music|particles)\b/.test(previous)
  lines.splice(before, 0, ...(joins || before === 0 ? [line] : ['', line]))
  return lines.join('\n')
}

/** @typedef {StateDecl} _StateDecl */
