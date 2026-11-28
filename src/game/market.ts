import { market, speciesIds } from './config'
import type { GameState, MarketKind, MarketState, Species, TradingPolicy } from './model'

export const marketKinds: readonly MarketKind[] = ['fruit','seed']

export function initialTrading():TradingPolicy {
  return {strategy:'quick',minimum:market.strategy.balancedMinimum,overflow:false,reserveOrders:false}
}

export function validTrading(value:unknown):value is TradingPolicy {
  if (!value || typeof value!=='object') return false
  const settings=value as Partial<TradingPolicy>
  return ['quick','balanced','profit','custom'].some(s=>s===settings.strategy) &&
    validPrice(settings.minimum) && typeof settings.overflow==='boolean' && typeof settings.reserveOrders==='boolean'
}

export function validPrice(value:unknown):value is number {
  return typeof value==='number' && Number.isInteger(value) &&
    value>=market.minimumPricePercent && value<=market.maximumPricePercent
}

export function saleMinimum(settings:TradingPolicy):number {
  switch (settings.strategy) {
    case 'quick': return market.minimumPricePercent
    case 'balanced': return market.strategy.balancedMinimum
    case 'profit': return market.strategy.profitMinimum
    case 'custom': return settings.minimum
  }
}

export function allowsOverflow(settings:TradingPolicy):boolean {
  return settings.strategy==='balanced' || settings.strategy==='profit' ||
    settings.strategy==='custom' && settings.overflow
}

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
  const occupied=Math.min(capacity,supply.saturated)
  const saturation=Math.round(occupied*100/capacity)
  const pressure=Math.round(occupied*market.saturationPenalty/capacity)
  const pricePercent=Math.min(market.maximumPricePercent,Math.max(market.minimumPricePercent,demand-pressure))
  return {demand,saturation,pricePercent,delivered:supply.delivered,backlog:Math.max(0,supply.saturated-capacity),
    change:pricePercent-(supply.previousPrice??pricePercent)}
}

export function recordDelivery(state:Pick<GameState,'market'>, species:Species, kind:MarketKind, count:number):void {
  const supply=state.market.goods[species][kind]
  supply.delivered=Math.min(Number.MAX_SAFE_INTEGER,supply.delivered+count)
}

export function settleMarket(state:Pick<GameState,'market'>):void {
  for (const species of speciesIds) for (const kind of marketKinds) {
    const supply=state.market.goods[species][kind]
    supply.previousPrice=marketQuote(state,species,kind).pricePercent
    const capacity=market.capacity[species][kind]
    const clearance=Math.ceil(capacity*market.recoveryPercentPerTick*demandPercent(state.market.tick,species)/10_000)
    const excess=Math.max(0,supply.saturated-capacity)
    const backlogClearance=Math.ceil(excess*(market.backlogRecoveryPercentPerTick/100))
    supply.saturated=Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,supply.saturated-clearance-backlogClearance+supply.delivered))
    supply.delivered=0
  }
  state.market.tick++
  state.market.remaining=market.tickSeconds
}
