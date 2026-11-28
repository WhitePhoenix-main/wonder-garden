import alpha06 from './fixtures/alpha06.json'
import { expect, it } from 'vitest'
import { initialState, advance, execute } from '../src/game'
import { beginObservation, sessionStats } from '../src/game/analytics'
import { marketQuote } from '../src/game/market'
import { common } from '../src/game/genetics'
import { parseSave } from '../src/persistence/migration'
import { commit } from './helpers'

it('records committed batches once, disregards a rolled-back bulk sale and starts fresh on load',()=>{
  const s=initialState(42)
  beginObservation(s)
  advance(s,9)
  commit(s,{type:'harvest',plot:12})
  const lot=s.basket[0]
  const item={type:'sellHarvest' as const,id:lot.id,count:1}
  expect(execute(s,{type:'bulk',commands:[item,{...item,id:9999}]}).ok).toBe(false)
  expect(sessionStats(s,60).total.fruitRevenue).toBe(0)
  const coins=s.coins
  commit(s,{type:'bulk',commands:[item,item]})
  const quote=marketQuote(s,'radish','fruit').pricePercent
  expect(sessionStats(s,60).total).toMatchObject({harvests:1,fruitRevenue:s.coins-coins,soldUnits:2,quoteUnits:2*quote})
  commit(s,{type:'plant',species:'radish',plot:12})
  s.seeds.radish++
  commit(s,{type:'plant',species:'radish',plot:8,stock:common})
  expect(sessionStats(s,60).total).toMatchObject({planted:2,seedCost:10})
  const restored=parseSave(JSON.stringify(s))
  if (!restored || restored==='future') throw Error('Invalid garden')
  beginObservation(restored)
  expect(sessionStats(restored,60).total.harvests).toBe(0)
  advance(s,61)
  expect(sessionStats(s,60).total.harvests).toBe(0)
  expect(sessionStats(s,300).total.harvests).toBe(1)
})

it('preserves the Alpha 06 market, paid experiments, RNG and every inventory lot through migration',()=>{
  const loaded=parseSave(JSON.stringify(alpha06))
  if (!loaded || loaded==='future') throw Error('Migration failed')
  const {schemaVersion,trading,rarityProgress,clones,...existing}=loaded
  const {schemaVersion:old,...previous}=alpha06
  expect([old,schemaVersion]).toEqual([10,11])
  expect(existing).toEqual(previous)
  expect([trading.strategy,rarityProgress,clones]).toEqual(['quick',{},[]])
  expect(parseSave(JSON.stringify(loaded))).toEqual(loaded)
})
