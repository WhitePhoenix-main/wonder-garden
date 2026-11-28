import { autoSellOffer, isHybrid, isSpecies, speciesInfo, valueScale } from './config'
import { changeStock, common, inherit, nextRandom, rules, sameProfile, stockCount } from './genetics'
import { rarities, type Command, type GameState, type HarvestBatch, type HarvestLot, type Profile,
  type Result, type SeedPack, type Species } from './model'
import { chance } from './queries'

type Trade = Extract<Command, {type:'sellHarvest'|'extractSeeds'|'sellSeeds'}>

export function harvestSaleValue(batch:HarvestBatch, count = batch.count):number {
  // A partial sale takes the difference, so splitting a batch cannot farm rounding.
  return Math.round(batch.count * batch.valueUnits / valueScale)
    - Math.round((batch.count - count) * batch.valueUnits / valueScale)
}

export function seedSaleValue(species:Species, profile:Profile):number {
  const modifier = 1 + (profile.plus ? rules.seedTraitPrice.plus : 0) - (profile.minus ? rules.seedTraitPrice.minus : 0)
  return Math.max(1, Math.round(speciesInfo[species].seedValue * rules.raritySeedPrice[rarities.indexOf(profile.rarity)] * modifier))
}

function portions(batch:HarvestBatch, count:number) {
  const result: {lot:HarvestLot; count:number; seeds:number}[] = []
  for (const lot of batch.lots) {
    if (count <= 0) break
    const units = Math.min(count, lot.remaining)
    const used = lot.size - lot.remaining
    // Distribute a single harvest's seed quota across its fruit. Each unit is
    // counted once, whether sold or extracted. Splitting the action adds no rolls.
    const seeds = Math.ceil((used + units) * lot.seedYield / lot.size) - Math.ceil(used * lot.seedYield / lot.size)
    result.push({lot, count:units, seeds})
    count -= units
  }
  return result
}

export function extractionYield(batch:HarvestBatch, count = batch.count) {
  let seeds = 0, attempts = 0
  for (const {lot, seeds:portion} of portions(batch, count)) {
    seeds += portion
    attempts += Number(lot.crossPending)
  }
  return {seeds, attempts}
}

function consume(state:GameState, batch:HarvestBatch, count:number) {
  for (const part of portions(batch, count)) part.lot.remaining -= part.count
  batch.count -= count
  if (batch.count === 0) state.basket.splice(state.basket.indexOf(batch), 1)
  else batch.lots = batch.lots.filter(lot => lot.remaining > 0)
}

function recordSale(state:GameState, coins:number):string[] {
  state.coins += coins
  state.sold = true
  if (state.autoSell) state.sellRemaining = autoSellOffer.intervalSec
  return ['Sold']
}

function validCount(count:number, available:number) {
  return Number.isSafeInteger(count) && count > 0 && count <= available
}

export function quickSaleEligible(state:GameState, batch:HarvestBatch, automated=false):boolean {
  if (batch.lots.some(lot => lot.crossPending)) return false
  if (automated && batch.profile && !sameProfile(batch.profile, common)) return false
  if (isHybrid(batch.species) && !state.seeds[batch.species] && !state.variants.some(pack => pack.species === batch.species)) {
    // Leave a viable source of seed even after the last plant of a hybrid expires.
    const reserve = state.basket.find(candidate => candidate.species === batch.species && extractionYield(candidate).seeds > 0)
    if (reserve === batch) return false
  }
  return true
}

export function quickSaleValue(state:GameState):number {
  return Math.round(state.basket.reduce((sum, batch) =>
    sum + (quickSaleEligible(state, batch) ? batch.count * batch.valueUnits : 0), 0) / valueScale)
}

export function sellBasket(state: GameState, automated=false): string[] {
  const selling = state.basket.filter(batch => quickSaleEligible(state, batch, automated))
  if (!selling.length) return []
  const value = Math.round(selling.reduce((sum, batch) => sum + batch.count * batch.valueUnits, 0) / valueScale)
  if (!Number.isSafeInteger(state.coins + value)) return []
  const sold = new Set(selling)
  state.basket = state.basket.filter(batch => !sold.has(batch))
  return recordSale(state, value)
}

