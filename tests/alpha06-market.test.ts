import { expect,it } from 'vitest'
import alpha05 from './fixtures/alpha05.json'
import { advance, execute, initialState } from '../src/game'
import { market, speciesInfo } from '../src/game/config'
import { common } from '../src/game/genetics'
import { initialMarket, marketQuote, recordDelivery } from '../src/game/market'
import { baseIds } from '../src/game/model'
import { harvestSaleValue, seedSaleValue } from '../src/game/pricing'
import { quickSaleValue } from '../src/game/trade'
import { parseSave } from '../src/persistence/migration'
import { addLegacyFruit, commit, reject } from './helpers'

it('absorbs ordinary deliveries and settles a large delivery in the correct market only',()=>{
  const state=initialState(17)
  state.coins=60
  addLegacyFruit(state,5,40000)
  commit(state,{type:'sell'})
  advance(state,market.tickSeconds)
  expect(marketQuote(state,'radish','fruit').saturation).toBe(0)
  commit(state,{type:'upgradeBasket',target:1})
  addLegacyFruit(state,market.capacity.radish.fruit,40000)
  const quote=quickSaleValue(state)
  const before=state.coins
  commit(state,{type:'sell'})
  expect(state.coins-before).toBe(quote)
  expect(marketQuote(state,'radish','fruit')).toMatchObject({demand:100,saturation:0,pricePercent:100,delivered:120})
  advance(state,market.tickSeconds)
  expect(marketQuote(state,'radish','fruit')).toMatchObject({demand:100,saturation:78,pricePercent:70,delivered:0})
  expect(marketQuote(state,'radish','seed').pricePercent).toBe(100)
  expect(marketQuote(state,'strawberry','fruit').pricePercent).toBe(100)
  advance(state,market.tickSeconds*6)
  expect(marketQuote(state,'radish','fruit').saturation).toBe(0)
  expect(marketQuote(state,'radish','fruit').pricePercent).toBeGreaterThan(100)
})

it('rotates demand on the active clock without changing breeding RNG or accruing time before the first sale',()=>{
  const state=initialState(42)
  const period=market.tickSeconds*market.demandPeriodTicks
  advance(state,period*2)
  expect(state.market).toEqual(initialMarket())
  const rng=state.rng
  addLegacyFruit(state,2)
  commit(state,{type:'sell'})
  const slow=structuredClone(state)
  advance(state,period*2)
  for (let i=0;i<period*2;i++) advance(slow,1)
  expect(state.market).toEqual(slow.market)
  expect(state.rng).toBe(rng)
  expect(marketQuote(state,'radish','fruit').demand).toBe(110)
  expect(marketQuote(state,'strawberry','fruit').demand).toBe(105)
})

it('quotes the same proceeds and deliveries for manual, partial, bulk and automated sales at one price',()=>{
  const state=initialState(17)
  state.sold=true
  state.market.goods.radish.fruit.saturated=70
  addLegacyFruit(state,7,24679)
  const id=state.basket[0].id
  const [manual,partial,bulk,auto]=Array.from({length:4},()=>structuredClone(state))
  const expected=harvestSaleValue(state.basket[0],7,state)
  commit(manual,{type:'sellHarvest',id,count:7})
  for (let i=0;i<7;i++) commit(partial,{type:'sellHarvest',id,count:1})
  commit(bulk,{type:'bulk',commands:[{type:'sellHarvest',id,count:3},{type:'sellHarvest',id,count:4}]})
  auto.coins+=450
  commit(auto,{type:'upgradeHelper',target:1})
  commit(auto,{type:'buyAutoSell'})
  commit(auto,{type:'setAutomation',settings:{...auto.automation,enabled:false}})
  advance(auto,10)
  for (const branch of [manual,partial,bulk,auto]) {
    expect(branch.coins-state.coins).toBe(expected)
    expect(branch.market.goods.radish.fruit.delivered).toBe(7)
    expect(branch.basket).toHaveLength(0)
  }
})

