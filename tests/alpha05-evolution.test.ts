import { expect,it } from 'vitest'
import alpha04 from './fixtures/alpha04.json'
import { adjacent, advance, basketCapacity, cycleSeconds, execute, initialState, plotCount, speciesIds } from '../src/game'
import { evolution, plotIndices, valley } from '../src/game/config'
import { harmony } from '../src/game/decor'
import { common, stockCount, traits } from '../src/game/genetics'
import { isBusy } from '../src/game/greenhouse'
import { saveVersion, type GameState, type Profile, type Species } from '../src/game/model'
import { orderQuote } from '../src/game/orders'
import { newPlant } from '../src/game/state'
import { defaultPolicy } from '../src/game/stock-policy'
import { parseSave } from '../src/persistence/migration'
import { addLegacyFruit, cleanBed, commit, cross, earn, gardenWithStarterPlants, plantAt, prepareFirstResearch, reject, wait } from './helpers'

function reload(state:GameState):GameState {
  const copy=parseSave(JSON.stringify(state))
  if (!copy || copy==='future') throw Error('The save did not resume')
  expect(copy).toEqual(state)
  return copy
}

function enterBreeding(seed:number) {
  const state=initialState(seed)
  for (const plot of [12,13]) commit(state,{type:'plant',plot,species:'radish',stock:common})
  wait(state,6)
  commit(state,{type:'harvest',plot:12})
  commit(state,{type:'extractSeeds',id:state.basket[0].id,count:1})
  cleanBed(state,12)
  commit(state,{type:'plant',plot:12,species:'radish',stock:common})
  earn(state,300)
  commit(state,{type:'plant',plot:8,species:'strawberry'})
  commit(state,{type:'plant',plot:9,species:'sunflower'})
  prepareFirstResearch(state)
  wait(state,12)
  cross(state,8,'solar_strawberry')
  expect(state.seeds.solar_strawberry).toBe(1)
  return state
}

function radishParents(state:GameState):[number,number] {
  const ids=[12,13].map(plot=>{
    const parent=plantAt(state,plot)
    commit(state,{type:'store',plot,expectedId:parent.id})
    return parent.id
  })
  return [ids[0],ids[1]]
}

it.each([17,42,2026])('takes the legal intro through paid intra-species breeding on seed %i',seed=>{
  let state=enterBreeding(seed)
  earn(state,evolution.greenhouseCosts[1]+evolution.experiments[0].cost)
  commit(state,{type:'upgradeGreenhouse',target:2})
  const parents=radishParents(state)
  reject(state,{type:'startCross',parents:[parents[0],parents[0]]},'sameParent')
  const coins=state.coins
  const snapshots=structuredClone(state.nursery)
  commit(state,{type:'startCross',parents})
  expect(state.coins).toBe(coins-evolution.experiments[0].cost)
  expect(isBusy(state,parents[0])).toBe(true)
  reject(state,{type:'startCross',parents},'parentsBusy')
  const blocked=structuredClone(state)
  expect(execute(state,{type:'return',id:parents[0],plot:12}).ok).toBe(false)
  expect(state).toEqual(blocked)
  const [experiment]=state.crosses
  reject(state,{type:'collectCross',id:experiment.id},'crossNotReady')
  wait(state,8)
  state=reload(state)
  const rng=state.rng
  const quote=stockCount(state,experiment.species,experiment.profile)
  advance(state,experiment.readyAt-state.playTime)
  expect(isBusy(state,parents[0])).toBe(false)
  commit(state,{type:'collectCross',id:experiment.id})
  expect(state.rng).toBe(rng)
  expect(state.nursery).toEqual(snapshots)
  expect(stockCount(state,experiment.species,experiment.profile)).toBe(quote+1)
  expect(state.crosses[0].profile).toEqual(experiment.profile)
  state=reload(state)
  reject(state,{type:'collectCross',id:experiment.id},'itemChanged')
})

