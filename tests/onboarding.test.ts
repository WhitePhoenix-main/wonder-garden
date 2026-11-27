import { expect, it } from 'vitest'
import { initialState } from '../src/game'
import { gardenHint } from '../src/ui/onboarding'
import { commit, earn, wait } from './helpers'

it('guides the first sale, parent placement, recipe progress and planting in a full starting garden', () => {
  const state = initialState()
  expect(gardenHint(state)).toMatch(/созревший редис/)
  wait(state,6)
  commit(state,{type:'harvest',plot:12})
  expect(gardenHint(state)).toMatch(/Продать/)
  commit(state,{type:'sell'})
  expect(gardenHint(state)).toMatch(/60/)
  earn(state,150)
  commit(state,{type:'plant',species:'strawberry',plot:8})
  expect(gardenHint(state)).toMatch(/сбоку от клубники/)
  commit(state,{type:'plant',species:'sunflower',plot:9})
  commit(state,{type:'move',from:9,to:13})
  expect(gardenHint(state)).toMatch(/Стройке.*соседних по стороне/)
  commit(state,{type:'move',from:13,to:9})
  expect(gardenHint(state)).toMatch(/0\/3/)
  for (let count=1;count<=3;count++) {
    wait(state,12)
    commit(state,{type:'harvest',plot:8})
    if (count < 3) expect(gardenHint(state)).toContain(`${count}/3`)
  }
  expect(gardenHint(state)).toMatch(/Солнечная клубника.*замените/)
  commit(state,{type:'plant',species:'solar_strawberry',plot:12,replaceId:state.plots[12].plant!.id})
  expect(gardenHint(state)).toMatch(/уголок сада/)
})

it('points to the shovel when all open plots are full and replacement is still locked', () => {
  const state = initialState()
  for (const plot of [8,9]) commit(state,{type:'plant',species:'radish',plot})
  earn(state,120)
  expect(gardenHint(state)).toMatch(/лопатой/)
  commit(state,{type:'language',lang:'en'})
  expect(gardenHint(state)).toMatch(/shovel/)
})
