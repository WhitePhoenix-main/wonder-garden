import { autoSellOffer, evolution, isSpecies, plotCount, valley } from './config'
import { harmony } from './decor'
import { canonical, profileKey, validGenome } from './genetics'
import { collectCross, startCross } from './greenhouse'
import { plotModes, rarities, type EvolutionCommand, type GameState, type PlotPolicy, type Result } from './model'
import { fulfillOrder } from './orders'

export { isBusy } from './greenhouse'
export { profileKey, rarityOdds } from './genetics'
export { orderQuote } from './orders'
export { availableStock, defaultPolicy, protectedProfile } from './stock-policy'

const ok = (event:string):Result => ({ok:true,events:[event]})
const fail = (reason:string):Result => ({ok:false,reason})

export function bridgeIssue(state:GameState):string|null {
  if (state.plots.length>plotCount) return 'bridgeRestored'
  const {species,plots,harmony:required,cost}=evolution.bridge
  if (state.planted.length<species || state.plots.filter(p=>p.open).length<plots || harmony(state,'green')<required) return 'bridgeProgress'
  if (state.coins<cost) return 'noCoins'
  return null
}

export function validPlotPolicy(policy:PlotPolicy):boolean {
  return !!policy && plotModes.includes(policy.mode) && Number.isInteger(policy.priority) && policy.priority>=0 &&
    policy.priority<=3 && typeof policy.harvest==='boolean' && Number.isSafeInteger(policy.target) && policy.target>=0 &&
    (policy.replant===null || !!policy.replant && isSpecies(policy.replant.species) &&
      validGenome(policy.replant.species,policy.replant.profile,true))
}

export function validAutomation(settings:GameState['automation']):boolean {
  return !!settings && [settings.enabled,settings.replant,settings.extractPollinated,settings.sellSeeds,settings.sellFruit].every(v=>typeof v==='boolean') &&
    (settings.preferred===null || plotModes.includes(settings.preferred)) &&
    (settings.saleRarity===null || rarities.includes(settings.saleRarity))
}

function setFlag<T>(list:T[],value:T,enabled:boolean):T[] {
  return enabled ? list.includes(value) ? list : [...list,value] : list.filter(v=>v!==value)
}

export function evolve(state:GameState,command:Exclude<EvolutionCommand,{type:'bulk'}>):Result {
  switch (command.type) {
    case 'upgradeGreenhouse':
    case 'upgradeStall': {
      const greenhouse=command.type==='upgradeGreenhouse'
      const current=greenhouse ? state.greenhouseLevel : state.stallLevel
      if (greenhouse && !state.revealed.length) return fail('nurseryLocked')
      if (!greenhouse && !state.sold) return fail('firstSale')
      if (current===5 || command.target!==current+1) return fail('maxLevel')
      if (!greenhouse && command.target===2 && state.helperLevel<autoSellOffer.minHelperLevel) return fail('hireFirst')
      const cost=(greenhouse ? evolution.greenhouseCosts : evolution.stallCosts)[command.target-1]
      if (state.coins<cost) return fail('noCoins')
      state.coins-=cost
      if (greenhouse) state.greenhouseLevel=command.target
      else {
        state.stallLevel=command.target
        if (command.target===2) {
          state.autoSell=true
          state.sellRemaining=autoSellOffer.intervalSec
        }
      }
      return ok(greenhouse ? 'GreenhouseUpgraded' : 'StallUpgraded')
    }
    case 'startCross': return startCross(state,command.parents)
    case 'collectCross': return collectCross(state,command.id)
    case 'fulfillOrder': return fulfillOrder(state,command.id)
    case 'declineOrder':
      if (!state.orders.some(o=>o.id===command.id)) return fail('itemChanged')
      state.orders=state.orders.filter(o=>o.id!==command.id)
      state.orderRefreshAt=state.playTime+evolution.orderCooldown
      return ok('OrderDeclined')
    case 'restoreBridge': {
      const issue=bridgeIssue(state)
      if (issue) return fail(issue)
      state.coins-=evolution.bridge.cost
      state.plots.push(...Array.from({length:valley.plotWidth*valley.plotHeight},(_,i)=>({
        open:valley.startOpen.includes(i),level:1 as const,plant:null
      })))
      return ok('BridgeRestored')
    }
    case 'travel':
      if (command.island!=='green' && (command.island!=='valley' || state.plots.length<=plotCount)) return fail('bridgeProgress')
      state.activeIsland=command.island
      return ok('IslandChanged')
    case 'protectPlant':
      if (!state.nursery.some(p=>p.id===command.id) && !state.plots.some(p=>p.plant?.id===command.id)) return fail('stalePlant')
      state.protectedPlants=setFlag(state.protectedPlants,command.id,command.enabled)
      for (const batch of state.basket) for (const lot of batch.lots) {
        if (lot.origin?.specimen===command.id) lot.origin.protected=command.enabled
      }
      return ok('ProtectionChanged')
    case 'protectProfile':
    case 'favoriteProfile': {
      if (!isSpecies(command.species) || !validGenome(command.species,command.profile,true)) return fail('invalidProfile')
      const key=profileKey(command.species,command.profile)
      if (command.type==='protectProfile') state.protectedProfiles=setFlag(state.protectedProfiles,key,command.enabled)
      else state.favorites=setFlag(state.favorites,key,command.enabled)
      return ok('ProfileChanged')
    }
    case 'setReserve': {
      if (state.stallLevel<3) return fail('stallLocked')
      if (!isSpecies(command.species) || command.profile && !validGenome(command.species,command.profile,true)) return fail('invalidProfile')
      if (!Number.isSafeInteger(command.count) || command.count<0) return fail('invalidQuantity')
      const key=command.profile ? profileKey(command.species,command.profile) : command.species
      if (command.count) state.reserves[key]=command.count
      else delete state.reserves[key]
      return ok('ReserveChanged')
    }
    case 'plotPolicy': {
      const plot=state.plots[command.plot]
      if (!plot?.open) return fail('plotClosed')
      if (!validPlotPolicy(command.policy)) return fail('invalidPolicy')
      const replant=command.policy.replant
      plot.policy={...command.policy,replant:replant ? {species:replant.species,profile:canonical(replant.profile)} : null}
      return ok('PlotPolicyChanged')
    }
    case 'setAutomation':
      if (!validAutomation(command.settings) || !state.helperLevel) return fail('invalidPolicy')
      if (state.stallLevel<3 && (command.settings.extractPollinated || command.settings.sellSeeds)) return fail('stallLocked')
      if (state.stallLevel<4 && command.settings.saleRarity!==null) return fail('stallLocked')
      state.automation={...command.settings}
      return ok('AutomationChanged')
  }
}
