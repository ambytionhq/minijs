// The music editor: a grid of notes that loops. Every row is a note that fits the chosen
// scale, so anything you click sounds right together. Tracks are like instruments.

import { noteFrequency, parseSong, renderSong, renderSound, stepSeconds, stringifyAsset } from '@minijs/runtime'
import { audioContext, playSamples } from './preview-audio.js'
import { assetName, choice, createHistory, cssColor, fill, fitCanvas, group, h, iconButton, prefersReducedMotion, slider, textButton, toggle, usageStrip, wireUndoKeys } from './ui.js'
import { starterSong } from './index.js'

/** @import { Song, SongTrack } from '@minijs/runtime/src/audio/synth.js' */
/** @import { Tool, ToolContext } from './index.js' */

const SCALES = /** @type {Record<string, { label: string; steps: number[] }>} */ ({
  'major-pentatonic': { label: 'Happy', steps: [0, 2, 4, 7, 9] },
  'minor-pentatonic': { label: 'Moody', steps: [0, 3, 5, 7, 10] },
  major: { label: 'Bright', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Sad', steps: [0, 2, 3, 5, 7, 8, 10] },
  spooky: { label: 'Spooky', steps: [0, 1, 4, 5, 7, 8, 11] },
  chromatic: { label: 'Every note', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
})

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const DRUMS = ['Kick', 'Snare', 'Hat', 'Clap']
const ROOTS = [60, 62, 64, 65, 67, 69, 71]

/** @param {number} note */
const noteName = (note) => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`

/**
 * The notes a track can use, from high to low.
 * @param {Song} song
 * @param {SongTrack} track
 * @returns {number[]}
 */
export function rowsFor(song, track) {
  if (track.wave === 'drums') return [2, 3, 1, 0]
  const steps = (SCALES[song.scale] ?? SCALES['major-pentatonic']).steps
  const low = track.name === 'Bass' ? song.root - 24 : song.root - 12
  const octaves = track.name === 'Bass' ? 2 : 3
  /** @type {number[]} */
  const out = []
  for (let o = 0; o < octaves; o++) for (const s of steps) out.push(low + o * 12 + s)
  out.push(low + octaves * 12)
  return out.reverse()
}

/**
 * Make up a tune that fits the scale.
 * @param {Song} song
 * @param {() => number} random
 * @returns {Song}
 */
export function composeSong(song, random) {
  const steps = (SCALES[song.scale] ?? SCALES['major-pentatonic']).steps
  const pick = (/** @type {number[]} */ list) => list[Math.floor(random() * list.length)]
  const degree = (/** @type {number} */ d, /** @type {number} */ base) => {
    const n = steps.length
    return base + Math.floor(d / n) * 12 + steps[((d % n) + n) % n]
  }
  /** Chords, as scale positions, one per bar. */
  const chords = [[0, 3, 4, 2], [0, 2, 3, 4], [0, 4, 1, 3], [0, 0, 3, 4]][Math.floor(random() * 4)]
  const bar = 16
  const melodyRhythm = pick([2, 2, 4])
  /** @type {Array<[number, number, number]>} */
  const melody = []
  /** @type {Array<[number, number, number]>} */
  const bass = []
  /** @type {Array<[number, number, number]>} */
  const harmony = []
  /** @type {Array<[number, number, number]>} */
  const drums = []
  let position = steps.length
  for (let s = 0; s < song.steps; s += melodyRhythm) {
    if (random() < 0.28) continue
    const b = Math.floor(s / bar) % chords.length
    position += Math.round((random() - 0.5) * 4)
    position = Math.max(1, Math.min(steps.length * 2 - 1, position))
    // On the first beat of a bar, land on a note of the chord.
    const d = s % bar === 0 ? chords[b] + steps.length : position
    melody.push([s, degree(d, song.root), melodyRhythm])
  }
  for (let s = 0; s < song.steps; s += bar) {
    const b = Math.floor(s / bar) % chords.length
    bass.push([s, degree(chords[b], song.root - 24), 4], [s + 8, degree(chords[b], song.root - 24), 4])
    harmony.push([s, degree(chords[b], song.root), 12], [s, degree(chords[b] + 2, song.root), 12])
    drums.push([s, 0, 1], [s + 8, 0, 1], [s + 4, 1, 1], [s + 12, 1, 1])
    for (let h2 = 0; h2 < bar; h2 += 2) drums.push([s + h2, 2, 1])
  }
  /** @type {Record<string, Array<[number, number, number]>>} */
  const parts = { Melody: melody, Bass: bass, Harmony: harmony, Drums: drums }
  return {
    ...song,
    tracks: song.tracks.map((t) => ({ ...t, notes: (parts[t.name] ?? t.notes).filter(([s]) => s < song.steps) })),
  }
}

/**
 * @param {HTMLElement} host
 * @param {string} text
 * @param {ToolContext} ctx
 * @returns {Tool}
 */
export function openMusicTool(host, text, ctx) {
  /** @type {Song} */
  let song = parseSong(text) ?? /** @type {Song} */ (starterSong())
  if (song.tracks.length === 0) song = /** @type {Song} */ (starterSong())
  let trackIndex = 0
  /** @type {{ stop: () => void; startedAt: number; seconds: number } | null} */
  let playing = null
  let raf = 0
  let cssW = 0
  let cssH = 0
  let ratio = 1
  /** @type {null | { step: number; note: number; erase: boolean; noteRef: [number, number, number] | null }} */
  let stroke = null

  const history = createHistory(stringifyAsset(song), (state) => {
    song = /** @type {Song} */ (parseSong(state))
    ctx.save(state)
    refreshPlayback()
    renderControls()
    draw()
  }, () => updateUndo())

  const commit = () => {
    const state = stringifyAsset(song)
    history.push(state)
    ctx.save(state)
    refreshPlayback()
    updateUndo()
  }

  const track = () => song.tracks[trackIndex]
  const LABEL_W = 44
  const canvas = h('canvas', { class: 'roll-canvas', tabIndex: 0, 'aria-label': 'The notes. Click to add or remove one. Drag sideways to make it longer.' })
  const box = h('div', { class: 'roll-box' }, canvas)

  function geometry() {
    const rows = rowsFor(song, track())
    const cellW = (cssW - LABEL_W) / song.steps
    const cellH = cssH / rows.length
    return { rows, cellW, cellH }
  }

  function draw(playStep = -1) {
    if (cssW === 0) return
    const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
    const { rows, cellW, cellH } = geometry()
    c.setTransform(ratio, 0, 0, ratio, 0, 0)
    c.clearRect(0, 0, cssW, cssH)
    c.font = `500 ${Math.max(9, Math.min(12, cellH - 2))}px var(--mono, monospace)`
    c.textBaseline = 'middle'
    const sunk = cssColor('--surface-sunk')
    const surface = cssColor('--surface')
    const border = cssColor('--border')
    const muted = cssColor('--text-muted')
    const accent = cssColor('--accent')
    const label = cssColor('--accent-label')
    const scaleSteps = (SCALES[song.scale] ?? SCALES['major-pentatonic']).steps
    rows.forEach((note, r) => {
      const y = r * cellH
      const isRoot = track().wave !== 'drums' && (note - song.root + 120) % 12 === scaleSteps[0]
      c.fillStyle = isRoot ? sunk : surface
      c.fillRect(LABEL_W, y, cssW - LABEL_W, cellH)
      c.fillStyle = muted
      c.textAlign = 'right'
      c.fillText(track().wave === 'drums' ? DRUMS[note] : noteName(note), LABEL_W - 6, y + cellH / 2)
    })
    // Beats are four steps; bars are sixteen.
    for (let s = 0; s <= song.steps; s++) {
      c.strokeStyle = s % 16 === 0 ? muted : border
      c.globalAlpha = s % 4 === 0 ? 1 : 0.4
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(Math.round(LABEL_W + s * cellW) + 0.5, 0)
      c.lineTo(Math.round(LABEL_W + s * cellW) + 0.5, cssH)
      c.stroke()
    }
    c.globalAlpha = 0.4
    c.strokeStyle = border
    c.beginPath()
    for (let r = 0; r <= rows.length; r++) {
      c.moveTo(LABEL_W, Math.round(r * cellH) + 0.5)
      c.lineTo(cssW, Math.round(r * cellH) + 0.5)
    }
    c.stroke()
    c.globalAlpha = 1
    // Other tracks show faintly, so parts can follow each other.
    song.tracks.forEach((other, t) => {
      if (t === trackIndex || other.wave === 'drums' || track().wave === 'drums') return
      c.fillStyle = muted
      c.globalAlpha = 0.18
      for (const [step, note, length] of other.notes) {
        const r = rows.indexOf(note)
        if (r >= 0) c.fillRect(LABEL_W + step * cellW, r * cellH, length * cellW, cellH)
      }
      c.globalAlpha = 1
    })
    for (const [step, note, length] of track().notes) {
      const r = rows.indexOf(note)
      if (r < 0 || step >= song.steps) continue
      const x = LABEL_W + step * cellW + 1
      const w = Math.max(3, length * cellW - 2)
      c.fillStyle = accent
      c.fillRect(x, r * cellH + 1, w, Math.max(2, cellH - 2))
      c.fillStyle = label
      c.fillRect(x, r * cellH + 1, 2, Math.max(2, cellH - 2))
    }
    if (playStep >= 0) {
      c.fillStyle = cssColor('--text')
      c.fillRect(LABEL_W + playStep * cellW, 0, 2, cssH)
    }
  }

  /**
   * @param {PointerEvent} e
   * @returns {{ step: number; note: number | undefined }}
   */
  function cellAt(e) {
    const rect = canvas.getBoundingClientRect()
    const { rows, cellW, cellH } = geometry()
    return {
      step: Math.max(0, Math.min(song.steps - 1, Math.floor((e.clientX - rect.left - LABEL_W) / cellW))),
      note: rows[Math.floor((e.clientY - rect.top) / cellH)],
    }
  }

  /** @param {number} note */
  function previewNote(note) {
    try {
      if (track().wave === 'drums') {
        const drumSound = /** @type {const} */ ([
          { wave: 'sine', pitch: 150, pitchEnd: 45, hold: 0.01, fade: 0.2, volume: 90 },
          { wave: 'noise', pitch: 900, pitchEnd: 600, hold: 0.01, fade: 0.14, volume: 60 },
          { wave: 'noise', pitch: 4000, pitchEnd: 4000, hold: 0.002, fade: 0.04, volume: 35 },
          { wave: 'noise', pitch: 1500, pitchEnd: 1500, hold: 0.01, fade: 0.11, volume: 55 },
        ])[note]
        playSamples(renderSound(drumSound))
      } else {
        const f = noteFrequency(note)
        const wave = /** @type {'square'} */ (track().wave)
        playSamples(renderSound({ wave, pitch: f, pitchEnd: f, hold: 0.1, fade: 0.1, volume: track().volume * 0.5 }))
      }
    } catch {
      // No sound in this browser. The grid still works.
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    const { step, note } = cellAt(e)
    if (note === undefined) return
    const notes = track().notes
    const existing = notes.findIndex(([s, n, l]) => n === note && step >= s && step < s + l)
    if (existing >= 0 || e.button === 2) {
      if (existing >= 0) notes.splice(existing, 1)
      stroke = { step, note, erase: true, noteRef: null }
    } else {
      /** @type {[number, number, number]} */
      const fresh = [step, note, track().wave === 'drums' ? 1 : 2]
      notes.push(fresh)
      stroke = { step, note, erase: false, noteRef: fresh }
      previewNote(note)
    }
    draw()
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!stroke) return
    const { step, note } = cellAt(e)
    if (note === undefined) return
    if (stroke.erase) {
      const notes = track().notes
      const hit = notes.findIndex(([s, n, l]) => n === note && step >= s && step < s + l)
      if (hit >= 0) {
        notes.splice(hit, 1)
        draw()
      }
      return
    }
    // Drag sideways to hold the note longer. Drums stay short and paint a beat instead.
    if (track().wave === 'drums') {
      if (!track().notes.some(([s, n]) => s === step && n === note)) {
        track().notes.push([step, note, 1])
        draw()
      }
      return
    }
    if (stroke.noteRef && step >= stroke.noteRef[0]) {
      const length = step - stroke.noteRef[0] + 1
      if (length !== stroke.noteRef[2]) {
        stroke.noteRef[2] = length
        draw()
      }
    }
  })
  const endStroke = () => {
    if (!stroke) return
    stroke = null
    commit()
  }
  canvas.addEventListener('pointerup', endStroke)
  canvas.addEventListener('pointercancel', endStroke)
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  // Playing

  const playButton = textButton('Play', () => (playing ? stopPlaying() : startPlaying()), { icon: 'play', primary: true })

  function startPlaying() {
    stopPlaying()
    try {
      playing = playSamples(renderSong(song), { loop: true })
    } catch {
      ctx.toast('This browser can\'t play sound.')
      return
    }
    playButton.replaceChildren(h('i', { class: 'ph ph-stop', 'aria-hidden': 'true' }), 'Stop')
    raf = requestAnimationFrame(animate)
  }

  function stopPlaying() {
    playing?.stop()
    playing = null
    cancelAnimationFrame(raf)
    playButton.replaceChildren(h('i', { class: 'ph ph-play', 'aria-hidden': 'true' }), 'Play')
    draw()
  }

  /** A change while playing: keep playing the new version. */
  function refreshPlayback() {
    if (!playing) return
    startPlaying()
  }

  function animate() {
    if (!playing) return
    const elapsed = audioContext().currentTime - playing.startedAt
    const step = (elapsed / stepSeconds(song)) % song.steps
    if (prefersReducedMotion()) draw(Math.floor(step))
    else draw(step)
    raf = requestAnimationFrame(animate)
  }

  async function saveWav() {
    const { encodeWav } = await import('@minijs/runtime')
    await ctx.saveFile(new Blob([encodeWav(renderSong(song))], { type: 'audio/wav' }), `${assetName(ctx.path.split('/').pop() ?? 'music')}.wav`)
  }

  const undoButton = iconButton('arrow-u-up-left', 'Undo (Ctrl or Cmd + Z)', () => history.undo())
  const redoButton = iconButton('arrow-u-up-right', 'Redo', () => history.redo())
  function updateUndo() {
    undoButton.disabled = !history.canUndo
    redoButton.disabled = !history.canRedo
  }

  const toolbar = h('div', { class: 'tool-toolbar', role: 'toolbar', 'aria-label': 'Music actions' },
    playButton,
    textButton('Surprise me', () => {
      song = composeSong(song, Math.random)
      commit()
      draw()
      if (!playing) startPlaying()
    }, { icon: 'dice-five', title: 'Make up a new tune in this scale' }),
    textButton('Clear track', () => {
      track().notes = []
      commit()
      draw()
    }, { icon: 'eraser' }),
    h('span', { class: 'tool-toolbar-gap' }),
    iconButton('download-simple', 'Save as a .wav recording', () => void saveWav()),
    undoButton,
    redoButton,
  )

  const tracksRow = h('div', { class: 'track-tabs', role: 'tablist', 'aria-label': 'Tracks' })
  const controls = h('aside', { class: 'tool-column music-controls' })
  const name = assetName(ctx.path.split('/').pop() ?? 'music')
  const usage = usageStrip(ctx, `music ${name} "${ctx.usableName(ctx.path)}"`, [
    `play music ${name}`,
    'stop music',
    'set music volume to 50',
  ])

  const root = h('div', { class: 'tool music-tool', tabindex: -1 },
    h('div', { class: 'tool-body music-body' },
      h('div', { class: 'tool-column music-middle' }, toolbar, tracksRow, box),
      controls,
    ),
    usage,
  )
  host.replaceChildren(root)
  wireUndoKeys(root, history)

  function renderTracks() {
    tracksRow.replaceChildren(...song.tracks.map((t, i) => h('button', {
      type: 'button',
      role: 'tab',
      class: 'track-tab',
      'aria-selected': String(i === trackIndex),
      onClick: () => {
        trackIndex = i
        renderControls()
        draw()
      },
    }, t.name, h('span', { class: 'track-count', text: String(t.notes.length) }))))
  }

  function renderControls() {
    renderTracks()
    const t = track()
    fill(controls,
      group('Whole song',
        slider({ label: 'Speed', min: 50, max: 220, value: song.tempo, format: (v) => `${v} beats a minute`, onInput: (v) => { song.tempo = v }, onChange: () => { commit(); renderControls() } }),
        choice({
          label: 'Length',
          value: song.steps,
          options: [{ value: 16, label: '1 bar' }, { value: 32, label: '2 bars' }, { value: 64, label: '4 bars' }, { value: 128, label: '8 bars' }],
          onChange: (v) => {
            song.steps = v
            for (const tr of song.tracks) tr.notes = tr.notes.filter(([s]) => s < v)
            commit()
            renderTracks()
            draw()
          },
        }),
        choice({
          label: 'Mood',
          value: song.scale,
          options: Object.entries(SCALES).map(([value, s]) => ({ value, label: s.label })),
          onChange: (v) => {
            song.scale = v
            commit()
            draw()
          },
        }),
        choice({
          label: 'Key',
          value: song.root,
          options: ROOTS.map((value) => ({ value, label: NOTE_NAMES[value % 12] })),
          onChange: (v) => {
            song.root = v
            commit()
            draw()
          },
        }),
      ),
      group(t.name,
        t.wave === 'drums' ? null : choice({
          label: 'Sound',
          hideLabel: true,
          value: t.wave,
          options: [
            { value: 'square', icon: 'wave-square', label: 'Square', title: 'Buzzy, like old game consoles' },
            { value: 'triangle', icon: 'wave-triangle', label: 'Soft', title: 'Gentle and round' },
            { value: 'sine', icon: 'wave-sine', label: 'Smooth', title: 'Soft and pure' },
            { value: 'saw', icon: 'wave-sawtooth', label: 'Sharp', title: 'Bright and harsh' },
          ],
          onChange: (v) => {
            t.wave = v
            commit()
          },
        }),
        slider({ label: 'Volume', min: 0, max: 100, value: t.volume, format: (v) => `${v}%`, onInput: (v) => { t.volume = v }, onChange: commit }),
        toggle({ label: 'Mute this track', value: t.muted, onChange: (v) => { t.muted = v; commit() } }),
      ),
      h('p', { class: 'tool-help', text: 'Click a square to add a note. Click it again to remove it. Drag sideways to hold it longer.' }),
    )
  }

  const stopFit = fitCanvas(canvas, (w, hh, r) => {
    cssW = w
    cssH = hh
    ratio = r
    draw()
  })
  renderControls()
  updateUndo()

  return {
    destroy() {
      stopPlaying()
      stopFit()
    },
  }
}
