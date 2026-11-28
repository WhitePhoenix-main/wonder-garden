import { evolution, isSpecies, plotCount, speciesInfo } from '../game/config'
import { validAutomation, validPlotPolicy } from '../game/evolution'
import { profileKey, rarityGuarantee, sameProfile, validGenome } from '../game/genetics'
import { buyers, negatives, plotModes, positives, rarities, type GameState, type Plant, type Profile } from '../game/model'
import { finite, integer, record } from './shape'
import { greenhouseTime } from '../game/greenhouse'

function genome(species:Plant['species'],profile:Profile,legacy=false) {
  return !!profile && Array.isArray(profile.plus) && validGenome(species,profile,legacy) &&
    profile.plus.every((t,i,list)=>i===0 || positives.indexOf(list[i-1])<positives.indexOf(t))
}

function validKey(key:unknown):boolean {
  if (typeof key!=='string') return false
  const [species,rarity,plus,minus]=key.split('/')
  if (!isSpecies(species) || !rarities.some(r=>r===rarity) || plus===undefined || minus===undefined) return false
  if (plus.split(',').filter(Boolean).some(t=>!positives.some(p=>p===t)) || (minus!=='' && !negatives.some(m=>m===minus))) return false
  const profile={rarity,plus:plus.split(',').filter(Boolean),minus:minus||null} as Profile
  return genome(species,profile,true) && profileKey(species,profile)===key
}

function unique<T>(items:T[]):boolean {return new Set(items).size===items.length}
const level=(value:unknown):value is number=>integer(value) && value>=1 && value<=5

function validRarityProgress(state:GameState):boolean {
  if (!record(state.rarityProgress) || Array.isArray(state.rarityProgress)) return false
  return Object.entries(state.rarityProgress).every(([key,count])=>{
    const [species,target,...extra]=key.split('/')
    const rarity=rarities.find(value=>value===target)
    if (!isSpecies(species) || !state.planted.includes(species) || extra.length ||
      !rarity || rarity==='common' || !integer(count) || !count) return false
    return count<(Number(state.schemaVersion)>=13 ? rarityGuarantee(rarity) : evolution.rarityGuarantee)
  })
}

