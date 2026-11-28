import { common, compatible, maxLives, profileKey, rules, sameProfile, traits, validGenome } from '../game/genetics'
import { decorIsland, market, nurseryProduction, speciesIds, valley, valleyPlotCount } from '../game/config'
import { initialTrading, marketKinds, validTrading, validPrice } from '../game/market'
import { positives, negatives, rarities, type Hybrid, type Profile, type ProductionAssignment, type Species, saveVersion, type GameState, type Plant } from '../game/model'
import { adjacent, balance, island, isSpecies, plotCount, breedingRecipe, breedingRecipes, breedingTier, recipes, isHybrid, speciesInfo, helperLevels, autoSellOffer, basketLevels, isDecorType, isDecorSlot } from '../game/config'
import { combinationKey, compatibilityReaction } from '../game/queries'
import { record, integer, finite } from './shape'
import { validateEvolution } from './evolution'
import { seedProductionCapacity, validAssignment } from '../game/nursery'

function profile(v:Record<string,unknown>, species:Species,current:boolean):boolean {
  if (current) return Array.isArray(v.plus) && validGenome(species,v as unknown as Profile,true) &&
    v.plus.every((p,i,list)=>i===0 || positives.indexOf(list[i-1])<positives.indexOf(p))
  return rarities.slice(0,3).some(r=>r===v.rarity) && (v.rarity==='common'?v.plus===null:positives.slice(0,4).some(t=>t===v.plus)) &&
    (v.minus===null || negatives.some(t=>t===v.minus)) && compatible(v as unknown as Profile)
}
export const legacyBalanceVersion = 1
const previousCapacity = [15,30,60,120]
const previousLives: Record<Species, number> = {
  radish:20, strawberry:12, blueberry:10, sunflower:16, clover:14, moonflower:14,
  solar_strawberry:10, moonberry:10, honey_clover:12, golden_flower:10, crystal_flower:10, star_orchid:8
}
type OldFruit = {species:Species; valueUnits:number}
type EvolutionKeys='activeIsland'|'greenhouseLevel'|'stallLevel'|'crosses'|'orders'|'orderRefreshAt'|'ordersCompleted'|
  'collection'|'achievements'|'rank'|'protectedPlants'|'protectedProfiles'|'favorites'|'reserves'|'automation'
export type AlphaNineState=Omit<GameState,'schemaVersion'>&{schemaVersion:13}
export type AlphaEightState=Omit<GameState,'schemaVersion'|'research'>&{schemaVersion:12}
export type AlphaSevenState=Omit<AlphaEightState,'schemaVersion'|'passive'|'automation'|'tutorialSeen'>&{
  schemaVersion:11
  automation:Omit<GameState['automation'],'cleanup'>
}
type NewFields='trading'|'rarityProgress'|'clones'
export type AlphaSixState=Omit<AlphaSevenState,'schemaVersion'|NewFields>&{schemaVersion:10}
export type AlphaFiveState=Omit<AlphaSevenState,'schemaVersion'|'market'|NewFields>&{schemaVersion:9}
export type AlphaFourState=Omit<AlphaFiveState,'schemaVersion'|EvolutionKeys>&{schemaVersion:8}
type AlphaThreePlant = Omit<Plant,'pollination'>
type AlphaThreePlot = Omit<GameState['plots'][number],'plant'> & {plant:AlphaThreePlant|null}
export type AlphaThreeState = Omit<AlphaFourState,'schemaVersion'|'firstExtraction'|'firstSeedPlanting'|'plots'|'nursery'|'basket'> & {
  schemaVersion:7; plots:AlphaThreePlot[]; nursery:AlphaThreePlant[]; basket:OldFruit[]
}
export function validState(v:unknown):v is GameState {return validate(v,saveVersion)}
export function validAlphaNine(v:unknown):v is AlphaNineState {return validate(v,13)}
export function validAlphaEight(v:unknown):v is AlphaEightState {return validate(v,12)}
export function validAlphaSeven(v:unknown):v is AlphaSevenState {return validate(v,11)}
export function validAlphaSix(v:unknown):v is AlphaSixState {return validate(v,10)}
export function validAlphaFive(v:unknown):v is AlphaFiveState {return validate(v,9)}
export function validAlphaFour(v:unknown):v is AlphaFourState {return validate(v,8)}
export function validAlphaThree(v:unknown):v is AlphaThreeState {return validate(v,7)}
export type LegacyPlant=Pick<Plant,'id'|'species'|'progress'|'mature'|'readySince'> & {propagation:number}
export type LegacyState=Omit<AlphaThreeState,'revealed'|'schemaVersion'|'plots'|'nursery'|'seeds'|'rng'|'variants'|'failures'|'tutorialBranch'|'pendingHybrid'> & {
  schemaVersion:6; recipeProgress:Record<Hybrid,number>; seeds:Record<Hybrid,number>
  plots:(Omit<GameState['plots'][number],'plant'> & {plant:LegacyPlant|null})[];nursery:LegacyPlant[]
}
export function validLegacy(v:unknown):v is LegacyState {return validate(v,6)}

