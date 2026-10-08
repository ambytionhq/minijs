import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const TARGETS = {
  'darwin-aarch64': '.app.tar.gz',
  'darwin-x86_64': '.app.tar.gz',
  'windows-x86_64': '.exe',
  'linux-x86_64': '.AppImage',
}

/** GitHub's draft URLs change when the release is published. */
export function updateAssetUrl(asset, version) {
  return (asset.browser_download_url ?? '').replace(/\/download\/untagged-[^/]+\//, `/download/${encodeURIComponent(`v${version}`)}/`)
}

/** Reject incomplete releases before the app can discover them. */
export function verifyUpdateRelease(manifest, release, signatures, version) {
  if (manifest.version !== version || release.tag_name !== `v${version}`) {
    throw new Error('The updater version, release tag and package.json must match.')
  }
  for (const [target, extension] of Object.entries(TARGETS)) {
    const platform = manifest.platforms?.[target]
    if (!platform?.url || !platform.signature) throw new Error(`Missing signed updater target: ${target}`)
    const asset = release.assets.find((item) => updateAssetUrl(item, version) === platform.url)
    if (!asset || !asset.name.endsWith(extension) || asset.size <= 0) {
      throw new Error(`The ${target} update does not point to its uploaded installer.`)
    }
    const signatureAsset = release.assets.find((item) => item.name === `${asset.name}.sig`)
    const signature = signatures[`${asset.name}.sig`]?.trim()
    if (!signatureAsset || !signature || signature !== platform.signature.trim()) {
      throw new Error(`The ${target} signature does not match the uploaded signature file.`)
    }
    const decoded = Buffer.from(signature, 'base64').toString('utf8')
    if (!decoded.startsWith('untrusted comment:') || decoded.split('\n').length < 4) {
      throw new Error(`The ${target} signature is not a Tauri updater signature.`)
    }
  }
}

async function main() {
  const directory = process.argv[2]
  if (!directory) throw new Error('Usage: node scripts/verify-update-release.mjs <download-directory>')
  const manifest = JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8'))
  const release = JSON.parse(await readFile(join(directory, 'release.json'), 'utf8'))
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const signatures = {}
  for (const asset of release.assets.filter((item) => item.name.endsWith('.sig'))) {
    signatures[asset.name] = await readFile(join(directory, asset.name), 'utf8')
  }
  verifyUpdateRelease(manifest, release, signatures, version)
  console.log(`Verified signed updater assets for macOS Intel, macOS Apple silicon, Windows and Linux (${version}).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
