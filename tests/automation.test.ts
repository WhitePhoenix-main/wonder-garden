import { describe, expect, it } from 'vitest'
import type { Command, GameState, Species } from '../src/game/model'
import { advance, basketCapacity, execute, initialState, oldestReadyPlot } from '../src/game'
import { createPersistence } from '../src/persistence/storage'
import { validState } from '../src/persistence/validation'
import { commit, earn, memoryStorage, reject, wait } from './helpers'

function freshCrop(state: GameState) {
  wait(state, 6)
  for (const [plot, bed] of state.plots.entries()) {
    if (bed.plant?.readySince != null) commit(state, {type:'harvest', plot})
  }
  commit(state, {type:'sell'})
}

describe('Leafy and the market stall', () => {
  it('AT-01: charges once per level, starts a new interval and collects 12/30/60 fruits per active minute', () => {
    const s = initialState()
    reject(s,{type:'upgradeHelper',target:1},'firstSale')
    reject(s,{type:'buyAutoSell'},'hireFirst')
    earn(s,25)
    reject(s,{type:'upgradeHelper',target:1},'noCoins')
    for (const plot of [8,9,4,5,0,1]) {
      if (!s.plots[plot].open) {
        earn(s,250)
        commit(s,{type:'clear',plot})
      }
      earn(s,10)
      commit(s,{type:'plant',plot,species:'radish'})
    }
    earn(s,2100)
    freshCrop(s)
    wait(s,6)
    const start = s.coins
    commit(s,{type:'upgradeHelper',target:1})
    reject(s,{type:'upgradeHelper',target:1},'helperLevel')
    reject(s,{type:'upgradeHelper',target:3},'helperLevel')
    commit(s,{type:'buyAutoSell'})
    reject(s,{type:'buyAutoSell'},'alreadyAutomated')
    expect(s.coins).toBe(start-150-300)
    for (const [level,interval,price] of [[1,5,150],[2,2,450],[3,1,1200]] as const) {
      if (level !== 1) {
        advance(s,0.4)
        const coins = s.coins
        commit(s,{type:'upgradeHelper',target:level})
        expect(s.coins).toBe(coins-price)
      }
      expect(s.harvestRemaining).toBe(interval)
      expect(advance(s,interval-0.1)).not.toContain('Harvested')
      const events = [...advance(s,0.1), ...advance(s,60-interval)]
      expect(events.filter(e=>e==='Harvested')).toHaveLength(60/interval)
    }
    reject(s,{type:'upgradeHelper',target:3},'helperLevel')
  })

  it('AT-02/03: takes oldest fruit, breaks ties by plot, discards idle and full-basket turns', () => {
    const s = initialState()
    earn(s,150)
    freshCrop(s)
    commit(s,{type:'upgradeHelper',target:1})
    expect(advance(s,5)).toEqual([])
    advance(s,1)
    expect(oldestReadyPlot(s)).toBe(12)
    expect(s.basket).toHaveLength(0)
    expect(advance(s,4)).toContain('HelperHarvested:12')
    expect(advance(s,5)).toContain('HelperHarvested:13')
    // Swap the older plant onto the higher index.
    commit(s,{type:'move',from:12,to:13})
    expect(advance(s,5)).toContain('HelperHarvested:13')
    advance(s,100)
    expect(s.basket).toHaveLength(basketCapacity(s))
    expect(s.plots[12].plant!.progress).toBe(1)
    const plants = structuredClone(s.plots)
    expect(advance(s,12)).toEqual([])
    expect(s.plots).toEqual(plants)
    commit(s,{type:'sell'})
    expect(advance(s,2.9)).toEqual([])
    expect(advance(s,0.1)).toContain('Harvested')
    expect(s.basket).toHaveLength(1)
  })

  it('HA-01/AT-05: manual and automatic final harvest advance two recipes once, in either input order', () => {
    const s = initialState()
    earn(s,1200)
    for (const plot of [4,5]) commit(s,{type:'clear',plot})
    for (const [plot,species] of [[8,'strawberry'],[9,'sunflower'],[5,'blueberry'],[4,'moonflower']] as const) {
      commit(s,{type:'plant',plot,species})
    }
    for (let i=0;i<2;i++) {
      wait(s,12)
      commit(s,{type:'harvest',plot:8})
    }
    wait(s,12)
    // Leave just the ripe strawberry in the queue.
    for (const [plot,p] of s.plots.entries()) {
      if (plot!==8 && p.plant?.readySince!=null) commit(s,{type:'harvest',plot})
    }
    commit(s,{type:'sell'})
    commit(s,{type:'upgradeHelper',target:1})
    advance(s,4.9)
    for (const [plot,p] of s.plots.entries()) {
      if (plot!==8 && p.plant?.readySince!=null) commit(s,{type:'harvest',plot})
    }
    commit(s,{type:'sell'})
    const before = structuredClone(s)
    const manualEvents = commit(before,{type:'harvest',plot:8})
    expect(advance(before,0.1)).toEqual([])
    const autoEvents = advance(s,0.1)
    expect(autoEvents).toEqual([...manualEvents,'HelperHarvested:8'])
    reject(s,{type:'harvest',plot:8},'notReady')
    expect(s.basket).toEqual(before.basket)
    expect(s.basket).toHaveLength(1)
    expect(s.recipeProgress).toEqual(before.recipeProgress)
    expect(s.seeds).toEqual(before.seeds)
    expect(s.seeds).toMatchObject({solar_strawberry:1,moonberry:1})
    expect(s.recipeProgress).toMatchObject({solar_strawberry:3,moonberry:3})
  })

  it('AT-02: an older ripe plant on the higher index wins ahead of a newer one', () => {
    const state = initialState()
    earn(state,150)
    freshCrop(state)
    wait(state,6)
    commit(state,{type:'harvest',plot:12})
    wait(state,6)
    expect(state.plots[13].plant!.readySince!).toBeLessThan(state.plots[12].plant!.readySince!)
    commit(state,{type:'upgradeHelper',target:1})
    expect(advance(state,5)).toContain('HelperHarvested:13')
    expect(state.plots[12].plant!.progress).toBe(1)
  })

  it('AT-05: the same hybrid yields identical fruit and propagation seed for manual and automatic harvest', () => {
    const s = initialState()
    earn(s,400)
    commit(s,{type:'plant',plot:8,species:'strawberry'})
    commit(s,{type:'plant',plot:9,species:'sunflower'})
    for (let i=0;i<3;i++) { wait(s,12); commit(s,{type:'harvest',plot:8}) }
    commit(s,{type:'plant',plot:12,species:'solar_strawberry',replaceId:s.plots[12].plant!.id})
    for (const plot of [8,9,13]) commit(s,{type:'store',plot,expectedId:s.plots[plot].plant!.id})
    for (let i=0;i<5;i++) { wait(s,12); commit(s,{type:'harvest',plot:12}) }
    commit(s,{type:'sell'})
    wait(s,12)
    commit(s,{type:'upgradeHelper',target:1})
    advance(s,4.9)
    const manual = structuredClone(s)
    expect(commit(manual,{type:'harvest',plot:12})).toContain('SeedPropagated:solar_strawberry')
    expect(advance(manual,0.1)).toEqual([])
    expect(advance(s,0.1)).toEqual(['Harvested','SeedPropagated:solar_strawberry','HelperHarvested:12'])
    reject(s,{type:'harvest',plot:12},'notReady')
    expect(s.basket).toEqual(manual.basket)
    expect(s.seeds).toEqual(manual.seeds)
    expect(s.seeds.solar_strawberry).toBe(1)
    expect(s.plots[12].plant!.propagation).toBe(0)
    expect(s.recipeProgress.solar_strawberry).toBe(3)
  })

  it('AT-04: sells a prefilled basket on purchase, resets on manual sale and sells at the next deadline', () => {
    const s = initialState()
    earn(s,450)
    commit(s,{type:'upgradeHelper',target:1})
    advance(s,100)
    const coins = s.coins
    expect(s.basket).toHaveLength(15)
    expect(commit(s,{type:'buyAutoSell'})).toEqual(['AutoSellEnabled','Sold'])
    expect(s.coins).toBe(coins-300+75)
    expect(advance(s,5)).toContain('Harvested')
    expect(commit(s,{type:'sell'})).toEqual(['Sold'])
    expect(s.sellRemaining).toBe(10)
    expect(advance(s,9.9)).not.toContain('Sold')
    const money = s.coins
    const events = advance(s,0.1)
    expect(events).toEqual(['Harvested','HelperHarvested:13','Sold'])
    expect(s.basket).toHaveLength(0)
    expect(s.coins).toBe(money+10)
    expect(s.sellRemaining).toBe(10)
  })

  it('AT-04: filling the basket manually or automatically sells it once even at the periodic deadline', () => {
    const state = initialState()
    earn(state,450)
    wait(state,6)
    commit(state,{type:'upgradeHelper',target:1})
    advance(state,65)
    expect(state.basket.length).toBe(13)
    commit(state,{type:'buyAutoSell'})
    const manual = structuredClone(state)
    advance(manual,9)
    const ready = oldestReadyPlot(manual)!
    const before = manual.coins
    expect(commit(manual,{type:'harvest',plot:ready})).toEqual(['Harvested','Sold'])
    expect(manual.coins).toBe(before+75)
    expect(manual.sellRemaining).toBe(10)
    // Two helper turns fill the remaining slots just as the first sale falls due.
    const events = advance(state,10)
    expect(events.filter(e=>e==='Sold')).toHaveLength(1)
    expect(state.coins).toBe(before+75)
    expect(state.sellRemaining).toBe(10)
  })

  it('SV-01: reloads exact active deadlines and migrates schema 2 with automation unpurchased', () => {
    const s = initialState()
    earn(s,450)
    const store = memoryStorage()
    const { helperLevel, autoSell, harvestRemaining, sellRemaining, ...old } = s
    store.setItem('wonder-garden.save.v1',JSON.stringify({...old,schemaVersion:2}))
    const storage = createPersistence(()=>store)
    expect(storage.load()).toEqual(s)
    commit(s,{type:'upgradeHelper',target:1})
    commit(s,{type:'buyAutoSell'})
    advance(s,9.6)
    storage.save(s)
    const copy = storage.load()
    expect(copy).toEqual(s)
    expect(advance(copy,0.3)).toEqual([])
    expect(advance(copy,0.1)).toContain('Harvested')
    advance(s,0.4)
    expect(copy.coins).toBe(s.coins)
    expect(copy.basket).toEqual(s.basket)
    expect(validState({...s,harvestRemaining:0})).toBe(false)
    expect(validState({...s,sellRemaining:11})).toBe(false)
    expect(validState({...s,helperLevel:0})).toBe(false)
    expect(validState({...s,autoSell:false})).toBe(false)
  })

  it('grows all 12 species with only Leafy collecting and the stall selling after purchase', () => {
    const s = initialState()
    earn(s,450)
    commit(s,{type:'upgradeHelper',target:1})
    commit(s,{type:'buyAutoSell'})
    const discoveries: string[] = []
    const propagation = new Set<string>()
    function tick() {
      const events = advance(s,1)
      for (const e of events) {
        if (e.startsWith('RecipeRevealed:')) discoveries.push(e.split(':')[1])
        if (e.startsWith('SeedPropagated:')) propagation.add(e.split(':')[1])
      }
    }
    function buy(cmd:Command) {
      for (let i=0;i<3600;i++) {
        const result = execute(s,cmd)
        if (result.ok) return
        if (!['noCoins','noSeeds','seedLocked'].includes(result.reason)) throw Error(result.reason)
        tick()
      }
      throw Error('Unreachable ' + JSON.stringify(cmd))
    }
    function plant(plot:number,species:Species) {
      if (!s.plots[plot].open) buy({type:'clear',plot})
      buy({type:'plant',plot,species})
    }
    plant(8,'strawberry')
    plant(9,'sunflower')
    plant(14,'solar_strawberry')
    plant(5,'blueberry')
    plant(4,'moonflower')
    plant(10,'clover')
    buy({type:'upgradeHelper',target:2})
    plant(6,'moonberry')
    plant(7,'golden_flower')
    buy({type:'upgrade',plot:6})
    plant(11,'honey_clover')
    plant(15,'crystal_flower')
    buy({type:'upgrade',plot:15})
    buy({type:'upgrade',plot:15})
    plant(0,'star_orchid')
    for (const plot of [1,2,3]) buy({type:'clear',plot})
    expect(s.planted).toHaveLength(12)
    expect(discoveries).toHaveLength(6)
    expect(new Set(discoveries).size).toBe(6)
    expect(propagation.has('solar_strawberry')).toBe(true)
    expect(s.plots.every(plot=>plot.open)).toBe(true)
    expect(validState(s)).toBe(true)
  })
})
