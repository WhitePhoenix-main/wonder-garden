import { evolution } from './config'
import { execute } from './commands'
import { plantStats, quantity, sameProfile, stockCount } from './genetics'
import type { GameState } from './model'
import { basketCapacity, basketCount } from './queries'
import { allSeedPacks, availableStock, defaultPolicy, productionTarget, protectedHarvest, protectedProfile } from './stock-policy'
import { extractionYield } from './trade'

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
    if (plant.lives===1 && (state.protectedPlants.includes(plant.id) ||
      protectedProfile(state,plant.species,plant) || policy.mode==='support')) return []
    const stats=plantStats(plant.species,plant)
    return [{index,plant,readySince:plant.readySince,priority:policy.priority,
      preferred:Number(policy.mode===state.automation.preferred),fruits:quantity(stats.fruits,stats.fruitYieldModifier,plant.fruitRoll)}]
  }).sort((a,b)=>b.priority-a.priority || b.preferred-a.preferred || a.readySince-b.readySince || a.index-b.index)
  let gathered=0
  let space=basketCapacity(state)-basketCount(state)
  for (const {index,plant,fruits} of ready) {
    if (gathered>=evolution.helperThroughput[state.helperLevel]) break
    if (fruits>space) continue
    if (finish(execute(state,{type:'harvest',plot:index,expectedId:plant.id,cycle:plant.lives}))) {
      events.push('HelperHarvested:'+index)
      space-=fruits
      gathered++
    }
  }

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

export function sellSurplusSeeds(state:GameState):string[] {
  if (state.stallLevel<3 || !state.automation.sellSeeds) return []
  const events:string[]=[]
  for (const pack of allSeedPacks(state)) {
    const wanted=state.plots.reduce((total,plot)=>{
      const choice=plot.policy?.replant
      return total+(choice?.species===pack.species && sameProfile(choice.profile,pack) ? Math.max(1,plot.policy!.target) : 0)
    },0)
    const count=Math.min(availableStock(state,pack.species,pack),pack.count-Math.max(1,wanted))
    if (count<=0) continue
    const result=execute(state,{type:'sellSeeds',species:pack.species,profile:pack,count})
    if (result.ok) events.push(...result.events)
  }
  return events
}
