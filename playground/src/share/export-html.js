// Export a game as one HTML file: the player, the compiled game and every
// picture inside it. It opens from a double-click, with no internet.

import { collectImageSources } from '@minijs/runtime'
import { imageCandidates } from '../files/project-assets.js'
import { blobToDataUrl } from './bytes.js'

/** @import { Program } from '@minijs/lang' */
/** @import { ProjectFs } from '../files/project.js' */

/** Biggest file we offer to make. Browsers handle more, but mail and chat apps don't. */
export const MAX_HTML_BYTES = 25 * 1024 * 1024

/**
 * Text safe to put inside a <script> element.
 * @param {string} text
 */
function scriptSafe(text) {
  return text.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')
}

/** @param {string} text */
function htmlEscape(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

/**
 * Pictures the game uses, as data URLs keyed by the name in the game.
 * @param {ProjectFs} fs
 * @param {string} gamePath
 * @param {Program} program
 */
export async function collectImages(fs, gamePath, program) {
  /** @type {Record<string, string>} */
  const images = {}
  for (const src of collectImageSources(program).keys()) {
    for (const path of imageCandidates(gamePath, src)) {
      if (!(await fs.exists(path))) continue
      images[src] = await blobToDataUrl(await fs.readBlob(path))
      break
    }
  }
  return images
}

/**
 * @param {{ title: string; program: Program; images: Record<string, string>; playerSource: string }} options
 * @returns {string}
 */
export function exportHtml({ title, program, images, playerSource }) {
  const data = JSON.stringify({ title, program, images }).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="generator" content="minijs Studio">
<title>${htmlEscape(title)}</title>
<style>html,body{margin:0;height:100%;background:#0c0c10;overflow:hidden}</style>
</head>
<body>
<div id="game"></div>
<script>${scriptSafe(playerSource)}</script>
<script>
(function () {
  var data = ${data};
  MiniPlayer.mount({ root: document.getElementById('game'), program: data.program, images: data.images, title: data.title });
})();
</script>
</body>
</html>
`
}

/**
 * File name for a download: letters, digits and dashes.
 * @param {string} name
 * @param {string} ext
 */
export function downloadName(name, ext) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game'
  return `${base}.${ext}`
}
