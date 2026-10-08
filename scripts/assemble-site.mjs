// Put the built Studio inside the built website, so one folder deploys
// everything: / (landing page), /studio/ (the Studio), /play/ (games).
// Called by the site's build script after building the Studio, games and landing page.

import { cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const studio = join(ROOT, 'playground/dist')
const site = join(ROOT, 'site/dist')

if (!existsSync(join(studio, 'index.html'))) throw new Error('Build the Studio first: npm run build')
if (!existsSync(join(site, 'index.html'))) throw new Error('Build the site first: npm run build -w site')

rmSync(join(site, 'studio'), { recursive: true, force: true })
cpSync(studio, join(site, 'studio'), { recursive: true })

// Generated game pages are ignored by Git. Fail the build if a deployment
// would contain the landing page without its playable games.
for (const name of ['cloud-hopper', 'star-defender', 'crypt-dash']) {
  if (!existsSync(join(site, 'play', `${name}.html`))) {
    throw new Error(`Missing exported game: /play/${name}.html`)
  }
}
console.log(`Site ready in ${site}: / (landing), /studio/, /play/`)
