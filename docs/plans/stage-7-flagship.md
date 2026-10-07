# Stage 7: Flagship Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: PLANNED, waiting for the user to pick a concept and the engine features.** Can start in parallel with Stage 6 (it needs Stage 5's exports to ship, not to build).

**Goal:** One genuinely fun, polished game written entirely in `.mini`, shipped as a built-in example, an HTML file, and a desktop app. It proves the engine and shows exactly what the language still lacks.

**Architecture:** Engine features first (each one through the normal path: spec, AST contract, lang, runtime, tests), then art by script, then the game in small playable milestones with playtest notes. The game lives in `examples/flagship/` with its own `assets/`.

## Concepts (pick one)

| Concept | Genre | Needs from the engine |
|---|---|---|
| **Lantern Keep**: climb a dark tower floor by floor, light braziers, dodge bats, find the key, beat the clock | Platformer, 6 to 8 short rooms | Rooms (levels), tilemaps, sound, per-thing numbers (bat health), bigger text |
| **Comet Garden**: tend a tiny planet, catch falling seeds, fend off comets, grow the garden to 100 | Top-down arcade, one screen, score chase | Sound, per-thing numbers (plant growth), timers per thing, particles (light) |
| **Two-Key Heist**: two players on one keyboard or two gamepads sneak past guards | Top-down co-op | Rooms, per-thing numbers, guard line of sight (simple ray check), sound |

Recommendation: **Lantern Keep**. Platformers are the clearest showcase, every feature it needs is useful to everyone, and rooms + tilemaps are the biggest wins for beginners ("draw your level with letters").

## Candidate engine features

Each is a self-contained mini-stage with tests. The user picks which to build; the game is designed around what exists afterward.

| Feature | Sketch of the syntax | Cost |
|---|---|---|
| **Sound effects** | `sound jump "jump.wav"` in a thing or at the top level; action `play sound jump`; volume setting in `game`. Web Audio, decoded at load, missing files reported like pictures | Medium |
| **Tilemaps** | `map` block of letters plus a key: `# is wall`, `C is coin`; each letter spawns that thing at grid positions; tile size setting | Medium |
| **Rooms** | `room cave` blocks holding their own `map` and `starts at`; actions `go to room cave`, `restart room`; numbers carry across rooms | Large |
| **Per-thing numbers** | `thing bat` + `has health 3`; `subtract 1 from the bat health`; condition `the bat health is 0` | Medium |
| **Bigger text** | `show big text "You win"` (2x) and `in <size> size` | Small |
| **Camera limits** | `camera stays inside 0, 0 to 1200, 400` | Small |
| **Timers per thing** | `when bat has been alive for 3 seconds` | Medium |
| **Particles** | `burst 12 sparks at coin x, coin y` with a `spark` thing as template | Medium |

## Tasks

### Task 1: Agree the design

- [ ] One-page design doc in `docs/flagship.md`: concept, the 60-second loop, controls (keyboard, gamepad, touch buttons via a `control` for each action), rooms list, win and lose, what "fun" means here (three moments players should feel).
- [ ] User confirms the doc and the feature list.

### Task 2: Engine features (one mini-stage each)

For each chosen feature:
- [ ] Spec section with exact syntax, semantics, errors and messages.
- [ ] AST contract change, `build.js` helpers, checker rules with did-you-mean hints.
- [ ] Lang tests (golden AST + every error), runtime tests (headless `Simulation`), an `examples/<feature>.mini` that runs in the examples test.
- [ ] Playground: Watch and Input tabs show the new state (for example per-thing numbers in Watch).
- [ ] Bench stays under 4 ms for 2,000 things.

### Task 3: Art and sound by script

- [ ] Extend `scripts/png.mjs` sprites to sheets for tiles, the hero (idle, walk, jump), bats, braziers, key, door. All pixel art is defined as text grids in `scripts/flagship-art.mjs` so it can be edited and regenerated.
- [ ] If sound is in: `scripts/flagship-sounds.mjs` writes short WAVs from simple synthesis (square and noise envelopes for jump, coin, hit, door).

### Task 4: Build the game in playable milestones

- [ ] M1: one room, move and jump feel right (tune gravity, jump strength, coyote-time substitute with `after` if needed).
- [ ] M2: hazards and the lose condition.
- [ ] M3: all rooms, key and door progression.
- [ ] M4: timer, score, win screen, restart.
- [ ] M5: polish: screen layout, text, sounds, difficulty curve.
- [ ] After each milestone: a short playtest note in `docs/flagship.md` (what felt bad, what changed).

### Task 5: Ship

- [ ] `examples/flagship/` appears in the Studio Examples and in the new-project gallery.
- [ ] HTML export checked from `file://`; desktop app export checked (Stage 6).
- [ ] Performance: 60 ticks per second with 4x CPU slowdown in browser dev tools.

## Done when

- [ ] Someone who has never seen it can finish it in 5 to 10 minutes and wants to play again (user judges).
- [ ] Zero problems in the Studio, all tests pass, bench under budget.
- [ ] Ships in all three forms.
- [ ] `handoffs/handoff.md` updated.

## Decisions for the user before starting

1. Which concept (recommendation: Lantern Keep)?
2. Which engine features (recommendation for Lantern Keep: sound, tilemaps, rooms, per-thing numbers, bigger text, camera limits)?
