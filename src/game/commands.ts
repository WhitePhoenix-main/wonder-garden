import type { Command, GameState, Result } from './model'
import { adjacent, autoSellOffer, basketLevels, bedLevels, helperLevels, isHybrid, speciesIds, speciesInfo } from './config'
import { basketCapacity, canRecoverGarden, plantingIssue, removalIssue, expansionCost } from './queries'
import { decorate } from './decor'
import { newPlant } from './state'
import { sellBasket } from './trade'
import { harvest } from './harvest'
import { common, changeStock, nextRandom } from './genetics'

function success(...events: string[]): Result {
  return {ok: true, events}
}

function failure(reason: string): Result {
  return {ok: false, reason}
}

export function execute(state: GameState, command: Command): Result {
  switch (command.type) {
    case 'dismissHybrid': state.pendingHybrid=null;return success('HintDismissed')
    case 'tutorialBranch': state.tutorialBranch=command.branch;return success('BranchChosen')
    case 'sell': return success(...sellBasket(state))
    case 'upgradeHelper': {
      if (!state.sold) return failure('firstSale')
      if (state.helperLevel === 3 || command.target !== state.helperLevel + 1) return failure('helperLevel')
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
      state.sellRemaining = autoSellOffer.intervalSec
      const events = ['AutoSellEnabled']
      if (state.basket.length === basketCapacity(state)) events.push(...sellBasket(state))
      return success(...events)
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
    const cost = expansionCost(state)
    if (cost === null) return failure('plotOpen')
    if (state.coins < cost) return failure('noCoins')
    state.coins -= cost
    plot.open = true
    return state.planted.length === speciesIds.length && state.plots.every(p => p.open)
      ? success('PlotCleared','GardenCompleted') : success('PlotCleared')
  }
  if (!plot.open) return failure('plotClosed')

  switch (command.type) {
    case 'emergencyRadish':
      if (!canRecoverGarden(state)) return failure('recoveryUnavailable')
      plot.plant = newPlant(state.nextId++,'radish',common,nextRandom(state))
      return success('Planted')
    case 'harvest': return harvest(state,command)
    case 'upgrade': {
      if (!state.sold) return failure('firstSale')
      if (plot.level === 3) return failure('maxLevel')
      const level = plot.level === 1 ? 2 : 3
      const cost = bedLevels[level].upgradeCost
      if (state.coins < cost) return failure('noCoins')
      state.coins -= cost
      plot.level = level
      return success('BedUpgraded')
    }
    case 'plant': {
      const displaced = plot.plant
      const issue = plantingIssue(state,command.plot,command.species,command.replaceId,command.stock)
      if (issue) return failure(issue)
      const price = speciesInfo[command.species].seedPrice

      if (command.stock || isHybrid(command.species)) changeStock(state,command.species,command.stock??common,-1)
      else if (price !== null) state.coins -= price
      if (displaced) state.nursery.push(displaced)
      plot.plant = newPlant(state.nextId++, command.species,command.stock,nextRandom(state))
      const events = displaced ? ['PlantStored','Planted'] : ['Planted']
      if (!state.planted.includes(command.species)) {
        state.planted.push(command.species)
        if (state.planted.length === speciesIds.length && state.plots.every(p => p.open)) events.push('GardenCompleted')
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
      const [plant] = state.nursery.splice(index, 1)
      if (plant.readySince !== null) plant.readySince = state.playTime
      plot.plant = plant
      return success('PlantReturned')
    }
  }
}
