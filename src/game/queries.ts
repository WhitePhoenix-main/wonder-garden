import { canonical, common, plantStats, rules, stockCount, validGenome } from './genetics'
import type { Experiment, Hybrid, Plant, PollinationSnapshot, Profile, GameState, Recipe, Species } from './model'
import { adjacent, auras, balance, basketLevels, bedLevels, evolution, island, isHybrid, isSpecies, plotCount, plotIndices, plotIsland, recipes, speciesInfo, valley } from './config'
import { harvestSaleValue } from './pricing'
import { harmonyGrowth } from './decor'
import { hasOtherSource, isValuablePlant, protectedProfile } from './stock-policy'

export function basketCapacity(state:Pick<GameState,'basketLevel'>):number {
  return basketLevels[state.basketLevel].capacity
}

export function basketCount(state:Pick<GameState, 'basket'>):number {
  return state.basket.reduce((sum, batch) => sum + batch.count, 0)
}

export function canRecoverGarden(state:GameState):boolean {
  return state.coins < speciesInfo.radish.seedPrice! && !state.basket.length && !state.nursery.length &&
    !state.passive.basket.length && !state.passive.seeds.length && state.passive.beds.every(bed=>!bed.plant?.lives) &&
    !state.variants.length && !Object.values(state.seeds).some(Boolean) && state.plots.every(plot => !plot.plant?.lives) &&
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
  return state.basket.reduce((sum,batch)=>sum+harvestSaleValue(batch,batch.count,state),0)
}

function neighborSpecies(state: GameState, index: number): Set<Species> {
  const neighbors = new Set<Species>()
  for (const neighbor of adjacent(index)) {
    const plant = state.plots[neighbor]?.plant
    if (plant?.lives) neighbors.add(plant.species)
  }
  return neighbors
}

export function isRecipeActive(state: GameState, index: number, recipe: Recipe): boolean {
  const plot = state.plots[index]
  if (!plot?.plant?.lives || plot.plant.species !== recipe.primary
    || plot.level < recipe.minBedLevel) return false
  if (!tierProgress(state,recipe.result).unlocked) return false
  const neighbors = neighborSpecies(state, index)
  return recipe.neighbors.every(id => neighbors.has(id))
}

export function tierProgress(state:GameState, result:Hybrid) {
  const generation = speciesInfo[result].generation
  const required = evolution.tierRequirements[generation]
  const current = {
    species: state.planted.filter(id=>speciesInfo[id].generation < generation).length,
    plots: state.plots.slice(0,plotCount).filter(plot=>plot.open).length,
    greenhouse: state.greenhouseLevel
  }
  const unlocked = current.species>=required.species && current.plots>=required.plots &&
    current.greenhouse>=required.greenhouse
  return {tier:generation+1,current,required,unlocked}
}

type ResearchStage='studied'|'seed'|'fruit'|'active'|'hint'|'unknown'|'tier'|'layout'

export function researchStatus(state:GameState, result:Hybrid) {
  const recipe = recipes.find(entry=>entry.result===result)!
  const parents = [recipe.primary,...recipe.neighbors]
  const progress = tierProgress(state,result)
  const labelKnown = result==='solar_strawberry' || state.revealed.includes(result) ||
    parents.every(id=>state.planted.includes(id))
  const activePlots = state.plots.flatMap((_,index)=>pollinationFor(state,index)?.result===result ? [index] : [])
  const fruitBatch = state.basket.find(batch=>batch.pollination?.result===result && batch.lots.some(lot=>lot.crossPending))
  const stage:ResearchStage = state.planted.includes(result) ? 'studied' :
    state.revealed.includes(result) ? 'seed' :
    fruitBatch ? 'fruit' :
    activePlots.length ? 'active' :
    !labelKnown ? parents.some(id=>state.planted.includes(id)) ? 'hint' : 'unknown' :
    !progress.unlocked ? 'tier' : 'layout'
  return {recipe,progress,labelKnown,stage,activePlots,batchId:fruitBatch?.id,
    chance:chance(state,result),failures:state.failures[result],pity:rules.pity}
}

