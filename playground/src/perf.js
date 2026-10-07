// Small fps and ticks-per-second readout. Pauses while the page is hidden.

/**
 * @param {HTMLElement} el
 * @param {() => number | null} readTicks current simulation tick count, or null when no game runs
 */
export function startPerf(el, readTicks) {
  /** @type {number[]} */
  const frames = []
  let raf = 0
  let lastSecond = performance.now()
  let lastTicks = readTicks()
  let ticksPerSecond = 0

  /** @param {number} now */
  const frame = (now) => {
    frames.push(now)
    if (frames.length > 60) frames.shift()
    if (now - lastSecond >= 1000) {
      const ticks = readTicks()
      ticksPerSecond =
        ticks !== null && lastTicks !== null && ticks >= lastTicks
          ? Math.round(((ticks - lastTicks) * 1000) / (now - lastSecond))
          : 0
      lastTicks = ticks
      lastSecond = now
      const span = frames.length > 1 ? frames[frames.length - 1] - frames[0] : 0
      const fps = span > 0 ? Math.round(((frames.length - 1) * 1000) / span) : 0
      el.textContent = `${fps} fps  ${ticksPerSecond} ticks/s`
    }
    raf = requestAnimationFrame(frame)
  }

  const onVisibility = () => {
    cancelAnimationFrame(raf)
    if (document.visibilityState === 'visible') {
      frames.length = 0
      lastSecond = performance.now()
      lastTicks = readTicks()
      raf = requestAnimationFrame(frame)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  raf = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(raf)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
