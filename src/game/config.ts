import balance from '../../config/balance.json'
import island from '../../config/island.json'
import valley from '../../config/valley.json'
import market from '../../config/market.json'
import { baseIds, hybridIds, decorIds, rarities, type DecorType, type BedLevel, type Hybrid, type IslandId, type Recipe, type Species } from './model'

export const speciesIds = [...baseIds, ...hybridIds] as const
export const plotCount = island.plotWidth * island.plotHeight
export const valleyPlotCount = valley.plotWidth * valley.plotHeight
export const worlds = {green:island, valley}
export const plotIsland = (index:number):IslandId => index < plotCount ? 'green' : 'valley'
export const plotOffset = (id:IslandId) => id === 'green' ? 0 : plotCount
export function plotIndices(id:IslandId):number[] {
  const map = worlds[id]
  return Array.from({length:map.plotWidth * map.plotHeight}, (_, index) => plotOffset(id) + index)
}
export const valueScale = 10_000

export function isHybrid(value: unknown): value is Hybrid {
  return hybridIds.some(id => id === value)
}

export function hybridCounts(): Record<Hybrid, number> {
  return Object.fromEntries(hybridIds.map(id => [id, 0])) as Record<Hybrid, number>
}

export function isSpecies(value: unknown): value is Species {
  return speciesIds.some(id => id === value)
}

function requireConfig(condition: unknown, field: string): asserts condition {
  if (!condition) throw new Error(`Invalid game configuration: ${field}`)
}

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function nonnegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

export function adjacent(globalIndex: number): number[] {
  if (!nonnegativeInteger(globalIndex) || globalIndex >= plotCount + valleyPlotCount) return []
  const id = plotIsland(globalIndex)
  const island = worlds[id]
  const offset = plotOffset(id)
  const index = globalIndex - offset
  const x = index % island.plotWidth
  const y = Math.floor(index / island.plotWidth)
  const neighbors = []
  if (y > 0) neighbors.push(index - island.plotWidth)
  if (x > 0) neighbors.push(index - 1)
  if (x + 1 < island.plotWidth) neighbors.push(index + 1)
  if (y + 1 < island.plotHeight) neighbors.push(index + island.plotWidth)
  return neighbors.map(i => i + offset)
}

function validateIsland(id:IslandId): void {
  const island = worlds[id]
  const offset = plotOffset(id)
  requireConfig(island.version === 1, 'island.version')
  requireConfig(island.id === id, 'island.id')
  requireConfig(positiveInteger(island.width) && positiveInteger(island.height), 'island dimensions')
  requireConfig(positiveInteger(island.plotWidth) && positiveInteger(island.plotHeight), 'plot dimensions')
  requireConfig(positiveInteger(island.tileHeight) && island.tileWidth === island.tileHeight * 2, 'tile dimensions')

  const occupied = new Set<string>()
  const cellKey = (x: number, y: number) => `${x},${y}`
  function reserve(x: number, y: number, width: number, height: number, label: string): void {
    requireConfig(nonnegativeInteger(x) && nonnegativeInteger(y), `${label} coordinates`)
    requireConfig(positiveInteger(width) && positiveInteger(height), `${label} dimensions`)
    requireConfig(x + width <= island.width && y + height <= island.height, `${label} bounds`)
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) {
        const key = cellKey(col, row)
        requireConfig(!occupied.has(key), `${label} overlap at ${key}`)
        occupied.add(key)
      }
    }
  }

  reserve(island.plotOrigin.x, island.plotOrigin.y, island.plotWidth, island.plotHeight, 'plot area')
  const structures = new Set(island.structures.map(item => item.id))
  requireConfig(structures.size === island.structures.length, 'structure ids')
  for (const key of id === 'green' ? ['greenhouse', 'stall', 'pond', 'reserve'] : ['pond']) {
    requireConfig(structures.has(key), `structure ${key}`)
  }
  for (const {x, y, width, height, id} of island.structures) reserve(x, y, width, height, id)
  requireConfig(new Set(island.decorSlots.map(item => item.id)).size === island.decorSlots.length, 'decor slot ids')
  for (const {x, y, id} of island.decorSlots) reserve(x, y, 1, 1, id)
  for (const {x, y} of island.paths) reserve(x, y, 1, 1, 'path')
  requireConfig(island.paths.some(p => p.x === island.bridge.x && p.y === island.bridge.y)
    && island.bridge.direction === 'south' && island.bridge.y === island.height - 1
    && island.bridge.state === 'broken', 'bridge')

  const start = new Set(island.startOpen)
  requireConfig(start.size > 0 && start.size === island.startOpen.length, 'startOpen count')
  requireConfig(island.startOpen.every(i => nonnegativeInteger(i) && i < island.plotWidth * island.plotHeight), 'startOpen ids')
  const reachable = new Set([island.startOpen[0]])
  for (const id of reachable) {
    for (const neighbor of adjacent(id + offset).map(i => i - offset)) {
      if (start.has(neighbor)) reachable.add(neighbor)
    }
  }
  requireConfig(reachable.size === start.size, 'connected starting plots')
  const planted = new Set<number>()
  requireConfig(id === 'valley' || island.startPlants.length > 0, 'startPlants count')
  for (const {plot, species} of island.startPlants) {
    requireConfig(start.has(plot) && !planted.has(plot), 'startPlants plots')
    requireConfig(isSpecies(species), 'startPlants species')
    planted.add(plot)
  }
}

