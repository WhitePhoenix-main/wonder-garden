import { isSpecies, nurseryProduction, speciesInfo, valueScale } from './config'
import { canonical, changeStock, common, fruitCount, nextRandom, plantStats, profileAllowed,
  quantity, sameProfile, stockCount, traits, validGenome } from './genetics'
import { isBusy } from './greenhouse'
import { productionModes, type EvolutionCommand, type GameState, type Plant, type ProductionAssignment, type Profile, type Result } from './model'
import { basketCapacity, basketCount } from './queries'
import { newPlant } from './state'
import { availableStock, protectedProfile } from './stock-policy'

const protectedPlant=(state:GameState,plant:Plant)=>
  state.protectedPlants.includes(plant.id) || protectedProfile(state,plant.species,plant)

export const productionLevel=(state:GameState)=>nurseryProduction.levels[state.greenhouseLevel-1]
export const productionCapacity=(state:GameState)=>productionLevel(state).capacity
export const productionCount=(state:GameState)=>state.passive.basket.reduce((n,batch)=>n+batch.count,0)
export const seedProductionCapacity=(state:GameState)=>Math.floor(productionCapacity(state)*nurseryProduction.seedCapacityShare)
export const seedProductionCount=(state:GameState)=>state.passive.seeds.reduce((n,pack)=>n+pack.count,0)

function isFull(state:GameState,a:ProductionAssignment,plant:Plant):boolean {
  const stats=plantStats(plant.species,plant)
  const count=fruitCount(stats,plant.fruitRoll)
  if (!count) return false
  if (a.mode==='fruit') return productionCount(state)+count>productionCapacity(state)
  if (a.mode==='seed') return seedProductionCount(state)+stats.ownSeeds[1]>seedProductionCapacity(state)
  return false
}

export function unlockProduction(state:GameState):void {
  while (state.passive.beds.length<productionLevel(state).beds) state.passive.beds.push({assignment:null,plant:null})
}

export function productionModesFor(state:GameState) {
  return productionModes.filter(mode=>mode==='fruit' ||
    mode==='seed' && state.greenhouseLevel>=nurseryProduction.seedModeLevel ||
    mode==='wholesale' && state.greenhouseLevel>=nurseryProduction.wholesaleModeLevel)
}

export function validAssignment(state:GameState,a:ProductionAssignment):boolean {
  return !!a && isSpecies(a.species) && state.planted.includes(a.species) &&
    validGenome(a.species,a.profile,true) && productionModesFor(state).includes(a.mode)
}

export function productionStatus(state:GameState,slot:number) {
  const {plant,assignment}=state.passive.beds[slot]
  const stock=assignment ? stockCount(state,assignment.species,assignment.profile) : 0
  const available=assignment ? availableStock(state,assignment.species,assignment.profile) : 0
  let reason:'idle'|'protected'|'full'|'growing'|'reserve'|'empty'|'ready' = 'idle'
  if (assignment) {
    if (plant && protectedPlant(state,plant)) reason='protected'
    else if (plant && isFull(state,assignment,plant)) reason='full'
    else if (plant) reason='growing'
    else if (available) reason='ready'
    else reason=stock ? 'reserve' : 'empty'
  }
  return {stock,available,reason}
}

type ProductionCommand=Extract<EvolutionCommand,{type:'assignProduction'|'moveProduction'|'collectProduction'}>
const fail=(reason:string):Result=>({ok:false,reason})
const ok=():Result=>({ok:true,events:['ProductionChanged']})

export function produce(state:GameState,command:ProductionCommand):Result {
  const {beds,basket,seeds}=state.passive
  if (command.type==='collectProduction') {
    if (!basket.length && !seeds.length) return fail('itemChanged')
    if (seeds.some(pack=>!Number.isSafeInteger(stockCount(state,pack.species,pack)+pack.count))) return fail('invalidQuantity')
    let space=basketCapacity(state)-basketCount(state)
    let taken=0
    // Keep each harvest lot indivisible here. Seed yields and lot identity travel together.
    for (let i=0;i<basket.length;) {
      const batch=basket[i]
      if (batch.count>space) {i++;continue}
      state.basket.push(batch)
      basket.splice(i,1)
      space-=batch.count
      taken+=batch.count
    }
    for (const pack of seeds) {
      changeStock(state,pack.species,pack,pack.count)
      taken+=pack.count
    }
    seeds.length=0
    return taken ? ok() : fail('basketFull')
  }
  const bed=beds[command.slot]
  if (!Number.isInteger(command.slot) || !bed) return fail('plotClosed')
  if (command.type==='assignProduction') {
    const a=command.assignment
    if (a && !validAssignment(state,a)) return fail('invalidPolicy')
    if (a && bed.plant && (a.species!==bed.plant.species || !sameProfile(a.profile,bed.plant))) return fail('occupied')
    bed.assignment=a ? {...a, profile:canonical(a.profile)} : null
    return ok()
  }
  if (command.direction==='out') {
    if (!bed.plant || bed.plant.id!==command.id) return fail('stalePlant')
    if (bed.plant.progress===1) {
      bed.plant.mature=true
      bed.plant.readySince=state.playTime
    }
    state.nursery.push(bed.plant)
    bed.plant=null
    bed.assignment=null
    return ok()
  }
  if (command.direction!=='in' || bed.plant) return fail('occupied')
  const i=state.nursery.findIndex(p=>p.id===command.id)
  const plant=state.nursery[i]
  if (!plant || !plant.lives) return fail('stalePlant')
  if (isBusy(state,plant.id)) return fail('parentsBusy')
  if (bed.assignment && (bed.assignment.species!==plant.species || !sameProfile(bed.assignment.profile,plant))) return fail('invalidPolicy')
  const [moved]=state.nursery.splice(i,1)
  moved.pollination=null
  bed.plant=moved
  bed.assignment??={species:moved.species,profile:canonical(moved),mode:'fruit'}
  return ok()
}

