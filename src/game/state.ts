import { saveVersion, type GameState, type PassiveState, type Plant, type Species } from './model'
import { balance, island, plotCount, hybridCounts, speciesIds } from './config'

import { canonical, common, maxLives } from './genetics'
import { initialMarket, initialTrading } from './market'
import { initialResearch } from './queries'
import type { Profile } from './model'

export function initialPassive(rng:number):PassiveState {
  return {beds:[],basket:[],seeds:[],checkpoint:null,labSeconds:0,rng:(rng^0x67ad40ef)>>>0}
}

export function newPlant(id: number, species: Species, profile:Profile=common, fruitRoll=0): Plant {
  const lives=maxLives(species,profile)
  return { id, species, ...canonical(profile), lives,maxLives:lives,fruitRoll, progress: 0, mature: false, readySince: null, pollination:null }
}

export function initialEvolution(): Pick<GameState,'activeIsland'|'greenhouseLevel'|'stallLevel'|'crosses'|'clones'|'rarityProgress'|'orders'|
  'orderRefreshAt'|'ordersCompleted'|'collection'|'achievements'|'rank'|'protectedPlants'|'protectedProfiles'|'favorites'|'reserves'|'automation'|'trading'> {
  return {activeIsland:'green',greenhouseLevel:1,stallLevel:1,crosses:[],clones:[],rarityProgress:{},orders:[],orderRefreshAt:0,ordersCompleted:0,
    collection:[],achievements:[],rank:0,protectedPlants:[],protectedProfiles:[],favorites:[],reserves:{},
    trading:initialTrading(),automation:{enabled:true,replant:false,extractPollinated:false,sellSeeds:false,preferred:null,sellFruit:true,saleRarity:null,cleanup:true}}
}
export const inactiveAutomation = {
  helperLevel: 0, autoSell: false, harvestRemaining: 0, sellRemaining: 0
} as const

export const initialAmenities = {
  tutorialBranch:null, pendingHybrid:null, basketLevel: 0, firstHarvest: false, firstExtraction: false,
  firstSeedPlanting: false, firstPropagation: false, musicMuted:false, tutorialSkipped:false,
  occupiedHintShown:false, muted: false
} as const

export function initialState(seed=Math.floor(Math.random()*0x100000000)): GameState {
  const startingSeeds: Readonly<Partial<Record<Species,number>>> = island.startSeeds
  return {
    passive:initialPassive(seed),
    research:initialResearch(),
    tutorialSeen:[],
    schemaVersion: saveVersion,
    market: initialMarket(),
    ...initialAmenities,
    ...initialEvolution(),
    decorations: [],
    ...inactiveAutomation,
    balanceVersion: balance.version,
    playTime: 0,
    nextId: 1,
    coins: balance.startCoins,
    plots: Array.from({ length: plotCount }, (_, index) => ({
      open: island.startOpen.includes(index),
      level: 1,
      plant: null
    })),
    nursery: [],
    basket: [],
    sold: false,
    planted: [],
    revealed: [],
    seeds: Object.fromEntries(speciesIds.map(id=>[id,startingSeeds[id]??0])) as GameState['seeds'],
    variants:[], failures:hybridCounts(), rng:seed,
    lang: 'ru'
  }
}
