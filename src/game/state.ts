import { saveVersion, type GameState, type Plant, type Species } from './model'
import { balance, island, plotCount, hybridCounts, isSpecies } from './config'

export function newPlant(id: number, species: Species): Plant {
  return { id, species, progress: 0, mature: false, readySince: null, propagation: 0 }
}

export const inactiveAutomation = {
  helperLevel: 0, autoSell: false, harvestRemaining: 0, sellRemaining: 0
} as const

export const initialAmenities = {
  basketLevel: 0, firstHarvest: false, firstPropagation: false, musicMuted:false, tutorialSkipped:false, occupiedHintShown:false, muted: false
} as const

export function initialState(): GameState {
  const state: GameState = {
    schemaVersion: saveVersion,
    ...initialAmenities,
    decorations: [],
    ...inactiveAutomation,
    balanceVersion: balance.version,
    playTime: 0,
    nextId: 1,
    coins: balance.startCoins,
    plots: Array.from({ length: plotCount }, (_, index) => ({
      open: island.startOpen.includes(index),
      level: 1,
      plant: null
    })),
    nursery: [],
    basket: [],
    sold: false,
    planted: [],
    recipeProgress: hybridCounts(),
    seeds: hybridCounts(),
    lang: 'ru'
  }
  for (const {plot, species} of island.startPlants) {
    if (!isSpecies(species)) throw new Error(`Unknown starting species: ${species}`)
    state.plots[plot].plant = newPlant(state.nextId++, species)
    if (!state.planted.includes(species)) state.planted.push(species)
  }
  return state
}
