import { expect,it } from 'vitest'
import { advance, initialState, speciesInfo } from '../src/game'
import { chance, experiments, pollinationFor, secondsLeft } from '../src/game/queries'
import { balance } from '../src/game/config'
import { common, rules } from '../src/game/genetics'
import { parseSave } from '../src/persistence/migration'
import type { Command,Hybrid,Species } from '../src/game/model'
import { commit,cross,earn,wait } from './helpers'

it.each([17,42,2026])('completes all 12 species and 16 beds through public commands, sequence %i',seed=>{
  let s=initialState(seed)
  wait(s,speciesInfo.radish.cycleSec)
  commit(s,{type:'harvest',plot:12})
  const firstHarvest=s.playTime
  const firstBatch=s.basket[0]
  commit(s,{type:'extractSeeds',id:firstBatch.id,count:1})
  commit(s,{type:'plant',species:'radish',plot:12,stock:common})
  commit(s,{type:'sell'})
  function pay(command:Command,cost:number){earn(s,cost);commit(s,command)}
  function open(plot:number){
    if(!s.plots[plot].open)pay({type:'clear',plot},balance.expansionCosts[s.plots.filter(b=>b.open).length-4])
  }
  function stock(species:Species){
    return s.seeds[species] ? common : s.variants.find(pack=>pack.species===species)
  }
  function plant(plot:number,species:Species){
    open(plot)
    pay({type:'plant',plot,species,stock:stock(species)},stock(species) ? 0 : speciesInfo[species].seedPrice??0)
  }
  function discover(plot:number,result:Hybrid){
    const captured=pollinationFor(s,plot)
    if (captured && captured.result!==result) {
      advance(s,secondsLeft(s,plot))
      cross(s,plot,captured.result)
    }
    for(let i=0;i<=rules.pity && !stock(result);i++){
      const p=s.plots[plot].plant!
      advance(s,secondsLeft(s,plot))
      cross(s,plot,result)
      if(!s.plots[plot].plant)plant(plot,p.species)
    }
    expect(stock(result)).toBeDefined()
  }
  plant(8,'strawberry');plant(9,'sunflower')
  discover(8,'solar_strawberry')
  const first=s.playTime
  plant(14,'solar_strawberry');plant(5,'blueberry');plant(4,'moonflower');plant(10,'clover')
  discover(8,'moonberry');discover(5,'golden_flower');discover(10,'honey_clover')
  plant(6,'moonberry');plant(7,'golden_flower');plant(11,'honey_clover')
  expect(experiments(s,6)).toEqual([])
  pay({type:'upgrade',plot:6},250);discover(6,'crystal_flower')
  plant(15,'crystal_flower');pay({type:'upgrade',plot:15},250)
  expect(experiments(s,15)).toEqual([])
  pay({type:'upgrade',plot:15},750)
  const [a,b]=experiments(s,15)
  expect(a.donorId).not.toBe(b.donorId)
  commit(s,{type:'move',from:14,to:12})
  expect(pollinationFor(s,15)).toBeNull()
  commit(s,{type:'move',from:12,to:14})
  const restored=parseSave(JSON.stringify(s))
  expect(restored).toEqual(s);s=restored as typeof s
  discover(15,'star_orchid');plant(0,'star_orchid')
  for(const plot of [1,2,3])open(plot)
  expect(s.planted).toHaveLength(12);expect(s.plots.every(p=>p.open)).toBe(true)
  expect(parseSave(JSON.stringify(s))).toEqual(s)
  console.log({seed,firstHarvest,firstHybrid:first,completion:s.playTime})
})

it('keeps failures across reload and relocation and guarantees the fifth extraction attempt',()=>{
  const s=initialState(1);s.coins=2000
  for(const [plot,species] of [[8,'strawberry'],[9,'sunflower']] as const)commit(s,{type:'plant',plot,species})
  advance(s,12);cross(s,8,'solar_strawberry')
  for(let i=0;i<rules.pity;i++){
    advance(s,12);commit(s,{type:'harvest',plot:8})
    const batch=s.basket[0]
    // The first sample from 1000 is ~.624, above the normal .3 success chance.
    s.rng=1000
    expect(commit(s,{type:'extractSeeds',id:batch.id,count:batch.count})).toContain('ExperimentFailed')
    expect(s.failures.solar_strawberry).toBe(i+1)
  }
  commit(s,{type:'plant',plot:8,species:'strawberry',stock:common})
  commit(s,{type:'move',from:8,to:9})
  const copy=parseSave(JSON.stringify(s)) as typeof s
  expect(chance(copy,'solar_strawberry')).toBe(1)
  advance(copy,12);cross(copy,9,'solar_strawberry')
  expect(copy.failures.solar_strawberry).toBe(0)
  expect(chance(copy,'solar_strawberry')).toBe(rules.success)
})