export interface ProductionReport {
  fruit:number
  seeds:number
  spent:number
  coins:number
}

const cycle=(plant:Plant)=>nurseryProduction.cycleMultiplier *
  (plant.mature ? plantStats(plant.species,plant).regrowSec : plantStats(plant.species,plant).growthSec)

/** Visit harvest deadlines in slot order so competing beds consume stock reproducibly. */
export function advanceProduction(state:GameState,seconds:number):ProductionReport {
  const report={fruit:0,seeds:0,spent:0,coins:0}
  const stream=state.passive
  const addSeed=(plant:Plant,profile:Profile,count:number)=>{
    if (!count) return
    const pack=stream.seeds.find(p=>p.species===plant.species && sameProfile(p,profile))
    if (pack) pack.count+=count
    else stream.seeds.push({species:plant.species,...profile,count})
  }
  if (!stream.beds.length || !(seconds>0) || !Number.isFinite(seconds)) return report
  while (true) {
    const active:Plant[]=[]
    let deadline=Infinity
    for (const bed of stream.beds) {
      const a=bed.assignment
      if (!a) continue
      if (!bed.plant && seconds>0 && availableStock(state,a.species,a.profile)>0) {
        changeStock(state,a.species,a.profile,-1)
        bed.plant=newPlant(state.nextId++,a.species,a.profile,nextRandom(stream))
        report.spent++
      }
      const plant=bed.plant
      if (!plant || protectedPlant(state,plant)) continue
      const stats=plantStats(plant.species,plant)
      const count=fruitCount(stats,plant.fruitRoll)
      if (isFull(state,a,plant)) continue
      if (plant.progress>=1-1e-10) {
        const profile=canonical(plant)
        const price=Math.round(speciesInfo[plant.species].fruitValue*stats.fruitPriceMultiplier*valueScale)
        if (count>0) {
          const seedYield=quantity(stats.ownSeeds,stats.seedYieldModifier,nextRandom(stream))
          const copyPending=Boolean(profile.minus || traits(profile).length) && profileAllowed(plant.species,profile)
          if (a.mode==='fruit') {
            stream.basket.push({id:state.nextId++,species:plant.species,valueUnits:price,count,profile,pollination:null,
              lots:[{size:count,remaining:count,seedYield,copyChance:stats.copyChance,copyPending,crossPending:false}]})
            report.fruit+=count
          } else if (a.mode==='seed') {
            const copy=copyPending && nextRandom(stream)<stats.copyChance
            addSeed(plant,common,seedYield-Number(copy))
            if (copy) addSeed(plant,profile,1)
            report.seeds+=seedYield
          } else {
            const value=Math.round(count*price*nurseryProduction.wholesaleRate/valueScale)
            if (Number.isSafeInteger(state.coins+value)) {
              state.coins+=value
              report.coins+=value
            }
          }
        }
        plant.lives--
        if (!plant.lives) {
          bed.plant=null
          // Another pass can sow the next specimen without advancing time.
          if (seconds>0) deadline=0
          continue
        }
        plant.progress=0
        plant.readySince=null
        plant.mature=true
        plant.fruitRoll=nextRandom(stream)
      }
      active.push(plant)
      deadline=Math.min(deadline,(1-plant.progress)*cycle(plant))
    }
    if (seconds<=0 || deadline===Infinity) break
    const step=Math.min(deadline,seconds)
    for (const plant of active) plant.progress=Math.min(1,plant.progress+step/cycle(plant))
    seconds-=step
  }
  return report
}
