import type { GameState, Recipe, Species } from './model'
import { adjacent, auras, balance, basketLevels, bedLevels, island, isHybrid, isSpecies, recipes, speciesInfo, valueScale } from './config'

export function basketCapacity(state:Pick<GameState,'basketLevel'>):number {
  return basketLevels[state.basketLevel].capacity
}

export function canRecoverGarden(state:GameState):boolean {
  return state.coins + saleValue(state) < speciesInfo.radish.seedPrice! && !state.nursery.length &&
    !Object.values(state.seeds).some(Boolean) && state.plots.every(plot => !plot.plant) &&
    state.plots.some(plot => plot.open)
}

export function isRecipeRevealed(state: GameState): boolean {
  return recipes.some(recipe => state.recipeProgress[recipe.result] === recipe.harvests)
}

export function canReplace(state: GameState): boolean {
  return isRecipeRevealed(state) || state.plots.every(plot => plot.open && plot.plant !== null)
}

export function seedUnlocked(state: GameState, species: Species): boolean {
  if (species === 'moonflower') return state.planted.includes('blueberry')
  if (species === 'clover') return isRecipeRevealed(state)
  if (species === 'sunflower' || species === 'blueberry') return state.planted.includes('strawberry')
  if (isHybrid(species)) return recipes.some(r => r.result === species && state.recipeProgress[species] === r.harvests)
  return true
}

export function expansionCost(state: GameState): number | null {
  const openCount = state.plots.filter(plot => plot.open).length
  return balance.expansionCosts[openCount - island.startOpen.length] ?? null
}

export function saleValue(state: GameState): number {
  const units = state.basket.reduce((sum, fruit) => sum + fruit.valueUnits, 0)
  return Math.round(units / valueScale)
}

function neighborSpecies(state: GameState, index: number): Set<Species> {
  const neighbors = new Set<Species>()
  for (const neighbor of adjacent(index)) {
    const plant = state.plots[neighbor].plant
    if (plant) neighbors.add(plant.species)
  }
  return neighbors
}

export function isRecipeActive(state: GameState, index: number, recipe: Recipe): boolean {
  const plot = state.plots[index]
  if (!plot?.plant || plot.plant.species !== recipe.primary
    || plot.level < recipe.minBedLevel || state.recipeProgress[recipe.result] === recipe.harvests) return false
  const neighbors = neighborSpecies(state, index)
  return recipe.neighbors.every(id => neighbors.has(id))
}

export function auraBonus(state: GameState, index: number, kind: 'growth' | 'price' | 'propagation'): number {
  const species = state.plots[index]?.plant?.species
  if (!species) return 0
  const neighbors = neighborSpecies(state, index)
  let bonus = 0
  for (const aura of auras) {
    if (aura.kind !== kind || !isSpecies(aura.source) || !neighbors.has(aura.source)) continue
    const applies = aura.targets === 'all'
      || (aura.targets === 'hybrids' && speciesInfo[species].generation > 0)
      || (Array.isArray(aura.targets) && aura.targets.includes(species))
    if (applies) bonus = Math.max(bonus, aura.bonus)
  }
  return bonus
}

export function growthMultiplier(state: GameState, index: number): number {
  const plot = state.plots[index]
  return plot ? bedLevels[plot.level].growthMultiplier * (1 + auraBonus(state, index, 'growth')) : 1
}

export function secondsLeft(state:GameState, index:number):number {
  const plant = state.plots[index]?.plant
  return plant && plant.readySince === null
    ? Math.ceil((1 - plant.progress) * speciesInfo[plant.species].cycleSec / growthMultiplier(state,index)) : 0
}

export function removalIssue(state:GameState, plot:number, expectedId:number, action:'store'|'compost') {
  const plant = state.plots[plot]?.plant
  if (action === 'store' && !isRecipeRevealed(state)) return 'nurseryLocked'
  if (action === 'compost' && !state.sold) return 'firstSale'
  if (!plant || plant.id !== expectedId) return 'stalePlant'
  const species = plant.species
  if (action === 'compost' && isHybrid(species) && !state.seeds[species] &&
      !state.nursery.some(p => p.species === species) &&
      !state.plots.some(p => p.plant?.species === species && p.plant.id !== expectedId)) return 'lastHybrid'
  return null
}

export function plantingIssue(state:GameState, index:number, species:Species, replaceId?:number) {
  const plot = state.plots[index]
  if (!plot?.open) return 'plotClosed'
  if (replaceId !== undefined && plot.plant?.id !== replaceId) return 'stalePlant'
  if (plot.plant && !canReplace(state)) return 'replacementLocked'
  if (plot.plant && replaceId === undefined) return 'occupied'
  if (!isSpecies(species) || !seedUnlocked(state,species)) return 'seedLocked'
  if (isHybrid(species) && !state.seeds[species]) return 'noSeeds'
  if (state.coins < (speciesInfo[species].seedPrice ?? 0)) return 'noCoins'
  return null
}

export function oldestReadyPlot(state: GameState): number|null {
  let oldest = Infinity
  let target: number|null = null
  // Row-major iteration keeps the lower plot index on an equal timestamp.
  state.plots.forEach(({plant}, index) => {
    if (plant?.readySince != null && plant.readySince < oldest) {
      oldest = plant.readySince
      target = index
    }
  })
  return target
}