function extract(state:GameState, batch:HarvestBatch, count:number):Result {
  const profile = batch.profile
  const yieldQuote = extractionYield(batch, count)
  if (!profile || (!yieldQuote.seeds && !yieldQuote.attempts)) return {ok:false, reason:'noExtraction'}

  const stream = {rng:state.rng}
  const breeding = {revealed:[...state.revealed], failures:{...state.failures}}
  let pendingHybrid = state.pendingHybrid
  const random = () => nextRandom(stream)
  const events = ['SeedsExtracted', 'OwnSeeds:' + yieldQuote.seeds]
  if (yieldQuote.seeds > 0) events.push('SeedPropagated:' + batch.species)
  const obtained:SeedPack[] = []
  const add = (species:Species, genome:Profile, count:number) => {
    if (count === 0) return
    const existing = obtained.find(pack => pack.species === species && sameProfile(pack, genome))
    if (existing) existing.count += count
    else obtained.push({species, ...genome, count})
  }

  const used = portions(batch, count)
  function cross(mother:Profile, snapshot:NonNullable<HarvestBatch['pollination']>) {
    const result = snapshot.result
    if (random() >= chance(breeding, result)) {
      breeding.failures[result]++
      events.push('ExperimentFailed')
      return
    }
    const first = !breeding.revealed.includes(result)
    const genome = first && result === 'solar_strawberry' ? common : inherit(mother, snapshot.donor, random, result)
    add(result, genome, 1)
    breeding.failures[result] = 0
    if (first) {
      if (breeding.revealed.length === 0) pendingHybrid = result
      breeding.revealed.push(result)
    }
    events.push((first ? 'RecipeRevealed:' : 'SeedPropagated:') + result)
  }

  for (const {lot, seeds} of used) {
    // The first extracted fruit attempts the cross, even when its own seed
    // share is zero. Always roll it before the one possible profile copy.
    if (lot.crossPending && batch.pollination) cross(profile,batch.pollination)
    if (seeds > 0) {
      const copy = lot.copyPending && random() < lot.copyChance
      add(batch.species, common, seeds - Number(copy))
      if (copy) add(batch.species, profile, 1)
    }
  }
  if (obtained.some(pack => !Number.isSafeInteger(stockCount(state, pack.species, pack) + pack.count))) {
    return {ok:false, reason:'invalidQuantity'}
  }

  for (const pack of obtained) changeStock(state, pack.species, pack, pack.count)
  for (const {lot, seeds} of used) {
    lot.crossPending = false
    if (seeds > 0) lot.copyPending = false
  }
  consume(state, batch, count)
  state.firstExtraction = true
  if (isHybrid(batch.species) && yieldQuote.seeds > 0) state.firstPropagation = true
  state.rng = stream.rng
  state.revealed = breeding.revealed
  state.failures = breeding.failures
  state.pendingHybrid = pendingHybrid
  return {ok:true, events, obtained}
}

export function trade(state:GameState, command:Trade):Result {
  if (command.type === 'sellSeeds') {
    if (!isSpecies(command.species)) return {ok:false, reason:'noSeeds'}
    const {species, profile, count} = command
    if (!validCount(count, stockCount(state, species, profile))) return {ok:false, reason:'invalidQuantity'}
    const value = count * seedSaleValue(species, profile)
    if (!Number.isSafeInteger(state.coins + value)) return {ok:false, reason:'coinLimit'}
    changeStock(state, species, profile, -count)
    return {ok:true, events:recordSale(state, value)}
  }
  const batch = state.basket.find(item => item.id === command.id)
  if (!batch) return {ok:false, reason:'itemChanged'}
  if (!validCount(command.count, batch.count)) return {ok:false, reason:'invalidQuantity'}
  if (command.type === 'extractSeeds') return extract(state, batch, command.count)

  const value = harvestSaleValue(batch, command.count)
  if (!Number.isSafeInteger(state.coins + value)) return {ok:false, reason:'coinLimit'}
  consume(state, batch, command.count)
  return {ok:true, events:recordSale(state, value)}
}
