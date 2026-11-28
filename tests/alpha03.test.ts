import { expect,it } from 'vitest'
import fixture from './fixtures/alpha02.json'
import { advance,initialState,speciesInfo } from '../src/game'
import { common,compatible,inherit,quantity,rules } from '../src/game/genetics'
import { positives,negatives,type GameState,type Profile } from '../src/game/model'
import { parseSave } from '../src/persistence/migration'
import { experiments } from '../src/game/queries'
import { commit,reject } from './helpers'

function sequence(...values:number[]){return ()=>values.shift()??0.999}
const rare:Profile={...common,rarity:'rare',plus:'early'}
const uncommon:Profile={...common,rarity:'uncommon',plus:'hardy'}

it.each([[common,common,65,90],[common,uncommon,55,85],[common,rare,45,80],[uncommon,uncommon,45,80],
  [uncommon,rare,35,75],[rare,rare,25,65]] as const)('rolls rarity at both cumulative boundaries %j × %j',(a,b,x,y)=>{
  for(const [roll,expected] of [[x-.01,'common'],[x,'uncommon'],[y-.01,'uncommon'],[y,'rare']] as const)
    expect(inherit(a,b,sequence(roll/100)).rarity).toBe(expected)
})
it('inherits pluses and flaws, including collisions and mutation',()=>{
  for(const [choice,index,expected] of [[.79,0,'hardy'],[.79,.99,'early'],[.8,0,'fruitful']] as const)
    expect(inherit(uncommon,rare,sequence(.99,choice,index)).plus).toBe(expected)
  for(const b of [common,uncommon]){
    expect(inherit(uncommon,b,sequence(.99,.799,0)).plus).toBe('hardy')
    expect(inherit(uncommon,b,sequence(.99,.8,0)).plus).toBe('early')
  }
  for(const [a,b,chance] of [[null,null,.1],['small',null,.35],['small','small',.6],['small','slow',.6]] as const){
    const left={...common,minus:a},right={...common,minus:b}
    expect(inherit(left,right,sequence(0,chance)).minus).toBeNull()
    expect(inherit(left,right,sequence(0,chance-.001,0)).minus).toBe(a??'fragile')
    if(b==='slow')expect(inherit(left,right,sequence(0,.59,.999)).minus).toBe(b)
  }
  for(const [i,minus] of [[0,'fragile'],[1,'slow']] as const)
    expect(inherit(common,common,sequence(.99,i/4,0,i/4))).toMatchObject({plus:positives[i],minus:null})
  expect(positives.flatMap(plus=>negatives.filter(minus=>compatible({...rare,plus,minus})))).toHaveLength(14)
})
it('matches the expected output distributions and income per minute',()=>{
  const mean=(range:number[],delta:number)=>Array.from({length:6000},(_,i)=>quantity(range,delta,(i+.5)/6000)).reduce((a,b)=>a+b)/6000
  expect(mean([1,2],-.1)).toBe(1.4)
  for(const [id,bonus,income] of [['strawberry',0,80],['solar_strawberry',0,72],['solar_strawberry',rules.fruitful[1],81.6],['star_orchid',0,97.5]] as const){
    const info=speciesInfo[id]
    expect(mean(info.fruits,bonus)*info.fruitValue*60/info.cycleSec).toBeCloseTo(income)
  }
})
it('retains an oversized crop and copies exactly one seed on the final life',()=>{
  const s=initialState(3),b=s.plots[12],p=b.plant!
  Object.assign(p,{...rare,plus:'seedy',minus:'sparse',lives:1,fruitRoll:.999})
  b.level=2
  s.basket=Array.from({length:14},()=>({species:'radish',valueUnits:30000}))
  advance(s,6)
  reject(s,{type:'harvest',plot:12},'basketFull')
  s.rng=1 // second sample is ~0.369, inside the 40% seedy interval
  const c={type:'harvest',plot:12,seeds:true,expectedId:p.id,cycle:1} as const
  expect(commit(s,c)).toContain('Withered')
  expect(b.plant).toBeNull();expect(b.level).toBe(2)
  expect(s.variants).toEqual([{species:'radish',rarity:'rare',plus:'seedy',minus:'sparse',count:1}])
  expect(s.basket).toHaveLength(14)
  reject(s,c,'notReady')
  const stock=s.variants[0],coins=s.coins
  commit(s,{type:'plant',plot:12,species:'radish',stock})
  expect(s.coins).toBe(coins);expect(s.variants).toEqual([])
  expect(s.plots[12].plant).toMatchObject({...rare,plus:'seedy',minus:'sparse',lives:20})
  expect(parseSave(JSON.stringify(s))).toEqual(s)
})
it('upgrades a snapshot generated and validated by 1465cf9; rejects invalid legacy inventory',()=>{
  const s=parseSave(JSON.stringify(fixture)) as GameState
  expect(s).toMatchObject({schemaVersion:7,coins:fixture.coins,basket:fixture.basket,planted:fixture.planted,
    seeds:{solar_strawberry:1},failures:{solar_strawberry:0,moonberry:1},musicMuted:true,lang:'en'})
  for(const [i,b] of fixture.plots.entries()){
    expect(s.plots[i]).toMatchObject({...b,plant:b.plant ? {id:b.plant.id,species:b.plant.species,progress:b.plant.progress,readySince:b.plant.readySince,mature:b.plant.mature}:null})
    if(b.plant)expect(s.plots[i].plant?.lives).toBe(speciesInfo[s.plots[i].plant!.species].lives)
  }
  expect(s.nursery[0]).toMatchObject({id:fixture.nursery[0].id,species:'blueberry',progress:1,...common,lives:10})
  expect(parseSave(JSON.stringify({...fixture,seeds:{...fixture.seeds,solar_strawberry:2}}))).toBeNull()
  advance(s,12)
  const available=experiments(s,8)
  expect(available.map(e=>e.result).sort()).toEqual(['moonberry','solar_strawberry'])
  const copy=parseSave(JSON.stringify(s)) as GameState
  for(const g of [s,copy])commit(g,{type:'harvest',seeds:true,plot:8,expectedId:g.plots[8].plant!.id,experiment:available[0]})
  expect(s).toEqual(copy)
})

