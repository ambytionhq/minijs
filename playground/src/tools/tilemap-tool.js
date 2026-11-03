// The tile map editor: paint levels with the tiles from a tile set, in layers, and drop
// things from your game onto them. Terrain draws its own edges as you paint.

import { MAX_MAP_SIDE, parseTilemap, parseTileset, stringifyAsset, terrainMask } from '@minijs/runtime'
import { drawCell, frameCanvas, tileThumb } from './tile-draw.js'
import { assetName, choice, createHistory, cssColor, fitCanvas, group, h, icon, iconButton, prefersReducedMotion, slider, textButton, toggle, usageStrip, wireUndoKeys } from './ui.js'

/** @import { Tileset, Tilemap } from '@minijs/runtime/src/tiles/format.js' */
/** @import { Tool, ToolContext } from './index.js' */

/** @typedef {'paint' | 'erase' | 'fill' | 'box' | 'pick' | 'thing' | 'hand'} MapTool */

const THING_COLORS = ['#e6c554', '#7cc7ef', '#e38bb4', '#8fd14f', '#f79a2e', '#c6a4ee']

/**
 * @param {HTMLElement} host
 * @param {string} text
 * @param {ToolContext} ctx
 * @returns {Tool}
 */
export function openTilemapTool(host, text, ctx) {
  /** @type {Tilemap} */
  let map = parseTilemap(text) ?? { minijs: 'tilemap', version: 1, tileset: '', width: 40, height: 12, layers: [], things: [] }
  if (map.layers.length === 0) map.layers.push(newLayer('Ground', map))
  /** @type {Tileset | null} */
  let tileset = null
  /** @type {Array<HTMLCanvasElement[]>} */
  let pictures = []
  /** @type {Map<string, number>} */
  let byKey = new Map()
  let tileIndex = 0
  let layerIndex = 0
  /** @type {MapTool} */
  let tool = 'paint'
  let zoom = 2
  let panX = 12
  let panY = 12
  let showGrid = true
  let showSolid = false
  /** @type {string[]} */
  let thingNames = []
  let thingName = ''
  let hoverCol = -1
  let hoverRow = -1
  /** @type {{ col: number; row: number } | null} */
  let boxStart = null
  /** @type {null | { x: number; y: number; panX: number; panY: number }} */
  let dragging = null
  let painting = false
  let lastCol = -1
  let lastRow = -1
  let spaceHeld = false
  let tick = 0
  let framed = false
  let cssW = 0
  let cssH = 0
  let ratio = 1
  let dirty = true
  let raf = 0

  const history = createHistory(stringifyAsset(map), (state) => {
    map = /** @type {Tilemap} */ (parseTilemap(state))
    layerIndex = Math.min(layerIndex, map.layers.length - 1)
    ctx.save(state)
    renderPanels()
    invalidate()
  }, () => updateUndo())

  const commit = () => {
    const state = stringifyAsset(map)
    history.push(state)
    ctx.save(state)
    updateUndo()
  }

  const canvas = h('canvas', {
    class: 'map-canvas',
    tabIndex: 0,
    'aria-label': 'The level. Paint on it with the mouse, a finger or a pen.',
  })
  const canvasBox = h('div', { class: 'map-box' }, canvas)
  const cursorInfo = h('span', { class: 'map-info', role: 'status' })

  /** @type {Partial<Record<MapTool, HTMLButtonElement>>} */
  const toolButtons = {}
  /**
   * @param {MapTool} name
   * @param {string} iconName
   * @param {string} label
   */
  const toolButton = (name, iconName, label) => {
    const b = iconButton(iconName, label, () => setTool(name), { pressed: tool === name })
    toolButtons[name] = b
    return b
  }
  /** @param {MapTool} next */
  function setTool(next) {
    tool = next
    for (const [name, b] of Object.entries(toolButtons)) b.setAttribute('aria-pressed', String(name === next))
    canvas.dataset.tool = next
    renderLeft()
    invalidate()
  }
  const undoButton = iconButton('arrow-u-up-left', 'Undo (Ctrl or Cmd + Z)', () => history.undo())
  const redoButton = iconButton('arrow-u-up-right', 'Redo', () => history.redo())
  const gridButton = iconButton('grid-four', 'Show the grid', () => {
    showGrid = !showGrid
    gridButton.setAttribute('aria-pressed', String(showGrid))
    invalidate()
  }, { pressed: showGrid })
  const solidButton = iconButton('cube', 'Show which tiles are solid', () => {
    showSolid = !showSolid
    solidButton.setAttribute('aria-pressed', String(showSolid))
    invalidate()
  }, { pressed: showSolid })
  const toolbar = h('div', { class: 'tool-toolbar', role: 'toolbar', 'aria-label': 'Map tools' },
    toolButton('paint', 'paint-brush', 'Paint tiles (B)'),
    toolButton('erase', 'eraser', 'Erase (E)'),
    toolButton('fill', 'paint-bucket', 'Fill an area (G)'),
    toolButton('box', 'selection', 'Paint a rectangle (R)'),
    toolButton('pick', 'eyedropper', 'Pick the tile you click (I)'),
    toolButton('thing', 'person-simple-run', 'Place things from your game (T)'),
    toolButton('hand', 'hand-grabbing', 'Move around (hold Space)'),
    h('span', { class: 'tool-toolbar-gap' }),
    gridButton,
    solidButton,
    iconButton('magnifying-glass-minus', 'Zoom out', () => setZoom(zoom - 1)),
    iconButton('magnifying-glass-plus', 'Zoom in', () => setZoom(zoom + 1)),
    h('span', { class: 'tool-toolbar-gap' }),
    undoButton,
    redoButton,
  )

  const leftPanel = h('aside', { class: 'tool-column map-left' })
  const rightPanel = h('aside', { class: 'tool-column map-right' })
  const usage = h('div', { class: 'tool-usage-host' })
  const body = h('div', { class: 'tool-body map-body' },
    leftPanel,
    h('div', { class: 'tool-column map-middle' }, toolbar, canvasBox, cursorInfo),
    rightPanel,
  )
  const root = h('div', { class: 'tool tilemap-tool', tabindex: -1 }, body, usage)
  host.replaceChildren(root)
  wireUndoKeys(root, history)

  /**
   * @param {string} name
   * @param {Tilemap} forMap
   */
  function newLayer(name, forMap) {
    return {
      name,
      rows: Array.from({ length: forMap.height }, () => '.'.repeat(forMap.width)),
      solid: true,
      front: false,
      parallax: 1,
      visible: true,
    }
  }

  function updateUndo() {
    undoButton.disabled = !history.canUndo
    redoButton.disabled = !history.canRedo
  }

  /** @param {number} next */
  function setZoom(next) {
    const clean = Math.max(1, Math.min(6, next))
    if (clean === zoom) return
    // Keep the middle of the view where it is.
    const cx = (cssW / 2 - panX) / zoom
    const cy = (cssH / 2 - panY) / zoom
    zoom = clean
    panX = cssW / 2 - cx * zoom
    panY = cssH / 2 - cy * zoom
    invalidate()
  }

  function invalidate() {
    dirty = true
    if (raf === 0) raf = requestAnimationFrame(frame)
  }

  function frame() {
    raf = 0
    if (dirty) {
      dirty = false
      draw()
    }
  }

  /** @param {string} row @param {number} col */
  const charAt = (row, col) => row[col] ?? '.'

  /**
   * @param {number} col
   * @param {number} row
   * @param {number} layer
   * @returns {string}
   */
  function cellChar(col, row, layer) {
    return charAt(map.layers[layer].rows[row] ?? '', col)
  }

  /**
   * @param {number} col
   * @param {number} row
   * @param {string} ch
   */
  function setCell(col, row, ch) {
    if (col < 0 || row < 0 || col >= map.width || row >= map.height) return
    const layer = map.layers[layerIndex]
    const line = layer.rows[row]
    if (line[col] === ch) return
    layer.rows[row] = line.slice(0, col) + ch + line.slice(col + 1)
  }

  function draw() {
    if (cssW === 0) return
    const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
    c.setTransform(ratio, 0, 0, ratio, 0, 0)
    c.imageSmoothingEnabled = false
    c.fillStyle = cssColor('--stage')
    c.fillRect(0, 0, cssW, cssH)
    if (!tileset) return
    const { tileWidth: tw, tileHeight: th, tiles } = tileset
    const cell = tw * zoom
    const cellH = th * zoom
    c.fillStyle = cssColor('--surface')
    c.fillRect(panX, panY, map.width * cell, map.height * cellH)

    map.layers.forEach((layer, l) => {
      if (!layer.visible) return
      // Faint when you are working on a different layer, so yours stands out.
      c.globalAlpha = l === layerIndex || tool === 'thing' ? 1 : 0.55
      const first = Math.max(0, Math.floor(-panX / cell))
      const last = Math.min(map.width - 1, Math.floor((cssW - panX) / cell))
      const top = Math.max(0, Math.floor(-panY / cellH))
      const bottom = Math.min(map.height - 1, Math.floor((cssH - panY) / cellH))
      const rows = layer.rows
      for (let row = top; row <= bottom; row++) {
        const line = rows[row]
        for (let col = first; col <= last; col++) {
          const ch = line[col]
          if (ch === '.' || ch === undefined) continue
          const t = byKey.get(ch)
          if (t === undefined) continue
          const tile = tiles[t]
          const frames = pictures[t]
          const picture = frames[Math.floor((tick * tile.fps) / 8) % frames.length]
          const mask = tile.kind === 'terrain'
            ? terrainMask((x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height || rows[y][x] === ch, col, row)
            : 0
          drawCell(c, picture, tile, mask, tw, th, panX + col * cell, panY + row * cellH, zoom)
        }
      }
      c.globalAlpha = 1
    })

    if (showSolid) {
      for (let row = 0; row < map.height; row++) {
        for (let col = 0; col < map.width; col++) {
          let kind = 0
          for (const layer of map.layers) {
            if (!layer.solid) continue
            const t = byKey.get(charAt(layer.rows[row], col))
            if (t === undefined) continue
            const solid = tiles[t].solid
            if (solid === 'solid') kind = 1
            else if (solid === 'top' && kind === 0) kind = 2
          }
          if (kind === 0) continue
          c.fillStyle = kind === 1 ? 'rgb(228 87 46 / 0.4)' : 'rgb(124 199 239 / 0.5)'
          c.fillRect(panX + col * cell, panY + row * cellH, cell, kind === 1 ? cellH : Math.ceil(cellH / 4))
        }
      }
    }

    // Things placed on the map.
    map.things.forEach((placed) => {
      const color = THING_COLORS[Math.abs(hash(placed.thing)) % THING_COLORS.length]
      const x = panX + placed.x * zoom
      const y = panY + placed.y * zoom
      c.fillStyle = color
      c.globalAlpha = 0.85
      c.fillRect(x, y, tw * zoom, th * zoom)
      c.globalAlpha = 1
      c.strokeStyle = '#1f2430'
      c.lineWidth = 1
      c.strokeRect(x + 0.5, y + 0.5, tw * zoom - 1, th * zoom - 1)
      c.fillStyle = '#1f2430'
      c.font = `600 ${Math.max(9, 5 * zoom)}px var(--mono, monospace)`
      c.textBaseline = 'top'
      c.fillText(placed.thing.slice(0, Math.max(2, Math.floor((tw * zoom) / Math.max(6, 3 * zoom)))), x + 2, y + 2, tw * zoom - 3)
    })

    if (showGrid && cell >= 8) {
      c.strokeStyle = cssColor('--border')
      c.globalAlpha = 0.45
      c.lineWidth = 1
      c.beginPath()
      for (let col = 0; col <= map.width; col++) {
        const x = Math.round(panX + col * cell) + 0.5
        c.moveTo(x, panY)
        c.lineTo(x, panY + map.height * cellH)
      }
      for (let row = 0; row <= map.height; row++) {
        const y = Math.round(panY + row * cellH) + 0.5
        c.moveTo(panX, y)
        c.lineTo(panX + map.width * cell, y)
      }
      c.stroke()
      c.globalAlpha = 1
    }
    c.strokeStyle = cssColor('--text-muted')
    c.lineWidth = 1
    c.strokeRect(Math.round(panX) - 0.5, Math.round(panY) - 0.5, map.width * cell + 1, map.height * cellH + 1)

    // Where the brush would land.
    if (hoverCol >= 0 && tool !== 'hand') {
      if (tool === 'paint' && tiles[tileIndex]) {
        const t = tiles[tileIndex]
        c.globalAlpha = 0.65
        drawCell(c, pictures[tileIndex][0], t, 0, tw, th, panX + hoverCol * cell, panY + hoverRow * cellH, zoom)
        c.globalAlpha = 1
      }
      c.strokeStyle = cssColor('--focus')
      c.lineWidth = 2
      if (boxStart) {
        const left = Math.min(boxStart.col, hoverCol)
        const top = Math.min(boxStart.row, hoverRow)
        c.strokeRect(panX + left * cell + 1, panY + top * cellH + 1, (Math.abs(boxStart.col - hoverCol) + 1) * cell - 2, (Math.abs(boxStart.row - hoverRow) + 1) * cellH - 2)
      } else {
        c.strokeRect(panX + hoverCol * cell + 1, panY + hoverRow * cellH + 1, cell - 2, cellH - 2)
      }
    }
  }

  /** @param {string} s */
  function hash(s) {
    let n = 0
    for (const ch of s) n = Math.imul(n, 31) + ch.charCodeAt(0)
    return n
  }

  /**
   * @param {PointerEvent} e
   * @returns {{ col: number; row: number; x: number; y: number }}
   */
  function pointAt(e) {
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - panX) / zoom
    const y = (e.clientY - rect.top - panY) / zoom
    const tw = tileset?.tileWidth ?? 16
    const th = tileset?.tileHeight ?? 16
    return { col: Math.floor(x / tw), row: Math.floor(y / th), x, y }
  }

  const inside = (/** @type {number} */ col, /** @type {number} */ row) => col >= 0 && row >= 0 && col < map.width && row < map.height

  /**
   * @param {number} col
   * @param {number} row
   * @param {string} ch
   */
  function flood(col, row, ch) {
    const from = cellChar(col, row, layerIndex)
    if (from === ch) return
    const stack = [[col, row]]
    let guard = map.width * map.height * 4
    while (stack.length > 0 && guard-- > 0) {
      const [c, r] = /** @type {number[]} */ (stack.pop())
      if (!inside(c, r) || cellChar(c, r, layerIndex) !== from) continue
      setCell(c, r, ch)
      stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1])
    }
  }

  const brushChar = () => tileset?.tiles[tileIndex]?.key ?? '.'

  /**
   * @param {number} col
   * @param {number} row
   */
  function thingAt(col, row) {
    const tw = tileset?.tileWidth ?? 16
    const th = tileset?.tileHeight ?? 16
    return map.things.findIndex((t) => t.x === col * tw && t.y === row * th)
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true })
    canvas.setPointerCapture(e.pointerId)
    if (tool === 'hand' || spaceHeld || e.button === 1) {
      dragging = { x: e.clientX, y: e.clientY, panX, panY }
      return
    }
    if (!tileset) return
    const { col, row } = pointAt(e)
    if (!inside(col, row)) return
    const erasing = tool === 'erase' || e.button === 2
    if (tool === 'thing') {
      const existing = thingAt(col, row)
      if (erasing || existing >= 0) {
        if (existing >= 0) map.things.splice(existing, 1)
      } else if (thingName !== '') {
        map.things.push({ thing: thingName, x: col * tileset.tileWidth, y: row * tileset.tileHeight })
      } else {
        ctx.toast('Pick a thing on the left first.')
      }
      commit()
      invalidate()
      return
    }
    if (tool === 'pick') {
      pick(col, row)
      return
    }
    if (tool === 'fill') {
      flood(col, row, erasing ? '.' : brushChar())
      commit()
      invalidate()
      return
    }
    if (tool === 'box') {
      boxStart = { col, row }
      painting = true
      invalidate()
      return
    }
    painting = true
    lastCol = col
    lastRow = row
    setCell(col, row, erasing ? '.' : brushChar())
    invalidate()
  })

  /** @param {number} col @param {number} row */
  function pick(col, row) {
    for (let l = map.layers.length - 1; l >= 0; l--) {
      const t = byKey.get(cellChar(col, row, l))
      if (t !== undefined) {
        tileIndex = t
        layerIndex = l
        setTool('paint')
        renderPanels()
        return
      }
    }
  }

  canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
      panX = dragging.panX + e.clientX - dragging.x
      panY = dragging.panY + e.clientY - dragging.y
      invalidate()
      return
    }
    const { col, row } = pointAt(e)
    const within = inside(col, row)
    hoverCol = within ? col : -1
    hoverRow = within ? row : -1
    if (within && tileset) {
      const names = map.layers.map((_, l) => byKey.get(cellChar(col, row, l))).filter((v) => v !== undefined).map((t) => tileset?.tiles[/** @type {number} */ (t)].name)
      cursorInfo.textContent = `Tile ${col}, ${row}. In your game that is x ${col * tileset.tileWidth}, y ${row * tileset.tileHeight}.${names.length ? ` Here: ${names.join(', ')}.` : ''}`
    } else {
      cursorInfo.textContent = ''
    }
    if (painting && !boxStart && within) {
      const ch = tool === 'erase' || (e.buttons & 2) !== 0 ? '.' : brushChar()
      // Fill in the cells between two moves, so quick strokes have no gaps.
      const steps = Math.max(Math.abs(col - lastCol), Math.abs(row - lastRow), 1)
      for (let i = 1; i <= steps; i++) {
        const c = lastCol < 0 ? col : Math.round(lastCol + ((col - lastCol) * i) / steps)
        const r = lastRow < 0 ? row : Math.round(lastRow + ((row - lastRow) * i) / steps)
        setCell(c, r, ch)
      }
    }
    lastCol = within ? col : -1
    lastRow = within ? row : -1
    invalidate()
  })

  const endStroke = (/** @type {PointerEvent} */ e) => {
    if (dragging) {
      dragging = null
      return
    }
    if (boxStart) {
      const { col, row } = pointAt(e)
      const ch = e.button === 2 ? '.' : brushChar()
      const endCol = Math.max(0, Math.min(map.width - 1, col))
      const endRow = Math.max(0, Math.min(map.height - 1, row))
      for (let r = Math.min(boxStart.row, endRow); r <= Math.max(boxStart.row, endRow); r++) {
        for (let c = Math.min(boxStart.col, endCol); c <= Math.max(boxStart.col, endCol); c++) setCell(c, r, ch)
      }
      boxStart = null
    }
    if (painting) {
      painting = false
      lastCol = -1
      lastRow = -1
      commit()
    }
    invalidate()
  }
  canvas.addEventListener('pointerup', endStroke)
  canvas.addEventListener('pointercancel', endStroke)
  canvas.addEventListener('pointerleave', () => {
    hoverCol = -1
    invalidate()
  })
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      setZoom(zoom + (e.deltaY < 0 ? 1 : -1))
      return
    }
    panX -= e.deltaX
    panY -= e.deltaY
    invalidate()
  }, { passive: false })
  root.addEventListener('keydown', (e) => {
    if (/** @type {HTMLElement} */ (e.target).tagName === 'INPUT') return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const key = e.key.toLowerCase()
    if (key === ' ') {
      spaceHeld = true
      e.preventDefault()
      return
    }
    /** @type {Record<string, MapTool>} */
    const shortcuts = { b: 'paint', e: 'erase', g: 'fill', r: 'box', i: 'pick', t: 'thing', h: 'hand' }
    if (shortcuts[key]) {
      setTool(shortcuts[key])
      e.preventDefault()
    }
  })
  root.addEventListener('keyup', (e) => {
    if (e.key === ' ') spaceHeld = false
  })

  // Panels

  function renderLeft() {
    if (tool === 'thing') {
      leftPanel.replaceChildren(group('Things from your game',
        thingNames.length === 0
          ? h('p', { class: 'tool-help', text: 'Your game has no things yet. Add one with a line like: thing coin' })
          : h('div', { class: 'thing-list', role: 'listbox', 'aria-label': 'Things' }, ...thingNames.map((name) => h('button', {
              type: 'button',
              class: 'tile-item',
              role: 'option',
              'aria-selected': String(name === thingName),
              onClick: () => {
                thingName = name
                renderLeft()
              },
            },
            h('span', { class: 'thing-dot', style: { background: THING_COLORS[Math.abs(hash(name)) % THING_COLORS.length] } }),
            h('span', { class: 'tile-item-name', text: name }),
          ))),
        h('p', { class: 'tool-help', text: 'Click the map to place one. Click it again to remove it.' }),
      ))
      return
    }
    if (!tileset) {
      leftPanel.replaceChildren()
      return
    }
    const set = tileset
    leftPanel.replaceChildren(
      group('Tiles',
        h('div', { class: 'tile-list', role: 'listbox', 'aria-label': 'Tiles' }, ...set.tiles.map((t, i) => {
          const thumb = tileThumb(set, t)
          thumb.className = 'tile-thumb'
          return h('button', {
            type: 'button',
            class: 'tile-item',
            role: 'option',
            'aria-selected': String(i === tileIndex),
            title: t.kind === 'terrain' ? `${t.name}: draws its own edges` : t.name,
            onClick: () => {
              tileIndex = i
              if (tool !== 'fill' && tool !== 'box') setTool('paint')
              renderLeft()
            },
          }, thumb, h('span', { class: 'tile-item-name', text: t.name }), t.kind === 'terrain' ? h('span', { class: 'tree-tag', text: 'auto' }) : null)
        })),
      ),
      textButton('Edit these tiles', () => ctx.openFile(tilesetPath), { icon: 'pencil-simple' }),
    )
  }

  function renderRight() {
    const layerRows = [...map.layers.keys()].reverse().map((l) => {
      const layer = map.layers[l]
      return h('div', {
        class: 'layer-row',
        role: 'option',
        'aria-selected': String(l === layerIndex),
        tabIndex: 0,
        onClick: () => {
          layerIndex = l
          renderRight()
          invalidate()
        },
        onKeydown: (/** @type {KeyboardEvent} */ e) => {
          if (e.key === 'Enter') {
            layerIndex = l
            renderRight()
            invalidate()
          }
        },
      },
        iconButton(layer.visible ? 'eye' : 'eye-slash', layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`, () => {
          layer.visible = !layer.visible
          commit()
          renderRight()
          invalidate()
        }),
        h('span', { class: 'layer-name', text: layer.name }),
        layer.front ? h('span', { class: 'tree-tag', text: 'in front' }) : null,
      )
    })
    const layer = map.layers[layerIndex]
    const nameInput = h('input', {
      type: 'text',
      class: 'tool-input',
      id: 'layer-name',
      value: layer.name,
      maxLength: 30,
      onChange: () => {
        layer.name = nameInput.value.trim() || layer.name
        commit()
        renderRight()
      },
    })
    const widthInput = h('input', { type: 'number', class: 'tool-input', id: 'map-width', min: 1, max: MAX_MAP_SIDE, value: map.width, onChange: () => resize(Number(widthInput.value), map.height) })
    const heightInput = h('input', { type: 'number', class: 'tool-input', id: 'map-height', min: 1, max: MAX_MAP_SIDE, value: map.height, onChange: () => resize(map.width, Number(heightInput.value)) })
    rightPanel.replaceChildren(
      group('Layers',
        h('div', { class: 'layer-list', role: 'listbox', 'aria-label': 'Layers, top one first' }, ...layerRows),
        h('div', { class: 'tool-row' },
          textButton('Layer', () => {
            map.layers.push(newLayer(`Layer ${map.layers.length + 1}`, map))
            layerIndex = map.layers.length - 1
            commit()
            renderRight()
            invalidate()
          }, { icon: 'plus' }),
          iconButton('arrow-up', 'Move this layer up', () => moveLayer(1), { disabled: layerIndex === map.layers.length - 1 }),
          iconButton('arrow-down', 'Move this layer down', () => moveLayer(-1), { disabled: layerIndex === 0 }),
          iconButton('trash', 'Delete this layer', () => {
            map.layers.splice(layerIndex, 1)
            layerIndex = Math.max(0, layerIndex - 1)
            commit()
            renderRight()
            invalidate()
          }, { disabled: map.layers.length === 1 }),
        ),
      ),
      group('This layer',
        h('div', { class: 'tool-field' }, h('label', { class: 'tool-label', for: 'layer-name', text: 'Name' }), nameInput),
        toggle({
          label: 'Things bump into it',
          value: layer.solid,
          help: 'Turn off for decoration, like clouds and background hills.',
          onChange: (v) => {
            layer.solid = v
            commit()
            invalidate()
          },
        }),
        toggle({
          label: 'Draw in front of things',
          value: layer.front,
          help: 'For tree tops and tunnels that things walk behind.',
          onChange: (v) => {
            layer.front = v
            commit()
            renderRight()
          },
        }),
        slider({
          label: 'Scrolling speed',
          min: 0,
          max: 1.5,
          step: 0.05,
          value: layer.parallax,
          format: (v) => (v === 1 ? 'With the world' : v === 0 ? 'Stays still' : `${Math.round(v * 100)}%`),
          help: 'Lower numbers look far away.',
          onChange: (v) => {
            layer.parallax = v
            commit()
          },
        }),
      ),
      group('Map size',
        h('div', { class: 'tool-row' },
          h('div', { class: 'tool-field' }, h('label', { class: 'tool-label', for: 'map-width', text: 'Wide' }), widthInput),
          h('div', { class: 'tool-field' }, h('label', { class: 'tool-label', for: 'map-height', text: 'Tall' }), heightInput),
        ),
        h('p', { class: 'tool-help', text: tileset ? `${map.width * tileset.tileWidth} by ${map.height * tileset.tileHeight} pixels in your game.` : '' }),
      ),
    )
  }

  /** @param {number} by */
  function moveLayer(by) {
    const to = layerIndex + by
    if (to < 0 || to >= map.layers.length) return
    const [layer] = map.layers.splice(layerIndex, 1)
    map.layers.splice(to, 0, layer)
    layerIndex = to
    commit()
    renderRight()
    invalidate()
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  function resize(width, height) {
    const w = Math.max(1, Math.min(MAX_MAP_SIDE, Math.round(width) || map.width))
    const hh = Math.max(1, Math.min(MAX_MAP_SIDE, Math.round(height) || map.height))
    for (const layer of map.layers) {
      layer.rows = Array.from({ length: hh }, (_, r) => (layer.rows[r] ?? '').slice(0, w).padEnd(w, '.'))
    }
    map.width = w
    map.height = hh
    commit()
    renderRight()
    invalidate()
  }

  function renderPanels() {
    renderLeft()
    renderRight()
    updateUndo()
  }

  // Loading

  let tilesetPath = ''

  async function loadTileset() {
    const names = await ctx.filesOfKind('tileset')
    const wanted = map.tileset
    const found = names.find((path) => path === wanted || ctx.usableName(path) === wanted || path.endsWith(`/${wanted}`))
    if (!found) {
      tileset = null
      showNoTileset(names)
      return
    }
    tilesetPath = found
    const parsed = parseTileset(await ctx.fs.readText(found))
    if (!parsed) {
      tileset = null
      showNoTileset(names)
      return
    }
    tileset = parsed
    pictures = parsed.tiles.map((t) => t.frames.map((f) => frameCanvas(parsed, t, f)))
    byKey = new Map(parsed.tiles.map((t, i) => [t.key, i]))
    tileIndex = Math.min(tileIndex, Math.max(0, parsed.tiles.length - 1))
    if (!framed) frameMap()
    renderPanels()
    invalidate()
  }

  /** Start with the map as big as fits, and the ground in view. */
  function frameMap() {
    if (!tileset || cssH === 0) return
    framed = true
    const tall = map.height * tileset.tileHeight
    zoom = Math.max(1, Math.min(6, Math.floor((cssH - 24) / tall)))
    panX = 12
    panY = tall * zoom <= cssH - 24 ? Math.round((cssH - tall * zoom) / 2) : cssH - tall * zoom - 12
  }

  /** @param {string[]} names */
  function showNoTileset(names) {
    leftPanel.replaceChildren(h('div', { class: 'tool-empty tool-empty-small' },
      icon('grid-four'),
      h('h3', { text: 'Pick a tile set' }),
      h('p', { class: 'muted small', text: map.tileset ? `I can't find "${map.tileset}".` : 'A tile map needs tiles to paint with.' }),
      ...names.map((path) => textButton(ctx.usableName(path), () => {
        map.tileset = ctx.usableName(path)
        commit()
        void loadTileset()
      })),
    ))
    rightPanel.replaceChildren()
    invalidate()
  }

  const name = assetName(ctx.path.split('/').pop() ?? 'level')
  usage.replaceChildren(usageStrip(ctx, `tilemap ${name} "${ctx.usableName(ctx.path)}"`, [
    'when player touches coin tile',
    'remove the tile',
    `switch to tilemap ${name}`,
  ]))

  void ctx.gameThingNames().then((names) => {
    thingNames = names
    thingName = names[0] ?? ''
    if (tool === 'thing') renderLeft()
  })

  const stopFit = fitCanvas(canvas, (w, hh, r) => {
    cssW = w
    cssH = hh
    ratio = r
    if (!framed) frameMap()
    dirty = true
    draw()
  })
  // Water and coins move in the editor too.
  const timer = prefersReducedMotion() ? 0 : window.setInterval(() => {
    tick++
    if (tileset?.tiles.some((t) => t.frames.length > 1) && document.visibilityState === 'visible') invalidate()
  }, 125)

  canvas.dataset.tool = tool
  void loadTileset()

  return {
    destroy() {
      stopFit()
      clearInterval(timer)
      if (raf) cancelAnimationFrame(raf)
    },
  }
}
