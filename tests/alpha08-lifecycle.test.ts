import { expect, it } from 'vitest'
import { advance, initialState } from '../src/game'
import { beginObservation, sessionStats } from '../src/game/analytics'
import { workGarden } from '../src/game/automation'
import { evolution, recipes } from '../src/game/config'
import { harmony } from '../src/game/decor'
import { common, compatible, fruitCount, inherit, nextRandom, plantStats, validGenome } from '../src/game/genetics'
import { auraBonus, canRecoverGarden, pollinationFor, researchStatus } from '../src/game/queries'
import { newPlant } from '../src/game/state'
import { defaultPolicy, hasOtherSource } from '../src/game/stock-policy'
import { parseSave } from '../src/persistence/migration'
import { commit, plantAt, reject } from './helpers'

it('keeps wilted specimens across reload and removes only the requested dead specimen',()=>{
  let state=initialState(12)
  advance(state,6)
  const plant=plantAt(state,12)
  expect(commit(state,{type:'harvest',plot:12})).toContain('Withered')
  expect(plant).toMatchObject({lives:0,progress:0,readySince:null,pollination:null})
  advance(state,120)
  expect(plant).toMatchObject({lives:0,progress:0,readySince:null})
  reject(state,{type:'plant',plot:12,species:'radish'},'deadPlant')
  reject(state,{type:'move',from:13,to:12},'deadPlant')
  reject(state,{type:'cleanup',plot:13,expectedId:plantAt(state,13).id},'notDead')
  const copy=parseSave(JSON.stringify(state))
  expect(copy).toEqual(state)
  if (!copy || copy==='future') throw new Error('Could not restore the wilted specimen')
  state=copy
  expect(commit(state,{type:'cleanup',plot:12,expectedId:plant.id})).toContain('PlantCleaned')
  commit(state,{type:'sell'})
  commit(state,{type:'plant',plot:12,species:'radish'})
  reject(state,{type:'cleanup',plot:12,expectedId:plant.id},'stalePlant')
})

it('spends a life on a deterministic crop failure without spawning a batch or using a crossing try',()=>{
  const state=initialState(31)
  const mother=newPlant(state.nextId++,'strawberry',{...common,minus:'unfruitful'},0.05)
  state.plots[8].plant=mother
  Object.assign(mother,{mature:true,progress:1,readySince:0,lives:1,
    pollination:{result:'solar_strawberry',donor:{...common,species:'sunflower'},supporting:[]}})
  const rng=state.rng
  expect(commit(state,{type:'harvest',plot:8})).toEqual(['Harvested','Harvested:8:strawberry:0','CropFailed','Withered'])
  expect(state.basket).toEqual([])
  expect(state.seeds.strawberry).toBe(0)
  expect(state.failures.solar_strawberry).toBe(0)
  expect(state.rng).toBe(rng)
  expect(plantAt(state,8).lives).toBe(0)
  reject(state,{type:'harvest',plot:8,cycle:1},'notReady')
})

it('removes the advantages of dead neighbors while preserving an existing pollination snapshot',()=>{
  const state=initialState(31)
  state.planted.push('strawberry','sunflower','blueberry')
  state.plots[4].open=state.plots[5].open=true
  state.plots[8].plant=newPlant(state.nextId++,'strawberry')
  state.plots[9].plant=newPlant(state.nextId++,'sunflower')
  const donor=plantAt(state,9)
  const mother=plantAt(state,8)
  const active=pollinationFor(state,8)
  expect(active?.result).toBe('solar_strawberry')
  expect(auraBonus(state,8,'growth')).toBeGreaterThan(0)
  const before=harmony(state,'green')
  donor.lives=0
  expect(auraBonus(state,8,'growth')).toBe(0)
  expect(harmony(state,'green')).toBeLessThan(before)
  expect(hasOtherSource(state,'sunflower')).toBe(false)
  expect(pollinationFor(state,8)).toBeNull()
  mother.pollination=active
  expect(pollinationFor(state,8)).toEqual(active)
})

it('gates new pollination on tier progress and respects shared sides',()=>{
  const state=initialState(11)
  state.plots[8].plant=newPlant(state.nextId++,'strawberry')
  state.plots[9].plant=newPlant(state.nextId++,'sunflower')
  expect(researchStatus(state,'solar_strawberry').stage).toBe('tier')
  expect(pollinationFor(state,8)).toBeNull()
  state.planted.push('strawberry','sunflower','blueberry')
  state.plots[4].open=state.plots[5].open=true
  commit(state,{type:'move',from:9,to:13})
  expect(researchStatus(state,'solar_strawberry').stage).toBe('layout')
  commit(state,{type:'move',from:13,to:9})
  expect(researchStatus(state,'solar_strawberry')).toMatchObject({stage:'active',chance:1,activePlots:[8]})
  expect(recipes).toHaveLength(6)
})

