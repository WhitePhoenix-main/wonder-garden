import { measure } from './analytics'
import { bedLevels, speciesInfo, valueScale } from './config'
import { canonical, fruitCount, nextRandom, plantStats, profileAllowed, quantity, rules, sameProfile, traits } from './genetics'
import type { Command, GameState, HarvestLot, Plant, PollinationSnapshot, Result } from './model'
import { auraBonus, basketCapacity, basketCount, pollinationFor } from './queries'
import { recordHarvest } from './collection'

function samePollination(a:PollinationSnapshot|null, b:PollinationSnapshot|null):boolean {
  if (!a || !b) return a === b
  return a.result === b.result &&
    a.donor.species === b.donor.species && sameProfile(a.donor, b.donor) &&
    a.supporting.length === b.supporting.length &&
    a.supporting.every((parent,index) =>
      parent.species === b.supporting[index].species && sameProfile(parent,b.supporting[index]))
}

export function harvest(state:GameState, command:Extract<Command,{type:'harvest'}>):Result {
  const plot = state.plots[command.plot]
  const plant = plot.plant
  if (!plant?.lives || plant.readySince === null) return {ok:false, reason:'notReady'}
  if (command.expectedId !== plant.id || command.cycle !== plant.lives) return {ok:false, reason:'stalePlant'}

  const stats = plantStats(plant.species, plant)
  const count = fruitCount(stats, plant.fruitRoll)
  if (basketCount(state) + count > basketCapacity(state)) return {ok:false, reason:'basketFull'}

  const {species} = plant
  if (count>0) {
    addHarvest(state, command.plot, plant, stats, count)
    recordHarvest(state,plant,count)
    state.firstHarvest = true
  }
  const events = ['Harvested', 'Harvested:' + command.plot + ':' + species + ':' + count]
  if (count===0) events.push('CropFailed')
  measure(state,species,{harvests:1,fruit:count})
  plant.lives--
  plant.progress = 0
  plant.readySince = null
  plant.pollination = null
  if (plant.lives === 0) {
    state.protectedPlants=state.protectedPlants.filter(id=>id!==plant.id)
    events.push('Withered')
  } else {
    plant.fruitRoll = nextRandom(state)
  }
  return {ok:true, events}
}

function addHarvest(state:GameState,index:number,plant:Plant,stats:ReturnType<typeof plantStats>,count:number) {
  const plot = state.plots[index]
  const {species} = plant
  const profile = canonical(plant)
  const pollination = pollinationFor(state, index)
  const price = speciesInfo[species].fruitValue * stats.fruitPriceMultiplier *
    bedLevels[plot.level].priceMultiplier * (1 + auraBonus(state, index, 'price'))
  const valueUnits = Math.round(price * valueScale)
  const mode=plot.policy?.mode??'manual'
  const protectedPlant=state.protectedPlants.includes(plant.id)
  const batch = state.basket.find(item => item.species === species && item.valueUnits === valueUnits &&
    (item.lots[0].origin?.mode??'manual')===mode && (mode==='manual' || item.lots[0].origin?.plot===index) &&
    Boolean(item.lots[0].origin?.protected)===protectedPlant &&
    item.profile && sameProfile(item.profile, profile) && samePollination(item.pollination, pollination))

  const lot:HarvestLot = {
    size: count,
    remaining: count,
    seedYield: quantity(stats.ownSeeds, stats.seedYieldModifier, nextRandom(state)),
    copyChance: Math.min(rules.copyCap,Math.max(stats.copyChance,auraBonus(state, index, 'propagation'))),
    copyPending: Boolean(traits(profile).length || profile.minus) && profileAllowed(species, profile),
    crossPending: pollination !== null,
    origin:{plot:index,mode,specimen:plant.id,protected:protectedPlant}
  }
  if (batch) {
    batch.count += count
    batch.lots.push(lot)
  } else {
    state.basket.push({id:state.nextId++, species, valueUnits, count, profile, pollination, lots:[lot]})
  }
}
