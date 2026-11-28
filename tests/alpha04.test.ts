import { describe, expect, it } from 'vitest'
import alpha03 from './fixtures/alpha03.json'
import { advance, basketCount, execute, initialState, speciesIds, speciesInfo } from '../src/game'
import { common, inherit, maxLives, rules, traits } from '../src/game/genetics'
import type { GameState, Profile } from '../src/game/model'
import { extractionYield, harvestSaleValue, seedSaleValue } from '../src/game/trade'
import { parseSave } from '../src/persistence/migration'
import { validState } from '../src/persistence/validation'
import { addLegacyFruit, commit, plantAt, reject } from './helpers'

const rareHardy:Profile = {rarity:'rare',plus:'hardy',minus:null}
const fragile:Profile = {rarity:'common',plus:null,minus:'fragile'}

function reload(state:GameState):GameState {
  const restored=parseSave(JSON.stringify(state))
  if (!restored || restored==='future') throw Error('Expected a valid current snapshot')
  expect(restored).toEqual(state)
  return restored
}

describe('Alpha-4 harvest and inventory',()=>{
  it('regrows for the shorter cycle, loses no lives waiting and empties on the last harvest',()=>{
    const state=initialState(44)
    state.coins=speciesInfo.strawberry.seedPrice!
    commit(state,{type:'plant',plot:8,species:'strawberry'})
    const bed=state.plots[8], plant=plantAt(state,8), info=speciesInfo.strawberry
    advance(state,info.cycleSec+60)
    expect(plant.lives).toBe(info.lives)
    for(let cycle=0;cycle<info.lives;cycle++){
      commit(state,{type:'harvest',plot:8})
      if(cycle===info.lives-1) break
      expect(bed.plant).toMatchObject({id:plant.id,lives:info.lives-cycle-1,progress:0,readySince:null})
      advance(state,info.regrowSec-0.1)
      reject(state,{type:'harvest',plot:8},'notReady')
      advance(state,0.1)
    }
    expect(bed.plant).toBeNull()
    expect(state.coins).toBe(0)
    expect(state.basket).toHaveLength(1)
    expect(state.basket[0].lots).toHaveLength(info.lives)
  })

  it('ignores lifespan genetics on single species and keeps the same traits active on multi species',()=>{
    for(const species of speciesIds){
      const info=speciesInfo[species]
      if(info.lifecycle==='single'){
        expect(maxLives(species,rareHardy)).toBe(1)
        expect(maxLives(species,fragile)).toBe(1)
        for(let i=0;i<100;i++){
          const offspring=inherit(rareHardy,fragile,()=>i/100,species)
          expect(traits(offspring)).not.toContain('hardy')
          expect(offspring.minus).not.toBe('fragile')
        }
      }else{
        expect(maxLives(species,rareHardy)).toBe(info.lives+rules.hardy[1])
        expect(maxLives(species,fragile)).toBe(info.lives-rules.fragile)
      }
    }
  })

  it('groups like crops, keeps a second genome separate and trades against stock atomically',()=>{
    const state=initialState(37)
    const rare:Profile={rarity:'rare',plus:['seedy'],minus:'sparse'}
    state.variants.push({species:'radish',count:1,...rare})
    commit(state,{type:'plant',plot:8,species:'radish',stock:rare})
    expect(state.variants).toEqual([])
    advance(state,speciesInfo.radish.cycleSec)
    for(const plot of [8,12,13]) commit(state,{type:'harvest',plot})
    expect(state.basket).toHaveLength(2)
    const [variant,ordinary]=state.basket
    expect(variant.profile).toEqual(rare)
    expect(ordinary.profile).toEqual(common)
    expect(ordinary.lots).toHaveLength(2)
    expect(variant.lots).toHaveLength(1)
    const coins=state.coins
    for(const count of [-1,0,1.5,ordinary.count+1]) {
      reject(state,{type:'sellHarvest',id:ordinary.id,count},'invalidQuantity')
      reject(state,{type:'extractSeeds',id:ordinary.id,count},'invalidQuantity')
    }
    const returnValue=harvestSaleValue(ordinary,ordinary.count)
    commit(state,{type:'sellHarvest',id:ordinary.id,count:ordinary.count})
    expect(state.coins).toBe(coins+returnValue)
    reject(state,{type:'extractSeeds',id:ordinary.id,count:1},'itemChanged')
    const quote=extractionYield(variant)
    const result=execute(state,{type:'extractSeeds',id:variant.id,count:variant.count})
    expect(result.ok && result.obtained?.reduce((sum,pack)=>sum+pack.count,0)).toBe(quote.seeds)
    expect(basketCount(state)).toBe(0)
    const count=state.seeds.radish
    reject(state,{type:'sellSeeds',species:'radish',profile:common,count:count+1},'invalidQuantity')
    if(count>0) commit(state,{type:'sellSeeds',species:'radish',profile:common,count})
    expect(state.coins).toBe(coins+returnValue+count*seedSaleValue('radish',common))
    expect(state.seeds.radish).toBe(0)
  })

  it('pays the same rounded value for one full sale and valid partial sales across reload',()=>{
    const state=initialState(33)
    addLegacyFruit(state,4,13333)
    const all=structuredClone(state), {id}=state.basket[0]
    commit(all,{type:'sellHarvest',id,count:4})
    commit(state,{type:'sellHarvest',id,count:1})
    const resumed=reload(state)
    for(let i=0;i<3;i++)commit(resumed,{type:'sellHarvest',id,count:1})
    expect(resumed.coins).toBe(25)
    expect(resumed).toEqual(all)
  })

  it('freezes parents through removal and reload, with one cross roll per harvested lot',()=>{
    const state=initialState(11)
    const donor:Profile={rarity:'rare',plus:['seedy'],minus:'small'}
    state.coins=150
    state.sold=true
    commit(state,{type:'plant',plot:8,species:'strawberry'})
    commit(state,{type:'plant',plot:9,species:'sunflower'})
    Object.assign(plantAt(state,9),donor)
    advance(state,speciesInfo.strawberry.cycleSec)
    const mother=plantAt(state,8)
    expect(mother.pollination?.donor).toEqual({species:'sunflower',...donor})
    const onBed=reload(state)
    commit(onBed,{type:'compost',plot:9,expectedId:plantAt(onBed,9).id})
    commit(onBed,{type:'harvest',plot:8})
    commit(onBed,{type:'compost',plot:8,expectedId:mother.id})
    const before=reload(onBed), bulk=structuredClone(before), {id,count}=before.basket[0]
    expect(before.basket[0].pollination?.donor).toEqual({species:'sunflower',...donor})
    expect(extractionYield(before.basket[0]).attempts).toBe(1)
    const first=execute(before,{type:'extractSeeds',id,count:1})
    expect(first.ok && first.events).toContain('RecipeRevealed:solar_strawberry')
    expect(before.seeds.solar_strawberry).toBe(1)
    const split=reload(before)
    const remaining=split.basket[0].count
    expect(extractionYield(split.basket[0]).attempts).toBe(0)
    if(extractionYield(split.basket[0]).seeds) commit(split,{type:'extractSeeds',id,count:remaining})
    else commit(split,{type:'sellHarvest',id,count:remaining})
    commit(bulk,{type:'extractSeeds',id,count})
    expect(split.seeds).toEqual(bulk.seeds)
    expect(split.variants).toEqual(bulk.variants)
    expect(split.rng).toBe(bulk.rng)
    reject(split,{type:'extractSeeds',id,count:1},'itemChanged')
  })

  it('keeps extraction deterministic when the first processed fruit has no own seed',()=>{
    const state=initialState(1)
    const seedy:Profile={rarity:'rare',plus:['seedy'],minus:null}
    state.coins=1000
    state.sold=true
    commit(state,{type:'plant',plot:8,species:'strawberry'})
    commit(state,{type:'compost',plot:8,expectedId:plantAt(state,8).id})
    commit(state,{type:'plant',plot:8,species:'blueberry'})
    commit(state,{type:'plant',plot:9,species:'moonflower'})
    Object.assign(plantAt(state,8),seedy,{fruitRoll:0.999})
    advance(state,speciesInfo.blueberry.cycleSec)
    state.rng=1
    commit(state,{type:'harvest',plot:8})
    const batch=state.basket[0]
    expect(batch).toMatchObject({count:4,pollination:{result:'golden_flower'},lots:[{seedYield:2}]})
    commit(state,{type:'sellHarvest',id:batch.id,count:1})
    expect(extractionYield(batch,1)).toEqual({seeds:0,attempts:1})
    const bulk=reload(state), split=reload(state)
    commit(bulk,{type:'extractSeeds',id:batch.id,count:3})
    commit(split,{type:'extractSeeds',id:batch.id,count:1})
    commit(split,{type:'extractSeeds',id:batch.id,count:2})
    expect(split).toEqual(bulk)
  })

  it('cannot use ordinary seed sales to reverse the original shop price',()=>{
    for(const species of speciesIds){
      const info=speciesInfo[species]
      if(info.seedPrice!==null) expect(seedSaleValue(species,common)).toBeLessThan(info.seedPrice)
    }
  })

  it('migrates validated d4b0232 data once and keeps progress, lifetimes, prices and genetics',()=>{
    const result=parseSave(JSON.stringify(alpha03))
    if(!result || result==='future') throw Error('Expected migration of Alpha-3 fixture')
    expect(result).toMatchObject({schemaVersion:10,coins:alpha03.coins,
      variants:alpha03.variants.map(pack=>({...pack,plus:pack.plus===null ? [] : [pack.plus]})),
      revealed:alpha03.revealed,seeds:alpha03.seeds,lang:alpha03.lang,rng:alpha03.rng,
      musicMuted:alpha03.musicMuted,tutorialSkipped:alpha03.tutorialSkipped})
    const [batch]=result.basket
    expect(batch).toMatchObject({species:'strawberry',profile:null,pollination:null,count:4,valueUnits:150000})
    reject(result,{type:'extractSeeds',id:batch.id,count:1},'noExtraction')
    expect(result.plots.map(p=>[p.open,p.level])).toEqual(alpha03.plots.map(p=>[p.open,p.level]))
    expect(plantAt(result,12)).toMatchObject({rarity:'rare',plus:['hardy'],lives:1,maxLives:1,pollination:null})
    expect(plantAt(result,8)).toMatchObject({progress:alpha03.plots[8].plant!.progress,lives:2,maxLives:6,
      rarity:'uncommon',plus:['hardy'],pollination:null})
    expect(plantAt(result,9).readySince).toBe(alpha03.plots[9].plant!.readySince)
    expect(reload(result)).toEqual(result)
    expect(validState({...result,basket:[{...batch,count:5}]})).toBe(false)
    expect(validState({...result,basket:[{...batch,id:plantAt(result,8).id}]})).toBe(false)
    expect(validState({...result,basket:[{...batch,lots:[{...batch.lots[0],seedYield:1}]}]})).toBe(false)
  })
})
