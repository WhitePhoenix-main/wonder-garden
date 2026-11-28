import { island } from '../../game/config'
import { halfHeight, halfWidth, iso, type Point } from '../geometry'
import { at, raised, polygon, line, ellipse, gradient, shadow, random, diamond, leaf, box, type Canvas } from './drawing'

export function paintBase(ctx: Canvas): void {
  const rand = random(65)
  const left = -0.5
  const frontX = island.width - 0.5
  const frontY = island.height - 0.5
  const ledge = [
    ...Array.from({ length: island.width + 1 }, (_, x) => iso(x - 0.5, frontY)),
    ...Array.from({ length: island.height }, (_, y) => iso(frontX, frontY - y - 1)),
  ]
  const tip = at(53, iso(frontX, frontY).y + 169)
  const lower = ledge.map((point, i) => {
    const x = point.x * 0.82 + tip.x * 0.18 + (rand() - 0.5) * 26
    const insetDrop = Math.abs(point.x - x) * halfHeight / halfWidth
    return at(x, point.y + insetDrop + 46 + 54 * Math.sin(i / (ledge.length - 1) * Math.PI) + rand() * 30)
  })
  const lip = ledge.map(point => at(point.x, point.y + 9))
  polygon(ctx, [iso(left, left), iso(frontX, left), ...ledge.slice().reverse()],
    '#769959')
  polygon(ctx, [...ledge, ...lower.slice().reverse()], '#786354')
  polygon(ctx, [...lower, tip], '#504b49')
  for (let i = 0; i < ledge.length - 1; i++) {
    const a = lip[i]
    const b = lip[i + 1]
    const c = lower[i + 1]
    const d = lower[i]
    const crease = at((a.x + b.x + c.x + d.x) / 4 + (rand() - 0.5) * 26,
      (a.y + b.y + c.y + d.y) / 4)
    const bright = i < island.width
    const shades = bright ? ['#b08b69', '#907565', '#ac9178', '#795e53']
      : ['#8d7463', '#6b5b56', '#997963', '#675650']
    polygon(ctx, [a, b, crease], shades[0])
    polygon(ctx, [b, c, crease], shades[1])
    polygon(ctx, [a, crease, d], shades[2])
    polygon(ctx, [d, crease, c], shades[3])
    const bottom = at((tip.x * 2 + c.x + d.x) / 4,
      (tip.y * 2 + c.y + d.y) / 4 + 9 + rand() * 20)
    polygon(ctx, [d, c, bottom], i % 2 === 0 ? '#655855' : '#72605a')
    polygon(ctx, [d, bottom, tip], i % 2 === 0 ? '#554e4d' : '#5c514c')
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    polygon(ctx, [a, b, at(midX + 17, midY + 11), at(midX - 5, midY + 18),
      at(a.x + 3, a.y + 6)], bright ? '#8eaa65' : '#739052')
    line(ctx, [at(a.x + 4, a.y + 25), at(midX, midY + 28), at(b.x - 6, b.y + 23)],
      bright ? '#bd9c7c' : '#a1856f', 2)
    for (let n = 0; n < 4; n++) {
      const x = midX + (rand() - 0.5) * 36
      const y = midY + 12 + rand() * 9
      ellipse(ctx, x, y, 5 + rand() * 5, 2, n % 2 === 0 ? '#839c5c' : '#a3ad69')
    }
  }
}

export function paintGrass(ctx: Canvas, variant: number, valley = false): void {
  const rand = random(55 + variant * 715)
  const colors = valley ? [
    ['#bdce8a','#9cb47c'],
    ['#c5ce92','#a4b683'],
    ['#b9cb8f','#98b482'],
  ] : [
    ['#a6c777', '#8bb66b'],
    ['#a4c87d', '#91b970'],
    ['#aec981', '#94b775'],
  ]
  polygon(ctx, diamond(halfWidth + 0.5, halfHeight + 0.5),
    gradient(ctx, -halfHeight, halfHeight, colors[variant][0], colors[variant][1]))
  for (let i = 0; i < 17; i++) {
    const point = iso((rand() - 0.5) * 0.86, (rand() - 0.5) * 0.86)
    const tone = i % 2 ? '#a8c585' : '#779e62'
    ellipse(ctx, point.x, point.y, 1 + rand() * 3, 0.6 + rand(), valley && i % 4 === 0 ? '#e7c8d1' : tone)
  }
}

export function paintPath(ctx: Canvas, variant: number): void {
  const rand = random(271 + variant * 31)
  polygon(ctx, diamond(halfWidth + 0.5, halfHeight + 0.5),
    gradient(ctx, -30, 30, '#dec6a0', '#c5a77c'))
  for (let i = 0; i < 14; i++) {
    const point = iso((rand() - 0.5) * 0.85, (rand() - 0.5) * 0.85)
    ellipse(ctx, point.x, point.y + 1, 2 + rand() * 6, 1.4 + rand() * 1.7, '#b79b72')
    ellipse(ctx, point.x - 1, point.y - 1, 3 + rand() * 4, 1.3 + rand() * 1.6,
      i % 3 ? '#e9d0a6' : '#eddcbb')
  }
}

