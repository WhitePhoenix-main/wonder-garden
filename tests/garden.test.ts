import { describe, expect, it } from 'vitest'
import { basketCapacity, basketCount, saleValue } from '../src/game'
import { initialMarket } from '../src/game/market'
import { decorationAt, harmony } from '../src/game/decor'
import { journal } from '../src/game/journal'
import { createPersistence } from '../src/persistence/storage'
import { validState } from '../src/persistence/validation'
import { gardenWithStarterPlants, cross, legacySix, commit, earn, memoryStorage, prepareFirstResearch, reject, wait } from './helpers'

function gardenWithHybrid() {
  const state = gardenWithStarterPlants(33)
  earn(state,800)
  commit(state,{type:'plant',plot:8,species:'strawberry'})
  commit(state,{type:'plant',plot:9,species:'sunflower'})
  prepareFirstResearch(state)
  wait(state,12);cross(state,8,'solar_strawberry')
  commit(state,{type:'plant',plot:12,species:'solar_strawberry',replaceId:state.plots[12].plant!.id})
  return state
}

describe('Garden building and progress', () => {
  it('DE-01/02: purchases, swaps, stores and recovers decorations without duplicate harmony or charges', () => {
    const buy = {type:'buyDecor',decor:'bench',slot:'northwest',replaceId:null} as const
    reject(gardenWithStarterPlants(33),buy,'decorLocked')
    const state = gardenWithHybrid()
    const harmonyBefore=harmony(state)
    expect(harmonyBefore).toBe(85)
    const coins = state.coins
    reject(state,{...buy,slot:'unknown'},'invalidSlot')
    commit(state,buy)
    const first = decorationAt(state,'northwest')!
    expect(harmony(state)).toBe(harmonyBefore+5)
    expect(state.coins).toBe(coins-80)
    reject(state,buy,'decorChanged')
    commit(state,{...buy,slot:'southeast'})
    expect(harmony(state)).toBe(harmonyBefore+5)
    commit(state,{type:'buyDecor',decor:'lantern',slot:'northeast',replaceId:null})
    const lantern = decorationAt(state,'northeast')!
    expect(harmony(state)).toBe(harmonyBefore+10)
    commit(state,{type:'placeDecor',id:first.id,slot:'northeast',replaceId:lantern.id})
    expect(first.slot).toBe('northeast')
    expect(lantern.slot).toBe('northwest')
    expect(state.coins).toBe(coins-80-80-120)
    const second = decorationAt(state,'southeast')!
    commit(state,{type:'storeDecor',id:first.id})
    expect(harmony(state)).toBe(harmonyBefore+10)
    commit(state,{type:'buyDecor',decor:'lantern',slot:'southeast',replaceId:second.id})
    expect(second.slot).toBeNull()
    expect(harmony(state)).toBe(harmonyBefore+5)
    expect(state.coins).toBe(coins-80-80-120-120)
    commit(state,{type:'placeDecor',id:first.id,slot:'southwest',replaceId:null})
    expect(harmony(state)).toBe(harmonyBefore+10)
    commit(state,{type:'store',plot:12,expectedId:state.plots[12].plant!.id})
    expect(harmony(state)).toBe(harmonyBefore-10)
    expect(journal(state).studied).toBe(5)
    const storage = createPersistence(memoryStorage)
    const data = memoryStorage()
    const durable = createPersistence(()=>data)
    durable.save(state)
    expect(durable.load()).toEqual(state)
    expect(JSON.parse(storage.exportData(state))).toEqual(state)
    const bad = structuredClone(state)
    bad.decorations[0].slot = bad.decorations.find(d=>d.type==='lantern')!.slot
    expect(validState(bad)).toBe(false)
    bad.decorations[0].slot = null
    bad.decorations[0].id = state.plots[8].plant!.id
    expect(validState(bad)).toBe(false)
  })

  it('PG-01: early goals remain recorded through reload, planting and storing without coin rewards', () => {
    let state = gardenWithStarterPlants(33)
    wait(state,6)
    commit(state,{type:'harvest',plot:12})
    expect(state.coins).toBe(20)
    expect(journal(state).chapters[0][0]).toBe(true)
    earn(state,250)
    for (const plot of [4,5,0,1]) {
      earn(state,250)
      commit(state,{type:'clear',plot})
    }
    expect(journal(state).chapters[2]).toEqual([false,false,false,true])
    const storage = memoryStorage()
    createPersistence(()=>storage).save(state)
    const coins = state.coins
    state = createPersistence(()=>storage).load()
    expect(journal(state).chapters[2]).toEqual([false,false,false,true])
    expect(state.coins).toBe(coins)
    expect(journal(state).rank).toBe(0)
  })

  it('NU-02/03: allows recovery only when existing plants or seed stock cannot restore the garden', () => {
    const state = gardenWithHybrid()
    const active = state.plots.flatMap((p,plot)=>p.plant ? [plot] : [])
    for (const plot of active) commit(state,{type:'store',plot,expectedId:state.plots[plot].plant!.id})
    state.coins = 0 // Isolate the depleted-funds guard on a valid snapshot.
    reject(state,{type:'emergencyRadish',plot:12},'recoveryUnavailable')
    const hybrid = state.nursery.find(p=>p.species==='solar_strawberry')!
    commit(state,{type:'return',plot:12,id:hybrid.id})
    expect(state.coins).toBe(0)

    const depleted = gardenWithStarterPlants(33)
    for (const p of depleted.plots) p.plant = null
    depleted.coins = 0
    expect(validState(depleted)).toBe(true)
    commit(depleted,{type:'emergencyRadish',plot:12})
    expect(depleted.plots[12].plant?.species).toBe('radish')
    expect(depleted.coins).toBe(0)
    reject(depleted,{type:'emergencyRadish',plot:13},'recoveryUnavailable')
    expect(validState(depleted)).toBe(true)
  })

  it('charges successive basket upgrades and keeps unsold fruit, sound and progress on migration', () => {
    const state = gardenWithStarterPlants(33)
    reject(state,{type:'upgradeBasket',target:1},'firstSale')
    earn(state,800)
    wait(state,6)
    commit(state,{type:'harvest',plot:12})
    const data = memoryStorage()
    const old = JSON.parse(JSON.stringify(legacySix(state)))
    old.schemaVersion = 3
    delete old.firstHarvest
    data.setItem('wonder-garden.save.v1',JSON.stringify(old))
    const persistence = createPersistence(()=>data)
    const migrated=persistence.load()
    expect(migrated.coins).toBe(state.coins)
    expect(basketCount(migrated)).toBe(basketCount(state))
    expect(saleValue(migrated)).toBe(saleValue({...state,market:initialMarket()}))
    expect(migrated.basket[0].profile).toBeNull()
    const coins = state.coins
    for (const [target,capacity] of [[1,240],[2,720],[3,2400]]) {
      commit(state,{type:'upgradeBasket',target})
      expect(basketCapacity(state)).toBe(capacity)
      reject(state,{type:'upgradeBasket',target},'basketLevel')
    }
    expect(state.basket.length).toBeGreaterThan(0);expect(state.basket.every(f=>f.valueUnits===40000)).toBe(true)
    expect(state.coins).toBe(coins-740)
    commit(state,{type:'sound',muted:true})
    persistence.save(state)
    expect(persistence.load()).toEqual(state)
    expect(validState({...state,basketLevel:4})).toBe(false)
  })
})
