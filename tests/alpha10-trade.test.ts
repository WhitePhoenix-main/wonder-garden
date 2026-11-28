import { expect, it } from 'vitest'
import { initialState } from '../src/game'
import { common } from '../src/game/genetics'
import { harvestSaleValue, readyFruitSalePlan, readyFruitSaleValue } from '../src/game/trade'
import { addLegacyFruit, commit, reject } from './helpers'

it('quotes and sells only ordinary surplus, preserving the order and research inventory',()=>{
  const state=initialState(17)
  state.trading.reserveOrders=true
  state.orders.push({id:state.nextId++,buyer:'merchant',requirements:[{kind:'fruit',species:'radish',count:3}],reward:17})
  for (const count of [7,4,3,2,2]) addLegacyFruit(state,count)
  const [ordinary,rare,pollen,seedBed,protectedBatch]=state.basket
  rare.profile={rarity:'rare',plus:['fruitful'],minus:null}
  pollen.species='strawberry'
  pollen.profile=common
  pollen.pollination={result:'solar_strawberry',recipeId:'solar_strawberry:main',donor:{...common,species:'sunflower'},supporting:[]}
  seedBed.lots[0].origin={plot:12,mode:'seed',specimen:state.nextId++,protected:false}
  protectedBatch.lots[0].origin={plot:13,mode:'manual',specimen:state.nextId++,protected:true}
  const prior=state.coins
  expect(readyFruitSalePlan(state)).toEqual([{batch:ordinary,count:4}])
  expect(readyFruitSaleValue(state)).toBe(harvestSaleValue(ordinary,4,state))
  expect(commit(state,{type:'sellReadyFruit'})).toContain('Sold')
  expect(state.coins-prior).toBe(12)
  expect(state.basket.map(batch=>batch.count)).toEqual([3,4,3,2,2])
  expect(commit(state,{type:'sellReadyFruit'})).toEqual([])
})

it('rolls back a group sale that reaches fruit or seeds marked for an order',()=>{
  const state=initialState(17)
  state.trading.reserveOrders=true
  state.seeds.radish=8
  addLegacyFruit(state,7)
  const id=state.basket[0].id
  state.orders.push({id:state.nextId++,buyer:'merchant',requirements:[
    {kind:'fruit',species:'radish',count:3},{kind:'seed',species:'radish',count:2}
  ],reward:17})
  reject(state,{type:'bulk',commands:[
    {type:'sellHarvest',id,count:4},{type:'sellSeeds',species:'radish',profile:common,count:7}
  ]},'orderReserved')
  reject(state,{type:'bulk',commands:[{type:'sellHarvest',id,count:5}]},'orderReserved')
  expect(commit(state,{type:'bulk',commands:[
    {type:'sellHarvest',id,count:4},{type:'sellSeeds',species:'radish',profile:common,count:6}
  ]})).toContain('Sold')
  expect(state.basket[0].count).toBe(3)
  expect(state.seeds.radish).toBe(2)
})
