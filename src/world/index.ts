import Phaser from 'phaser'
import { isSpecies, speciesInfo } from '../game/config'
import type { IslandId } from '../game/model'
import type { World, WorldView } from '../runtime/presentation'
import { halfHeight, halfWidth, islandFromView, mapFor, type Point } from './geometry'
import { IslandScene } from './IslandScene'
import { bindInput } from './input'

function frameFor(id:IslandId) {
  const map = mapFor(id)
  const groundHeight = (map.width + map.height) * halfHeight
  return {
    center: {x:(map.width - map.height) * halfWidth / 2, y:groundHeight / 2 + 14},
    width: (map.width + map.height) * halfWidth,
    height: groundHeight + 267
  }
}

export function createWorld(host: HTMLElement, onPick: (index: number) => void, onDecor:(slot:string)=>void,onNursery:()=>void): World {
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
        pick: onPick,
        nursery:onNursery,
        pickDecor: onDecor
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
        if (type === 'HelperHarvested') current?.flyToPlot(Number(plot))
        if (type === 'Harvested' && isSpecies(species)) {
          const info = speciesInfo[species]
          const name = view?.state.lang === 'en' ? info.nameEn : info.nameRu
          current?.collectEffect(Number(plot), `+${count} ${name}`)
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
