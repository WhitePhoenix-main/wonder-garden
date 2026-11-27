import type { Species } from '../../game/model'
import { at, polygon, line, ellipse, gradient, shadow, leaf, sun, green, type Canvas, type Leaves } from './drawing'

export function plant(ctx: Canvas, species: Species | 'seed' | 'sprout', ripe: boolean): void {
  if (species === 'seed') {
    ellipse(ctx, 0, -8, 10, 4, '#593d33')
    ellipse(ctx, -1, -10, 5, 3, '#cbab70', -0.32)
    return
  }
  shadow(ctx, 1, -4, species === 'sprout' ? 22 : 33, 14)
  if (species === 'sprout') {
    line(ctx, [at(0, -7), at(-1, -20), at(1, -27)], '#668d52', 3)
    leaf(ctx, at(0,-20), at(-17,-31), 6)
    leaf(ctx, at(0,-25), at(18,-38), 7)
    return
  }
  if (species === 'sunflower') {
    const head = at(9,-71)
    line(ctx, [at(0,-7), at(-6,-36), head], '#507748', 5)
    line(ctx, [at(1,-8), at(-4,-36), at(11,-69)], '#a3bf70', 1.6)
    leaf(ctx, at(-2,-26), at(-25,-42), 12, sun)
    leaf(ctx, at(-3,-40), at(26,-49), 9, sun)
    for (let i = 0; i < 12; i++) {
      const t = i * Math.PI / 6
      const end = at(head.x + Math.cos(t) * 27, head.y + Math.sin(t) * 24)
      leaf(ctx, head, end, 8, ripe ? ['#fce69d', '#e3ad4b', '#bf8f43']
        : ['#e8c878', '#ca9852', '#ab7f46'])
    }
    ellipse(ctx, head.x, head.y, 12, 11, gradient(ctx, -81, -60, '#91613d', '#644a38'))
    for (let i = 0; i < 13; i++) {
      const t = i * 2.4
      const offset = 2.3 * Math.sqrt(i)
      ellipse(ctx, head.x + Math.cos(t) * offset, head.y + Math.sin(t) * offset, 1, 0.9, '#d9aa65')
    }
    return
  }

  if (species === 'clover' || species === 'honey_clover') {
    for (const [x,y] of [[-16,-24],[10,-40],[21,-18]]) {
      line(ctx,[at(0,-5),at(x,y)],'#588253',3)
      for (let i=0; i<3; i++) {
        const a = i*2*Math.PI/3
        ellipse(ctx,x+7*Math.cos(a),y+7*Math.sin(a),9,6,
          species === 'clover' ? '#79af70' : '#adbf68',a)
      }
      if (ripe) ellipse(ctx,x,y,5,5,species === 'clover' ? '#eee8cf' : '#eeb957')
    }
    return
  }
  if (species === 'blueberry' || species === 'moonberry') {
    for (const [x,y] of [[-22,-32],[-4,-53],[18,-42],[24,-19]]) {
      line(ctx,[at(0,-5),at(x,y)],'#577764',3)
      leaf(ctx,at(x,y),at(x-12,y-11),7)
      leaf(ctx,at(x,y),at(x+10,y-9),5)
      if (ripe) {
        ellipse(ctx,x,y+5,8,8,species === 'blueberry' ? '#54679c' : '#a890c9')
        ellipse(ctx,x-2,y+2,2,2,'#d6d6e8')
      }
    }
    return
  }
  if (species === 'moonflower' || species === 'golden_flower' || species === 'crystal_flower' || species === 'star_orchid') {
    const colors = {
      moonflower:['#e9e7ff','#aa9ccd'], golden_flower:['#ffe4a1','#dca74e'],
      crystal_flower:['#a6eee2','#5aaeb5'], star_orchid:['#f0c9ea','#a872ad']
    }[species]
    const heads = species === 'star_orchid' ? [[-13,-49],[9,-73]] : [[3,-55]]
    for (const [x,y] of heads) {
      line(ctx,[at(0,-7),at(-4,-29),at(x,y)],'#578369',4)
      leaf(ctx,at(-3,-21),at(-26,-37),7)
      leaf(ctx,at(-3,-31),at(20,-43),7)
      if (!ripe) { ellipse(ctx,x,y,7,12,colors[1]); continue }
      const petals = species === 'golden_flower' ? 9 : 5
      for (let i=0; i<petals; i++) {
        const a = -Math.PI/2 + i*2*Math.PI/petals
        const tip = at(x+22*Math.cos(a),y+21*Math.sin(a))
        if (species === 'crystal_flower' || species === 'star_orchid') {
          polygon(ctx,[at(x,y),at(x+10*Math.cos(a-.48),y+10*Math.sin(a-.48)),tip,
            at(x+11*Math.cos(a+.46),y+11*Math.sin(a+.46))],colors[i%2],colors[1],1)
        } else ellipse(ctx,x+10*Math.cos(a),y+10*Math.sin(a),12,6,colors[i%2],a)
      }
      ellipse(ctx,x,y,5,5,'#ffdfa0')
    }
    return
  }

  const solar = species === 'solar_strawberry'
  const radish = species === 'radish'
  const foliage: Leaves = solar ? ['#e6d882', '#91a657', '#56764a'] : green
  const tips = radish ? [[-31,-36], [-22,-52], [0,-56], [22,-47], [32,-31], [4,-35]]
    : [[-34,-29], [-27,-46], [-6,-56], [13,-51], [34,-35], [21,-24], [-9,-31]]
  if (radish && ripe) {
    const berry = gradient(ctx, -26, 8, '#efb0b3', '#ad4b67')
    ctx.beginPath()
    ctx.moveTo(-12, -19)
    ctx.bezierCurveTo(-23, -2, -6, 5, 0, 9)
    ctx.bezierCurveTo(7, 2, 22, -3, 10, -20)
    ctx.closePath()
    ctx.fillStyle = berry
    ctx.fill()
    ellipse(ctx, -7, -12, 4, 2.5, '#f7c7c4', -0.3)
    line(ctx, [at(0, 6), at(-2, 11), at(-6, 12)], '#edb8b0', 1.5)
  }
  for (const [x,y] of tips) leaf(ctx, at(0, -10), at(x, y), radish ? 9 : 11, foliage)
  if (!radish && ripe) {
    for (const [x, y, size] of [[-19,-18,0.87], [11,-12,1], [24,-22,0.7]]) {
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(size, size)
      ctx.beginPath()
      ctx.moveTo(0, 12)
      ctx.bezierCurveTo(-5, 11, -15, 0, -12, -8)
      ctx.bezierCurveTo(-9, -15, 10, -14, 12, -7)
      ctx.bezierCurveTo(15, 1, 4, 11, 0, 12)
      ctx.fillStyle = solar ? gradient(ctx, -15, 12, '#fbe499', '#d99042')
        : gradient(ctx, -15, 12, '#e89b9d', '#b64f65')
      ctx.fill()
      for (const [sx,sy] of [[-5,-4], [4,-6], [0,4], [7,0]]) ellipse(ctx, sx, sy, 1.1, 1.5, '#fae3ab')
      leaf(ctx, at(0,-10), at(-9,-14), 3, foliage)
      leaf(ctx, at(0,-10), at(9,-15), 3, foliage)
      ctx.restore()
    }
  }
}
