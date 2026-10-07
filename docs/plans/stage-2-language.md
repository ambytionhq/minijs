# Stage 2: Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Status: DONE (2026-10-06, Claude Opus 5.5).** 98 new tests; `npm test` 192/192. Deviations from this plan are listed under "As built" at the bottom.

**Goal:** `compile(source)` in `@minijs/lang` turns `.mini` text into the Stage 1 `Program` AST, or a list of friendly `MiniError`s.

**Architecture:** Three pure passes. `lex` (indentation-aware tokens) -> `parse` (recursive descent, one statement per line, line-level error recovery) -> `check` (name resolution and cross-references with "did you mean" hints). `compile` runs all three and sorts errors by position. No DOM, no runtime imports.

**Tech Stack:** Plain JavaScript (ES modules, JSDoc types for docs and editor hints, no TypeScript), Vitest. No new dependencies.

**Language note (2026-10-05):** The project is plain JavaScript. Signatures and snippets below use TypeScript notation only as shorthand for shapes; write `.js` files, drop type annotations, and put types in JSDoc (`@param`, `@returns`, `@typedef`, `/** @import { X } from '...' */`).

## Read first

1. `docs/spec.md` sections 4 (language) and 4.7 (errors). Section 7 is the golden example.
2. `packages/lang/src/ast.js`: the exact output shape. Do not change it without updating `docs/spec.md`, `packages/runtime`, and `handoffs/handoff.md`.
3. `packages/lang/src/errors.js`: `miniError`, `didYouMean`, error code unions.
4. `packages/lang/src/keys.js`: `KEY_NAMES`, `isKeyName`.
5. `packages/runtime/test/build.js`: shows exactly which AST each language construct must produce.
6. `packages/runtime/test/spec-example.test.js`: `specExample` is the spec section 7 game built by hand. `compile(SPEC_EXAMPLE)` must equal it once locs are stripped; add that assertion to `compile.test.js`.

## Global Constraints

- `@minijs/lang` must never import `@minijs/runtime`.
- Output AST names are lowercase; colors are valid CSS color strings; multi-word colors joined (`sky blue` -> `skyblue`).
- Every error: `MiniError` with 1-based `line`/`col` pointing at the offending token (or the start of the line for indentation errors).
- Error wording is product surface: plain sentences, no jargon ("token", "identifier", "expression", "syntax" are banned words in messages and hints). Use the exact messages in the message catalog below.
- Error recovery: an error inside a statement skips to the end of that line; an error in a block header (`thing`, `when`, `always`, `game`) skips the whole indented block. Report all errors, capped at 50.
- `compile` returns `program: null` whenever `errors.length > 0`.
- Do not commit unless the user asks. Run `npm test` at every checkpoint.

## File map

| File | Responsibility |
|---|---|
| Create `packages/lang/src/colors.js` | CSS named colors, `isCssColor`, `normalizeColor` |
| Create `packages/lang/src/lexer.js` | `lex(source) => { tokens, errors }` |
| Create `packages/lang/src/cursor.js` | token cursor helpers, `ParseError`, `describeToken` |
| Create `packages/lang/src/parse-expr.js` | expressions and conditions |
| Create `packages/lang/src/parse-rule.js` | triggers, actions, text interpolation |
| Create `packages/lang/src/parser.js` | top-level blocks: game, variables, things, rules |
| Create `packages/lang/src/checker.js` | `check(program) => MiniError[]` |
| Create `packages/lang/src/compile.js` | `compile(source) => CompileResult` |
| Modify `packages/lang/src/index.js` | export the above |
| Tests in `packages/lang/test/` | one file per module plus `compile.test.js`, `errors.test.js` |
| Create `packages/runtime/test/integration.test.js` | compile + Simulation end to end |

---

### Task 1: Colors

**Files:**
- Create: `packages/lang/src/colors.js`
- Test: `packages/lang/test/colors.test.js`

**Interfaces (Produces):**
- `CSS_COLOR_NAMES: readonly string[]`
- `isCssColor(value: string): boolean` (named color or `#rgb` / `#rrggbb`, case-insensitive)
- `normalizeColor(words: string[]): string | null` (join words lowercase, no spaces; return valid color or null)

- [x] **Step 1: Write the failing test**

