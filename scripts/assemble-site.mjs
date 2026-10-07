// Put the built Studio inside the built website, so one folder deploys
// everything: / (landing page), /studio/ (the Studio), /play/ (games).
// Run after `npm run build` and `npm run build -w site` (npm run site:build does all of it).

import { cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const studio = join(ROOT, 'playground/dist')
const site = join(ROOT, 'site/dist')

if (!existsSync(join(studio, 'index.html'))) throw new Error('Build the Studio first: npm run build')
if (!existsSync(join(site, 'index.html'))) throw new Error('Build the site first: npm run build -w site')

rmSync(join(site, 'studio'), { recursive: true, force: true })
cpSync(studio, join(site, 'studio'), { recursive: true })
console.log(`Site ready in ${site}: / (landing), /studio/, /play/`)
