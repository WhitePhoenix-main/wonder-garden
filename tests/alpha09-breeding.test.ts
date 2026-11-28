import { expect, it } from 'vitest'
import alpha08 from './fixtures/alpha08.json'
import { advance, execute, initialState } from '../src/game'
import { breedingRecipes, breedingTier, speciesIds } from '../src/game/config'
import { common, hybridRarityOdds, inherit, nextRandom, rarityGuarantee } from '../src/game/genetics'
import { crossingQuote } from '../src/game/greenhouse'
import { rarities, type GameState, type Profile } from '../src/game/model'
import { chance, pollinationFor, reactionHasSymbiosis, researchDirections, researchStatus } from '../src/game/queries'
import { newPlant } from '../src/game/state'
import { parseSave } from '../src/persistence/migration'
import { commit, plantAt, reject } from './helpers'

function conflictGarden() {
  const state=initialState(42)
  state.coins=1000
  state.sold=true
  commit(state,{type:'clear',plot:4})
  commit(state,{type:'clear',plot:5})
  commit(state,{type:'plant',plot:12,species:'radish',stock:common})
  commit(state,{type:'plant',plot:13,species:'strawberry'})
  commit(state,{type:'plant',plot:8,species:'blueberry'})
  commit(state,{type:'plant',plot:9,species:'moonflower'})
  return state
}

function reload(state:GameState):GameState {
  const restored=parseSave(JSON.stringify(state))
  expect(restored).toEqual(state)
  if (!restored || restored==='future') throw Error('Could not reload the current state')
  return restored
}

it('requires a choice when the same parents lead to different hybrids and freezes the choice for the batch',()=>{
  let state=conflictGarden()
  const recipeId='moonberry:alternate'
  const direction={type:'researchDirection' as const,plot:8,expectedId:plantAt(state,8).id,recipeId}
  expect(researchStatus(state,'moonberry',recipeId).labelKnown).toBe(false)
  expect(researchDirections(state,8).map(recipe=>recipe.id)).toEqual(['golden_flower:main',recipeId])
  expect(pollinationFor(state,8)).toBeNull()
  advance(state,25)
  expect(plantAt(state,8).pollination).toBeNull()
  expect(state.research.combinations['blueberry+moonflower']).toBe('resonance')
  expect(reactionHasSymbiosis('blueberry+moonflower')).toBe(false)
  reject(state,{...direction,recipeId:'honey_clover:alternate'},'researchUnavailable')
  commit(state,direction)
  expect(researchStatus(state,'moonberry',recipeId).stage).toBe('active')
  expect(plantAt(state,8).pollination).toMatchObject({recipeId,result:'moonberry'})
  reject(state,{...direction,recipeId:'golden_flower:main'},'researchUnavailable')
  commit(state,{type:'move',from:9,to:5})
  state=reload(state)

  plantAt(state,8).fruitRoll=0.999
  state.rng=1500
  commit(state,{type:'harvest',plot:8})
  expect(researchStatus(state,'moonberry',recipeId).stage).toBe('fruit')
  const batch=state.basket[0]
  expect(batch.pollination).toMatchObject({recipeId,result:'moonberry'})
  state.failures.moonberry=breedingTier('moonberry').hardPity-1
  expect(commit(state,{type:'extractSeeds',id:batch.id,count:1})).toContain('RecipeRevealed:moonberry')
  expect(state.research.recipes[recipeId]).toEqual({attempts:1,successes:1})
  expect(state.failures.moonberry).toBe(0)
  expect(state.research.recipes['golden_flower:main']).toBeUndefined()
  expect(researchStatus(state,'moonberry',recipeId).stage).toBe('seed')
  expect(researchStatus(state,'moonberry').labelKnown).toBe(false)
  expect(researchStatus(state,'golden_flower').labelKnown).toBe(false)

  state=reload(state)
  const remainder=state.basket[0]
  commit(state,{type:'extractSeeds',id:remainder.id,count:remainder.count})
  expect(state.research.recipes[recipeId]).toEqual({attempts:1,successes:1})
  reject(state,{type:'extractSeeds',id:remainder.id,count:1},'itemChanged')
  const profile=state.variants.find(seed=>seed.species==='moonberry')??common
  commit(state,{type:'plant',plot:4,species:'moonberry',stock:profile})
  expect(researchStatus(state,'moonberry',recipeId).stage).toBe('studied')
  expect(reload(state)).toEqual(state)
})

it('observes real directional combinations without claiming a diagonal, and records true aura symbiosis',()=>{
  const state=conflictGarden()
  commit(state,{type:'move',from:9,to:13})
  advance(state,0.1)
  expect(state.research.combinations['blueberry+moonflower']).toBeUndefined()
  expect(state.research.combinations['blueberry+strawberry']).toBe('none')
  expect(researchDirections(state,8)).toEqual([])
  commit(state,{type:'plant',plot:4,species:'sunflower'})
  advance(state,0.1)
  expect(state.research.combinations['blueberry+sunflower']).toBe('symbiosis')
})

