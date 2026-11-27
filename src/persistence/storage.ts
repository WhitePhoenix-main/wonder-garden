import type { GameState } from '../game/model'
import { initialState } from '../game/state'
import { parseSave } from './migration'

const primary = 'wonder-garden.save.v1'

export function createPersistence(access: () => Storage, key = primary) {
  const backupKey = key + '.backup'
  let warning: string|null = null
  let hasGarden = false
  let protectedSave = false
  function load(): GameState {
    try {
      const storage = access()
      const raw = storage.getItem(key)
      const current = parseSave(raw)
      if (current === 'future') { protectedSave = true; warning = 'future'; return initialState() }
      if (current) { hasGarden = true; return current }
      const previous = storage.getItem(backupKey)
      const recovered = parseSave(previous)
      if (recovered === 'future') { protectedSave = true; warning = 'future'; return initialState() }
      if (recovered) { hasGarden = true; warning = 'recovered'; return recovered }
      if (raw !== null || previous !== null) { protectedSave = true; warning = 'damaged' }
    } catch { warning = 'unavailable' }
    return initialState()
  }
  function save(state: GameState) {
    if (protectedSave) return
    try {
      const storage = access()
      const raw = storage.getItem(key)
      const previous = parseSave(raw)
      if (previous === 'future') { protectedSave = true; warning = 'future'; return }
      if (raw && previous) storage.setItem(backupKey,raw)
      storage.setItem(key, JSON.stringify(state))
      if (warning === 'unavailable') warning = null
    } catch { warning = 'unavailable' }
  }
  function reset(state: GameState) {
    try {
      const storage = access()
      const raw = JSON.stringify(state)
      storage.setItem(key,raw)
      storage.setItem(backupKey,raw)
      protectedSave = false
      warning = null
    } catch { warning = 'unavailable' }
  }
  function exportData(state:GameState):string {
    try {
      if (protectedSave) {
        const storage = access()
        return JSON.stringify({primary:storage.getItem(key),backup:storage.getItem(backupKey)},null,2)
      }
    } catch { /* Export the current in-memory garden. */ }
    return JSON.stringify(state,null,2)
  }

  return { get hasGarden() { return hasGarden }, load, save, reset, exportData, get warning() { return warning } }
}
