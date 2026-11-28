import { expect, it } from 'vitest'
import { advance, initialState, speciesInfo } from '../src/game'
import { common } from '../src/game/genetics'
import { canRecoverGarden } from '../src/game/queries'
import { cleanBed, commit, reject } from './helpers'

it('starts empty with two normal radish seeds and spends one on the first planting', () => {
  const state = initialState(42)
  expect(state.coins).toBe(20)
  expect(state.plots.map((plot,index)=>plot.open ? index : -1).filter(index=>index>=0)).toEqual([8,9,12,13])
  expect(state.plots.every(plot=>!plot.plant)).toBe(true)
  expect(state.planted).toEqual([])
  expect(state.collection).toEqual([])
  expect(Object.values(state.seeds).reduce((sum,count)=>sum+count,0)).toBe(2)
  expect(state.seeds.radish).toBe(2)
  expect(state.greenhouseLevel).toBe(1)
  expect(state.helperLevel).toBe(0)
  expect(state.rng).toBe(42)
  commit(state,{type:'plant',plot:12,species:'radish',stock:common})
  expect(state.planted).toEqual(['radish'])
  expect(state.seeds.radish).toBe(1)
  expect(state.coins).toBe(20)
  expect(state.firstSeedPlanting).toBe(true)
})

it('recovers after clearing a garden that had no living plants or renewable stock', () => {
  const state=initialState(17)
  const price=speciesInfo.radish.seedPrice!
  commit(state,{type:'plant',plot:12,species:'radish',stock:common})
  reject(state,{type:'emergencyRadish',plot:13},'recoveryUnavailable')
  advance(state,speciesInfo.radish.cycleSec)
  commit(state,{type:'harvest',plot:12})
  commit(state,{type:'sell'})
  cleanBed(state,12)
  commit(state,{type:'plant',plot:12,species:'radish',stock:common})
  commit(state,{type:'compost',plot:12,expectedId:state.plots[12].plant!.id})
  while (state.coins>=price) {
    commit(state,{type:'plant',plot:12,species:'radish'})
    commit(state,{type:'compost',plot:12,expectedId:state.plots[12].plant!.id})
  }
  expect(canRecoverGarden(state)).toBe(true)
  commit(state,{type:'emergencyRadish',plot:12})
  reject(state,{type:'emergencyRadish',plot:13},'recoveryUnavailable')
  advance(state,speciesInfo.radish.cycleSec)
  commit(state,{type:'harvest',plot:12})
  commit(state,{type:'sell'})
  expect(state.coins).toBeGreaterThanOrEqual(price)
})
