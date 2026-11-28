import { saveVersion, type GameState, type Plant } from '../game/model'
import { balance, hybridCounts, isHybrid, recipes } from '../game/config'
import { inactiveAutomation, initialAmenities, initialPassive } from '../game/state'
import { record, integer } from './shape'
import { initialEvolution, initialState, newPlant } from '../game/state'
import { canonical, maxLives, nextRandom, rules } from '../game/genetics'
import { milestones, recordPlanting } from '../game/collection'
import { initialMarket, initialTrading } from '../game/market'
import type { PollinationSnapshot } from '../game/model'
import { legacyBalanceVersion, type AlphaFourState, type AlphaThreeState, type LegacyState, validAlphaSeven, validAlphaSix, validAlphaFive, validAlphaFour, validAlphaThree, validLegacy, validState } from './validation'
import { unlockProduction } from '../game/nursery'

// Keep the existing storage key so either snapshot from the first sprint can be recovered.
function migrateFirstSprint(value: Record<string, unknown>): GameState|null {
  if (!integer(value.recipeProgress) || !integer(value.solarSeeds) || value.solarSeeds > 1 ||
      !Array.isArray(value.plots) || !Array.isArray(value.nursery)) return null
  const {solarSeeds, ...legacy} = value
  const migratePlant = (p: unknown) => record(p) ? {...p, propagation:0} : p
  const migrated = {
    ...legacy, ...inactiveAutomation, schemaVersion:3,
    recipeProgress:{...hybridCounts(), solar_strawberry:value.recipeProgress},
    seeds:{...hybridCounts(), solar_strawberry:solarSeeds},
    plots:value.plots.map(p => record(p) ? {...p, plant:migratePlant(p.plant)} : p),
    nursery:value.nursery.map(migratePlant)
  }
  const state = migrateAmenities(migrated)
  if (!validLegacy(state)) return null
  const oldHybrids = [...state.nursery, ...state.plots.map(p => p.plant)].filter(p => p?.species === 'solar_strawberry')
  if (oldHybrids.length + value.solarSeeds !== Number(value.recipeProgress === recipes.find(r => r.result === 'solar_strawberry')!.harvests)) return null
  return upgrade(state)
}

function migrateAmenities(value:Record<string,unknown>) {
  const plots = Array.isArray(value.plots) ? value.plots : []
  const nursery = Array.isArray(value.nursery) ? value.nursery : []
  const basket = Array.isArray(value.basket) ? value.basket : []
  const seeds = record(value.seeds) ? value.seeds : {}
  const plants = [...plots.map(p => record(p) ? p.plant : null), ...nursery].filter(record)
  return {
    ...value, ...initialAmenities, schemaVersion:6, decorations:[],
    firstHarvest:value.sold === true || basket.length > 0,
    firstPropagation:recipes.some(({result}) =>
      Number(seeds[result]) + plants.filter(p => p.species === result).length > 1)
  }
}

function convertBasket(items:AlphaThreeState['basket'], startId:number) {
  const groups = new Map<string,GameState['basket'][number]>()
  let nextId = startId
  for (const {species,valueUnits} of items) {
    const key = species + ':' + valueUnits
    let batch = groups.get(key)
    if (!batch) {
      batch = {id:nextId++,species,valueUnits,count:0,profile:null,pollination:null,lots:[]}
      groups.set(key,batch)
    }
    batch.count++
  }
  const basket = Array.from(groups.values())
  for (const batch of basket) {
    batch.lots.push({size:batch.count,remaining:batch.count,seedYield:0,copyChance:0,copyPending:false,crossPending:false})
  }
  return {basket,nextId}
}

function upgradeAlphaThree(old:AlphaThreeState):GameState {
  function convert(plant:AlphaThreeState['nursery'][number]):Plant {
    const limit = maxLives(plant.species,plant)
    return {...plant, maxLives:limit, lives:Math.min(plant.lives,limit), pollination:null}
  }
  return upgradeAlphaFour({
    ...old, ...convertBasket(old.basket,old.nextId), schemaVersion:8, balanceVersion:2,
    plots:old.plots.map(plot=>({...plot,plant:plot.plant && convert(plot.plant)})),
    nursery:old.nursery.map(convert), firstExtraction:old.firstPropagation, firstSeedPlanting:old.planted.some(isHybrid)
  })
}

