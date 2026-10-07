/** @import { Program } from '@minijs/lang' */
import { ManualInput } from '../src/input.js'
import { Simulation } from '../src/simulation.js'

/**
 * @param {Program} p
 * @param {{ random?: () => number }} [options={}]
 */
export function sim(p, options = {}) {
  const input = new ManualInput()
  const s = new Simulation(p, new Map(), { input, random: options.random ?? (() => 0) })
  return { s, input }
}

/**
 * @param {Simulation} s
 * @param {number} n
 */
export function ticks(s, n) {
  for (let i = 0; i < n; i++) s.tick()
}