it.each([17,42,2026])('breeds two rare parents, then epic and legendary radish through paid commands, seed %i',seed=>{
  const state=enterBreeding(seed)
  earn(state,evolution.greenhouseCosts[1]+20)
  commit(state,{type:'upgradeGreenhouse',target:2})
  const ordinary=radishParents(state)
  for (const plot of [8,9]) commit(state,{type:'store',plot,expectedId:plantAt(state,plot).id})
  for (const plot of [12,13]) commit(state,{type:'plant',plot,species:'radish'})
  let attempts=0
  function obtain(parents:[number,number],rarity:Profile['rarity']):number {
    for (let i=0;i<360;i++) {
      earn(state,evolution.experiments[0].cost)
      commit(state,{type:'startCross',parents})
      const trial=state.crosses.at(-1)!
      advance(state,trial.readyAt-state.playTime)
      commit(state,{type:'collectCross',id:trial.id})
      attempts++
      if (trial.profile.rarity!==rarity) continue
      commit(state,{type:'plant',plot:8,species:'radish',stock:trial.profile})
      const plant=plantAt(state,8)
      commit(state,{type:'store',plot:8,expectedId:plant.id})
      return plant.id
    }
    throw Error(`Rare lineage stalled at ${rarity} after ${attempts} trials`)
  }
  const uncommon:[number,number]=[obtain(ordinary,'uncommon'),obtain(ordinary,'uncommon')]
  const rare:[number,number]=[obtain(uncommon,'rare'),obtain(uncommon,'rare')]
  const attemptsToRarePair=attempts
  const epic=obtain(rare,'epic')
  const attemptsToEpic=attempts-attemptsToRarePair
  const legendary=obtain([rare[0],epic],'legendary')
  expect(state.nursery.find(p=>p.id===legendary)).toMatchObject({species:'radish',rarity:'legendary'})
  expect(state.collection.find(row=>row.species==='radish' && row.rarity==='legendary')).toBeDefined()
  expect(state.coins).toBeGreaterThanOrEqual(0)
  reload(state)
  console.log({seed,attemptsToRarePair,attemptsToEpic,attemptsToLegendary:attempts-attemptsToRarePair-attemptsToEpic,
    totalExperiments:attempts,activeSeconds:Math.round(state.playTime)})
})

it('keeps concurrent results and trait sets isolated',()=>{
  const state=initialState(17)
  state.coins=30000
  state.revealed=['solar_strawberry']
  state.planted=['radish','strawberry','sunflower']
  const genotype:Profile={rarity:'epic',plus:['early','quality'],minus:null}
  for (let i=0;i<6;i++) state.nursery.push(newPlant(state.nextId++,'radish',genotype))
  for (const target of [2,3,4]) commit(state,{type:'upgradeGreenhouse',target})
  const parents=(at:number):[number,number]=>[state.nursery[at].id,state.nursery[at+1].id]
  commit(state,{type:'startCross',parents:parents(0)})
  commit(state,{type:'startCross',parents:parents(2)})
  reject(state,{type:'startCross',parents:parents(4)},'crossSlotsFull')
  commit(state,{type:'upgradeGreenhouse',target:5})
  commit(state,{type:'startCross',parents:parents(4)})
  expect(new Set(state.crosses.flatMap(entry=>entry.parents)).size).toBe(6)
  advance(state,15)
  const originalStock=state.seeds.radish
  const results=state.crosses.map(entry=>entry.profile)
  for (const result of [...state.crosses].reverse()) commit(state,{type:'collectCross',id:result.id})
  expect(state.crosses.map(entry=>entry.profile)).toEqual(results)
  expect(state.crosses.every(entry=>entry.collected)).toBe(true)
  expect(state.seeds.radish-originalStock+state.variants.reduce((sum,pack)=>sum+pack.count,0)).toBe(3)
})

