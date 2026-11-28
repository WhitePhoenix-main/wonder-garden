import { describe, expect, it } from 'vitest'
import { basketCapacity, canReplace, expansionCost, growthMultiplier, saleValue, speciesInfo } from '../src/game'
import { createPersistence } from '../src/persistence/storage'
import { common } from '../src/game/genetics'
import { gardenWithStarterPlants, addLegacyFruit, cross, commit, earn, memoryStorage, plantAt, prepareFirstResearch, reject, wait } from './helpers'

describe('Sprint 01 gameplay', () => {
  it('ST-01, GR-01, GR-03, HA-05: starts with two radishes, each ready for one crop', () => {
    const state = gardenWithStarterPlants(33)
    expect(state.coins).toBe(20)
    expect(state.planted).toEqual(['radish'])
    expect(basketCapacity(state)).toBe(90)
    expect(state.plots.flatMap((p, i) => p.open ? [i] : [])).toEqual([8, 9, 12, 13])
    expect(state.plots.flatMap((p, i) => p.plant ? [i] : [])).toEqual([12, 13])

    wait(state, 5.9)
    reject(state, { type: 'harvest', plot: 12 }, 'notReady')
    wait(state, 0.1)
    expect(plantAt(state, 12).readySince).toBeCloseTo(6)
    expect(plantAt(state, 12).mature).toBe(true)
    wait(state, 60)
    commit(state, { type: 'harvest', plot: 12 })
    expect(state.basket[0]).toMatchObject({species:'radish',valueUnits:40000})
    expect(state.basket[0].count).toBeGreaterThanOrEqual(2)
    expect(state.plots[12].plant?.lives).toBe(0)
    expect(state.coins).toBe(20)
    reject(state, { type: 'harvest', plot: 12 }, 'notReady')
    wait(state, 6)
    commit(state, { type: 'harvest', plot: 13 })
    const revenue=saleValue(state)
    commit(state, { type: 'sell' })
    expect(state.coins).toBe(20+revenue)
    expect(state.sold).toBe(true)
    expect(commit(state, { type: 'sell' })).toEqual([])
    expect(state.coins).toBe(20+revenue)
  })

  it('HA-02: refuses a harvest at capacity without altering the ready plant or basket', () => {
    const state = gardenWithStarterPlants(33)
    addLegacyFruit(state,basketCapacity(state))
    wait(state,6)
    reject(state, { type: 'harvest', plot: 13 }, 'basketFull')
    commit(state, { type: 'sell' })
    expect(state.coins).toBe(20+basketCapacity(state)*3)
    commit(state, { type: 'harvest', plot: 13 })
    expect(state.basket).not.toHaveLength(0)
  })

  it('EX-01, EX-02, MV-02: requires first sale, adjacency, funds and replacement permission', () => {
    const state = gardenWithStarterPlants(33)
    reject(state, { type: 'clear', plot: 10 }, 'firstSale')
    reject(state, { type: 'upgrade', plot: 8 }, 'firstSale')
    reject(state, { type: 'plant', plot: 8, species: 'sunflower' }, 'seedLocked')
    reject(state, { type: 'plant', plot: 12, species: 'radish', replaceId: plantAt(state, 12).id }, 'replacementLocked')
    earn(state, 25)
    reject(state, { type: 'clear', plot: 6 }, 'notAdjacent')
    reject(state, { type: 'clear', plot: 10 }, 'noCoins')
    earn(state, 60)
    const coins = state.coins
    commit(state, { type: 'clear', plot: 10 })
    expect(state.coins).toBe(coins - 60)
    expect(state.plots[10]).toEqual({ open: true, level: 1, plant: null })
    reject(state, { type: 'clear', plot: 10 }, 'plotOpen')
  })

  it('GR-02, AU-01, BR-02, BR-03: only orthogonal auras apply and repeats do not stack', () => {
    const state = gardenWithStarterPlants(33)
    earn(state, 300)
    commit(state, { type: 'plant', plot: 8, species: 'strawberry' })
    commit(state, { type: 'move', from: 13, to: 9 })
    commit(state, { type: 'plant', plot: 13, species: 'sunflower' })
    expect(growthMultiplier(state, 8)).toBe(1)
    wait(state, 12)
    commit(state, { type: 'harvest', plot: 8 })
    expect(state.revealed.includes('solar_strawberry')).toBe(false)
    wait(state, speciesInfo.strawberry.regrowSec * 0.4)
    const progress = plantAt(state, 8).progress
    expect(progress).toBeCloseTo(0.4)
    commit(state, { type: 'move', from: 13, to: 9 })
    expect(plantAt(state, 8).progress).toBe(progress)
    expect(growthMultiplier(state, 8)).toBeCloseTo(1.4)
    wait(state, 0.6)
    expect(plantAt(state, 8).progress).toBeCloseTo(progress + 0.6*1.4/speciesInfo.strawberry.regrowSec)
    commit(state, { type: 'clear', plot: 10 })
    commit(state, { type: 'move', from: 12, to: 10 })
    commit(state, { type: 'plant', plot: 12, species: 'sunflower' })
    expect(growthMultiplier(state, 8)).toBeCloseTo(1.4)
    wait(state, 12)
    commit(state, { type: 'harvest', plot: 8 })
    expect(state.revealed.includes('solar_strawberry')).toBe(false)
  })

  it('BR-01, BR-08, PR-01, UP-01, MV-01, NU-01: plays from a new garden through a planted hybrid, II, swap and nursery', () => {
    const state = gardenWithStarterPlants(33)
    earn(state, 60)
    commit(state, { type: 'plant', plot: 8, species: 'strawberry' })
    earn(state, 90)
    commit(state, { type: 'plant', plot: 9, species: 'sunflower' })
    earn(state,240)
    prepareFirstResearch(state)
    wait(state,12);cross(state,8,'solar_strawberry')
    expect(state.seeds.solar_strawberry).toBe(1)
    expect(state.planted).toHaveLength(4)

    earn(state, 120)
    commit(state, { type: 'clear', plot: 10 })
    commit(state, { type: 'plant', plot: 10, species: 'solar_strawberry' })
    expect(state.planted).toHaveLength(5)
    expect(state.seeds.solar_strawberry).toBe(0)
    wait(state, 12)
    expect(commit(state, { type: 'harvest', plot: 8 })).toContain('Harvested')
    expect(state.seeds.solar_strawberry).toBe(0)

    earn(state, 250)
    if (plantAt(state, 8).readySince !== null) commit(state, { type: 'harvest', plot: 8 })
    wait(state, 1)
    const strawberry = structuredClone(plantAt(state, 8))
    const hybrid = structuredClone(plantAt(state, 10))
    expect(strawberry.progress).toBeGreaterThan(0)
    expect(strawberry.progress).toBeLessThan(1)
    expect(hybrid.mature).toBe(true)
    const coins = state.coins
    commit(state, { type: 'upgrade', plot: 8 })
    expect(plantAt(state, 8)).toEqual(strawberry)
    expect(growthMultiplier(state, 8)).toBeCloseTo(1.2 * 1.4)
    commit(state, { type: 'move', from: 8, to: 10 })
    expect(state.plots[8]).toEqual({ open: true, level: 2, plant: hybrid })
    expect(state.plots[10]).toEqual({ open: true, level: 1, plant: strawberry })
    expect(state.coins).toBe(coins - 250)
    reject(state, { type: 'upgrade', plot: 8 }, 'noCoins')

    wait(state, 12)
    const ready = structuredClone(plantAt(state, 8))
    expect(ready.progress).toBe(1)
    expect(ready.readySince).not.toBeNull()
    commit(state, { type: 'store', plot: 8, expectedId:state.plots[8].plant!.id })
    wait(state, 20)
    expect(state.nursery).toEqual([ready])
    commit(state, { type: 'return', id: ready.id, plot: 8 })
    expect(plantAt(state, 8)).toEqual({ ...ready, readySince: state.playTime })
    expect(state.coins).toBe(coins - 250)
    expect(state.nursery).toEqual([])
  })

  it('SL-01, EX-03, BR-05: restores progression after filling the island with radishes and reloading', () => {
    let state = gardenWithStarterPlants(33)
    const radishPrice=speciesInfo.radish.seedPrice!
    const strawberryPrice=speciesInfo.strawberry.seedPrice!
    for (const plot of [8, 9]) commit(state, { type: 'plant', plot, species: 'radish' })
    let totalClearCost = 0
    for (const plot of [4, 5, 0, 1, 2, 3, 6, 7, 10, 11, 14, 15]) {
      const cost = expansionCost(state)
      if (cost === null) throw new Error('Expected a locked plot')
      earn(state, cost + radishPrice)
      const coins = state.coins
      commit(state, { type: 'clear', plot })
      commit(state, { type: 'plant', plot, species: 'radish' })
      expect(state.coins).toBe(coins - cost - radishPrice)
      totalClearCost += cost
    }
    expect(totalClearCost).toBe(6090)
    expect(expansionCost(state)).toBeNull()
    expect(state.plots.every(p => p.open && p.plant?.species === 'radish')).toBe(true)
    expect(state.planted).toEqual(['radish'])
    expect(state.revealed.includes('solar_strawberry')).toBe(false)
    expect(canReplace(state)).toBe(true)
    const storage = memoryStorage()
    createPersistence(() => storage).save(state)
    const fullIsland = state
    state = createPersistence(() => storage).load()
    expect(state).toEqual(fullIsland)
    reject(state, { type: 'clear', plot: 15 }, 'plotOpen')
    reject(state, { type: 'store', plot: 8, expectedId:state.plots[8].plant!.id }, 'nurseryLocked')
    const replacement = { type: 'plant', plot: 8, species: 'strawberry' } as const
    reject(state, replacement, 'occupied')
    reject(state, { ...replacement, replaceId: plantAt(state, 9).id }, 'stalePlant')
    const cash=state.coins
    state.coins=strawberryPrice-1
    reject(state, { ...replacement, replaceId: plantAt(state, 8).id }, 'noCoins')
    state.coins=cash

    earn(state, 220)
    const oldFirst = structuredClone(plantAt(state, 8))
    const oldSecond = structuredClone(plantAt(state, 9))
    const coins = state.coins
    expect(commit(state, { ...replacement, replaceId: oldFirst.id })).toEqual(['PlantStored', 'Planted'])
    expect(state.coins).toBe(coins - strawberryPrice)
    reject(state, { ...replacement, replaceId: oldFirst.id }, 'stalePlant')
    commit(state, { type: 'plant', plot: 9, species: 'sunflower', replaceId: oldSecond.id })
    expect(state.coins).toBe(coins - strawberryPrice - speciesInfo.sunflower.seedPrice!)
    expect(state.nursery).toEqual([oldFirst, oldSecond])

    const oldThird=structuredClone(plantAt(state,5))
    commit(state,{type:'plant',plot:5,species:'blueberry',replaceId:oldThird.id})
    for (let count = 0; count < 2; count++) {
      wait(state, 12)
      commit(state, { type: 'harvest', plot: 8 })
    }
    commit(state, { type: 'move', from: 9, to: 13 })
    createPersistence(() => storage).save(state)
    const saved = structuredClone(state)
    state = createPersistence(() => storage).load()
    expect(state).toEqual(saved)
    expect(state.revealed.includes('solar_strawberry')).toBe(false)
    wait(state, 12)
    commit(state, { type: 'harvest', plot: 8 })
    expect(state.revealed.includes('solar_strawberry')).toBe(false)
    commit(state, { type: 'move', from: 13, to: 9 })
    wait(state, 12)
    expect(cross(state,8,'solar_strawberry')).toContain('RecipeRevealed:solar_strawberry')
    expect(state.seeds.solar_strawberry).toBeGreaterThanOrEqual(1)
    expect(state.nursery).toEqual([oldFirst, oldSecond,oldThird])
    createPersistence(() => storage).save(state)
    state = createPersistence(() => storage).load()
    expect(state.revealed.includes('solar_strawberry')).toBe(true)
    const seedCount = state.seeds.solar_strawberry
    expect(seedCount).toBeGreaterThanOrEqual(1)
    const beforeHybrid = state.coins
    commit(state, { type: 'plant', plot: 12, species: 'solar_strawberry', replaceId: plantAt(state, 12).id })
    expect(state.seeds.solar_strawberry).toBe(seedCount-1)
    expect(state.coins).toBe(beforeHybrid)
    expect(state.planted).toHaveLength(5)
    expect(state.plots.every(p => p.open && p.plant)).toBe(true)
    while (state.seeds.solar_strawberry) {
      commit(state, {type:'sellSeeds',species:'solar_strawberry',profile:common,count:state.seeds.solar_strawberry})
    }
    reject(state, { type: 'plant', plot: 14, species: 'solar_strawberry', replaceId: plantAt(state, 14).id }, 'noSeeds')
  })
})
