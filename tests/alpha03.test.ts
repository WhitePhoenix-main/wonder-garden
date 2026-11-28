import { expect,it } from 'vitest'
import fixture from './fixtures/alpha02.json'
import { advance,basketCapacity,saleValue,speciesInfo } from '../src/game'
import { common,compatible,fruitCount,inherit,nextRandom,plantStats,quantity } from '../src/game/genetics'
import { positives,negatives,rarities,saveVersion,type GameState,type Profile } from '../src/game/model'
import { parseSave } from '../src/persistence/migration'
import { experiments } from '../src/game/queries'
import { gardenWithStarterPlants, addLegacyFruit,cleanBed,commit,cross,reject } from './helpers'

function sequence(...values:number[]){return ()=>values.shift()??0.999}
const rare:Profile={...common,rarity:'rare',plus:'early'}
const uncommon:Profile={...common,rarity:'uncommon',plus:'hardy'}

it.each([[common,common,[70,30]],[common,uncommon,[55,45]],[common,rare,[40,47,13]],[uncommon,uncommon,[15,65,20]],
  [uncommon,rare,[10,53,37]],[rare,rare,[0,20,68,12]]] as const)('rolls rarity on both sides of its cumulative boundaries %j × %j',(a,b,weights)=>{
  let before=0
  for (const [rank,weight] of weights.entries()) {
    if (!weight) continue
    expect(inherit(a,b,sequence((before+.01)/100)).rarity).toBe(rarities[rank])
    before+=weight
    expect(inherit(a,b,sequence((before-.01)/100)).rarity).toBe(rarities[rank])
  }
})
it('inherits pluses and flaws, including collisions and mutation',()=>{
  for(const [choice,index,expected] of [[.79,0,'hardy'],[.79,.99,'early'],[.8,0,'fruitful']] as const)
    expect(inherit(uncommon,rare,sequence(.99,choice,index)).plus).toEqual([expected])
  for(const b of [common,uncommon]){
    expect(inherit(uncommon,b,sequence(.99,.799,0)).plus).toEqual(['hardy'])
    expect(inherit(uncommon,b,sequence(.99,.8,0)).plus).toEqual(['early'])
  }
  for(const [a,b,chance] of [[null,null,.1],['small',null,.35],['small','small',.6],['small','slow',.6]] as const){
    const left={...common,minus:a},right={...common,minus:b}
    expect(inherit(left,right,sequence(0,chance)).minus).toBeNull()
    const allowed=negatives.filter(minus=>minus===a || minus===b)
    expect(inherit(left,right,sequence(0,chance-.001,0)).minus).toBe(allowed[0]??'fragile')
    if(b==='slow')expect(inherit(left,right,sequence(0,.59,.999)).minus).toBe(allowed.at(-1))
  }
  for(const [i,minus] of [[0,'fragile'],[1,'slow']] as const) {
    const child=inherit(common,{...common,minus},sequence(.99,i/positives.length,0,0))
    expect(child.plus).toEqual([positives[i]])
    expect(child.minus).not.toBe(minus)
    expect(compatible(child)).toBe(true)
  }
  expect(positives.flatMap(plus=>negatives.filter(minus=>compatible({...rare,plus,minus})))).toHaveLength(32)
})
it('matches the expected output distributions and income per minute',()=>{
  const mean=(range:number[],delta:number)=>Array.from({length:6000},(_,i)=>quantity(range,delta,(i+.5)/6000)).reduce((a,b)=>a+b)/6000
  expect(mean([1,2],-.1)).toBe(1.4)
  for(const [id,profile,income] of [['strawberry',common,60],['solar_strawberry',common,120],
    ['solar_strawberry',{...rare,plus:'fruitful'},138],['star_orchid',common,127.5]] as const){
    const info=speciesInfo[id]
    const stats=plantStats(id,profile)
    const average=Array.from({length:6000},(_,i)=>fruitCount(stats,(i+.5)/6000)).reduce((a,b)=>a+b)/6000
    expect(average*info.fruitValue*60/info.cycleSec).toBeCloseTo(income)
  }
})
it('retains an oversized crop and copies exactly one seed on the final life',()=>{
  const s=gardenWithStarterPlants(3),b=s.plots[12],p=b.plant!
  Object.assign(p,{...rare,plus:'seedy',minus:'sparse',lives:1,fruitRoll:.999})
  b.level=2
  addLegacyFruit(s,basketCapacity(s)-2)
  advance(s,6)
  reject(s,{type:'harvest',plot:12},'basketFull')
  commit(s,{type:'sell'})
  const c={type:'harvest',plot:12,expectedId:p.id,cycle:1} as const
  expect(commit(s,c)).toContain('Withered')
  expect(b.plant?.lives).toBe(0);expect(b.level).toBe(2)
  s.rng=1
  const batch=s.basket[0]
  commit(s,{type:'extractSeeds',id:batch.id,count:batch.count})
  expect(s.variants).toEqual([{species:'radish',rarity:'rare',plus:['seedy'],minus:'sparse',count:1}])
  expect(s.basket).toHaveLength(0)
  reject(s,c,'notReady')
  const stock=s.variants[0],coins=s.coins
  cleanBed(s,12)
  commit(s,{type:'plant',plot:12,species:'radish',stock})
  expect(s.coins).toBe(coins);expect(s.variants).toEqual([])
  expect(s.plots[12].plant).toMatchObject({...rare,plus:['seedy'],minus:'sparse',lives:1})
  expect(parseSave(JSON.stringify(s))).toEqual(s)
})
it('upgrades a snapshot generated and validated by 1465cf9; rejects invalid legacy inventory',()=>{
  const s=parseSave(JSON.stringify(fixture)) as GameState
  expect(s).toMatchObject({schemaVersion:saveVersion,coins:fixture.coins,planted:fixture.planted,
    seeds:{solar_strawberry:1},failures:{solar_strawberry:0,moonberry:2},musicMuted:true,lang:'en'})
  expect(saleValue(s)).toBe(60)
  expect(s.basket).toMatchObject([{species:'strawberry',count:4,valueUnits:150000,profile:null,pollination:null}])
  for(const [i,b] of fixture.plots.entries()){
    expect(s.plots[i]).toMatchObject({...b,plant:b.plant ? {id:b.plant.id,species:b.plant.species,progress:b.plant.progress,readySince:b.plant.readySince,mature:b.plant.mature}:null})
    if(b.plant)expect(s.plots[i].plant?.lives).toBe(speciesInfo[s.plots[i].plant!.species].lives)
  }
  expect(s.nursery[0]).toMatchObject({id:fixture.nursery[0].id,species:'blueberry',progress:1,...common,lives:speciesInfo.blueberry.lives})
  expect(parseSave(JSON.stringify({...fixture,seeds:{...fixture.seeds,solar_strawberry:2}}))).toBeNull()
  commit(s,{type:'researchDirection',plot:8,expectedId:s.plots[8].plant!.id,recipeId:'moonberry:main'})
  advance(s,12)
  const available=experiments(s,8)
  expect(available.map(e=>e.result).sort()).toEqual(['moonberry','solar_strawberry'])
  const copy=parseSave(JSON.stringify(s)) as GameState
  for(const g of [s,copy])cross(g,8,'moonberry')
  expect(s).toEqual(copy)
})

