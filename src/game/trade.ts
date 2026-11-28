import { measure } from './analytics'
import { autoSellOffer, isHybrid, isSpecies } from './config'
import { changeStock, common, hybridRarityOdds, inherit, nextRandom, profileKey, sameProfile, stockCount, validGenome } from './genetics'
import { rarities, type Command, type GameState, type HarvestBatch, type HarvestLot, type Profile,
  type Result, type SeedPack, type Species } from './model'
import { chance, snapshotRecipeId } from './queries'
import { availableStock, hasOtherSource, lotSeedYield, productionTarget, protectedHarvest, protectedProfile } from './stock-policy'
import { harvestSaleValue, seedSaleValue } from './pricing'
import { marketQuote, recordDelivery, saleMinimum } from './market'
import { orderReservations } from './orders'

type Trade = Extract<Command, {type:'sellHarvest'|'extractSeeds'|'sellSeeds'}>

export { harvestSaleValue, seedSaleValue } from './pricing'

function portions(batch:HarvestBatch, count:number) {
  const result: {lot:HarvestLot; count:number; seeds:number}[] = []
  for (const lot of batch.lots) {
    if (count <= 0) break
    const units = Math.min(count, lot.remaining)
    // Distribute a single harvest's seed quota across its fruit. Each unit is
    // counted once, whether sold or extracted. Splitting the action adds no rolls.
    const seeds = lotSeedYield(lot,units)
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

export function consumeHarvest(state:GameState, batch:HarvestBatch, count:number) {
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
  if (protectedHarvest(state,batch) || batch.lots.some(lot => lot.crossPending || lot.origin?.mode==='breeding')) return false
  if (automated) {
    const rarity=state.automation.saleRarity
    if (rarity && rarities.indexOf((batch.profile??common).rarity)>rarities.indexOf(rarity)) return false
    if (batch.lots.some(lot => {
      const origin=lot.origin
      if (origin?.mode==='seed') {
        // A seed-only garden keeps its harvest. When both sales are enabled,
        // prepared reserves allow the stall to clear surplus seed crops.
        const target=productionTarget(state,origin.plot,batch.species)
        return !state.automation.sellSeeds || stockCount(state,batch.species,target.profile)<target.count
      }
      return origin?.mode==='support' ||
        !rarity && batch.profile && !sameProfile(batch.profile,common) && origin?.mode!=='commercial'
    })) return false
  }
  if (isHybrid(batch.species) && !state.seeds[batch.species] && !state.variants.some(pack => pack.species === batch.species)) {
    // Leave a viable source of seed even after the last plant of a hybrid expires.
    const reserve = state.basket.find(candidate => candidate.species === batch.species && extractionYield(candidate).seeds > 0)
    if (reserve === batch) return false
  }
  return true
}

export function quickSaleValue(state:GameState):number {
  return state.basket.reduce((sum,batch)=>sum+(quickSaleEligible(state,batch) ? harvestSaleValue(batch,batch.count,state) : 0),0)
}

export function basketSalePlan(state:GameState,automated=false,force=false,reserved=new Map<number,number>()) {
  return state.basket.flatMap(batch=>{
    const count=batch.count-(reserved.get(batch.id)??0)
    if (count<=0 || !quickSaleEligible(state,batch,automated)) return []
    if (automated && !force && marketQuote(state,batch.species,'fruit').pricePercent<saleMinimum(state.trading)) return []
    return [{batch,count}]
  })
}

export function sellBasket(state: GameState, automated=false, force=false, reserved?:Map<number,number>): string[] {
  return applyBasketSale(state,basketSalePlan(state,automated,force,reserved))
}

export function readyFruitSalePlan(state:GameState) {
  return marketFruitSalePlan(state).filter(({batch})=>
    !batch.pollination && (!batch.profile || sameProfile(batch.profile,common)) &&
    batch.lots.every(lot=>lot.origin?.mode!=='seed' && lot.origin?.mode!=='support'))
}

export function marketFruitSalePlan(state:GameState) {
  return basketSalePlan(state,false,false,orderReservations(state).fruit)
}

export function marketSeedStock(state:GameState,species:Species,profile:Profile,reserved=orderReservations(state).seed):number {
  return Math.max(0,availableStock(state,species,profile)-(reserved.get(profileKey(species,profile))??0))
}

export function groupedSaleIssue(state:GameState,command:Exclude<Trade,{type:'extractSeeds'}>):string|null {
  if (!state.trading.reserveOrders) return null
  if (command.type==='sellSeeds') {
    if (!isSpecies(command.species) || !validGenome(command.species,command.profile,true)) return null
    const reserved=orderReservations(state).seed.get(profileKey(command.species,command.profile))??0
    return reserved>0 && command.count>availableStock(state,command.species,command.profile)-reserved ? 'orderReserved' : null
  }
  const batch=state.basket.find(item=>item.id===command.id)
  const reserved=orderReservations(state).fruit.get(command.id)??0
  return batch && reserved>0 && command.count>batch.count-reserved ? 'orderReserved' : null
}

export function readyFruitSaleValue(state:GameState):number {
  return readyFruitSalePlan(state).reduce((sum,{batch,count})=>sum+harvestSaleValue(batch,count,state),0)
}

export function sellReadyFruit(state:GameState):string[] {
  return applyBasketSale(state,readyFruitSalePlan(state))
}

function applyBasketSale(state:GameState,selling:ReturnType<typeof basketSalePlan>):string[] {
  if (!selling.length) return []
  const value = selling.reduce((sum,{batch,count})=>sum+harvestSaleValue(batch,count,state),0)
  if (!Number.isSafeInteger(state.coins + value)) return []
  for (const {batch,count} of selling) {
    measure(state,batch.species,{fruitRevenue:harvestSaleValue(batch,count,state),soldUnits:count,quoteUnits:count*marketQuote(state,batch.species,'fruit').pricePercent})
    consumeHarvest(state,batch,count)
    recordDelivery(state,batch.species,'fruit',count)
  }
  return recordSale(state, value)
}

function extract(state:GameState, batch:HarvestBatch, count:number):Result {
  const profile = batch.profile
  const yieldQuote = extractionYield(batch, count)
  if (!profile || (!yieldQuote.seeds && !yieldQuote.attempts)) return {ok:false, reason:'noExtraction'}

  const stream = {rng:state.rng}
  const breeding = {revealed:[...state.revealed], failures:{...state.failures}}
  const history={...state.research.recipes}
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
    const recipeId=snapshotRecipeId(snapshot)
    const previous=history[recipeId]
    const record={attempts:Math.min(Number.MAX_SAFE_INTEGER,(previous?.attempts??0)+1),successes:previous?.successes??0}
    history[recipeId]=record
    if (random() >= chance(breeding,result,recipeId)) {
      breeding.failures[result]++
      events.push('ExperimentFailed')
      return
    }
    const first = !breeding.revealed.includes(result)
    const donors=[snapshot.donor,...snapshot.supporting]
    const guided=first && recipeId==='solar_strawberry:main'
    const genome=guided ? common : inherit(mother,snapshot.donor,random,result,undefined,hybridRarityOdds(mother,donors),snapshot.supporting)
    add(result, genome, 1)
    record.successes=Math.min(record.attempts,record.successes+1)
    breeding.failures[result] = 0
    if (first) {
      pendingHybrid ??= result
      breeding.revealed.push(result)
      events.push('HybridDiscovered:'+result+':'+genome.rarity)
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
  consumeHarvest(state, batch, count)
  state.firstExtraction = true
  if (isHybrid(batch.species) && yieldQuote.seeds > 0) state.firstPropagation = true
  state.rng = stream.rng
  state.revealed = breeding.revealed
  state.failures = breeding.failures
  state.research.recipes=history
  state.pendingHybrid = pendingHybrid
  return {ok:true, events, obtained}
}

export function seedSaleIssue(state:GameState,species:Species,profile:Profile,count:number):string|null {
  if (!isSpecies(species) || !validGenome(species,profile,true)) return 'noSeeds'
  const stock=stockCount(state,species,profile)
  if (!validCount(count,stock)) return 'invalidQuantity'
  if (protectedProfile(state,species,profile)) return 'protectedItem'
  if (count>availableStock(state,species,profile)) return 'seedReserved'
  if (count===stock && (isHybrid(species) || !sameProfile(profile,common)) && !hasOtherSource(state,species,profile)) return 'lastProfile'
  return null
}

export function harvestSaleIssue(state:GameState,batch:HarvestBatch,count:number):string|null {
  if (protectedHarvest(state,batch)) return 'protectedItem'
  if (isHybrid(batch.species) && batch.profile && extractionYield(batch).seeds>0 &&
    extractionYield(batch,count).seeds===extractionYield(batch).seeds &&
    !state.seeds[batch.species] && !state.variants.some(pack=>pack.species===batch.species) &&
    !hasOtherSource(state,batch.species,undefined,undefined,batch.id)) return 'lastHybrid'
  return null
}

export function trade(state:GameState, command:Trade):Result {
  if (command.type === 'sellSeeds') {
    const {species,profile,count}=command
    const issue=seedSaleIssue(state,species,profile,count)
    if (issue) return {ok:false,reason:issue}
    const value = count * seedSaleValue(species,profile,state)
    if (!Number.isSafeInteger(state.coins + value)) return {ok:false, reason:'coinLimit'}
    measure(state,species,{seedRevenue:value,soldUnits:count,quoteUnits:count*marketQuote(state,species,'seed').pricePercent})
    changeStock(state, species, profile, -count)
    recordDelivery(state,species,'seed',count)
    return {ok:true, events:recordSale(state, value)}
  }
  const batch = state.basket.find(item => item.id === command.id)
  if (!batch) return {ok:false, reason:'itemChanged'}
  if (!validCount(command.count, batch.count)) return {ok:false, reason:'invalidQuantity'}
  if (command.type === 'extractSeeds') return extract(state, batch, command.count)
  const issue=harvestSaleIssue(state,batch,command.count)
  if (issue) return {ok:false,reason:issue}

  const value = harvestSaleValue(batch,command.count,state)
  if (!Number.isSafeInteger(state.coins + value)) return {ok:false, reason:'coinLimit'}
  measure(state,batch.species,{fruitRevenue:value,soldUnits:command.count,quoteUnits:command.count*marketQuote(state,batch.species,'fruit').pricePercent})
  consumeHarvest(state, batch, command.count)
  recordDelivery(state,batch.species,'fruit',command.count)
  return {ok:true, events:recordSale(state, value)}
}
