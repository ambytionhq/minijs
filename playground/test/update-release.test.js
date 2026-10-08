import { describe, expect, it } from 'vitest'
import { verifyUpdateRelease } from '../../scripts/verify-update-release.mjs'
import { createUpdateManifest } from '../../scripts/create-update-manifest.mjs'

function releaseFixture() {
  const names = {
    'darwin-aarch64': 'minijs_universal.app.tar.gz',
    'darwin-x86_64': 'minijs_universal.app.tar.gz',
    'windows-x86_64': 'minijs-setup.exe',
    'linux-x86_64': 'minijs.AppImage',
  }
  const signature = Buffer.from('untrusted comment: test signature\nRWtest\ntrusted comment: timestamp\ntest').toString('base64')
  const signatures = {}
  const platforms = {}
  const assets = []
  for (const [target, name] of Object.entries(names)) {
    const url = `https://github.com/ambytionhq/minijs/releases/download/v0.2.0/${name}`
    platforms[target] = { url, signature }
    if (!signatures[`${name}.sig`]) {
      signatures[`${name}.sig`] = signature
      assets.push({ name, size: 12345, browser_download_url: url }, { name: `${name}.sig`, size: 200 })
    }
  }
  return { manifest: { version: '0.2.0', platforms }, release: { tag_name: 'v0.2.0', assets }, signatures }
}

const verify = ({ manifest, release, signatures }, version = '0.2.0') => verifyUpdateRelease(manifest, release, signatures, version)

describe('release publication gate', () => {
  it('accepts signed assets for every supported target', () => {
    expect(() => verify(releaseFixture())).not.toThrow()
  })
  it('replaces temporary GitHub draft links with permanent release links', () => {
    const fixture = releaseFixture()
    for (const asset of fixture.release.assets) {
      if (asset.browser_download_url) asset.browser_download_url = asset.browser_download_url.replace('/download/v0.2.0/', '/download/untagged-draft/')
    }
    expect(() => verify(fixture)).not.toThrow()
    const manifest = createUpdateManifest(fixture.release, fixture.signatures, '0.2.0')
    expect(manifest.platforms['windows-x86_64'].url).toContain('/download/v0.2.0/')
    expect(JSON.stringify(manifest)).not.toContain('untagged-')
  })
  it('combines signed platform uploads into one manifest and rejects missing or ambiguous installers', () => {
    const { release, signatures } = releaseFixture()
    const manifest = createUpdateManifest(release, signatures, '0.2.0')
    expect(manifest.platforms['darwin-aarch64']).toEqual(manifest.platforms['darwin-x86_64'])
    expect(manifest.platforms['windows-x86_64-nsis']).toEqual(manifest.platforms['windows-x86_64'])
    const missing = { ...release, assets: release.assets.filter((asset) => !asset.name.endsWith('.exe')) }
    expect(() => createUpdateManifest(missing, signatures, '0.2.0')).toThrow('exactly one installer')
    const ambiguous = { ...release, assets: [...release.assets, { ...release.assets.find((asset) => asset.name.endsWith('.exe')), name: 'another.exe' }] }
    expect(() => createUpdateManifest(ambiguous, signatures, '0.2.0')).toThrow('exactly one installer')
    expect(() => createUpdateManifest(release, {}, '0.2.0')).toThrow('Missing valid signed installer')
  })
  it('refuses a release with a missing platform', () => {
    const fixture = releaseFixture()
    delete fixture.manifest.platforms['darwin-aarch64']
    expect(() => verify(fixture)).toThrow('Missing signed updater target: darwin-aarch64')
  })
  it('rejects mismatched tags or versions', () => {
    expect(() => verify(releaseFixture(), '0.3.0')).toThrow('must match')
    const fixture = releaseFixture()
    fixture.release.tag_name = 'v0.1.0'
    expect(() => verify(fixture)).toThrow('must match')
  })
  it('refuses download URLs that are not uploaded release assets', () => {
    const fixture = releaseFixture()
    fixture.manifest.platforms['windows-x86_64'].url = 'https://example.com/untrusted.exe'
    expect(() => verify(fixture)).toThrow('uploaded installer')
  })
  it('refuses signatures that differ from uploaded signature files', () => {
    const fixture = releaseFixture()
    fixture.signatures['minijs.AppImage.sig'] = 'different'
    expect(() => verify(fixture)).toThrow('signature does not match')
  })
  it('refuses unsigned or empty assets', () => {
    const fixture = releaseFixture()
    fixture.release.assets.find((asset) => asset.name === 'minijs.AppImage').size = 0
    expect(() => verify(fixture)).toThrow('uploaded installer')
    const missing = releaseFixture()
    missing.release.assets = missing.release.assets.filter((asset) => asset.name !== 'minijs.AppImage.sig')
    expect(() => verify(missing)).toThrow('signature does not match')
  })
})
