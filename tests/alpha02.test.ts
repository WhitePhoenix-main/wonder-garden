import { expect, it } from 'vitest'
import { initialState, speciesInfo } from '../src/game'
import { recoveryHint } from '../src/ui/onboarding'
import { canRecoverGarden, plantingIssue, removalIssue, secondsLeft } from '../src/game/queries'
import { parseSave } from '../src/persistence/migration'
import { cross, legacySix, commit, earn, reject, wait } from './helpers'

it('migrates Alpha 02 v5 and remembers the occupied-bed hint across reload',()=>{
  const state=initialState(33)
  earn(state,65)
  const {occupiedHintShown,...legacy}=state
  expect(occupiedHintShown).toBe(false)
  expect(parseSave(JSON.stringify({...legacySix(state), schemaVersion:5}))).toMatchObject({coins:state.coins,occupiedHintShown:false})
  expect(commit(state,{type:'showOccupiedHint'})).toEqual(['OccupiedHintShown'])
  expect(parseSave(JSON.stringify(state))).toEqual({...state,occupiedHintShown:true})
  expect(commit(state,{type:'showOccupiedHint'})).toEqual([])
  expect(parseSave(JSON.stringify({...state,occupiedHintShown:'yes'}))).toBeNull()
})

it('validates payment, occupant and an open bed before changing stock',()=>{
  const s=initialState(33), cmd={type:'plant',species:'radish',plot:8} as const
  const cost=speciesInfo.radish.seedPrice!
  s.coins=cost-1
  reject(s,cmd,'noCoins')
  s.coins=cost
  reject(s,{...cmd,plot:0},'plotClosed')
  expect(plantingIssue(s,8,'radish')).toBeNull()
  commit(s,cmd)
  expect(s.coins).toBe(0)
  reject(s,cmd,'replacementLocked')
})

it('compost preserves soil, basket and collection; a stale confirmation cannot remove a replacement',()=>{
  const s=initialState(33)
  earn(s,500)
  commit(s,{type:'upgrade',plot:12})
  wait(s,6)
  commit(s,{type:'harvest',plot:13})
  const before=structuredClone(s), cmd={type:'compost',plot:12,expectedId:s.plots[12].plant!.id} as const
  expect(removalIssue(s,12,cmd.expectedId,'compost')).toBeNull()
  expect(s).toEqual(before)
  commit(s,cmd)
  before.plots[12].plant=null
  expect(s).toEqual(before)
  expect(parseSave(JSON.stringify(s))).toEqual(s)
  commit(s,{type:'plant',plot:12,species:'radish'})
  reject(s,cmd,'stalePlant')
})

it.each(['none','other species','seed','nursery','island'])('checks the exact species reserve: %s',reserve=>{
  const s=initialState(33)
  earn(s,650)
  commit(s,{type:'plant',plot:8,species:'strawberry'})
  commit(s,{type:'plant',plot:9,species:'sunflower'})
  wait(s,12);cross(s,8,'solar_strawberry')
  const replace={type:'plant',plot:12,species:'solar_strawberry',replaceId:s.plots[12].plant!.id} as const
  commit(s,replace)
  reject(s,replace,'stalePlant')
  reject(s,{...replace,replaceId:s.plots[12].plant!.id},'noSeeds')
  const cmd={type:'compost',plot:12,expectedId:s.plots[12].plant!.id} as const
  if(reserve==='none'||reserve==='other species'){
    if(reserve==='other species')s.seeds.moonberry=1
    reject(s,cmd,'lastHybrid');return
  }
  s.seeds.solar_strawberry=1
  if(reserve!=='seed'){
    commit(s,{...replace,plot:13,replaceId:s.plots[13].plant!.id})
    if(reserve==='nursery')commit(s,{type:'store',plot:13,expectedId:s.plots[13].plant!.id})
  }
  commit(s,cmd)
  expect(parseSave(JSON.stringify(s))).toEqual(s)
})

it('uses liquid resources and existing stock before emergency planting',()=>{
  const s=initialState(33)
  s.plots.forEach(p=>p.plant=null)
  s.coins=0
  const cost=speciesInfo.radish.seedPrice!
  expect(canRecoverGarden(s)).toBe(true)
  s.basket.push({species:'radish',valueUnits:cost*10000})
  expect(canRecoverGarden(s)).toBe(false)
  commit(s,{type:'sell'});expect(canRecoverGarden(s)).toBe(false)
  s.coins=0;s.seeds.moonberry=1
  expect(canRecoverGarden(s)).toBe(false)
})

it('recomputes remaining seconds on changes to neighbors, bed level and position',()=>{
  const s=initialState(33)
  earn(s,650)
  commit(s,{type:'plant',species:'strawberry',plot:8})
  wait(s,2)
  const progress=s.plots[8].plant!.progress
  const left=secondsLeft(s,8)
  commit(s,{type:'plant',species:'sunflower',plot:9})
  expect(secondsLeft(s,8)).toBeLessThan(left)
  commit(s,{type:'upgrade',plot:8})
  const faster=secondsLeft(s,8)
  commit(s,{type:'move',from:8,to:12})
  expect(secondsLeft(s,12)).toBeGreaterThan(faster)
  expect(s.plots[12].plant!.progress).toBe(progress)
  expect(s.plots[8].level).toBe(2)
  wait(s,15);expect(secondsLeft(s,12)).toBe(0)
  commit(s,{type:'harvest',plot:12})
  expect(secondsLeft(s,12)).toBe(speciesInfo.strawberry.cycleSec)
})

it('guides an empty garden through every available recovery path',()=>{
  const state=initialState(33), plant=state.plots[12].plant!
  state.plots.forEach(p=>p.plant=null)
  state.nursery.push(plant)
  expect(recoveryHint(state)).toMatch(/питомника/)
  state.nursery=[]
  state.seeds.solar_strawberry=1
  expect(recoveryHint(state)).toMatch(/семя/)
  state.seeds.solar_strawberry=0
  expect(recoveryHint(state)).toMatch(/каталога/)
  state.coins=0
  state.basket.push({species:'radish',valueUnits:speciesInfo.radish.seedPrice!*10000})
  expect(recoveryHint(state)).toMatch(/Продайте/)
  state.basket=[]
  expect(recoveryHint(state)).toMatch(/аварийного/)
})

it('restarts the countdown after a helper harvest and rejects an outdated nursery selection',()=>{
  const s=initialState(33)
  earn(s,1000)
  commit(s,{type:'upgradeHelper',target:1})
  const picked=s.plots[12].plant!
  wait(s,6)
  if(picked.readySince!==null) wait(s,5)
  expect(secondsLeft(s,12)).toBeGreaterThan(0)
  s.revealed.push('solar_strawberry')
  const id=s.plots[12].plant!.id
  commit(s,{type:'move',from:12,to:13})
  reject(s,{type:'store',plot:12,expectedId:id},'stalePlant')
})

it('carries the Alpha 01 mute setting to both channels and retains tutorial skip independently',()=>{
  const state=initialState(33)
  earn(state,120)
  const {musicMuted,tutorialSkipped,...v4}=state
  const migrated=parseSave(JSON.stringify({...legacySix(state),schemaVersion:4,muted:true}))
  expect(migrated).toMatchObject({coins:state.coins,muted:true,musicMuted:true})
  commit(state,{type:'skipTutorial'})
  commit(state,{type:'music',muted:true})
  expect(parseSave(JSON.stringify(state))).toEqual(state)
})

