import { expect, it } from 'vitest'
import alpha08 from './fixtures/alpha08.json'
import { advance, basketCapacity, basketCount, donorCandidates, gardenBatchTargets, initialState } from '../src/game'
import { productionStatus, workGarden } from '../src/game/automation'
import { breedingRecipes, speciesIds } from '../src/game/config'
import { common } from '../src/game/genetics'
import type { GameState, Profile } from '../src/game/model'
import { pollinationFor } from '../src/game/queries'
import { newPlant } from '../src/game/state'
import { parseSave } from '../src/persistence/migration'
import { validAlphaNine } from '../src/persistence/validation'
import { addLegacyFruit, commit, plantAt, reject } from './helpers'

const rare:Profile={rarity:'rare',plus:['fruitful'],minus:null}

function reload(state:GameState) {
  const restored=parseSave(JSON.stringify(state))
  if (!restored || restored==='future') throw Error('Expected a readable current save')
  expect(restored).toEqual(state)
  return restored
}

it('gathers ready plants once, skips protected beds, and fits later crops if an earlier one is too large',()=>{
  const state=initialState(17)
  state.coins=100
  for (const plot of [8,9,12]) commit(state,{type:'plant',plot,species:'radish'})
  advance(state,7)
  Object.assign(plantAt(state,8),{fruitRoll:0.999,readySince:5})
  Object.assign(plantAt(state,12),{fruitRoll:0,readySince:6})
  commit(state,{type:'protectPlant',id:plantAt(state,9).id,enabled:true})
  commit(state,{type:'plant',plot:13,species:'radish'})
  addLegacyFruit(state,basketCapacity(state)-2)
  expect(gardenBatchTargets(state,'green','harvest')).toEqual([8,12])
  expect(gardenBatchTargets(state,'valley','harvest')).toEqual([])
  expect(commit(state,{type:'gatherReady',island:'green'})).toContain('Harvested:12:radish:2')
  expect(basketCount(state)).toBe(basketCapacity(state))
  expect(plantAt(state,8).lives).toBe(1)
  expect(plantAt(state,9).lives).toBe(1)
  expect(plantAt(state,12).lives).toBe(0)
  expect(plantAt(state,13).readySince).toBeNull()
  reject(state,{type:'gatherReady',island:'green'},'basketFull')
})

it('leaves a support bed for its aura and preserves individual protection until deliberate cleanup',()=>{
  let state=initialState(42)
  state.coins=100
  for (const plot of [8,9,12,13]) commit(state,{type:'plant',plot,species:'radish'})
  state.plots[13].policy={mode:'support',priority:0,harvest:false,replant:null,target:2}
  const protectedPlant=plantAt(state,9).id
  commit(state,{type:'protectPlant',id:protectedPlant,enabled:true})
  advance(state,10)
  expect(gardenBatchTargets(state,'green','harvest')).toEqual([8,12])
  commit(state,{type:'gatherReady',island:'green'})
  commit(state,{type:'harvest',plot:9})
  expect(state.protectedPlants).toContain(protectedPlant)
  state=reload(state)
  expect(gardenBatchTargets(state,'green','cleanup')).toEqual([8,12])
  expect(commit(state,{type:'clearWithered',island:'green'})).toEqual([
    'PlantCleaned','PlantCleaned:8','PlantCleaned','PlantCleaned:12'
  ])
  expect(plantAt(state,9).lives).toBe(0)
  expect(plantAt(state,13).lives).toBe(1)
  commit(state,{type:'cleanup',plot:9,expectedId:protectedPlant})
  expect(state.protectedPlants).not.toContain(protectedPlant)
  reject(state,{type:'clearWithered',island:'green'},'notDead')
})

it('reuses an explicitly selected seed profile only while unprotected, unreserved stock lasts',()=>{
  const state=initialState(17)
  state.variants.push({species:'radish',...rare,count:3})
  state.reserves.radish=3
  const repeat={type:'repeatPlant',species:'radish',stock:rare} as const
  commit(state,{...repeat,plot:8})
  commit(state,{...repeat,plot:9})
  expect(plantAt(state,8)).toMatchObject(rare)
  expect(plantAt(state,9)).toMatchObject(rare)
  expect(state.coins).toBe(20)
  expect(state.variants[0].count).toBe(1)
  reject(state,{...repeat,plot:12},'seedReserved')
  delete state.reserves.radish
  commit(state,{type:'protectProfile',species:'radish',profile:rare,enabled:true})
  reject(state,{...repeat,plot:13},'seedReserved')
})

it('Leafy preserves all cycles of individually protected plants or profiles after reload',()=>{
  let state=initialState(42)
  state.coins=1000
  state.sold=true
  commit(state,{type:'plant',plot:8,species:'strawberry'})
  commit(state,{type:'plant',plot:9,species:'blueberry'})
  state.variants.push({species:'strawberry',...rare,count:1})
  commit(state,{type:'plant',plot:12,species:'strawberry',stock:rare})
  commit(state,{type:'protectPlant',id:plantAt(state,8).id,enabled:true})
  commit(state,{type:'protectProfile',species:'blueberry',profile:common,enabled:true})
  advance(state,30)
  commit(state,{type:'upgradeHelper',target:1})
  state=reload(state)
  const before=[8,9,12].map(plot=>plantAt(state,plot).lives)
  expect([8,9].map(plot=>productionStatus(state,plot))).toEqual(['protected','protected'])
  const events=workGarden(state)
  expect(events.filter(event=>event.startsWith('HelperHarvested:'))).toEqual(['HelperHarvested:12'])
  expect([8,9,12].map(plot=>plantAt(state,plot).lives)).toEqual([before[0],before[1],before[2]-1])
  expect(commit(state,{type:'harvest',plot:8})).toContain('Harvested')
})