it('leaves emergency recovery available when wilted plants are the only remaining specimens',()=>{
  const state=initialState(11)
  state.coins=0
  for (const plot of [12,13]) plantAt(state,plot).lives=0
  expect(canRecoverGarden(state)).toBe(true)
  state.passive.seeds.push({species:'radish',...common,count:1})
  expect(canRecoverGarden(state)).toBe(false)
  expect(hasOtherSource(state,'radish',common)).toBe(true)
  state.passive.seeds=[]
  const id=plantAt(state,12).id
  reject(state,{type:'emergencyRadish',plot:12},'recoveryUnavailable')
  commit(state,{type:'cleanup',plot:12,expectedId:id})
  commit(state,{type:'emergencyRadish',plot:12})
  expect(plantAt(state,12).lives).toBe(1)
  expect(canRecoverGarden(state)).toBe(false)
})

it('allows the configured genetic distributions and inherits compatible malproductive genomes',()=>{
  const ordinary=plantStats('strawberry',common)
  const positive={...common,rarity:'rare',plus:['fruitful']} as const
  const negative={...common,minus:'unfruitful'} as const
  const vigorous=plantStats('strawberry',positive)
  const meager=plantStats('strawberry',negative)
  expect(ordinary.fruits).toEqual([1,2])
  expect(vigorous.fruits).toEqual([1,3])
  expect(meager.fruits).toEqual([0,2])
  expect(meager.cropFailure).toBe(10)
  expect(fruitCount(meager,0.099)).toBe(0)
  expect(fruitCount(meager,0.1)).toBe(1)
  expect(fruitCount(meager,0.65)).toBe(2)
  expect(compatible({...positive,minus:negative.minus})).toBe(false)
  const stream={rng:9162}
  const outcomes=Array.from({length:128},()=>inherit(positive,negative,()=>nextRandom(stream),'strawberry'))
  expect(outcomes.some(profile=>profile.minus==='unfruitful')).toBe(true)
  expect(outcomes.every(profile=>validGenome('strawberry',profile))).toBe(true)
})

it('uses one helper work slot for each harvest, cleanup or replant and obeys reserves',()=>{
  const state=initialState(31)
  const plant=plantAt(state,12)
  const harvestPolicy={...defaultPolicy,priority:3,mode:'commercial',replant:{species:'radish',profile:common}} as const
  state.plots[12].policy=harvestPolicy
  state.automation.replant=true
  state.seeds.radish=2
  state.reserves.radish=1
  state.helperLevel=1
  beginObservation(state)
  Object.assign(plant,{mature:true,progress:1,readySince:0})
  expect(workGarden(state)).toContain('HelperHarvested:12')
  expect(plantAt(state,12).lives).toBe(0)
  state.automation.cleanup=false
  expect(workGarden(state)).not.toContain('PlantCleaned:12')
  state.automation.cleanup=true
  expect(workGarden(state)).toContain('PlantCleaned:12')
  expect(state.plots[12].plant).toBeNull()
  expect(workGarden(state)).not.toContain('AutoPlanted:12')
  state.helperLevel=evolution.helperReplantLevel as typeof state.helperLevel
  expect(workGarden(state)).toContain('AutoPlanted:12')
  expect(state.seeds.radish).toBe(1)
  expect(sessionStats(state,60).total).toMatchObject({helperHarvests:1,helperCleanups:1,helperReplants:1,helperUsed:3})
})

it('persists tutorial progress and allows a fresh guide without resetting the garden',()=>{
  const state=initialState(74)
  const snapshot=structuredClone(state)
  expect(commit(state,{type:'tutorialSeen',id:'first-harvest'})).toEqual(['TutorialUpdated'])
  expect(commit(state,{type:'tutorialSeen',id:'first-harvest'})).toEqual([])
  reject(state,{type:'tutorialSeen',id:'<invalid>'},'invalidPolicy')
  commit(state,{type:'skipTutorial'})
  expect(parseSave(JSON.stringify(state))).toEqual(state)
  expect(state.tutorialSeen).toEqual(['first-harvest'])
  expect(commit(state,{type:'restartTutorial'})).toEqual(['TutorialUpdated'])
  expect(state).toEqual(snapshot)
})
