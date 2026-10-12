// Draws every picture for the showcase games into examples/<game>/assets/.
// Characters are hand-drawn as text grids; tiles are drawn by code with a seeded
// random generator, so running this again gives the same pictures.
// Run: node scripts/make-showcase-art.mjs

import { join } from 'node:path'
import { Bitmap, rgba, spriteBitmap, textWidth } from './png.mjs'

const ROOT = join(import.meta.dirname, '../examples')

/** Seeded random numbers, so tiles look hand-made but never change. @param {number} seed */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Check a hand-drawn sprite is a rectangle before drawing it.
 * @param {string} name
 * @param {string[]} rows
 */
function grid(name, rows) {
  const w = rows[0].length
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`${name}: row ${i} is ${r.length} wide, expected ${w}`)
  })
  return rows
}

/**
 * @param {Bitmap} b
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {string} color
 */
function disc(b, cx, cy, r, color) {
  const c = rgba(color)
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) b.set(x, y, c)
    }
  }
}

/**
 * A title card: big outlined name plus a small line under it.
 * @param {string} title
 * @param {string} subtitle
 * @param {{ fill: string; shade: string; outline: string; sub: string; panel?: string }} colors
 */
function titleCard(title, subtitle, colors) {
  const scale = 2
  const width = Math.max(textWidth(title, scale), textWidth(subtitle)) + 12
  const height = 7 * scale + 7 + 14
  // Words on their own layer, so the outline only goes around the letters.
  const words = new Bitmap(width, height)
  const tx = Math.floor((width - textWidth(title, scale)) / 2)
  words.text(title, tx + 1, 3 + 1, colors.shade, scale)
  words.text(title, tx, 3, colors.fill, scale)
  words.outline(colors.outline)
  const sx = Math.floor((width - textWidth(subtitle)) / 2)
  words.text(subtitle, sx, 7 * scale + 10, colors.sub)
  const b = new Bitmap(width, height)
  if (colors.panel) {
    // A dark plate so the title reads over busy backgrounds; corners cut by one pixel.
    const panel = rgba(colors.panel)
    b.fill(1, 0, width - 2, height, panel)
    b.fill(0, 1, 1, height - 2, panel)
    b.fill(width - 1, 1, 1, height - 2, panel)
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = words.get(x, y)
      if (px[3] > 0) b.set(x, y, px)
    }
  }
  return b
}

// ---------------------------------------------------------------------------
// Cloud Hopper

