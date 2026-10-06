// MiniError is the single error shape used by both the language and the runtime.
// Wording is product surface: messages are plain sentences written for people
// who do not code. See docs/spec.md section 4.7.

import type { Loc } from './ast.ts'

export type LangErrorCode =
  | 'indent-mixed'
  | 'indent-uneven'
  | 'indent-unexpected'
  | 'unknown-word'
  | 'expected'
  | 'unterminated-string'
  | 'bad-number'
  | 'unknown-thing'
  | 'unknown-variable'
  | 'unknown-animation'
  | 'unknown-key'
  | 'unknown-color'
  | 'duplicate-thing'
  | 'duplicate-variable'
  | 'name-clash'
  | 'missing-look'
  | 'duplicate-look'
  | 'multiple-cameras'
  | 'duplicate-game'

export type RuntimeErrorCode = 'image-missing' | 'too-many-things' | 'runtime-math'

export type MiniErrorCode = LangErrorCode | RuntimeErrorCode

export interface MiniError {
  code: MiniErrorCode
  message: string
  hint: string | null
  line: number
  col: number
}

export function miniError(
  code: MiniErrorCode,
  loc: Loc,
  message: string,
  hint: string | null = null,
): MiniError {
  return { code, message, hint, line: loc.line, col: loc.col }
}

/** Human readable one-line form, e.g. for console output. */
export function formatError(error: MiniError): string {
  const where = `line ${error.line}, column ${error.col}`
  return error.hint
    ? `${where}: ${error.message} ${error.hint}`
    : `${where}: ${error.message}`
}

/** Classic Levenshtein edit distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost)
    }
    const swap = prev
    prev = curr
    curr = swap
  }
  return prev[b.length]!
}

/**
 * Closest candidate within edit distance 2, or null.
 * Ties resolve to the earliest candidate so suggestions are deterministic.
 */
export function suggest(word: string, candidates: Iterable<string>): string | null {
  let best: string | null = null
  let bestDistance = 3
  for (const candidate of candidates) {
    const distance = editDistance(word, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

/** Standard hint text for a suggestion, or null when there is none. */
export function didYouMean(word: string, candidates: Iterable<string>): string | null {
  const match = suggest(word, candidates)
  return match === null ? null : `Did you mean "${match}"?`
}
