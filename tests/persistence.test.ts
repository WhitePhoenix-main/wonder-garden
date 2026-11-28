import { describe, expect, it } from 'vitest'
import { initialState, saleValue } from '../src/game'
import { createPersistence } from '../src/persistence/storage'
import { validState } from '../src/persistence/validation'
import { common } from '../src/game/genetics'
import { cross, commit, earn, legacySix, memoryStorage, plantAt, wait } from './helpers'

const primary = 'wonder-garden.save.v1'
const backup = primary + '.backup'

describe('Sprint 01 persistence', () => {
  it('SV-01: reloads the exact snapshot and active time with unsold fruit', () => {
    const storage = memoryStorage()
    const state = initialState(33)
    wait(state, 6)
    commit(state, { type: 'harvest', plot: 12 })
    commit(state, { type: 'language', lang: 'en' })
    createPersistence(() => storage).save(state)
    expect(createPersistence(() => storage).load()).toEqual(state)
    expect(state.plots[12].plant).toBeNull()
  })

  it('SV-02: recovers last valid backup when primary is malformed or references unknown plants', () => {
    const storage = memoryStorage()
    const persistence = createPersistence(() => storage)
    const state = initialState(33)
    wait(state, 4)
    persistence.save(state)
    const expected = structuredClone(state)
    wait(state, 2)
    persistence.save(state)

    const unknownSpecies = JSON.stringify(state).replaceAll('radish', 'unknown')
    for (const invalid of ['{', unknownSpecies]) {
      storage.setItem(primary, invalid)
      const reloaded = createPersistence(() => storage)
      expect(reloaded.load()).toEqual(expected)
      expect(reloaded.warning).toBe('recovered')
      reloaded.save(expected)
      expect(JSON.parse(storage.getItem(backup)!)).toEqual(expected)
    }
  })

  it('migrates first-sprint snapshots and their backups without replaying discoveries', () => {
    const state = initialState(33)
    earn(state,150)
    commit(state,{type:'plant',species:'strawberry',plot:8})
    commit(state,{type:'plant',species:'sunflower',plot:9})
    function checkLegacy(fromBackup: boolean) {
      const storage = memoryStorage()
      const {seeds,...rest} = legacySix(state)
      const legacyPlant = ({id,species,mature,readySince,progress}: typeof rest.nursery[number]) => ({id,species,mature,readySince,progress})
      const raw = JSON.stringify({...rest, schemaVersion:1, solarSeeds:seeds.solar_strawberry,
        recipeProgress:state.revealed.includes('solar_strawberry')?3:0,
        plots:rest.plots.map(p => ({...p,plant:p.plant && legacyPlant(p.plant)})),
        nursery:rest.nursery.map(legacyPlant)})
      storage.setItem(fromBackup ? backup : primary,raw)
      if (fromBackup) storage.setItem(primary,'{')
      const persistence = createPersistence(() => storage)
      const migrated = persistence.load()
      expect(migrated).toMatchObject({coins:state.coins,seeds:{solar_strawberry:state.seeds.solar_strawberry},planted:state.planted})
      persistence.save(migrated)
      expect(createPersistence(() => storage).load()).toEqual(migrated)
    }
    for (let i=0;i<2;i++) { wait(state,12); commit(state,{type:'harvest',plot:8}) }
    checkLegacy(false)
    wait(state,12)
    cross(state,8,'solar_strawberry')
    if (state.seeds.solar_strawberry>1) commit(state,{
      type:'sellSeeds',species:'solar_strawberry',profile:common,count:state.seeds.solar_strawberry-1
    })
    checkLegacy(true)
    commit(state,{type:'plant',plot:12,species:'solar_strawberry',replaceId:state.plots[12].plant!.id})
    commit(state,{type:'store',plot:12,expectedId:state.plots[12].plant!.id})
    checkLegacy(false)
  })

  it('SV-02: preserves unknown future versions and irrecoverable snapshots until confirmed reset', () => {
    const storage = memoryStorage()
    const state = initialState(33)
    const future = JSON.stringify({ ...state, schemaVersion: state.schemaVersion + 1 })
    const irrecoverable = JSON.stringify({ ...state, coins: -1 })
    for (const [raw, warning] of [[future, 'future'], [irrecoverable, 'damaged']]) {
      storage.clear()
      storage.setItem(primary, raw)
      const persistence = createPersistence(() => storage)
      const session = persistence.load()
      expect(session).toMatchObject({coins:20,schemaVersion:11})
      expect(persistence.warning).toBe(warning)
      commit(session, { type: 'plant', plot: 8, species: 'radish' })
      persistence.save(session)
      expect(storage.getItem(primary)).toBe(raw)
      expect(JSON.parse(persistence.exportData(session))).toEqual({primary:raw,backup:null})
      persistence.reset(state)
      expect(persistence.warning).toBeNull()
      expect(JSON.parse(storage.getItem(primary)!)).toEqual(state)
      expect(JSON.parse(storage.getItem(backup)!)).toEqual(state)
    }
  })

  it('SV-02: rejects invalid ownership, ready state, topology and seed ledger', () => {
    const state = initialState(33)
    const duplicate = structuredClone(state)
    duplicate.nursery.push(plantAt(duplicate, 12))
    expect(validState(duplicate)).toBe(false)
    const disconnected = structuredClone(state)
    disconnected.plots[3].open = true
    expect(validState(disconnected)).toBe(false)
    const invalidReadyTime = structuredClone(state)
    invalidReadyTime.plots[12].plant = { ...plantAt(state, 12), progress: 1, mature: true, readySince: 1 }
    expect(validState(invalidReadyTime)).toBe(false)
    expect(validState({ ...state, seeds: { ...state.seeds, solar_strawberry: 1 } })).toBe(false)
  })

  it('SV-03: continues in memory when storage cannot be accessed or written', () => {
    const unavailable = createPersistence(() => { throw new Error('Storage access denied') })
    const state = unavailable.load()
    expect(unavailable.warning).toBe('unavailable')
    wait(state, 6)
    commit(state, { type: 'harvest', plot: 12 })
    const revenue=saleValue(state)
    commit(state, { type: 'sell' })
    unavailable.save(state)
    expect(state.coins).toBe(20+revenue)
    expect(unavailable.warning).toBe('unavailable')

    const storage = memoryStorage()
    storage.setItem = () => { throw new Error('Quota exceeded') }
    const full = createPersistence(() => storage)
    expect(validState(full.load())).toBe(true)
    full.save(state)
    expect(full.warning).toBe('unavailable')
  })
})
