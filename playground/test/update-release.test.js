import { describe, expect, it } from 'vitest'
import { verifyUpdateRelease } from '../../scripts/verify-update-release.mjs'

function releaseFixture() {
  const names = {
    'darwin-aarch64': 'minijs.app.tar.gz',
    'darwin-x86_64': 'minijs.app.tar.gz',
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
