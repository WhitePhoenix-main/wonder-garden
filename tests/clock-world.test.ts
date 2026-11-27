import { describe, expect, it } from 'vitest'
import { createClock } from '../src/runtime/clock'
import { adjacent, advance, initialState } from '../src/game'
import { halfHeight, halfWidth, iso, plotAt, plotPosition } from '../src/world/geometry'
import { plantAt } from './helpers'

describe('Sprint 01 clock and isometric geometry', () => {
  it('TM-01: clears the remainder before visibility resumes and skips the elapsed wall time', () => {
    const state = initialState()
    const clock = createClock(step => advance(state, step))
    expect(clock.frame(1000)).toBe(false)
    expect(clock.frame(1150)).toBe(true)
    expect(state.playTime).toBeCloseTo(0.1)
    clock.reset()
    expect(clock.frame(61_150)).toBe(false)
    expect(clock.frame(61_200)).toBe(false)
    expect(state.playTime).toBeCloseTo(0.1)
    expect(clock.frame(61_250)).toBe(true)
    expect(state.playTime).toBeCloseTo(0.2)
    expect(plantAt(state, 12).progress).toBeCloseTo(0.2 / 6)
    expect(state.coins).toBe(20)
    expect(state.basket).toEqual([])
  })

  it('TM-02: completes the same active growth at 30 and 60 fps and caps long frames', () => {
    for (const fps of [30, 60]) {
      const state = initialState()
      const clock = createClock(step => advance(state, step))
      for (let i = 0; i <= 6 * fps; i++) clock.frame(i * 1000 / fps)
      expect(state.playTime).toBeCloseTo(6)
      expect(plantAt(state, 12).readySince).toBeCloseTo(6)
    }
    const steps: number[] = []
    const clock = createClock(step => { steps.push(step) })
    clock.frame(0)
    clock.frame(10_000)
    expect(steps).toEqual([0.1, 0.1])
    clock.frame(10_050)
    expect(steps).toEqual([0.1, 0.1, 0.1])
  })

  it('maps all 16 isometric tile centers and excludes a point outside a corner diamond', () => {
    expect(iso(1, 0)).toEqual({ x: 64, y: 32 })
    expect(iso(0, 1)).toEqual({ x: -64, y: 32 })
    expect(halfWidth / halfHeight).toBe(2)
    for (let plot = 0; plot < 16; plot++) {
      const point = plotPosition(plot)
      expect(plotAt(point)).toBe(plot)
      expect(plotAt({ x: point.x + 16, y: point.y + 12 })).toBe(plot)
    }
    const corner = plotPosition(0)
    expect(plotAt({ x: corner.x - 40, y: corner.y - 20 })).toBeNull()
    expect(adjacent(8).includes(9)).toBe(true)
    expect(adjacent(8).includes(13)).toBe(false)
    expect(adjacent(7).includes(8)).toBe(false)
  })
})
