import { speciesIds } from './config'
import { common, profileKey, sameProfile, stockCount } from './genetics'
import type { GameState, HarvestLot, PlotPolicy, Profile, SeedPack, Species } from './model'

export const defaultPolicy:Readonly<PlotPolicy>={mode:'manual',priority:0,harvest:true,replant:null,target:2}

export function allSeedPacks(state:GameState):SeedPack[] {
  const base:SeedPack[]=speciesIds.flatMap(species=>state.seeds[species]>0 ? [{species,...common,count:state.seeds[species]}] : [])
  return [...base,...state.variants]
}

export function protectedProfile(state:GameState,species:Species,profile:Profile):boolean {
  return state.protectedProfiles.includes(profileKey(species,profile))
}

export function availableStock(state:GameState,species:Species,profile:Profile):number {
  if (protectedProfile(state,species,profile)) return 0
  const count=stockCount(state,species,profile)
  const total=state.variants.reduce((n,pack)=>n+(pack.species===species ? pack.count : 0),state.seeds[species])
  return Math.max(0, Math.min(count-(state.reserves[profileKey(species,profile)]??0), total-(state.reserves[species]??0)))
}

export function productionTarget(state:GameState,plot:number,species:Species) {
  const policy=state.plots[plot]?.policy??defaultPolicy
  const profile=policy.replant?.species===species ? policy.replant.profile : common
  const reserve=Math.max(state.reserves[species]??0,state.reserves[profileKey(species,profile)]??0)
  return {profile,count:policy.target+reserve}
}

export function lotSeedYield(lot:HarvestLot,count:number):number {
  const used=lot.size-lot.remaining
  return Math.ceil((used+count)*lot.seedYield/lot.size)-Math.ceil(used*lot.seedYield/lot.size)
}

export function hasOtherSource(state:GameState,species:Species,profile?:Profile,exceptPlant?:number,exceptBatch?:number):boolean {
  const matches=(p:Profile)=>!profile || sameProfile(p,profile)
  return state.plots.some(p=>p.plant?.species===species && p.plant.id!==exceptPlant && matches(p.plant)) ||
    state.nursery.some(p=>p.species===species && p.id!==exceptPlant && matches(p)) ||
    state.basket.some(b=>b.id!==exceptBatch && b.species===species && b.profile &&
      b.lots.some(l=>lotSeedYield(l,l.remaining)>0 &&
        (!profile || sameProfile(profile,common) && (!l.copyPending || lotSeedYield(l,l.remaining)>1))))
}

export function protectedHarvest(state:GameState,batch:GameState['basket'][number]):boolean {
  return Boolean(batch.profile && protectedProfile(state,batch.species,batch.profile)) ||
    batch.lots.some(l=>l.origin && state.protectedPlants.includes(l.origin.specimen))
}
