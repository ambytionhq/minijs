// Ready-made particle effects and sounds. They are data, so the checker can
// tell people which names exist, the runtime can play them, and Studio can show
// them as buttons. See docs/particles.md and docs/sound.md.

/**
 * What one particle effect does. Ranges are [lowest, highest]; each particle picks its own value.
 * @typedef {object} ParticleSettings
 * @property {number} amount How many appear in one `burst`.
 * @property {number} rate How many appear per second while running with `start`.
 * @property {[number, number]} life Seconds each particle lives.
 * @property {[number, number]} speed Pixels per second.
 * @property {number} direction Degrees: 0 is right, 90 is up, 180 is left, 270 is down.
 * @property {number} spread Degrees of wobble around the direction. 360 goes everywhere.
 * @property {number} gravity Pixels per second, per second. Negative floats up.
 * @property {number} drag 0 keeps speed, 1 loses nearly all of it within a second.
 * @property {[number, number]} size Pixels at birth and at death.
 * @property {string[]} colors From birth to death. One or more.
 * @property {'square' | 'circle' | 'spark'} shape
 * @property {boolean} fade Turn see-through near the end.
 * @property {boolean} glow Bright colors add together, like light.
 * @property {[number, number]} area Width and height of the box particles appear in.
 */

/** @type {Readonly<ParticleSettings>} */
export const DEFAULT_PARTICLES = {
  amount: 16,
  rate: 20,
  life: [0.4, 0.8],
  speed: [30, 80],
  direction: 90,
  spread: 360,
  gravity: 0,
  drag: 0,
  size: [3, 1],
  colors: ['#ffffff'],
  shape: 'square',
  fade: true,
  glow: false,
  area: [0, 0],
}

/**
 * @param {Partial<ParticleSettings>} settings
 * @returns {ParticleSettings}
 */
const fx = (settings) => ({ ...DEFAULT_PARTICLES, ...settings })

/** @type {Readonly<Record<string, ParticleSettings>>} */
export const PARTICLE_PRESETS = {
  sparkle: fx({ amount: 14, rate: 16, life: [0.3, 0.7], speed: [15, 55], size: [3, 0], colors: ['#fff6c2', '#ffd24a'], shape: 'circle', glow: true }),
  explosion: fx({ amount: 42, rate: 60, life: [0.25, 0.7], speed: [40, 170], drag: 0.8, size: [5, 1], colors: ['#fff3b0', '#ff9b2e', '#c8321f', '#3a3230'], shape: 'circle', glow: true }),
  smoke: fx({ amount: 12, rate: 14, life: [0.8, 1.6], speed: [8, 24], direction: 90, spread: 40, gravity: -12, size: [3, 11], colors: ['#8d8f92', '#55575a'], shape: 'circle' }),
  fire: fx({ amount: 20, rate: 45, life: [0.3, 0.7], speed: [18, 48], direction: 90, spread: 30, gravity: -40, size: [5, 1], colors: ['#fff0a8', '#ff9a2e', '#d6371f'], shape: 'circle', glow: true, area: [8, 2] }),
  dust: fx({ amount: 7, rate: 12, life: [0.2, 0.45], speed: [12, 34], direction: 90, spread: 120, gravity: 40, drag: 0.5, size: [2, 1], colors: ['#c9b794', '#8f7f64'] }),
  hit: fx({ amount: 12, rate: 30, life: [0.12, 0.3], speed: [60, 150], drag: 0.6, size: [3, 1], colors: ['#ffffff', '#ff5d4d'], shape: 'spark' }),
  confetti: fx({ amount: 36, rate: 24, life: [0.8, 1.6], speed: [50, 150], direction: 90, spread: 80, gravity: 170, drag: 0.3, size: [3, 3], colors: ['#ff5d6c', '#ffd24a', '#4fd18b', '#4aa8ff'], fade: false }),
  magic: fx({ amount: 22, rate: 24, life: [0.5, 1.1], speed: [8, 42], gravity: -22, size: [3, 0], colors: ['#ffffff', '#9fe6ff', '#6f8cff'], shape: 'circle', glow: true }),
  bubbles: fx({ amount: 10, rate: 7, life: [0.9, 1.8], speed: [8, 22], direction: 90, spread: 30, gravity: -18, size: [2, 5], colors: ['#d8f4ff'], shape: 'circle' }),
  trail: fx({ amount: 4, rate: 40, life: [0.15, 0.4], speed: [0, 8], size: [3, 0], colors: ['#ffffff', '#7fd4ff'], shape: 'circle', glow: true }),
  rain: fx({ amount: 30, rate: 110, life: [0.5, 0.8], speed: [260, 340], direction: 262, spread: 3, size: [1, 1], colors: ['#a9cdf0'], shape: 'spark', fade: false }),
  snow: fx({ amount: 30, rate: 26, life: [5, 9], speed: [12, 28], direction: 270, spread: 24, size: [2, 2], colors: ['#ffffff'], shape: 'circle' }),
}