it('restores an authentic Alpha 04 save without awarding currency or inventing inventory-only discoveries',()=>{
  const state=parseSave(JSON.stringify(alpha04))
  if (!state || state==='future') throw Error('Expected the production Alpha 04 fixture to migrate')
  expect(state).toMatchObject({schemaVersion:saveVersion,coins:alpha04.coins,playTime:alpha04.playTime,nextId:alpha04.nextId,
    activeIsland:'green',rng:alpha04.rng,lang:alpha04.lang,planted:alpha04.planted,revealed:alpha04.revealed,
    failures:alpha04.failures,helperLevel:alpha04.helperLevel,autoSell:alpha04.autoSell,
    harvestRemaining:alpha04.harvestRemaining,sellRemaining:alpha04.sellRemaining,stallLevel:2})
  expect(state.seeds).toEqual(alpha04.seeds)
  expect(state.decorations).toEqual(alpha04.decorations)
  expect(state.nursery.map(p=>p.id)).toEqual(alpha04.nursery.map(p=>p.id))
  for (const [index,previous] of alpha04.plots.entries()) {
    const plot=state.plots[index]
    expect(plot).toMatchObject({open:previous.open,level:previous.level})
    if (!previous.plant) {expect(plot.plant).toBeNull();continue}
    const {pollination,plus,...rest}=previous.plant
    expect(plot.plant).toMatchObject({...rest,plus:plus===null ? [] : [plus]})
    expect(plot.plant!.pollination).toEqual(pollination && {...pollination,donor:{...pollination.donor,plus:[]}})
  }
  expect(reload(state)).toEqual(state)
  const variant={species:'strawberry',rarity:'rare',plus:'seedy',minus:null,count:1}
  const held=parseSave(JSON.stringify({...alpha04,variants:[variant]}))
  if (!held || held==='future') throw Error('Expected a valid held profile')
  expect(held.variants).toMatchObject([{...variant,plus:['seedy']}])
  expect(held.collection.find(r=>r.species==='strawberry' && r.rarity==='rare')).toBeUndefined()
})

it('preserves a partially consumed Alpha 04 portion, its pollen snapshot and single copy roll',()=>{
  const previous=structuredClone(alpha04)
  const crop=previous.plots[8].plant!
  const legacyLot={size:2,remaining:1,seedYield:2,copyChance:0.4,copyPending:true,crossPending:true}
  const batch={id:previous.nextId++,species:'strawberry',valueUnits:86400,count:1,
    profile:{rarity:'rare',plus:'seedy',minus:'small'},pollination:crop.pollination,lots:[legacyLot]}
  const state=parseSave(JSON.stringify({...previous,basket:[batch]}))
  if (!state || state==='future') throw Error('Expected the Alpha 04 crop fixture to migrate')
  expect(state.basket[0]).toMatchObject({...batch,profile:{...batch.profile,plus:['seedy']},
    pollination:{result:'solar_strawberry',donor:{species:'sunflower',...common}}})
  const persisted=reload(state)
  const command={type:'extractSeeds',id:batch.id,count:1} as const
  const result=execute(state,command)
  expect(result.ok).toBe(true)
  expect(execute(persisted,command)).toEqual(result)
  expect(persisted).toEqual(state)
  reject(state,command,'itemChanged')
})

it('rejects overlapping live experiment locks, duplicate order IDs and invalid view ownership',()=>{
  const state=enterBreeding(11)
  earn(state,evolution.greenhouseCosts[1]+evolution.experiments[0].cost)
  commit(state,{type:'upgradeGreenhouse',target:2})
  commit(state,{type:'startCross',parents:radishParents(state)})
  const duplicate=structuredClone(state)
  duplicate.greenhouseLevel=4
  duplicate.crosses.push({...duplicate.crosses[0],id:duplicate.nextId++})
  expect(parseSave(JSON.stringify(duplicate))).toBeNull()
  const collision=structuredClone(state)
  collision.orders[0].id=collision.crosses[0].id
  expect(parseSave(JSON.stringify(collision))).toBeNull()
  expect(parseSave(JSON.stringify({...state,activeIsland:'valley'}))).toBeNull()
  expect(reload(state)).toEqual(state)
})