it('captures the configured recipe and the first eligible donor even when donors are exchanged later',()=>{
  const s=parseSave(JSON.stringify(fixture)) as GameState
  commit(s,{type:'store',plot:4,expectedId:s.plots[4].plant!.id})
  commit(s,{type:'harvest',plot:9})
  const donor=s.basket.find(batch=>batch.species==='sunflower')!
  commit(s,{type:'extractSeeds',id:donor.id,count:donor.count})
  cleanBed(s,9)
  commit(s,{type:'plant',species:'sunflower',plot:9,stock:common})
  const rareDonor={rarity:'rare',plus:'fruitful',minus:'small'} as const
  s.variants.push({species:'sunflower',count:1,...rareDonor})
  commit(s,{type:'plant',species:'sunflower',plot:12,stock:rareDonor,replaceId:s.plots[12].plant!.id})
  advance(s,12)
  const options=experiments(s,8).filter(e=>e.result==='solar_strawberry')
  expect(options).toHaveLength(2)
  commit(s,{type:'move',from:9,to:12})
  commit(s,{type:'harvest',plot:8})
  const pollinated=s.basket.find(batch=>batch.pollination)!
  expect(pollinated.pollination).toMatchObject({result:'solar_strawberry',donor:{species:'sunflower',...common}})
  commit(s,{type:'extractSeeds',id:pollinated.id,count:pollinated.count})
  expect(s.seeds.strawberry).toBeGreaterThan(0)
  expect(s.failures.moonberry).toBe(2)
})

