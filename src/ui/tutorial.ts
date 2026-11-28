import { plotIndices } from '../game/config'
import { researchStatus } from '../game/queries'
import type { UIActions, WorldView } from '../runtime/presentation'

export function createTutorialOverlay(host:HTMLElement, actions:UIActions) {
  let focusedStep = ''
  let active = false
  let allowedElement:HTMLElement|null = null
  let allowedPlot = -1

  function guard(event:Event) {
    if (!active) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('.tutorial-card') || allowedElement?.contains(target) ||
        target?.closest('[data-action="close"]') ||
        target?.closest<HTMLElement>(`[data-action="pick-bed"][data-id="${allowedPlot}"]`)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  host.addEventListener('click',guard,true)
  document.addEventListener('keydown', event=>{
    if (['Enter',' ','Spacebar'].includes(event.key)) guard(event)
  }, true)

  function render(view:WorldView) {
    active = false
    allowedElement = null
    allowedPlot = -1
    const tutorial = host.querySelector<HTMLElement>('.tutorial-card')
    const step = tutorial?.dataset.tutorialId
    const planting = step === 'first-plant' || step === 'second-plant'
    const harvesting = step === 'first-harvest' || step === 'second-harvest'
    const research = step === 'pollination'
    const seed = planting && view.mode === 'plant' ? host.querySelector<HTMLElement>('[data-action="seed"][data-seed="radish"][data-profile]') : null
    const plot = planting && !seed ? view.state.plots.findIndex(p=>p.open && !p.plant) :
      harvesting ? view.state.plots.findIndex(p=>p.plant?.readySince !== null && !!p.plant?.lives) :
      step === 'cleanup' ? view.state.plots.findIndex(p=>p.plant?.lives === 0) :
      research ? researchStatus(view.state,'solar_strawberry').activePlots.find(i=>plotIndices(view.state.activeIsland).includes(i) && view.state.plots[i]?.plant?.readySince != null) ?? -1 : -1
    if (!tutorial || plot < 0 && !seed) return

    const ring = document.createElement('div')
    ring.className = 'tutorial-world-ring'+(research?' tutorial-advisory':'')
    host.append(ring)
    if (plot >= 0 && focusedStep !== step) {
      focusedStep = step ?? ''
      actions.focusTutorialPlot(plot)
    }
    const follow = () => {
      if (!ring.isConnected) return
      const bounds = seed?.getBoundingClientRect() ?? (plot >= 0 ? actions.worldTutorialBounds(plot) : null)
      const clip = seed?.closest<HTMLElement>('.context-inner')?.getBoundingClientRect()
      const inPanel = !clip || !!bounds && bounds.top >= clip.top && bounds.bottom <= clip.bottom && bounds.left >= clip.left && bounds.right <= clip.right
      let visible = !!bounds && inPanel && bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0 && bounds.left < innerWidth && bounds.top < innerHeight
      if (visible && bounds) {
        const hit=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,bounds.left+bounds.width/2)),Math.max(0,Math.min(innerHeight-1,bounds.top+bounds.height/2)))
        visible = seed ? !!hit && seed.contains(hit) : hit instanceof HTMLCanvasElement
      }
      active=visible && !research
      allowedElement=visible ? seed : null
      allowedPlot=visible ? plot : -1
      ring.style.display = visible ? 'block' : 'none'
      if (visible && bounds) {
        const left=Math.max(0,bounds.left), top=Math.max(0,bounds.top)
        const right=Math.min(innerWidth,bounds.right), bottom=Math.min(innerHeight,bounds.bottom)
        Object.assign(ring.style, {left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'})
      }
      requestAnimationFrame(follow)
    }
    requestAnimationFrame(follow)
  }
  return {render,allowsPlot:(index=-2)=>!active || allowedPlot>=0 && allowedPlot===index}
}
