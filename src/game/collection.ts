import { evolution, plotCount } from './config'
import { canonical, profileKey, sameProfile, traits } from './genetics'
import { rarities, type GameState, type Plant } from './model'
import { harmony } from './decor'
import { allSeedPacks } from './stock-policy'

export function recordPlanting(state:GameState, plant:Plant) {
  const profile=canonical(plant)
  const record=state.collection.find(row=>row.species===plant.species && row.rarity===plant.rarity)
  if (!record) {
    state.collection.push({species:plant.species,rarity:plant.rarity,profile,planted:1,harvested:0,profiles:[profile]})
    return
  }
  record.planted++
  if (!record.profiles.some(p=>sameProfile(p,profile))) record.profiles.push(profile)
  if (record.profile.minus && !profile.minus) record.profile=profile
}

export function recordHarvest(state:GameState, plant:Plant, count:number) {
  const record=state.collection.find(row=>row.species===plant.species && row.rarity===plant.rarity)
  if (record) record.harvested+=count
}

export function milestones(state:GameState):string[] {
  const green=state.plots.slice(0,plotCount).filter(p=>p.open).length
  const developed = state.plots.length>plotCount
  const planted=(rank:number)=>state.collection.some(row=>rarities.indexOf(row.rarity)>=rank)
  const reserveEntries=Object.entries(state.reserves)
  const packs=reserveEntries.length ? allSeedPacks(state) : []
  const hasReserve=reserveEntries.some(([key,count])=>count>0 && packs.reduce((total,pack)=>
    total+(pack.species===key || profileKey(pack.species,pack)===key ? pack.count : 0),0)>=count)
  const goals:Record<string,boolean>={
    gardenComplete:state.planted.length===12 && green===plotCount,
    firstCross:state.crosses.some(c=>c.collected),
    foundRare:planted(2), foundEpic:planted(3), foundLegendary:planted(4),
    multiTrait:state.collection.some(r=>traits(r.profile).length>1),
    cleanRare:state.collection.some(r=>rarities.indexOf(r.rarity)>=2 && r.profiles.some(p=>p.minus===null)),
    firstOrder:state.ordersCompleted>0, tenOrders:state.ordersCompleted>=10,
    advancedStall:state.stallLevel>=3, advancedGreenhouse:state.greenhouseLevel>=3,
    seedReserve:hasReserve, automatedGarden:state.helperLevel>=4 && state.automation.replant,
    harmony100:harmony(state,'green')>=100, harmony200:harmony(state,'green')>=200,
    bridgeRestored:developed,
    valleyComplete:developed && state.plots.slice(plotCount).every(p=>p.open),
    valleyDecor:state.decorations.filter(d=>d.slot?.startsWith('valley_')).length>=3,
    allSpecies:state.planted.length===12, fullCollection:state.collection.length===60
  }
  for (const rarity of rarities) goals['all_'+rarity]=state.collection.filter(r=>r.rarity===rarity).length===12
  const newGoals=Object.keys(goals).filter(key=>goals[key] && !state.achievements.includes(key))
  state.achievements.push(...newGoals)

  const values:Record<string,number>={species:state.planted.length,plots:green,bridge:Number(developed),
    collection:state.collection.length,orders:state.ordersCompleted}
  const rank=evolution.rankRequirements.reduce((rank,requirement,index) => Object.entries(requirement)
    .every(([key,minimum])=>values[key]>=Number(minimum)) ? index : rank,0)
  state.rank=Math.max(state.rank,rank)
  return newGoals
}