it('tracks one collection entry through repeated plantings, harvest, and reload',()=>{
  let state=initialState(15)
  const profile:Profile={rarity:'epic',plus:['fruitful','quality'],minus:null}
  state.variants.push({...profile,species:'radish',count:2})
  for (let i=0;i<2;i++) {
    commit(state,{type:'plant',plot:8,species:'radish',stock:profile})
    expect(state.collection.filter(row=>row.species==='radish' && row.rarity==='epic')).toHaveLength(1)
    wait(state,6)
    commit(state,{type:'harvest',plot:8})
    expect(state.plots[8].plant?.lives).toBe(0)
    state=reload(state)
    cleanBed(state,8)
  }
  const row=state.collection.find(row=>row.species==='radish' && row.rarity==='epic')!
  expect(row.planted).toBe(2)
  expect(row.harvested).toBeGreaterThanOrEqual(4)
  expect(traits(row.profile)).toEqual(profile.plus)
})

it('keeps plot geometry, planting, auras and decoration on the correct island',()=>{
  let state=initialState(26)
  state.sold=true
  state.coins=30000
  const locked=structuredClone(state)
  expect(execute(state,{type:'restoreBridge'}).ok).toBe(false)
  expect(state).toEqual(locked)
  state.revealed=['solar_strawberry','moonberry','honey_clover','golden_flower','crystal_flower','star_orchid']
  state.planted=[...speciesIds]
  const occupants:Species[]=[...speciesIds.filter(s=>s!=='sunflower')]
  for (const i of plotIndices('green')) {
    state.plots[i].open=true
    const species=occupants[i]
    state.plots[i].plant=species ? newPlant(state.nextId++,species) : null
  }
  for (const [decor,slot] of [['fountain','northwest'],['statue','northeast'],['sakura','southwest']] as const)
    commit(state,{type:'buyDecor',decor,slot,replaceId:null})
  expect(harmony(state,'green')).toBeGreaterThanOrEqual(evolution.bridge.harmony)
  const coins=state.coins
  commit(state,{type:'restoreBridge'})
  expect(state.plots).toHaveLength(24)
  expect(state.coins).toBe(coins-evolution.bridge.cost)
  expect(plotIndices('valley').filter(i=>state.plots[i].open)).toEqual(valley.startOpen.map(i=>i+plotCount))
  expect(adjacent(15).every(i=>i<plotCount)).toBe(true)
  expect(adjacent(16).every(i=>i>=plotCount)).toBe(true)
  commit(state,{type:'travel',island:'valley'})
  commit(state,{type:'plant',plot:16,species:'radish'})
  const before=cycleSeconds(state,16)
  const greenDuration=cycleSeconds(state,0)
  commit(state,{type:'plant',plot:17,species:'sunflower'})
  expect(cycleSeconds(state,16)).toBeLessThan(before)
  expect(cycleSeconds(state,0)).toBe(greenDuration)
  commit(state,{type:'buyDecor',decor:'apiary',slot:valley.decorSlots[0].id,replaceId:null})
  const h=harmony(state,'valley')
  commit(state,{type:'storeDecor',id:state.decorations.at(-1)!.id})
  expect(harmony(state,'valley')).toBeLessThan(h)
  for (const target of [2,3,4,5]) {
    const before=state.coins
    commit(state,{type:'upgrade',plot:16})
    expect(state.plots[16].level).toBe(target)
    expect(state.coins).toBeLessThan(before)
  }
  commit(state,{type:'travel',island:'green'})
  wait(state,6)
  expect(state.plots[16].plant?.readySince).not.toBeNull()
  state=reload(state)
  expect(state.activeIsland).toBe('green')
  expect(state.plots[16].level).toBe(5)
  commit(state,{type:'plotPolicy',plot:16,policy:{...defaultPolicy,priority:3}})
  commit(state,{type:'upgradeHelper',target:1})
  expect(advance(state,5)).toContain('HelperHarvested:16')
  expect(state.activeIsland).toBe('green')
  expect(state.plots[16].plant?.lives).toBe(0)
})

