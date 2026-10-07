// Small byte helpers shared by share codes, zips and HTML export.

/**
 * @param {Uint8Array} bytes
 * @param {CompressionFormat} format
 * @param {'compress' | 'decompress'} direction
 * @returns {Promise<Uint8Array>}
 */
export async function transform(bytes, format, direction) {
  const stream =
    direction === 'compress' ? new CompressionStream(format) : new DecompressionStream(format)
  const out = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** @param {Uint8Array} bytes */
export function toBase64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** @param {string} base64 */
export function fromBase64(base64) {
  const s = atob(base64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** URL-safe base64 without padding. @param {Uint8Array} bytes */
export function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** @param {string} text */
export function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  return fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
}

/** @param {Blob} blob */
export async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return `data:${blob.type || 'application/octet-stream'};base64,${toBase64(bytes)}`
}

/** @param {string} url */
export function dataUrlToBlob(url) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url)
  if (!match) throw new Error('not a data URL')
  const bytes = match[2] ? fromBase64(match[3]) : new TextEncoder().encode(decodeURIComponent(match[3]))
  return new Blob([bytes], { type: match[1] || 'application/octet-stream' })
}
