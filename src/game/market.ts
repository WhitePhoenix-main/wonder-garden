import { market, speciesIds } from './config'
import type { GameState, MarketKind, MarketState, Species } from './model'

export const marketKinds: readonly MarketKind[] = ['fruit','seed']

export function initialMarket():MarketState {
  const goods=Object.fromEntries(speciesIds.map(species=>[species,{
    fruit:{saturated:0,delivered:0}, seed:{saturated:0,delivered:0}
  }])) as MarketState['goods']
  return {tick:0,remaining:market.tickSeconds,goods}
}

function demandPercent(tick:number,species:Species):number {
  const phase=Math.floor(tick/market.demandPeriodTicks)
  return phase===0 ? 100 : market.demandPercent[(speciesIds.indexOf(species)+phase-1)%speciesIds.length]
}

export function marketQuote(state:Pick<GameState,'market'>, species:Species, kind:MarketKind) {
  const demand=demandPercent(state.market.tick,species)
  const supply=state.market.goods[species][kind]
  const capacity=market.capacity[species][kind]
  const saturation=Math.round(supply.saturated*100/capacity)
  const pressure=Math.round(supply.saturated*market.saturationPenalty/capacity)
  const pricePercent=Math.min(market.maximumPricePercent,Math.max(market.minimumPricePercent,demand-pressure))
  return {demand,saturation,pricePercent,delivered:supply.delivered}
}

export function recordDelivery(state:Pick<GameState,'market'>, species:Species, kind:MarketKind, count:number):void {
  const supply=state.market.goods[species][kind]
  supply.delivered=Math.min(market.capacity[species][kind],supply.delivered+count)
}

export function settleMarket(state:Pick<GameState,'market'>):void {
  for (const species of speciesIds) for (const kind of marketKinds) {
    const supply=state.market.goods[species][kind]
    const capacity=market.capacity[species][kind]
    const clearance=Math.ceil(capacity*market.recoveryPercentPerTick*demandPercent(state.market.tick,species)/10_000)
    supply.saturated=Math.min(capacity,Math.max(0,supply.saturated+supply.delivered-clearance))
    supply.delivered=0
  }
  state.market.tick++
  state.market.remaining=market.tickSeconds
}
