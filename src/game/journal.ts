import type { GameState } from './model'
import { plotCount, recipes, speciesIds } from './config'

export function journal(state:GameState) {
  const cleared = state.plots.filter(p => p.open).length
  const studied = state.planted.length
  const hybrid = recipes.some(r => state.planted.includes(r.result))
  const revealed = state.revealed
  const unlocked = revealed.length > 0
  const complete = studied === speciesIds.length && cleared === plotCount
  const rank = complete ? 4 : studied >= 10 ? 3 : studied >= 6 ? 2 : unlocked ? 1 : 0
  return { rank, cleared, studied, complete, chapters: [
    [state.firstHarvest, state.planted.includes('strawberry'), cleared >= 5, state.planted.includes('sunflower')],
    [revealed.includes('solar_strawberry'), unlocked, hybrid, state.firstPropagation],
    [state.helperLevel > 0, state.autoSell, state.decorations.length > 0, cleared >= 8],
    [revealed.includes('moonberry'),
     revealed.includes('golden_flower'),
     revealed.includes('honey_clover'),
     revealed.includes('crystal_flower')],
    [state.plots.some(p => p.level === 3), revealed.includes('star_orchid'),
     studied === speciesIds.length, cleared === plotCount]
  ] }
}