it('preserves profiles and partial growth in nursery, replacement and next draw',()=>{
  const s=parseSave(JSON.stringify(fixture)) as GameState
  const base=s.plots[8].plant!
  s.variants.push({species:'strawberry',count:2,rarity:'rare',plus:['early'],minus:'small'})
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
    expect(g.basket.at(-1)!.valueUnits).toBe(86400)
  }
  expect(copy).toEqual(s)
})

it('retains the roll on the bed if another harvest advances the generator',()=>{
  const s=gardenWithStarterPlants(7),p=s.plots[12].plant!
  p.fruitRoll=.999;advance(s,6)
  addLegacyFruit(s,basketCapacity(s)-2)
  reject(s,{type:'harvest',plot:12},'basketFull')
  commit(s,{type:'sell'})
  commit(s,{type:'harvest',plot:13})
  const copy=parseSave(JSON.stringify(s)) as GameState
  commit(copy,{type:'sell'});commit(copy,{type:'harvest',plot:12})
  expect(copy.basket[0].count).toBe(3)
  cleanBed(copy,12)
  commit(copy,{type:'plant',species:'radish',plot:12})
  advance(copy,6);copy.plots[12].plant!.fruitRoll=0
  commit(copy,{type:'harvest',plot:12})
  expect(copy.basket).toHaveLength(1)
  expect(copy.basket[0].count).toBe(5)
})

it('rebreeds an expired hybrid, retains its last harvest and never repeats the introductory guarantee',()=>{
  const s=parseSave(JSON.stringify(fixture)) as GameState
  commit(s,{type:'store',plot:4,expectedId:s.plots[4].plant!.id})
  commit(s,{type:'plant',species:'solar_strawberry',plot:12,replaceId:s.plots[12].plant!.id})
  s.plots[12].plant!.lives=1
  advance(s,40);commit(s,{type:'harvest',plot:12})
  expect(s.planted).toContain('solar_strawberry')
  expect(parseSave(JSON.stringify(s))).toEqual(s)
  const lost=s.basket.find(b=>b.species==='solar_strawberry')!
  reject(s,{type:'sellHarvest',id:lost.id,count:lost.count},'lastHybrid')
  commit(s,{type:'harvest',plot:8})
  const batch=s.basket.find(b=>b.pollination?.result==='solar_strawberry')!
  s.rng=1000
  expect(commit(s,{type:'extractSeeds',id:batch.id,count:batch.count})).toContain('ExperimentFailed')
  s.failures.solar_strawberry=5
  advance(s,12);expect(cross(s,8,'solar_strawberry')).toContain('SeedPropagated:solar_strawberry')
})

it('rejects a replay after regrowth and after a replacement takes the same bed',()=>{
  const s=gardenWithStarterPlants(12)
  s.coins=speciesInfo.strawberry.seedPrice!
  commit(s,{type:'plant',species:'strawberry',plot:8})
  advance(s,12)
  const p=s.plots[8].plant!
  const command={type:'harvest',plot:8,expectedId:p.id,cycle:p.lives} as const
  commit(s,command);advance(s,12)
  reject(s,command,'stalePlant')
  commit(s,{type:'move',from:13,to:8})
  reject(s,command,'stalePlant')
})

it('uses the strongest single copy chance from the parent and honey clover',()=>{
  const s=parseSave(JSON.stringify(fixture)) as GameState
  commit(s,{type:'plant',species:'solar_strawberry',plot:12,replaceId:s.plots[12].plant!.id})
  const parent=s.plots[12].plant!
  Object.assign(parent,{rarity:'uncommon',plus:['seedy'],minus:'sparse'})
  const noAura=structuredClone(s)
  s.revealed.push('honey_clover')
  s.planted.push('clover')
  s.seeds.honey_clover=1
  commit(s,{type:'plant',plot:13,species:'honey_clover',replaceId:s.plots[13].plant!.id})
  for(const g of [noAura,s]){
    advance(g,20)
    commit(g,{type:'harvest',plot:12})
    const batch=g.basket.find(c=>c.species==='solar_strawberry')!
    const stream={rng:1}
    nextRandom(stream)
    g.rng=stream.rng
    commit(g,{type:'extractSeeds',id:batch.id,count:batch.count})
    expect(parseSave(JSON.stringify(g))).toEqual(g)
  }
  expect(s.variants[0]).toMatchObject({species:'solar_strawberry',rarity:'uncommon',plus:['seedy'],minus:'sparse',count:1})
  expect(noAura.variants).toEqual([])
})