it('uses the seed quote and rolls back deliveries when a bulk order fails',()=>{
  const state=initialState(17)
  state.sold=true
  state.market.goods.radish.seed.saturated=market.capacity.radish.seed
  state.seeds.radish=20
  const price=seedSaleValue('radish',common,state)
  expect(price).toBeLessThan(seedSaleValue('radish',common))
  const sell={type:'sellSeeds',species:'radish',profile:common,count:10} as const
  reject(state,{type:'bulk',commands:[sell,{...sell,count:11}]},'invalidQuantity')
  const before=state.coins
  commit(state,sell)
  expect(state.coins-before).toBe(price*10)
  expect(state.market.goods.radish.seed.delivered).toBe(10)
  expect(state.market.goods.radish.fruit.delivered).toBe(0)
})

it('settles the market before auto-sale at a shared deadline',()=>{
  const state=initialState(21)
  state.coins=470;state.sold=true
  commit(state,{type:'upgradeHelper',target:1})
  commit(state,{type:'buyAutoSell'})
  commit(state,{type:'setAutomation',settings:{...state.automation,enabled:false}})
  addLegacyFruit(state,5,40000)
  recordDelivery(state,'radish','fruit',market.capacity.radish.fruit)
  state.market.remaining=state.sellRemaining
  const before=state.coins
  expect(advance(state,state.sellRemaining)).toEqual(['MarketUpdated','Sold'])
  expect(state.coins-before).toBe(14)
  expect(state.market.goods.radish.fruit.delivered).toBe(5)
})

it('migrates the Alpha 05 fixture intact with neutral prices, then saves an active market exactly',()=>{
  const state=parseSave(JSON.stringify(alpha05))
  if (!state || state==='future') throw Error('Alpha 05 fixture did not load')
  const {market:initial,trading,clones,rarityProgress,...garden}=state
  expect({trading,clones,rarityProgress}).toEqual({trading:initialState(1).trading,clones:[],rarityProgress:{}})
  expect(garden).toEqual({...alpha05,schemaVersion:11,balanceVersion:4})
  expect(initial).toEqual(initialMarket())
  expect(state.activeIsland).toBe('valley')
  expect(state.crosses[0].readyAt).toBeGreaterThan(state.playTime)
  const order=state.orders[0]
  recordDelivery(state,'radish','fruit',108)
  advance(state,market.tickSeconds+3)
  expect(state.orders.find(item=>item.id===order.id)?.reward).toBe(order.reward)
  expect(parseSave(JSON.stringify(state))).toEqual(state)
  state.market.goods.radish.seed.delivered=-1
  expect(parseSave(JSON.stringify(state))).toBeNull()
})

it('feeds successful order deliveries into the market without a second payout',()=>{
  const state=initialState(17)
  state.sold=true
  addLegacyFruit(state,20,40000)
  const order={id:state.nextId++,buyer:'merchant' as const,requirements:[{kind:'fruit' as const,count:12,species:'radish' as const}],reward:63}
  state.orders.push(order)
  expect(execute(state,{type:'fulfillOrder',id:order.id}).ok).toBe(true)
  expect(state.market.goods.radish.fruit.delivered).toBe(12)
  reject(state,{type:'fulfillOrder',id:order.id},'itemChanged')
})

it('preserves a profitable starter cycle at the floor and prevents common seed shop arbitrage',()=>{
  const state=initialState(42)
  state.sold=true
  state.coins=speciesInfo.radish.seedPrice!
  state.market.goods.radish.fruit.saturated=market.capacity.radish.fruit
  commit(state,{type:'plant',plot:8,species:'radish'})
  state.plots[8].plant!.fruitRoll=0
  advance(state,speciesInfo.radish.cycleSec)
  commit(state,{type:'harvest',plot:8})
  expect(marketQuote(state,'radish','fruit').pricePercent).toBe(market.minimumPricePercent)
  commit(state,{type:'sell'})
  expect(state.coins).toBe(11)
  commit(state,{type:'plant',plot:8,species:'radish'})
  for (let phase=1;phase<=market.demandPercent.length;phase++) {
    state.market.tick=phase*market.demandPeriodTicks
    for (const species of baseIds) {
      expect(seedSaleValue(species,common,state)).toBeLessThan(speciesInfo[species].seedPrice!)
    }
  }
})