it('respects protected and reserved seed stock during delegated replanting',()=>{
  const state=gardenWithStarterPlants(17)
  state.sold=true
  state.coins=30000
  state.seeds.radish=3
  for (const target of [1,2,3,4,5] as const) commit(state,{type:'upgradeHelper',target})
  commit(state,{type:'buyAutoSell'})
  commit(state,{type:'upgradeStall',target:3})
  const policy={...defaultPolicy,mode:'commercial' as const,replant:{species:'radish' as const,profile:common}}
  commit(state,{type:'plotPolicy',plot:12,policy})
  commit(state,{type:'setAutomation',settings:{...state.automation,replant:true}})
  commit(state,{type:'setReserve',species:'radish',profile:common,count:2})
  commit(state,{type:'protectProfile',species:'radish',profile:common,enabled:true})
  advance(state,7)
  expect(state.seeds.radish).toBe(3)
  expect(plantAt(state,12).readySince).not.toBeNull()
  commit(state,{type:'harvest',plot:12})
  advance(state,1)
  expect(state.seeds.radish).toBe(3)
  expect(plantAt(state,12).lives).toBe(0)
  expect(state.basket.length).toBeGreaterThan(0)
  commit(state,{type:'protectProfile',species:'radish',profile:common,enabled:false})
  cleanBed(state,12)
  commit(state,{type:'plant',plot:12,species:'radish'})
  advance(state,15)
  expect(state.seeds.radish).toBe(2)
  expect(state.plots[12].plant).toBeNull()
  reload(state)
})

it('does not spend replant stock or duplicate fruit when the basket is full',()=>{
  const state=gardenWithStarterPlants(19)
  earn(state,150)
  commit(state,{type:'upgradeHelper',target:1})
  state.seeds.radish=3
  addLegacyFruit(state,basketCapacity(state))
  const id=plantAt(state,12).id
  advance(state,20)
  expect(state.basket).toHaveLength(1)
  expect(plantAt(state,12).id).toBe(id)
  expect(state.seeds.radish).toBe(3)
})

it('keeps seed-mode production ahead of sale and retains a seed reserve over repeated cycles',()=>{
  let state=gardenWithStarterPlants(21)
  state.sold=true
  state.coins=30000
  for (const target of [1,2,3,4,5] as const) commit(state,{type:'upgradeHelper',target})
  commit(state,{type:'buyAutoSell'})
  commit(state,{type:'upgradeStall',target:3})
  commit(state,{type:'plotPolicy',plot:13,policy:{...defaultPolicy,mode:'support'}})
  commit(state,{type:'plotPolicy',plot:12,policy:{...defaultPolicy,mode:'seed',target:2,replant:{species:'radish',profile:common}}})
  commit(state,{type:'setReserve',species:'radish',count:1})
  commit(state,{type:'setAutomation',settings:{...state.automation,replant:true}})
  const coins=state.coins
  const events=advance(state,18)
  expect(events).toContain('SeedsExtracted')
  expect(events).toContain('AutoPlanted:12')
  expect(state.coins).toBe(coins)
  expect(state.seeds.radish).toBeGreaterThanOrEqual(1)
  state=reload(state)
  advance(state,65)
  expect(state.coins).toBe(coins)
  expect(state.seeds.radish).toBeGreaterThanOrEqual(1)
  expect(state.basket.every(b=>b.lots.every(l=>l.origin?.mode==='seed'))).toBe(true)
})

it('stores pollination per harvest and waits for explicit permission to process a breeding bed',()=>{
  let state=enterBreeding(21)
  earn(state,150+evolution.stallCosts[1]+evolution.stallCosts[2])
  commit(state,{type:'upgradeHelper',target:1})
  commit(state,{type:'upgradeStall',target:2})
  commit(state,{type:'upgradeStall',target:3})
  commit(state,{type:'plotPolicy',plot:8,policy:{...defaultPolicy,mode:'breeding',priority:3}})
  advance(state,10)
  const batch=state.basket.find(b=>b.lots.some(l=>l.origin?.mode==='breeding'))!
  expect(batch.pollination?.result).toBe('solar_strawberry')
  expect(batch.lots.some(l=>l.crossPending)).toBe(true)
  state=reload(state)
  const retained=state.basket.find(b=>b.id===batch.id)!
  expect(retained).toEqual(batch)
  commit(state,{type:'setAutomation',settings:{...state.automation,extractPollinated:true}})
  expect(advance(state,5)).toContain('SeedsExtracted')
})

