import type { GameState, Recipe, Species } from './model'
import { adjacent, auras, balance, basketLevels, bedLevels, island, isHybrid, isSpecies, recipes, speciesInfo, valueScale } from './config'

export function basketCapacity(state:Pick<GameState,'basketLevel'>):number {
  return basketLevels[state.basketLevel].capacity
}

export function canRecoverGarden(state:GameState):boolean {
  return state.coins < speciesInfo.radish.seedPrice! && !state.nursery.length &&
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
