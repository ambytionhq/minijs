# minijs.ambytion.net: Landing Page Spec

**Status:** SPEC, built from this document in `site/`.
**Skills applied:** `design-taste-frontend` (brief read, dials, anti-slop rules, pre-flight) and `high-end-visual-design` (vibe and layout archetypes, double-bezel containers, button-in-button CTAs, fluid motion). Where the two disagree, `design-taste-frontend` wins (noted inline). All code ships complete (`full-output-enforcement`).

## 1. Design read

> Reading this as: a consumer-facing product landing page for first-time game makers (students, hobbyists, kids with a parent) and the teachers who help them, with a vibrant-premium "playful but expensive" language, leaning toward native CSS + Geist + live, playable game embeds instead of illustrations.

What the page must do, in order:

1. Show, in the first viewport, that a minijs game is made of sentences and that the result is a real, good-looking game. The visitor can play it right there.
2. Let the visitor change a sentence and see the game change, without leaving the page.
3. Prove range with the three showcase games.
4. Sell the Studio (offline, share links, export, tutorial).
5. Get the desktop app downloaded.

## 2. Dials

| Dial | Value | Why |
|---|---|---|
| `DESIGN_VARIANCE` | 8 | Landing page for a consumer audience. Asymmetric hero, bento, overlapping screenshots. |
| `MOTION_INTENSITY` | 6 | Entry reveals, hover physics, one marquee, live games. No scroll hijack: the games already move. |
| `VISUAL_DENSITY` | 3 | Airy. Big gaps between sections, one idea per section. |

## 3. Archetypes (high-end-visual-design, section 3)

- **Vibe:** *Ethereal Glass* in dark mode (near-black `#0b0c0f`, two soft radial orbs: emerald and Cloud Hopper sky blue, hairline white/8 borders) and *Soft Structuralism* in light mode (silver-white `#f3f4f2`, diffused tinted shadows). Same structure, same accent, both modes.
- **Layout mix:** Editorial Split (hero), Asymmetrical Bento (games), Z-Axis Cascade (Studio screenshots). Each used once.
- **Conflict resolved:** high-end-visual-design wants a pill eyebrow over every H2; design-taste-frontend caps eyebrows at 1 per 3 sections. The page has 7 sections, so it uses **one** eyebrow ("Try it here").

## 4. Tokens

### Color (one accent, locked)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f3f4f2` | `#0b0c0f` | Page |
| `--bg-orb-a` | `rgba(4,120,87,.10)` | `rgba(63,191,143,.16)` | Emerald orb |
| `--bg-orb-b` | `rgba(56,152,236,.12)` | `rgba(143,211,255,.10)` | Sky orb |
| `--shell` | `rgba(24,24,27,.04)` | `rgba(255,255,255,.04)` | Bezel outer tray |
| `--shell-ring` | `rgba(24,24,27,.08)` | `rgba(255,255,255,.08)` | Bezel hairline |
| `--core` | `#fbfbfa` | `#131418` | Bezel inner plate |
| `--core-highlight` | `rgba(255,255,255,.9)` | `rgba(255,255,255,.06)` | Inner top highlight |
| `--text` | `#141417` | `#ededf0` | Headings, body |
| `--text-muted` | `#55565f` | `#a2a3ad` | Sub copy (AA on `--bg` and `--core`) |
| `--accent` | `#047857` | `#3fbf8f` | Primary buttons, links, icons, focus |
| `--accent-hover` | `#065f46` | `#5ccfa3` | Hover |
| `--accent-ink` | `#f6fbf8` | `#06130d` | Text on accent (AA: 5.9:1 light, 8.7:1 dark) |
| `--shadow` | `0 30px 80px -30px rgba(30,60,90,.28)` | `0 30px 80px -30px rgba(0,0,0,.7)` | Tinted, never pure black on light |

Same accent as the Studio (`playground/src/styles.css`), so the page and the product feel like one thing. Vibrance comes from the game art itself (sky blue, grass, gold stars, purple crypt), not from extra accent colors.

### Type

- **Geist Sans** 400/500/600/700 and **Geist Mono** 400/500 via `@fontsource` (self-hosted, `font-display: swap`). No Inter, no serif.
- H1: `clamp(44px, 6.4vw, 84px)`, weight 600, tracking `-0.035em`, line-height 1.02. Exactly two lines on desktop ("Write a sentence." / "Watch it play.").
- H2: `clamp(32px, 4vw, 52px)`, weight 600, tracking `-0.03em`, line-height 1.06.
- H3: 19px, weight 600.
- Body: 17px / 1.6, `--text-muted`, `max-width: 60ch`.
- Code: Geist Mono 14px / 1.7.

