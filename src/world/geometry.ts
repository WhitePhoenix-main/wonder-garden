import { island } from '../game/config'

export const halfWidth = island.tileWidth / 2
export const halfHeight = island.tileHeight / 2

export type Point = { x: number; y: number }

export function iso(x: number, y: number): Point {
  return { x: (x - y) * halfWidth, y: (x + y) * halfHeight }
}

export function plotPosition(index: number): Point {
  return iso(island.plotOrigin.x + index % island.plotWidth,
    island.plotOrigin.y + Math.floor(index / island.plotWidth))
}

export function plotAt(point: Point): number | null {
  const x = Math.round((point.x / halfWidth + point.y / halfHeight) / 2) - island.plotOrigin.x
  const y = Math.round((point.y / halfHeight - point.x / halfWidth) / 2) - island.plotOrigin.y
  if (x < 0 || y < 0 || x >= island.plotWidth || y >= island.plotHeight) return null
  return y * island.plotWidth + x
}