function sunflowerGarden() {
  const state=initialState(2026)
  state.coins=1000
  state.sold=true
  commit(state,{type:'plant',plot:12,species:'radish',stock:common})
  commit(state,{type:'clear',plot:4})
  commit(state,{type:'clear',plot:5})
  commit(state,{type:'plant',plot:8,species:'strawberry'})
  commit(state,{type:'plant',plot:13,species:'blueberry'})
  commit(state,{type:'plant',plot:4,species:'sunflower'})
  state.variants.push({species:'sunflower',...rare,count:1})
  commit(state,{type:'plant',plot:9,species:'sunflower',stock:rare})
  return state
}

it('selects a specific neighbor, keeps the frozen genome after changes, and falls back when a preferred donor moves away',()=>{
  let state=sunflowerGarden()
  const donor=plantAt(state,9)
  const ordinary=plantAt(state,4)
  const command={type:'researchDonor',plot:8,expectedId:plantAt(state,8).id,recipeId:'solar_strawberry:main',donor:'sunflower'} as const
  expect(donorCandidates(state,8,command.recipeId)[0].candidates.map(entry=>entry.plot)).toEqual([4,9])
  expect(pollinationFor(state,8)?.donorIds).toEqual([ordinary.id])
  reject(state,{...command,donorId:plantAt(state,13).id},'researchUnavailable')
  expect(commit(state,{...command,donorId:donor.id})).toEqual(['ResearchDonorChanged'])
  advance(state,15)
  expect(plantAt(state,8).pollination).toMatchObject({donorIds:[donor.id],donor:rare})
  commit(state,{...command,donorId:ordinary.id})
  expect(plantAt(state,8).pollination).toMatchObject({donorIds:[donor.id],donor:rare})
  state=reload(state)
  commit(state,{type:'move',from:4,to:5})
  commit(state,{type:'harvest',plot:8})
  expect(state.basket[0].pollination).toMatchObject({donorIds:[donor.id],donor:rare})
  expect(pollinationFor(state,8)).toMatchObject({donorIds:[donor.id],donor:rare})
  state=reload(state)
  expect(plantAt(state,8).researchDonors).toEqual({sunflower:ordinary.id})
})

it('keeps the captured donor through wilting and chooses a living source in the next cycle',()=>{
  let state=sunflowerGarden()
  const donor=plantAt(state,9)
  const ordinary=plantAt(state,4)
  commit(state,{type:'researchDonor',plot:8,expectedId:plantAt(state,8).id,recipeId:'solar_strawberry:main',
    donor:'sunflower',donorId:donor.id})
  advance(state,15)
  commit(state,{type:'harvest',plot:9})
  commit(state,{type:'cleanup',plot:9,expectedId:donor.id})
  state=reload(state)
  expect(plantAt(state,8).pollination?.donorIds).toEqual([donor.id])
  commit(state,{type:'harvest',plot:8})
  expect(pollinationFor(state,8)?.donorIds).toEqual([ordinary.id])
})

it('can select each donor for a multiple-donor recipe in the configured order',()=>{
  const state=initialState(42)
  state.planted=speciesIds.filter(species=>species!=='star_orchid')
  state.revealed=breedingRecipes.map(recipe=>recipe.result).filter((species,i,array)=>species!=='star_orchid' && array.indexOf(species)===i)
  state.greenhouseLevel=3
  for (const plot of state.plots) plot.open=true
  const p=(plot:number,species:Parameters<typeof newPlant>[1],profile=common)=>{
    const plant=newPlant(state.nextId++,species,profile)
    state.plots[plot].plant=plant
    return plant
  }
  const mother=p(5,'crystal_flower')
  state.plots[5].level=3
  p(1,'solar_strawberry')
  const chosenSolar=p(4,'solar_strawberry',rare)
  p(6,'honey_clover')
  const chosenHoney=p(9,'honey_clover',rare)
  for (const donor of [chosenSolar,chosenHoney]) commit(state,{type:'researchDonor',plot:5,expectedId:mother.id,
    recipeId:'star_orchid:main',donor:donor.species,donorId:donor.id})
  advance(state,0.1)
  expect(mother.pollination).toMatchObject({donorIds:[chosenSolar.id,chosenHoney.id],result:'star_orchid',
    donor:{species:'solar_strawberry',...rare}, supporting:[{species:'honey_clover',...rare}]})
})

it('migrates schema 13 without advancing either guarantee, touching the clock, or granting starter resources',()=>{
  const parsed=parseSave(JSON.stringify(alpha08))
  if (!parsed || parsed==='future') throw Error('Expected a prior garden')
  const old={...parsed,schemaVersion:13 as const}
  expect(validAlphaNine(old)).toBe(true)
  expect(parseSave(JSON.stringify(old))).toEqual(parsed)
  const unopened={...initialState(23),schemaVersion:13 as const}
  expect(validAlphaNine(unopened)).toBe(true)
  expect(parseSave(JSON.stringify(unopened))).toEqual({...unopened,schemaVersion:14})
})
