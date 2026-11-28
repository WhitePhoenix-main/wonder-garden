import { measure } from './analytics'
import { evolution, market } from './config'
import { execute } from './commands'
import { canonical, fruitCount, plantStats, profileKey, sameProfile, stockCount } from './genetics'
import type { GameState, Plot, PlotMode, PlotPolicy } from './model'
import { basketCapacity, basketCount } from './queries'
import { allSeedPacks, availableStock, defaultPolicy, isValuablePlant, productionTarget, protectedHarvest, protectedProfile } from './stock-policy'
import { basketSalePlan, extractionYield, quickSaleEligible, sellBasket } from './trade'
import { allowsOverflow, marketQuote, saleMinimum } from './market'
import { orderReservations } from './orders'

function overflow(state:GameState,incoming=0):boolean {
  return allowsOverflow(state.trading) && (basketCount(state)+incoming)*100>=basketCapacity(state)*market.strategy.overflowPercent
}

export function autoSellGarden(state:GameState,early=false,incoming=0):string[] {
  if (!state.autoSell) return []
  const force=overflow(state,incoming)
  if (early && !force) return []
  const reservations=orderReservations(state)
  const deadline=state.sellRemaining
  const events=state.automation.sellFruit ? sellBasket(state,true,force,reservations.fruit) : []
  if (early) state.sellRemaining=deadline
  else events.push(...sellSurplusSeeds(state,reservations.seed))
  return events
}

export function saleStatus(state:GameState) {
  if (!state.autoSell || !state.automation.sellFruit && !state.automation.sellSeeds) return 'disabled'
  const reservation=orderReservations(state)
  const force=overflow(state)
  if (state.automation.sellFruit && basketSalePlan(state,true,force,reservation.fruit).length ||
    surplusSeeds(state,reservation.seed).some(p=>p.favorable)) return 'ready'
  if (state.automation.sellFruit && basketSalePlan(state,true,true,reservation.fruit).length ||
    surplusSeeds(state,reservation.seed).length) return 'price'
  if (state.automation.sellFruit && state.basket.some(b=>reservation.fruit.has(b.id) && quickSaleEligible(state,b,true)))
    return 'order'
  if (state.automation.sellFruit && state.basket.some(b=>protectedHarvest(state,b))) return 'protected'
  if (state.automation.sellFruit && state.basket.some(b=>b.lots.some(l=>l.crossPending || l.origin?.mode==='breeding')))
    return 'breeding'
  if (state.automation.sellSeeds && allSeedPacks(state).length) return 'reserve'
  return 'empty'
}

export function plotTemplate(plot:Plot,mode:PlotMode):PlotPolicy {
  const current=plot.policy??defaultPolicy
  const replant=(mode==='manual' || mode==='support') ? null : current.replant??
    (plot.plant ? {species:plot.plant.species,profile:canonical(plot.plant)} : null)
  return {mode,priority:current.priority,harvest:mode!=='manual' && mode!=='support',target:current.target,replant}
}

export function productionStatus(state:GameState,index:number) {
  const plot=state.plots[index]
  const policy=plot?.policy??defaultPolicy
  const plant=plot?.plant
  if (!state.automation.enabled || !state.helperLevel) return 'manual'
  if (plant?.lives===0) return 'cleanup'
  if (policy.mode==='support' || plant?.lives===1 && isValuablePlant(state,plant)) return 'protected'
  if (plant) {
    if (!policy.harvest) return 'manual'
    if (plant.readySince===null) return 'growing'
    const stats=plantStats(plant.species,plant)
    if (basketCount(state)+fruitCount(stats,plant.fruitRoll)>basketCapacity(state))
      return saleStatus(state)==='price' ? 'awaitingSale' : 'full'
    return 'busy'
  }
  if (!state.automation.replant || policy.mode==='manual' && !policy.replant) return 'manual'
  const choice=policy.replant
  if (!choice) return 'profile'
  if (state.helperLevel<evolution.helperReplantLevel) return 'helperLevel'
  if (protectedProfile(state,choice.species,choice.profile)) return 'protected'
  if (!stockCount(state,choice.species,choice.profile)) return 'noSeeds'
  return availableStock(state,choice.species,choice.profile) ? 'busy' : 'reserve'
}

