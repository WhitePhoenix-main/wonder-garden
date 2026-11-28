import Phaser from 'phaser'
import { adjacent, island, recipes } from '../game/config'
import { isRecipeActive, secondsLeft, isRecipeRevealed } from '../game/queries'
import { decorationAt } from '../game/decor'
import type { Plant } from '../game/model'
import type { WorldView } from '../runtime/presentation'
import { buildArt } from './art'
import { halfHeight, halfWidth, iso, plotPosition, type Point } from './geometry'

interface CellArt {
  countdown:string
  timer: Phaser.GameObjects.Text
  level: Phaser.GameObjects.Text
  bed: Phaser.GameObjects.Image
  obstacle: Phaser.GameObjects.Image
  plant: Phaser.GameObjects.Image
}

function plantTexture(plant: Plant): string {
  if (plant.readySince !== null) return `plant_${plant.species}_ripe`
  if (plant.mature) return `plant_${plant.species}_adult`
  return plant.progress < 0.22 ? 'stage_seed' : 'stage_sprout'
}

function outline(layer: Phaser.GameObjects.Graphics, point: Point, color: number,
  alpha: number, fill: number, size = 0.91): void {
  const w = halfWidth * size
  const h = halfHeight * size
  const shape = [iso(-size / 2, -size / 2), { x: w, y: 0 }, { x: 0, y: h }, { x: -w, y: 0 }]
    .map(p => ({ x: point.x + p.x, y: point.y + p.y }))
  layer.fillStyle(color, fill).fillPoints(shape, true)
  layer.lineStyle(2.8, color, alpha).strokePoints(shape, true)
}

export class IslandScene extends Phaser.Scene {
  private selectedPlot:number|null=null
  private cells: CellArt[] = []
  private decorations = new Map<string,Phaser.GameObjects.Image>()
  private sparks!: Phaser.GameObjects.Graphics
  private harvestEffects = new Map<number,{age:number; text:Phaser.GameObjects.Text; stationary:boolean}>()
  private lastPaint = ''
  private highlights!: Phaser.GameObjects.Graphics
  private markers!: Phaser.GameObjects.Graphics
  private stall!: Phaser.GameObjects.Image
  private helper!: Phaser.GameObjects.Image
  private greenhouse!: Phaser.GameObjects.Image
  private art!: ReturnType<typeof buildArt>

  create(): void {
    this.art = buildArt(this)
    this.composeIsland()
  }

  private composeIsland(): void {
    const { place } = this.art
    for (const [x, y, scale] of [[-454,105,1.0],[557,99,0.76],[112,763,1.38],[-470,526,0.66],[569,480,1.08]]) {
      place('cloud',{ x,y },-12).setScale(scale)
    }
    place('island_base',{x:0,y:0},-10)
    const paths = new Set(island.paths.map(p => `${p.x},${p.y}`))
    for (let y = 0; y < island.height; y++) {
      for (let x = 0; x < island.width; x++) {
        const kind = paths.has(`${x},${y}`) ? 'path_straight' : 'grass'
        const variant = (x * x + y * 5 + x * y + 1) % 3 + 1
        place(`${kind}_${variant}`,iso(x,y),-8)
      }
    }
    for (let i = 0; i < island.plotHeight * island.plotWidth; i++) {
      const pos = plotPosition(i)
      const obstacle = ['rock','weeds','stump','weeds','rock','stump'][i % 6]
      this.cells.push({
        countdown:'',
        level:this.label(pos.x,pos.y+23,'#f4e9bf','#594937'),
        timer:this.label(pos.x,pos.y-73,'#fffbed','#385748'),
        bed: place('bed_1',pos,-6),
        obstacle: place(`obstacle_${obstacle}`,pos,pos.y + i / 1000),
        plant: place('stage_seed',pos,pos.y + i / 1000 + 0.1),
      })
    }
    for (const structure of island.structures) {
      const pos = iso(structure.x + (structure.width - 1) / 2, structure.y + (structure.height - 1) / 2)
      const depth = pos.y + 2 * halfHeight
      if (structure.id === 'greenhouse') this.greenhouse = place('greenhouse_ruined',pos,depth)
      if (structure.id === 'stall') {
        this.stall = place('stall_basic',pos,depth)
        this.helper = place('helper_leaf_1',{x:pos.x+76,y:pos.y+24},900).setVisible(false)
      }
      if (structure.id === 'pond') place('pond',pos,-5)
    }
    const bridge = iso(island.bridge.x,island.bridge.y)
    place('bridge_broken',bridge, bridge.y + 30)
    for (const [x,y,scale] of [[0.27,0.22,0.94],[2.1,0.13,0.70],[8.62,0.57,0.97],
      [9.2,2.2,0.86],[0.41,6.53,0.80],[8.92,6.98,0.95],[7.32,7.10,0.64]]) {
      const pos = iso(x,y)
      place('garden_tree',pos,pos.y + 0.45).setScale(scale)
    }
    for (const [x,y] of [[1,0],[4,0],[7,0],[8,1],[8,2],[9,3],[8,6],[9,7],
      [5,7],[1,6],[0,7],[1,1],[7,7]]) {
      const pos = iso(x,y)
      place(`wildflowers_${(x+y)%2+1}`,pos,pos.y - 1)
    }
    for (const slot of island.decorSlots) {
      const pos = iso(slot.x,slot.y)
      this.decorations.set(slot.id,place('decor_bench',pos,pos.y + 3).setVisible(false))
    }
    this.sparks = this.add.graphics().setDepth(901)
    this.highlights = this.add.graphics().setDepth(-4)
    this.markers = this.add.graphics().setDepth(900)
  }

