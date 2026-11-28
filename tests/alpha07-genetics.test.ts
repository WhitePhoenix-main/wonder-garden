import { expect, it } from 'vitest'
import { advance, execute, initialState } from '../src/game'
import { evolution } from '../src/game/config'
import { sameProfile, stockCount } from '../src/game/genetics'
import { crossingQuote, isBusy } from '../src/game/greenhouse'
import type { GameState, Profile } from '../src/game/model'
import { newPlant } from '../src/game/state'
import { parseSave } from '../src/persistence/migration'
import { evolutionPanel } from '../src/ui/panels/evolution'
import { commit, reject } from './helpers'

const epic:Profile={rarity:'epic',plus:['early','seedy'],minus:'small'}
const rare:Profile={rarity:'rare',plus:['quality'],minus:null}

function breedingGarden(level:number,profiles:Profile[]):GameState {
  const state=initialState(42)
  state.sold=true
  state.coins=20_000
  state.revealed=['solar_strawberry']
  state.planted.push('strawberry','sunflower')
  state.greenhouseLevel=level
  state.nursery=profiles.map(profile=>newPlant(state.nextId++,'radish',profile))
  return state
}

function resume(state:GameState):GameState {
  const copy=parseSave(JSON.stringify(state))
  expect(copy).toEqual(state)
  if (!copy || copy==='future') throw new Error('The save did not resume')
  return copy
}

it('spends a shared Legendary guarantee at payment and conceals it while the experiment runs',()=>{
  let state=breedingGarden(5,[rare,epic,epic,epic])
  const key='radish/legendary'
  state.rarityProgress[key]=evolution.rarityGuarantee-1
  const [a,b,c,d]=state.nursery
  expect(crossingQuote(state,a,b).key).toBe(crossingQuote(state,c,d).key)
  expect(crossingQuote(state,a,b).weights).toEqual([0,0,0,0,2])
  commit(state,{type:'startCross',parents:[a.id,b.id]})
  expect(state.crosses[0].profile.rarity).toBe('legendary')
  expect(state.rarityProgress[key]).toBeUndefined()
  const beforeReady=evolutionPanel(state,[c.id,d.id])
  expect(beforeReady).toContain('Показаны базовые шансы')
  expect(beforeReady).toContain('Легендарный 5%')
  expect(beforeReady).not.toContain('Легендарный 100%')
  state=resume(state)
  expect(crossingQuote(state,c,d).weights).toEqual([10,20,35,30,5])
  commit(state,{type:'startCross',parents:[c.id,d.id]})
  expect(state.rarityProgress[key]??0).toBe(state.crosses[1].profile.rarity==='legendary' ? 0 : 1)
  const stateAfterPayment=resume(state)
  const storedRng=stateAfterPayment.rng
  advance(stateAfterPayment,15)
  commit(stateAfterPayment,{type:'collectCross',id:stateAfterPayment.crosses[0].id})
  expect(stateAfterPayment.rng).toBe(storedRng)
  expect(stockCount(stateAfterPayment,'radish',stateAfterPayment.crosses[0].profile)).toBe(1)
})

it('shares slots with crosses and copies the full profile exactly once across reload',()=>{
  let state=breedingGarden(2,[epic,rare,rare])
  const [parent,a,b]=state.nursery
  reject(state,{type:'startClone',id:parent.id},'greenhouseLocked')
  commit(state,{type:'upgradeGreenhouse',target:3})
  const cash=state.coins
  const rng=state.rng
  commit(state,{type:'startClone',id:parent.id})
  expect(state.coins).toBe(cash-evolution.cloning[0].cost)
  expect(state.rng).toBe(rng)
  expect(isBusy(state,parent.id)).toBe(true)
  reject(state,{type:'startCross',parents:[parent.id,b.id]},'parentsBusy')
  reject(state,{type:'startCross',parents:[a.id,b.id]},'crossSlotsFull')
  const [clone]=state.clones
  reject(state,{type:'collectClone',id:clone.id},'crossNotReady')
  reject(state,{type:'return',plot:8,id:parent.id},'parentsBusy')
  state=resume(state)
  expect(advance(state,evolution.cloning[0].seconds)).toContain('CloneReady')
  expect(isBusy(state,parent.id)).toBe(false)
  const result=execute(state,{type:'collectClone',id:clone.id})
  expect(result).toMatchObject({ok:true,obtained:[{species:'radish',count:1,...epic}]})
  expect(stockCount(state,'radish',epic)).toBe(1)
  expect(state.nursery).toContainEqual(parent)
  expect(state.rng).toBe(rng)
  state=resume(state)
  reject(state,{type:'collectClone',id:clone.id},'itemChanged')
})

it('rejects invalid counters and a clone with an altered profile',()=>{
  const state=breedingGarden(3,[epic])
  const [parent]=state.nursery
  commit(state,{type:'startClone',id:parent.id})
  const altered=structuredClone(state)
  altered.clones[0].profile.minus=null
  expect(parseSave(JSON.stringify(altered))).toBeNull()
  state.rarityProgress['radish/legendary']=evolution.rarityGuarantee
  expect(parseSave(JSON.stringify(state))).toBeNull()
})

it('blocks compost and automatic last-life harvest of a valuable line',()=>{
  const state=breedingGarden(3,[rare])
  const [parent]=state.nursery
  commit(state,{type:'return',id:parent.id,plot:8})
  reject(state,{type:'compost',plot:8,expectedId:parent.id},'lastProfile')
  commit(state,{type:'upgradeHelper',target:1})
  advance(state,90)
  expect(state.plots[8].plant).toBeTruthy()
  expect(sameProfile(state.plots[8].plant!,rare)).toBe(true)
  expect(state.basket.every(b=>!b.profile || !sameProfile(b.profile,rare))).toBe(true)
})
