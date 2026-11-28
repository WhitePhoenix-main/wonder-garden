import { canonical, common, plantStats, rules, stockCount, validGenome } from './genetics'
import type { Experiment, Plant, PollinationSnapshot, Profile, GameState, Recipe, Species } from './model'
import { adjacent, auras, balance, basketLevels, bedLevels, evolution, island, isHybrid, isSpecies, plotIndices, plotIsland, recipes, speciesInfo, valley, valueScale } from './config'
import { harmonyGrowth } from './decor'
import { protectedProfile } from './stock-policy'

export function basketCapacity(state:Pick<GameState,'basketLevel'>):number {
  return basketLevels[state.basketLevel].capacity
}

export function basketCount(state:Pick<GameState, 'basket'>):number {
  return state.basket.reduce((sum, batch) => sum + batch.count, 0)
}

export function canRecoverGarden(state:GameState):boolean {
  return state.coins < speciesInfo.radish.seedPrice! && !state.basket.length && !state.nursery.length &&
    !state.variants.length && !Object.values(state.seeds).some(Boolean) && state.plots.every(plot => !plot.plant) &&
    state.plots.some(plot => plot.open)
}

export function isRecipeRevealed(state: GameState): boolean {
  return state.revealed.length>0
}

export function canReplace(state: GameState): boolean {
  return isRecipeRevealed(state) || state.plots.every(plot => plot.open && plot.plant !== null)
}

export function seedUnlocked(state: GameState, species: Species): boolean {
  if (species === 'moonflower') return state.planted.includes('blueberry')
  if (species === 'clover') return isRecipeRevealed(state)
  if (species === 'sunflower' || species === 'blueberry') return state.planted.includes('strawberry')
  if (isHybrid(species)) return state.revealed.includes(species)
  return true
}

export function expansionCost(state: GameState, plot?:number): number | null {
  const id=plot===undefined ? state.activeIsland : plotIsland(plot)
  const open=plotIndices(id).filter(index=>state.plots[index]?.open).length
  return id==='green' ? balance.expansionCosts[open - island.startOpen.length] ?? null :
    evolution.valleyCosts[open-valley.startOpen.length] ?? null
}

export function saleValue(state: GameState): number {
  return state.basket.reduce((sum,batch)=>sum+Math.round(batch.valueUnits*batch.count/valueScale),0)
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
    || plot.level < recipe.minBedLevel) return false
  const neighbors = neighborSpecies(state, index)
  return recipe.neighbors.every(id => neighbors.has(id))
}

export function experiments(state:GameState,index:number):Experiment[] {
  const near=adjacent(index)
  const layout=[state.plots[index].level,...near.map(i=>state.plots[i].plant?.id??0)].join('.')
  return recipes.filter(r=>isRecipeActive(state,index,r)).flatMap(r=>near.flatMap(i=>{
    const donor=state.plots[i].plant
    return donor && r.neighbors.includes(donor.species)?[{result:r.result,donorId:donor.id,layout}]:[]
  }))
}

function parentProfile(plant:Plant):Profile & {species:Species} {
  return {species:plant.species,...canonical(plant)}
}

export function pollinationFor(state:GameState,index:number):PollinationSnapshot|null {
  const plant = state.plots[index]?.plant
  if (!plant) return null
  if (plant.pollination) return plant.pollination
  const active = recipes.filter(recipe => isRecipeActive(state, index, recipe))
  const recipe = active.find(recipe => !state.revealed.includes(recipe.result)) ?? active[0]
  if (!recipe) return null
  const neighbors = adjacent(index).flatMap(neighbor => state.plots[neighbor].plant ?? [])
  const [donor, ...supporting] = recipe.neighbors.map(species =>
    parentProfile(neighbors.find(neighbor => neighbor.species === species)!))
  return {result: recipe.result, donor, supporting}
}
export function chance(state:Pick<GameState,'revealed'|'failures'>,result:Recipe['result']) {
  return result==='solar_strawberry' && !state.revealed.includes(result) || state.failures[result]>=rules.pity ? 1 : rules.success
}
export function auraBonus(state: GameState, index: number, kind: 'growth' | 'price' | 'propagation'): number {
  const species = state.plots[index]?.plant?.species
  if (!species) return 0
  const neighbors = adjacent(index).flatMap(i=>state.plots[i]?.plant ?? [])
  let bonus = 0
  for (const aura of auras) {
    if (aura.kind !== kind) continue
    const applies = aura.targets === 'all'
      || (aura.targets === 'hybrids' && speciesInfo[species].generation > 0)
      || (Array.isArray(aura.targets) && aura.targets.includes(species))
    if (applies) for (const neighbor of neighbors) if (neighbor.species===aura.source) {
      bonus = Math.max(bonus, aura.bonus*plantStats(neighbor.species,neighbor).auraMultiplier)
    }
  }
  return bonus
}

export function growthMultiplier(state: GameState, index: number): number {
  const plot = state.plots[index]
  if (!plot) return 1
  const plant = plot.plant
  const traitFactor = plant ? speciesInfo[plant.species].cycleSec / plantStats(plant.species, plant).growthSec : 1
  return bedLevels[plot.level].growthMultiplier * (1 + auraBonus(state, index, 'growth')) * traitFactor * harmonyGrowth(state,plotIsland(index))
}

export function cycleSeconds(state:GameState, index:number):number {
  const plant = state.plots[index]?.plant
  if (!plant) return 0
  const data = speciesInfo[plant.species]
  return (plant.mature ? data.regrowSec || data.cycleSec : data.cycleSec) / growthMultiplier(state,index)
}

export function secondsLeft(state:GameState, index:number):number {
  const plant = state.plots[index]?.plant
  return plant && plant.readySince === null
    ? Math.ceil((1 - plant.progress) * cycleSeconds(state,index)) : 0
}

export function removalIssue(state:GameState, plot:number, expectedId:number, action:'store'|'compost') {
  const plant = state.plots[plot]?.plant
  if (action === 'store' && !isRecipeRevealed(state)) return 'nurseryLocked'
  if (action === 'compost' && !state.sold) return 'firstSale'
  if (!plant || plant.id !== expectedId) return 'stalePlant'
  const species = plant.species
  if (action==='compost' && (state.protectedPlants.includes(plant.id) || protectedProfile(state,species,plant))) return 'protectedItem'
  if (action === 'compost' && isHybrid(species) && !state.seeds[species] && !state.variants.some(v=>v.species===species) &&
      !state.nursery.some(p => p.species === species) &&
      !state.plots.some(p => p.plant?.species === species && p.plant.id !== expectedId)) return 'lastHybrid'
  return null
}

export function plantingIssue(state:GameState, index:number, species:Species, replaceId?:number, stock?:Profile) {
  const plot = state.plots[index]
  if (!plot?.open) return 'plotClosed'
  if (replaceId !== undefined && plot.plant?.id !== replaceId) return 'stalePlant'
  if (plot.plant && !canReplace(state)) return 'replacementLocked'
  if (plot.plant && replaceId === undefined) return 'occupied'
  if (!isSpecies(species) || !seedUnlocked(state,species)) return 'seedLocked'
  if (stock && !validGenome(species,stock,true)) return 'invalidProfile'
  if (stock || isHybrid(species)) return stockCount(state,species,stock??common)>0 ? null : 'noSeeds'
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
