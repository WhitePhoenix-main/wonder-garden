import type Phaser from 'phaser'
import { speciesIds } from '../../game/config'
import type { Point } from '../geometry'
import type { Canvas } from './drawing'
import { plant } from './plants'
import { bridge, cloud, flowers, obstacle, paintBase, paintBed, paintGrass, paintPath, pond, tree } from './terrain'
import { decoration, greenhouse, leafHelper, stall } from './structures'

type Bounds = [left: number, top: number, width: number, height: number]
type Paint = (ctx: Canvas) => void
type Anchor = { x: number; y: number }

export function buildArt(scene: Phaser.Scene) {
  const metadata = new Map<string, Anchor>()
  function texture(key: string, [left, top, width, height]: Bounds, paint: Paint): void {
    metadata.set(key, { x: -left / width, y: -top / height })
    if (scene.textures.exists(key)) return
    const image = scene.textures.createCanvas(key, width, height)
    if (!image) throw new Error(`Could not create world texture ${key}`)
    const ctx = image.getContext()
    ctx.translate(-left, -top)
    paint(ctx)
    image.refresh()
  }
  texture('island_base', [-522,-38,1172,760], paintBase)
  for (let i = 0; i < 3; i++) {
    texture(`grass_${i+1}`, [-65,-33,130,66], ctx => paintGrass(ctx,i))
    texture(`path_straight_${i+1}`, [-65,-33,130,66], ctx => paintPath(ctx,i))
  }
  texture('bed_1',[-66,-40,132,82],ctx => paintBed(ctx,1))
  texture('bed_2',[-66,-40,132,82],ctx => paintBed(ctx,2))
  texture('bed_3',[-66,-40,132,82],ctx => paintBed(ctx,3))
  for (const key of ['rock','stump','weeds']) {
    texture(`obstacle_${key}`,[-51,-44,102,68],ctx => obstacle(ctx,key))
  }
  texture('stage_seed',[-39,-23,78,47],ctx => plant(ctx,'seed',false))
  texture('stage_sprout',[-39,-43,78,67],ctx => plant(ctx,'sprout',false))
  for (const species of speciesIds) {
    for (const phase of ['adult','ripe']) {
      texture(`plant_${species}_${phase}`,[-43,-103,86,127],ctx => plant(ctx,species,phase === 'ripe'))
    }
  }
  texture('greenhouse_ruined',[-126,-155,252,216],ctx => greenhouse(ctx,false))
  texture('greenhouse_restored',[-126,-155,252,216],ctx => greenhouse(ctx,true))
  texture('stall_basic',[-120,-150,240,207],stall)
  texture('stall_auto',[-120,-150,240,207],ctx => stall(ctx,true))
  for (const level of [1,2,3]) {
    texture('helper_leaf_' + level,[-28,-57,56,68],ctx => leafHelper(ctx,level))
  }
  texture('bridge_broken',[-93,-51,150,116],bridge)
  for (const type of ['bench','lantern','flower_arch','sakura'] as const) {
    texture('decor_' + type,[-58,-122,116,151],ctx => decoration(ctx,type))
  }
  texture('pond',[-127,-53,254,109],pond)
  texture('wildflowers_1',[-53,-33,106,59],ctx => flowers(ctx,641,81))
  texture('wildflowers_2',[-53,-33,106,59],ctx => flowers(ctx,533,81))
  texture('garden_tree',[-59,-105,128,137],tree)
  texture('cloud',[-101,-36,204,70],cloud)

  const place = (key: string, point: Point, depth: number): Phaser.GameObjects.Image => {
    const object = scene.add.image(point.x, point.y, key).setDepth(depth)
    setTexture(object,key)
    return object
  }
  function setTexture(object: Phaser.GameObjects.Image, key: string): void {
    const anchor = metadata.get(key)
    if (!anchor) throw new Error(`Unknown world texture ${key}`)
    if (object.texture.key !== key) object.setTexture(key)
    object.setOrigin(anchor.x,anchor.y)
  }
  return { place, setTexture }
}
