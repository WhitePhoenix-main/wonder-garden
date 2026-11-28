import type { GameState } from '../game/model'
import { initialState } from '../game/state'
import { parseSave } from './migration'
import { catchUp } from '../game/offline'

const primary = 'wonder-garden.save.v1'

export function createPersistence(access: () => Storage, key = primary) {
  const backupKey = key + '.backup'
  let warning: string|null = null
  let hasGarden = false
  let protectedSave = false
  let observed: string|null|undefined
  let recoveredBackup = false
  function load(): GameState {
    try {
      const storage = access()
      const raw = storage.getItem(key)
      observed = raw
      const current = parseSave(raw)
      if (current === 'future') { protectedSave = true; warning = 'future'; return initialState() }
      if (current) { hasGarden = true; return current }
      const previous = storage.getItem(backupKey)
      const recovered = parseSave(previous)
      if (recovered === 'future') { protectedSave = true; warning = 'future'; return initialState() }
      if (recovered) { hasGarden = true; warning = 'recovered'; recoveredBackup = true; return recovered }
      if (raw !== null || previous !== null) { protectedSave = true; warning = 'damaged' }
    } catch { warning = 'unavailable' }
    return initialState()
  }
  function save(state: GameState, offline=false):boolean {
    if (protectedSave) return false
    try {
      const storage = access()
      const raw = storage.getItem(key)
      const previous = parseSave(raw)
      if (previous === 'future') { protectedSave = true; warning = 'future'; return false }
      if (observed!==undefined && observed!==raw) {warning='otherTab'; return false}
      if (raw && previous) {
        // A recovered predecessor may lose newer progress. Its time interval must not pay again.
        if (offline) previous.passive.checkpoint=state.passive.checkpoint
        storage.setItem(backupKey,offline ? JSON.stringify(previous) : raw)
      }
      const next=JSON.stringify(state)
      storage.setItem(key,next)
      observed=next
      recoveredBackup=false
      if (warning === 'unavailable' || warning==='otherTab') warning = null
      return true
    } catch { warning = 'unavailable'; return false }
  }
  function resume(state:GameState,now:number) {
    const draft=structuredClone(state)
    if (recoveredBackup) draft.passive.checkpoint=Math.max(now,draft.passive.checkpoint??0)
    const report=catchUp(draft,now)
    if (!save(draft,true)) {
      // Do not bank an uncommitted interval in memory while storage is unavailable.
      state.passive.checkpoint=Math.max(now,state.passive.checkpoint??0)
      return null
    }
    Object.assign(state,draft)
    return report
  }
  function reset(state: GameState) {
    try {
      const storage = access()
      const raw = JSON.stringify(state)
      storage.setItem(key,raw)
      storage.setItem(backupKey,raw)
      protectedSave = false
      observed=raw
      recoveredBackup=false
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

  function markExternal(raw:string) {
    if (observed!==undefined && raw!==observed && !protectedSave) warning='otherTab'
  }

  return { get hasGarden() { return hasGarden }, load, save, resume, reset, exportData, markExternal, get warning() { return warning } }
}
