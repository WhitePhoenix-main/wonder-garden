import { expect, it } from 'vitest'
import alpha07 from './fixtures/alpha07.json'
import { advance, execute } from '../src/game'
import { common } from '../src/game/genetics'
import { greenhouseTime } from '../src/game/greenhouse'
import { catchUp } from '../src/game/offline'
import { advanceProduction, seedProductionCapacity, seedProductionCount, unlockProduction } from '../src/game/nursery'
import { newPlant } from '../src/game/state'
import { parseSave } from '../src/persistence/migration'
import { createPersistence } from '../src/persistence/storage'
import { gardenWithStarterPlants, commit, memoryStorage } from './helpers'

function prepared(level=2) {
  const s=gardenWithStarterPlants(17)
  s.greenhouseLevel=level
  s.revealed.push('solar_strawberry')
  // The migration validator expects the known recipe parents.
  s.planted.push('strawberry','sunflower')
  s.passive.checkpoint=1000
  s.coins=500
  s.seeds.radish=100
  unlockProduction(s)
  commit(s,{type:'assignProduction',slot:0,assignment:{species:'radish',profile:common,mode:'fruit'}})
  return s
}

it('migrates a snapshot written by the original Alpha 07 code without replaying its timers',()=>{
  const s=parseSave(JSON.stringify(alpha07))
  if (!s || s==='future') throw Error('Alpha 07 snapshot was rejected')
  const {schemaVersion,balanceVersion,automation,passive,tutorialSeen,research,...existing}=s
  const {schemaVersion:oldSchema,balanceVersion:oldBalance,automation:oldAutomation,...previous}=alpha07
  expect([oldSchema,oldBalance,schemaVersion,balanceVersion]).toEqual([11,4,13,5])
  expect(Object.keys(research.recipes)).toEqual(alpha07.revealed.map(id=>id+':main'))
  expect(existing).toEqual(previous)
  expect(automation).toEqual({...oldAutomation,cleanup:true})
  expect(passive.checkpoint).toBeNull()
  expect(tutorialSeen).toEqual([])
  expect(catchUp(s,21_000_000)).toBeNull()
  expect(s.playTime).toBe(alpha07.playTime)
  expect(parseSave(JSON.stringify(s))).toEqual(s)
})

it('commits offline production once and keeps island labor, market, and paid RNG independent',()=>{
  const state=prepared()
  const memory=memoryStorage()
  const writer=createPersistence(()=>memory)
  writer.save(state)
  const s=writer.load()
  const original=structuredClone(s)
  const now=1000+8*3600*1000
  const report=writer.resume(s,now)
  expect(report).toMatchObject({absent:8*3600,processed:2*3600,ready:2,stops:['full','idle']})
  expect(s).toMatchObject({playTime:original.playTime,market:original.market,rng:original.rng,harvestRemaining:original.harvestRemaining})
  expect(s.passive.basket.length).toBeGreaterThan(0)
  expect(s.plots[12].plant!.lives).toBe(1)
  const actor=createPersistence(()=>memory)
  const restored=actor.load()
  expect(restored).toEqual(s)
  expect(actor.resume(restored,now)).toBeNull()
  expect(actor.resume(restored,now-5000)).toBeNull()
  expect(restored).toEqual(s)
  commit(restored,{type:'collectProduction'})
  expect(execute(restored,{type:'collectProduction'})).toEqual({ok:false,reason:'itemChanged'})
  expect(restored.basket.reduce((n,b)=>n+b.count,0)).toBe(report!.fruit)
})

it('preserves a paid laboratory result and collects it only once after absence',()=>{
  const s=prepared()
  const parent=s.plots[12].plant!
  commit(s,{type:'store',plot:12,expectedId:parent.id})
  const other=newPlant(s.nextId++,'radish')
  s.nursery.push(other)
  commit(s,{type:'startCross',parents:[parent.id,other.id]})
  const original=structuredClone(s.crosses[0])
  const before=s.rng
  expect(catchUp(s,101_000)).toMatchObject({experiments:1})
  expect(greenhouseTime(s)).toBe(original.readyAt)
  expect(s.crosses[0]).toEqual(original)
  expect(s.rng).toBe(before)
  const restored=parseSave(JSON.stringify(s))
  if (!restored || restored==='future') throw Error('Invalid resumed lab state')
  commit(restored,{type:'collectCross',id:original.id})
  expect(execute(restored,{type:'collectCross',id:original.id})).toEqual({ok:false,reason:'itemChanged'})
})

it('moves the same specimen between nursery locations and honors reserves',()=>{
  const s=prepared(3)
  const plant=s.plots[12].plant!
  commit(s,{type:'assignProduction',slot:0,assignment:null})
  advance(s,3)
  commit(s,{type:'store',plot:12,expectedId:plant.id})
  commit(s,{type:'moveProduction',slot:0,direction:'in',id:plant.id})
  s.reserves.radish=s.seeds.radish
  commit(s,{type:'assignProduction',slot:1,assignment:{species:'radish',profile:common,mode:'seed'}})
  expect(advanceProduction(s,3).spent).toBe(0)
  expect(s.passive.beds[1].plant).toBeNull()
  commit(s,{type:'moveProduction',slot:0,direction:'out',id:plant.id})
  expect(s.nursery).toContain(plant)
  expect(s.passive.beds[0].plant).toBeNull()
  expect(s.nursery[0].progress).toBeGreaterThan(0.5)
  expect(parseSave(JSON.stringify(s))).toEqual(s)
})

it('rejects stale writers and starts a recovered backup with a fresh offline checkpoint',()=>{
  const memory=memoryStorage()
  const writer=createPersistence(()=>memory)
  writer.save(prepared())
  const stale=createPersistence(()=>memory)
  const old=stale.load()
  const current=writer.load()
  expect(writer.resume(current,100_000)?.fruit).toBeGreaterThan(0)
  expect(stale.resume(old,100_000)).toBeNull()
  expect(stale.warning).toBe('otherTab')
  expect(old.passive.basket).toHaveLength(0)
  memory.setItem('wonder-garden.save.v1','{')
  const recovery=createPersistence(()=>memory)
  const recovered=recovery.load()
  expect(recovery.warning).toBe('recovered')
  expect(recovery.resume(recovered,100_000)).toBeNull()
  expect(recovered.passive.checkpoint).toBe(100_000)
})

it('caps seed production locally and releases it only once',()=>{
  const s=prepared(3)
  commit(s,{type:'assignProduction',slot:0,assignment:{species:'radish',profile:common,mode:'seed'}})
  const produced=advanceProduction(s,14400)
  expect(produced.seeds).toBeGreaterThan(0)
  expect(seedProductionCount(s)).toBeLessThanOrEqual(seedProductionCapacity(s))
  expect(s.seeds.radish).toBe(100-produced.spent)
  expect(parseSave(JSON.stringify(s))).toEqual(s)
  commit(s,{type:'collectProduction'})
  expect(s.seeds.radish).toBe(100-produced.spent+produced.seeds)
  expect(execute(s,{type:'collectProduction'})).toEqual({ok:false,reason:'itemChanged'})
})
