import { expect } from 'vitest'
import type { Command, GameState, Plant } from '../src/game/model'
import { advance, basketCapacity, execute, saleValue } from '../src/game'

export function commit(state: GameState, command: Command): string[] {
  const result = execute(state, command)
  if (!result.ok) throw new Error(`${JSON.stringify(command)} failed: ${result.reason}`)
  return result.events
}

export function reject(state: GameState, command: Command, reason: string): void {
  const before = structuredClone(state)
  expect(execute(state, command)).toEqual({ ok: false, reason })
  expect(state).toEqual(before)
}

export function wait(state: GameState, seconds: number): void {
  for (let step = 0; step < Math.round(seconds * 10); step++) advance(state, 0.1)
}

export function plantAt(state: GameState, plot: number): Plant {
  const plant = state.plots[plot].plant
  if (!plant) throw new Error(`Expected a plant at plot ${plot}`)
  return plant
}

export function earn(state: GameState, target: number): void {
  // Harvest and sell through the public commands, stopping as soon as the target is funded.
  for (let cycle = 0; cycle < 300 && state.coins < target; cycle++) {
    state.plots.forEach(({ plant }, plot) => {
      if (plant && plant.readySince !== null && state.basket.length < basketCapacity(state)
          && state.coins + saleValue(state) < target) {
        commit(state, { type: 'harvest', plot })
      }
    })
    commit(state, { type: 'sell' })
    if (state.coins < target) wait(state, 6)
  }
  expect(state.coins).toBeGreaterThanOrEqual(target)
}

export function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() { return entries.size },
    clear: () => entries.clear(),
    getItem: key => entries.get(key) ?? null,
    key: index => [...entries.keys()][index] ?? null,
    removeItem: key => { entries.delete(key) },
    setItem: (key, value) => { entries.set(key, value) }
  }
}