function validPollination(value:unknown, mother:Species, known:Set<unknown>, current:boolean, donorIdLimit:number):boolean {
  if (value === null) return true
  if (!record(value) || !isHybrid(value.result) || !Array.isArray(value.supporting) || !record(value.donor)) return false
  if (value.recipeId!==undefined && typeof value.recipeId!=='string') return false
  const recipe=breedingRecipe(value.recipeId??`${value.result}:main`)
  const parents = [value.donor, ...value.supporting]
  const donorIds=value.donorIds
  if (donorIds!==undefined && (!Array.isArray(donorIds) || donorIds.length!==parents.length ||
      new Set(donorIds).size!==donorIds.length || !donorIds.every(id=>integer(id) && id>0 && id<donorIdLimit))) return false
  return !!recipe && recipe.result===value.result && mother === recipe.primary && parents.length === recipe.neighbors.length &&
    parents.every(p => record(p) && isSpecies(p.species) && known.has(p.species) && profile(p,p.species,current)) &&
    recipe.neighbors.every((species,index) => parents[index].species === species)
}

function validResearch(value:unknown,known:Set<unknown>,revealed:unknown[]):boolean {
  if (!record(value) || Array.isArray(value) || !record(value.combinations) || Array.isArray(value.combinations) ||
      !record(value.recipes) || Array.isArray(value.recipes)) return false
  for (const [key,reaction] of Object.entries(value.combinations)) {
    const [mother,...donors]=key.split('+')
    if (!isSpecies(mother) || !known.has(mother) || !donors.length || donors.length>4 ||
        !donors.every(isSpecies) || !donors.every(donor=>known.has(donor)) ||
        new Set(donors).size!==donors.length || combinationKey(mother,donors)!==key ||
        compatibilityReaction(mother,donors)!==reaction || donors.length>1 && reaction!=='strong') return false
  }
  for (const [id,stats] of Object.entries(value.recipes)) {
    const recipe=breedingRecipe(id)
    if (!recipe || !record(stats) || !integer(stats.attempts) || !stats.attempts ||
        !integer(stats.successes) || stats.successes>stats.attempts ||
        !known.has(recipe.primary) || !recipe.neighbors.every(donor=>known.has(donor)) ||
        !!stats.successes && !revealed.includes(recipe.result)) return false
  }
  return true
}

const historicalFruitMax:Record<Species,number>={radish:5,strawberry:3,blueberry:4,sunflower:6,clover:3,moonflower:4,
  solar_strawberry:3,moonberry:4,honey_clover:3,golden_flower:7,crystal_flower:6,star_orchid:5}

function validHarvest(value:unknown, seen:Set<number>, nextId:number, known:Set<unknown>,current:boolean,donorIdLimit:number): value is GameState['basket'][number] {
  if (!record(value) || !integer(value.id) || value.id >= nextId || seen.has(value.id) ||
    !isSpecies(value.species) || !integer(value.count) || !value.count || !integer(value.valueUnits) || !value.valueUnits ||
    !Array.isArray(value.lots) || !value.lots.length || !validPollination(value.pollination,value.species,known,current,donorIdLimit)) return false
  const genome = value.profile
  if (genome === null ? value.pollination !== null : !record(genome) || !profile(genome,value.species,current) || !known.has(value.species)) return false
  const hasTraits = record(genome) && (traits(genome as unknown as Profile).length || genome.minus !== null)
  let count = 0
  for (const lot of value.lots) {
    if (!record(lot) || !integer(lot.size) || !integer(lot.remaining) || !lot.remaining || lot.remaining > lot.size ||
      !integer(lot.seedYield) || !finite(lot.copyChance) || lot.copyChance > 1 ||
      typeof lot.copyPending !== 'boolean' || typeof lot.crossPending !== 'boolean' ||
      lot.crossPending && value.pollination === null ||
      lot.copyPending && !hasTraits ||
      (genome === null ? lot.seedYield !== 0 || lot.copyChance !== 0 : !lot.seedYield ||
        lot.size > Math.max(4,historicalFruitMax[value.species]) || lot.seedYield > speciesInfo[value.species].ownSeeds[1])) return false
    count += lot.remaining
  }
  if (count !== value.count) return false
  seen.add(value.id)
  return true
}