```js
import { describe, expect, it } from 'vitest'
import { CSS_COLOR_NAMES, isCssColor, normalizeColor } from '../src/colors.js'

describe('colors', () => {
  it('knows all 148 CSS named colors', () => {
    expect(CSS_COLOR_NAMES).toHaveLength(148)
    expect(isCssColor('rebeccapurple')).toBe(true)
  })
  it('accepts hex colors', () => {
    expect(isCssColor('#fff')).toBe(true)
    expect(isCssColor('#1A2b3C')).toBe(true)
    expect(isCssColor('#12345')).toBe(false)
  })
  it('joins multi-word names', () => {
    expect(normalizeColor(['sky', 'blue'])).toBe('skyblue')
    expect(normalizeColor(['Dark', 'Slate', 'Gray'])).toBe('darkslategray')
    expect(normalizeColor(['#FF8800'])).toBe('#ff8800')
    expect(normalizeColor(['blu'])).toBeNull()
    expect(normalizeColor([])).toBeNull()
  })
})
```

- [x] **Step 2: Run it, expect FAIL** (`npx vitest run packages/lang/test/colors.test.js`, module not found)

- [x] **Step 3: Implement**

```js
// CSS Color Module Level 4 named colors (148 including rebeccapurple and grey variants).
export const CSS_COLOR_NAMES = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
  'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'grey', 'green',
  'greenyellow', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell',
  'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen',
  'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen',
] as const

const NAMED: ReadonlySet<string> = new Set(CSS_COLOR_NAMES)
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function isCssColor(value: string): boolean {
  return HEX.test(value) || NAMED.has(value.toLowerCase())
}

export function normalizeColor(words: string[]): string | null {
  if (words.length === 0) return null
  const joined = words.join('').toLowerCase()
  return isCssColor(joined) ? joined : null
}
```

- [x] **Step 4: Run, expect PASS.** Count the array: it must be exactly 148.

---

### Task 2: Lexer

**Files:**
- Create: `packages/lang/src/lexer.js`
- Test: `packages/lang/test/lexer.test.js`

**Interfaces (Produces):**

```js
export type TokenKind = 'word' | 'number' | 'string' | 'color' | 'comma' | 'op' | 'newline' | 'indent' | 'dedent' | 'eof'
export interface Token {
  kind: TokenKind
  /** word: lowercase text. string: unescaped contents. color: lowercase '#abc'. op: '+', '-', '*', '/'. */
  text: string
  /** number value; 0 for other kinds. */
  value: number
  loc: Loc
}
export interface LexResult { tokens: Token[]; errors: MiniError[] }
export function lex(source: string): LexResult
```

Rules (spec 4.1):
- Split on `\r?\n`. Lines that are blank or only a comment produce no tokens at all (not even `newline`), so they never affect indentation.
- Leading whitespace: if it contains both tabs and spaces, or uses a different character than the first indented line of the file, emit `indent-mixed` at `{line, col: 1}` and skip the line.
- The first indented line sets the unit (its width and character). Width not a multiple of the unit -> `indent-uneven`, skip line. Level more than current depth + 1 -> `indent-unexpected`, skip line.
- Level == depth + 1: emit `indent` (loc = first non-space char). Level < depth: emit one `dedent` per level closed. Then the line's tokens, then `newline` (loc = just past the last char).
- At end of file: `dedent` for each open level, then `eof`.
- Inside a line:
  - spaces/tabs: skip.
  - `#` followed by exactly 3 or 6 hex digits and then whitespace or end of line: `color` token. Any other `#`: comment, stop the line.
  - `"`: string to the next unescaped `"`. Escapes: `\"` and `\\`. No closing quote on the line: `unterminated-string` at the opening quote; the string token is still emitted with the rest of the line so parsing can continue.
  - digit: `\d+(\.\d+)?`. If a letter or `_` immediately follows (like `10px`), emit `bad-number` for the whole run and skip it.
  - letter: `[A-Za-z][A-Za-z0-9_-]*` -> lowercase `word`.
  - `,` -> `comma`. `+ - * /` -> `op`. Note `-` inside a word stays part of the word.
  - anything else: `unknown-word` with message `I don't understand the symbol "@".` and no hint; skip the char.

- [x] **Step 1: Write failing tests**