function readSpecies(id: Species): Readonly<(typeof balance.plants)[number]> {
  const matches = balance.plants.filter(plant => plant.id === id)
  requireConfig(matches.length === 1, `plants.${id}`)
  const data = matches[0]
  requireConfig(data.nameRu && data.nameEn, `plants.${id} name`)
  requireConfig(Number.isFinite(data.cycleSec) && data.cycleSec > 0, `plants.${id} cycleSec`)
  requireConfig(data.lifecycle === 'single' ? data.lives === 1 && data.regrowSec === 0 :
    data.lifecycle === 'multi' && data.lives > 1 && Number.isFinite(data.regrowSec) && data.regrowSec > 0,
  `plants.${id} lifecycle`)
  requireConfig(nonnegativeInteger(data.harmony), 'plants.' + id + '.harmony')
  requireConfig(positiveInteger(data.lives) && [data.fruits,data.ownSeeds].every(range=>range.length===2 &&
    range.every(positiveInteger) && range[1]>=range[0]), 'yield and lives '+id)
  requireConfig(positiveInteger(data.fruitValue), `plants.${id} fruitValue`)
  requireConfig(positiveInteger(data.seedValue), `plants.${id} seedValue`)
  requireConfig(isHybrid(id) ? positiveInteger(data.propagationThreshold) : data.propagationThreshold === 0, 'propagationThreshold')
  requireConfig(isHybrid(id)
    ? data.seedPrice === null
    : data.seedPrice !== null && positiveInteger(data.seedPrice) && data.seedValue < data.seedPrice, `plants.${id} seedPrice`)
  return data
}

function readRecipe(result: Hybrid): Recipe {
  const matches = balance.recipes.filter(recipe => recipe.result === result)
  requireConfig(matches.length === 1, `recipes.${result}`)
  const recipe = matches[0]
  requireConfig(isSpecies(recipe.primary) && recipe.primary !== recipe.result, 'recipe primary')
  requireConfig(recipe.neighbors.length > 0 && recipe.neighbors.length <= 4
    && new Set(recipe.neighbors).size === recipe.neighbors.length
    && recipe.neighbors.every(id => isSpecies(id) && id !== recipe.result), 'recipe neighbors')
  requireConfig(recipe.minBedLevel === 1 || recipe.minBedLevel === 2 || recipe.minBedLevel === 3, 'recipe minBedLevel')
  requireConfig(positiveInteger(recipe.harvests), 'recipe harvests')
  return {result, primary:recipe.primary, neighbors:recipe.neighbors.filter(isSpecies), minBedLevel:recipe.minBedLevel, harvests:recipe.harvests}
}

function readBed(level: BedLevel) {
  const matches = balance.bedLevels.filter(item => item.level === level)
  requireConfig(matches.length === 1, `bedLevels.${level}`)
  const bed = matches[0]
  requireConfig(nonnegativeInteger(bed.upgradeCost), `bedLevels.${level} upgradeCost`)
  requireConfig(Number.isFinite(bed.growthMultiplier) && bed.growthMultiplier > 0, `bedLevels.${level} growthMultiplier`)
  requireConfig(Number.isFinite(bed.priceMultiplier) && bed.priceMultiplier > 0, `bedLevels.${level} priceMultiplier`)
  return bed
}

