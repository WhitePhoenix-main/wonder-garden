import { experiments } from '../src/game/queries'
import { recipes, hybridCounts } from '../src/game/config'
import type { Hybrid } from '../src/game/model'
import { expect } from 'vitest'
import type { Command, GameState, Plant } from '../src/game/model'
import { advance, basketCapacity, execute, saleValue } from '../src/game'

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

export function cross(state:GameState,plot:number,result:Hybrid) {
  const experiment=experiments(state,plot).find(e=>e.result===result)
  if(!experiment)throw Error('Missing experiment '+result)
  return commit(state,{type:'harvest',seeds:true,plot,expectedId:plantAt(state,plot).id,experiment})
}
export function legacySix(state:GameState) {
  const {variants,failures,rng,revealed,...rest}=structuredClone(state)
  const plant=(p:Plant)=>({id:p.id,species:p.species,progress:p.progress,mature:p.mature,readySince:p.readySince,propagation:0})
  return {...rest,schemaVersion:6,recipeProgress:Object.fromEntries(recipes.map(r=>[r.result,revealed.includes(r.result)?r.harvests:0])),seeds:Object.fromEntries(Object.keys(hybridCounts()).map(id=>[id,state.seeds[id as Hybrid]])),
    plots:rest.plots.map(b=>({...b,plant:b.plant && plant(b.plant)})),nursery:rest.nursery.map(plant)}
}

export function earn(state: GameState, target: number): void {
  // Harvest and sell through the public commands, stopping as soon as the target is funded.
  for (let cycle = 0; cycle < 4000 && state.coins < target; cycle++) {
    const renew:number[]=[]
    state.plots.forEach(({ plant }, plot) => {
      if (plant?.species==='radish' && plant.readySince !== null && state.basket.length < basketCapacity(state)
          && state.coins + saleValue(state) < target) {
        if(state.basket.length+2>basketCapacity(state))commit(state,{type:'sell'})
        commit(state, { type: 'harvest', plot,seeds:plant.lives===1 && state.seeds.radish<=renew.length })
        if(!state.plots[plot].plant)renew.push(plot)
      }
    })
    commit(state, { type: 'sell' })
    for(const plot of renew)commit(state,{type:'plant',plot,species:'radish',stock:{rarity:'common',plus:null,minus:null}})
    if (state.coins < target) wait(state, 6)
  }
  expect(state.coins).toBeGreaterThanOrEqual(target)
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