### Shape (locked)

- Bezel shell radius 32px, padding 6px; core radius 26px (concentric: 32 minus 6).
- Buttons and chips: full pill.
- Small inner elements (status line, inputs): 12px.

### Icons

Phosphor **Light** weight only (`@phosphor-icons/web/light`, class `ph-light`). No hand-drawn SVG.

### Motion

- Ease: `cubic-bezier(0.32, 0.72, 0, 1)` for everything. Never `linear` except the marquee, never `ease-in-out`.
- Reveal: elements with `.reveal` start at `opacity 0; translateY(24px); filter: blur(8px)` and settle over 900ms when 15% visible (IntersectionObserver, once). `--delay` per element for staggers.
- Hover: buttons scale to 0.98 on `:active`; the orb inside the primary button moves `translate(2px, -2px) scale(1.06)` on hover. Bento images scale 1.03 on hover over 900ms.
- Marquee: one only, 48 s per loop, pauses on hover.
- `prefers-reduced-motion: reduce`: no reveal offsets or blur, marquee stops, hover transforms off.
- Only `transform`, `opacity` and `filter` animate. `backdrop-filter` only on the fixed nav.

## 5. Sections

Seven sections, six layout families. Every multi-column layout collapses to one column under 768px with 16px side gutters.

### 5.0 Nav (fixed, floating island)

- A pill detached from the top (`top: 16px`, centred, `max-width: 1080px`), glass (`backdrop-filter: blur(18px) saturate(1.6)`), hairline ring, height 60px.
- Left: app icon (28px) + "minijs". Middle: Games, Language, Download (anchor links). Right: **Open Studio** primary pill with the arrow in its own orb.
- Under 720px the middle links hide; brand and CTA stay on one line.

### 5.1 Hero (Editorial Split)