```js
import { describe, expect, it } from 'vitest'
import { lex } from '../src/lexer.js'

const kinds = (src: string) => lex(src).tokens.map((t) => (t.kind === 'word' || t.kind === 'op' || t.kind === 'color' ? t.text : t.kind === 'number' ? t.value : t.kind))

describe('lexer', () => {
  it('lexes words, numbers, commas and ops on one line', () => {
    expect(kinds('starts at 40, -100')).toEqual(['starts', 'at', 40, 'comma', '-', 100, 'newline', 'eof'])
  })
  it('lowercases words and keeps hyphens in names', () => {
    expect(kinds('Thing Big-Rock')).toEqual(['thing', 'big-rock', 'newline', 'eof'])
  })
  it('emits indent and dedent from the first indent unit', () => {
    expect(kinds('thing a\n    solid\n    fixed\nalways\n    stop game')).toEqual([
      'thing', 'a', 'newline', 'indent', 'solid', 'newline', 'fixed', 'newline', 'dedent',
      'always', 'newline', 'indent', 'stop', 'game', 'newline', 'dedent', 'eof',
    ])
  })
  it('ignores blank and comment-only lines, including their indentation', () => {
    expect(kinds('thing a\n\n      # note\n  solid  # trailing\n')).toEqual(['thing', 'a', 'newline', 'indent', 'solid', 'newline', 'dedent', 'eof'])
  })
  it('lexes hex colors but treats other # as comments', () => {
    expect(kinds('background #1a2B3c')).toEqual(['background', '#1a2b3c', 'newline', 'eof'])
    expect(kinds('background red #ff is nice')).toEqual(['background', 'red', 'newline', 'eof'])
  })
  it('lexes strings with escapes and positions', () => {
    const { tokens } = lex('show text "Say \\"hi\\""')
    expect(tokens[2]).toEqual({ kind: 'string', text: 'Say "hi"', value: 0, loc: { line: 1, col: 11 } })
  })
  it('tracks 1-based line and column', () => {
    const { tokens } = lex('a\n  b')
    expect(tokens.map((t) => [t.kind, t.loc.line, t.loc.col])).toEqual([
      ['word', 1, 1], ['newline', 1, 2], ['indent', 2, 3], ['word', 2, 3], ['newline', 2, 4], ['dedent', 2, 4], ['eof', 2, 4],
    ])
  })
})

describe('lexer errors', () => {
  const errs = (src: string) => lex(src).errors.map((e) => [e.code, e.line, e.col])
  it('reports mixed indentation', () => {
    expect(errs('thing a\n  solid\n\tfixed')).toEqual([['indent-mixed', 3, 1]])
  })
  it('reports uneven indentation', () => {
    expect(errs('thing a\n  solid\n   fixed')).toEqual([['indent-uneven', 3, 1]])
  })
  it('reports jumps of more than one level', () => {
    expect(errs('thing a\n  solid\n      fixed')).toEqual([['indent-unexpected', 3, 1]])
  })
  it('reports unterminated strings', () => {
    expect(errs('show text "oops')).toEqual([['unterminated-string', 1, 11]])
  })
  it('reports numbers glued to letters', () => {
    expect(errs('size 10px by 4')).toEqual([['bad-number', 1, 6]])
  })
  it('reports unknown symbols', () => {
    expect(lex('add 1 @ score').errors[0]).toMatchObject({ code: 'unknown-word', message: 'I don\'t understand the symbol "@".', line: 1, col: 7 })
  })
})
```

- [x] **Step 2: Run, expect FAIL.**
- [x] **Step 3: Implement `lex` to the rules above.** Keep it one pass over lines; build tokens into one array. Use the message catalog for wording.
- [x] **Step 4: Run, expect PASS.**

---

### Task 3: Cursor and expressions/conditions

**Files:**
- Create: `packages/lang/src/cursor.js`, `packages/lang/src/parse-expr.js`
- Test: `packages/lang/test/parse-expr.test.js`

**Interfaces (Produces):**

```js
// cursor.js
export class ParseError extends Error { constructor(readonly error: MiniError) }
export function describeToken(t: Token): string
// word -> `"move"`, number -> `the number 5`, string -> `some text`, color -> `the color #abc`,
// comma -> `a comma`, op -> `"+"`, newline/dedent -> `the end of the line`, indent -> `an indented line`, eof -> `the end of the file`
export class Cursor {
  constructor(tokens: Token[])
  pos: number
  peek(offset?: number): Token
  next(): Token
  isWord(word: string, offset?: number): boolean
  acceptWord(word: string): boolean               // consume if matches
  acceptWords(...words: string[]): boolean        // consume all only if the whole sequence matches
  expectWord(word: string, hint?: string | null): Token          // ParseError 'expected': I expected "word" here, but found X.
  expectName(what: string): Token                  // a word that is not reserved; what = "a name" / "the name of a thing"
  expectNumber(what?: string): number              // accepts leading '-' op; what default "a number"
  expectPositive(what: string): number             // > 0 else 'bad-number': "0" is too small here. / Use a number bigger than 0.
  expectString(what: string): Token
  expectEndOfLine(): void                          // newline (consumed) or eof; else 'expected': I expected the end of the line here, but found X.
  skipLine(): void                                 // advance past next newline (or to eof)
  skipBlock(): void                                // skipLine, then if next is indent skip to its matching dedent
  atLineEnd(): boolean                             // newline | eof | dedent
}
export const RESERVED: ReadonlySet<string>
// game thing when always key mouse random count the a an not and or is to at by of on in
// left right up down x y vx vy width height text

