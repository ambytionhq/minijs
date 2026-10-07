// CodeMirror editor with minijs problems shown as underlines.

import { syntaxHighlighting } from '@codemirror/language'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { classHighlighter } from '@lezer/highlight'
import { basicSetup } from 'codemirror'
import { indentWithTab } from '@codemirror/commands'
import { miniLanguage } from './mini-language.js'

/** @import { MiniError } from '@minijs/lang' */
/** @import { Diagnostic } from '@codemirror/lint' */
/** @import { Text } from '@codemirror/state' */

/**
 * @typedef {object} Editor
 * @property {() => string} getText
 * @property {(text: string) => void} setText
 * @property {(fn: (text: string) => void) => void} onChange
 * @property {(errors: MiniError[]) => void} setProblems
 * @property {(line: number, col: number) => void} jumpTo
 * @property {(text: string, mini: boolean) => void} load Open another file: new text, fresh undo history.
 * @property {() => void} focus
 */

/**
 * Document offset for a 1-based line and column, clamped into the document.
 * @param {Text} doc
 * @param {number} line
 * @param {number} col
 */
function offsetOf(doc, line, col) {
  const l = doc.line(Math.min(Math.max(line, 1), doc.lines))
  return Math.min(l.from + Math.max(col, 1) - 1, l.to)
}

/**
 * Underline from the problem to the end of its word (or the end of the line).
 * @param {Text} doc
 * @param {MiniError} error
 * @returns {Diagnostic}
 */
export function toDiagnostic(doc, error) {
  let from = offsetOf(doc, error.line, error.col)
  const line = doc.lineAt(from)
  // Name problems point at the start of the action ("remove the cion"); underline the name itself.
  const named = /"([a-z][a-z0-9_-]*)"/.exec(error.message)
  if (named) {
    const at = new RegExp(`(?<![A-Za-z0-9_-])${named[1]}(?![A-Za-z0-9_-])`, 'i').exec(line.text.slice(from - line.from))
    if (at) from += at.index
  }
  const rest = line.text.slice(from - line.from)
  const word = /^(?:"[^"]*"?|[^\s,]+)/.exec(rest)
  let to = word ? from + word[0].length : line.to
  // Indentation problems point at column 1: underline the whole line.
  if (error.col === 1 && /^\s/.test(rest)) to = line.to
  // Problems at the very end of a line still need something visible.
  if (to <= from) to = Math.min(from + 1, doc.length)
  return {
    from,
    to: Math.max(to, from),
    severity: 'error',
    message: error.hint ? `${error.message} ${error.hint}` : error.message,
  }
}

/**
 * @param {HTMLElement} parent
 * @param {string} initial
 * @returns {Editor}
 */
export function createEditor(parent, initial) {
  /** @type {Array<(text: string) => void>} */
  const listeners = []
  let silent = false
  const language = new Compartment()
  /** @param {boolean} mini */
  const languageFor = (mini) => (mini ? [miniLanguage, syntaxHighlighting(classHighlighter)] : [])

  /**
   * @param {string} doc
   * @param {boolean} mini
   */
  const stateFor = (doc, mini) =>
    EditorState.create({
      doc,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        language.of(languageFor(mini)),
        lintGutter(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'File contents' }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || silent) return
          const text = update.state.doc.toString()
          for (const fn of listeners) fn(text)
        }),
      ],
    })

  const view = new EditorView({ parent, state: stateFor(initial, true) })

  return {
    getText: () => view.state.doc.toString(),
    setText(text) {
      silent = true
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
      silent = false
    },
    load(text, mini) {
      view.setState(stateFor(text, mini))
    },
    onChange: (fn) => {
      listeners.push(fn)
    },
    setProblems(errors) {
      const doc = view.state.doc
      view.dispatch(setDiagnostics(view.state, errors.map((e) => toDiagnostic(doc, e))))
    },
    jumpTo(line, col) {
      const pos = offsetOf(view.state.doc, line, col)
      view.dispatch({
        selection: EditorSelection.cursor(pos),
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      })
      view.focus()
    },
    focus: () => view.focus(),
  }
}
