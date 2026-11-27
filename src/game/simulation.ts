import type { GameState } from './model'
import { autoSellOffer, helperLevels, speciesInfo } from './config'
import { execute } from './commands'
import { growthMultiplier, oldestReadyPlot } from './queries'
import { sellBasket } from './trade'

// Only planted instances grow during active game time.
function grow(state: GameState, seconds: number): void {
  state.playTime += seconds
  state.plots.forEach(({plant}, index) => {
    if (!plant || plant.readySince !== null) return
    const rate = growthMultiplier(state, index) / speciesInfo[plant.species].cycleSec
    const timeToRipe = (1 - plant.progress) / rate
    plant.progress += seconds * rate
    if (plant.progress >= 1 - 1e-10) {
      plant.progress = 1
      plant.mature = true
      plant.readySince = Math.min(state.playTime, state.playTime - seconds + timeToRipe)
    }
  })
}

// Advance to each deadline in chronological order, also when called with a coarse step.
export function advance(state: GameState, seconds: number): string[] {
  const events: string[] = []
  if (!Number.isFinite(seconds)) return events
  while (seconds > 0) {
    const dt = Math.min(seconds, state.helperLevel ? state.harvestRemaining : Infinity,
      state.autoSell ? state.sellRemaining : Infinity)
    grow(state, dt)
    seconds -= dt
    if (state.autoSell) state.sellRemaining -= dt
    if (state.helperLevel) {
      state.harvestRemaining -= dt
      if (state.harvestRemaining <= 1e-9) {
        state.harvestRemaining = helperLevels[state.helperLevel].intervalSec!
        const plot = oldestReadyPlot(state)
        if (plot !== null) {
          const plant=state.plots[plot].plant!
          const result = execute(state, {type:'harvest', plot,expectedId:plant.id,cycle:plant.lives})
          if (result.ok) events.push(...result.events, 'HelperHarvested:' + plot)
        }
      }
    }
    if (state.autoSell && state.sellRemaining <= 1e-9) {
      events.push(...sellBasket(state))
      state.sellRemaining = autoSellOffer.intervalSec
    }
  }
  return events
}
