# minijs landing page

Status: implemented and browser verified on 2026-10-07.

## Design direction

A landing page for first-time game makers and teachers. Playful, carefully composed, and readable. The interface uses cool silver neutrals, charcoal, and a single gold accent. The existing minijs wordmark, app icon, routes, navigation labels, exported games, and real Studio screenshots remain the product foundation.

Design dials: `DESIGN_VARIANCE: 8`, `MOTION_INTENSITY: 6`, `VISUAL_DENSITY: 3`.

Skills applied: design-taste-frontend, gpt-taste, full-output-enforcement, redesign-existing-projects, and web-design-guidelines. The deterministic composition seed is 132: artistic asymmetry, Cabinet Grotesk, inline image typography, a carousel, a rule marquee, pinned product storytelling, and image scale/fade. The carousel presents actual games instead of invented customer quotations.

## Audit and resulting changes

The previous implementation had a heavy frame around each visual, competing emerald and blue ambient accents, repeated screenshot compositions, weak hierarchy in the game preview, and a hero that had previously wrapped across four lines. It lacked a theme override and a marquee pause control.

The redesign keeps the existing Vite and plain JavaScript stack. Native CSS provides the visual system. No framework migration or product-engine changes are needed.

- Cabinet Grotesk display type, Geist body type, Geist Mono code. Fonts are self-hosted with swap rendering.
- Two-line hero, a custom voxel-world illustration, and an embedded real game on request. The idle page does not run an iframe simulation.
- One accent across the interface. Light/dark tokens apply to the whole page, with system preference by default and a persisted manual choice.
- Semantic navigation and buttons, visible keyboard focus, a skip link, labelled code editor, live validation, and native question disclosures.
- Three real games in a completely filled asymmetric grid. Arrow controls change the featured game; screenshot links open the games.
- A desktop-only pinned Studio explanation paired with real workspace and tutorial captures. Screenshots scale into view and fade only as they leave.
- Native single-column sections below 768px; the Studio stops pinning below 1024px. Reduced motion disables entry animation, marquee motion, pinning, and scrubbing.
- A single rule marquee, with explicit pause/resume and hover pause.
- Gold download and Studio CTAs, real destinations, consistent CTA labels, and unchanged primary anchors.

## Visual tokens

| Token | Light | Dark |
| --- | --- | --- |
| Page | `#f6f7f4` | `#171918` |
| Surface | `#eef0e9` | `#222522` |
| Elevated | `#fcfcfa` | `#1d201d` |
| Text | `#252922` | `#f0f2e9` |
| Supporting copy | `#60665b` | `#aeb5a6` |
| Accent | `#e6c554` | `#e6c554` |
| Accent text | `#2c2b1c` | `#2c2b1c` |

The maximum page width is 1280px. Interactive buttons are pills; content containers use 20-28px radii; nested code/game areas use 12px radii. The hero uses a 64rem headline maximum, two non-wrapping desktop lines, and responsive scaling verified at small widths. The navigation is 80px on desktop and 72px on phones.

## Page structure

1. Navigation: original Games, Language, Download anchors, Open Studio, appearance control.
2. Hero: original sentence-to-game headline, short explanation, Open Studio, Download, custom illustration, game play control.
3. Benefit strip: no sign-up, offline creation, game ownership.
4. Language: actual editable `.mini` source, safe syntax highlighting, actual compiler and canvas runtime, speed/color experiments, reset, inline status/error state.
5. Games: three cells in a two-column/two-row grid. Featured card occupies two cells, remaining cards occupy one each. CSS uses dense placement. All game and code links retain their original paths.
6. Studio: pinned explanation beside two screenshots and four concise benefits. Flat mobile fallback.
7. Rule marquee: actual language examples, one moving band, pause control.
8. Download: full-width action panel, OS-aware label, original public-release destination, alternatives.
9. Questions and footer: existing answers and links, appearance selection, Ambytion attribution.

## Behaviour and accessibility

The code editor recompiles 250ms after input settles. Invalid or empty code gets a specific message while the existing game stays visible. Reset restores the example. Native Tab leaves the editor; Ctrl/Cmd+Tab inserts indentation. Source HTML is escaped before highlighting. Asynchronous runs use a revision token so an older result cannot replace a newer edit.

The demo starts when its panel approaches the viewport and releases its engine when it leaves. Touch buttons are enabled for touch devices; unused A/B controls are hidden in this arrows-only example. The hero game loads on demand, has a loading status and fallback full-game link, and releases its iframe on close. Arrow keys operate the focused game without scrolling the page.

The theme override also changes the workspace screenshot and browser theme color. Reduced motion works with the operating-system preference. Main text and controls meet contrast requirements in both modes.

## Assets and performance

- `site/public/art/pixel-world.webp`: generated custom hero illustration, 1200px, approximately 62 KB.
- `site/public/art/pixel-world-640.webp`: responsive alternative, approximately 24 KB.
- `site/public/fonts/cabinet-grotesk-*.woff2`: Fontshare Cabinet Grotesk.
- `site/public/fonts/phosphor-site-light.woff2`: 24 original Phosphor Light glyphs, approximately 3 KB. MIT license is retained alongside it. `site/src/icons.css` contains only their mappings.
- Original `site/public/shots/*.webp`: actual game and Studio captures.
- Original icon, favicon, canonical URL, title, description, and social metadata are retained. `robots.txt` supplies valid crawl directives.

Hero image preload and `srcset` match. Critical images have reserved dimensions and high fetch priority. Below-fold images load lazily. Only Latin font subsets are bundled. Game engine/compiler and GSAP/ScrollTrigger use separate on-demand chunks; the initial script is approximately 13 KB uncompressed.

## Build and review

`npm run site:dev` runs the landing-page development server. `npm run site:build` builds the Studio and standalone games, builds the landing page, and assembles all three into `site/dist/`. Preview with `npm run preview -w site`.

Browser review covers desktop, phone, both appearances, reduced motion, live editing, error recovery, reset, gallery selection, embedded game open/close, and assembled Studio/tutorial/game links. The existing test suite has 299 passing tests.

Web interface audit follows the [Vercel guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). Lighthouse reports are produced against the assembled production preview, with mobile throttling. Scores are local lab measurements, not production field metrics.

Final local mobile Lighthouse: performance 97, accessibility 100, best practices 100, SEO 100. FCP 1.8s, LCP 2.3s, TBT 0ms, CLS 0. These are throttled local lab measurements.

Final screenshots: `docs/screenshots/landing-light.webp`, `landing-dark.webp`, and `landing-mobile.webp`, captured at 2x device scale.
