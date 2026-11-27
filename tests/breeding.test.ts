import { describe, it, expect } from 'vitest'
import type { Command, Species } from '../src/game/model'
import { hybridIds } from '../src/game/model'
import { initialState, execute, advance, basketCapacity, speciesIds, recipes, growthMultiplier } from '../src/game'
import { createPersistence } from '../src/persistence/storage'
import { commit, earn, memoryStorage, reject, wait } from './helpers'

describe('Sprint 02 breeding', () => {
  it('BR-04: one harvest advances two distinct recipes, and either recipe can open the nursery', () => {
    const s = initialState()
    earn(s,1100)
    commit(s,{type:'clear',plot:4})
    commit(s,{type:'clear',plot:5})
    commit(s,{type:'plant',plot:8,species:'strawberry'})
    commit(s,{type:'plant',plot:5,species:'blueberry'})
    commit(s,{type:'plant',plot:4,species:'moonflower'})
    wait(s,12)
    commit(s,{type:'harvest',plot:8})
    commit(s,{type:'plant',plot:9,species:'sunflower'})
    for (let i=0;i<2;i++) {
      wait(s,12)
      commit(s,{type:'harvest',plot:8})
    }
    expect(s.recipeProgress).toMatchObject({moonberry:3,solar_strawberry:2})
    expect(s.seeds).toMatchObject({moonberry:1,solar_strawberry:0})
    commit(s,{type:'store',plot:12})
    commit(s,{type:'plant',plot:12,species:'clover'})
  })

  it('grows and harvests all twelve species, opens sixteen beds, and reloads before the last discovery', () => {
    let state = initialState()
    const storage = memoryStorage()
    const discoveries: string[] = []
    const harvested = new Set<Species>()
    let completions = 0

    function play(command: Command) {
      const result = execute(state, command)
      if (result.ok) {
        if (result.events.includes('GardenCompleted')) completions++
        for (const event of result.events) {
          if (event.startsWith('RecipeRevealed:')) discoveries.push(event.split(':')[1])
        }
        if (command.type === 'harvest') harvested.add(state.plots[command.plot].plant!.species)
      }
      return result
    }
    function cycle() {
      for (let tick=0;tick<60;tick++) advance(state,0.1)
      for (const [plot,bed] of state.plots.entries()) {
        if (bed.plant?.readySince == null) continue
        if (state.basket.length === basketCapacity(state)) play({type:'sell'})
        expect(play({type:'harvest',plot}).ok).toBe(true)
      }
      play({type:'sell'})
    }
    function purchase(command: Command) {
      for (let i=0;i<600;i++) {
        const result = play(command)
        if (result.ok) return
        if (!['noCoins','noSeeds','seedLocked','firstSale'].includes(result.reason)) throw Error(result.reason)
        cycle()
      }
      throw Error('Unreachable action ' + JSON.stringify(command))
    }
    function openAndPlant(plot:number, species:Species) {
      if (!state.plots[plot].open) purchase({type:'clear',plot})
      purchase({type:'plant',plot,species})
    }
    openAndPlant(8,'strawberry')
    openAndPlant(9,'sunflower')
    openAndPlant(14,'solar_strawberry')
    openAndPlant(5,'blueberry')
    openAndPlant(4,'moonflower')
    openAndPlant(10,'clover')
    openAndPlant(6,'moonberry')
    openAndPlant(7,'golden_flower')
    cycle()
    expect(state.recipeProgress.crystal_flower).toBe(0)
    purchase({type:'upgrade',plot:6})
    openAndPlant(11,'honey_clover')
    openAndPlant(15,'crystal_flower')
    purchase({type:'upgrade',plot:15})
    for (let i=0;i<6;i++) cycle()
    expect(state.recipeProgress.star_orchid).toBe(0)
    // At level III each individual parent alone still fails the recipe.
    purchase({type:'store',plot:11})
    purchase({type:'upgrade',plot:15})
    reject(state,{type:'upgrade',plot:15},'maxLevel')
    wait(state,40)
    expect(play({type:'harvest',plot:15}).ok).toBe(true)
    expect(state.recipeProgress.star_orchid).toBe(0)
    purchase({type:'return',plot:11,id:state.nursery[0].id})
    purchase({type:'store',plot:14})
    wait(state,40)
    expect(play({type:'harvest',plot:15}).ok).toBe(true)
    expect(state.recipeProgress.star_orchid).toBe(0)
    purchase({type:'return',plot:14,id:state.nursery[0].id})
    expect(growthMultiplier(state,14)).toBeCloseTo(1.6)
    expect(growthMultiplier(state,8)).toBeCloseTo(1.4)
    while (state.recipeProgress.star_orchid < 5 && state.playTime<7200) cycle()
    expect(state.recipeProgress.star_orchid).toBe(5)
    createPersistence(() => storage).save(state)
    const restored = createPersistence(() => storage).load()
    expect(restored).toEqual(state)
    state = restored
    openAndPlant(0,'star_orchid')
    const orchidTime = Math.round(state.playTime)
    for (const plot of [1,2,3]) purchase({type:'clear',plot})
    wait(state,40)
    cycle()
    expect(completions).toBe(1)
    expect(discoveries.sort()).toEqual([...hybridIds].sort())
    expect([...state.planted].sort()).toEqual([...speciesIds].sort())
    expect([...harvested].sort()).toEqual([...speciesIds].sort())
    expect(state.plots.filter(p => p.open)).toHaveLength(16)
    for (const recipe of recipes) expect(state.recipeProgress[recipe.result]).toBe(recipe.harvests)
    expect(state.coins).toBeGreaterThanOrEqual(0)
    expect(state.seeds.star_orchid).toBeGreaterThanOrEqual(0)
    const verifiedTime = Math.round(state.playTime)
    // Existing, legally grown plants. Check that progression and stored seeds survive
    // the exact threshold, including the honey clover's extra unit and any remainder.
    for (const [plot,species,threshold,step] of [
      [14,'solar_strawberry',6,1],[15,'crystal_flower',10,2],[0,'star_orchid',15,1]
    ] as const) {
      const plant = state.plots[plot].plant!
      const before = state.seeds[species]
      const start = plant.propagation
      for (let i=0;i<threshold;i++) {
        wait(state,40)
        play({type:'sell'})
        expect(play({type:'harvest',plot}).ok).toBe(true)
      }
      expect(plant.propagation).toBe(start)
      expect(state.seeds[species]).toBe(before + step)
    }
    // Golden flower and clover both neighbor a blueberry on a level III bed.
    purchase({type:'move',from:7,to:4})
    purchase({type:'move',from:10,to:9})
    purchase({type:'upgrade',plot:5})
    purchase({type:'upgrade',plot:5})
    wait(state,25)
    play({type:'sell'})
    play({type:'harvest',plot:5})
    expect(state.basket[0].valueUnits).toBe(36 * 1.25 * 1.5 * 10000)
    console.info('12/12 planted at %d s; 12/12 harvested and 16 beds verified at %d s', orchidTime,verifiedTime)
  })
})