it.each(breedingRecipes)('activates the exact directional recipe and donor snapshot for $id',recipe=>{
  const state=initialState(42)
  state.planted=speciesIds.filter(species=>species!==recipe.result)
  state.greenhouseLevel=3
  for (const plot of state.plots) plot.open=true
  const mother=state.plots[5]
  mother.plant=newPlant(state.nextId++,recipe.primary)
  mother.level=recipe.minBedLevel
  const cardinal=[1,4,6,9]
  for (const [index,donor] of recipe.neighbors.entries()) state.plots[cardinal[index]].plant=newPlant(state.nextId++,donor)
  const available=researchDirections(state,5)
  expect(available).toContainEqual(recipe)
  if (available.length>1) {
    expect(pollinationFor(state,5)).toBeNull()
    commit(state,{type:'researchDirection',plot:5,expectedId:mother.plant.id,recipeId:recipe.id})
  }
  advance(state,0.05)
  const snapshot=pollinationFor(state,5)!
  expect(snapshot.recipeId).toBe(recipe.id)
  expect([snapshot.donor,...snapshot.supporting].map(parent=>parent.species)).toEqual(recipe.neighbors)
  if (recipe.neighbors.length>1) {
    const key=[recipe.primary,...[...recipe.neighbors].sort()].join('+')
    expect(state.research.combinations[key]).toBe('strong')
  }
})

it('shares failures across recipes of a species and applies the configured soft and hard thresholds',()=>{
  const data={revealed:['solar_strawberry'] as GameState['revealed'],failures:initialState(1).failures}
  for (const recipe of breedingRecipes) {
    const tier=breedingTier(recipe.result)
    for (const attempt of [1,tier.softStart-1]) {
      data.failures[recipe.result]=attempt-1
      expect(chance(data,recipe.result,recipe.id)).toBeCloseTo(recipe.baseChance)
    }
    data.failures[recipe.result]=tier.softStart-1
    expect(chance(data,recipe.result,recipe.id)).toBeCloseTo(recipe.baseChance+tier.increment)
    data.failures[recipe.result]=tier.hardPity-1
    expect(chance(data,recipe.result,recipe.id)).toBe(1)
  }
  data.revealed=[]
  data.failures.solar_strawberry=0
  expect(chance(data,'solar_strawberry')).toBe(1)
  expect(chance(data,'solar_strawberry','solar_strawberry:alternate')).toBe(0.25)
})

it('keeps paid rarity escalation separate from hybrid rarity across a large sample',()=>{
  const distribution=[0,0,0,0,0]
  const stream={rng:2026}
  const weights=hybridRarityOdds(common,[common,common])
  for (let sample=0;sample<100_000;sample++) {
    const child=inherit(common,common,()=>nextRandom(stream),'strawberry',undefined,weights)
    distribution[rarities.indexOf(child.rarity)]++
  }
  for (const [index,count] of distribution.entries()) expect(Math.abs(count/1000-weights[index])).toBeLessThan(0.65)

  const state=initialState(1)
  const ordinary=newPlant(1,'radish')
  const epicProfile:Profile={rarity:'epic',plus:['early','fruitful'],minus:null}
  const epic=newPlant(2,'radish',epicProfile), second=newPlant(3,'radish',epicProfile)
  state.rarityProgress['radish/legendary']=rarityGuarantee('legendary')-1
  expect(crossingQuote(state,ordinary,epic)).toMatchObject({key:null,guarantee:0,weights:[34,37,24,5,0]})
  expect(crossingQuote(state,ordinary,ordinary)).toMatchObject({key:'radish/uncommon',guarantee:6,weights:[70,30,0,0,0]})
  expect(crossingQuote(state,epic,second)).toMatchObject({key:'radish/legendary',guarantee:30,weights:[0,0,0,0,5]})
})

it('migrates an Alpha 08 production save with partial harvest, learned recipe, guarantee and paid experiment',()=>{
  const parsed=parseSave(JSON.stringify(alpha08))
  if (!parsed || parsed==='future') throw Error('Alpha 08 save did not migrate')
  expect(parsed.schemaVersion).toBe(14)
  const {schemaVersion,balanceVersion,research,failures,rarityProgress,...preserved}=parsed
  const {schemaVersion:oldSchema,balanceVersion:oldBalance,failures:oldFailures,rarityProgress:oldRarity,...old}=alpha08
  expect([schemaVersion,oldSchema,oldBalance]).toEqual([14,12,5])
  expect(balanceVersion).toBeGreaterThanOrEqual(5)
  expect(preserved).toEqual(old)
  expect(research.recipes).toEqual({'solar_strawberry:main':{attempts:1,successes:1}})
  expect(research.combinations).toEqual({'strawberry+sunflower':'resonance'})
  expect([oldFailures.solar_strawberry,failures.solar_strawberry]).toEqual([4,5])
  expect([oldRarity['radish/legendary'],rarityProgress['radish/legendary']]).toEqual([9,29])
  expect(chance(parsed,'solar_strawberry')).toBe(1)
  expect(reload(parsed)).toEqual(parsed)
  const experiment=parsed.crosses[0]
  advance(parsed,experiment.readyAt)
  const storedRng=parsed.rng
  expect(execute(parsed,{type:'collectCross',id:experiment.id})).toMatchObject({ok:true,obtained:[experiment.profile]})
  expect(parsed.rng).toBe(storedRng)
})
