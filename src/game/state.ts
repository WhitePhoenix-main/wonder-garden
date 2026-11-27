import { saveVersion, type GameState, type Plant, type Species } from './model'
import { balance, island, plotCount, hybridCounts, isSpecies } from './config'

import { common, maxLives, nextRandom } from './genetics'
import { speciesIds } from './config'
import type { Profile } from './model'

export function newPlant(id: number, species: Species, profile:Profile=common, fruitRoll=0): Plant {
  const lives=maxLives(species,profile)
  return { id, species, rarity:profile.rarity, plus:profile.plus, minus:profile.minus, lives,maxLives:lives,fruitRoll, progress: 0, mature: false, readySince: null }
}

export const inactiveAutomation = {
  helperLevel: 0, autoSell: false, harvestRemaining: 0, sellRemaining: 0
} as const

export const initialAmenities = {
  tutorialBranch:null, pendingHybrid:null, basketLevel: 0, firstHarvest: false, firstPropagation: false, musicMuted:false, tutorialSkipped:false, occupiedHintShown:false, muted: false
} as const

export function initialState(seed=Math.floor(Math.random()*0x100000000)): GameState {
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
    revealed: [],
    seeds: Object.fromEntries(speciesIds.map(id=>[id,0])) as GameState['seeds'],
    variants:[], failures:hybridCounts(), rng:seed,
    lang: 'ru'
  }
  for (const {plot, species} of island.startPlants) {
    if (!isSpecies(species)) throw new Error(`Unknown starting species: ${species}`)
    state.plots[plot].plant = newPlant(state.nextId++, species,common,nextRandom(state))
    if (!state.planted.includes(species)) state.planted.push(species)
  }
  return state
}
