import { expect,it } from 'vitest'
import { advance, basketCapacity } from '../src/game'
import { autoSellGarden, productionStatus, saleStatus } from '../src/game/automation'
import { evolution, market } from '../src/game/config'
import { common, profileKey } from '../src/game/genetics'
import { orderQuote, refreshOrders } from '../src/game/orders'
import { harvestSaleValue, seedSaleValue } from '../src/game/pricing'
import { marketQuote } from '../src/game/market'
import { marketPanel } from '../src/ui/panels/market'
import { gardenWithStarterPlants, addLegacyFruit, commit, reject } from './helpers'

function advancedStall() {
  const state=gardenWithStarterPlants(42)
  state.coins=25_000
  state.sold=true
  commit(state,{type:'upgradeHelper',target:1})
  for (const target of [2,3,4]) commit(state,{type:'upgradeStall',target})
  commit(state,{type:'setAutomation',settings:{...state.automation,enabled:false,sellSeeds:true}})
  return state
}

it('uses the quote threshold for both channels while overflow applies only to fruit',()=>{
  const state=advancedStall()
  commit(state,{type:'setTrading',settings:{...state.trading,strategy:'profit'}})
  state.seeds.radish=8
  addLegacyFruit(state,1)
  expect(saleStatus(state)).toBe('price')
  expect(advance(state,state.sellRemaining)).not.toContain('Sold')
  const settings={...state.trading}
  addLegacyFruit(state,Math.ceil(basketCapacity(state)*market.strategy.overflowPercent/100)-1)
  expect(advance(state,state.sellRemaining)).toContain('Sold')
  expect(state.basket).toHaveLength(0)
  expect(state.seeds.radish).toBe(8)
  expect(state.trading).toEqual(settings)
})

it('reserves only needed order units and uses the real partial-batch price',()=>{
  const state=advancedStall()
  addLegacyFruit(state,7,12_345)
  const requirement={kind:'fruit',species:'radish',count:3} as const
  const order={id:state.nextId++,buyer:'merchant' as const,requirements:[requirement],reward:1}
  state.orders.push(order)
  commit(state,{type:'setTrading',settings:{...state.trading,reserveOrders:true}})
  expect(orderQuote(state,order)).toMatchObject({complete:true,marketValue:harvestSaleValue(state.basket[0],3,state),bonus:-3})
  expect(autoSellGarden(state)).toContain('Sold')
  expect(state.basket[0].count).toBe(3)
  const before=state.coins
  commit(state,{type:'fulfillOrder',id:order.id})
  expect(state.coins-before).toBe(order.reward)
})

it('prices new orders from inventory and preserves published rewards as the quote changes',()=>{
  const state=gardenWithStarterPlants(17)
  state.sold=true
  state.revealed.push('solar_strawberry')
  addLegacyFruit(state,80,280_000)
  expect(refreshOrders(state)).toBe(true)
  const order=state.orders[0]
  const quote=orderQuote(state,order)
  expect(order.reward).toBe(Math.max(evolution.orderMinReward,Math.ceil(quote.marketValue*evolution.orderBonus)))
  state.market.goods.radish.fruit.saturated=market.capacity.radish.fruit
  expect(orderQuote(state,order).marketValue).toBeLessThan(quote.marketValue)
  expect(state.orders[0].reward).toBe(order.reward)
})

it('checks every target of a mass template operation before changing any policy',()=>{
  const state=advancedStall()
  reject(state,{type:'plotTemplate',plots:[12,99],mode:'commercial'},'invalidPolicy')
  expect(state.plots[12].policy).toBeUndefined()
  commit(state,{type:'plotTemplate',plots:[12,13],mode:'commercial'})
  expect(state.plots[12].policy?.replant).toMatchObject({species:'radish',profile:common})
  commit(state,{type:'plotTemplate',plots:[12],mode:'support'})
  expect(state.plots[12].policy).toMatchObject({harvest:false,replant:null})
  commit(state,{type:'setAutomation',settings:{...state.automation,enabled:true}})
  expect(productionStatus(state,12)).toBe('protected')
})

it('carries excess deliveries across ticks whether sold as one batch or split',()=>{
  const original=advancedStall()
  const count=market.capacity.radish.fruit*2
  addLegacyFruit(original,count)
  const id=original.basket[0].id
  const split=structuredClone(original)
  const automatic=structuredClone(original)
  commit(original,{type:'sellHarvest',id,count})
  for (const part of Array(4).fill(count/4)) commit(split,{type:'sellHarvest',id,count:part})
  autoSellGarden(automatic)
  for (const state of [original,split,automatic]) {
    expect(marketQuote(state,'radish','fruit').delivered).toBe(count)
    advance(state,market.tickSeconds)
    expect(marketQuote(state,'radish','fruit').backlog).toBeGreaterThan(0)
    expect(state.market).toEqual(original.market)
  }
})

it('quotes only the shared surplus across market rows and preserves the last hybrid source',()=>{
  const state=advancedStall()
  const variant={species:'radish',rarity:'rare',plus:['fruitful'],minus:null,count:4} as const
  const pack={...variant,plus:[...variant.plus]}
  state.seeds.radish=4
  state.variants.push(pack)
  state.reserves.radish=5
  state.reserves[profileKey('radish',common)]=2
  state.revealed.push('solar_strawberry')
  state.seeds.solar_strawberry=1
  const value=seedSaleValue('radish',common,state)*2+seedSaleValue('radish',pack,state)
  const quote=marketPanel(state,'seed')
  expect(quote.match(/data-market-species="radish".*?small>(.*?)<\/small>/s)?.[1]).toBe('3 · '+value+' ◈')
  expect(quote.match(/data-market-species="solar_strawberry".*?small>(.*?)<\/small>/s)?.[1]).toBe('0 · 0 ◈')

  state.seeds.solar_strawberry=0
  addLegacyFruit(state,6)
  const batch=state.basket[0]
  batch.species='solar_strawberry'
  batch.profile=common
  batch.lots[0].seedYield=1
  const harvest=marketPanel(state,'fruit')
  expect(harvest.match(/data-market-species="solar_strawberry".*?small>(.*?)<\/small>/s)?.[1]).toBe('0 · 0 ◈')
})
