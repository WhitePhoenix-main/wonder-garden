import { measure, observeDraft, commitObservation } from './analytics'
import type { BedLevel, Command, GameState, IslandId, Result } from './model'
import { adjacent, autoSellOffer, basketLevels, bedLevels, helperLevels, isHybrid, plotCount, speciesIds, speciesInfo } from './config'
import { canRecoverGarden, chooseResearchDirection, chooseResearchDonor, gardenBatchTargets, plantingIssue, removalIssue, expansionCost } from './queries'
import { decorate } from './decor'
import { newPlant } from './state'
import { groupedSaleIssue, sellBasket, sellReadyFruit, trade } from './trade'
import { availableStock, protectedHarvest } from './stock-policy'
import { harvest } from './harvest'
import { common, changeStock, nextRandom } from './genetics'
import { milestones, recordPlanting } from './collection'
import { evolve, isBusy } from './evolution'

function success(...events: string[]): Result {
  return {ok: true, events}
}

function failure(reason: string): Result {
  return {ok: false, reason}
}

export function execute(state: GameState, command: Command): Result {
  const result=applyMeasured(state,command)
  if (result.ok && result.events.length) milestones(state)
  return result
}

function applyMeasured(state:GameState,command:Command):Result {
  const before=state.coins
  const result=apply(state,command)
  if (!result.ok || command.type==='bulk') return result
  const spent=before-state.coins
  if (command.type==='plant' || command.type==='repeatPlant') measure(state,command.species,{planted:1,seedCost:spent})
  else if (command.type==='emergencyRadish') measure(state,'radish',{planted:1})
  else if (command.type==='fulfillOrder') measure(state,'garden',{orders:-spent})
  else if (command.type==='startCross' || command.type==='startClone') measure(state,'garden',{breedingCost:spent})
  else if (spent>0) measure(state,'garden',{construction:spent})
  for (const pack of result.obtained??[]) measure(state,pack.species,{seeds:pack.count})
  return result
}

function completed(state:GameState) {
  return state.planted.length===speciesIds.length && state.plots.slice(0,plotCount).every(p=>p.open)
}

function gardenBatch(state:GameState,island:IslandId,kind:'harvest'|'cleanup'):Result {
  if (island!=='green' && island!=='valley') return failure('invalidPlot')
  const targets=gardenBatchTargets(state,island,kind)
  if (!targets.length) return failure(kind==='harvest' ? 'notReady' : 'notDead')
  const events:string[]=[]
  for (const plot of targets) {
    const plant=state.plots[plot].plant!
    const command=kind==='harvest' ? {type:kind,plot,expectedId:plant.id,cycle:plant.lives} as const :
      {type:kind,plot,expectedId:plant.id} as const
    const result=applyMeasured(state,command)
    if (result.ok) events.push(...result.events)
  }
  return events.length ? success(...events) : failure('basketFull')
}

