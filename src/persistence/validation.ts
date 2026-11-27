import { saveVersion, type GameState, type Plant } from '../game/model'
import { adjacent, balance, island, isSpecies, plotCount, recipes, isHybrid, speciesInfo, helperLevels, autoSellOffer, basketLevels, isDecorType, isDecorSlot } from '../game/config'
import { record, integer, finite } from './shape'

export function validState(v: unknown): v is GameState {
  if (!record(v) || v.schemaVersion !== saveVersion || v.balanceVersion !== balance.version ||
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
      typeof v.muted !== 'boolean' || !Array.isArray(v.decorations)) return false
  const capacity = basketLevels[v.basketLevel].capacity
  const progress = v.recipeProgress
  const seeds = v.seeds
  if (!record(progress) || !record(seeds) || Object.keys(progress).length !== recipes.length ||
      Object.keys(seeds).length !== recipes.length || !Array.isArray(v.basket) || v.basket.length > capacity ||
      (v.autoSell && v.basket.length === capacity) ||
      !v.basket.every(f => record(f) && isSpecies(f.species) && integer(f.valueUnits) && f.valueUnits > 0)) return false
  if (!Array.isArray(v.plots) || v.plots.length !== plotCount || !Array.isArray(v.nursery)) return false
  const seen = new Set<number>()
  const known = new Set(v.planted)
  const {playTime, nextId} = v
  function validPlant(p: unknown): p is Plant {
    if (!record(p) || !integer(p.id) || seen.has(p.id) || p.id >= nextId || !isSpecies(p.species) ||
        !known.has(p.species) || !finite(p.progress) || p.progress > 1 || typeof p.mature !== 'boolean') return false
    if (!integer(p.propagation) || (isHybrid(p.species) ? p.propagation >= speciesInfo[p.species].propagationThreshold : p.propagation !== 0)) return false
    if (p.progress === 1 ? !p.mature || !finite(p.readySince) || p.readySince > playTime : p.readySince !== null) return false
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
    if (!integer(count) || count > harvests || !integer(stock)) return false
    if (count && (!known.has(primary) || !neighbors.every(id => known.has(id)))) return false
    if (count < harvests) return stock === 0 && !known.has(result)
    return known.has(result) ? stock > 0 || instances.some(p => p.species === result) : stock === 1
  })
}
