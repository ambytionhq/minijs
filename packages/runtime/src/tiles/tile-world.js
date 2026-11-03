// The tilemaps of a running game: what is in each cell right now, collision, and drawing.
// Cells hold an index into the catalog's tile table, or -1 when empty. Setting a tile
// recomputes the autotile masks around it and the collision of that one cell.

/** @import { Catalog, TileEntry } from '../catalog.js' */
/** @import { Renderer } from '../render/renderer.js' */
/** @import { World } from '../world.js' */
import { EPSILON, TICKS_PER_SECOND } from '../config.js'
import { TERRAIN_PIECES, terrainMask } from './format.js'

/**
 * @typedef {object} LiveLayer
 * @property {string} name
 * @property {Int32Array} cells
 * @property {Int32Array} initial
 * @property {Uint8Array} masks
 * @property {boolean} solid
 * @property {boolean} front
 * @property {number} parallax
 * @property {boolean} visible
 */

/**
 * @typedef {object} LiveMap
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} tileW
 * @property {number} tileH
 * @property {number} width
 * @property {number} height
 * @property {boolean} visible
 * @property {boolean} startsVisible
 * @property {LiveLayer[]} layers
 * @property {Uint8Array} collision 0 open, 1 solid, 2 platform.
 * @property {Array<{ thing: string; x: number; y: number }>} things
 * @property {Map<string, number>} idByName Tile names of this map's tileset -> tile table index.
 */

export const OPEN = 0
export const SOLID = 1
export const TOP = 2

export class TileWorld {
  /** @type {LiveMap[]} */
  maps = []
  /** @type {Catalog} */
  catalog
  /** True when any shown map has something solid: lets physics check tiles. */
  active = false
  /** Set by resolveX and resolveY. */
  blocked = false

  /** @param {Catalog} catalog */
  constructor(catalog) {
    this.catalog = catalog
    for (const decl of catalog.program.tilemaps ?? []) {
      const loaded = catalog.data.tilemaps.get(decl.name)
      if (!loaded) continue
      const { map, tileset, baseId } = loaded
      /** @type {Map<string, number>} */
      const byKey = new Map(tileset.tiles.map((t, i) => [t.key, baseId + i]))
      const size = map.width * map.height
      /** @type {LiveMap} */
      const live = {
        name: decl.name,
        x: decl.x,
        y: decl.y,
        tileW: tileset.tileWidth,
        tileH: tileset.tileHeight,
        width: map.width,
        height: map.height,
        visible: !decl.hidden,
        startsVisible: !decl.hidden,
        layers: map.layers.map((layer) => {
          const cells = new Int32Array(size).fill(-1)
          layer.rows.forEach((row, r) => {
            let c = 0
            for (const ch of row) {
              const id = byKey.get(ch)
              if (id !== undefined && c < map.width) cells[r * map.width + c] = id
              c++
            }
          })
          return {
            name: layer.name,
            cells,
            initial: cells.slice(),
            masks: new Uint8Array(size),
            solid: layer.solid,
            front: layer.front,
            parallax: layer.parallax,
            visible: layer.visible,
          }
        }),
        collision: new Uint8Array(size),
        things: map.things,
        idByName: new Map(tileset.tiles.map((t, i) => [t.name, baseId + i])),
      }
      this.maps.push(live)
      this.rebuild(live)
    }
    this.updateActive()
  }

  /** Back to the start of the game. */
  reset() {
    for (const map of this.maps) {
      map.visible = map.startsVisible
      for (const layer of map.layers) layer.cells.set(layer.initial)
      this.rebuild(map)
    }
    this.updateActive()
  }

  /** @param {string} name */
  mapIndex(name) {
    return this.maps.findIndex((m) => m.name === name)
  }