export function validateEvolution(state:GameState,seen:Set<number>,plants:Plant[]):boolean {
  const labTime=greenhouseTime(state)
  if (state.activeIsland!=='green' && (state.activeIsland!=='valley' || state.plots.length<=plotCount)) return false
  if (!level(state.greenhouseLevel) || !level(state.stallLevel) || state.autoSell!==(state.stallLevel>=2) ||
    state.greenhouseLevel>1 && !state.revealed.length) return false
  if (!validAutomation(state.automation) || state.stallLevel<3 && (state.automation.extractPollinated || state.automation.sellSeeds) ||
    state.stallLevel<4 && state.automation.saleRarity!==null ||
    state.plots.some(p=>p.policy!==undefined && (!p.open || !validPlotPolicy(p.policy)))) return false
  if (!integer(state.rank) || state.rank>=evolution.rankRequirements.length ||
    !Array.isArray(state.achievements) || !unique(state.achievements) ||
    !state.achievements.every(key=>typeof key==='string' && /^[A-Za-z_][A-Za-z_0-9]{0,40}$/.test(key))) return false
  if (!Array.isArray(state.protectedPlants) || !unique(state.protectedPlants) ||
    !state.protectedPlants.every(id=>plants.some(p=>p.id===id) ||
      Number(state.schemaVersion)>=14 && state.plots.some(p=>p.plant?.id===id && p.plant.lives===0))) return false
  if (![state.protectedProfiles,state.favorites].every(list=>Array.isArray(list) && unique(list) && list.every(validKey))) return false
  if (!record(state.reserves) || Object.entries(state.reserves).some(([key,count])=>
    !integer(count) || count===0 || !isSpecies(key) && !validKey(key))) return false
  if (state.basket.some(batch=>batch.lots.some(lot=>lot.origin!==undefined &&
    (!record(lot.origin) || !integer(lot.origin.plot) || lot.origin.plot>=state.plots.length ||
      !integer(lot.origin.specimen) || !lot.origin.specimen || lot.origin.specimen>=state.nextId ||
      !plotModes.includes(lot.origin.mode) || typeof lot.origin.protected!=='boolean')))) return false
  if (!Array.isArray(state.collection) || state.collection.length>60 ||
    !state.collection.every(row=>record(row) && isSpecies(row.species) && state.planted.includes(row.species) &&
      rarities.includes(row.rarity) && genome(row.species,row.profile,true) && row.profile.rarity===row.rarity &&
      integer(row.planted) && row.planted>0 && integer(row.harvested) && Array.isArray(row.profiles) && row.profiles.length>0 &&
      row.profiles.every(p=>genome(row.species,p,true) && p.rarity===row.rarity) &&
      unique(row.profiles.map(p=>profileKey(row.species,p))) && row.profiles.some(p=>sameProfile(p,row.profile))) ||
    !unique(state.collection.map(row=>row.species+'/'+row.rarity))) return false

  const validId=(id:number)=>integer(id) && id>0 && id<state.nextId && !seen.has(id)
  if (!Array.isArray(state.crosses)) return false
  const busy=new Set<number>()
  let occupied=0
  for (const cross of state.crosses) {
    if (!record(cross) || !validId(cross.id) || !Array.isArray(cross.parents) || cross.parents.length!==2 ||
      cross.parents[0]===cross.parents[1] || !cross.parents.every(id=>integer(id) && id>0 && id<state.nextId) ||
      !isSpecies(cross.species) || !state.planted.includes(cross.species) || !genome(cross.species,cross.profile) ||
      !Array.isArray(cross.parentProfiles) || cross.parentProfiles.length!==2 ||
      !cross.parentProfiles.every(profile=>genome(cross.species,profile,true)) ||
      !finite(cross.startsAt) || !finite(cross.readyAt) || cross.startsAt>labTime ||
      cross.readyAt!==cross.startsAt+evolution.experiments[speciesInfo[cross.species].generation].seconds ||
      typeof cross.collected!=='boolean' || cross.collected && cross.readyAt>labTime) return false
    seen.add(cross.id)
    if (!cross.collected) occupied++
    if (cross.readyAt>labTime) for (const parent of cross.parents) {
      if (busy.has(parent) || !state.nursery.some(p=>p.id===parent && p.species===cross.species)) return false
      busy.add(parent)
    }
  }
  if (Number(state.schemaVersion)>=11) {
    if (!validRarityProgress(state) || !Array.isArray(state.clones) ||
      state.clones.length && state.greenhouseLevel<3) return false
    for (const clone of state.clones) {
      if (!record(clone) || !validId(clone.id) || !integer(clone.parent) ||
        clone.parent===0 || clone.parent>=clone.id || !isSpecies(clone.species) ||
        !state.planted.includes(clone.species) || !genome(clone.species,clone.profile,true) ||
        rarities.indexOf(clone.profile.rarity)<2 ||
        !finite(clone.startsAt) || clone.startsAt>labTime ||
        clone.readyAt!==clone.startsAt+evolution.cloning[speciesInfo[clone.species].generation].seconds) return false
      if (clone.readyAt>labTime) {
        const parent=state.nursery.find(p=>p.id===clone.parent)
        if (!parent || busy.has(clone.parent) || parent.species!==clone.species ||
          !sameProfile(parent,clone.profile)) return false
        busy.add(clone.parent)
      }
      seen.add(clone.id)
      occupied++
    }
  }
  if (occupied>evolution.crossSlots[state.greenhouseLevel-1]) return false
  if (!Array.isArray(state.orders) || state.orders.length>evolution.orderSlots[state.stallLevel-1] ||
    !integer(state.ordersCompleted) || !finite(state.orderRefreshAt) || state.orderRefreshAt>state.playTime+evolution.orderCooldown) return false
  for (const order of state.orders) {
    if (!record(order) || !validId(order.id) || !buyers.includes(order.buyer) || !integer(order.reward) || order.reward<1 ||
      !Array.isArray(order.requirements) || order.requirements.length<1 || order.requirements.length>3 ||
      !order.requirements.every(r=>record(r) && (r.kind==='fruit' || r.kind==='seed') && integer(r.count) && r.count>0 &&
        (r.species===undefined || isSpecies(r.species) && state.planted.includes(r.species)) &&
        (r.tier===undefined || integer(r.tier) && r.tier>=1 && r.tier<=4) &&
        (r.rarity===undefined || rarities.includes(r.rarity)) && (r.trait===undefined || positives.includes(r.trait)) &&
        (r.clean===undefined || typeof r.clean==='boolean'))) return false
    seen.add(order.id)
  }
  return true
}
