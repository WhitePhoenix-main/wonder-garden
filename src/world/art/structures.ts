import type { DecorType } from '../../game/model'
import type { Point } from '../geometry'
import { at, raised, polygon, line, ellipse, gradient, shadow, random, leaf, sun, box, type Canvas } from './drawing'

export function greenhouse(ctx: Canvas, restored: boolean): void {
  shadow(ctx, 11, 16, 119, 50)
  box(ctx, -0.94, -0.93, 1.88, 1.86, 9, '#d1c7a1', '#a99678', '#8d806d')
  const x0 = -0.79, x1 = 0.77, y0 = -0.67, y1 = 0.69
  const wall = 87, ridge = 128
  const surface = (x: number, y: number, h: number): Point => raised(x, y, h)
  const a = surface(x0,y0,wall), b = surface(x1,y0,wall), c = surface(x1,y1,wall), d = surface(x0,y1,wall)
  const r1 = surface(x0,0,ridge), r2 = surface(x1,0,ridge)
  const glass = restored ? ['#8fbdb4', '#527f79', '#d9e6c8'] : ['#9fae9b', '#617973', '#bac4a7']
  const beam = restored ? '#d9cca4' : '#9f8464'
  polygon(ctx, [d,c,surface(x1,y1,9),surface(x0,y1,9)],
    gradient(ctx, -110, 35, glass[0], glass[1]), beam, 4)
  polygon(ctx, [b,r2,c,surface(x1,y1,9),surface(x1,y0,9)],
    gradient(ctx, -100, 52, glass[0], '#496b66'), beam, 4)
  polygon(ctx, [a,b,r2,r1], gradient(ctx, -162, -73, glass[2], glass[0]), beam, 3)
  polygon(ctx, [r1,r2,c,d], gradient(ctx, -140, -42, glass[2], glass[1]), beam, 3)
  for (const x of [-0.48,-0.17,0.15,0.47]) {
    line(ctx, [surface(x,y0,wall), surface(x,0,ridge), surface(x,y1,wall),
      surface(x,y1,9)], beam, 3)
  }
  for (const y of [-0.38,0,0.35]) {
    line(ctx, [surface(x1,y,ridge - Math.abs(y) / y1 * (ridge-wall)), surface(x1,y,9)], beam, 2.7)
  }
  line(ctx, [surface(x0,y1,46),surface(x1,y1,46),surface(x1,y0,46)], beam, 3)
  const door = [surface(-0.15,y1,9),surface(0.19,y1,9),surface(0.19,y1,62),surface(-0.15,y1,62)]
  polygon(ctx, door, '#698476', '#b99e77', 4)
  ellipse(ctx, door[1].x - 6, door[1].y - 26, 2.6, 2.9, '#edc46c')
  if (!restored) {
    polygon(ctx, [surface(x1,-0.32,63),surface(x1,-0.04,55),surface(x1,-0.12,24),
      surface(x1,-0.31,31)], '#4f6b61', '#73867a', 1)
  }
  for (const [x,y] of [[-45,-6],[46,43]]) {
    for (let i = 0; i < 6; i++) {
      const p = at(x - i * 1.2, y - i * 5)
      leaf(ctx, p, at(p.x + (i % 2 ? 12 : -13), p.y - 7), 4)
    }
  }
}

export function decoration(ctx:Canvas, type:DecorType):void {
  shadow(ctx,0,1,47,22,0.25)
  if (type === 'bench') {
    for (const x of [-.34,.32]) {
      line(ctx,[raised(x,.09,0),raised(x,.09,17)],'#594c3d',5)
      line(ctx,[raised(x,-.16,0),raised(x,-.16,39)],'#594c3d',5)
    }
    box(ctx,-.41,-.19,.82,.37,5,'#d9b189','#ad7951','#7e5b43',15)
    for (const h of [28,36]) {
      line(ctx,[raised(-.4,-.17,h),raised(.4,-.17,h)],'#986447',7)
      line(ctx,[raised(-.4,-.17,h+2),raised(.4,-.17,h+2)],'#e0b38c',2)
    }
  } else if (type === 'lantern') {
    box(ctx,-.15,-.15,.30,.30,7,'#bab6a0','#827f70','#676c64')
    line(ctx,[at(0,-7),at(0,-46)],'#6d6756',6)
    const roof = at(0,-78)
    polygon(ctx,[at(0,-50),at(-14,-56),at(-13,-67),at(0,-62)],'#f6cf81','#77644d',2)
    polygon(ctx,[at(0,-50),at(14,-56),at(13,-67),at(0,-62)],'#eab769','#77644d',2)
    polygon(ctx,[at(-16,-66),roof,at(16,-67),at(0,-60)],'#65796f','#4b645d',1.5)
  } else if (type === 'flower_arch') {
    const arch = [at(-36,-11),at(-36,-59),at(-28,-84),at(-12,-96),at(11,-95),at(27,-80),at(35,-58),at(35,11)]
    line(ctx,arch,'#8a634f',9)
    line(ctx,arch,'#72985f',5)
    arch.slice(1,-1).forEach((p,i)=>{
      leaf(ctx,p,at(p.x+(i%2?12:-12),p.y-7),7)
      for (let j=0;j<5;j++) ellipse(ctx,p.x+Math.cos(j*1.26)*4,p.y+Math.sin(j*1.26)*4,4,3,'#edb6c5')
      ellipse(ctx,p.x,p.y,2.6,2.6,'#ffdfa0')
    })
  } else {
    line(ctx,[at(0,-1),at(-3,-42),at(9,-80)],'#795649',9)
    line(ctx,[at(-2,-32),at(-25,-58)],'#936c59',5)
    for (const [x,y,rx,ry] of [[-22,-57,23,17],[21,-63,23,20],[2,-83,29,21],[-20,-82,19,15],[16,-95,23,18]]) {
      ellipse(ctx,x,y,rx,ry,gradient(ctx,y-ry,y+ry,'#f5c5d1','#cd819d'))
      ellipse(ctx,x-4,y-4,rx*.54,ry*.48,'#f6d5dd',-.3)
    }
    const rand = random(24)
    for(let i=0;i<16;i++) ellipse(ctx,(rand()-.5)*64,-54-rand()*50,2.6,1.6,'#f8e4da',rand())
  }
}

