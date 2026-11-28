import { measure } from './analytics'
import { evolution, market } from './config'
import { execute } from './commands'
import { canonical, plantStats, profileKey, quantity, sameProfile, stockCount } from './genetics'
import type { GameState, Plot, PlotMode, PlotPolicy } from './model'
import { basketCapacity, basketCount } from './queries'
import { allSeedPacks, availableStock, defaultPolicy, isValuablePlant, productionTarget, protectedHarvest } from './stock-policy'
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
  if (policy.mode==='support' || plant?.lives===1 && isValuablePlant(state,plant)) return 'protected'
  if (plant) {
    if (!policy.harvest) return 'manual'
    if (plant.readySince===null) return 'growing'
    const stats=plantStats(plant.species,plant)
    if (basketCount(state)+quantity(stats.fruits,stats.fruitYieldModifier,plant.fruitRoll)>basketCapacity(state))
      return saleStatus(state)==='price' ? 'awaitingSale' : 'full'
    return 'busy'
  }
  if (!state.automation.replant || policy.mode==='manual' && !policy.replant) return 'manual'
  const choice=policy.replant
  if (!choice) return 'profile'
  if (!stockCount(state,choice.species,choice.profile)) return 'noSeeds'
  return availableStock(state,choice.species,choice.profile) ? 'busy' : 'reserve'
}

export function workGarden(state:GameState):string[] {
  const events:string[]=[]
  const finish=(result:ReturnType<typeof execute>)=>{
    if (result.ok) events.push(...result.events)
    return result.ok
  }
  const ready=state.plots.flatMap((plot,index)=>{
    const plant=plot.plant
    const policy=plot.policy??defaultPolicy
    if (!plant || plant.readySince===null || !policy.harvest) return []
    if (plant.lives===1 && (isValuablePlant(state,plant) || policy.mode==='support')) return []
    const stats=plantStats(plant.species,plant)
    return [{index,plant,readySince:plant.readySince,priority:policy.priority,
      preferred:Number(policy.mode===state.automation.preferred),fruits:quantity(stats.fruits,stats.fruitYieldModifier,plant.fruitRoll)}]
  }).sort((a,b)=>b.priority-a.priority || b.preferred-a.preferred || a.readySince-b.readySince || a.index-b.index)
  let gathered=0
  let space=basketCapacity(state)-basketCount(state)
  for (const {index,plant,fruits} of ready) {
    if (gathered>=evolution.helperThroughput[state.helperLevel]) break
    if (fruits>space) {
      events.push(...autoSellGarden(state,true,fruits))
      space=basketCapacity(state)-basketCount(state)
    }
    if (fruits>space) continue
    if (finish(execute(state,{type:'harvest',plot:index,expectedId:plant.id,cycle:plant.lives}))) {
      events.push('HelperHarvested:'+index)
      space-=fruits
      gathered++
    }
  }

  measure(state,'garden',{helperUsed:gathered,helperCapacity:evolution.helperThroughput[state.helperLevel]})

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

  if (state.automation.replant) state.plots.forEach((plot,index)=>{
    const choice=plot.policy?.replant
    if (plot.open && !plot.plant && choice && availableStock(state,choice.species,choice.profile)>0) {
      if (finish(execute(state,{type:'plant',plot:index,species:choice.species,stock:choice.profile}))) events.push('AutoPlanted:'+index)
    }
  })

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