export function paintBed(ctx: Canvas, level: number): void {
  shadow(ctx, 0, 13, 64, 27, 0.34)
  const a = iso(-0.43, -0.43)
  const b = iso(0.43, -0.43)
  const c = iso(0.43, 0.43)
  const d = iso(-0.43, 0.43)
  const top = (point: Point): Point => at(point.x, point.y - 8)
  polygon(ctx, [d, c, top(c), top(d)], level === 1 ? '#8c5b3c' : '#78716b', '#684e3e', 1.3)
  polygon(ctx, [c, b, top(b), top(c)], level === 1 ? '#704733' : '#666062', '#634a3e', 1.3)
  polygon(ctx, [a, b, c, d].map(top),
    gradient(ctx, -35, 20, level === 1 ? '#d3a378' : '#d8d4b9', level === 1 ? '#a97650' : '#98978c'),
    level === 1 ? '#e1b68c' : '#e8e2ca', 1.3)
  polygon(ctx, diamond(46, 22, -8), gradient(ctx, -29, 14, '#705043', '#86604a'), '#694a3b', 1.8)
  const r = random(413)
  for (let i = 0; i < 18; i++) {
    const p = raised((r() - 0.5) * 0.62, (r() - 0.5) * 0.62, 8)
    ellipse(ctx, p.x, p.y, 1.3 + r() * 2.3, 0.6 + r(), i % 2 ? '#967359' : '#634b3f')
  }
  for (const y of [-0.19, -0.02, 0.15]) {
    line(ctx, [raised(-0.28, y, 7), raised(0.26, y, 7)], '#966c51', 1.1)
  }
  if (level >= 3) {
    const trim = ['#d6aa4e','#72b5aa','#f2cb74'][level - 3]
    const gem = ['#a6e1cf','#cbbfea','#ffedb5'][level - 3]
    line(ctx, [...diamond(51, 24, -8), at(0,-32)], trim, level === 5 ? 4 : 3)
    for (const p of [d,c,b]) {
      polygon(ctx, diamond(level >= 4 ? 5 : 3, level >= 4 ? 7 : 5)
        .map(q => at(p.x+q.x,p.y-6+q.y)), gem)
    }
    if (level >= 4) {
      for (const p of [raised(.19,.43,3),raised(.43,.19,3)]) {
        polygon(ctx, diamond(3,4).map(q => at(p.x+q.x,p.y+q.y)), trim)
      }
    }
  }
  if (level >= 2) {
    for (const p of [d, c, b]) ellipse(ctx, p.x, p.y - 6, 2.6, 2.4, '#f2d492')
  }
}

function rock(ctx: Canvas, x: number, y: number, scale: number): void {
  const points = (...coords: [number, number][]): Point[] => coords.map(p => at(x + p[0] * scale, y + p[1] * scale))
  polygon(ctx, points([-23,-9], [-13,-27], [4,-34], [22,-22], [26,-9], [11,1], [-8,3]),
    '#888988', '#676f68', 1.2)
  polygon(ctx, points([-23,-9], [-13,-27], [4,-34], [12,-15], [-8,-8]), '#bbbca9')
  polygon(ctx, points([4,-34], [22,-22], [26,-9], [12,-15]), '#a0a29a')
  polygon(ctx, points([12,-15], [26,-9], [11,1], [4,-1]), '#737b78')
  line(ctx, points([-19,-10], [-10,-8], [-3,-8]), '#86a365', 2)
}

export function flowers(ctx: Canvas, seed: number, width: number): void {
  const rand = random(seed)
  for (let i = 0; i < 7; i++) {
    const x = (rand() - 0.5) * width
    const y = (rand() - 0.5) * 14 - 3
    const h = 5 + rand() * 9
    line(ctx, [at(x + 1, y + h), at(x, y)], '#638d53', 1.7)
    const bright = i % 4 === 0 ? '#e4a8a4' : '#f3e8b9'
    for (let n = 0; n < 5; n++) {
      ellipse(ctx, x + Math.cos(n * 1.256) * 2.7, y + Math.sin(n * 1.256) * 2.2, 2.5, 2.1, bright)
    }
    ellipse(ctx, x, y, 1.8, 1.5, '#c59853')
  }
}