export function workGarden(state:GameState):string[] {
  if (!state.automation.enabled || !state.helperLevel) return []
  const events:string[]=[]
  const finish=(result:ReturnType<typeof execute>)=>{
    if (result.ok) events.push(...result.events)
    return result.ok
  }
  const candidates=state.plots.flatMap((plot,index)=>plot.open ? [{
    index, plant:plot.plant, policy:plot.policy??defaultPolicy,
    readySince:plot.plant?.readySince??Infinity,
    preferred:Number((plot.policy??defaultPolicy).mode===state.automation.preferred)
  }] : [])
  candidates.sort((a,b)=>b.policy.priority-a.policy.priority || b.preferred-a.preferred ||
    a.readySince-b.readySince || a.index-b.index)
  const capacity=evolution.helperThroughput[state.helperLevel]
  let actions=0
  const replant=state.automation.replant && state.helperLevel>=evolution.helperReplantLevel
  for (const {index,plant,policy} of candidates) {
    if (actions>=capacity) break
    if (plant?.lives===0) {
      if (state.automation.cleanup && finish(execute(state,{type:'cleanup',plot:index,expectedId:plant.id}))) {
        actions++
        measure(state,plant.species,{helperCleanups:1})
      }
    } else if (plant) {
      if (plant.readySince===null || !policy.harvest || policy.mode==='support' ||
        plant.lives===1 && isValuablePlant(state,plant)) continue
      const fruits=fruitCount(plantStats(plant.species,plant),plant.fruitRoll)
      if (basketCount(state)+fruits>basketCapacity(state)) events.push(...autoSellGarden(state,true,fruits))
      if (finish(execute(state,{type:'harvest',plot:index,expectedId:plant.id,cycle:plant.lives}))) {
        events.push('HelperHarvested:'+index)
        actions++
        measure(state,plant.species,{helperHarvests:1})
      }
    } else if (replant && policy.replant && availableStock(state,policy.replant.species,policy.replant.profile)>0) {
      const {species,profile}=policy.replant
      if (finish(execute(state,{type:'plant',plot:index,species,stock:profile}))) {
        events.push('AutoPlanted:'+index)
        actions++
        measure(state,species,{helperReplants:1})
      }
    }
  }
  measure(state,'garden',{helperUsed:actions,helperCapacity:capacity})

  if (state.stallLevel>=3) {
    const candidates=state.basket.slice()
    for (const batch of candidates) {
      if (!batch.profile || protectedHarvest(state,batch)) continue
      const origin=batch.lots[0]?.origin
      if (!origin || !['seed','breeding'].includes(origin.mode)) continue
      if (origin.mode==='breeding' && !state.automation.extractPollinated ||
        !state.automation.extractPollinated && batch.lots.some(l=>l.crossPending)) continue
      const target=productionTarget(state,origin.plot,batch.species)
      if (origin.mode==='seed' && stockCount(state,batch.species,target.profile)>=target.count &&
        !batch.lots.some(l=>l.crossPending)) continue
      const count=batch.lots[0].remaining
      if (extractionYield(batch,count).seeds || batch.lots[0].crossPending) finish(execute(state,{type:'extractSeeds',id:batch.id,count}))
    }
  }

  return events
}

function surplusSeeds(state:GameState,reserved:Map<string,number>) {
  if (state.stallLevel<3 || !state.automation.sellSeeds) return []
  return allSeedPacks(state).flatMap(pack=>{
    const wanted=state.plots.reduce((total,plot)=>{
      const choice=plot.policy?.replant
      return total+(choice?.species===pack.species && sameProfile(choice.profile,pack) ? Math.max(1,plot.policy!.target) : 0)
    },0)
    const unreserved=seedsForSale(state,pack,reserved)
    const count=Math.min(unreserved,pack.count-Math.max(1,wanted))
    if (count<=0) return []
    const favorable=marketQuote(state,pack.species,'seed').pricePercent>=saleMinimum(state.trading)
    return [{pack,count,favorable}]
  })
}

function seedsForSale(state:GameState,pack:ReturnType<typeof allSeedPacks>[number],reserved:Map<string,number>) {
  const key=profileKey(pack.species,pack)
  const held=reserved.get(key)??0
  const totalHeld=[...reserved].reduce((total,[profile,count])=>profile.startsWith(pack.species+'/') ? total+count : total,0)
  const totalStock=allSeedPacks(state).reduce((total,other)=>other.species===pack.species ? total+other.count : total,0)
  return Math.min(availableStock(state,pack.species,pack)-held,totalStock-(state.reserves[pack.species]??0)-totalHeld)
}

export function sellSurplusSeeds(state:GameState,reserved=new Map<string,number>()):string[] {
  const events:string[]=[]
  for (const {pack,count,favorable} of surplusSeeds(state,reserved)) {
    if (!favorable) continue
    const available=seedsForSale(state,pack,reserved)
    if (available<=0) continue
    const result=execute(state,{type:'sellSeeds',species:pack.species,profile:pack,count:Math.min(count,available)})
    if (result.ok) events.push(...result.events)
  }
  return events
}