function apply(state:GameState,command:Command):Result {
  switch (command.type) {
    case 'bulk': {
      if (!command.commands.length || command.commands.length>256) return failure('invalidQuantity')
      const scratch=structuredClone(state)
      observeDraft(state,scratch)
      const events:string[]=[]
      const obtained:NonNullable<Extract<Result,{ok:true}>['obtained']>=[]
      for (const item of command.commands) {
        if (!['plant','extractSeeds','sellHarvest','sellSeeds'].includes(item.type)) return failure('invalidQuantity')
        if (item.type==='plant' && scratch.plots[item.plot]?.plant) return failure('occupied')
        if (item.type==='plant' && item.stock && !availableStock(scratch,item.species,item.stock)) return failure('seedReserved')
        if (item.type==='extractSeeds' || item.type==='sellHarvest') {
          const batch=scratch.basket.find(b=>b.id===item.id)
          if (batch && (protectedHarvest(scratch,batch) || item.type==='sellHarvest' && batch.lots.some(l=>l.crossPending))) return failure('protectedItem')
        }
        if (item.type==='sellHarvest' || item.type==='sellSeeds') {
          const issue=groupedSaleIssue(scratch,item)
          if (issue) return failure(issue)
        }
        const result=applyMeasured(scratch,item)
        if (!result.ok) return result
        events.push(...result.events)
        if (result.obtained) obtained.push(...result.obtained)
      }
      Object.assign(state,scratch)
      commitObservation(state,scratch)
      return {ok:true,events,obtained}
    }
    case 'upgradeGreenhouse': case 'upgradeStall':
    case 'startCross': case 'collectCross': case 'startClone': case 'collectClone': case 'fulfillOrder': case 'declineOrder':
    case 'restoreBridge': case 'travel': case 'protectPlant': case 'protectProfile': case 'favoriteProfile':
    case 'setReserve': case 'plotPolicy': case 'plotTemplate': case 'setTrading': case 'setAutomation': return evolve(state,command)
    case 'assignProduction': case 'moveProduction': case 'collectProduction': return evolve(state,command)
    case 'gatherReady': return gardenBatch(state,command.island,'harvest')
    case 'clearWithered': return gardenBatch(state,command.island,'cleanup')
    case 'researchDirection': return chooseResearchDirection(state,command.plot,command.expectedId,command.recipeId)
    case 'researchDonor': return chooseResearchDonor(state,command.plot,command.expectedId,command.recipeId,command.donor,command.donorId)
    case 'dismissHybrid': state.pendingHybrid=null;return success('HintDismissed')
    case 'tutorialBranch': state.tutorialBranch=command.branch;return success('BranchChosen')
    case 'sell': return success(...sellBasket(state))
    case 'sellReadyFruit': return success(...sellReadyFruit(state))
    case 'sellHarvest':
    case 'sellSeeds':
    case 'extractSeeds': return trade(state,command)
    case 'upgradeHelper': {
      if (!state.sold) return failure('firstSale')
      if (state.helperLevel === 5 || command.target !== state.helperLevel + 1) return failure('helperLevel')
      const offer = helperLevels[command.target]
      if (state.coins < offer.upgradeCost) return failure('noCoins')
      state.coins -= offer.upgradeCost
      state.helperLevel = command.target
      state.harvestRemaining = offer.intervalSec!
      return success('HelperUpgraded')
    }
    case 'buyAutoSell': {
      if (state.autoSell) return failure('alreadyAutomated')
      if (state.helperLevel < autoSellOffer.minHelperLevel) return failure('hireFirst')
      if (state.coins < autoSellOffer.cost) return failure('noCoins')
      state.coins -= autoSellOffer.cost
      state.autoSell = true
      state.stallLevel = 2
      state.sellRemaining = autoSellOffer.intervalSec
      return success('AutoSellEnabled')
    }
    case 'buyDecor':
    case 'placeDecor':
    case 'storeDecor': return decorate(state,command)
    case 'upgradeBasket': {
      if (!state.sold) return failure('firstSale')
      const offer = basketLevels[command.target]
      if (!offer || command.target !== state.basketLevel + 1) return failure('basketLevel')
      if (state.coins < offer.upgradeCost) return failure('noCoins')
      state.coins -= offer.upgradeCost
      state.basketLevel = command.target
      return success('BasketUpgraded')
    }
    case 'showOccupiedHint':
      if (state.occupiedHintShown || state.tutorialSkipped || !state.sold) return success()
      state.occupiedHintShown = true
      return success('OccupiedHintShown')
    case 'skipTutorial':
      state.tutorialSkipped = true
      return success('TutorialSkipped')
    case 'tutorialSeen':
      if (typeof command.id!=='string' || !/^[a-z][a-z0-9-]{0,39}$/.test(command.id)) return failure('invalidPolicy')
      if (state.tutorialSeen.includes(command.id)) return success()
      if (state.tutorialSeen.length>=64) return failure('invalidPolicy')
      state.tutorialSeen.push(command.id)
      return success('TutorialUpdated')
    case 'restartTutorial':
      state.tutorialSeen = []
      state.tutorialSkipped = false
      return success('TutorialUpdated')
    case 'music':
      state.musicMuted = command.muted
      return success('SoundChanged')
    case 'sound':
      state.muted = command.muted
      return success('SoundChanged')
    case 'language':
      state.lang = command.lang
      return success('LanguageChanged')
    case 'move': {
      const source = state.plots[command.from]
      const target = state.plots[command.to]
      if (!source || !target) return failure('invalidPlot')
      if (!source.open || !target.open) return failure('plotClosed')
      const plant = source.plant
      if (!plant) return failure('empty')
      if (!plant.lives || target.plant?.lives===0) return failure('deadPlant')
      if (source === target) return failure('samePlot')
      source.plant = target.plant
      target.plant = plant
      return success('PlantMoved')
    }
  }

  const plot = state.plots[command.plot]
  if (!plot) return failure('invalidPlot')
  if (command.type === 'clear') {
    if (plot.open) return failure('plotOpen')
    if (!state.sold) return failure('firstSale')
    if (!adjacent(command.plot).some(index => state.plots[index].open)) return failure('notAdjacent')
    const cost = expansionCost(state,command.plot)
    if (cost === null) return failure('plotOpen')
    if (state.coins < cost) return failure('noCoins')
    state.coins -= cost
    plot.open = true
    return command.plot<plotCount && completed(state)
      ? success('PlotCleared','GardenCompleted') : success('PlotCleared')
  }
  if (!plot.open) return failure('plotClosed')

  switch (command.type) {
    case 'emergencyRadish':
      if (plot.plant || !canRecoverGarden(state)) return failure('recoveryUnavailable')
      plot.plant = newPlant(state.nextId++,'radish',common,nextRandom(state))
      recordPlanting(state,plot.plant)
      if (!state.planted.includes('radish')) state.planted.push('radish')
      return success('Planted')
    case 'harvest': return harvest(state,command)
    case 'cleanup':
      if (!plot.plant || plot.plant.id!==command.expectedId) return failure('stalePlant')
      if (plot.plant.lives!==0) return failure('notDead')
      state.protectedPlants=state.protectedPlants.filter(id=>id!==command.expectedId)
      plot.plant = null
      return success('PlantCleaned','PlantCleaned:'+command.plot)
    case 'upgrade': {
      if (!state.sold) return failure('firstSale')
      if (plot.level === 5) return failure('maxLevel')
      const level = (plot.level+1) as BedLevel
      const cost = bedLevels[level].upgradeCost
      if (state.coins < cost) return failure('noCoins')
      state.coins -= cost
      plot.level = level
      return success('BedUpgraded')
    }
    case 'repeatPlant':
    case 'plant': {
      const displaced = plot.plant
      const issue = plantingIssue(state,command.plot,command.species,command.type==='plant' ? command.replaceId : undefined,command.stock)
      if (issue) return failure(issue)
      if (command.type==='repeatPlant' && (!command.stock || !availableStock(state,command.species,command.stock)))
        return failure('seedReserved')
      const price = speciesInfo[command.species].seedPrice

      if (command.stock || isHybrid(command.species)) {
        changeStock(state,command.species,command.stock??common,-1)
        state.firstSeedPlanting = true
      }
      else if (price !== null) state.coins -= price
      if (displaced) state.nursery.push(displaced)
      plot.plant = newPlant(state.nextId++, command.species,command.stock,nextRandom(state))
      recordPlanting(state,plot.plant)
      const events = displaced ? ['PlantStored','Planted'] : ['Planted']
      if (!state.planted.includes(command.species)) {
        state.planted.push(command.species)
        if (completed(state)) events.push('GardenCompleted')
      }
      return success(...events)
    }
    case 'compost':
    case 'store': {
      const issue = removalIssue(state,command.plot,command.expectedId,command.type)
      if (issue) return failure(issue)
      if (command.type === 'store') state.nursery.push(plot.plant!)
      plot.plant = null
      return success(command.type === 'store' ? 'PlantStored' : 'Composted')
    }
    case 'return': {
      if (plot.plant) return failure('occupied')
      const index = state.nursery.findIndex(plant => plant.id === command.id)
      if (index < 0) return failure('stalePlant')
      if (isBusy(state,command.id)) return failure('parentsBusy')
      const [plant] = state.nursery.splice(index, 1)
      if (plant.readySince !== null) plant.readySince = state.playTime
      plot.plant = plant
      return success('PlantReturned')
    }
  }
}
