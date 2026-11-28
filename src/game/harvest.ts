import { bedLevels, isHybrid, speciesInfo, valueScale } from './config'
import { changeStock, common, inherit, nextRandom, quantity, rules, strength } from './genetics'
import { auraBonus, basketCapacity, chance, experiments, seedUnlocked } from './queries'
import type { Command, GameState, Result } from './model'
import { sellBasket } from './trade'

export function harvest(s:GameState,c:Extract<Command,{type:'harvest'}>):Result {
  const plot=s.plots[c.plot], p=plot.plant
  if(!p || p.readySince===null)return {ok:false,reason:'notReady'}
  if(c.expectedId!==p.id || c.cycle!==p.lives)return {ok:false,reason:'stalePlant'}
  const e=c.experiment
  if(e && (!c.seeds || c.expectedId!==p.id || !experiments(s,c.plot).some(v=>v.result===e.result && v.donorId===e.donorId && v.layout===e.layout)))return {ok:false,reason:'stalePlant'}
  const data=speciesInfo[p.species], random=()=>nextRandom(s)
  const events=['Harvested']
  if(!c.seeds){
    const count=quantity(data.fruits,p.plus==='fruitful'?rules.fruitful[strength(p)]:0,p.fruitRoll)
    if(s.basket.length+count>basketCapacity(s))return {ok:false,reason:'basketFull'}
    const price=data.fruitValue*bedLevels[plot.level].priceMultiplier*(1+auraBonus(s,c.plot,'price'))
    const valueUnits=Math.round(price*(p.minus==='small'?1-rules.small:1)*valueScale)
    for(let i=0;i<count;i++)s.basket.push({species:p.species,valueUnits})
  }else{
    const count=quantity(data.ownSeeds,p.minus==='sparse'?-rules.sparse:0,random())
    const copyChance=Math.max(p.plus==='seedy'?rules.seedCopy[strength(p)]:rules.copy,auraBonus(s,c.plot,'propagation'))
    const copy=!!(p.plus || p.minus) && random()<copyChance
    changeStock(s,p.species,common,count-Number(copy))
    if(copy)changeStock(s,p.species,p,1)
    if(isHybrid(p.species))s.firstPropagation=true
    events.push('SeedPropagated:'+p.species,'OwnSeeds:'+count)
    if(e){
      const first=!seedUnlocked(s,e.result)
      if(random()<chance(s,e.result)){
        const donor=s.plots.find(b=>b.plant?.id===e.donorId)!.plant!
        const profile=first && e.result==='solar_strawberry'?common:inherit(p,donor,random)
        changeStock(s,e.result,profile,1)
        s.failures[e.result]=0
        if(first){
          if(s.revealed.length===0)s.pendingHybrid=e.result
          s.revealed.push(e.result)
        }
        events.push((first?'RecipeRevealed:':'SeedPropagated:')+e.result)
      }else{s.failures[e.result]++;events.push('ExperimentFailed')}
    }
  }
  s.firstHarvest=true
  p.lives--
  if(p.lives===0){plot.plant=null;events.push('Withered')}
  else{p.progress=0;p.readySince=null;p.fruitRoll=random()}
  if(s.autoSell && s.basket.length===basketCapacity(s))events.push(...sellBasket(s))
  return {ok:true,events}
}