// parse-expr.js
export function parseExpr(c: Cursor): Expr
export function parseCondition(c: Cursor): Condition
export const PROP_WORDS: ReadonlySet<InstanceProp>   // x y vx vy width height
```

Grammar:

```
expr      := term (('+' | '-') term)*
term      := factor (('*' | '/') factor)*
factor    := '-' factor                       -> literal: number(-v); otherwise binary('-', 0, factor)
           | NUMBER
           | 'random' expr 'to' expr
           | 'count' 'of' ['the'] NAME
           | 'mouse' ('x' | 'y')
           | ['the'] NAME PROPWORD             -> prop
           | NAME                              -> var
condition := andCond ('or' andCond)*
andCond   := unary ('and' unary)*
unary     := 'not' unary | atom
atom      := KEY 'key' 'is' 'held'             -> keyHeld   (word before 'key' must be a KeyName, else 'unknown-key')
           | ['the'] NAME 'is' 'on' ['the'] 'ground'   -> onGround
           | expr 'is' cmp expr
cmp       := 'not' -> isNot | 'above' | 'more' 'than' | 'greater' 'than' | 'bigger' 'than' -> above
           | 'below' | 'less' 'than' | 'smaller' 'than' -> below | (nothing) -> is
```

Locs: binary/and/or nodes use the left operand's loc; `not` uses the `not` word; every leaf uses its first token.

Important: `and` in a condition binds conditions, never numbers. `score is 10 and lives is above 0` is `and(compare, compare)`.

- [x] **Step 1: Failing tests** (use a helper `const e = (src) => parseExpr(new Cursor(lex(src).tokens))` and strip `loc` with a recursive `strip()` helper before comparing):

```js
expect(strip(e('1 + 2 * 3'))).toEqual({ kind: 'binary', op: '+', left: { kind: 'number', value: 1 }, right: { kind: 'binary', op: '*', left: { kind: 'number', value: 2 }, right: { kind: 'number', value: 3 } } })
expect(strip(e('-4'))).toEqual({ kind: 'number', value: -4 })
expect(strip(e('- score'))).toEqual({ kind: 'binary', op: '-', left: { kind: 'number', value: 0 }, right: { kind: 'var', name: 'score' } })
expect(strip(e('player x'))).toEqual({ kind: 'prop', thing: 'player', prop: 'x' })
expect(strip(e('the coin width'))).toEqual({ kind: 'prop', thing: 'coin', prop: 'width' })
expect(strip(e('count of coin'))).toEqual({ kind: 'count', thing: 'coin' })
expect(strip(e('mouse y'))).toEqual({ kind: 'mouse', axis: 'y' })
expect(strip(e('random 0 to 300'))).toEqual({ kind: 'random', min: { kind: 'number', value: 0 }, max: { kind: 'number', value: 300 } })
expect(strip(e('score - 1'))).toEqual({ kind: 'binary', op: '-', left: { kind: 'var', name: 'score' }, right: { kind: 'number', value: 1 } })
// conditions
const k = (src) => strip(parseCondition(new Cursor(lex(src).tokens)))
expect(k('score is 10')).toEqual({ kind: 'compare', op: 'is', left: { kind: 'var', name: 'score' }, right: { kind: 'number', value: 10 } })
expect(k('lives is not 0')).toMatchObject({ op: 'isNot' })
expect(k('player x is more than 100')).toMatchObject({ op: 'above' })
expect(k('score is smaller than 3')).toMatchObject({ op: 'below' })
expect(k('player is on the ground')).toEqual({ kind: 'onGround', thing: 'player' })
expect(k('left key is held')).toEqual({ kind: 'keyHeld', key: 'left' })
expect(k('not a is 1 and b is 2 or c is 3')).toEqual({
  kind: 'or',
  left: { kind: 'and', left: { kind: 'not', operand: { kind: 'compare', op: 'is', left: { kind: 'var', name: 'a' }, right: { kind: 'number', value: 1 } } }, right: { kind: 'compare', op: 'is', left: { kind: 'var', name: 'b' }, right: { kind: 'number', value: 2 } } },
  right: { kind: 'compare', op: 'is', left: { kind: 'var', name: 'c' }, right: { kind: 'number', value: 3 } },
})
// errors (expect ParseError with these codes)
// 'jump key is held'  -> unknown-key, message: I don't know the key "jump". hint: Did you mean "up"? is NOT expected (distance > 2); hint: Keys are: left, right, up, down, space, enter, shift, escape, a to z, 0 to 9.
// 'spcae key is held' -> unknown-key, hint: Did you mean "space"?
// 'score is'          -> expected: I expected a number here, but found the end of the line.
```

- [x] **Step 2: Run, expect FAIL.**
- [x] **Step 3: Implement** `cursor.js` and `parse-expr.js`. The expression parser is classic precedence climbing:

```js
export function parseExpr(c: Cursor): Expr {
  let left = parseTerm(c)
  while (c.peek().kind === 'op' && (c.peek().text === '+' || c.peek().text === '-')) {
    const op = c.next().text as '+' | '-'
    left = { kind: 'binary', op, left, right: parseTerm(c), loc: left.loc }
  }
  return left
}
function parseTerm(c: Cursor): Expr {
  let left = parseFactor(c)
  while (c.peek().kind === 'op' && (c.peek().text === '*' || c.peek().text === '/')) {
    const op = c.next().text as '*' | '/'
    left = { kind: 'binary', op, left, right: parseFactor(c), loc: left.loc }
  }
  return left
}
```

- [x] **Step 4: Run, expect PASS.**

---

### Task 4: Triggers, actions, text interpolation

**Files:**
- Create: `packages/lang/src/parse-rule.js`
- Test: `packages/lang/test/parse-rule.test.js`

**Interfaces (Produces):**

```js
export function parseTrigger(c: Cursor): Trigger        // after 'when' was consumed; does not consume end of line
export function parseAction(c: Cursor): Action          // one action line; does not consume end of line
export function parseLook(c: Cursor): Look              // after 'looks like' / 'to look like'
export function parseColorWords(c: Cursor, what: string): string   // color token, or words up to a stop word / line end
export function parseText(token: Token): TextPart[]     // splits {expr} interpolation; ParseError on bad inner text
```

Trigger grammar (try in this order; event triggers then accept an optional `and <condition>` guard):

| Source | AST |
|---|---|
| `game starts` | `{ kind: 'gameStarts', guard }` |
| `mouse is clicked` | `{ kind: 'mouseClick', thing: null, guard }` |
| `mouse is clicked on [the] NAME` | `{ kind: 'mouseClick', thing, guard }` |
| `every N second(s)` | `{ kind: 'every', seconds, guard }` (N > 0) |
| `after N second(s)` | `{ kind: 'after', seconds, guard }` (N > 0) |
| `KEY key is pressed\|held\|released` | `{ kind: 'key', key, state, guard }` (when `peek(1)` is `key`) |
| `[the] NAME touches [the] NAME` | `{ kind: 'touch', a, b, guard }` |
| `[the] NAME leaves [the] screen` | `{ kind: 'leavesScreen', thing, guard }` |
| anything else | `{ kind: 'condition', condition }` |

`always` is parsed by the top-level parser as `{ kind: 'always' }`.

Action grammar:

| Source | AST |
|---|---|
| `move [the] NAME DIR expr` | `move` |
| `push [the] NAME DIR expr` | `push` |
| `stop game` | `stopGame` |
| `stop animation on [the] NAME` | `stopAnimation` |
| `stop [the] NAME` | `halt` |
| `restart game` | `restartGame` |
| `set [the] NAME PROP to expr` (PROP in x y vx vy, and the word after PROP is `to`) | `setProp` |
| `set NAME to expr` | `setVar` |
| `add expr to NAME` | `addVar` |
| `subtract expr from NAME` | `subtractVar` |
| `make [a\|an] NAME at expr, expr` | `make` |
| `remove [the] NAME` | `remove` |
| `change [the] NAME to look like LOOK` | `changeLook` |
| `play NAME on [the] NAME` | `playAnimation` (first NAME is the animation) |
| `show text STRING [at expr, expr] [in COLOR]` | `showText`, color default `DEFAULT_TEXT_COLOR` |

DIR is one of `left right up down`; anything else: `expected` with message `I expected a direction (left, right, up or down) here, but found X.`

Unknown first word of an action: `unknown-word`, message `I don't know how to "jmup".`, hint `didYouMean(word, ACTION_WORDS)` or `Actions start with: move, push, stop, set, add, subtract, make, remove, change, play, show, restart.`

