import { evolution, speciesInfo } from './config'
import { common, sameProfile, stockCount, traits, changeStock } from './genetics'
import { buyers, rarities, type GameState, type Order, type OrderRequirement, type Profile, type Result, type Species } from './model'
import { allSeedPacks, availableStock, hasOtherSource, protectedHarvest } from './stock-policy'
import { consumeHarvest, seedSaleValue } from './trade'
import { marketQuote, recordDelivery } from './market'

type OrderItem = {id?:number; species:Species; profile?:Profile; count:number}

function matches(species:Species, profile:Profile, rule:OrderRequirement):boolean {
  return (!rule.species || rule.species===species) && (!rule.tier || rule.tier===speciesInfo[species].generation+1) &&
    (!rule.rarity || (rule.kind==='fruit' ? rarities.indexOf(profile.rarity)>=rarities.indexOf(rule.rarity) : profile.rarity===rule.rarity)) &&
    (!rule.trait || traits(profile).includes(rule.trait)) && (!rule.clean || profile.minus===null)
}

function seedOffer(state:GameState, species:Species, profile:Profile):number {
  const count=availableStock(state,species,profile)
  const min=speciesInfo[species].seedPrice!==null && sameProfile(profile,common) ||
    hasOtherSource(state,species,profile) ? 0 : 1
  return Math.min(count,Math.max(0,stockCount(state,species,profile)-min))
}

function plan(state:GameState, order:Order) {
  // Plan using only inventory copies, so overlapping lines share the same quantities and reserves.
  const availableState={...state,seeds:{...state.seeds},variants:state.variants.map(p=>({...p})),
    basket:state.basket.map(b=>({...b,lots:b.lots.map(l=>({...l}))}))}
  const lines=order.requirements.map(rule=>{
    const items:OrderItem[]=[]
    let supplied=0
    const candidates=rule.kind==='fruit' ? availableState.basket.flatMap(b=>{
      if (protectedHarvest(availableState,b) || b.lots.some(l=>l.crossPending || l.origin?.mode==='breeding')) return []
      if (!matches(b.species,b.profile??common,rule)) return []
      if (speciesInfo[b.species].seedPrice===null && !allSeedPacks(availableState).some(p=>p.species===b.species) &&
        !hasOtherSource(availableState,b.species,undefined,undefined,b.id)) return []
      return [{id:b.id,species:b.species,profile:b.profile??common,count:b.count}]
    }) : allSeedPacks(availableState).flatMap(p=>matches(p.species,p,rule) ?
      [{id:undefined,species:p.species,profile:p,count:seedOffer(availableState,p.species,p)}] : [])
    for (const item of candidates) {
      const count=Math.min(item.id===undefined ? seedOffer(availableState,item.species,item.profile) : item.count,rule.count-supplied)
      if (!count) continue
      if (item.id===undefined) changeStock(availableState,item.species,item.profile,-count)
      else {
        if (speciesInfo[item.species].seedPrice===null && !allSeedPacks(availableState).some(p=>p.species===item.species) &&
          !hasOtherSource(availableState,item.species,undefined,undefined,item.id)) continue
        consumeHarvest(availableState,availableState.basket.find(b=>b.id===item.id)!,count)
      }
      items.push({...item,count})
      supplied+=count
      if (supplied===rule.count) break
    }
    return {required:rule.count,available:supplied,items}
  })
  return {complete:lines.every(line=>line.available>=line.required),lines,availableState}
}

export function orderQuote(state:GameState,order:Order) {
  const {complete,lines}=plan(state,order)
  return {complete,lines}
}

export function fulfillOrder(state:GameState,id:number):Result {
  const order=state.orders.find(order=>order.id===id)
  if (!order) return {ok:false,reason:'itemChanged'}
  const {complete,lines,availableState}=plan(state,order)
  if (!complete) return {ok:false,reason:'orderResources'}
  if (!Number.isSafeInteger(state.coins+order.reward)) return {ok:false,reason:'coinLimit'}
  state.coins+=order.reward
  state.basket=availableState.basket
  state.seeds=availableState.seeds
  state.variants=availableState.variants
  for (const line of lines) for (const item of line.items) {
    recordDelivery(state,item.species,item.id===undefined ? 'seed' : 'fruit',item.count)
  }
  state.orders=state.orders.filter(order=>order.id!==id)
  state.ordersCompleted++
  state.orderRefreshAt=state.playTime+evolution.orderCooldown
  return {ok:true,events:['OrderFulfilled']}
}

export function refreshOrders(state:GameState):boolean {
  if (!state.revealed.length || !state.sold || state.playTime<state.orderRefreshAt) return false
  const slots=evolution.orderSlots[state.stallLevel-1]
  if (state.orders.length>=slots) return false
  const species=state.planted.filter(id=>speciesInfo[id].seedPrice!==null)
  const offers=allSeedPacks(state).filter(pack=>seedOffer(state,pack.species,pack)>0)
  const fruitSources=state.basket.filter(b=>!protectedHarvest(state,b) && !b.lots.some(l=>l.crossPending || l.origin?.mode==='breeding'))
  while (state.orders.length<slots) {
    const id=state.nextId++
    const buyer=buyers[id%buyers.length]
    const target=species[id%species.length]??'radish'
    const [min,max]=evolution.orderFruitCount
    const fruit:OrderRequirement={kind:'fruit',species:target,count:Math.min(max,min+state.stallLevel-1)}
    let requirements=[fruit]
    let basis=fruit.count*speciesInfo[target].fruitValue*marketQuote(state,target,'fruit').pricePercent/100
    if (state.stallLevel>=4 && fruitSources.length && buyer==='florist') {
      const item=fruitSources[id%fruitSources.length]
      const count=Math.min(item.count,fruit.count)
      const tier=speciesInfo[item.species].generation+1
      const enhanced:OrderRequirement={kind:'fruit',tier,rarity:item.profile?.rarity,count}
      if (orderQuote(state,{id,buyer,reward:0,requirements:[enhanced]}).complete) {
        requirements=[enhanced]
        basis=count*speciesInfo[item.species].fruitValue*marketQuote(state,item.species,'fruit').pricePercent/100
      }
    }
    if (state.stallLevel>=3 && offers.length && ['alchemist','botanist','collector'].includes(buyer)) {
      const pack=offers[id%offers.length]
      const count=Math.min(evolution.orderSeedCount[1],seedOffer(state,pack.species,pack))
      const seed:OrderRequirement={kind:'seed',species:pack.species,rarity:pack.rarity,trait:traits(pack)[0],
        clean:pack.minus===null,count}
      requirements=state.stallLevel===5 ? [...requirements,seed] : [seed]
      basis=(state.stallLevel===5 ? basis : 0)+count*seedSaleValue(pack.species,pack,state)
    }
    state.orders.push({id,buyer,requirements,reward:Math.max(evolution.orderMinReward,Math.ceil(basis*evolution.orderBonus))})
  }
  return true
}