function validateMarket(value:unknown,legacy:boolean):boolean {
  if (!record(value) || !integer(value.tick) || !finite(value.remaining) || value.remaining<=0 ||
    value.remaining>market.tickSeconds || !record(value.goods)) return false
  const goods=value.goods
  return Object.keys(goods).length===speciesIds.length && speciesIds.every(id=>{
    const channels=goods[id]
    return record(channels) && Object.keys(channels).length===marketKinds.length && marketKinds.every(kind=>{
      const supply=channels[kind]
      const cap=legacy ? market.capacity[id][kind] : Number.MAX_SAFE_INTEGER
      return record(supply) && integer(supply.saturated) && supply.saturated<=cap &&
        integer(supply.delivered) && supply.delivered<=cap && (supply.previousPrice===undefined || validPrice(supply.previousPrice))
    })
  })
}

function validate(v: unknown,version:6|7|8|9|10|11|12|13|typeof saveVersion): boolean {
  const current = version >= 9
  const research = version>=13
  const inventory = version >= 8
  const legacy = version === 6
  const balanceVersion=version===saveVersion ? balance.version : version>=12 ? 5 : version>=10 ? 4 : version===9 ? 3 : inventory ? 2 : legacyBalanceVersion
  if (!record(v) || v.schemaVersion !== version || v.balanceVersion !== balanceVersion ||
      !finite(v.playTime) || !integer(v.nextId) || !integer(v.coins) || typeof v.sold !== 'boolean' ||
      (v.lang !== 'ru' && v.lang !== 'en') || !Array.isArray(v.planted) || !v.planted.every(isSpecies) ||
      !research && !v.planted.includes('radish') || new Set(v.planted).size !== v.planted.length) return false
  if (!integer(v.helperLevel) || v.helperLevel >= (current ? helperLevels.length : 4) || typeof v.autoSell !== 'boolean' ||
      !finite(v.harvestRemaining) || !finite(v.sellRemaining)) return false
  const interval = helperLevels[v.helperLevel].intervalSec
  if (interval === null ? v.harvestRemaining !== 0 :
      !v.sold || v.harvestRemaining <= 0 || v.harvestRemaining > interval) return false
  if (v.autoSell ? v.helperLevel < autoSellOffer.minHelperLevel ||
      v.sellRemaining <= 0 || v.sellRemaining > autoSellOffer.intervalSec : v.sellRemaining !== 0) return false
  if (!integer(v.basketLevel) || !basketLevels[v.basketLevel] || (v.basketLevel > 0 && !v.sold) ||
      typeof v.firstHarvest !== 'boolean' || typeof v.firstPropagation !== 'boolean' ||
      typeof v.muted !== 'boolean' || typeof v.musicMuted !== 'boolean' || typeof v.tutorialSkipped !== 'boolean' || typeof v.occupiedHintShown !== 'boolean' || !Array.isArray(v.decorations)) return false
  if (inventory && (typeof v.firstExtraction !== 'boolean' || typeof v.firstSeedPlanting !== 'boolean')) return false
  const capacity = inventory ? basketLevels[v.basketLevel].capacity : previousCapacity[v.basketLevel]
  const progress = legacy?v.recipeProgress:v.failures
  const revealed = v.revealed
  if(!legacy && (!Array.isArray(revealed) || !revealed.every(isHybrid) || new Set(revealed).size!==revealed.length))return false
  const seeds = v.seeds
  if (!record(progress) || !record(seeds) || Object.keys(progress).length !== recipes.length ||
      Object.keys(seeds).length !== (legacy?recipes.length:speciesIds.length) || !Array.isArray(v.basket) || v.basket.length > capacity ||
      (!inventory && ((v.autoSell && v.basket.length === capacity) ||
        !v.basket.every(f => record(f) && isSpecies(f.species) && integer(f.valueUnits) && f.valueUnits > 0)))) return false
  if (!Array.isArray(v.plots) || (v.plots.length !== plotCount && (!current || v.plots.length!==plotCount+valleyPlotCount)) ||
    !Array.isArray(v.nursery)) return false
  if(!legacy){
    if(v.tutorialBranch!==null && v.tutorialBranch!=='experiment' && v.tutorialBranch!=='corner')return false
    if(v.pendingHybrid!==null && (!isHybrid(v.pendingHybrid) || !(revealed as Hybrid[]).includes(v.pendingHybrid)))return false
    const failures=v.failures
    if(!integer(v.rng) || v.rng>0xffffffff || !record(failures) ||
      !speciesIds.every(id=>integer(seeds[id]) && (!seeds[id] || isHybrid(id) || research && id==='radish' || (v.planted as unknown[]).includes(id))) ||
      !Array.isArray(v.variants))return false
    const keys=new Set<string>()
    for(const pack of v.variants){
      if(!record(pack) || !isSpecies(pack.species) || !profile(pack,pack.species,current) || !integer(pack.count) || !pack.count ||
        sameProfile(common,pack as unknown as Profile))return false
      const key=profileKey(pack.species,pack as unknown as Profile)
      if(keys.has(key))return false
      keys.add(key)
    }
  }
  const seen = new Set<number>()
  const known = new Set(v.planted)
  const {playTime, nextId} = v
  const donorIdLimit=version>=14 ? nextId : 0
  function validPlant(p: unknown,location:'plot'|'nursery'|'production'): p is Plant {
    if (!record(p) || !integer(p.id) || seen.has(p.id) || p.id >= nextId || !isSpecies(p.species) ||
        !known.has(p.species) || !finite(p.progress) || p.progress > 1 || typeof p.mature !== 'boolean') return false
    if (legacy && (!integer(p.propagation) || (isHybrid(p.species) ? p.propagation >= speciesInfo[p.species].propagationThreshold : p.propagation !== 0))) return false
    const productionReady=location==='production' && p.progress===1 && p.readySince===null
    if (!productionReady && (p.progress===1 ? !p.mature || !finite(p.readySince) || p.readySince>playTime : p.readySince!==null)) return false
    const dead=version>=12 && location==='plot' && p.lives===0 && p.progress===0 && p.pollination===null
    if(!legacy && (!profile(p,p.species,current) || p.maxLives!==(inventory ? maxLives(p.species,p as unknown as Profile) :
        previousLives[p.species] + (p.plus==='hardy' ? rules.hardy[p.rarity==='rare' ? 1 : 0] : 0) -
        (p.minus==='fragile' ? rules.fragile : 0)) ||
      !integer(p.lives) || (!dead && !p.lives) || p.lives>Number(p.maxLives) || !finite(p.fruitRoll) || p.fruitRoll>=1))return false
    if (inventory && !validPollination(p.pollination,p.species,known,current,donorIdLimit)) return false
    if (p.researchDirection!==undefined && (!research || typeof p.researchDirection!=='string' ||
        breedingRecipe(p.researchDirection)?.primary!==p.species)) return false
    const preferred=p.researchDonors
    if (preferred!==undefined && (version<14 || !record(preferred) || Array.isArray(preferred) ||
        !Object.entries(preferred).every(([species,id])=>isSpecies(species) && known.has(species) &&
          breedingRecipes.some(recipe=>recipe.primary===p.species && recipe.neighbors.includes(species)) &&
          integer(id) && id>0 && id!==p.id && id<donorIdLimit))) return false
    seen.add(p.id)
    return true
  }
  const open = new Set<number>()
  for (const [i,p] of v.plots.entries()) {
    if (!record(p) || typeof p.open !== 'boolean' || !integer(p.level) || p.level<1 || p.level>(current ? 5:3) ||
        (!p.open && (p.level !== 1 || p.plant !== null)) || (p.plant !== null && !validPlant(p.plant,'plot'))) return false
    if (p.open) open.add(i)
  }
  if (!v.nursery.every(p=>validPlant(p,'nursery')) || !island.startOpen.every(i => open.has(i))) return false
  const extra=v.plots.length>plotCount
  if (extra && !valley.startOpen.every(i=>open.has(plotCount+i))) return false
  const connected = new Set([island.startOpen[0],...(extra ? [plotCount+valley.startOpen[0]] : [])])
  for (const i of connected) for (const j of adjacent(i)) if (open.has(j)) connected.add(j)
  if (connected.size !== open.size) return false
  const instances: Plant[] = [...v.plots.flatMap(p => p.plant?.lives!==0 && p.plant ? [p.plant] : []), ...v.nursery]
  const decorSlots = new Set<string>()
  if (v.decorations.length && !v.planted.some(isHybrid)) return false
  for (const item of v.decorations) {
    if (!record(item) || !integer(item.id) || seen.has(item.id) || item.id >= nextId || !isDecorType(item.type) ||
      (!current && !['bench','lantern','flower_arch','sakura'].includes(item.type))) return false
    seen.add(item.id)
    if (item.slot === null) continue
    if (!isDecorSlot(item.slot) || decorSlots.has(item.slot) || decorIsland(item.slot)==='valley' && !extra) return false
    decorSlots.add(item.slot)
  }
  if (inventory && (!v.basket.every(f => validHarvest(f,seen,nextId,known,current,donorIdLimit)) ||
      v.basket.reduce((sum, f) => sum + f.count, 0) > capacity)) return false
  if (version>=12) {
    const passive=v.passive
    const settings=nurseryProduction.levels[Number(v.greenhouseLevel)-1]
    if (!Array.isArray(v.tutorialSeen) || v.tutorialSeen.length>64 || new Set(v.tutorialSeen).size!==v.tutorialSeen.length ||
        !v.tutorialSeen.every(id=>typeof id==='string' && /^[a-z][a-z0-9-]{0,39}$/.test(id))) return false
    if (!settings || !record(passive) || !integer(passive.rng) || passive.rng>0xffffffff ||
        !(passive.checkpoint===null || integer(passive.checkpoint)) || !finite(passive.labSeconds) ||
        !record(v.automation) || typeof v.automation.cleanup!=='boolean' ||
        !Array.isArray(passive.beds) || passive.beds.length!==settings.beds || !Array.isArray(passive.basket) ||
        !Array.isArray(passive.seeds) || Number(v.greenhouseLevel)<nurseryProduction.seedModeLevel && passive.seeds.length>0) return false
    let seedsStored=0
    const seedKeys=new Set<string>()
    for (const pack of passive.seeds) {
      if (!record(pack) || !isSpecies(pack.species) || !known.has(pack.species) || !profile(pack,pack.species,true) ||
          !integer(pack.count) || !pack.count) return false
      const key=profileKey(pack.species,pack as unknown as Profile)
      if (seedKeys.has(key)) return false
      seedKeys.add(key)
      seedsStored+=pack.count
    }
    if (seedsStored>seedProductionCapacity(v as unknown as GameState)) return false
    for (const bed of passive.beds) {
      if (!record(bed) || bed.assignment!==null &&
          (!record(bed.assignment) || !validAssignment(v as unknown as GameState,bed.assignment as unknown as ProductionAssignment))) return false
      if (bed.plant===null) continue
      if (!validPlant(bed.plant,'production') || bed.plant.pollination!==null) return false
      const a=bed.assignment as ProductionAssignment|null
      if (a && (a.species!==bed.plant.species || !sameProfile(a.profile,bed.plant))) return false
      instances.push(bed.plant)
    }
    if (!passive.basket.every(b=>validHarvest(b,seen,nextId,known,true,donorIdLimit) && b.pollination===null && b.profile!==null &&
        b.lots.length===1 && b.lots[0].origin===undefined && b.lots[0].size===b.count) ||
        passive.basket.reduce((n,b)=>n+b.count,0)>settings.capacity) return false
  }
  if (research && !validResearch(v.research,known,revealed as Hybrid[])) return false
  if (current && !validateEvolution(v as unknown as GameState,seen,instances)) return false
  if (version>=10 && !validateMarket(v.market,version===10)) return false
  if (version>=11) {
    if (!validTrading(v.trading)) return false
    const defaults=initialTrading()
    if (Number(v.stallLevel)<4 && (v.trading.strategy!==defaults.strategy || v.trading.overflow ||
      v.trading.reserveOrders || v.trading.minimum!==defaults.minimum)) return false
  }
  return recipes.every(({ result, primary, neighbors, harvests }) => {
    const count = progress[result], stock = seeds[result]
    if (!integer(count) || count > (legacy?harvests:research?breedingTier(result).hardPity-1:rules.pity) || !integer(stock)) return false
    if (count || (!legacy && (revealed as Hybrid[]).includes(result))) {
      const parentKnown=research
        ? breedingRecipes.some(recipe=>recipe.result===result && known.has(recipe.primary) && recipe.neighbors.every(id=>known.has(id)))
        : known.has(primary) && neighbors.every(id=>known.has(id))
      if (!parentKnown) return false
    }
    if(!legacy){
      const hasStock=stock>0 || (v.variants as GameState['variants']).some(pack=>pack.species===result)
      return (revealed as Hybrid[]).includes(result) || !hasStock && !known.has(result)
    }
    if (count < harvests) return stock === 0 && !known.has(result)
    return known.has(result) ? stock > 0 || instances.some(p => p.species === result) : stock === 1
  })
}