LOOK: a `string` token -> image. Otherwise color (a `color` token, or one or more words up to `box`/`circle`) then `box N by N` or `circle N` (all N > 0). Invalid color: `unknown-color`, message `I don't know the color "blu".`, hint `didYouMean(joined, CSS_COLOR_NAMES)` or `Try a color like red, sky blue, or #ff8800.` Missing shape: `expected`, `I expected "box" or "circle" here, but found X.`

Text interpolation: inside a string, `{` ... `}` is an expression. Lex the inner text with `lex()`, shift every token loc to `line = string.line`, `col = string.col + 1 + offsetOfInnerTextInString + (token.col - 1)`, parse one `expr`, require the inner tokens to end. `{{` is a literal `{`; a lone `}` is literal. Unclosed `{`: `expected`, `I expected "}" to close the "{" in this text.` hint `Use {score} to show a number inside text.`

- [x] **Step 1: Failing tests.** Assert each table row (strip locs). Also:

```js
// guards
expect(strip(trig('up key is pressed and player is on ground'))).toEqual({ kind: 'key', key: 'up', state: 'pressed', guard: { kind: 'onGround', thing: 'player' } })
// event wins over condition
expect(trig('left key is held and score is 3')).toMatchObject({ kind: 'key', state: 'held' })
expect(strip(trig('score is 10'))).toEqual({ kind: 'condition', condition: { kind: 'compare', op: 'is', left: { kind: 'var', name: 'score' }, right: { kind: 'number', value: 10 } } })
// text
expect(strip(act('show text "Score: {score} / {count of coin}" at 4, 4 in yellow'))).toEqual({
  kind: 'showText',
  parts: [{ kind: 'literal', text: 'Score: ' }, { kind: 'expr', expr: { kind: 'var', name: 'score' } }, { kind: 'literal', text: ' / ' }, { kind: 'expr', expr: { kind: 'count', thing: 'coin' } }],
  at: { x: { kind: 'number', value: 4 }, y: { kind: 'number', value: 4 } },
  color: 'yellow',
})
expect(strip(act('show text "{{not math}"'))).toMatchObject({ parts: [{ kind: 'literal', text: '{not math}' }] })
// inner expression error columns point inside the string
// 'show text "x {scroe +}"' -> ParseError 'expected' at col 21 (the "}" after "+")
// looks
expect(strip(look('dark slate gray box 4 by 8'))).toEqual({ kind: 'box', color: 'darkslategray', w: 4, h: 8 })
expect(strip(look('#ff8800 circle 3'))).toEqual({ kind: 'circle', color: '#ff8800', r: 3 })
expect(strip(look('"hero.png"'))).toEqual({ kind: 'image', src: 'hero.png' })
```

