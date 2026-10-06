# Stage 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: DONE** (Claude Opus 5.5, 2026-10-05). Kept as a record and as the reference for the shared contract.

**Goal:** Monorepo tooling plus the AST/error/key contract that Stage 2 (language) and Stage 3 (engine) both build against independently.

**Architecture:** npm workspaces, source-first TypeScript packages (package `exports` point at `src/index.ts`; no build step during development). Vitest runs every package's tests from the root.

**Tech Stack:** Node >= 20 (built on 25.5), npm workspaces, TypeScript 5.9 (strict, `moduleResolution: Bundler`, `.ts` import extensions), Vitest 3.2.

## Global Constraints

- `@minijs/lang` must never import `@minijs/runtime`.
- The AST is plain JSON-serializable data. No classes, no cycles.
- Names in the AST are lowercase. Colors are valid CSS color strings. Keys are `KeyName`.
- Every error is a `MiniError { code, message, hint, line, col }` with 1-based positions.
- Do not commit unless the user asks.

---

### Task 1: Workspace tooling

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `packages/lang/package.json`, `packages/lang/tsconfig.json`
- Create: `packages/runtime/package.json`, `packages/runtime/tsconfig.json`
- Modify: `.gitignore` (add `.vite/`)

- [x] Root scripts: `test` (vitest run), `test:watch`, `bench` (vitest bench --run), `typecheck` (tsc per package).
- [x] Vitest includes `packages/*/test/**/*.test.ts`, `playground/test/**/*.test.ts`; benches `packages/*/bench/**/*.bench.ts`.
- [x] `npm install` succeeds; `node_modules/@minijs/{lang,runtime}` are workspace symlinks.

### Task 2: AST contract

**Files:**
- Create: `packages/lang/src/ast.ts`

**Interfaces (Produces):** `Loc`, `Program`, `GameSettings`, `DEFAULT_GAME_SETTINGS`, `VarDecl`, `Point`, `Size`, `Look`, `AnimationDecl`, `ThingDecl`, `Direction`, `InstanceProp`, `SettableProp`, `BinaryOp`, `Expr`, `CompareOp`, `Condition`, `KeyState`, `Trigger`, `TextPart`, `TextPosition`, `Action`, `Rule`, `DEFAULT_TEXT_COLOR`. Read the file; it is the source of truth.

- [x] Every node kind in spec section 4 has an AST shape.
- [x] Defaults: 480 by 270, not pixel art, background `black`, gravity 0, text color `white`.

### Task 3: Errors and keys

**Files:**
- Create: `packages/lang/src/errors.ts`, `packages/lang/src/keys.ts`, `packages/lang/src/index.ts`
- Test: `packages/lang/test/foundation.test.ts`

**Interfaces (Produces):**
- `miniError(code, loc, message, hint?) => MiniError`
- `formatError(error) => string` (`line 3, column 7: <message> <hint>`)
- `editDistance(a, b) => number`, `suggest(word, candidates) => string | null` (distance <= 2, first wins ties), `didYouMean(word, candidates) => 'Did you mean "x"?' | null`
- `KEY_NAMES`, `KeyName`, `isKeyName(word)`, `keyNameFromCode(KeyboardEvent.code)`
- Error code unions `LangErrorCode`, `RuntimeErrorCode`, `MiniErrorCode`

- [x] 9 tests pass: `npm test`.
- [x] `npm run typecheck` clean.