  private label(x:number,y:number,color:string,backgroundColor:string) {
    return this.add.text(x,y,'',{fontFamily:'Arial',fontSize:'13px',fontStyle:'bold',color,
      backgroundColor,padding:{x:3,y:1}}).setOrigin(.5).setResolution(2).setDepth(910)
  }

  celebrate() {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      this.tweens.add({targets:this.greenhouse,alpha:.35,yoyo:true,repeat:2,duration:400})
  }

  flyToPlot(index:number): void {
    const pos = plotPosition(index)
    const x = pos.x + 24, y = pos.y - 16
    this.tweens.killTweensOf(this.helper)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.helper.setPosition(x,y)
    else this.tweens.add({ targets:this.helper, x, y, duration:360, ease:'Sine.easeOut' })
  }

  collectEffect(index:number, message:string) {
    const point = plotPosition(index)
    this.harvestEffects.get(index)?.text.destroy()
    const text = this.label(point.x,point.y-84,'#fff4c8','#385748').setDepth(920)
    text.setText(message).setScale(1/this.cameras.main.zoom)
    this.harvestEffects.set(index,{age:0,text,stationary:window.matchMedia('(prefers-reduced-motion: reduce)').matches})
  }

  update(_time:number, dt:number) {
    const scale=1/this.cameras.main.zoom
    this.cells.forEach((cell,i)=>{
      cell.level.setScale(scale*.74)
      cell.timer.setScale(scale*(scale>1.8 ? .86 : 1))
      const text=scale>2.7 && i!==this.selectedPlot ? '•' : cell.countdown
      if (cell.timer.text!==text) cell.timer.setText(text)
    })
    if (!this.harvestEffects.size) return
    this.sparks.clear()
    for (const [index, effect] of this.harvestEffects) {
      const point = plotPosition(index)
      effect.age += dt
      if (effect.age >= 900) {
        effect.text.destroy()
        this.harvestEffects.delete(index)
        continue
      }
      effect.text.setScale(scale)
      if (effect.stationary) continue
      effect.text.setY(point.y-84-Math.min(effect.age/650,1)*21*scale)
      effect.text.setAlpha(Math.min(1,(900-effect.age)/260))
      const phase = effect.age / 460
      if (phase >= 1) continue
      this.sparks.fillStyle(0xffe3a1, 1-phase)
      for (let i=0;i<6;i++) {
        const angle = i*Math.PI/3
        this.sparks.fillCircle(point.x + Math.cos(angle)*(12+22*phase),
          point.y - 28 - phase*28 + Math.sin(angle)*15,3-phase)
      }
    }
  }

