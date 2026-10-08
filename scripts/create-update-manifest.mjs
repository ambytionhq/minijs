import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { updateAssetUrl, verifyUpdateRelease } from './verify-update-release.mjs'

const PACKAGES = [
  { match: /universal\.app\.tar\.gz$/, targets: ['darwin-aarch64', 'darwin-x86_64', 'darwin-aarch64-app', 'darwin-x86_64-app'] },
  { match: /\.exe$/, targets: ['windows-x86_64', 'windows-x86_64-nsis'] },
  { match: /\.AppImage$/, targets: ['linux-x86_64', 'linux-x86_64-appimage'] },
  { match: /\.msi$/, targets: ['windows-x86_64-msi'], optional: true },
  { match: /\.deb$/, targets: ['linux-x86_64-deb'], optional: true },
  { match: /\.rpm$/, targets: ['linux-x86_64-rpm'], optional: true },
]

/** Build one manifest after independent platform uploads have all finished. */
export function createUpdateManifest(release, signatures, version, pubDate = new Date().toISOString()) {
  const platforms = {}
  for (const { match, targets, optional } of PACKAGES) {
    const assets = release.assets.filter((asset) => match.test(asset.name))
    if (optional && assets.length === 0) continue
    if (assets.length !== 1) throw new Error(`Expected exactly one installer for ${targets[0]}.`)
    const asset = assets[0]
    const signature = signatures[`${asset.name}.sig`]?.trim()
    const signatureAsset = release.assets.find((item) => item.name === `${asset.name}.sig`)
    const decoded = Buffer.from(signature ?? '', 'base64').toString('utf8')
    if (!asset.size || !signatureAsset?.size || !decoded.startsWith('untrusted comment:') || decoded.split('\n').length < 4) {
      throw new Error(`Missing valid signed installer for ${targets[0]}.`)
    }
    for (const target of targets) platforms[target] = { url: updateAssetUrl(asset, version), signature }
  }
  const manifest = { version, notes: release.body ?? '', pub_date: pubDate, platforms }
  verifyUpdateRelease(manifest, release, signatures, version)
  return manifest
}

async function main() {
  const directory = process.argv[2]
  if (!directory) throw new Error('Usage: node scripts/create-update-manifest.mjs <download-directory>')
  const release = JSON.parse(await readFile(join(directory, 'release.json'), 'utf8'))
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const signatures = {}
  for (const asset of release.assets.filter((item) => item.name.endsWith('.sig'))) {
    signatures[asset.name] = await readFile(join(directory, asset.name), 'utf8')
  }
  const manifest = createUpdateManifest(release, signatures, version)
  await writeFile(join(directory, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Created and verified updater manifest for ${version}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