export function experiments(state:GameState,index:number):Experiment[] {
  const near=adjacent(index)
  const layout=[state.plots[index].level,...near.map(i=>state.plots[i].plant?.id??0)].join('.')
  return recipes.filter(r=>isRecipeActive(state,index,r)).flatMap(r=>near.flatMap(i=>{
    const donor=state.plots[i].plant
    return donor?.lives && r.neighbors.includes(donor.species)?[{result:r.result,donorId:donor.id,layout}]:[]
  }))
}

function parentProfile(plant:Plant):Profile & {species:Species} {
  return {species:plant.species,...canonical(plant)}
}

export function pollinationFor(state:GameState,index:number):PollinationSnapshot|null {
  const plant = state.plots[index]?.plant
  if (!plant?.lives) return null
  if (plant.pollination) return plant.pollination
  const active = recipes.filter(recipe => isRecipeActive(state, index, recipe))
  const recipe = active.find(recipe => !state.revealed.includes(recipe.result)) ?? active[0]
  if (!recipe) return null
  const neighbors = adjacent(index).flatMap(neighbor => {
    const donor = state.plots[neighbor]?.plant
    return donor?.lives ? [donor] : []
  })
  const [donor, ...supporting] = recipe.neighbors.map(species =>
    parentProfile(neighbors.find(neighbor => neighbor.species === species)!))
  return {result: recipe.result, donor, supporting}
}
export function chance(state:Pick<GameState,'revealed'|'failures'>,result:Recipe['result']) {
  return result==='solar_strawberry' && !state.revealed.includes(result) || state.failures[result]>=rules.pity ? 1 : rules.success
}
export function auraBonus(state: GameState, index: number, kind: 'growth' | 'price' | 'propagation'): number {
  const plant = state.plots[index]?.plant
  if (!plant?.lives) return 0
  const {species} = plant
  const neighbors = adjacent(index).flatMap(i=>{
    const neighbor = state.plots[i]?.plant
    return neighbor?.lives ? [neighbor] : []
  })
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
  if (!plant?.lives) return 0
  const data = speciesInfo[plant.species]
  return (plant.mature ? data.regrowSec || data.cycleSec : data.cycleSec) / growthMultiplier(state,index)
}

export function secondsLeft(state:GameState, index:number):number {
  const plant = state.plots[index]?.plant
  return plant?.lives && plant.readySince === null
    ? Math.ceil((1 - plant.progress) * cycleSeconds(state,index)) : 0
}

export function removalIssue(state:GameState, plot:number, expectedId:number, action:'store'|'compost') {
  const plant = state.plots[plot]?.plant
  if (action === 'store' && !isRecipeRevealed(state)) return 'nurseryLocked'
  if (action === 'compost' && !state.sold) return 'firstSale'
  if (!plant || plant.id !== expectedId) return 'stalePlant'
  if (!plant.lives) return 'deadPlant'
  const species = plant.species
  if (action==='compost' && (state.protectedPlants.includes(plant.id) || protectedProfile(state,species,plant))) return 'protectedItem'
  if (action==='compost' && isValuablePlant(state,plant) && !stockCount(state,species,plant) &&
    !hasOtherSource(state,species,plant,expectedId)) return 'lastProfile'
  if (action === 'compost' && isHybrid(species) && !state.seeds[species] && !state.variants.some(v=>v.species===species) &&
      !hasOtherSource(state,species,undefined,expectedId)) return 'lastHybrid'
  return null
}

export function plantingIssue(state:GameState, index:number, species:Species, replaceId?:number, stock?:Profile) {
  const plot = state.plots[index]
  if (!plot?.open) return 'plotClosed'
  if (replaceId !== undefined && plot.plant?.id !== replaceId) return 'stalePlant'
  if (plot.plant?.lives===0) return 'deadPlant'
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
    if (plant?.lives && plant.readySince != null && plant.readySince < oldest) {
      oldest = plant.readySince
      target = index
    }
  })
  return target
}