- Grid `5fr 7fr`, gap 56px, `min-height: min(100dvh, 860px)`, top padding 128px (clears the nav; content starts within `pt-24` of the nav's bottom edge).
- Left, four text elements max:
  - H1: "Write a sentence. / Watch it play."
  - Sub (19 words): "minijs is a game language made of plain English rules. Make 2D games in your browser or on your desktop."
  - CTAs: **Open Studio** (primary, orb arrow) and **Download** (ghost, label becomes "Download for Mac/Windows/Linux" from the visitor's system).
- Right: a double-bezel frame holding the real Cloud Hopper export (`/play/cloud-hopper.html`) in an iframe at 16:9. Playable.
- Two floating rule chips (Geist Mono, glass pill, slight rotation `-3deg` and `2deg`) overlapping the frame corners: `when player touches star` and `add 1 to stars`. They are real lines from the game. `aria-hidden`. Hidden under 900px (no overlap on touch screens).

### 5.2 Try it here (live editor)

- Eyebrow "Try it here" (the page's only eyebrow), H2 "Every line is a rule you can read.", sub "Change a number or a color. The game restarts the moment your sentence makes sense." Stacked, left-aligned (no split header).
- One double-bezel panel, inside a `1.1fr 1fr` grid:
  - Left: file bar (`gems.mini`, "Start over" link) and a `textarea` with the demo game (below). Geist Mono, no wrap, tab inserts two spaces.
  - Right: the canvas running the game (`@minijs/lang` compile + `@minijs/runtime` start, `keyTarget` = canvas), a status line and a hint ("Click the game, then use the arrow keys.").
- Behaviour: recompile 250ms after typing stops. Clean compile: restart the game, status "Running" with a check icon. Problem: keep the last good game running, status shows "Line N: message" in the danger tone (from the compiler's own friendly message).
- Demo source:

```
# Gems: collect them with the arrow keys.
# Try: change 2 to 4, or gold to hotpink.

game
  size 320 by 180
  background #10141c

gems starts at 0

thing player
  looks like #3fbf8f box 12 by 12
  starts at 154, 84

thing gem
  looks like gold circle 4

when game starts
  make a gem at 60, 50

when left key is held
  move player left 2
when right key is held
  move player right 2
when up key is held
  move player up 2
when down key is held
  move player down 2

when player touches gem
  remove the gem
  add 1 to gems
  make a gem at random 16 to 304, random 24 to 164

always
  show text "Gems {gems}" at 8, 14
```

### 5.3 Games (Asymmetrical Bento, exactly 3 cells)

- H2 "Three games, every line visible." / sub "Each one is a single minijs file. Play it, then open it in the Studio and change how it works."
- Grid `7fr 5fr`, two rows. Cloud Hopper spans both rows on the left; Star Defender and Crypt Dash stack on the right.
- Each cell: double bezel; inside, a real 2x gameplay screenshot (captured by `scripts/capture-screenshots.mjs`), then name, one line, and two buttons: **Play** (primary, opens `/play/<game>.html`) and **See the code** (ghost, opens the example in `/studio/`).
- No labels over images.

### 5.4 Studio (Z-Axis Cascade + feature list)

- H2 "A whole studio. Nothing to install." / sub "Projects save as you type, and the Studio keeps working with no internet."
- Two screenshots in double bezels: the tutorial behind (offset left and up, rotated `-2deg`, 78% width), the workspace in front (offset right and down, `1.5deg`, 84% width). The workspace picture switches light/dark with the visitor's theme. Under 768px: no rotation, no overlap, stacked.
- Below: a 4-item list in a 4-column row (2x2 under 1024px, 1 column under 640px), no cards: Phosphor icon, H3, one sentence.
  - Works offline: "Open it once and it keeps running on a plane, in a classroom, anywhere."
  - Share with a link: "The whole game, pictures included, fits inside the link. Nothing is uploaded."
  - Export anywhere: "One HTML file that plays in any browser, a zip of the project, or a desktop app."
  - A tutorial that checks: "Eight short steps from an empty sky to a finished platformer, checked as you go."

### 5.5 Marquee (the one marquee)

- Full-bleed band of real rules in Geist Mono pills, scrolling left. Motivation: shows how much a handful of plain words can do. Edges fade with a mask.

### 5.6 Download (split panel)

- One large double bezel; inside `1.2fr 1fr`:
  - Left: H2 "Take it off the web.", sub "minijs Studio for Mac, Windows and Linux opens real folders and turns any game into an app players can double-click.", primary **Download** button labelled for the visitor's system, then "Also for Mac, Windows and Linux. Free, about 4 MB, and it updates itself." (the visitor's own system is removed from that list).
  - Right: the app icon at 240px in a tray (radial emerald glow behind, soft float animation 6s, off under reduced motion).
- All download links point at `https://github.com/ambytionhq/minijs-releases/releases/latest`.

### 5.7 Questions (accordion)

- H2 "Questions", five `<details>` rows (native, keyboard accessible), plus icon rotates 45deg when open. Questions and answers as in `site/index.html`.

### 5.8 Footer

- Brand, links (Studio, Tutorial, Games, Download), "Made by Ambytion". No version strings.

## 6. Assets

| Asset | Source |
|---|---|
| Hero game | `site/public/play/cloud-hopper.html` from `npm run games:export` |
| Game screenshots | `site/public/shots/{cloud-hopper,star-defender,crypt-dash}.webp` (1920x1080) |
| Studio screenshots | `site/public/shots/studio-{workspace-dark,workspace-light,tutorial}.webp` (2880x1800) |
| App icon | `site/public/icon-1200.png` from `scripts/make-icons.mjs` |
| Social card | `site/public/og.jpg` (1200x630, from the dark workspace shot) |

## 7. Build and deploy

- `npm run site:dev`: exports games, runs Vite on port 5175.
- `npm run site:build`: builds the Studio, exports games, builds the site, then `scripts/assemble-site.mjs` copies the Studio into `site/dist/studio/`. Deploy `site/dist/` as a static site at `minijs.ambytion.net` (share links already point at `/studio/`).

## 8. Acceptance (pre-flight, run before calling it done)

- [ ] Zero em or en dashes in visible text (`grep -nP '[\x{2013}\x{2014}]' site/index.html site/src/*` is empty).
- [ ] One theme per mode, both modes checked by screenshot; one accent; one radius system.
- [ ] Hero fits a 1440x900 and a 1280x720 viewport with both CTAs visible; H1 is two lines.
- [ ] Exactly one eyebrow, one marquee, three bento cells.
- [ ] Every button label fits on one line at desktop; CTA labels contrast at least 4.5:1.
- [ ] 375px wide: no horizontal scroll, every section single column, nav on one line.
- [ ] Reduced motion: no transforms on reveal, marquee still.
- [ ] Live editor: typing a typo shows the line and message and keeps the last game running; fixing it restarts.
- [ ] No console errors; images have width and height (no layout shift); hero iframe is the only eager embed.
