import { canonical, common, plantStats, stockCount, validGenome } from './genetics'
import type { CompatibilityReaction, Experiment, Hybrid, IslandId, Plant, PollinationSnapshot, Profile, GameState, Recipe, ResearchState, Result, Species } from './model'
import { adjacent, auras, balance, basketLevels, bedLevels, breedingRecipe, breedingRecipes, breedingTier, evolution, island, isHybrid, isSpecies, plotCount, plotIndices, plotIsland, speciesInfo, valley } from './config'
import { harvestSaleValue } from './pricing'
import { harmonyGrowth } from './decor'
import { hasOtherSource, isValuablePlant, protectedProfile } from './stock-policy'

export function basketCapacity(state:Pick<GameState,'basketLevel'>):number {
  return basketLevels[state.basketLevel].capacity
}

export function basketCount(state:Pick<GameState, 'basket'>):number {
  return state.basket.reduce((sum, batch) => sum + batch.count, 0)
}

export function gardenBatchTargets(state:GameState,island:IslandId,kind:'harvest'|'cleanup'):number[] {
  return plotIndices(island).flatMap(index=>{
    const plot=state.plots[index]
    const plant=plot?.plant
    if (!plot?.open || !plant || isValuablePlant(state,plant)) return []
    if (kind==='cleanup') return plant.lives===0 ? [index] : []
    return plant.lives && plant.readySince!==null && plot.policy?.mode!=='support' ? [index] : []
  }).sort((a,b)=>(state.plots[a].plant!.readySince??0)-(state.plots[b].plant!.readySince??0) || a-b)
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
const recipesByMother=new Map<Species,typeof breedingRecipes>()
for (const recipe of breedingRecipes) {
  const group=recipesByMother.get(recipe.primary)??[]
  group.push(recipe)
  recipesByMother.set(recipe.primary,group)
}
for (const group of recipesByMother.values()) group.sort((a,b)=>a.id.localeCompare(b.id,'en'))

export function initialResearch():ResearchState {
  return {combinations:{},recipes:{}}
}

export function combinationKey(mother:Species, donors:readonly Species[]):string {
  return [mother,...[...donors].sort()].join('+')
}

function auraApplies(target:Species, source:Species, aura:(typeof auras)[number]):boolean {
  return aura.source===source && (aura.targets==='all' ||
    (aura.targets==='hybrids' && isHybrid(target)) ||
    (Array.isArray(aura.targets) && aura.targets.includes(target)))
}

export function reactionHasSymbiosis(key:string):boolean {
  const [mother,...donors]=key.split('+')
  return isSpecies(mother) && donors.some(donor=>isSpecies(donor) && auras.some(aura=>aura.bonus>0 &&
    (auraApplies(mother,donor,aura) || auraApplies(donor,mother,aura))))
}

export function compatibilityReaction(mother:Species, donors:Species[]):CompatibilityReaction {
  const key=combinationKey(mother,donors)
  const matches=recipesByMother.get(mother)?.some(recipe=>combinationKey(recipe.primary,recipe.neighbors)===key)
  if (matches) return donors.length>1 ? 'strong' : 'resonance'
  return reactionHasSymbiosis(key) ? 'symbiosis' : 'none'
}

export function observeCompatibility(state:GameState,index:number):void {
  const mother=state.plots[index]?.plant
  if (!mother?.lives) return
  const neighbors=neighborSpecies(state,index)
  for (const donor of neighbors) {
    const key=combinationKey(mother.species,[donor])
    state.research.combinations[key]??=compatibilityReaction(mother.species,[donor])
  }
  if (neighbors.size>1) for (const recipe of recipesByMother.get(mother.species)??[]) {
    if (recipe.neighbors.length<2 || !recipe.neighbors.every(donor=>neighbors.has(donor))) continue
    const key=combinationKey(mother.species,recipe.neighbors)
    state.research.combinations[key]??='strong'
  }
}

export function researchStatus(state:GameState,result:Hybrid,recipeId?:string) {
  const recipe=breedingRecipes.find(entry=>entry.result===result && (recipeId ? entry.id===recipeId : !entry.alternate))!
  const parents = [recipe.primary,...recipe.neighbors]
  const progress = tierProgress(state,result)
  const learned=Boolean(state.research.recipes[recipe.id]?.successes)
  const observed=!!state.research.combinations[combinationKey(recipe.primary,recipe.neighbors)]
  const guided=result==='solar_strawberry' && !recipe.alternate
  const labelKnown=learned || guided
  const matches=(snapshot:PollinationSnapshot|null)=>snapshot && snapshotRecipeId(snapshot)===recipe.id
  const activePlots = state.plots.flatMap((_,index)=>matches(pollinationFor(state,index)) ? [index] : [])
  const fruitBatch = state.basket.find(batch=>matches(batch.pollination) && batch.lots.some(lot=>lot.crossPending))
  const stage:ResearchStage = labelKnown && state.planted.includes(result) ? 'studied' :
    labelKnown && state.revealed.includes(result) ? 'seed' :
    fruitBatch ? 'fruit' :
    activePlots.length ? 'active' :
    !labelKnown ? parents.some(id=>state.planted.includes(id)) ? 'hint' : 'unknown' :
    !progress.unlocked ? 'tier' : 'layout'
  return {recipe,progress,labelKnown,observed,stage,activePlots,batchId:fruitBatch?.id,
    chance:chance(state,result,recipe.id),failures:state.failures[result],pity:breedingTier(result).hardPity}
}

export function researchDirections(state:GameState,index:number) {
  const plot=state.plots[index]
  if (!plot?.plant?.lives) return []
  const group=recipesByMother.get(plot.plant.species)
  if (!group) return []
  const neighbors=neighborSpecies(state,index)
  return group.filter(recipe=>plot.level>=recipe.minBedLevel && recipe.neighbors.every(donor=>neighbors.has(donor)) &&
    tierProgress(state,recipe.result).unlocked)
}

export function chooseResearchDirection(state:GameState,index:number,id:number,recipeId:string):Result {
  const plant=state.plots[index]?.plant
  if (!plant?.lives || plant.id!==id) return {ok:false,reason:'stalePlant'}
  if (plant.pollination) return {ok:false,reason:'researchUnavailable'}
  const available=researchDirections(state,index)
  if (available.length<2 || !available.some(recipe=>recipe.id===recipeId)) return {ok:false,reason:'researchUnavailable'}
  observeCompatibility(state,index)
  plant.researchDirection=recipeId
  plant.pollination=pollinationFor(state,index)
  return {ok:true,events:['ResearchDirectionChanged']}
}

export function donorCandidates(state:GameState,index:number,recipeId:string) {
  const recipe=researchDirections(state,index).find(item=>item.id===recipeId)
  return recipe ? adjacentDonors(state,index,recipe) : []
}

function adjacentDonors(state:GameState,index:number,recipe:Recipe) {
  const neighbors=adjacent(index).flatMap(plot=>{
    const plant=state.plots[plot]?.plant
    return plant?.lives ? [{plot,plant}] : []
  })
  return recipe.neighbors.map(species=>({species,candidates:neighbors.filter(entry=>entry.plant.species===species)}))
}

export function chooseResearchDonor(state:GameState,index:number,id:number,recipeId:string,species:Species,donorId:number|null):Result {
  const plant=state.plots[index]?.plant
  if (!plant?.lives || plant.id!==id) return {ok:false,reason:'stalePlant'}
  const group=donorCandidates(state,index,recipeId).find(group=>group.species===species)
  if (!group || donorId!==null && !group.candidates.some(entry=>entry.plant.id===donorId))
    return {ok:false,reason:'researchUnavailable'}
  if ((plant.researchDonors?.[species]??null)===donorId) return {ok:true,events:[]}
  const donors={...plant.researchDonors}
  if (donorId===null) delete donors[species]
  else donors[species]=donorId
  if (Object.keys(donors).length) plant.researchDonors=donors
  else delete plant.researchDonors
  return {ok:true,events:['ResearchDonorChanged']}
}

export function experiments(state:GameState,index:number):Experiment[] {
  const near=adjacent(index)
  const layout=[state.plots[index].level,...near.map(i=>state.plots[i].plant?.id??0)].join('.')
  return researchDirections(state,index).flatMap(r=>near.flatMap(i=>{
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
  const active=researchDirections(state,index)
  const recipe=active.length===1 ? active[0] : active.find(item=>item.id===plant.researchDirection)
  if (!recipe) return null
  const parents=adjacentDonors(state,index,recipe).map(({species,candidates})=>
    (candidates.find(({plant:donor})=>donor.id===plant.researchDonors?.[species])??candidates[0]).plant)
  const [donor,...supporting]=parents.map(parentProfile)
  return {recipeId:recipe.id, result:recipe.result, donor, supporting, donorIds:parents.map(parent=>parent.id)}
}
export function snapshotRecipeId(snapshot:PollinationSnapshot):string {
  return snapshot.recipeId??`${snapshot.result}:main`
}

export function chance(state:Pick<GameState,'revealed'|'failures'>,result:Hybrid,recipeId=`${result}:main`) {
  const recipe=breedingRecipe(recipeId)
  if (!recipe || recipe.result!==result) return 0
  const tier=breedingTier(result)
  const attempt=state.failures[result]+1
  if (result==='solar_strawberry' && !recipe.alternate && !state.revealed.includes(result) || attempt>=tier.hardPity) return 1
  return Math.min(0.95,recipe.baseChance+Math.max(0,attempt-tier.softStart+1)*tier.increment)
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
    for (const neighbor of neighbors) if (auraApplies(species,neighbor.species,aura)) {
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