validateIsland('green')
validateIsland('valley')
const genetics=balance.genetics
const probability=(n:number)=>Number.isFinite(n) && n>=0 && n<=1
requireConfig(genetics.rarity.length===rarities.length && genetics.rarity.every((rows,a)=>rows.length===rarities.length &&
  rows.every((row,b)=>row.length===rarities.length && row.every((n,i)=>nonnegativeInteger(n) &&
    n===genetics.rarity[b]?.[a]?.[i]) && row.reduce((sum,n)=>sum+n,0)===100)), 'rarity matrix')
requireConfig(genetics.slots.join() === '0,1,1,2,3' && probability(genetics.copyCap), 'profile slots and copy cap')
requireConfig([genetics.success,genetics.inheritedPlus,genetics.newFlaw,genetics.oneFlaw,genetics.twoFlaws,
  genetics.copy,genetics.sparse,genetics.small,genetics.slow].every(probability) &&
  [genetics.seedCopy,genetics.fruitful,genetics.early,genetics.seedyYield,genetics.quality,genetics.stable,genetics.aura].every(pair=>pair.length===2 && pair.every(probability)) &&
  genetics.early.every(modifier=>modifier < 1) && genetics.small < 1 &&
  positiveInteger(genetics.pity) && genetics.hardy.length===2 && genetics.hardy.every(positiveInteger) &&
  positiveInteger(genetics.fragile),'genetics')
requireConfig([genetics.rarityFruitPrice,genetics.raritySeedPrice].every(ranks=>ranks.length===rarities.length &&
  ranks.every(n=>Number.isFinite(n) && n>0)) && genetics.raritySeedYield.length===rarities.length &&
  genetics.raritySeedYield.every(probability) && probability(genetics.seedTraitPrice.plus) &&
  probability(genetics.seedTraitPrice.minus) && genetics.seedTraitPrice.minus < 1,'rarity economy')
requireConfig(balance.version === 4, 'balance.version')
requireConfig(nonnegativeInteger(balance.startCoins), 'balance.startCoins')
requireConfig(balance.expansionCosts.length === plotCount - island.startOpen.length
  && balance.expansionCosts.every(nonnegativeInteger), 'balance.expansionCosts')
export const basketLevels = balance.basketLevels
requireConfig(basketLevels.length === 4 && basketLevels.every((row,i) => positiveInteger(row.capacity) &&
  nonnegativeInteger(row.upgradeCost) && (i === 0 || row.capacity > basketLevels[i-1].capacity)), 'balance.basketLevels')
requireConfig(nonnegativeInteger(balance.buildingHarmony) &&
  balance.harmonyMilestones.every((goal,i,list) => positiveInteger(goal) && (i === 0 || goal > list[i-1])), 'harmony')
requireConfig(balance.decor.length === decorIds.length, 'decor catalog size')
export const decorInfo = Object.fromEntries(decorIds.map(id => {
  const entries = balance.decor.filter(item => item.id === id)
  requireConfig(entries.length === 1 && positiveInteger(entries[0].cost) &&
    positiveInteger(entries[0].harmony) && entries[0].nameRu && entries[0].nameEn, 'decor.' + id)
  return [id,entries[0]]
})) as Record<DecorType,(typeof balance.decor)[number]>
export const isDecorType = (value:unknown): value is DecorType => decorIds.some(id => id === value)
export const isDecorSlot = (value:unknown): value is string =>
  island.decorSlots.some(slot => slot.id === value) || valley.decorSlots.some(slot => slot.id === value)
export const decorIsland = (slot:string):IslandId => slot.startsWith('valley_') ? 'valley' : 'green'

export const helperLevels = balance.helperLevels
requireConfig(helperLevels.length === 6 && helperLevels.every((row,index) =>
  row.level === index && nonnegativeInteger(row.upgradeCost) &&
  (index === 0 ? row.intervalSec === null : row.intervalSec !== null && positiveInteger(row.intervalSec))
), 'helperLevels')
export const autoSellOffer = balance.autoSell
requireConfig(positiveInteger(autoSellOffer.cost) && positiveInteger(autoSellOffer.intervalSec) &&
  positiveInteger(autoSellOffer.minHelperLevel) && autoSellOffer.minHelperLevel < helperLevels.length, 'autoSell')