export const PARTICLE_SHAPES = /** @type {const} */ (['square', 'circle', 'spark'])

/**
 * A sound made from numbers, so it needs no recording. Frequencies are in Hz, times in seconds.
 * @typedef {object} SoundSettings
 * @property {'square' | 'sine' | 'triangle' | 'saw' | 'noise'} wave
 * @property {number} pitch Starting pitch.
 * @property {number} pitchEnd Pitch it slides to.
 * @property {number} attack Seconds to get loud.
 * @property {number} hold Seconds to stay loud.
 * @property {number} fade Seconds to go quiet.
 * @property {number} volume 0 to 100.
 * @property {number} wobble Wobbles per second. 0 is steady.
 * @property {number} wobbleDepth How far it wobbles, 0 to 100.
 * @property {number} steps Jumps the pitch slide into this many notes. 0 slides smoothly.
 * @property {number} muffle 0 is bright, 100 is very muffled.
 * @property {number} crunch 0 is clean, 100 is very crunchy.
 * @property {number} echo 0 is none, 100 is loud repeats.
 */

/** @type {Readonly<SoundSettings>} */
export const DEFAULT_SOUND = {
  wave: 'square',
  pitch: 440,
  pitchEnd: 440,
  attack: 0.004,
  hold: 0.06,
  fade: 0.14,
  volume: 60,
  wobble: 0,
  wobbleDepth: 0,
  steps: 0,
  muffle: 0,
  crunch: 0,
  echo: 0,
}

/**
 * @param {Partial<SoundSettings>} settings
 * @returns {SoundSettings}
 */
const sfx = (settings) => ({ ...DEFAULT_SOUND, ...settings })

/** @type {Readonly<Record<string, SoundSettings>>} */
export const SOUND_PRESETS = {
  coin: sfx({ wave: 'square', pitch: 988, pitchEnd: 1319, hold: 0.07, fade: 0.2, steps: 2, volume: 50 }),
  jump: sfx({ wave: 'square', pitch: 260, pitchEnd: 640, hold: 0.04, fade: 0.12, volume: 45 }),
  land: sfx({ wave: 'noise', pitch: 180, pitchEnd: 80, hold: 0.01, fade: 0.08, muffle: 70, volume: 50 }),
  hit: sfx({ wave: 'noise', pitch: 500, pitchEnd: 120, hold: 0.02, fade: 0.14, crunch: 40, volume: 55 }),
  hurt: sfx({ wave: 'saw', pitch: 420, pitchEnd: 110, hold: 0.03, fade: 0.2, crunch: 30, volume: 50 }),
  explosion: sfx({ wave: 'noise', pitch: 260, pitchEnd: 40, hold: 0.06, fade: 0.65, muffle: 45, crunch: 45, echo: 18, volume: 70 }),
  laser: sfx({ wave: 'saw', pitch: 1400, pitchEnd: 180, hold: 0.02, fade: 0.14, volume: 40 }),
  powerup: sfx({ wave: 'square', pitch: 392, pitchEnd: 1047, hold: 0.22, fade: 0.2, steps: 5, echo: 15, volume: 45 }),
  blip: sfx({ wave: 'square', pitch: 880, pitchEnd: 880, hold: 0.02, fade: 0.03, volume: 35 }),
  click: sfx({ wave: 'triangle', pitch: 1200, pitchEnd: 700, hold: 0.004, fade: 0.03, volume: 50 }),
  win: sfx({ wave: 'triangle', pitch: 523, pitchEnd: 1568, hold: 0.42, fade: 0.32, steps: 6, echo: 28, volume: 55 }),
  lose: sfx({ wave: 'square', pitch: 523, pitchEnd: 131, hold: 0.45, fade: 0.3, steps: 5, muffle: 25, volume: 45 }),
}

export const SOUND_WAVES = /** @type {const} */ (['square', 'sine', 'triangle', 'saw', 'noise'])
