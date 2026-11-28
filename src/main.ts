import { gardenAudio } from './runtime/audio'
import { createClock } from './runtime/clock'
import type { Command } from './game/model'
import type { UI, WorldView } from './runtime/presentation'
import { advance, execute, initialState } from './game'
import { createPersistence } from './persistence/storage'
import { createWorld } from './world'
import { createUI } from './ui'

const debug = import.meta.env.DEV && new URLSearchParams(location.search).get('debug') === '1'
const storage = createPersistence(() => window.localStorage, debug ? 'wonder-garden.dev.v1' : undefined)
const audio = gardenAudio()

let speed = 1
const view: WorldView = { state:storage.load(), started:storage.hasGarden, menu:true, shovel:false, mode:'garden', selected:null, moveFrom:null, decorEditing:false, decorPreview:null }
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
const world = createWorld(document.querySelector<HTMLElement>('#world')!, index => ui.pick(index), slot => ui.pickDecor(slot),()=>ui.nursery())
function render() {
  document.documentElement.lang = view.state.lang
  world.render(view)
  ui.render(view, storage.warning)
}
function command(cmd: Command) {
  const result = execute(view.state, cmd)
  if (result.ok && result.events.length) {
    world.effects(result.events)
    const cue = result.obtained?.some(seed=>['rare','epic','legendary'].includes(seed.rarity)) ? ['RareSeed',...result.events] : result.events
    audio.play(cue,view.state.muted)
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
  enter() { view.started=true; view.menu=false; storage.save(view.state); resume(); render() },
  menu() { view.menu=true; pause(); render() },
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
    const {lang, muted, musicMuted} = view.state
    view.state = initialState()
    Object.assign(view.state,{lang,muted,musicMuted})
    Object.assign(view,{ shovel:false, mode:'garden', selected:null, moveFrom:null, decorEditing:false, decorPreview:null })
    lastSaveTime = 0
    clock.reset()
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
function frame(now:number) {
  if (document.hidden || view.menu) return
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
  cancelAnimationFrame(pending)
  clock.reset()
  if (view.started) storage.save(view.state)
  audio.sync(false,view.state.musicMuted)
}
function resume() {
  cancelAnimationFrame(pending)
  clock.reset()
  audio.sync(!document.hidden && !view.menu,view.state.musicMuted)
  if (!document.hidden && !view.menu) pending = requestAnimationFrame(frame)
}
document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume())
window.addEventListener('pagehide',pause)
window.addEventListener('pageshow',resume)
resume()
