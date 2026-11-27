import type { Command, DecorType, Species } from '../game/model'
import type { Mode, UI, UIActions, WorldView } from '../runtime/presentation'
import { bedLevels, speciesInfo } from '../game/config'
import { canRecoverGarden, canReplace, expansionCost } from '../game/queries'
import type { DecorChoice } from './panels/garden'
import { uiMarkup, type CollectionFilter, type Overlay } from './render'
import { plantName, words } from './strings'
import './ui.css'

export function createUI(host: HTMLElement, actions: UIActions): UI {
  let view: WorldView
  let warning: string | null = null
  let chosen: Species|null = null
  let notice = ''
  let last = ''
  let pressing = false
  let returnId: number | null = null
  let overlay: Overlay|null = null
  let collectionFilter: CollectionFilter = 'all'
  let entry: Species|null = null
  let chapter: number|null = null
  let slot: string|null = null
  let decorChoice: DecorChoice|null = null
  let panelKey = ''
  const name = (id: Species) => plantName(view.state.lang,id)
  const t = () => words[view.state.lang]

  function updateDecor() {
    const choice = decorChoice
    const type = choice && ('newType' in choice ? choice.newType :
      view.state.decorations.find(d => d.id === choice.id)?.type)
    actions.decorPreview(overlay === 'decor', slot && type ? {slot,type} : null)
  }
  function pickDecor(id:string) {
    if (overlay !== 'decor') return
    slot = id
    updateDecor()
  }
  function closePanels() {
    overlay = null
    slot = null
    decorChoice = null
  }

  function showRewards(events:string[]) {
    const rewards = events.filter(e => e.startsWith('RecipeRevealed:') || e.startsWith('SeedPropagated:'))
    if (rewards.length) notice = rewards.map(e => t().earned + ' · ' + name(e.split(':')[1] as Species)).join(' / ')
  }
  function run(command: Command) {
    const result = actions.command(command)
    if (!result.ok) {
      const dict = t() as Record<string,string>
      notice = dict[result.reason] ?? dict.error
    } else if (result.events.includes('GardenCompleted')) notice = t().finished
    else {
      notice = ''
      showRewards(result.events)
    }
    draw()
  }
  function draw() {
    if (!view) return
    if (pressing) return
    const html = uiMarkup(view,{
      overlay, warning, notice, chosen, returnId, collectionFilter, entry, chapter, slot, decorChoice
    })
    if (html === last) return
    const active = document.activeElement as HTMLElement | null
    const action = active?.dataset.action, data = active?.dataset.seed || active?.dataset.mode || active?.dataset.id
    const context = overlay ?? view.mode
    const scroll = panelKey === context ? host.querySelector('.context-inner')?.scrollTop ?? 0 : 0
    panelKey = context
    host.innerHTML = html
    const inner = host.querySelector<HTMLElement>('.context-inner')
    if (inner) inner.scrollTop = scroll
    if (action && active && host !== active && !document.body.contains(active)) {
      const candidate = [...host.querySelectorAll<HTMLElement>('[data-action]')].find(el => el.dataset.action === action && (!data || el.dataset.seed === data || el.dataset.mode === data || el.dataset.id === data))
      candidate?.focus({preventScroll:true})
    }
    last = html
  }
  host.addEventListener('pointerdown', () => { pressing = true })
  window.addEventListener('pointerup', () => {
    if (!pressing) return
    pressing = false
    window.setTimeout(draw, 0)
  })
  window.addEventListener('pointercancel', () => { pressing = false; draw() })
  host.addEventListener('click', event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('button[data-action]')
    if (!target || !view) return
    const action = target.dataset.action, selected = view.selected, plot = selected === null ? null : view.state.plots[selected]
    if (action === 'filter') { collectionFilter = target.dataset.filter as typeof collectionFilter; entry = null; draw(); return }
    if (action === 'entry') { const id = target.dataset.entry as Species; entry = entry === id ? null : id; draw(); return }
    if (action === 'helper' || action === 'collection' || action === 'settings' || action === 'journal' || action === 'decor') {
      const nextOverlay = action === overlay ? null : action
      closePanels()
      overlay = nextOverlay
      updateDecor()
      return
    }
    if (action === 'close' && overlay) {
      closePanels()
      updateDecor()
      return
    }
    if (action === 'chapter') { chapter = Number(target.dataset.id); draw(); return }
    if (action === 'decor-slot') { if (target.dataset.id) pickDecor(target.dataset.id); return }
    if (action === 'decor-type') { decorChoice = {newType:target.dataset.id as DecorType}; updateDecor(); return }
    if (action === 'decor-item') { decorChoice = {id:Number(target.dataset.id)}; updateDecor(); return }
    if (action === 'cancel-decor') { decorChoice = null; updateDecor(); return }
    if (action === 'store-decor') return run({type:'storeDecor',id:Number(target.dataset.id)})
    if (action === 'confirm-decor' && slot && decorChoice) {
      const replaceId = target.dataset.occupant ? Number(target.dataset.occupant) : null
      const choice = decorChoice
      decorChoice = null
      run('newType' in choice ? {type:'buyDecor',decor:choice.newType,slot,replaceId} :
        {type:'placeDecor',id:choice.id,slot,replaceId})
      updateDecor()
      return
    }
    if (action === 'upgrade-basket') return run({type:'upgradeBasket',target:Number(target.dataset.level)})
    if (action === 'sound') return run({type:'sound',muted:!view.state.muted})
    if (action === 'export-save') return actions.exportSave()
    if (action === 'upgrade-helper') {
      const level = Number(target.dataset.level)
      if (level === 1 || level === 2 || level === 3) run({type:'upgradeHelper',target:level})
      return
    }
    if (action === 'buy-auto-sell') return run({type:'buyAutoSell'})
    if (action === 'mode') { closePanels(); updateDecor(); notice = ''; returnId = null; chosen = null; actions.changeView({mode:target.dataset.mode as Mode,selected:null,moveFrom:null}); return }
    if (action === 'seed') { chosen = target.dataset.seed as Species; returnId = null; draw(); return }
    if (action === 'cancel-return') { returnId = null; draw(); return }
    if (action === 'return') { returnId = Number(target.dataset.id); draw(); return }
    if (action === 'sell') return run({type:'sell'})
    if (action === 'language') return run({type:'language',lang:view.state.lang === 'ru' ? 'en' : 'ru'})
    if (action === 'reset') { if (window.confirm(t().confirmReset)) { notice=''; chosen=null; returnId=null; closePanels(); chapter=null; collectionFilter='all'; entry=null; actions.reset() } return }
    if (action === 'center') return actions.center()
    if (action === 'zoomIn') return actions.zoom(1)
    if (action === 'zoomOut') return actions.zoom(-1)
    if (action === 'close' || action === 'cancel') { actions.changeView({mode:view.mode,selected:null,moveFrom:null}); return }
    if (action === 'move' && selected !== null) { actions.changeView({mode:view.mode,selected,moveFrom:selected}); return }
    if (selected === null || !plot) return
    if (action === 'emergencyRadish') return run({type:'emergencyRadish',plot:selected})
    if (action === 'clear' && !window.confirm(`${t().confirmClear} ${expansionCost(view.state)} ◈`)) return
    if (action === 'upgrade' && !window.confirm(`${t().confirmUpgrade} ${bedLevels[plot.level === 1 ? 2 : 3].upgradeCost} ◈`)) return
    if (action === 'clear' || action === 'upgrade' || action === 'store' || action === 'harvest') return run({type:action,plot:selected})
  })
  return {
    notify: showRewards,
    pickDecor,
    render(next, storageWarning) { view=next; warning=storageWarning; draw() },
    pick(index) {
      if (!view || overlay) return
      const plot = view.state.plots[index]
      if (view.mode === 'garden' && plot.plant?.readySince !== null && plot.plant) { run({type:'harvest',plot:index}); return }
      if (view.mode === 'build' && view.moveFrom !== null) {
        const from = view.moveFrom
        run({type:'move',from,to:index})
        actions.changeView({mode:view.mode,selected:index,moveFrom:null})
        return
      }
      if (view.mode === 'plant' && plot.open) {
        if (returnId !== null) {
          if (!plot.plant) { run({type:'return',plot:index,id:returnId}); returnId = null }
          else notice = t().occupied
          actions.select(index)
          return
        }
        if (!chosen || canRecoverGarden(view.state)) { actions.select(index); return }
        if (plot.plant) {
          if (!canReplace(view.state)) { actions.select(index); return }
          const replaceId = plot.plant.id
          const price = speciesInfo[chosen].seedPrice
          const amount = price === null ? `1 ${t().seedUnit}` : `${price} ${t().cost}`
          if (!window.confirm(`${t().confirmOld}: ${name(plot.plant.species)} #${replaceId}\n${t().confirmNew}: ${name(chosen)} — ${amount}`)) return
          run({type:'plant',plot:index,species:chosen,replaceId})
        } else run({type:'plant',plot:index,species:chosen})
      }
      actions.select(index)
    }
  }
}
