import { island, plotCount, valley } from '../game/config'
import type { IslandId } from '../game/model'

export const halfWidth = island.tileWidth / 2
export const halfHeight = island.tileHeight / 2

export type Point = { x: number; y: number }

export const mapFor = (id: IslandId) => id === 'valley' ? valley : island
export const firstPlot = (id: IslandId) => id === 'valley' ? plotCount : 0
export const islandForPlot = (index: number): IslandId => index < plotCount ? 'green' : 'valley'

export function islandFromView(view: { state: { activeIsland?: IslandId } } | null): IslandId {
  return view?.state.activeIsland ?? 'green'
}

export function iso(x: number, y: number): Point {
  return { x: (x - y) * halfWidth, y: (x + y) * halfHeight }
}

export function plotPosition(index: number): Point {
  const id = islandForPlot(index)
  const map = mapFor(id)
  const local = index - firstPlot(id)
  return iso(map.plotOrigin.x + local % map.plotWidth,
    map.plotOrigin.y + Math.floor(local / map.plotWidth))
}

export function gridAt(point: Point): Point {
  return {
    x: Math.round((point.x / halfWidth + point.y / halfHeight) / 2),
    y: Math.round((point.y / halfHeight - point.x / halfWidth) / 2),
  }
}

export function plotAt(point: Point, id: IslandId = 'green'): number | null {
  const map = mapFor(id)
  const cell = gridAt(point)
  const x = cell.x - map.plotOrigin.x
  const y = cell.y - map.plotOrigin.y
  if (x < 0 || y < 0 || x >= map.plotWidth || y >= map.plotHeight) return null
  return firstPlot(id) + y * map.plotWidth + x
}
