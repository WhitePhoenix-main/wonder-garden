import { evolution, speciesInfo } from './config'
import { canonical, changeStock, inherit, nextRandom, rarityOdds, stockCount } from './genetics'
import { rarities, type GameState, type Plant, type Result } from './model'

export const greenhouseTime=(state:GameState)=>state.playTime+(state.passive?.labSeconds??0)

export function isBusy(state:GameState, id:number):boolean {
  const now=greenhouseTime(state)
  return state.crosses.some(c=>!c.collected && c.readyAt>now && c.parents.includes(id)) ||
    state.clones.some(c=>c.readyAt>now && c.parent===id)
}

export function freeGreenhouseSlots(state:GameState):number {
  return evolution.crossSlots[state.greenhouseLevel-1] -
    state.crosses.filter(c=>!c.collected).length - state.clones.length
}

export function crossingQuote(state:GameState,a:Plant,b:Plant) {
  const base=rarityOdds(a.rarity,b.rarity)
  const highestParent=Math.max(rarities.indexOf(a.rarity),rarities.indexOf(b.rarity))
  const higher=base.map((weight,rank)=>rank>highestParent ? weight : 0)
  const target=higher.findIndex(Boolean)
  const key=target<0 ? null : a.species+'/'+rarities[target]
  const failures=key ? state.rarityProgress[key]??0 : 0
  const weights=failures>=evolution.rarityGuarantee-1 ? higher : base
  return {key,highestParent,failures,weights,base,...evolution.experiments[speciesInfo[a.species].generation]}
}

export function startCross(state:GameState, parents:[number,number]):Result {
  const level=state.greenhouseLevel
  if (level<2) return {ok:false,reason:'greenhouseLocked'}
  if (parents[0]===parents[1]) return {ok:false,reason:'sameParent'}
  const [a,b]=parents.map(id=>state.nursery.find(p=>p.id===id))
  if (!a?.lives || !b?.lives || a.species!==b.species) return {ok:false,reason:'invalidParents'}
  if (parents.some(id=>isBusy(state,id))) return {ok:false,reason:'parentsBusy'}
  if (freeGreenhouseSlots(state)<=0) return {ok:false,reason:'crossSlotsFull'}
  const offer=crossingQuote(state,a,b)
  if (state.coins<offer.cost) return {ok:false,reason:'noCoins'}
  const profile=inherit(a,b,()=>nextRandom(state),a.species,level===5 ? evolution.levelFiveInheritance : undefined,offer.weights)
  if (offer.key) {
    if (rarities.indexOf(profile.rarity)>offer.highestParent) delete state.rarityProgress[offer.key]
    else state.rarityProgress[offer.key]=offer.failures+1
  }
  state.coins-=offer.cost
  const startsAt=greenhouseTime(state)
  state.crosses.push({id:state.nextId++,parents:[...parents],species:a.species,profile,
    parentProfiles:[canonical(a),canonical(b)],
    startsAt,readyAt:startsAt+offer.seconds,collected:false})
  return {ok:true,events:['CrossStarted']}
}

export function canClone(plant:Plant):boolean {
  return plant.lives>0 && rarities.indexOf(plant.rarity)>=rarities.indexOf('rare')
}

export function startClone(state:GameState,id:number):Result {
  if (state.greenhouseLevel<3) return {ok:false,reason:'greenhouseLocked'}
  const plant=state.nursery.find(p=>p.id===id)
  if (!plant || !canClone(plant)) return {ok:false,reason:'cloneParent'}
  if (isBusy(state,id)) return {ok:false,reason:'parentsBusy'}
  if (freeGreenhouseSlots(state)<=0) return {ok:false,reason:'crossSlotsFull'}
  const offer=evolution.cloning[speciesInfo[plant.species].generation]
  if (state.coins<offer.cost) return {ok:false,reason:'noCoins'}
  state.coins-=offer.cost
  const startsAt=greenhouseTime(state)
  state.clones.push({id:state.nextId++,parent:id,species:plant.species,profile:canonical(plant),startsAt,readyAt:startsAt+offer.seconds})
  return {ok:true,events:['CloneStarted']}
}

export function collectClone(state:GameState,id:number):Result {
  const index=state.clones.findIndex(operation=>operation.id===id)
  if (index<0) return {ok:false,reason:'itemChanged'}
  const {species,profile,readyAt}=state.clones[index]
  if (readyAt>greenhouseTime(state)) return {ok:false,reason:'crossNotReady'}
  if (!Number.isSafeInteger(stockCount(state,species,profile)+1)) return {ok:false,reason:'invalidQuantity'}
  changeStock(state,species,profile,1)
  state.clones.splice(index,1)
  return {ok:true,events:['CloneCollected'],obtained:[{species,...profile,count:1}]}
}

export function collectCross(state:GameState,id:number):Result {
  const cross=state.crosses.find(c=>c.id===id && !c.collected)
  if (!cross) return {ok:false,reason:'itemChanged'}
  if (cross.readyAt>greenhouseTime(state)) return {ok:false,reason:'crossNotReady'}
  if (!Number.isSafeInteger(stockCount(state,cross.species,cross.profile)+1)) return {ok:false,reason:'invalidQuantity'}
  cross.collected=true
  changeStock(state,cross.species,cross.profile,1)
  return {ok:true,events:['CrossCollected'],obtained:[{species:cross.species,...cross.profile,count:1}]}
}