export function obstacle(ctx: Canvas, name: string): void {
  shadow(ctx, 0, 0, 47, 20)
  if (name === 'rock') {
    rock(ctx, -4, 1, 0.97)
    rock(ctx, 22, 8, 0.43)
    rock(ctx, -28, 11, 0.33)
    return
  }
  if (name === 'stump') {
    polygon(ctx, [at(-23, 7), at(-19, -17), at(16, -17), at(19, 6), at(27, 11),
      at(8, 14), at(-9, 13), at(-26, 12)], gradient(ctx, -18, 14, '#a77c55', '#704f3e'), '#664c38')
    for (const x of [-13, -5, 6, 13]) line(ctx, [at(x, -16), at(x - 2, 5)], '#c09065', 1.5)
    ellipse(ctx, 0, -18, 19, 9, '#d5b084')
    ellipse(ctx, 1, -18, 12, 5.5, '#ba8c64')
    ellipse(ctx, 1, -18, 7, 3, '#d7ab7b')
    ellipse(ctx, 2, -18, 2.2, 1.4, '#b87f56')
    leaf(ctx, at(17, 10), at(32, 1), 4)
    return
  }
  for (let x = -28; x <= 28; x += 14) {
    leaf(ctx, at(x * 0.66, 7), at(x - 9, -13 - (x % 3) * 3), 5)
    leaf(ctx, at(x * 0.66, 7), at(x + 8, -19 + (x % 5) * 2), 4)
  }
  flowers(ctx, 60, 45)
}

export function tree(ctx: Canvas): void {
  shadow(ctx, 9, 8, 53, 18, 0.28)
  line(ctx, [at(0, 5), at(-2, -32), at(8, -66)], '#7f5e48', 10)
  line(ctx, [at(-2, -32), at(-21, -50)], '#8c6a52', 4)
  const tufts = [[11,-43,26,22], [-19,-45,27,24], [1,-64,31,29], [23,-65,19,20], [-13,-78,21,20]]
  for (const [x,y,rx,ry] of tufts) {
    ellipse(ctx, x, y, rx, ry, gradient(ctx, y - ry, y + ry, '#95ba69', '#4c7650'))
    ellipse(ctx, x - rx * 0.25, y - ry * 0.36, rx * 0.52, ry * 0.37, '#a3c774', -0.23)
  }
  const rand = random(8092)
  for (let i = 0; i < 20; i++) {
    const x = (rand() - 0.5) * 49
    const y = -48 - rand() * 39
    ellipse(ctx, x, y, 3.5, 1.5, '#b7ce82', -0.5 + rand())
  }
}

export function pond(ctx: Canvas): void {
  shadow(ctx, 1, 9, 118, 60)
  ellipse(ctx, 0, 0, 116, 48, gradient(ctx, -48, 48, '#c1c7a6', '#879479'))
  ellipse(ctx, 0, 0, 109, 43, gradient(ctx, -45, 49, '#8ebdb7', '#548d96'))
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, 0, 107, 41, 0, 0, Math.PI * 2)
  ctx.clip()
  const rand = random(17140)
  for (let i = 0; i < 20; i++) {
    const x = (rand() - 0.5) * 211
    const y = (rand() - 0.5) * 82
    ellipse(ctx, x, y, 5 + rand() * 19, 0.6 + rand() * 1.4, i % 3 ? '#afd0c4' : '#70a7a5')
  }
  for (const [x,y] of [[-38,10], [55,-10], [39,-14]]) {
    ellipse(ctx, x, y, 10, 4.7, '#779757')
    ellipse(ctx, x-2, y-2, 5.5, 2.5, '#a8bc75')
    polygon(ctx, [at(x,y), at(x + 12,y - 1),at(x + 8,y + 2)], '#81b0af')
  }
  ctx.restore()
  for (const [x,y,s] of [[-89,17,0.38], [-69,28,0.24], [77,29,0.52], [98,13,0.32], [45,42,0.41]]) {
    rock(ctx,x,y,s)
  }
}

export function bridge(ctx: Canvas, repaired = false): void {
  const planks = repaired ? 13 : 7
  const end = repaired ? 1.78 : 0.98
  for (let i = 0; i < planks; i++) {
    const y = 0.19 + i * 0.126
    box(ctx, repaired ? -0.32 : -0.32 + i * 0.014, y, repaired ? 0.64 : 0.64 - i * 0.04, 0.11, 4,
      i % 2 ? '#bb9271' : '#ccab85', '#977050', '#7c5d49')
  }
  for (const x of [-0.33,0.30]) {
    line(ctx, [raised(x,0.22,26),raised(x,end / 2 + .1,20),raised(x,end,25)], '#7b6045', 4)
    line(ctx, [raised(x,0.22,0),raised(x,0.22,30)], '#876245', 5)
    line(ctx, [raised(x,end,0),raised(x,end,27)], '#876245', 5)
    if (repaired) {
      line(ctx, [raised(x,.97,0),raised(x,.97,23)], '#876245', 4)
      line(ctx, [raised(x,.22,29),raised(x,end / 2 + .1,23),raised(x,end,28)], '#dbb98d', 1.4)
    }
  }
}

export function cloud(ctx: Canvas): void {
  ctx.globalAlpha = 0.63
  const tint = gradient(ctx, -28, 31, '#fffef1', '#f2f4e7')
  ellipse(ctx, -36, 8, 55, 18, tint)
  ellipse(ctx, 29, 9, 62, 19, tint)
  ellipse(ctx, -15, -4, 52, 23, tint)
  ellipse(ctx, 21, -9, 34, 19, tint)
  ctx.globalAlpha = 1
}