function upgradeAlphaFour(old:AlphaFourState):GameState {
  const snapshot=(pollination:PollinationSnapshot|null):PollinationSnapshot|null=>pollination && ({
    result:pollination.result,donor:{species:pollination.donor.species,...canonical(pollination.donor)},
    supporting:pollination.supporting.map(parent=>({species:parent.species,...canonical(parent)}))
  })
  const plant=(p:Plant):Plant=>({...p,...canonical(p),pollination:snapshot(p.pollination)})
  return backfill({
    ...old,...initialEvolution(),tutorialSeen:[],passive:initialPassive(old.rng),market:initialMarket(),schemaVersion:saveVersion,balanceVersion:balance.version,stallLevel:old.autoSell ? 2 : 1,
    plots:old.plots.map(p=>({...p,plant:p.plant && plant(p.plant)})),
    nursery:old.nursery.map(plant),
    variants:old.variants.map(pack=>({...pack,...canonical(pack)})),
    basket:old.basket.map(b=>({...b,profile:b.profile && canonical(b.profile),pollination:snapshot(b.pollination)}))
  })
}

function backfill(state:GameState):GameState {
  const live=[...state.plots.flatMap(plot=>plot.plant ?? []),...state.nursery]
  for (const plant of live) recordPlanting(state,plant)
  // A common radish was present in every new Alpha 04 garden.
  if (!state.collection.some(r=>r.species==='radish' && r.rarity==='common')) recordPlanting(state,newPlant(0,'radish'))
  milestones(state)
  return state
}

function upgrade(old:LegacyState):GameState {
  const fresh=initialState(0x3e971ab)
  const {recipeProgress,plots,nursery,...rest}=old
  const stream={rng:fresh.rng}
  function convert(p:LegacyState['nursery'][number]){
    const {id,species,progress,readySince,mature}=p
    return {...newPlant(id,species,undefined,nextRandom(stream)),progress,readySince,mature}
  }
  const state:GameState={...rest,...initialEvolution(),tutorialSeen:[],passive:initialPassive(fresh.rng),market:initialMarket(),...convertBasket(old.basket,old.nextId),schemaVersion:saveVersion,balanceVersion:balance.version,
    stallLevel:old.autoSell ? 2 : 1,
    revealed:[],tutorialBranch:null,pendingHybrid:null,firstExtraction:old.firstPropagation,firstSeedPlanting:old.planted.some(isHybrid),
    seeds:{...fresh.seeds,...old.seeds},variants:[],failures:hybridCounts(),
    plots:plots.map(b=>({...b,plant:b.plant && convert(b.plant)})),nursery:nursery.map(convert),rng:stream.rng}
  for(const r of recipes)if(recipeProgress[r.result]<r.harvests){
    state.failures[r.result]=Math.min(rules.pity,recipeProgress[r.result])
  }else state.revealed.push(r.result)
  return backfill(state)
}
export function parseSave(raw: string | null):GameState|'future'|null {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (record(value) && value.schemaVersion === 1 && value.balanceVersion === legacyBalanceVersion) {
      return migrateFirstSprint(value)
    }
    if (record(value) && (value.schemaVersion === 2 || value.schemaVersion === 3)) {
      const previous = value.schemaVersion === 2 ? {...value,...inactiveAutomation} : value
      const migrated = migrateAmenities(previous)
      if (validLegacy(migrated)) return upgrade(migrated)
    }
    if (record(value) && value.schemaVersion === 4) {
      const migrated = {...value, schemaVersion:6, musicMuted:value.muted, tutorialSkipped:false, occupiedHintShown:false}
      if (validLegacy(migrated)) return upgrade(migrated)
    }
    if (record(value) && value.schemaVersion === 5) {
      const migrated = {...value, schemaVersion:6, occupiedHintShown:false}
      if (validLegacy(migrated)) return upgrade(migrated)
    }
    if (validLegacy(value)) return upgrade(value)
    if (validAlphaThree(value)) return upgradeAlphaThree(value)
    if (validAlphaFour(value)) return upgradeAlphaFour(value)
    if (validAlphaFive(value) || validAlphaSix(value) || validAlphaSeven(value)) {
      const state:GameState={trading:initialTrading(),clones:[],rarityProgress:{},market:initialMarket(),
        ...value,schemaVersion:saveVersion,balanceVersion:balance.version,
        tutorialSeen:[],passive:initialPassive(value.rng),automation:{...value.automation,cleanup:true}}
      unlockProduction(state)
      return state
    }
    if (validState(value)) return value
    if (record(value) && (Number(value.schemaVersion) > saveVersion || Number(value.balanceVersion) > balance.version)) return 'future'
  } catch { /* Try the backup below. */ }
  return null
}
