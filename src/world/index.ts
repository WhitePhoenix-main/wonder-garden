import Phaser from 'phaser'
import { isSpecies, speciesInfo } from '../game/config'
import type { IslandId } from '../game/model'
import type { World, WorldView } from '../runtime/presentation'
import { halfHeight, halfWidth, islandForPlot, islandFromView, iso, mapFor, plotPosition, type Point } from './geometry'
import { IslandScene } from './IslandScene'
import { bindInput } from './input'

type Targets=Pick<import('../runtime/presentation').UI,'pick'|'pickDecor'|'nursery'|'market'|'bridge'|'helper'|'inspect'>
function frameFor(id:IslandId) {
  const map = mapFor(id)
  const groundHeight = (map.width + map.height) * halfHeight
  return {
    center: {x:(map.width - map.height) * halfWidth / 2, y:groundHeight / 2 + 14},
    width: (map.width + map.height) * halfWidth,
    height: groundHeight + 267
  }
}

export function createWorld(host: HTMLElement, targets:Targets): World {
  let view: WorldView | null = null
  let current: IslandScene | null = null
  let removeInput: (() => void) | undefined
  const initialMagnification = host.clientWidth <= 600 ? 1.45 : 1
  const cameras = {
    green:{focus:frameFor('green').center, magnification:initialMagnification},
    valley:{focus:frameFor('valley').center, magnification:initialMagnification}
  }
  let islandId:IslandId = 'green'
  const updateCamera = (): void => {
    if (!current) return
    const {center,width,height} = frameFor(islandId)
    const {focus,magnification} = cameras[islandId]
    const camera = current.cameras.main
    const baseZoom = Math.min(camera.width / (width + 38), camera.height / height)
    const zoom = baseZoom * magnification
    const horizontalRange = Math.max(width * 0.12, width / 2 - camera.width / (zoom * 3.5))
    const verticalRange = Math.max(height * 0.12, height / 2 - camera.height / (zoom * 3.5))
    focus.x = Phaser.Math.Clamp(focus.x, center.x - horizontalRange, center.x + horizontalRange)
    focus.y = Phaser.Math.Clamp(focus.y, center.y - verticalRange, center.y + verticalRange)
    camera.setZoom(zoom).centerOn(focus.x, focus.y)
  }

  function changeZoom(factor: number, from: Point, to = from): void {
    if (!current || !Number.isFinite(factor)) return
    const viewCamera = cameras[islandId]
    const {focus,magnification} = viewCamera
    const camera = current.cameras.main
    const old = camera.zoom
    const halfX = camera.width / 2
    const halfY = camera.height / 2
    const target = Phaser.Math.Clamp(magnification * factor, 0.72, 3.4)
    const next = old * target / magnification
    focus.x += (from.x - halfX) / old - (to.x - halfX) / next
    focus.y += (from.y - halfY) / old - (to.y - halfY) / next
    viewCamera.magnification = target
    updateCamera()
  }

  function projectBounds(point: Point, width: number, top: number, bottom: number): DOMRect | null {
    if (!current) return null
    const camera = current.cameras.main
    const {focus} = cameras[islandId]
    const canvas = game.canvas.getBoundingClientRect()
    const scaleX = camera.zoom * canvas.width / camera.width
    const scaleY = camera.zoom * canvas.height / camera.height
    const centerX = canvas.left + canvas.width / 2 + (point.x - focus.x) * scaleX
    const centerY = canvas.top + canvas.height / 2 + (point.y - focus.y) * scaleY
    const left = Math.max(canvas.left, centerX - width * scaleX / 2)
    const right = Math.min(canvas.right, centerX + width * scaleX / 2)
    const upper = Math.max(canvas.top, centerY - top * scaleY)
    const lower = Math.min(canvas.bottom, centerY + bottom * scaleY)
    if (right - left < 12 || lower - upper < 12) return null
    return new DOMRect(left, upper, right - left, lower - upper)
  }

  class WorldScene extends IslandScene {
    create() {
      super.create()
      current = this
      if (this.game.scale.width !== size.width || this.game.scale.height !== size.height) {
        this.game.scale.resize(size.width,size.height)
      }
      updateCamera()
      removeInput = bindInput(this.game.canvas, {
        size: () => size,
        view: () => view,
        toWorld: point => {
          const camera = this.cameras.main
          const {focus} = cameras[islandId]
          return {
            x: focus.x + (point.x - camera.width / 2) / camera.zoom,
            y: focus.y + (point.y - camera.height / 2) / camera.zoom
          }
        },
        zoom: changeZoom,
        pan: delta => {
          const zoom = this.cameras.main.zoom
          const {focus} = cameras[islandId]
          focus.x -= delta.x / zoom
          focus.y -= delta.y / zoom
          updateCamera()
        },
        ...targets,
        objectAt:point=>this.hitObject(point)
      })
      if (view) this.paint(view)
    }
  }

  const measure = () => ({ width: Math.max(1,host.clientWidth), height: Math.max(1,host.clientHeight) })
  let size = measure()
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: size.width,
    height: size.height,
    parent: host,
    transparent: true,
    render: { antialias: true },
    input: { mouse: false, touch: false, keyboard: false },
    audio: { noAudio: true },
    banner: false,
    scene: WorldScene,
  })
  const observer = new ResizeObserver(() => {
    const next = measure()
    if (size.width === next.width && size.height === next.height) return
    size = next
    if (game.isBooted) {
      game.scale.resize(size.width,size.height)
      updateCamera()
    }
  })
  observer.observe(host)
  return {
    effects(events) {
      if (events.some(e=>e.startsWith('RecipeRevealed:'))) current?.celebrate()
      for (const event of events) {
        const [type, plot, species, count] = event.split(':')
        if (type === 'HelperHarvested' || type==='HelperCleaned' || type==='HelperReplanted') current?.flyToPlot(Number(plot))
        if (type==='PlantCleaned' && plot!==undefined) current?.collectEffect(Number(plot), view?.state.lang==='en' ? 'Bed cleared' : 'Грядка очищена')
        if (type === 'Harvested' && isSpecies(species)) {
          const info = speciesInfo[species]
          const name = view?.state.lang === 'en' ? info.nameEn : info.nameRu
          current?.collectEffect(Number(plot), Number(count)===0
            ? (view?.state.lang==='en' ? 'Crop failed · −1 harvest' : 'Неурожай · −1 сбор')
            : `+${count} ${name}`)
        }
      }
    },
    render(next) {
      view = next
      const nextIsland = islandFromView(next)
      if (nextIsland !== islandId) {
        islandId = nextIsland
        updateCamera()
      }
      current?.paint(next)
    },
    plotBounds(index) {
      const plot = view?.state.plots[index]
      if (!plot || islandForPlot(index) !== islandId) return null
      return projectBounds(plotPosition(index), 110, plot.plant ? 79 : 32, 34)
    },
    structureBounds(id) {
      const map = mapFor(islandId)
      const key = id === 'market' ? 'stall' : id === 'nursery' ? 'greenhouse' : id
      const structure = map.structures.find(item => item.id === key)
      if (!structure) return null
      const center = iso(structure.x + (structure.width - 1) / 2, structure.y + (structure.height - 1) / 2)
      return projectBounds(center, 160, 118, 22)
    },
    focusPlot(index) {
      if (!view?.state.plots[index] || islandForPlot(index) !== islandId) return
      const point = plotPosition(index)
      const bounds = projectBounds(point, 110, 79, 34)
      if (bounds && bounds.top > 95 && bounds.bottom < innerHeight - 240 &&
          bounds.left > 12 && bounds.right < innerWidth - 12) return
      cameras[islandId].focus = {x:point.x,y:point.y - 30}
      updateCamera()
    },
    center() {
      cameras[islandId].focus = frameFor(islandId).center
      cameras[islandId].magnification = 1
      updateCamera()
    },
    zoom(delta) {
      changeZoom(delta < 0 ? 0.8 : 1.25,{ x: size.width/2, y: size.height/2 })
    },
    destroy() {
      removeInput?.()
      observer.disconnect()
      game.destroy(true)
      current = null
    },
  }
}
