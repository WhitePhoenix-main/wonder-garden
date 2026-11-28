import { beginObservation } from './game/analytics'
import { gardenAudio } from './runtime/audio'
import { createClock } from './runtime/clock'
import type { Command } from './game/model'
import type { UI, WorldView } from './runtime/presentation'
import { advance, execute, initialState } from './game'
import { createPersistence } from './persistence/storage'
import { createWorld } from './world'
import { createUI } from './ui'
import { showReturnReport } from './ui/panels/production'

const debug = import.meta.env.DEV && new URLSearchParams(location.search).get('debug') === '1'
const saveKey=debug ? 'wonder-garden.dev.v1' : 'wonder-garden.save.v1'
const storage = createPersistence(() => window.localStorage, saveKey)
const audio = gardenAudio()

let speed = 1
const view: WorldView = { state:storage.load(), started:storage.hasGarden, menu:true, shovel:false, mode:'garden', selected:null, moveFrom:null, decorEditing:false, decorPreview:null }
beginObservation(view.state)
const prefKey = debug ? 'wonder-garden.dev.preferences' : 'wonder-garden.preferences'
if (!view.started) {
  try {
    const prefs = JSON.parse(localStorage.getItem(prefKey) ?? '{}')
    if (prefs.lang === 'ru' || prefs.lang === 'en') view.state.lang = prefs.lang
    if (typeof prefs.muted === 'boolean') view.state.muted = prefs.muted
    if (typeof prefs.musicMuted === 'boolean') view.state.musicMuted = prefs.musicMuted
  } catch { /* Use defaults if preferences cannot be read. */ }
}
let ui: UI
const world = createWorld(document.querySelector<HTMLElement>('#world')!,{
  pick:index=>ui.pick(index),pickDecor:slot=>ui.pickDecor(slot),inspect:index=>ui.inspect(index),
  nursery:()=>ui.nursery(),market:()=>ui.market(),bridge:()=>ui.bridge(),helper:()=>ui.helper()
})
function render() {
  document.documentElement.lang = view.state.lang
  world.render(view)
  ui.render(view, storage.warning)
}
function command(cmd: Command) {
  if (storage.warning==='otherTab') return {ok:false,reason:'otherTab'} as const
  const result = execute(view.state, cmd)
  if (result.ok && result.events.length) {
    world.effects(result.events)
    const rarity = ['legendary','epic','rare'].find(rank=>result.obtained?.some(seed=>seed.rarity===rank))
    const cue = rarity==='legendary' ? 'LegendarySeed' : rarity==='epic' ? 'EpicSeed' : rarity==='rare' ? 'RareSeed' : null
    audio.play(cue ? [cue,...result.events] : result.events,view.state.muted)
    if (cmd.type === 'sound' || cmd.type === 'music' || cmd.type === 'language') {
      const {lang,muted,musicMuted}=view.state
      try { localStorage.setItem(prefKey,JSON.stringify({lang,muted,musicMuted})) } catch { /* In-memory preferences remain active. */ }
      audio.sync(!document.hidden && !view.menu,musicMuted)
    }
    if (view.started) storage.save(view.state)
    render()
  }
  return result
}
const clock = createClock(seconds => {
  const events = advance(view.state, seconds * speed)
  if (!events.length) return
  storage.save(view.state)
  lastSaveTime = view.state.playTime
  world.effects(events)
  audio.play(events,view.state.muted,true)
  ui.notify(events)
})
let lastSaveTime = view.state.playTime
ui = createUI(document.querySelector<HTMLElement>('#ui')!, {
  command,
  enter() { view.started=true; view.menu=false; resume(); render() },
  menu() { pause(); view.menu=true; render() },
  select(index) { view.selected = index; render() },
  center: () => world.center(),
  zoom: delta => world.zoom(delta),
  changeView(patch) { Object.assign(view,patch); render() },
  decorPreview(editing, preview) {
    view.decorEditing = editing
    view.decorPreview = preview
    render()
  },
  exportSave() {
    const blob = new Blob([storage.exportData(view.state)], {type:'application/json'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'wonder-garden-save.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
  },
  reset() {
    if (storage.warning==='otherTab') return
    const {lang, muted, musicMuted} = view.state
    view.state = initialState()
    beginObservation(view.state)
    Object.assign(view.state,{lang,muted,musicMuted})
    Object.assign(view,{ shovel:false, mode:'garden', selected:null, moveFrom:null, decorEditing:false, decorPreview:null })
    lastSaveTime = 0
    clock.reset()
    view.state.passive.checkpoint=Date.now()
    storage.reset(view.state)
    world.center()
    render()
  }
})
if (debug) void import('./runtime/dev').then(({mountDebug}) => mountDebug(() => {
  view.state.coins += 500
  storage.save(view.state)
  render()
}, () => {
  speed = speed === 1 ? 8 : 1
  return speed === 8
}))
render()

let pending = 0
let wall=Date.now()
let resuming=0
function frame(now:number) {
  if (document.hidden || view.menu || storage.warning==='otherTab') return
  const real=Date.now()
  if (real-wall>30_000) { resume(); return }
  wall=real
  view.state.passive.checkpoint=Math.max(real,view.state.passive.checkpoint??0)
  if (clock.frame(now)) {
    if (view.state.playTime - lastSaveTime >= 5) {
      storage.save(view.state)
      lastSaveTime = view.state.playTime
    }
    render()
  }
  pending = requestAnimationFrame(frame)
}
function pause() {
  resuming++
  cancelAnimationFrame(pending)
  clock.reset()
  if (view.started && !view.menu) storage.save(view.state)
  audio.sync(false,view.state.musicMuted)
}
function resume() {
  cancelAnimationFrame(pending)
  clock.reset()
  if (document.hidden || view.menu) return
  audio.sync(true,view.state.musicMuted)
  const attempt=++resuming
  const start=()=>{
    if (attempt!==resuming || document.hidden || view.menu) return
    wall=Date.now()
    const report=storage.resume(view.state,wall)
    render()
    if (report) showReturnReport(report,view.state.lang)
    if (storage.warning!=='otherTab') pending=requestAnimationFrame(frame)
  }
  if (navigator.locks) void navigator.locks.request(saveKey,start).catch(start)
  else start()
}
window.addEventListener('storage',event=>{
  if (event.key!==saveKey || event.newValue===null) return
  storage.markExternal(event.newValue)
  if (storage.warning==='otherTab') {
    cancelAnimationFrame(pending)
    audio.sync(false,view.state.musicMuted)
    render()
  }
})
document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume())
window.addEventListener('pagehide',pause)
window.addEventListener('pageshow',resume)
resume()