function cloudHopper() {
  const dir = join(ROOT, 'cloud-hopper/assets')
  const hero = {
    k: '#1e1b2e',
    c: '#e04545',
    w: '#ff8a7a',
    s: '#f2c79a',
    e: '#1e1b2e',
    b: '#3b82f6',
    p: '#1e3a8a',
    o: '#5b3a29',
  }
  const top = [
    '...kkkkkk...',
    '..kcccccck..',
    '.kccccccccck',
    '.kccccwwwwwk',
    '.kkkkkkkkkk.',
    '.kssssssk...',
    '.ksssseesk..',
    '.ksssssssk..',
    '..kkssskk...',
    '.kbbbbbbbk..',
    'kbbbbbbbbbk.',
    'kskbbbbbksk.',
    '.kppppppk...',
  ]
  const legs = {
    idle: ['.kppkkppk...', '.kppk.kppk..', '.kook.kook..'],
    walk1: ['.kppkkppk...', 'kppk..kppk..', 'kook...kook.'],
    walk2: ['.kppppppk...', '..kppppk....', '..kooook....'],
    jump: ['.kppkkppk...', '.kooookook..', '............'],
  }
  spriteBitmap(grid('hero-idle', [...top, ...legs.idle]), hero).save(join(dir, 'hero-idle.png'))
  spriteBitmap(grid('hero-walk-1', [...top, ...legs.walk1]), hero).save(join(dir, 'hero-walk-1.png'))
  spriteBitmap(grid('hero-walk-2', [...top, ...legs.walk2]), hero).save(join(dir, 'hero-walk-2.png'))
  const jumpTop = [...top]
  jumpTop[11] = 'ksk.bbbbbksk'.replace('.', 'b')
  spriteBitmap(grid('hero-jump', [...jumpTop, ...legs.jump]), hero).save(join(dir, 'hero-jump.png'))

  // Grass on dirt.
  {
    const r = rng(11)
    const b = new Bitmap(16, 16)
    b.fill(0, 0, 16, 16, rgba('#a0603a'))
    for (let i = 0; i < 14; i++) b.set(Math.floor(r() * 16), 5 + Math.floor(r() * 11), rgba(r() < 0.5 ? '#6e3d2a' : '#c07a4a'))
    b.fill(0, 0, 16, 4, rgba('#5ac54f'))
    for (let x = 0; x < 16; x++) {
      const depth = 4 + Math.floor(r() * 3)
      b.fill(x, 4, 1, depth - 4, rgba('#33984b'))
      if (r() < 0.35) b.set(x, 0, rgba('#8fe36f'))
    }
    b.save(join(dir, 'grass.png'))
  }
  // Plain dirt under the grass.
  {
    const r = rng(12)
    const b = new Bitmap(16, 16)
    b.fill(0, 0, 16, 16, rgba('#a0603a'))
    for (let i = 0; i < 18; i++) b.set(Math.floor(r() * 16), Math.floor(r() * 16), rgba(r() < 0.6 ? '#6e3d2a' : '#c07a4a'))
    b.save(join(dir, 'dirt.png'))
  }
  // A solid cloud block to stand on.
  {
    const b = new Bitmap(16, 16)
    disc(b, 4, 9, 4.5, '#c8e6ff')
    disc(b, 11, 9, 4.5, '#c8e6ff')
    disc(b, 8, 10, 6, '#c8e6ff')
    disc(b, 4, 7, 4, '#ffffff')
    disc(b, 11, 7, 4, '#ffffff')
    disc(b, 8, 6, 5, '#ffffff')
    b.fill(1, 12, 14, 3, rgba('#c8e6ff'))
    b.save(join(dir, 'cloud.png'))
  }
  // Big soft background cloud (not solid).
  {
    const b = new Bitmap(48, 24)
    for (const [x, y, rr] of [
      [12, 15, 8],
      [24, 11, 11],
      [36, 15, 8],
      [20, 17, 7],
      [30, 17, 7],
    ]) disc(b, x, y, rr, '#e6f4ff')
    b.fill(4, 18, 40, 6, rgba('#00000000'))
    b.save(join(dir, 'sky-cloud.png'))
  }
  // Star, two frames.
  const starPal = { y: '#ffd23f', o: '#f5a623', k: '#1e1b2e', w: '#fff7c2' }
  const star = grid('star', [
    '.....kk.....',
    '....kyyk....',
    '....kyyk....',
    'kkkkkywyykkk',
    'kyyyywwyyyyk',
    '.kyyyyyyyyk.',
    '..kyyyyyyk..',
    '..kyyookyk..',
    '.kyyok.koyk.',
    '.kyok...kok.',
    '.kok.....kk.',
    '.kk.........',
  ])
  spriteBitmap(star, starPal).save(join(dir, 'star-1.png'))
  spriteBitmap(
    star.map((row) => row.replaceAll('w', 'y')),
    starPal,
  ).save(join(dir, 'star-2.png'))
  // Spikes: 16 wide, 8 tall, two big points with a light and a dark side.
  {
    const b = new Bitmap(16, 8)
    for (let n = 0; n < 2; n++) {
      for (let y = 1; y < 8; y++) {
        const half = Math.ceil((y * 4) / 7)
        for (let x = 4 - half; x < 4 + half; x++) b.set(n * 8 + x, y, rgba(x < 4 ? '#eef1f6' : '#9aa4b5'))
      }
    }
    b.outline('#1e1b2e')
    b.save(join(dir, 'spikes.png'))
  }
  // Saw blade, two frames rotated by 45 degrees.
  for (const [frame, offset] of [
    [1, 0],
    [2, Math.PI / 8],
  ]) {
    const b = new Bitmap(16, 16)
    for (let i = 0; i < 8; i++) {
      const a = offset + (i * Math.PI) / 4
      disc(b, 8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, 1.6, '#8a94a6')
    }
    disc(b, 8, 8, 6, '#b8c0cc')
    disc(b, 8, 8, 4.5, '#d5d9e0')
    disc(b, 8, 8, 2, '#e04545')
    b.outline('#1e1b2e')
    b.save(join(dir, `saw-${frame}.png`))
  }
  // Goal flag on a pole, 16 by 32, two frames.
  for (const frame of [1, 2]) {
    const b = new Bitmap(16, 32)
    b.fill(2, 2, 2, 30, rgba('#e8e8e8'))
    b.fill(1, 1, 4, 2, rgba('#ffd23f'))
    const wave = frame === 1 ? [0, 1, 1, 0, 0, 1, 1, 0, 0, 1] : [1, 0, 0, 1, 1, 0, 0, 1, 1, 0]
    for (let x = 0; x < 10; x++) b.fill(4 + x, 4 + wave[x], 1, 8, rgba(x % 4 < 2 ? '#e04545' : '#ff6b6b'))
    b.fill(0, 30, 6, 2, rgba('#6b7280'))
    b.outline('#1e1b2e')
    b.save(join(dir, `flag-${frame}.png`))
  }
  titleCard('CLOUD HOPPER', 'PRESS ANY KEY', {
    fill: '#ffd23f',
    shade: '#e04545',
    outline: '#1e1b2e',
    sub: '#1e3a8a',
  }).save(join(dir, 'title.png'))
}