export function leafHelper(ctx: Canvas, level: number): void {
  shadow(ctx,2,3,15,5,0.18)
  ellipse(ctx,-7,-7,5,3,'#bb9471')
  ellipse(ctx,7,-7,5,3,'#bb9471')
  ellipse(ctx,0,-22,14,17,gradient(ctx,-41,-7,'#fff3ce','#d9b88d'))
  ellipse(ctx,-5,-25,1.7,2.2,'#5b5046')
  ellipse(ctx,5,-25,1.7,2.2,'#5b5046')
  line(ctx,[at(-2,-21),at(0,-20),at(2,-21)],'#967451',1)
  leaf(ctx,at(-12,-32),at(14,-40),9,sun)
  leaf(ctx,at(-2,-35),at(-12,-50),7)
  if (level >= 2) {
    for (let i=0;i<5;i++) ellipse(ctx,8+Math.cos(i*1.257)*4,-41+Math.sin(i*1.257)*4,3,3,'#f3d7a6')
    ellipse(ctx,8,-41,2.5,2.5,'#d89f50')
  }
  if (level === 3) {
    line(ctx,[at(-9,-47),at(-2,-36),at(9,-39)],'#f7d263',2)
    for (const [x,y] of [[-19,-38],[21,-46],[-23,-15]]) polygon(ctx,
      [at(x,y-4),at(x+2,y),at(x,y+4),at(x-2,y)],'#ffe9a2')
  }
  const radius = 6 + level
  line(ctx,[at(6,-14),at(8,-22),at(15,-23),at(19,-15)],'#987648',2.4)
  ellipse(ctx,13,-12,radius,6,'#b88d55')
  ellipse(ctx,13,-15,radius,2.5,'#e2bd80')
}

export function stall(ctx: Canvas, automatic = false): void {
  shadow(ctx, 10, 12, 106, 44)
  box(ctx, -0.87, -0.76, 1.73, 1.52, 8, '#d2b68d', '#9d7d58', '#8d6f54')
  box(ctx, -0.75, -0.26, 1.5, 0.94, 35, '#d7a879', '#986548', '#775742', 8)
  for (const x of [-0.68,-0.37,-0.07,0.22,0.53]) {
    line(ctx, [raised(x,0.68,10),raised(x,0.68,39)], '#c28e60', 2)
  }
  for (const [x,y] of [[-0.73,-0.55],[0.73,-0.55],[-0.73,0.64],[0.73,0.64]]) {
    line(ctx, [raised(x,y,40),raised(x,y,102)], '#916443', 7)
    line(ctx, [raised(x,y,43),raised(x,y,100)], '#deb487', 2)
  }
  for (const x of [-0.46, 0.03, 0.49]) {
    const p = raised(x, 0.38, 45)
    ellipse(ctx, p.x, p.y, 12, 7, '#b38458')
    ellipse(ctx, p.x, p.y+3, 10, 5, '#866642')
    for (let i = 0; i < 4; i++) ellipse(ctx, p.x - 7 + i * 4.5, p.y-1+(i%2)*2, 3.1, 3.2,
      x > 0.2 ? '#e2b75e' : '#c97678')
  }
  const stripeWidth = 1.82 / 8
  for (let i = 0; i < 8; i++) {
    const x = -0.91 + i * stripeWidth
    const nx = x + stripeWidth
    const back = i % 2 ? '#e9d2a3' : automatic ? '#679283' : '#b98566'
    const front = i % 2 ? '#f5e3bc' : automatic ? '#83ad91' : '#d69276'
    polygon(ctx, [raised(x,-0.75,103),raised(nx,-0.75,103),raised(nx,0,127),raised(x,0,127)], back)
    polygon(ctx, [raised(x,0,127),raised(nx,0,127),raised(nx,0.88,93),raised(x,0.88,93)], front)
    polygon(ctx, [raised(x,0.88,94),raised(nx,0.88,94),raised(nx,0.88,83),
      raised(x+stripeWidth/2,0.88,80),raised(x,0.88,84)], i % 2 ? '#debd91' : '#b77b64')
  }
}
