// Minimal zip reader and writer: enough to move whole projects in and out.
// Writes deflate (or stored when that is smaller), reads stored and deflate.
// No dependencies; compression comes from the browser's CompressionStream.

import { transform } from './bytes.js'

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

/** @param {Uint8Array} bytes */
export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** DOS date and time for "now". */
function dosStamp(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

/**
 * @param {Record<string, string | Blob | Uint8Array>} files path -> contents
 * @returns {Promise<Blob>}
 */
export async function writeZip(files) {
  const encoder = new TextEncoder()
  /** @type {Uint8Array[]} */
  const parts = []
  /** @type {Uint8Array[]} */
  const central = []
  let offset = 0
  const { time, day } = dosStamp()
  for (const [path, value] of Object.entries(files)) {
    const data =
      typeof value === 'string'
        ? encoder.encode(value)
        : value instanceof Uint8Array
          ? value
          : new Uint8Array(await value.arrayBuffer())
    const name = encoder.encode(path)
    const crc = crc32(data)
    const deflated = await transform(data, 'deflate-raw', 'compress')
    const useDeflate = deflated.length < data.length
    const body = useDeflate ? deflated : data
    const method = useDeflate ? 8 : 0

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, method, true)
    local.setUint16(10, time, true)
    local.setUint16(12, day, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, body.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, body)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint16(10, method, true)
    entry.setUint16(12, time, true)
    entry.setUint16(14, day, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, body.length, true)
    entry.setUint32(24, data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), name)
    offset += 30 + name.length + body.length
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  const count = Object.keys(files).length
  end.setUint16(8, count, true)
  end.setUint16(10, count, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' })
}

/**
 * Read every file in a zip. Folders, macOS "__MACOSX" extras and unsafe paths are skipped.
 * @param {Blob} blob
 * @returns {Promise<Record<string, Uint8Array>>}
 */
export async function readZip(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let endAt = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endAt = i
      break
    }
  }
  if (endAt < 0) throw new Error('This is not a zip file, or it is damaged.')
  const count = view.getUint16(endAt + 10, true)
  let at = view.getUint32(endAt + 16, true)
  const decoder = new TextDecoder()
  /** @type {Record<string, Uint8Array>} */
  const out = {}
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('This zip file is damaged.')
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const localAt = view.getUint32(at + 42, true)
    // Windows' built-in ZIP tools can write backslashes inside entry names.
    // Normalize before checking paths or removing the enclosing project folder.
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)).replaceAll('\\', '/')
    at += 46 + nameLength + extraLength + commentLength

    const unsafe = name.split('/').includes('..') || name.startsWith('/') || /^[A-Za-z]:/.test(name)
    if (name.endsWith('/') || name.startsWith('__MACOSX/') || name.split('/').pop() === '.DS_Store' || unsafe) continue
    const localNameLength = view.getUint16(localAt + 26, true)
    const localExtraLength = view.getUint16(localAt + 28, true)
    const start = localAt + 30 + localNameLength + localExtraLength
    const body = bytes.subarray(start, start + compressedSize)
    if (method === 0) out[name] = body.slice()
    else if (method === 8) out[name] = await transform(body, 'deflate-raw', 'decompress')
    else throw new Error(`"${name}" uses a kind of zip compression I can't read.`)
  }
  return out
}

/**
 * When every file sits inside one top folder (how most zip tools save a folder), drop that folder.
 * @param {Record<string, Uint8Array>} files
 */
export function stripCommonFolder(files) {
  const paths = Object.keys(files)
  const first = paths[0]?.split('/')[0]
  if (!first || paths.some((p) => !p.startsWith(`${first}/`))) return files
  return Object.fromEntries(paths.map((p) => [p.slice(first.length + 1), files[p]]))
}