it('keeps the first achievable order across reload, pays it once and replenishes the board after the cooldown',()=>{
  let state=enterBreeding(17)
  advance(state,0.1)
  expect(state.orders).toHaveLength(1)
  const [order]=state.orders
  state=reload(state)
  const [rule]=order.requirements
  expect(rule).toMatchObject({kind:'fruit',count:expect.any(Number)})
  expect(state.planted).toContain(rule.species)
  const species=rule.species!
  earn(state,500)
  // Separate crop production from accidental pollination on the intro layout.
  for (const plot of [8,9])
    if (state.plots[plot].plant) commit(state,{type:'store',plot,expectedId:plantAt(state,plot).id})
  for (let i=0;i<10 && !orderQuote(state,order).complete;i++) {
    if (state.plots[8].plant?.lives===0) cleanBed(state,8)
    if (!state.plots[8].plant) {
      commit(state,{type:'plant',plot:8,species})
    }
    advance(state,cycleSeconds(state,8))
    commit(state,{type:'harvest',plot:8})
  }
  const quote=orderQuote(state,order)
  expect(quote.complete).toBe(true)
  const before=state.coins
  const beforeCount=state.basket.reduce((sum,batch)=>sum+batch.count,0)
  commit(state,{type:'fulfillOrder',id:order.id})
  expect(state.coins).toBe(before+order.reward)
  expect(state.basket.reduce((sum,batch)=>sum+batch.count,0)).toBe(beforeCount-rule.count)
  expect(state.ordersCompleted).toBe(1)
  reject(state,{type:'fulfillOrder',id:order.id},'itemChanged')
  advance(state,evolution.orderCooldown-.1)
  expect(state.orders).toHaveLength(0)
  advance(state,.2)
  expect(state.orders).toHaveLength(1)
  const replacement=state.orders[0]
  expect(replacement.id).not.toBe(order.id)
  const declineCoins=state.coins
  commit(state,{type:'declineOrder',id:replacement.id})
  expect(state.coins).toBe(declineCoins)
  expect(reload(state).orders).toHaveLength(0)
})

it('uses protected inventory and shortages to reject a compound order atomically',()=>{
  const state=gardenWithStarterPlants(14)
  const profile:Profile={rarity:'epic',plus:['early','quality'],minus:null}
  state.variants.push({...profile,species:'radish',count:2})
  advance(state,6)
  commit(state,{type:'harvest',plot:12})
  const order={id:state.nextId++,buyer:'collector' as const,reward:150,requirements:[
    {kind:'fruit' as const,species:'radish' as const,count:2},
    {kind:'seed' as const,rarity:'epic' as const,trait:'quality' as const,clean:true,count:1}
  ]}
  state.orders.push(order)
  commit(state,{type:'protectProfile',species:'radish',profile,enabled:true})
  expect(orderQuote(state,order).lines[1].available).toBe(0)
  reject(state,{type:'fulfillOrder',id:order.id},'orderResources')
  commit(state,{type:'protectProfile',species:'radish',profile,enabled:false})
  expect(orderQuote(state,order).complete).toBe(true)
  const balance=state.coins
  commit(state,{type:'fulfillOrder',id:order.id})
  expect(state.coins).toBe(balance+order.reward)
  expect(stockCount(state,'radish',profile)).toBe(1)
  reject(state,{type:'fulfillOrder',id:order.id},'itemChanged')
})

it('rolls back an invalid batch of inventory actions instead of partially selling',()=>{
  const state=gardenWithStarterPlants(9)
  advance(state,6)
  commit(state,{type:'harvest',plot:12})
  const batch=state.basket[0]
  const sale={type:'sellHarvest' as const,id:batch.id,count:batch.count}
  const before=structuredClone(state)
  expect(execute(state,{type:'bulk',commands:[sale,sale]}).ok).toBe(false)
  expect(state).toEqual(before)
  commit(state,{type:'bulk',commands:[sale]})
  expect(state.basket).toHaveLength(0)
})
