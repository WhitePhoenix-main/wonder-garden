import { evolution, speciesInfo } from './config'
import { canonical, changeStock, inherit, nextRandom, stockCount } from './genetics'
import type { GameState, Result } from './model'

export function isBusy(state:GameState, id:number):boolean {
  return state.crosses.some(c=>!c.collected && c.readyAt>state.playTime && c.parents.includes(id))
}

export function startCross(state:GameState, parents:[number,number]):Result {
  const level=state.greenhouseLevel
  if (level<2) return {ok:false,reason:'greenhouseLocked'}
  if (parents[0]===parents[1]) return {ok:false,reason:'sameParent'}
  const [a,b]=parents.map(id=>state.nursery.find(p=>p.id===id))
  if (!a || !b || a.species!==b.species) return {ok:false,reason:'invalidParents'}
  if (parents.some(id=>isBusy(state,id))) return {ok:false,reason:'parentsBusy'}
  if (state.crosses.filter(c=>!c.collected).length>=evolution.crossSlots[level-1]) return {ok:false,reason:'crossSlotsFull'}
  const offer=evolution.experiments[speciesInfo[a.species].generation]
  if (state.coins<offer.cost) return {ok:false,reason:'noCoins'}
  const profile=inherit(a,b,()=>nextRandom(state),a.species,level===5 ? evolution.levelFiveInheritance : undefined)
  state.coins-=offer.cost
  state.crosses.push({id:state.nextId++,parents:[...parents],species:a.species,profile,
    parentProfiles:[canonical(a),canonical(b)],
    startsAt:state.playTime,readyAt:state.playTime+offer.seconds,collected:false})
  return {ok:true,events:['CrossStarted']}
}

export function collectCross(state:GameState,id:number):Result {
  const cross=state.crosses.find(c=>c.id===id && !c.collected)
  if (!cross) return {ok:false,reason:'itemChanged'}
  if (cross.readyAt>state.playTime) return {ok:false,reason:'crossNotReady'}
  if (!Number.isSafeInteger(stockCount(state,cross.species,cross.profile)+1)) return {ok:false,reason:'invalidQuantity'}
  cross.collected=true
  changeStock(state,cross.species,cross.profile,1)
  return {ok:true,events:['CrossCollected'],obtained:[{species:cross.species,...cross.profile,count:1}]}
}