- [x] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**

---

### Task 5: Top-level parser

**Files:**
- Create: `packages/lang/src/parser.js`
- Test: `packages/lang/test/parser.test.js`

**Interfaces (Produces):**

```js
export interface ParseResult { program: Program; errors: MiniError[] }
export function parse(tokens: Token[]): ParseResult
```

Top level loop until `eof`. Each statement starts at the start of a line:

| First words | Statement |
|---|---|
| `game` | settings block. Lines: `size N by N`, `pixel art`, `background COLOR`, `gravity N` (N >= 0). Second `game` block: `duplicate-game`, message `There is more than one "game" block.`, hint `Put all game settings in one block.` |
| `thing NAME` | thing block. Lines: `looks like LOOK`, `animation NAME STRING(, STRING)* at N fps`, `size N by N`, `starts at N, N` (repeatable, signed), `solid`, `fixed`, `falls`, `camera follows`. |
| `when TRIGGER` | rule with an indented block of actions |
| `always` | rule with trigger `{ kind: 'always' }` |
| `NAME starts at N` | variable (signed N) |
| anything else | `unknown-word`: message `I don't know what "jmup" means here.` hint `didYouMean(word, ['game', 'thing', 'when', 'always'])` or `Lines at the left edge start with game, thing, when, always, or a name followed by "starts at".` |

Block rules:
- A header must be followed by `newline` then `indent`. Missing block for `when`/`always`: `expected`, message `I expected some actions under this line.`, hint `Put the actions on the next lines, indented.` For `thing`: missing block means missing look (below).
- Lines inside a block are parsed until the matching `dedent`.
- Unknown setting/thing line: `unknown-word`, `I don't know what "soild" means here.` + didYouMean over that block's keywords.
- Thing without `looks like`: `missing-look` at the `thing` word, message `The thing "coin" needs a look.`, hint `Add a line like: looks like gold circle 4`. Second `looks like`: `duplicate-look` at the second line, message `The thing "coin" has more than one "looks like" line.`, hint `Keep one. To change its look during the game, use: change coin to look like ...`. The thing is still emitted (with the first look, or a white 10 by 10 box when missing) so later checks run.
- Names (thing, variable, animation) that are in `RESERVED`: `name-clash`, message `"left" is a special word in minijs, so it can't be a name.`, hint `Pick another name, like left-wall.`
- Recovery: catch `ParseError` per line; record its error; `skipLine()` (or `skipBlock()` for headers).

- [x] **Step 1: Failing tests.** Parse the spec section 7 example and assert key parts:

```js
const { program, errors } = parse(lex(SPEC_EXAMPLE).tokens)
expect(errors).toEqual([])
expect(program.game).toEqual({ width: 320, height: 180, pixelArt: true, background: 'skyblue', gravity: 0.4, loc: { line: 1, col: 1 } })
expect(program.vars).toEqual([{ name: 'score', initial: 0, loc: { line: 7, col: 1 } }])
expect(program.things.map((t) => t.name)).toEqual(['player', 'ground', 'coin'])
expect(program.things[0]).toMatchObject({ solid: true, falls: true, fixed: false, cameraFollows: true, starts: [{ x: 40, y: 100 }] })
expect(program.rules).toHaveLength(7)
expect(program.rules[6]!.trigger).toEqual({ kind: 'always', loc: { line: 45, col: 1 } })
```

