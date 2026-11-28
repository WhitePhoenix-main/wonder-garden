import { recipes, hybridCounts, speciesInfo } from '../src/game/config'
import type { Hybrid } from '../src/game/model'
import { expect } from 'vitest'
import type { Command, GameState, Plant } from '../src/game/model'
import { advance, execute } from '../src/game'

type Harvest=Extract<Command,{type:'harvest'}>
type Input=Exclude<Command,Harvest>|(Omit<Harvest,'expectedId'|'cycle'>&Partial<Pick<Harvest,'expectedId'|'cycle'>>)
function prepare(state:GameState,input:Input):Command{
  if(input.type!=='harvest')return input
  const plant=state.plots[input.plot]?.plant
  return {expectedId:plant?.id??-1,cycle:plant?.lives??0,...input}
}
export function commit(state: GameState, command: Input): string[] {
  const result = execute(state, prepare(state,command))
  if (!result.ok) throw new Error(`${JSON.stringify(command)} failed: ${result.reason}`)
  return result.events
}

export function reject(state: GameState, command: Input, reason: string): void {
  const before = structuredClone(state)
  expect(execute(state, prepare(state,command))).toEqual({ ok: false, reason })
  expect(state).toEqual(before)
}

export function wait(state: GameState, seconds: number): void {
  for (let step = 0; step < Math.round(seconds * 10); step++) advance(state, 0.1)
}

export function plantAt(state: GameState, plot: number): Plant {
  const plant = state.plots[plot].plant
  if (!plant) throw new Error(`Expected a plant at plot ${plot}`)
  return plant
}

export function cleanBed(state:GameState,plot:number) {
  commit(state,{type:'cleanup',plot,expectedId:plantAt(state,plot).id})
}

export function prepareFirstResearch(state:GameState) {
  if (!state.plots[4].open) commit(state,{type:'clear',plot:4})
  if (!state.plots[5].open) commit(state,{type:'clear',plot:5})
  if (!state.planted.includes('blueberry')) commit(state,{type:'plant',plot:5,species:'blueberry'})
}

export function cross(state:GameState,plot:number,result:Hybrid) {
  commit(state,{type:'harvest',plot})
  const batch=state.basket.find(b=>b.pollination?.result===result)
  if(!batch)throw Error('Missing pollinated harvest '+result)
  return commit(state,{type:'extractSeeds',id:batch.id,count:batch.count})
}
export function legacySix(state:GameState) {
  const {variants,failures,rng,revealed,...rest}=structuredClone(state)
  const plant=(p:Plant)=>({id:p.id,species:p.species,progress:p.progress,mature:p.mature,readySince:p.readySince,propagation:0})
  return {...rest,schemaVersion:6,balanceVersion:1,basket:rest.basket.flatMap(b=>Array.from({length:b.count},()=>({species:b.species,valueUnits:b.valueUnits}))),
    recipeProgress:Object.fromEntries(recipes.map(r=>[r.result,revealed.includes(r.result)?r.harvests:0])),seeds:Object.fromEntries(Object.keys(hybridCounts()).map(id=>[id,state.seeds[id as Hybrid]])),
    plots:rest.plots.map(b=>({...b,plant:b.plant && plant(b.plant)})),nursery:rest.nursery.map(plant)}
}

export function earn(state: GameState, target: number): void {
  for (let cycle = 0; cycle < 1400 && state.coins < target; cycle++) {
    for (const [plot,{plant}] of state.plots.entries()) {
      if (plant?.species==='radish' && !plant.lives) commit(state,{type:'cleanup',plot,expectedId:plant.id})
    }
    let plots=state.plots.flatMap((p,plot)=>p.plant?.species==='radish' && p.plant.lives ? [plot] : [])
    if (!plots.length) {
      const plot=state.plots.findIndex(b=>b.open && !b.plant)
      if (plot<0) throw Error('No space for a radish')
      commit(state,{type:'plant',plot,species:'radish'})
      plots=[plot]
    }
    advance(state,speciesInfo.radish.cycleSec)
    for (const plot of plots) {
      const plant=state.plots[plot].plant
      if (!plant?.lives || plant.readySince===null) continue
      commit(state,{type:'harvest',plot})
      commit(state,{type:'cleanup',plot,expectedId:plant.id})
      commit(state,{type:'sell'})
      commit(state,{type:'plant',plot,species:'radish'})
    }
  }
  expect(state.coins).toBeGreaterThanOrEqual(target)
}

export function addLegacyFruit(state:GameState,count:number,valueUnits=30000) {
  state.basket.push({id:state.nextId++,species:'radish',valueUnits,count,profile:null,pollination:null,
    lots:[{size:count,remaining:count,seedYield:0,copyChance:0,copyPending:false,crossPending:false}]})
}

export function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() { return entries.size },
    clear: () => entries.clear(),
    getItem: key => entries.get(key) ?? null,
    key: index => [...entries.keys()][index] ?? null,
    removeItem: key => { entries.delete(key) },
    setItem: (key, value) => { entries.set(key, value) }
  }
}
