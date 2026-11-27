import { saveVersion, type GameState } from '../game/model'
import { balance, hybridCounts, recipes } from '../game/config'
import { inactiveAutomation, initialAmenities } from '../game/state'
import { record, integer } from './shape'
import { validState } from './validation'

// Keep the existing storage key so either snapshot from the first sprint can be recovered.
function migrateFirstSprint(value: Record<string, unknown>): GameState|null {
  if (!integer(value.recipeProgress) || !integer(value.solarSeeds) || value.solarSeeds > 1 ||
      !Array.isArray(value.plots) || !Array.isArray(value.nursery)) return null
  const {solarSeeds, ...legacy} = value
  const migratePlant = (p: unknown) => record(p) ? {...p, propagation:0} : p
  const migrated = {
    ...legacy, ...inactiveAutomation, schemaVersion:3,
    recipeProgress:{...hybridCounts(), solar_strawberry:value.recipeProgress},
    seeds:{...hybridCounts(), solar_strawberry:solarSeeds},
    plots:value.plots.map(p => record(p) ? {...p, plant:migratePlant(p.plant)} : p),
    nursery:value.nursery.map(migratePlant)
  }
  const state = migrateAmenities(migrated)
  if (!validState(state)) return null
  const oldHybrids = [...state.nursery, ...state.plots.map(p => p.plant)].filter(p => p?.species === 'solar_strawberry')
  if (oldHybrids.length + value.solarSeeds !== Number(value.recipeProgress === recipes.find(r => r.result === 'solar_strawberry')!.harvests)) return null
  return state
}

function migrateAmenities(value:Record<string,unknown>) {
  const plots = Array.isArray(value.plots) ? value.plots : []
  const nursery = Array.isArray(value.nursery) ? value.nursery : []
  const basket = Array.isArray(value.basket) ? value.basket : []
  const seeds = record(value.seeds) ? value.seeds : {}
  const plants = [...plots.map(p => record(p) ? p.plant : null), ...nursery].filter(record)
  return {
    ...value, ...initialAmenities, schemaVersion:saveVersion, decorations:[],
    firstHarvest:value.sold === true || basket.length > 0,
    firstPropagation:recipes.some(({result}) =>
      Number(seeds[result]) + plants.filter(p => p.species === result).length > 1)
  }
}

export function parseSave(raw: string | null) {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (record(value) && value.schemaVersion === 1 && value.balanceVersion === balance.version) {
      return migrateFirstSprint(value)
    }
    if (record(value) && (value.schemaVersion === 2 || value.schemaVersion === 3)) {
      const previous = value.schemaVersion === 2 ? {...value,...inactiveAutomation} : value
      const migrated = migrateAmenities(previous)
      if (validState(migrated)) return migrated
    }
    if (validState(value)) return value
    if (record(value) && (Number(value.schemaVersion) > saveVersion || Number(value.balanceVersion) > balance.version)) return 'future'
  } catch { /* Try the backup below. */ }
  return null
}