  /**
   * Things placed in shown maps, created once at the start or when a map is switched to.
   * @param {World} world
   * @param {number} index
   * @param {(name: string) => void} onUnknown
   */
  placeThings(world, index, onUnknown) {
    const map = this.maps[index]
    for (const placed of map.things) {
      const t = this.catalog.typeIds.get(placed.thing)
      if (t === undefined) {
        onUnknown(placed.thing)
        continue
      }
      const id = world.spawn(t, map.x + placed.x, map.y + placed.y)
      if (id >= 0) world.placedBy[id] = index + 1
    }
  }

  /**
   * World rectangle of the first shown map, for the camera.
   * @returns {LiveMap | null}
   */
  firstVisible() {
    for (const map of this.maps) if (map.visible) return map
    return null
  }

  /** @param {number} index @param {boolean} visible */
  setVisible(index, visible) {
    this.maps[index].visible = visible
    this.updateActive()
  }

  /** @private */
  updateActive() {
    this.active = this.maps.some((m) => m.visible && m.collision.some((v) => v !== OPEN))
  }

  /**
   * @param {LiveMap} map
   * @private
   */
  rebuild(map) {
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        this.updateCollision(map, col, row)
        for (const layer of map.layers) this.updateMask(map, layer, col, row)
      }
    }
  }

  /**
   * @param {LiveMap} map
   * @param {number} col
   * @param {number} row
   * @private
   */
  updateCollision(map, col, row) {
    const i = row * map.width + col
    let value = OPEN
    for (const layer of map.layers) {
      if (!layer.solid) continue
      const id = layer.cells[i]
      if (id < 0) continue
      const solid = this.catalog.tileTable[id].solid
      if (solid === SOLID) {
        value = SOLID
        break
      }
      if (solid === TOP) value = TOP
    }
    map.collision[i] = value
  }

  /**
   * @param {LiveMap} map
   * @param {LiveLayer} layer
   * @param {number} col
   * @param {number} row
   * @private
   */
  updateMask(map, layer, col, row) {
    const i = row * map.width + col
    const id = layer.cells[i]
    if (id < 0 || this.catalog.tileTable[id].kind !== 'terrain') return
    const { width, height } = map
    layer.masks[i] = terrainMask(
      (c, r) => c < 0 || r < 0 || c >= width || r >= height || layer.cells[r * width + c] === id,
      col,
      row,
    )
  }

  /**
   * Change one cell and keep autotile and collision right around it.
   * @param {number} mapIndex
   * @param {number} layerIndex
   * @param {number} col
   * @param {number} row
   * @param {number} id tile table index, or -1 to empty it
   */
  setCell(mapIndex, layerIndex, col, row, id) {
    const map = this.maps[mapIndex]
    const layer = map.layers[layerIndex]
    layer.cells[row * map.width + col] = id
    this.updateCollision(map, col, row)
    for (let r = Math.max(0, row - 1); r <= Math.min(map.height - 1, row + 1); r++) {
      for (let c = Math.max(0, col - 1); c <= Math.min(map.width - 1, col + 1); c++) this.updateMask(map, layer, c, r)
    }
    if (id >= 0 && this.catalog.tileTable[id].solid !== OPEN) this.active = true
  }

  /**
   * Set or clear the tile at a world position, in the first shown map that covers it.
   * Erasing clears the topmost tile there. Painting replaces the topmost tile, or goes
   * in the first solid layer when the cell is empty.
   * @param {number} x
   * @param {number} y
   * @param {string | null} name tile name, or null to erase
   */
  setAt(x, y, name) {
    for (let m = 0; m < this.maps.length; m++) {
      const map = this.maps[m]
      if (!map.visible) continue
      const col = Math.floor((x - map.x) / map.tileW)
      const row = Math.floor((y - map.y) / map.tileH)
      if (col < 0 || row < 0 || col >= map.width || row >= map.height) continue
      const i = row * map.width + col
      let target = -1
      for (let l = map.layers.length - 1; l >= 0; l--) {
        if (map.layers[l].cells[i] >= 0) {
          target = l
          break
        }
      }
      if (name === null) {
        if (target >= 0) this.setCell(m, target, col, row, -1)
        return
      }
      const id = map.idByName.get(name)
      if (id === undefined) return
      if (target < 0) target = Math.max(0, map.layers.findIndex((l) => l.solid))
      this.setCell(m, target, col, row, id)
      return
    }
  }

  /**
   * Name id of the topmost tile at a world position, or -1.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  nameIdAt(x, y) {
    for (const map of this.maps) {
      if (!map.visible) continue
      const col = Math.floor((x - map.x) / map.tileW)
      const row = Math.floor((y - map.y) / map.tileH)
      if (col < 0 || row < 0 || col >= map.width || row >= map.height) continue
      const i = row * map.width + col
      for (let l = map.layers.length - 1; l >= 0; l--) {
        const id = map.layers[l].cells[i]
        if (id >= 0) return this.catalog.tileTable[id].nameId
      }
    }
    return -1
  }

  /**
   * Push a box moving sideways out of solid tiles. Sets `blocked`. Returns the new x.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} direction
   * @returns {number}
   */
  resolveX(x, y, w, h, direction) {
    this.blocked = false
    let result = x
    for (let m = 0; m < this.maps.length; m++) {
      const map = this.maps[m]
      if (!map.visible) continue
      const left = Math.max(0, Math.floor((x - map.x + EPSILON) / map.tileW))
      const right = Math.min(map.width - 1, Math.ceil((x + w - map.x - EPSILON) / map.tileW) - 1)
      const top = Math.max(0, Math.floor((y - map.y + EPSILON) / map.tileH))
      const bottom = Math.min(map.height - 1, Math.ceil((y + h - map.y - EPSILON) / map.tileH) - 1)
      for (let row = top; row <= bottom; row++) {
        for (let col = left; col <= right; col++) {
          if (map.collision[row * map.width + col] !== SOLID) continue
          this.blocked = true
          const cellX = map.x + col * map.tileW
          result = direction > 0 ? Math.min(result, cellX - w) : Math.max(result, cellX + map.tileW)
        }
      }
    }
    return result
  }

  /**
   * Push a box moving up or down out of solid tiles. Platforms only stop a box falling
   * from above. Sets `blocked`. Returns the new y.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} direction
   * @param {number} startY where the box was before this move
   * @returns {number}
   */
  resolveY(x, y, w, h, direction, startY) {
    this.blocked = false
    let result = y
    for (let m = 0; m < this.maps.length; m++) {
      const map = this.maps[m]
      if (!map.visible) continue
      const left = Math.max(0, Math.floor((x - map.x + EPSILON) / map.tileW))
      const right = Math.min(map.width - 1, Math.ceil((x + w - map.x - EPSILON) / map.tileW) - 1)
      const top = Math.max(0, Math.floor((y - map.y + EPSILON) / map.tileH))
      const bottom = Math.min(map.height - 1, Math.ceil((y + h - map.y - EPSILON) / map.tileH) - 1)
      for (let row = top; row <= bottom; row++) {
        for (let col = left; col <= right; col++) {
          const kind = map.collision[row * map.width + col]
          if (kind === OPEN) continue
          const cellY = map.y + row * map.tileH
          if (kind === TOP && (direction < 0 || startY + h > cellY + EPSILON)) continue
          this.blocked = true
          result = direction > 0 ? Math.min(result, cellY - h) : Math.max(result, cellY + map.tileH)
        }
      }
    }
    return result
  }

  /**
   * Call `visit` for every tile a box touches (edges count, like things touching).
   * Stops early when `visit` returns true.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {(mapIndex: number, layerIndex: number, col: number, row: number, id: number) => boolean | void} visit
   * @returns {boolean} whether `visit` stopped it
   */
  forEachTouching(x, y, w, h, visit) {
    for (let m = 0; m < this.maps.length; m++) {
      const map = this.maps[m]
      if (!map.visible) continue
      const left = Math.max(0, Math.floor((x - map.x - EPSILON) / map.tileW))
      const right = Math.min(map.width - 1, Math.floor((x + w - map.x + EPSILON) / map.tileW))
      const top = Math.max(0, Math.floor((y - map.y - EPSILON) / map.tileH))
      const bottom = Math.min(map.height - 1, Math.floor((y + h - map.y + EPSILON) / map.tileH))
      for (let row = top; row <= bottom; row++) {
        for (let col = left; col <= right; col++) {
          const i = row * map.width + col
          for (let l = 0; l < map.layers.length; l++) {
            const id = map.layers[l].cells[i]
            if (id >= 0 && visit(m, l, col, row, id) === true) return true
          }
        }
      }
    }
    return false
  }

  /**
   * Is the box touching a tile with this name? -1 means any tile.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} nameId
   * @returns {boolean}
   */
  isTouching(x, y, w, h, nameId) {
    const table = this.catalog.tileTable
    return this.forEachTouching(x, y, w, h, (_m, _l, _c, _r, id) => nameId < 0 || table[id].nameId === nameId)
  }

  /**
   * Is the box standing right on top of a tile with this name?
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} nameId
   * @returns {boolean}
   */
  isStandingOn(x, y, w, h, nameId) {
    const table = this.catalog.tileTable
    const feet = y + h
    for (const map of this.maps) {
      if (!map.visible) continue
      const row = Math.floor((feet - map.y + EPSILON) / map.tileH)
      if (row < 0 || row >= map.height) continue
      const left = Math.max(0, Math.floor((x - map.x + EPSILON) / map.tileW))
      const right = Math.min(map.width - 1, Math.floor((x + w - map.x - EPSILON) / map.tileW))
      for (let col = left; col <= right; col++) {
        const i = row * map.width + col
        for (const layer of map.layers) {
          const id = layer.cells[i]
          if (id >= 0 && table[id].nameId === nameId) return true
        }
      }
    }
    return false
  }

  /**
   * Draw the layers behind or in front of things.
   * @param {Renderer} renderer
   * @param {number} camX
   * @param {number} camY
   * @param {number} viewW
   * @param {number} viewH
   * @param {boolean} front
   * @param {number} tick
   */
  draw(renderer, camX, camY, viewW, viewH, front, tick) {
    const table = this.catalog.tileTable
    for (const map of this.maps) {
      if (!map.visible) continue
      const { tileW, tileH, width, height } = map
      const halfW = tileW / 2
      const halfH = tileH / 2
      for (const layer of map.layers) {
        if (layer.front !== front || !layer.visible) continue
        const originX = Math.round(map.x - camX * layer.parallax)
        const originY = Math.round(map.y - camY * layer.parallax)
        const first = Math.max(0, Math.floor(-originX / tileW))
        const last = Math.min(width - 1, Math.floor((viewW - originX) / tileW))
        const top = Math.max(0, Math.floor(-originY / tileH))
        const bottom = Math.min(height - 1, Math.floor((viewH - originY) / tileH))
        for (let row = top; row <= bottom; row++) {
          for (let col = first; col <= last; col++) {
            const i = row * width + col
            const id = layer.cells[i]
            if (id < 0) continue
            const tile = table[id]
            const frames = tile.spots
            const spot = frames.length > 1 ? frames[Math.floor((tick * tile.fps) / TICKS_PER_SECOND) % frames.length] : frames[0]
            const dx = originX + col * tileW
            const dy = originY + row * tileH
            if (tile.kind === 'plain') {
              renderer.sprite(tile.atlas, spot.x, spot.y, tileW, tileH, dx, dy, tileW, tileH)
              continue
            }
            const at = layer.masks[i] * 8
            for (let corner = 0; corner < 4; corner++) {
              const offX = corner % 2 === 1 ? halfW : 0
              const offY = corner >= 2 ? halfH : 0
              renderer.sprite(
                tile.atlas,
                spot.x + TERRAIN_PIECES[at + corner * 2] * tileW + offX,
                spot.y + TERRAIN_PIECES[at + corner * 2 + 1] * tileH + offY,
                halfW,
                halfH,
                dx + offX,
                dy + offY,
                halfW,
                halfH,
              )
            }
          }
        }
      }
    }
  }
}
