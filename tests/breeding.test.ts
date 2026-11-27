import { expect,it } from 'vitest'
import { advance, initialState, speciesInfo } from '../src/game'
import { chance, experiments, secondsLeft } from '../src/game/queries'
import { rules } from '../src/game/genetics'
import { parseSave } from '../src/persistence/migration'
import type { Command,Hybrid,Species } from '../src/game/model'
import { commit,cross,reject } from './helpers'

it.each([17,42,2026])('completes a legal garden with common parents, sequence %i',seed=>{
  let s=initialState(seed),renewals=0,firstRenewal=0
  // Sell ripe fruit across the island and reserve enough seeds to renew each producer.
  function earn(amount:number){
    while(s.coins<amount){
      advance(s,6)
      for(const [plot,bed] of s.plots.entries()){
        const plant=bed.plant
        if(!plant || plant.readySince===null)continue
        commit(s,{type:'harvest',plot,seeds:plant.lives===1 && !s.seeds[plant.species]})
        commit(s,{type:'sell'})
        if(!s.plots[plot].plant){
          commit(s,{type:'plant',species:plant.species,plot,stock:common})
          renewals++;firstRenewal ||= s.playTime
        }
      }
    }
  }
  function pay(command:Command,cost:number){earn(cost);commit(s,command)}
  function open(plot:number){
    if(!s.plots[plot].open)pay({type:'clear',plot},balance.expansionCosts[s.plots.filter(b=>b.open).length-4])
  }
  function plant(plot:number,species:Species){
    open(plot);pay({type:'plant',plot,species},speciesInfo[species].seedPrice??0)
  }
  function discover(plot:number,result:Hybrid){
    for(let i=0;i<100 && !s.seeds[result];i++){
      const p=s.plots[plot].plant!
      if(p.lives===1 && !s.seeds[p.species]){
        advance(s,secondsLeft(s,plot));commit(s,{type:'harvest',plot,seeds:true})
      }else{
        advance(s,secondsLeft(s,plot));cross(s,plot,result)
      }
      if(!s.plots[plot].plant)commit(s,{type:'plant',species:p.species,plot,stock:common})
    }
    expect(s.seeds[result]).toBeGreaterThan(0)
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
  commit(s,{type:'move',from:14,to:12});advance(s,40)
  reject(s,{type:'harvest',plot:15,expectedId:s.plots[15].plant!.id,seeds:true,experiment:a},'stalePlant')
  commit(s,{type:'move',from:12,to:14})
  const restored=parseSave(JSON.stringify(s))
  expect(restored).toEqual(s);s=restored as typeof s
  discover(15,'star_orchid');plant(0,'star_orchid')
  for(const plot of [1,2,3])open(plot)
  expect(s.planted).toHaveLength(12);expect(s.plots.every(p=>p.open)).toBe(true)
  expect(parseSave(JSON.stringify(s))).toEqual(s)
  console.log({seed,first,firstRenewal,renewals,completion:s.playTime})
})
import { balance } from '../src/game/config'
import { common } from '../src/game/genetics'

it('keeps failures across reload and relocation and guarantees the fifth selected cross',()=>{
  const s=initialState(1);s.coins=2000
  for(const [plot,species] of [[8,'strawberry'],[9,'sunflower']] as const)commit(s,{type:'plant',plot,species})
  advance(s,12);cross(s,8,'solar_strawberry')
  for(let i=0;i<4;i++){
    // This sequence gives a failed experiment after the ordinary quantity roll.
    s.rng=1;advance(s,12)
    expect(cross(s,8,'solar_strawberry')).toContain('ExperimentFailed')
    expect(s.failures.solar_strawberry).toBe(i+1)
  }
  commit(s,{type:'move',from:8,to:9})
  const copy=parseSave(JSON.stringify(s)) as typeof s
  expect(chance(copy,'solar_strawberry')).toBe(1)
  advance(copy,12);cross(copy,9,'solar_strawberry')
  expect(copy.failures.solar_strawberry).toBe(0)
  expect(chance(copy,'solar_strawberry')).toBe(rules.success)
})