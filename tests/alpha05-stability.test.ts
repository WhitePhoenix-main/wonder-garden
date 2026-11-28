import { expect,it } from 'vitest'
import { advance, initialState } from '../src/game'
import { common } from '../src/game/genetics'
import type { HarvestBatch } from '../src/game/model'
import { orderQuote } from '../src/game/orders'
import { defaultPolicy } from '../src/game/stock-policy'
import { commit, reject } from './helpers'

it('keeps seed production running when excess seed and fruit sales are enabled',()=>{
  const state=initialState(42)
  state.sold=true
  state.coins=30000
  state.plots.forEach(plot=>{plot.open=true})
  for (const target of [1,2,3,4,5] as const) commit(state,{type:'upgradeHelper',target})
  commit(state,{type:'buyAutoSell'})
  commit(state,{type:'upgradeStall',target:3})
  commit(state,{type:'setReserve',species:'radish',count:8})
  commit(state,{type:'setAutomation',settings:{...state.automation,replant:true,sellSeeds:true}})
  for (let plot=0;plot<12;plot++) {
    commit(state,{type:'plant',plot,species:'radish'})
    commit(state,{type:'plotPolicy',plot,policy:{...defaultPolicy,mode:'seed',target:2,
      replant:{species:'radish',profile:common}}})
  }
  const first=advance(state,300).filter(event=>event.startsWith('HelperHarvested:')).length
  const coins=state.coins
  const second=advance(state,300).filter(event=>event.startsWith('HelperHarvested:')).length
  expect(first).toBeGreaterThan(400)
  expect(second).toBeGreaterThan(400)
  expect(state.coins).toBeGreaterThan(coins)
  expect(state.seeds.radish).toBeGreaterThanOrEqual(8)
})

it('leaves a viable source when an order would consume the last hybrid batches',()=>{
  const state=initialState(42)
  state.planted.push('solar_strawberry')
  const batch=():HarvestBatch=>({
    id:state.nextId++,species:'solar_strawberry',count:2,valueUnits:140000,profile:common,pollination:null,
    lots:[{size:2,remaining:2,seedYield:1,copyChance:0,copyPending:false,crossPending:false}]
  })
  state.basket.push(batch(),batch())
  const order={
    id:state.nextId++,buyer:'florist' as const,reward:100,
    requirements:[{kind:'fruit' as const,species:'solar_strawberry' as const,count:4}]
  }
  state.orders.push(order)
  expect(orderQuote(state,order)).toMatchObject({complete:false,lines:[{available:2}]})
  reject(state,{type:'fulfillOrder',id:order.id},'orderResources')
})

it('does not count an exhausted seed quota as a source of another hybrid seed',()=>{
  const state=initialState(42)
  state.seeds.solar_strawberry=1
  state.basket.push({
    id:state.nextId++,species:'solar_strawberry',count:1,valueUnits:140000,profile:common,pollination:null,
    lots:[{size:2,remaining:1,seedYield:1,copyChance:0,copyPending:false,crossPending:false}]
  })
  reject(state,{type:'sellSeeds',species:'solar_strawberry',profile:common,count:1},'lastProfile')
})
