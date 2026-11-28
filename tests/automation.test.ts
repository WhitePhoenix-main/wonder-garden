import { describe, expect, it } from 'vitest'
import type { Command, GameState, Species } from '../src/game/model'
import { advance, basketCapacity, execute, initialState, oldestReadyPlot } from '../src/game'
import { createPersistence } from '../src/persistence/storage'
import { validState } from '../src/persistence/validation'
import { legacySix, commit, earn, memoryStorage, reject, wait } from './helpers'

function freshCrop(state: GameState) {
  wait(state, 6)
  for (const [plot, bed] of state.plots.entries()) {
    if (bed.plant?.readySince != null) commit(state, {type:'harvest', plot})
  }
  commit(state, {type:'sell'})
}

describe('Leafy and the market stall', () => {
  it('AT-01: charges once per level, starts a new interval and collects 12/30/60 fruits per active minute', () => {
    const s = initialState(33)
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
    for(const b of s.plots)if(b.plant)b.plant.lives=b.plant.maxLives
    s.basketLevel=3
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
    const s = initialState(33)
    earn(s,150)
    freshCrop(s)
    for(const b of s.plots)if(b.plant)b.plant.lives=b.plant.maxLives
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
    expect(s.basket.length).toBeGreaterThanOrEqual(basketCapacity(s)-1)
    expect(s.plots[12].plant!.progress).toBe(1)
    const plants = structuredClone(s.plots)
    expect(advance(s,12)).toEqual([])
    expect(s.plots).toEqual(plants)
    commit(s,{type:'sell'})
    expect(advance(s,2.9)).toEqual([])
    expect(advance(s,0.1)).toContain('Harvested')
    expect(s.basket.length).toBeGreaterThan(0)
  })

  it('HA-01/AT-05: manual and automatic final harvest leave both recipes untouched, in either input order', () => {
    const s = initialState(33)
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
    expect(s.basket.length).toBeGreaterThan(0)
    expect(s.revealed).toEqual(before.revealed)
    expect(s.seeds).toEqual(before.seeds)
    expect(s.seeds).toMatchObject({solar_strawberry:0,moonberry:0})
    expect(s.revealed).toEqual([])
  })

  it('AT-02: an older ripe plant on the higher index wins ahead of a newer one', () => {
    const state = initialState(33)
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

  it('reserves the last life of a special plant for the player',()=>{
    const s=initialState(33);s.sold=true;s.coins=150
    const plant=s.plots[12].plant!
    Object.assign(plant,{rarity:'rare',plus:'fruitful',lives:1})
    s.plots[13].plant!.lives=1
    commit(s,{type:'upgradeHelper',target:1})
    advance(s,40)
    expect(plant.lives).toBe(1)
    expect(s.plots[13].plant).toBeNull()
    expect(s.basket.length).toBeGreaterThan(0)
  })

  it('AT-04: sells a prefilled basket on purchase, resets on manual sale and sells at the next deadline', () => {
    const s = initialState(33)
    earn(s,450)
    commit(s,{type:'upgradeHelper',target:1})
    s.basket=Array.from({length:15},()=>({species:'radish',valueUnits:30000}))
    const coins = s.coins
    expect(s.basket).toHaveLength(15)
    expect(commit(s,{type:'buyAutoSell'})).toEqual(['AutoSellEnabled','Sold'])
    expect(s.coins).toBe(coins-300+45)
    expect(advance(s,10)).toContain('Harvested')
    advance(s,5)
    expect(commit(s,{type:'sell'})).toEqual(['Sold'])
    expect(s.sellRemaining).toBe(10)
    expect(advance(s,9.9)).not.toContain('Sold')
    const money = s.coins
    const events = advance(s,0.1)
    expect(events).toContain('Sold')
    expect(s.basket).toHaveLength(0)
    expect(s.coins).toBeGreaterThan(money)
    expect(s.sellRemaining).toBe(10)
  })

  it('AT-04: filling the basket manually or automatically sells it once even at the periodic deadline', () => {
    const state = initialState(33)
    earn(state,450)
    wait(state,6)
    commit(state,{type:'upgradeHelper',target:1})
    commit(state,{type:'buyAutoSell'})
    state.basket=Array.from({length:14},()=>({species:'radish',valueUnits:30000}))
    state.plots[12].plant!.fruitRoll=0
    state.plots[13].plant!.fruitRoll=0
    state.sellRemaining=state.harvestRemaining
    const manual=structuredClone(state), before=state.coins
    expect(commit(manual,{type:'harvest',plot:12})).toContain('Sold')
    expect(manual.coins).toBe(before+45)
    const events=advance(state,5)
    expect(events.filter(e=>e==='Sold')).toHaveLength(1)
    expect(state.coins).toBe(before+45)
    expect(state.sellRemaining).toBe(10)
  })

  it('SV-01: reloads exact active deadlines and migrates schema 2 with automation unpurchased', () => {
    const s = initialState(33)
    earn(s,450)
    const store = memoryStorage()
    const { helperLevel, autoSell, harvestRemaining, sellRemaining, ...old } = s
    store.setItem('wonder-garden.save.v1',JSON.stringify({...legacySix(s),schemaVersion:2}))
    const storage = createPersistence(()=>store)
    expect(storage.load()).toMatchObject({coins:s.coins,helperLevel:0})
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

})