requireConfig(balance.recipes.length === hybridIds.length && balance.plants.length === speciesIds.length, 'catalog size')
export const recipes = hybridIds.map(readRecipe)
export const bedLevels = {1: readBed(1), 2: readBed(2), 3: readBed(3), 4: readBed(4), 5: readBed(5)} as const
export const speciesInfo = Object.fromEntries(speciesIds.map(id => [id,readSpecies(id)])) as Record<Species,ReturnType<typeof readSpecies>>
export const auras = balance.auras
for (const aura of auras) {
  requireConfig(isSpecies(aura.source) && ['growth','price','propagation'].includes(aura.kind), `aura ${aura.source} kind`)
  requireConfig(Number.isFinite(aura.bonus) && aura.bonus >= 0, `aura ${aura.source} bonus`)
  requireConfig(aura.targets === 'all' || aura.targets === 'hybrids'
    || (Array.isArray(aura.targets) && aura.targets.every(isSpecies)), `aura ${aura.source} targets`)
}

export const evolution = balance.evolution
requireConfig([evolution.greenhouseCosts,evolution.stallCosts,evolution.crossSlots,evolution.orderSlots]
  .every(list=> list.length===5 && list.every(nonnegativeInteger)), 'building levels')
requireConfig(evolution.stallCosts[1]===autoSellOffer.cost && evolution.experiments.length===4 &&
  evolution.experiments.every(e=>positiveInteger(e.cost) && positiveInteger(e.seconds)) &&
  probability(evolution.levelFiveInheritance) &&
  positiveInteger(evolution.rarityGuarantee) && evolution.rarityGuarantee>=2 &&
  evolution.cloning.length===4 && evolution.cloning.every(e=>positiveInteger(e.cost) && positiveInteger(e.seconds)), 'breeding and trading')
requireConfig(evolution.helperThroughput.length===helperLevels.length && evolution.helperThroughput.every(nonnegativeInteger)
  && evolution.harmonyGrowth.length===balance.harmonyMilestones.length+1 && evolution.harmonyGrowth.every(probability), 'growth and helper bonuses')
requireConfig(evolution.valleyCosts.length===valleyPlotCount-valley.startOpen.length && evolution.valleyCosts.every(positiveInteger) &&
  Object.values(evolution.bridge).every(positiveInteger) && evolution.bridge.species<=speciesIds.length && evolution.bridge.plots<=plotCount,
'valley expansion')
requireConfig(evolution.orderCooldown>0 && Number.isFinite(evolution.orderBonus) && evolution.orderBonus>=1 &&
  positiveInteger(evolution.orderMinReward) && [evolution.orderFruitCount,evolution.orderSeedCount]
    .every(range=>range.length===2 && range.every(positiveInteger) && range[1]>=range[0]), 'orders')
requireConfig(evolution.rankRequirements.length===8 && evolution.rankRequirements.every(row=>Object.entries(row)
  .every(([key,value])=> key==='bridge' ? value===true : positiveInteger(Number(value)))), 'ranks')

requireConfig(positiveInteger(market.tickSeconds) && positiveInteger(market.demandPeriodTicks) &&
  market.demandPercent.length===speciesIds.length &&
  market.demandPercent.every(n=>positiveInteger(n) && n>=market.minimumPricePercent && n<=market.maximumPricePercent) &&
  positiveInteger(market.minimumPricePercent) && market.minimumPricePercent<=100 &&
  positiveInteger(market.maximumPricePercent) && market.maximumPricePercent>=100 &&
  positiveInteger(market.saturationPenalty) && market.saturationPenalty<=100 &&
  positiveInteger(market.recoveryPercentPerTick) && market.recoveryPercentPerTick<=100 &&
  positiveInteger(market.backlogRecoveryPercentPerTick) && market.backlogRecoveryPercentPerTick<=100 &&
  [market.strategy.balancedMinimum,market.strategy.profitMinimum].every(n=>
    Number.isInteger(n) && n>=market.minimumPricePercent && n<=market.maximumPricePercent) &&
  market.strategy.profitMinimum>market.strategy.balancedMinimum &&
  positiveInteger(market.strategy.overflowPercent) && market.strategy.overflowPercent<=100 &&
  Object.keys(market.capacity).length===speciesIds.length &&
  speciesIds.every(id=>positiveInteger(market.capacity[id]?.fruit) && positiveInteger(market.capacity[id]?.seed)), 'market')

export { balance, island, market, valley }
