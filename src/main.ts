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
document.addEventListener('pointerdown',audio.unlock,{capture:true})
document.addEventListener('keydown',audio.unlock,{capture:true})
let speed = 1
const view: WorldView = { state:storage.load(), mode:'garden', selected:null, moveFrom:null, decorEditing:false, decorPreview:null }
let ui: UI
const world = createWorld(document.querySelector<HTMLElement>('#world')!, index => ui.pick(index), slot => ui.pickDecor(slot))
function render() {
  document.documentElement.lang = view.state.lang
  world.render(view)
  ui.render(view, storage.warning)
}
function command(cmd: Command) {
  const result = execute(view.state, cmd)
  if (result.ok && result.events.length) {
    world.effects(result.events, cmd.type === 'harvest' ? cmd.plot : undefined)
    audio.play(result.events,view.state.muted)
    storage.save(view.state)
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
  audio.play(events,view.state.muted)
  ui.notify(events)
})
let lastSaveTime = view.state.playTime
ui = createUI(document.querySelector<HTMLElement>('#ui')!, {
  command,
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
    const {lang, muted} = view.state
    view.state = initialState()
    Object.assign(view.state,{lang,muted})
    Object.assign(view,{ mode:'garden', selected:null, moveFrom:null, decorEditing:false, decorPreview:null })
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
  if (document.hidden) return
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
  storage.save(view.state)
}
function resume() {
  cancelAnimationFrame(pending)
  clock.reset()
  if (!document.hidden) pending = requestAnimationFrame(frame)
}
document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume())
window.addEventListener('pagehide',pause)
window.addEventListener('pageshow',resume)
resume()
