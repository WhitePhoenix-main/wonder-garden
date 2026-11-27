import { common, compatible, maxLives, rules, sameProfile } from '../game/genetics'
import { speciesIds } from '../game/config'
import { positives, negatives, rarities, type Hybrid, type Profile, saveVersion, type GameState, type Plant } from '../game/model'
import { adjacent, balance, island, isSpecies, plotCount, recipes, isHybrid, speciesInfo, helperLevels, autoSellOffer, basketLevels, isDecorType, isDecorSlot } from '../game/config'
import { record, integer, finite } from './shape'

function profile(v:Record<string,unknown>):boolean {
  return rarities.some(r=>r===v.rarity) && (v.rarity==='common'?v.plus===null:positives.some(t=>t===v.plus)) &&
    (v.minus===null || negatives.some(t=>t===v.minus)) && compatible(v as unknown as Profile)
}
export function validState(v:unknown):v is GameState {return validate(v,false)}
export type LegacyPlant=Pick<Plant,'id'|'species'|'progress'|'mature'|'readySince'> & {propagation:number}
export type LegacyState=Omit<GameState,'revealed'|'schemaVersion'|'plots'|'nursery'|'seeds'|'rng'|'variants'|'failures'|'tutorialBranch'|'pendingHybrid'> & {
  schemaVersion:6; recipeProgress:Record<Hybrid,number>; seeds:Record<Hybrid,number>
  plots:(Omit<GameState['plots'][number],'plant'> & {plant:LegacyPlant|null})[];nursery:LegacyPlant[]
}
export function validLegacy(v:unknown):v is LegacyState {return validate(v,true)}
function validate(v: unknown,legacy:boolean): boolean {
  if (!record(v) || v.schemaVersion !== (legacy?6:saveVersion) || v.balanceVersion !== balance.version ||
      !finite(v.playTime) || !integer(v.nextId) || !integer(v.coins) || typeof v.sold !== 'boolean' ||
      (v.lang !== 'ru' && v.lang !== 'en') || !Array.isArray(v.planted) || !v.planted.every(isSpecies) ||
      !v.planted.includes('radish') || new Set(v.planted).size !== v.planted.length) return false
  if (!integer(v.helperLevel) || v.helperLevel >= helperLevels.length || typeof v.autoSell !== 'boolean' ||
      !finite(v.harvestRemaining) || !finite(v.sellRemaining)) return false
  const interval = helperLevels[v.helperLevel].intervalSec
  if (interval === null ? v.harvestRemaining !== 0 :
      !v.sold || v.harvestRemaining <= 0 || v.harvestRemaining > interval) return false
  if (v.autoSell ? v.helperLevel < autoSellOffer.minHelperLevel ||
      v.sellRemaining <= 0 || v.sellRemaining > autoSellOffer.intervalSec : v.sellRemaining !== 0) return false
  if (!integer(v.basketLevel) || !basketLevels[v.basketLevel] || (v.basketLevel > 0 && !v.sold) ||
      typeof v.firstHarvest !== 'boolean' || typeof v.firstPropagation !== 'boolean' ||
      typeof v.muted !== 'boolean' || typeof v.musicMuted !== 'boolean' || typeof v.tutorialSkipped !== 'boolean' || typeof v.occupiedHintShown !== 'boolean' || !Array.isArray(v.decorations)) return false
  const capacity = basketLevels[v.basketLevel].capacity
  const progress = legacy?v.recipeProgress:v.failures
  const revealed = v.revealed
  if(!legacy && (!Array.isArray(revealed) || !revealed.every(isHybrid) || new Set(revealed).size!==revealed.length))return false
  const seeds = v.seeds
  if (!record(progress) || !record(seeds) || Object.keys(progress).length !== recipes.length ||
      Object.keys(seeds).length !== (legacy?recipes.length:speciesIds.length) || !Array.isArray(v.basket) || v.basket.length > capacity ||
      (v.autoSell && v.basket.length === capacity) ||
      !v.basket.every(f => record(f) && isSpecies(f.species) && integer(f.valueUnits) && f.valueUnits > 0)) return false
  if (!Array.isArray(v.plots) || v.plots.length !== plotCount || !Array.isArray(v.nursery)) return false
  if(!legacy){
    if(v.tutorialBranch!==null && v.tutorialBranch!=='experiment' && v.tutorialBranch!=='corner')return false
    if(v.pendingHybrid!==null && (!isHybrid(v.pendingHybrid) || !(revealed as Hybrid[]).includes(v.pendingHybrid)))return false
    const failures=v.failures
    if(!integer(v.rng) || v.rng>0xffffffff || !record(failures) ||
      !speciesIds.every(id=>integer(seeds[id]) && (!seeds[id] || isHybrid(id) || (v.planted as unknown[]).includes(id))) || !recipes.every(r=>integer(failures[r.result]) && Number(failures[r.result])<=rules.pity) ||
      !Array.isArray(v.variants))return false
    const keys=new Set<string>()
    for(const pack of v.variants){
      if(!record(pack) || !isSpecies(pack.species) || !profile(pack) || !integer(pack.count) || !pack.count ||
        sameProfile(common,pack as unknown as Profile))return false
      const key=[pack.species,pack.rarity,pack.plus,pack.minus].join('/')
      if(keys.has(key))return false
      keys.add(key)
    }
  }
  const seen = new Set<number>()
  const known = new Set(v.planted)
  const {playTime, nextId} = v
  function validPlant(p: unknown): p is Plant {
    if (!record(p) || !integer(p.id) || seen.has(p.id) || p.id >= nextId || !isSpecies(p.species) ||
        !known.has(p.species) || !finite(p.progress) || p.progress > 1 || typeof p.mature !== 'boolean') return false
    if (legacy && (!integer(p.propagation) || (isHybrid(p.species) ? p.propagation >= speciesInfo[p.species].propagationThreshold : p.propagation !== 0))) return false
    if (p.progress === 1 ? !p.mature || !finite(p.readySince) || p.readySince > playTime : p.readySince !== null) return false
    if(!legacy && (!profile(p) || p.maxLives!==maxLives(p.species,p as unknown as Profile) ||
      !integer(p.lives) || !p.lives || p.lives>Number(p.maxLives) || !finite(p.fruitRoll) || p.fruitRoll>=1))return false
    seen.add(p.id)
    return true
  }
  const open = new Set<number>()
  for (const [i,p] of v.plots.entries()) {
    if (!record(p) || typeof p.open !== 'boolean' || (p.level !== 1 && p.level !== 2 && p.level !== 3) ||
        (!p.open && (p.level !== 1 || p.plant !== null)) || (p.plant !== null && !validPlant(p.plant))) return false
    if (p.open) open.add(i)
  }
  if (!v.nursery.every(validPlant) || !island.startOpen.every(i => open.has(i))) return false
  const connected = new Set([island.startOpen[0]])
  for (const i of connected) for (const j of adjacent(i)) if (open.has(j)) connected.add(j)
  if (connected.size !== open.size) return false
  const instances: Plant[] = [...v.plots.flatMap(p => p.plant ? [p.plant] : []), ...v.nursery]
  const decorSlots = new Set<string>()
  if (v.decorations.length && !v.planted.some(isHybrid)) return false
  for (const item of v.decorations) {
    if (!record(item) || !integer(item.id) || seen.has(item.id) || item.id >= nextId || !isDecorType(item.type)) return false
    seen.add(item.id)
    if (item.slot === null) continue
    if (!isDecorSlot(item.slot) || decorSlots.has(item.slot)) return false
    decorSlots.add(item.slot)
  }
  return recipes.every(({ result, primary, neighbors, harvests }) => {
    const count = progress[result], stock = seeds[result]
    if (!integer(count) || count > (legacy?harvests:rules.pity) || !integer(stock)) return false
    if ((count || (!legacy && (revealed as Hybrid[]).includes(result))) && (!known.has(primary) || !neighbors.every(id => known.has(id)))) return false
    if(!legacy){
      const hasStock=stock>0 || (v.variants as GameState['variants']).some(pack=>pack.species===result)
      return (revealed as Hybrid[]).includes(result) || !hasStock && !known.has(result)
    }
    if (count < harvests) return stock === 0 && !known.has(result)
    return known.has(result) ? stock > 0 || instances.some(p => p.species === result) : stock === 1
  })
}