Copy `SPEC_EXAMPLE` verbatim from spec section 7 into `packages/lang/test/fixtures.js` (it is also used by Task 7 and Stage 4). Line numbers above assume the example starts at line 1 with `game`.

Error recovery test: a file with three broken lines in different blocks yields exactly three errors and still parses the good rules.

- [x] **Step 2: Run, FAIL. Step 3: Implement. Step 4: Run, PASS.**

---

### Task 6: Checker

**Files:**
- Create: `packages/lang/src/checker.js`
- Test: `packages/lang/test/checker.test.js`

**Interfaces (Produces):** `export function check(program: Program): MiniError[]`

Checks, in this order:
1. `duplicate-thing` at the second declaration: `There are two things called "coin".` / `Give each thing its own name.`
2. `duplicate-variable`: `There are two numbers called "score".` / `Give each number its own name.`
3. `name-clash` (variable named like a thing): `"coin" is used as both a thing and a number.` / `Rename one of them.`
4. `multiple-cameras` at the second thing: `Only one thing can have "camera follows".` / `Remove "camera follows" from "enemy".`
5. Walk every rule (trigger, guard, conditions, actions, expressions, text parts):
   - thing references: if unknown -> `unknown-thing`. If the name is a variable: message `"score" is a number, not a thing.`, hint null. Otherwise message `I don't know what "cion" is.`, hint `didYouMean(name, thingNames)` or `Add a "thing cion" block, or check the spelling.`
   - variable references: if unknown -> `unknown-variable`. If the name is a thing: message `"player" is a thing, not a number.`, hint `Did you mean "player x"?`. Otherwise message `I don't know what "scroe" is.`, hint `didYouMean(name, varNames)` or `Make it first with a line like: scroe starts at 0`
   - animation references: `unknown-animation`, message `"coin" has no animation called "spin".`, hint `didYouMean(name, thatThingsAnimations)` or `Add a line like: animation spin "a.png", "b.png" at 8 fps`
6. Each error loc is the loc of the node holding the bad name.

- [x] **Step 1: Failing tests**, one per check, asserting the full `MiniError` (code, message, hint, line, col). Include the spec 4.7 example: `remove cion` with a thing `coin` gives `I don't know what "cion" is.` + `Did you mean "coin"?`.
- [x] **Step 2: FAIL. Step 3: Implement** with one recursive walker per node family (`walkExpr`, `walkCondition`, `walkAction`, `walkTrigger`). **Step 4: PASS.**

---

### Task 7: compile() and integration

**Files:**
- Create: `packages/lang/src/compile.js`
- Modify: `packages/lang/src/index.js` (export `compile`, `CompileResult`, `lex`, `Token`, `TokenKind`, `parse`, `check`, colors API)
- Test: `packages/lang/test/compile.test.js`, `packages/runtime/test/integration.test.js`

**Interfaces (Produces):**

```js
export interface CompileResult { program: Program | null; errors: MiniError[] }
export function compile(source: string): CompileResult
// lex -> parse -> (only if no lex/parse errors) check; errors sorted by line then col; capped at 50.
```

- [x] **Step 1: Failing tests**

```js
// compile.test.js
import { SPEC_EXAMPLE } from './fixtures.js'
it('compiles the spec example cleanly', () => {
  const r = compile(SPEC_EXAMPLE)
  expect(r.errors).toEqual([])
  expect(r.program).not.toBeNull()
  expect(r.program).toMatchSnapshot()   // review the snapshot by hand once; it is the golden AST
})
it('returns null program with sorted errors', () => {
  const r = compile('thing coin\n  looks like gold circle 4\nwhen player touches cion\n  remove cion\n  add 1 to scroe\n')
  expect(r.program).toBeNull()
  expect(r.errors.map((e) => [e.code, e.line])).toEqual([['unknown-thing', 3], ['unknown-thing', 3], ['unknown-thing', 4], ['unknown-variable', 5]])
})
it('never throws on garbage', () => {
  for (const src of ['', '\n\n', '"', '{', 'when', 'thing', '   x', '\t\t\t', 'when when when', 'show text "{"']) {
    expect(() => compile(src)).not.toThrow()
  }
})
it('compiles an empty file to defaults', () => {
  expect(compile('').program).toEqual({ game: { width: 480, height: 270, pixelArt: false, background: 'black', gravity: 0, loc: null }, vars: [], things: [], rules: [] })
})
```

