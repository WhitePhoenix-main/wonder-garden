import type { Command, GameState, Result } from './model'
import { adjacent, autoSellOffer, basketLevels, bedLevels, helperLevels, isHybrid, isSpecies, recipes, speciesIds, speciesInfo, valueScale } from './config'
import { auraBonus, basketCapacity, canRecoverGarden, canReplace, expansionCost, isRecipeActive, isRecipeRevealed, seedUnlocked } from './queries'
import { decorate } from './decor'
import { newPlant } from './state'
import { sellBasket } from './trade'

function success(...events: string[]): Result {
  return {ok: true, events}
}

function failure(reason: string): Result {
  return {ok: false, reason}
}

export function execute(state: GameState, command: Command): Result {
  switch (command.type) {
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
      plot.plant = newPlant(state.nextId++,'radish')
      return success('Planted')
    case 'harvest': {
      const plant = plot.plant
      if (!plant || plant.readySince === null) return failure('notReady')
      if (state.basket.length >= basketCapacity(state)) return failure('basketFull')
      const value = speciesInfo[plant.species].fruitValue * bedLevels[plot.level].priceMultiplier
      const valueUnits = Math.round(value * (1 + auraBonus(state, command.plot, 'price')) * valueScale)
      state.basket.push({species: plant.species, valueUnits})
      plant.progress = 0
      plant.readySince = null

      state.firstHarvest = true
      const events = ['Harvested']
      for (const recipe of recipes) {
        if (!isRecipeActive(state, command.plot, recipe)) continue
        if (++state.recipeProgress[recipe.result] === recipe.harvests) {
          state.seeds[recipe.result]++
          events.push('RecipeRevealed:' + recipe.result)
        }
      }
      if (isHybrid(plant.species)) {
        const threshold = speciesInfo[plant.species].propagationThreshold
        plant.propagation += 1 + auraBonus(state, command.plot, 'propagation')
        if (plant.propagation >= threshold) {
          plant.propagation -= threshold
          state.seeds[plant.species]++
          state.firstPropagation = true
          events.push('SeedPropagated:' + plant.species)
        }
      }
      if (state.autoSell && state.basket.length === basketCapacity(state)) events.push(...sellBasket(state))
      return success(...events)
    }
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
      if (command.replaceId !== undefined && displaced?.id !== command.replaceId) return failure('stalePlant')
      if (displaced && !canReplace(state)) return failure('replacementLocked')
      if (displaced && command.replaceId === undefined) return failure('occupied')
      if (!isSpecies(command.species) || !seedUnlocked(state, command.species)) return failure('seedLocked')
      const price = speciesInfo[command.species].seedPrice
      if (isHybrid(command.species) && state.seeds[command.species] === 0) return failure('noSeeds')
      if (price !== null && state.coins < price) return failure('noCoins')

      if (isHybrid(command.species)) state.seeds[command.species]--
      else if (price !== null) state.coins -= price
      if (displaced) state.nursery.push(displaced)
      plot.plant = newPlant(state.nextId++, command.species)
      const events = displaced ? ['PlantStored','Planted'] : ['Planted']
      if (!state.planted.includes(command.species)) {
        state.planted.push(command.species)
        if (state.planted.length === speciesIds.length && state.plots.every(p => p.open)) events.push('GardenCompleted')
      }
      return success(...events)
    }
    case 'store': {
      if (!isRecipeRevealed(state)) return failure('nurseryLocked')
      if (!plot.plant) return failure('empty')
      state.nursery.push(plot.plant)
      plot.plant = null
      return success('PlantStored')
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