// ---------------------------------------------------------------------------
// Star Defender

function starDefender() {
  const dir = join(ROOT, 'star-defender/assets')
  const pal = {
    k: '#0b1020',
    w: '#e8f1ff',
    g: '#9fb4d8',
    b: '#3b82f6',
    c: '#7dd3fc',
    r: '#e04545',
    y: '#ffd23f',
    o: '#f97316',
  }
  const body = [
    '.......kk.......',
    '......kwwk......',
    '......kwck......',
    '.....kwwcck.....',
    '.....kwbbck.....',
    '....kwwbbcck....',
    '...kwwwbbccck...',
    '..kwwwgggggcck..',
    '.kwwwggrrgggcck.',
    'kwwggggrrggggcck',
    'kwgkkggggggkkgck',
    'kgk..kkkkkk..kgk',
    '.k............k.',
  ]
  spriteBitmap(grid('ship-1', [...body, '......kyyk......', '.......yy.......', '................']), pal).save(
    join(dir, 'ship-1.png'),
  )
  spriteBitmap(grid('ship-2', [...body, '......kyok......', '......yooy......', '.......yy.......']), pal).save(
    join(dir, 'ship-2.png'),
  )
  spriteBitmap(grid('laser', ['.y.', 'yyy', 'ywy', 'ywy', 'ywy', 'ywy', 'yyy', '.y.']), pal).save(join(dir, 'laser.png'))

  // Rocks: lumpy discs with craters.
  for (const [name, size, seed] of [
    ['rock', 16, 21],
    ['pebble', 10, 22],
  ]) {
    const r = rng(seed)
    const b = new Bitmap(size, size)
    const c = size / 2
    for (let i = 0; i < 6; i++) disc(b, c + (r() - 0.5) * size * 0.3, c + (r() - 0.5) * size * 0.3, size * 0.32, '#8b6f5c')
    disc(b, c - size * 0.08, c - size * 0.1, size * 0.28, '#a88a74')
    for (let i = 0; i < size / 4; i++) disc(b, c + (r() - 0.5) * size * 0.6, c + (r() - 0.5) * size * 0.6, 1.2, '#5e4a3d')
    b.outline('#0b1020')
    b.save(join(dir, `${name}.png`))
  }
  const alienPal = { k: '#0b1020', g: '#4ade80', d: '#15803d', w: '#e8f1ff', e: '#0b1020' }
  const alienTop = [
    '....kkkkkkkk....',
    '..kkggggggggkk..',
    '.kggggggggggggk.',
    'kggwwggggggwwggk',
    'kggwekggggkewggk',
    'kggggggggggggggk',
    '.kddgggddgggddk.',
    '..kkdddddddddk..',
  ]
  spriteBitmap(grid('alien-1', [...alienTop, '...k.k....k.k...', '..k...k..k...k..', '..k....kk....k..', '................']), alienPal).save(
    join(dir, 'alien-1.png'),
  )
  spriteBitmap(grid('alien-2', [...alienTop, '....k.k..k.k....', '....k..kk..k....', '...k........k...', '................']), alienPal).save(
    join(dir, 'alien-2.png'),
  )
  spriteBitmap(grid('bomb', ['.kk.', 'krrk', 'krrk', 'kyyk', '.kk.', '.y..']), pal).save(join(dir, 'bomb.png'))
  // Explosion, three frames growing then fading.
  ;[
    [3, 5, '#ffd23f', '#fff7c2'],
    [5, 7, '#f97316', '#ffd23f'],
    [7, 7.5, '#7c2d12', '#f97316'],
  ].forEach(([inner, outer, out, mid], i) => {
    const r = rng(40 + i)
    const b = new Bitmap(16, 16)
    for (let n = 0; n < 7; n++) disc(b, 8 + (r() - 0.5) * 6, 8 + (r() - 0.5) * 6, Number(outer) * 0.6, String(out))
    disc(b, 8, 8, Number(inner), String(mid))
    b.save(join(dir, `boom-${i + 1}.png`))
  })
  spriteBitmap(
    grid('heart', ['.kk..kk.', 'krrkkrrk', 'krwrrrrk', 'krrrrrrk', '.krrrrk.', '..krrk..', '...kk...']),
    pal,
  ).save(join(dir, 'heart.png'))
  titleCard('STAR DEFENDER', 'PRESS ANY KEY', {
    fill: '#7dd3fc',
    shade: '#3b82f6',
    outline: '#0b1020',
    sub: '#e8f1ff',
  }).save(join(dir, 'title.png'))
}