```js
// packages/runtime/test/integration.test.js
import { compile } from '@minijs/lang'
import { SPEC_EXAMPLE } from '../../lang/test/fixtures.js'
import { ManualInput } from '../src/input.js'
import { Simulation } from '../src/simulation.js'

it('runs the spec example: player lands, walks, collects', () => {
  const { program } = compile(SPEC_EXAMPLE)
  const input = new ManualInput()
  // random 0.5 -> coins spawn at x 300, y 140 every 2 seconds, in the player's path
  const sim = new Simulation(program!, new Map(), { input, random: () => 0.5 })
  for (let i = 0; i < 60; i++) sim.tick()
  expect(sim.instancesOf('player')[0]).toMatchObject({ y: 144, onGround: true })
  input.keyDown('right')
  for (let i = 0; i < 240; i++) sim.tick()
  expect(sim.instancesOf('player')[0]!.x).toBeGreaterThan(40)
  expect(sim.getVar('score')).toBeGreaterThan(0)
})
```

- [x] **Step 2: FAIL. Step 3: Implement. Step 4: PASS**.

---

## Message catalog (exact wording)

| Code | Message | Hint |
|---|---|---|
| indent-mixed | `This line mixes tabs and spaces at the start.` | `Use only spaces or only tabs to indent.` |
| indent-uneven | `This line is indented by an odd amount.` | `Indent each level by {N spaces / 1 tab}, like the lines above.` |
| indent-unexpected | `This line is indented more than I expected.` | `Only indent lines that belong to the line above, like the actions under a "when".` |
| unterminated-string | `This text is missing its closing quote (").` | `Add a " at the end of the text.` |
| bad-number | `I expected a number but found "10px".` / `"0" is too small here.` | `Write just the number, like 10.` / `Use a number bigger than 0.` |
| unknown-word | see Tasks 2, 4, 5 | did-you-mean or a list of valid starting words |
| expected | `I expected {what} here, but found {describeToken}.` | context specific or null |
| unknown-key | `I don't know the key "jump".` | did-you-mean over `KEY_NAMES`, else `Keys are: left, right, up, down, space, enter, shift, escape, a to z, 0 to 9.` |
| unknown-color | `I don't know the color "blu".` | did-you-mean over CSS names, else `Try a color like red, sky blue, or #ff8800.` |
| unknown-thing / unknown-variable / unknown-animation | Task 6 | Task 6 |
| duplicate-thing / duplicate-variable / name-clash / multiple-cameras | Task 6 | Task 6 |
| missing-look / duplicate-look / duplicate-game | Task 5 | Task 5 |

## Done when

- [x] All Stage 2 tests pass, plus all existing tests (`npm test`).
- [x] `compile(SPEC_EXAMPLE)` has zero errors and the integration test passes.
- [x] `handoffs/handoff.md` updated with a new timestamped, model-stamped section.

## As built (2026-10-06)

Differences from the text above, all deliberate:

1. **`a` and `an` are not in `RESERVED`.** Task 3's own test uses `a` as a variable (`not a is 1 and ...`). They stay fillers in `make a coin`; `make a at 1, 2` still makes a thing called `a` (filler only when a word other than `at` follows).
2. **`jump key` does suggest `up`.** "jump" -> "up" is edit distance 2, so `didYouMean` returns it. The no-suggestion test uses `banana` instead.
3. **Inner text error column.** `show text "x {scroe +}"` reports column 22, which is the `}` after `+` (the plan said 21 but described the `}`).
4. **Less cascading.** `compile` drops parser errors on lines the lexer already reported (e.g. `add 1 @ score` gives one error, not two). A thing whose `looks like` line is broken does not also get `missing-look`.
5. **Golden equality lives in the runtime.** `@minijs/lang` tests can't import runtime code, so `packages/runtime/test/integration.test.js` asserts `compile(SPEC_EXAMPLE)` equals the hand-built `specExample` with locs stripped. `specExample` moved from `spec-example.test.js` to `packages/runtime/test/spec-example.js` so importing it doesn't re-run those tests. `compile.test.js` keeps the snapshot.
6. **Small additions:** `set player width to 3` gets `I expected x, y, vx or vy here...` / `You can only set x, y, vx or vy.`; negative gravity gets `bad-number` with hint `Use 0 or a bigger number.`; an indented line at the top level, or nested under an action, gets `indent-unexpected` from the parser; digit keys (`7 key is held`) work although the lexer reads `7` as a number; the `name-clash` hint suffix depends on what is named (`left-wall` for things, `-move` for animations, `-count` for numbers).
7. **Text interpolation columns** are counted on the unescaped text, so they drift by one per `\"` before the `{`.
