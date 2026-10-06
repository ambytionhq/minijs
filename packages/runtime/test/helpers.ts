import type { Program } from '@minijs/lang'
import { ManualInput } from '../src/input.ts'
import { Simulation } from '../src/simulation.ts'

export function sim(p: Program, options: { random?: () => number } = {}) {
  const input = new ManualInput()
  const s = new Simulation(p, new Map(), { input, random: options.random ?? (() => 0) })
  return { s, input }
}

export function ticks(s: Simulation, n: number): void {
  for (let i = 0; i < n; i++) s.tick()
}