  paint({ state, sunflower, shovel, selected, moveFrom, mode, decorEditing, decorPreview }: WorldView): void {
    const key = JSON.stringify([state.lang,sunflower,shovel,state.tutorialSkipped,mode,selected,moveFrom,decorEditing,decorPreview,state.sold,state.autoSell,
      state.helperLevel,isRecipeRevealed(state),state.decorations,
      state.plots.map((p,i) => [secondsLeft(state,i),p.open,p.level,p.plant?.species,p.plant && plantTexture(p.plant)])])
    if (key === this.lastPaint) return
    this.lastPaint = key
    this.selectedPlot = selected
    this.art.setTexture(this.stall,state.autoSell ? 'stall_auto' : 'stall_basic')
    if (state.helperLevel) {
      if (!this.helper.visible) this.helper.setPosition(this.stall.x+76,this.stall.y+24)
      this.art.setTexture(this.helper,'helper_leaf_' + state.helperLevel)
    } else if (this.helper.visible) this.tweens.killTweensOf(this.helper)
    this.helper.setVisible(state.helperLevel > 0)
    this.highlights.clear()
    this.markers.clear()
    for (const slot of island.decorSlots) {
      const preview = decorPreview?.slot === slot.id ? decorPreview.type : null
      const item = decorationAt(state,slot.id)
      const image = this.decorations.get(slot.id)!
      const type = preview ?? item?.type
      image.setVisible(!!type).setAlpha(preview ? .67 : 1)
      if (type) this.art.setTexture(image,'decor_' + type)
      if (decorEditing) outline(this.highlights,iso(slot.x,slot.y),0xfce5a8,1,preview ? .45 : .2)
    }
    this.art.setTexture(this.greenhouse,
      isRecipeRevealed(state) ? 'greenhouse_restored' : 'greenhouse_ruined')
    state.plots.forEach((plot,i) => {
      const cell = this.cells[i]
      const pos = plotPosition(i)
      cell.level.setVisible(plot.open).setText(['','I','II','III'][plot.level])
      cell.countdown=secondsLeft(state,i)+(state.lang==='ru'?' с':' s')
      cell.timer.setVisible(!!plot.plant && plot.plant.readySince===null)
      if (shovel && plot.plant || !state.tutorialSkipped && !shovel && mode==='garden' && plot.plant?.readySince!=null &&
        (!state.sold || isRecipeActive(state,i,recipes.find(r=>r.result==='solar_strawberry')!))) {
        outline(this.highlights,pos,0xffdf85,1,.34)
      }
      cell.bed.setVisible(plot.open)
      cell.obstacle.setVisible(!plot.open)
      cell.plant.setVisible(plot.plant !== null)
      if (plot.open) this.art.setTexture(cell.bed,`bed_${plot.level}`)
      if (plot.plant) this.art.setTexture(cell.plant,plantTexture(plot.plant))

      if (mode === 'plant' && plot.open && !plot.plant) {
        const match=sunflower && adjacent(i).some(j=>state.plots[j].plant?.species==='strawberry')
        outline(this.highlights,pos,match?0xffbf42:0xe6efb6,1,match?.65:.25)
      }
      if (mode === 'build' && state.sold && !plot.open && adjacent(i).some(j => state.plots[j].open)) {
        outline(this.highlights,pos,0xf7d79d,0.9,0.20)
      }
      if (mode === 'build' && moveFrom !== null && plot.open && i !== moveFrom) {
        outline(this.highlights,pos,0xcde2ae,0.81,0.19)
      }
      const neighbor = plot.plant?.species
      if (mode === 'breed' && selected !== null && neighbor && adjacent(selected).includes(i) &&
          recipes.some(r => r.primary === state.plots[selected].plant?.species && r.neighbors.includes(neighbor))) {
        const origin = plotPosition(selected)
        outline(this.highlights,pos,0xdac2e9,0.79,0.22)
        this.highlights.lineStyle(3.2,0xe8d0fa,0.85).lineBetween(origin.x,origin.y,pos.x,pos.y)
      }
      if (i === selected || i === moveFrom) {
        outline(this.highlights,pos,mode === 'breed' ? 0xead4fc : 0xffedac,1,0.25,0.985)
      }
      if (plot.plant?.readySince !== null && plot.plant) {
        this.markers.fillStyle(0xffe8a7,0.95)
        this.markers.fillPoints([
          {x:pos.x + 27,y:pos.y - 54},{x:pos.x + 32,y:pos.y - 47},
          {x:pos.x + 27,y:pos.y - 40},{x:pos.x + 22,y:pos.y - 47},
        ],true)
      }
    })
    const plotsObstructed = mode === 'build' || mode === 'breed'
    this.greenhouse.setAlpha(plotsObstructed ? 0.68 : 1)
  }
}