it('revalidates a particular donor when two plants have the same species',()=>{
  const s=parseSave(JSON.stringify(fixture)) as GameState
  commit(s,{type:'harvest',plot:9,seeds:true})
  commit(s,{type:'plant',species:'sunflower',plot:12,stock:common,replaceId:s.plots[12].plant!.id})
  advance(s,12)
  const options=experiments(s,8).filter(e=>e.result==='solar_strawberry')
  expect(options).toHaveLength(2)
  const choice={type:'harvest',seeds:true,plot:8,expectedId:s.plots[8].plant!.id,experiment:options[1]} as const
  commit(s,{type:'move',from:9,to:12})
  reject(s,choice,'stalePlant')
  const current=experiments(s,8).find(e=>e.donorId===choice.experiment.donorId)!
  commit(s,{...choice,experiment:current})
  expect(s.seeds.strawberry).toBeGreaterThan(0)
  expect(s.failures.moonberry).toBe(1)
})

it('preserves profiles and partial growth in nursery, replacement and next draw',()=>{
  const s=parseSave(JSON.stringify(fixture)) as GameState
  const base=s.plots[8].plant!
  s.variants.push({species:'strawberry',count:2,rarity:'rare',plus:'early',minus:'small'})
  const pack=s.variants[0]
  const old=structuredClone(base),coins=s.coins
  commit(s,{type:'plant',plot:8,species:'strawberry',replaceId:base.id,stock:pack})
  expect(s.nursery.at(-1)).toEqual(old)
  expect(s.coins).toBe(coins);expect(pack.count).toBe(1)
  const duration=12*.9/1.2/1.4
  advance(s,duration/2);expect(s.plots[8].plant!.progress).toBeCloseTo(.5)
  const copy=parseSave(JSON.stringify(s)) as GameState
  expect(copy).toEqual(s)
  for(const g of [s,copy]){
    advance(g,duration/2)
    commit(g,{type:'harvest',plot:8})
    expect(g.basket.at(-1)!.valueUnits).toBe(72000)
  }
  expect(copy).toEqual(s)
})

it('retains the roll on the bed if another harvest advances the generator',()=>{
  const s=initialState(7),p=s.plots[12].plant!
  p.fruitRoll=.999;advance(s,6)
  s.basket=Array.from({length:14},()=>({species:'radish',valueUnits:30000}))
  reject(s,{type:'harvest',plot:12},'basketFull')
  commit(s,{type:'harvest',plot:13,seeds:true})
  const copy=parseSave(JSON.stringify(s)) as GameState
  commit(copy,{type:'sell'});commit(copy,{type:'harvest',plot:12})
  expect(copy.basket).toHaveLength(2)
  advance(copy,6);copy.plots[12].plant!.fruitRoll=0
  commit(copy,{type:'harvest',plot:12})
  expect(copy.basket).toHaveLength(3)
})

it('rebreeds a lost hybrid and never repeats the introductory guarantee',()=>{
  const s=parseSave(JSON.stringify(fixture)) as GameState
  commit(s,{type:'plant',species:'solar_strawberry',plot:12,replaceId:s.plots[12].plant!.id})
  s.plots[12].plant!.lives=1
  advance(s,40);commit(s,{type:'harvest',plot:12})
  expect(s.planted).toContain('solar_strawberry')
  expect(parseSave(JSON.stringify(s))).toEqual(s)
  const e=experiments(s,8).find(v=>v.result==='solar_strawberry')!
  s.rng=1
  const c={type:'harvest',seeds:true,plot:8,expectedId:s.plots[8].plant!.id,experiment:e} as const
  expect(commit(s,c)).toContain('ExperimentFailed')
  s.failures.solar_strawberry=4
  advance(s,12);expect(commit(s,c)).toContain('SeedPropagated:solar_strawberry')
})

it('rejects a replay after regrowth and after a replacement takes the same bed',()=>{
  const s=initialState(12)
  advance(s,6)
  const p=s.plots[12].plant!
  const command={type:'harvest',seeds:true,plot:12,expectedId:p.id,cycle:p.lives} as const
  commit(s,command);advance(s,6)
  reject(s,command,'stalePlant')
  commit(s,{type:'move',from:13,to:12})
  reject(s,command,'stalePlant')
})

it('uses the strongest single copy chance from the parent and honey clover',()=>{
  const s=parseSave(JSON.stringify(fixture)) as GameState
  commit(s,{type:'plant',species:'solar_strawberry',plot:12,replaceId:s.plots[12].plant!.id})
  const parent=s.plots[12].plant!
  Object.assign(parent,{rarity:'uncommon',plus:'seedy',minus:'sparse'})
  const noAura=structuredClone(s)
  s.revealed.push('honey_clover')
  s.planted.push('clover')
  s.seeds.honey_clover=1
  commit(s,{type:'plant',plot:13,species:'honey_clover',replaceId:s.plots[13].plant!.id})
  for(const g of [noAura,s]){
    advance(g,20)
    g.rng=1
    commit(g,{type:'harvest',plot:12,seeds:true})
    expect(parseSave(JSON.stringify(g))).toEqual(g)
  }
  expect(s.variants[0]).toMatchObject({species:'solar_strawberry',rarity:'uncommon',plus:'seedy',minus:'sparse',count:1})
  expect(noAura.variants).toEqual([])
})
