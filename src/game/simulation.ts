import type { GameState } from './model'
import { autoSellOffer, helperLevels } from './config'
import { autoSellGarden, workGarden } from './automation'
import { cycleSeconds, observeCompatibility, pollinationFor } from './queries'
import { refreshOrders } from './orders'
import { settleMarket } from './market'
import { advanceProduction } from './nursery'
import { greenhouseTime } from './greenhouse'

// Only planted instances grow during active game time.
export function growPlots(state: GameState, seconds: number, active:boolean): number {
  let ready=0
  state.plots.forEach(({plant}, index) => {
    if (!plant?.lives) return
    if (active) {
      observeCompatibility(state,index)
      if (!plant.pollination) plant.pollination = pollinationFor(state,index)
    }
    if (plant.readySince !== null) return
    const rate = 1 / cycleSeconds(state, index)
    const timeToRipe = (1 - plant.progress) / rate
    plant.progress += seconds * rate
    if (plant.progress >= 1 - 1e-10) {
      plant.progress = 1
      plant.mature = true
      plant.readySince = active ? Math.min(state.playTime, state.playTime - seconds + timeToRipe) : state.playTime
      ready++
    }
  })
  return ready
}

// Advance to each deadline in chronological order, also when called with a coarse step.
export function advance(state: GameState, seconds: number): string[] {
  const events: string[] = []
  if (!Number.isFinite(seconds)) return events
  while (seconds > 0) {
    const orderDeadline=state.orderRefreshAt>state.playTime ? state.orderRefreshAt-state.playTime : Infinity
    const marketActive=state.sold
    const dt = Math.min(seconds, orderDeadline, state.helperLevel ? state.harvestRemaining : Infinity,
      state.autoSell ? state.sellRemaining : Infinity, marketActive ? state.market.remaining : Infinity)
    const before=greenhouseTime(state)
    state.playTime+=dt
    growPlots(state, dt, true)
    seconds -= dt
    if (marketActive) {
      state.market.remaining-=dt
      if (state.market.remaining<=1e-9) {
        settleMarket(state)
        events.push('MarketUpdated')
      }
    }
    if (state.autoSell) state.sellRemaining -= dt
    if (state.helperLevel) {
      state.harvestRemaining -= dt
      if (state.harvestRemaining <= 1e-9) {
        state.harvestRemaining = helperLevels[state.helperLevel].intervalSec!
        if (state.automation.enabled) events.push(...workGarden(state))
      }
    }
    if (state.autoSell && state.sellRemaining <= 1e-9) {
      events.push(...autoSellGarden(state))
      state.sellRemaining = autoSellOffer.intervalSec
    }
    const production=advanceProduction(state,dt)
    if (production.fruit || production.seeds || production.coins) events.push('ProductionChanged')
    if (refreshOrders(state)) events.push('OrdersUpdated')
    const after=greenhouseTime(state)
    if (state.crosses.some(c=>!c.collected && c.readyAt>before && c.readyAt<=after)) events.push('CrossReady')
    if (state.clones.some(c=>c.readyAt>before && c.readyAt<=after)) events.push('CloneReady')
  }
  return events
}