// ---------------------------------------------------------------------------
// Crypt Dash

function cryptDash() {
  const dir = join(ROOT, 'crypt-dash/assets')
  // Stone bricks.
  {
    const r = rng(31)
    const b = new Bitmap(16, 16)
    b.fill(0, 0, 16, 16, rgba('#2a2438'))
    const brick = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w) => {
      const tone = ['#5a5170', '#4e4663', '#655b7e'][Math.floor(r() * 3)]
      b.fill(x, y, w, 7, rgba(tone))
      b.fill(x, y, w, 1, rgba('#7a6f96'))
      b.fill(x, y + 6, w, 1, rgba('#3a3350'))
    }
    brick(0, 0, 7)
    brick(8, 0, 8)
    brick(0, 8, 3)
    brick(4, 8, 8)
    brick(13, 8, 3)
    b.save(join(dir, 'wall.png'))
  }
  // Floor cracks for decoration.
  {
    const b = new Bitmap(16, 16)
    for (const [x, y] of [
      [3, 4],
      [4, 5],
      [5, 5],
      [6, 6],
      [10, 11],
      [11, 11],
      [12, 12],
    ]) b.set(x, y, rgba('#2e2a3c'))
    b.save(join(dir, 'crack.png'))
  }
  const heroPal = { k: '#120f1a', h: '#7c3aed', l: '#a78bfa', s: '#f2c79a', e: '#120f1a', b: '#5b3a29', y: '#ffd23f' }
  const heroTop = [
    '....kkkk....',
    '..kkhhhhkk..',
    '.khhllllhhk.',
    '.khlsssslhk.',
    'khhseesehhk.',
    'khhssssshhk.',
    'khhhkkkhhhk.',
    'khhhhhhhhhk.',
    'kshhhyhhhsk.',
  ]
  spriteBitmap(grid('explorer-1', [...heroTop, '.khhhhhhhk..', '.kbbk.kbbk..', '..kk...kk...']), heroPal).save(
    join(dir, 'explorer-1.png'),
  )
  spriteBitmap(grid('explorer-2', [...heroTop, '.khhhhhhhk..', '..kbbkbbk...', '...kk.kk....']), heroPal).save(
    join(dir, 'explorer-2.png'),
  )
  const gemPal = { k: '#120f1a', c: '#22d3ee', d: '#0e7490', w: '#ecfeff' }
  const gem = grid('gem', [
    '..kkkkkk..',
    '.kcwccdck.',
    'kcwcccddck',
    'kkkkkkkkkk',
    '.kccccddk.',
    '..kcccdk..',
    '...kcdk...',
    '....kk....',
  ])
  spriteBitmap(gem, gemPal).save(join(dir, 'gem-1.png'))
  spriteBitmap(
    gem.map((row) => row.replaceAll('w', 'c')),
    gemPal,
  ).save(join(dir, 'gem-2.png'))
  spriteBitmap(
    grid('key', ['.kkk........', 'kyyyk.......', 'ky.ykkkkkkk.', 'kyyyyyyyyyyk', '.kkkk.kyk.yk', '......k.k.k.']),
    { k: '#120f1a', y: '#ffd23f' },
  ).save(join(dir, 'key.png'))
  // Wooden door with a keyhole.
  {
    const b = new Bitmap(16, 16)
    b.fill(1, 0, 14, 16, rgba('#7c4a2d'))
    for (const x of [4, 8, 12]) b.fill(x, 0, 1, 16, rgba('#5b3420'))
    b.fill(1, 3, 14, 2, rgba('#3f3f46'))
    b.fill(1, 11, 14, 2, rgba('#3f3f46'))
    b.fill(7, 7, 2, 2, rgba('#ffd23f'))
    b.fill(7, 9, 2, 1, rgba('#120f1a'))
    b.outline('#120f1a')
    b.save(join(dir, 'door.png'))
  }
  // Stairs down: the exit.
  {
    const b = new Bitmap(16, 16)
    b.fill(0, 0, 16, 16, rgba('#120f1a'))
    for (let i = 0; i < 5; i++) {
      b.fill(i * 2, i * 3, 16 - i * 2, 3, rgba(['#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#4c1d95'][i]))
    }
    b.save(join(dir, 'stairs.png'))
  }
  const ghostPal = { k: '#120f1a', w: '#e0f2fe', b: '#93c5fd', e: '#120f1a' }
  const ghostTop = [
    '....kkkkkk....',
    '..kkwwwwwwkk..',
    '.kwwwwwwwwwwk.',
    '.kwwekwwekwwk.',
    'kwwwkkwwkkwwwk',
    'kwwwwwwwwwwwwk',
    'kwwwwwbbwwwwwk',
    'kwwwwbbbbwwwwk',
    'kwwwwwwwwwwwbk',
    'kbwwwwwwwwwbbk',
    'kbbwwwwwwwbbbk',
  ]
  spriteBitmap(grid('ghost-1', [...ghostTop, 'kbbkbbkbbkbbk.', '.kk.kk.kk.kk..', '..............']), ghostPal).save(
    join(dir, 'ghost-1.png'),
  )
  spriteBitmap(grid('ghost-2', [...ghostTop, '.kbbkbbkbbkbbk', '..kk.kk.kk.kk.', '..............']), ghostPal).save(
    join(dir, 'ghost-2.png'),
  )
  // Wall torch, two flicker frames.
  for (const frame of [1, 2]) {
    const b = new Bitmap(16, 16)
    b.fill(7, 8, 2, 6, rgba('#7c4a2d'))
    b.fill(6, 7, 4, 2, rgba('#3f3f46'))
    const lean = frame === 1 ? 0 : 1
    disc(b, 8 + lean * 0.5, 5, 2.8, '#f97316')
    disc(b, 8 + lean * 0.8, 4.5, 1.8, '#ffd23f')
    b.set(8 + lean, 1, rgba('#ffd23f'))
    b.save(join(dir, `torch-${frame}.png`))
  }
  titleCard('CRYPT DASH', 'PRESS ANY KEY', {
    fill: '#a78bfa',
    shade: '#4c1d95',
    outline: '#120f1a',
    sub: '#e0f2fe',
    panel: '#120f1ae0',
  }).save(join(dir, 'title.png'))
}

