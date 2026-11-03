// The tile set editor. Pick a tile on the left, paint it in the middle, and set how it
// behaves on the right. Terrain tiles get a little sandbox to paint in, so you can see
// autotile working while you draw.

import { MAX_PALETTE, MAX_TILES, PIXEL_CHARS, TILE_KEYS, TILE_SIZES, frameSize, parseTileset, stringifyAsset, terrainMask } from '@minijs/runtime'
import { createPixelCanvas, nearestColor } from './pixel-canvas.js'
import { blankTileset, makeTerrainSheet, starterTileset } from './starter-tiles.js'
import { drawCell, frameCanvas, tileThumb } from './tile-draw.js'
import { choice, createHistory, cssColor, fill, fitCanvas, group, h, icon, iconButton, prefersReducedMotion, slider, textButton, wireUndoKeys } from './ui.js'

/** @import { TileDef, Tileset } from '@minijs/runtime/src/tiles/format.js' */
/** @import { Tool, ToolContext } from './index.js' */

/**
 * @param {HTMLElement} host
 * @param {string} text
 * @param {ToolContext} ctx
 * @returns {Tool}
 */
export function openTilesetTool(host, text, ctx) {
  /** @type {Tileset} */
  let set = parseTileset(text) ?? starterTileset()
  let selected = 0
  let frameIndex = 0
  let color = 1
  /** @type {import('./pixel-canvas.js').PixelTool} */
  let tool = 'pencil'
  let mirror = false
  let onion = false
  let previewTimer = 0

  const history = createHistory(stringifyAsset(set), (state) => {
    set = /** @type {Tileset} */ (parseTileset(state))
    selected = Math.min(selected, Math.max(0, set.tiles.length - 1))
    ctx.save(state)
    render()
  }, () => updateUndo())

  const commit = () => {
    const state = stringifyAsset(set)
    history.push(state)
    ctx.save(state)
  }

  const tile = () => set.tiles[selected]

  // Left column
  const list = h('div', { class: 'tile-list', role: 'listbox', 'aria-label': 'Tiles' })
  const addPlain = textButton('Tile', () => addTile('plain'), { icon: 'plus', title: 'Add a tile you draw once' })
  const addTerrain = textButton('Terrain', () => addTile('terrain'), { icon: 'plus', title: 'Add ground that draws its own edges' })
  const importInput = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: () => importPicture() })
  const left = h('aside', { class: 'tool-column tileset-left' },
    h('div', { class: 'tool-row' }, addPlain, addTerrain),
    list,
    textButton('Use a picture', () => importInput.click(), { icon: 'image' }),
    importInput,
  )

  // Middle
  const paintCanvas = h('canvas', { class: 'pixel-canvas', 'aria-label': 'Paint the tile here. The right mouse button picks a color.' })
  const paintBox = h('div', { class: 'pixel-box' }, paintCanvas)
  const painter = createPixelCanvas(paintCanvas, {
    width: set.tileWidth,
    height: set.tileHeight,
    palette: () => set.palette,
    readOnly: false,
    onPickColor: (index) => {
      color = index
      painter.setColor(color)
      setTool('pencil')
      renderPalette()
    },
    onLive: (frame) => {
      if (!tile()) return
      tile().frames[frameIndex] = frame
      schedulePreview()
    },
    onCommit: (frame) => {
      if (!tile()) return
      tile().frames[frameIndex] = frame
      commit()
      renderList()
      renderFrames()
    },
  })
  /** @type {Record<string, HTMLButtonElement>} */
  const toolButtons = {}
  /**
   * @param {import('./pixel-canvas.js').PixelTool} name
   * @param {string} iconName
   * @param {string} label
   */
  const toolButton = (name, iconName, label) => {
    toolButtons[name] = iconButton(iconName, label, () => setTool(name), { pressed: tool === name })
    return toolButtons[name]
  }
  /** @param {import('./pixel-canvas.js').PixelTool} next */
  function setTool(next) {
    tool = next
    painter.setTool(next)
    for (const [name, b] of Object.entries(toolButtons)) b.setAttribute('aria-pressed', String(name === next))
  }
  const undoButton = iconButton('arrow-u-up-left', 'Undo (Ctrl or Cmd + Z)', () => history.undo())
  const redoButton = iconButton('arrow-u-up-right', 'Redo', () => history.redo())
  const mirrorButton = iconButton('flip-horizontal', 'Mirror: paint both sides at once', () => {
    mirror = !mirror
    painter.setMirror(mirror)
    mirrorButton.setAttribute('aria-pressed', String(mirror))
  }, { pressed: false })
  const toolbar = h('div', { class: 'tool-toolbar', role: 'toolbar', 'aria-label': 'Painting tools' },
    toolButton('pencil', 'pencil-simple', 'Pencil'),
    toolButton('eraser', 'eraser', 'Eraser'),
    toolButton('bucket', 'paint-bucket', 'Fill an area'),
    toolButton('picker', 'eyedropper', 'Pick a color from the tile'),
    h('span', { class: 'tool-toolbar-gap' }),
    mirrorButton,
    iconButton('arrow-left', 'Slide left, wrapping around', () => painter.shift(-1, 0)),
    iconButton('arrow-right', 'Slide right, wrapping around', () => painter.shift(1, 0)),
    iconButton('arrow-up', 'Slide up, wrapping around', () => painter.shift(0, -1)),
    iconButton('arrow-down', 'Slide down, wrapping around', () => painter.shift(0, 1)),
    h('span', { class: 'tool-toolbar-gap' }),
    undoButton,
    redoButton,
  )
  const palette = h('div', { class: 'palette', role: 'listbox', 'aria-label': 'Colors' })
  const addColor = h('input', {
    type: 'color',
    class: 'palette-add',
    title: 'Add a color',
    'aria-label': 'Add a color',
    value: '#ff7a59',
    onChange: () => {
      if (set.palette.length >= MAX_PALETTE) {
        ctx.toast('This tile set is full of colors. Pick one you have.')
        return
      }
      set.palette.push(addColor.value)
      color = set.palette.length
      painter.setColor(color)
      commit()
      renderPalette()
    },
  })
  const frames = h('div', { class: 'frame-strip', role: 'listbox', 'aria-label': 'Animation frames' })
  const sheetHelp = h('p', { class: 'tool-help', text: 'Draw a small island in the left 3 by 3 squares: corners, edges and a middle. The top right square is for the inside corners. The empty squares are not used.' })
  const middle = h('div', { class: 'tool-column tileset-middle' }, toolbar, paintBox, sheetHelp, h('div', { class: 'palette-row' }, palette, addColor), frames)

  // Right column
  const details = h('div', { class: 'tool-details' })
  const right = h('aside', { class: 'tool-column tileset-right' }, details)

  const emptyState = h('div', { class: 'tool-empty' },
    icon('grid-four'),
    h('h3', { text: 'This tile set has no tiles yet' }),
    h('p', { class: 'muted', text: 'Start with the ready-made pack, or a blank set in the size you like.' }),
    h('div', { class: 'tool-row tool-row-center' },
      textButton('Use the starter tiles', () => {
        set = starterTileset()
        commit()
        render()
      }, { icon: 'sparkle', primary: true }),
      ...TILE_SIZES.map((size) => textButton(`Blank ${size} by ${size}`, () => {
        set = blankTileset(size)
        selected = 0
        addTile('plain')
      })),
    ),
  )

  const body = h('div', { class: 'tool-body tileset-body' }, left, middle, right)
  const root = h('div', { class: 'tool tileset-tool', tabindex: -1 }, emptyState, body)
  host.replaceChildren(root)
  wireUndoKeys(root, history)

  function updateUndo() {
    undoButton.disabled = !history.canUndo
    redoButton.disabled = !history.canRedo
  }

  /** @param {'plain' | 'terrain'} kind */
  function addTile(kind) {
    if (set.tiles.length >= MAX_TILES) {
      ctx.toast('This tile set is full. Remove a tile first.')
      return
    }
    const used = new Set(set.tiles.map((t) => t.key))
    const key = [...TILE_KEYS].find((k) => !used.has(k)) ?? 'a'
    /** @type {TileDef} */
    const next = { key, name: freeName(kind === 'terrain' ? 'ground' : 'tile'), kind, solid: 'solid', fps: 6, frames: [] }
    const { w, h: fh } = frameSize(set, next)
    next.frames = [kind === 'terrain' ? autoEdges(next, null) : '.'.repeat(w * fh)]
    set.tiles.push(next)
    selected = set.tiles.length - 1
    frameIndex = 0
    commit()
    render()
  }

  /** @param {string} base */
  function freeName(base) {
    const names = new Set(set.tiles.map((t) => t.name))
    if (!names.has(base)) return base
    for (let i = 2; ; i++) if (!names.has(`${base}-${i}`)) return `${base}-${i}`
  }

  /**
   * Make a terrain sheet with edges from the middle of what's there.
   * @param {TileDef} t
   * @param {string | null} frame
   * @param {{ edge?: number; top?: number; edgeWidth?: number; topWidth?: number }} [options]
   */
  function autoEdges(t, frame, options = {}) {
    const W = set.tileWidth
    const H = set.tileHeight
    const sheetW = W * 4
    const ch = (/** @type {number} */ i) => PIXEL_CHARS[i] ?? '.'
    const fillAt = (/** @type {number} */ x, /** @type {number} */ y) => {
      // Sample the middle cell of the island, so the fill repeats exactly.
      if (frame === null) return ch(color || 1)
      const c = frame[(H + (y % H)) * sheetW + W + (x % W)]
      return c === '.' || c === undefined ? ch(color || 1) : c
    }
    const edge = options.edge ?? darkest()
    const top = options.top ?? edge
    return makeTerrainSheet({
      tileW: W,
      tileH: H,
      fill: fillAt,
      edge: () => ch(edge),
      top: () => ch(top),
      edgeWidth: options.edgeWidth ?? Math.max(1, Math.round(W / 16)),
      topWidth: options.topWidth ?? Math.max(1, Math.round(W / 16) * 2),
    })
  }

  /** The darkest color in the palette, as a pixel position. */
  function darkest() {
    return nearestColor(set.palette, 0, 0, 0) + 1
  }

  function renderList() {
    list.replaceChildren(...set.tiles.map((t, i) => {
      const thumb = tileThumb(set, t)
      thumb.className = 'tile-thumb'
      return h('button', {
        type: 'button',
        class: 'tile-item',
        role: 'option',
        'aria-selected': String(i === selected),
        title: t.name,
        onClick: () => {
          selected = i
          frameIndex = 0
          render()
        },
      }, thumb, h('span', { class: 'tile-item-name', text: t.name }), t.kind === 'terrain' ? h('span', { class: 'tree-tag', text: 'auto' }) : null)
    }))
  }

  function renderPalette() {
    const swatches = set.palette.map((hex, i) => {
      const on = color === i + 1
      return h('button', {
        type: 'button',
        class: 'swatch',
        role: 'option',
        'aria-selected': String(on),
        'aria-label': `Color ${hex}`,
        title: hex,
        style: { background: hex },
        onClick: () => {
          color = i + 1
          painter.setColor(color)
          if (tool === 'eraser' || tool === 'picker') setTool('pencil')
          renderPalette()
        },
      })
    })
    palette.replaceChildren(...swatches)
  }

  function renderFrames() {
    const t = tile()
    if (!t) return
    const chips = t.frames.map((frame, i) => {
      const picture = t.kind === 'terrain' ? terrainFrameThumb(t, frame) : frameCanvas(set, t, frame)
      picture.className = 'frame-thumb'
      return h('button', {
        type: 'button',
        class: 'frame-chip',
        role: 'option',
        'aria-selected': String(i === frameIndex),
        'aria-label': `Frame ${i + 1}`,
        onClick: () => {
          frameIndex = i
          renderPainter()
          renderFrames()
        },
      }, picture)
    })
    fill(frames,
      ...chips,
      iconButton('plus', 'Add a frame: a copy of this one', () => {
        t.frames.splice(frameIndex + 1, 0, t.frames[frameIndex])
        frameIndex++
        commit()
        renderPainter()
        renderFrames()
        renderDetails()
      }),
      t.frames.length > 1
        ? iconButton('trash', 'Delete this frame', () => {
            t.frames.splice(frameIndex, 1)
            frameIndex = Math.min(frameIndex, t.frames.length - 1)
            commit()
            renderPainter()
            renderFrames()
            renderDetails()
          })
        : null,
      t.frames.length > 1
        ? iconButton('stack', 'Show the frame before this one, faintly', () => {
            onion = !onion
            renderPainter()
            renderFrames()
          }, { pressed: onion })
        : null,
    )
  }

  /**
   * @param {TileDef} t
   * @param {string} frame
   */
  function terrainFrameThumb(t, frame) {
    const canvas = document.createElement('canvas')
    canvas.width = set.tileWidth
    canvas.height = set.tileHeight
    const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
    drawCell(c, frameCanvas(set, t, frame), t, 0, set.tileWidth, set.tileHeight, 0, 0, 1)
    return canvas
  }

  function renderPainter() {
    const t = tile()
    if (!t) return
    const { w, h: fh } = frameSize(set, t)
    sheetHelp.hidden = t.kind !== 'terrain'
    painter.setFrame(t.frames[frameIndex], w, fh, t.kind === 'terrain' ? { gridX: set.tileWidth, gridY: set.tileHeight } : { gridX: set.tileWidth / 2, gridY: 0 })
    painter.setGhost(onion && t.frames.length > 1 ? t.frames[(frameIndex - 1 + t.frames.length) % t.frames.length] : '')
    painter.setColor(color)
  }

  /** @type {(() => void) | null} */
  let stopPreview = null
  /** @type {(() => void) | null} */
  let drawPreview = null

  function schedulePreview() {
    if (previewTimer) return
    previewTimer = requestAnimationFrame(() => {
      previewTimer = 0
      drawPreview?.()
    })
  }

  function renderDetails() {
    stopPreview?.()
    stopPreview = null
    const t = tile()
    if (!t) {
      details.replaceChildren()
      return
    }
    const nameInput = h('input', {
      type: 'text',
      class: 'tool-input',
      id: 'tile-name',
      value: t.name,
      maxLength: 40,
      onChange: () => {
        const clean = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+/, '')
        if (clean === '' || set.tiles.some((other) => other !== t && other.name === clean)) {
          ctx.toast(clean === '' ? 'Names start with a letter.' : `There is already a tile called "${clean}".`)
          nameInput.value = t.name
          return
        }
        t.name = clean
        nameInput.value = clean
        commit()
        renderList()
      },
    })
    fill(details,
      group('This tile',
        h('div', { class: 'tool-field' },
          h('label', { class: 'tool-label', for: 'tile-name', text: 'Name' }),
          nameInput,
          h('p', { class: 'tool-help' }, 'Rules use it: ', h('code', { text: `when player touches ${t.name} tile` })),
        ),
        choice({
          label: 'What happens when things bump it',
          value: t.solid,
          options: [
            { value: 'solid', label: 'Solid', title: 'Solid things can\'t pass through' },
            { value: 'top', label: 'Platform', title: 'Stand on it, jump up through it' },
            { value: 'none', label: 'Open', title: 'Things pass through' },
          ],
          onChange: (v) => {
            t.solid = v
            commit()
          },
        }),
        t.frames.length > 1 ? slider({
          label: 'Animation speed',
          min: 1,
          max: 24,
          value: t.fps,
          format: (v) => `${v} frames a second`,
          onChange: (v) => {
            t.fps = v
            commit()
          },
        }) : null,
      ),
      t.kind === 'terrain' ? terrainPanel(t) : plainPanel(t),
      h('div', { class: 'tool-row' },
        textButton('Copy tile', () => {
          const key = [...TILE_KEYS].find((k) => !set.tiles.some((o) => o.key === k))
          if (!key) return
          set.tiles.splice(selected + 1, 0, { ...t, key, name: freeName(t.name), frames: [...t.frames] })
          selected++
          commit()
          render()
        }, { icon: 'copy' }),
        textButton('Delete tile', () => {
          set.tiles.splice(selected, 1)
          selected = Math.max(0, selected - 1)
          frameIndex = 0
          commit()
          render()
        }, { icon: 'trash' }),
      ),
    )
  }

  /** @param {TileDef} t */
  function plainPanel(t) {
    const canvas = h('canvas', { class: 'tile-preview-canvas', 'aria-label': 'This tile repeated' })
    const box = h('div', { class: 'tile-preview' }, canvas)
    let tick = 0
    const draw = (/** @type {number} */ cssW = canvas.clientWidth, /** @type {number} */ cssH = canvas.clientHeight, ratio = Math.min(window.devicePixelRatio || 1, 2)) => {
      const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
      c.setTransform(ratio, 0, 0, ratio, 0, 0)
      c.imageSmoothingEnabled = false
      c.clearRect(0, 0, cssW, cssH)
      const picture = frameCanvas(set, t, t.frames[Math.floor(tick) % t.frames.length])
      const s = Math.max(1, Math.floor(cssW / (set.tileWidth * 3)))
      for (let y = 0; y * set.tileHeight * s < cssH; y++) {
        for (let x = 0; x * set.tileWidth * s < cssW; x++) {
          c.drawImage(picture, x * set.tileWidth * s, y * set.tileHeight * s, set.tileWidth * s, set.tileHeight * s)
        }
      }
    }
    queueMicrotask(() => {
      const stop = fitCanvas(canvas, draw)
      const timer = t.frames.length > 1 && !prefersReducedMotion() ? window.setInterval(() => {
        tick += t.fps / 8
        draw()
      }, 125) : 0
      stopPreview = () => {
        stop()
        clearInterval(timer)
      }
      drawPreview = () => draw()
    })
    return group('How it repeats', box)
  }

  /** @param {TileDef} t */
  function terrainPanel(t) {
    const W = 8
    const H = 6
    /** Paint on this small map to try the terrain. */
    const cells = new Uint8Array(W * H)
    for (const [x, y] of [[2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [1, 3], [2, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4]]) cells[y * W + x] = 1
    const canvas = h('canvas', { class: 'tile-preview-canvas terrain-sandbox', 'aria-label': 'Try it: click to add or remove ground here' })
    const box = h('div', { class: 'tile-preview tile-preview-sandbox' }, canvas)
    let scale = 1
    let cssWidth = 0
    let tick = 0
    const draw = (/** @type {number} */ cssW = cssWidth, /** @type {number} */ cssH = canvas.clientHeight, ratio = Math.min(window.devicePixelRatio || 1, 2)) => {
      cssWidth = cssW
      const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
      c.setTransform(ratio, 0, 0, ratio, 0, 0)
      c.imageSmoothingEnabled = false
      c.clearRect(0, 0, cssW, cssH)
      scale = Math.max(1, Math.floor(Math.min(cssW / (W * set.tileWidth), cssH / (H * set.tileHeight))))
      const picture = frameCanvas(set, t, t.frames[Math.floor(tick) % t.frames.length])
      const same = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && y >= 0 && x < W && y < H && cells[y * W + x] === 1
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (cells[y * W + x] !== 1) continue
          drawCell(c, picture, t, terrainMask(same, x, y), set.tileWidth, set.tileHeight, x * set.tileWidth * scale, y * set.tileHeight * scale, scale)
        }
      }
      c.strokeStyle = cssColor('--border')
      c.lineWidth = 1
      c.strokeRect(0.5, 0.5, W * set.tileWidth * scale - 1, H * set.tileHeight * scale - 1)
    }
    /** @type {0 | 1 | -1} */
    let paintValue = -1
    /** @param {PointerEvent} e */
    const paintAt = (e) => {
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor((e.clientX - rect.left) / (set.tileWidth * scale))
      const y = Math.floor((e.clientY - rect.top) / (set.tileHeight * scale))
      if (x < 0 || y < 0 || x >= W || y >= H) return
      if (paintValue === -1) paintValue = cells[y * W + x] === 1 ? 0 : 1
      cells[y * W + x] = paintValue
      draw()
    }
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId)
      paintValue = -1
      paintAt(e)
    })
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons !== 0) paintAt(e)
    })
    queueMicrotask(() => {
      const stop = fitCanvas(canvas, draw)
      const timer = t.frames.length > 1 && !prefersReducedMotion() ? window.setInterval(() => {
        tick += t.fps / 8
        draw()
      }, 125) : 0
      stopPreview = () => {
        stop()
        clearInterval(timer)
      }
      drawPreview = () => draw()
    })

    let edgeColor = darkest()
    let topColor = darkest()
    let edgeWidth = Math.max(1, Math.round(set.tileWidth / 16))
    let topWidth = Math.max(1, Math.round(set.tileWidth / 8))
    /**
     * @param {string} label
     * @param {() => number} get
     * @param {(v: number) => void} put
     */
    const colorChooser = (label, get, put) => h('label', { class: 'edge-color' },
      h('span', { text: label }),
      h('button', {
        type: 'button',
        class: 'swatch',
        title: `Use the color you have picked (${set.palette[color - 1] ?? ''})`,
        'aria-label': `${label}: use the picked color`,
        style: { background: set.palette[get() - 1] ?? 'transparent' },
        onClick: (/** @type {Event} */ e) => {
          put(color)
          const swatch = /** @type {HTMLElement} */ (e.currentTarget)
          swatch.style.background = set.palette[color - 1]
        },
      }),
    )
    return h('div', { class: 'tool-stack' },
      group('Try it',
        box,
        h('p', { class: 'tool-help', text: 'Click to add or remove ground. Edges and corners draw themselves.' }),
      ),
      group('Draw edges for me',
        h('p', { class: 'tool-help', text: 'Paint the middle square, pick colors with the palette, then press the button.' }),
        h('div', { class: 'tool-row' },
          colorChooser('Sides', () => edgeColor, (v) => { edgeColor = v }),
          colorChooser('Top', () => topColor, (v) => { topColor = v }),
        ),
        slider({ label: 'Side thickness', min: 1, max: Math.floor(set.tileWidth / 2), value: edgeWidth, format: (v) => `${v} px`, onInput: (v) => { edgeWidth = v } }),
        slider({ label: 'Top thickness', min: 1, max: Math.floor(set.tileHeight / 2), value: topWidth, format: (v) => `${v} px`, onInput: (v) => { topWidth = v } }),
        textButton('Draw the edges', () => {
          t.frames = t.frames.map((frame) => autoEdges(t, frame, { edge: edgeColor, top: topColor, edgeWidth, topWidth }))
          commit()
          renderPainter()
          renderFrames()
          renderList()
          drawPreview?.()
        }, { icon: 'magic-wand', primary: true }),
      ),
    )
  }

  async function importPicture() {
    const file = importInput.files?.[0]
    importInput.value = ''
    if (!file) return
    try {
      const url = URL.createObjectURL(file)
      const image = new Image()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = url
      })
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }))
      c.drawImage(image, 0, 0)
      const { tileWidth: W, tileHeight: H } = set
      const data = c.getImageData(0, 0, canvas.width, canvas.height).data
      /** @type {Map<number, number>} */
      const known = new Map(set.palette.map((hex, i) => [Number.parseInt(hex.slice(1), 16), i]))
      let added = 0
      const seen = new Set(set.tiles.map((t) => t.frames[0]))
      for (let row = 0; row + H <= canvas.height; row += H) {
        for (let col = 0; col + W <= canvas.width; col += W) {
          if (set.tiles.length >= MAX_TILES) break
          let frame = ''
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const at = ((row + y) * canvas.width + col + x) * 4
              if (data[at + 3] < 128) {
                frame += '.'
                continue
              }
              const rgb = (data[at] << 16) | (data[at + 1] << 8) | data[at + 2]
              let index = known.get(rgb)
              if (index === undefined) {
                if (set.palette.length < MAX_PALETTE) {
                  index = set.palette.length
                  set.palette.push(`#${rgb.toString(16).padStart(6, '0')}`)
                } else {
                  index = nearestColor(set.palette, data[at], data[at + 1], data[at + 2])
                }
                known.set(rgb, index)
              }
              frame += PIXEL_CHARS[index + 1]
            }
          }
          if (/^\.+$/.test(frame) || seen.has(frame)) continue
          seen.add(frame)
          const key = [...TILE_KEYS].find((k) => !set.tiles.some((t) => t.key === k))
          if (!key) break
          set.tiles.push({ key, name: freeName('tile'), kind: 'plain', solid: 'solid', fps: 6, frames: [frame] })
          added++
        }
      }
      if (added === 0) {
        ctx.toast(`No new tiles found. The picture needs to be at least ${W} by ${H} pixels.`)
        return
      }
      selected = set.tiles.length - added
      frameIndex = 0
      commit()
      render()
      ctx.toast(`Added ${added} ${added === 1 ? 'tile' : 'tiles'}. Each one is ${W} by ${H} pixels.`)
    } catch {
      ctx.toast('I couldn\'t read that picture. Try a PNG file.')
    }
  }

  function render() {
    const none = set.tiles.length === 0
    emptyState.hidden = !none
    body.hidden = none
    if (none) return
    frameIndex = Math.min(frameIndex, tile().frames.length - 1)
    renderList()
    renderPalette()
    renderFrames()
    renderPainter()
    renderDetails()
    updateUndo()
  }

  render()

  return {
    destroy() {
      stopPreview?.()
      painter.destroy()
      if (previewTimer) cancelAnimationFrame(previewTimer)
    },
  }
}