// ---------------------------------------------------------------------------
// Moss Run

function mossRun() {
  const dir = join(ROOT, 'moss-run/assets')
  const ink = '#1c2118'

  // A hooded wanderer in moss green, facing right.
  const hero = {
    k: ink,
    g: '#56763f',
    h: '#3f5a2e',
    l: '#7a9a5a',
    s: '#e6cfa8',
    e: ink,
    c: '#47643a',
    d: '#33492a',
    b: '#6b5636',
    p: '#3b3a34',
    o: '#2a2620',
  }
  const top = [
    '....kkkkk...',
    '...kllgggk..',
    '..klggggghk.',
    '.klgggggghhk',
    '.kggkkkkkghk',
    '.kgkssesskhk',
    '.kgkssssskk.',
    '.khgkkkkkhk.',
    '..kcccccck..',
    '.kccccccdck.',
    'kscbbbbbbcsk',
    '.kccccccddk.',
    '.kddddddddk.',
  ]
  const legs = {
    idle: ['..kpk..kpk..', '..kpk..kpk..', '.kook.kook..'],
    walk1: ['..kpk..kpk..', '.kpk....kpk.', 'kook....kook'],
    walk2: ['...kpkkpk...', '...kpkkpk...', '..kookook...'],
    jump: ['..kpk..kpk..', '.kook..kook.', '............'],
  }
  spriteBitmap(grid('moss-hero-idle', [...top, ...legs.idle]), hero).save(join(dir, 'hero-idle.png'))
  spriteBitmap(grid('moss-hero-walk-1', [...top, ...legs.walk1]), hero).save(join(dir, 'hero-walk-1.png'))
  spriteBitmap(grid('moss-hero-walk-2', [...top, ...legs.walk2]), hero).save(join(dir, 'hero-walk-2.png'))
  spriteBitmap(grid('moss-hero-jump', [...top, ...legs.jump]), hero).save(join(dir, 'hero-jump.png'))

  // Mossy grass over dark forest soil.
  {
    const r = rng(41)
    const b = new Bitmap(16, 16)
    b.fill(0, 0, 16, 16, rgba('#3a3530'))
    for (let i = 0; i < 12; i++) b.fill(Math.floor(r() * 15), 6 + Math.floor(r() * 9), 2, 1, rgba(r() < 0.5 ? '#2c2824' : '#4a443d'))
    b.fill(0, 0, 16, 4, rgba('#6f8f4c'))
    for (let x = 0; x < 16; x++) {
      b.fill(x, 4, 1, 1 + Math.floor(r() * 3), rgba('#4f6e38'))
      if (r() < 0.4) b.set(x, 0, rgba('#8fae62'))
    }
    b.save(join(dir, 'grass.png'))
  }
  {
    const r = rng(42)
    const b = new Bitmap(16, 16)
    b.fill(0, 0, 16, 16, rgba('#3a3530'))
    for (let i = 0; i < 14; i++) b.fill(Math.floor(r() * 15), Math.floor(r() * 16), 2, 1, rgba(r() < 0.6 ? '#2c2824' : '#4a443d'))
    b.save(join(dir, 'soil.png'))
  }
  // Floating platform: old stone with a moss cap, 16 by 10.
  {
    const r = rng(43)
    const b = new Bitmap(16, 10)
    b.fill(0, 3, 16, 7, rgba('#4b4f48'))
    b.fill(0, 9, 16, 1, rgba('#33362f'))
    for (let i = 0; i < 6; i++) b.set(Math.floor(r() * 16), 4 + Math.floor(r() * 5), rgba(r() < 0.5 ? '#5d6259' : '#3d403a'))
    b.set(7, 5, rgba('#33362f')); b.set(7, 6, rgba('#33362f')); b.set(7, 7, rgba('#33362f'))
    b.fill(0, 0, 16, 3, rgba('#6f8f4c'))
    for (let x = 0; x < 16; x++) {
      if (r() < 0.5) b.set(x, 3, rgba('#4f6e38'))
      if (r() < 0.35) b.set(x, 0, rgba('#8fae62'))
    }
    b.save(join(dir, 'ledge.png'))
  }
  // Vines that hang under a ledge (decoration, not solid).
  {
    const r = rng(44)
    const b = new Bitmap(16, 14)
    for (const x of [2, 7, 12]) {
      const length = 5 + Math.floor(r() * 9)
      for (let y = 0; y < length; y++) b.set(x + (y % 4 === 3 ? 1 : 0), y, rgba(y % 3 === 0 ? '#57774a' : '#3e5f35'))
    }
    b.save(join(dir, 'vines.png'))
  }
  // Fallen ruin stones to climb (solid).
  {
    const r = rng(45)
    const b = new Bitmap(16, 16)
    b.fill(0, 0, 16, 16, rgba('#55594f'))
    b.fill(0, 7, 16, 1, rgba('#3d403a'))
    b.fill(8, 0, 1, 7, rgba('#3d403a'))
    b.fill(4, 8, 1, 8, rgba('#3d403a'))
    b.fill(12, 8, 1, 8, rgba('#3d403a'))
    for (let i = 0; i < 8; i++) b.set(Math.floor(r() * 16), Math.floor(r() * 16), rgba('#666b60'))
    b.fill(0, 0, 16, 1, rgba('#6f8f4c'))
    for (let x = 0; x < 16; x++) if (r() < 0.4) b.set(x, 1, rgba('#4f6e38'))
    b.save(join(dir, 'stone.png'))
  }
  // Ferns on the forest floor, 16 by 12.
  {
    const b = new Bitmap(16, 12)
    const leaf = rgba('#4f6e38')
    const light = rgba('#6f8f4c')
    for (const [x0, lean] of [[3, -1], [8, 0], [12, 1]]) {
      for (let y = 0; y < 12; y++) {
        const x = Math.round(x0 + lean * (11 - y) * 0.35)
        b.set(x, y, y < 4 ? light : leaf)
        if (y % 2 === 0 && y > 1 && y < 10) { b.set(x - 1, y + 1, leaf); b.set(x + 1, y + 1, light) }
      }
    }
    b.save(join(dir, 'fern.png'))
  }
  // Coin, two frames: face-on and turning.
  for (const [frame, half] of [[1, 4], [2, 2]]) {
    const b = new Bitmap(10, 10)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const dx = (x + 0.5 - 5) / (half + 0.5)
        const dy = (y + 0.5 - 5) / 4.5
        if (dx * dx + dy * dy <= 1) b.set(x, y, rgba(dx < -0.3 ? '#fff2b0' : dx > 0.4 ? '#b48f2e' : '#e2c25a'))
      }
    }
    b.outline('#3a3022')
    b.save(join(dir, `coin-${frame}.png`))
  }
  // Beetle, two frames of little legs.
  {
    const pal = { k: ink, s: '#463a48', l: '#6a5a6e', e: '#e6cfa8' }
    const body = ['....kkkkk.....', '..kklllsskk...', '.klllssssssk..', 'klssssssssskk.', 'ksssssssssskek', 'kssssssssssskk', '.kkkkkkkkkkkk.']
    spriteBitmap(grid('beetle-1', [...body, '..k..k..k..k..', '.k..k..k..k...', '..............']), pal).save(join(dir, 'beetle-1.png'))
    spriteBitmap(grid('beetle-2', [...body, '..k..k..k..k..', '...k..k..k..k.', '..............']), pal).save(join(dir, 'beetle-2.png'))
  }
  // Goal: a stone lantern whose light flickers.
  for (const [frame, glow] of [[1, '#f0d68a'], [2, '#e2c25a']]) {
    const b = new Bitmap(16, 32)
    b.fill(3, 4, 10, 2, rgba('#6b7066'))
    b.fill(1, 2, 14, 2, rgba('#55594f'))
    b.fill(4, 6, 8, 9, rgba('#55594f'))
    b.fill(6, 8, 4, 5, rgba(glow))
    b.fill(6, 15, 4, 13, rgba('#4b4f48'))
    b.fill(3, 28, 10, 4, rgba('#55594f'))
    b.fill(1, 0, 14, 2, rgba('#6f8f4c'))
    b.outline(ink)
    b.save(join(dir, `lantern-${frame}.png`))
  }

  // Scenery (not solid). Pale and low in contrast so it reads as far away.
  {
    const b = new Bitmap(20, 20)
    disc(b, 10, 10, 9, '#ecebdc')
    b.save(join(dir, 'sun.png'))
  }
  {
    const b = new Bitmap(44, 14)
    for (const [x, y, rr] of [[10, 9, 5], [20, 6, 7], [31, 8, 6], [37, 10, 4]]) disc(b, x, y, rr, '#dfe3db')
    b.fill(4, 11, 38, 3, rgba('#dfe3db'))
    b.save(join(dir, 'cloud.png'))
  }
  // A strip of far pines, tiles left to right.
  {
    const r = rng(46)
    const b = new Bitmap(64, 40)
    for (let n = 0; n < 7; n++) {
      const cx = 4 + n * 9 + Math.floor(r() * 4)
      const h = 18 + Math.floor(r() * 18)
      for (let y = 0; y < h; y++) {
        const half = Math.floor((y / h) * 6) + 1
        b.fill(cx - half, 40 - h + y, half * 2, 1, rgba('#a9b0a4'))
      }
    }
    b.fill(0, 34, 64, 6, rgba('#a9b0a4'))
    b.save(join(dir, 'far-pines.png'))
  }
  // Ruined arches far behind the level: solid stone with two arched openings.
  {
    const b = new Bitmap(96, 56)
    const stone = rgba('#9ba294')
    const cap = rgba('#aab1a4')
    b.fill(2, 10, 54, 46, stone)
    b.fill(54, 22, 36, 34, stone)
    b.fill(38, 2, 10, 8, stone)
    b.fill(2, 10, 54, 2, cap)
    b.fill(54, 22, 36, 2, cap)
    const clear = (x, y) => b.data.fill(0, (y * 96 + x) * 4, (y * 96 + x) * 4 + 4)
    for (const [cx, top, half] of [[22, 22, 11], [72, 32, 9]]) {
      for (let y = top; y < 56; y++) for (let x = cx - half; x < cx + half; x++) {
        const dy = y + 0.5 - (top + half)
        if (dy > 0 || (x + 0.5 - cx) ** 2 + dy * dy <= half * half) clear(x, y)
      }
    }
    // a broken corner and a missing block, so it reads as a ruin
    for (let y = 22; y < 30; y++) for (let x = 84; x < 90; x++) if (x - 84 > y - 22) clear(x, y)
    for (let y = 10; y < 14; y++) for (let x = 2; x < 8; x++) clear(x, y)
    b.save(join(dir, 'ruins.png'))
  }
  // A big forest tree: trunk, roots, and a layered canopy with hanging moss.
  {
    const r = rng(47)
    const b = new Bitmap(56, 104)
    b.fill(24, 44, 9, 60, rgba('#4a3a2c'))
    b.fill(24, 44, 3, 60, rgba('#5b4836'))
    b.fill(31, 44, 2, 60, rgba('#352a20'))
    b.fill(18, 98, 22, 6, rgba('#4a3a2c'))
    b.fill(20, 96, 4, 2, rgba('#4a3a2c'))
    b.fill(33, 96, 5, 2, rgba('#4a3a2c'))
    b.fill(14, 56, 12, 3, rgba('#4a3a2c'))
    b.fill(32, 64, 12, 3, rgba('#4a3a2c'))
    const blobs = [[28, 26, 18], [14, 36, 12], [42, 36, 12], [20, 16, 11], [37, 15, 11], [28, 42, 11], [8, 58, 7], [48, 64, 7]]
    for (const [x, y, rr] of blobs) disc(b, x, y, rr, '#2f4a2a')
    for (const [x, y, rr] of blobs) disc(b, x - 2, y - 2, rr * 0.78, '#3e5f35')
    for (const [x, y, rr] of blobs) disc(b, x - 4, y - 4, rr * 0.45, '#57774a')
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(r() * 56)
      const y = Math.floor(r() * 70)
      if (b.get(x, y)[3] > 0) b.set(x, y, rgba('#6f8f5c')) // light flecks only on leaves
    }
    for (const x of [9, 17, 38, 46]) {
      const length = 6 + Math.floor(r() * 10)
      for (let y = 0; y < length; y++) b.set(x, 44 + y, rgba('#3e5f35'))
    }
    b.save(join(dir, 'tree.png'))
  }

  titleCard('MOSS RUN', 'PRESS ANY KEY', {
    fill: '#e2c25a',
    shade: '#47643a',
    outline: ink,
    sub: '#2f3a2a',
  }).save(join(dir, 'title.png'))
}

cloudHopper()
starDefender()
cryptDash()
mossRun()
console.log('wrote showcase art into examples/cloud-hopper, examples/star-defender, examples/crypt-dash, examples/moss-run')
