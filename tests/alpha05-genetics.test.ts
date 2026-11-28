import { expect,it } from 'vitest'
import { auras, speciesIds, speciesInfo } from '../src/game/config'
import { canonical, changeStock, common, inherit, nextRandom, plantStats, profileKey, rarityOdds,
  rules, sameProfile, stockCount, traits, validGenome } from '../src/game/genetics'
import { initialState } from '../src/game'
import { rarities, type Profile, type Rarity } from '../src/game/model'

const documented = [
  [65,25,10,0,0], [55,30,15,0,0], [45,35,20,0,0], [35,35,25,5,0], [30,35,25,10,0],
  [45,35,20,0,0], [35,40,25,0,0], [25,35,35,5,0], [20,30,40,10,0],
  [20,35,35,10,0], [15,30,35,18,2], [10,25,40,20,5],
  [10,20,35,30,5], [5,15,35,35,10], [5,10,30,40,15]
]
const pairs = rarities.flatMap((a,i)=>rarities.slice(i).map(b=>[a,b] as const))
const make = (rarity:Rarity):Profile=>({rarity,plus:(['early','fruitful','quality'] as const)
  .slice(0,[0,1,1,2,3][rarities.indexOf(rarity)]),minus:null})

it('matches all 15 documented distributions, boundaries and transposes',()=>{
  for (const [i,[a,b]] of pairs.entries()) {
    const expected=documented[i]
    const row=rarityOdds(a,b)
    expect(row).toEqual(expected)
    expect(rarityOdds(b,a)).toEqual(row)
    expect(row.reduce((sum,n)=>sum+n,0)).toBe(100)
    let boundary=0
    row.forEach((weight,j)=>{
      if (weight>0) {
        expect(inherit(make(a),make(b),()=> (boundary+0.01)/100,'radish').rarity).toBe(rarities[j])
        expect(inherit(make(b),make(a),()=> (boundary+weight-0.01)/100,'radish').rarity).toBe(rarities[j])
      }
      boundary+=weight
    })
  }
})

it.each(speciesIds)('reaches every rarity from ordinary parents and generates valid %s profiles',species=>{
  const seed={rng:0x9112}
  const initialRng=seed.rng
  const allowedAura=auras.some(a=>a.source===species)
  const sample=(a:Profile,b:Profile,n:number)=>Array.from({length:n},()=>inherit(a,b,()=>nextRandom(seed),species))
  const base=sample(common,common,200)
  const rare=base.find(p=>p.rarity==='rare')!
  expect(rare).toBeDefined()
  const advanced=sample(rare,rare,200)
  const epic=advanced.find(p=>p.rarity==='epic')!
  expect(epic).toBeDefined()
  const final=sample(rare,epic,600)
  const all=[...base,...advanced,...final]
  expect(new Set(all.map(p=>p.rarity))).toEqual(new Set(rarities))
  expect(all.some(p=>p.rarity==='legendary' && p.minus===null)).toBe(true)
  for (const posterior of all) {
    const plus=traits(posterior)
    expect(validGenome(species,posterior)).toBe(true)
    expect(plus).toHaveLength([0,1,1,2,3][rarities.indexOf(posterior.rarity)])
    expect(new Set(plus).size).toBe(plus.length)
    if (speciesInfo[species].lifecycle==='single') {
      expect(plus).not.toContain('hardy')
      expect(posterior.minus).not.toBe('fragile')
    }
    if (!allowedAura) expect(plus).not.toContain('aura')
    if (posterior.minus==='fragile') expect(plus).not.toContain('hardy')
    if (posterior.minus==='slow') expect(plus).not.toContain('early')
  }
  seed.rng=initialRng
  expect(sample(common,common,200)).toEqual(base)
})

it('coalesces seed stock by canonical set identity and keeps flaws distinct',()=>{
  const state=initialState(6)
  const first:Profile={rarity:'legendary',plus:['stable','quality','seedy'],minus:'small'}
  const second:Profile={rarity:'legendary',plus:['seedy','quality','stable'],minus:'small'}
  const clean={...first,minus:null}
  expect(sameProfile(first,second)).toBe(true)
  expect(profileKey('radish',first)).toBe(profileKey('radish',second))
  expect(profileKey('radish',first)).not.toBe(profileKey('strawberry',first))
  changeStock(state,'radish',first,1)
  changeStock(state,'radish',second,2)
  changeStock(state,'radish',clean,4)
  expect(state.variants).toEqual([{...canonical(first),species:'radish',count:3},{...canonical(clean),species:'radish',count:4}])
  changeStock(state,'radish',first,-3)
  expect(stockCount(state,'radish',second)).toBe(0)
  expect(stockCount(state,'radish',clean)).toBe(4)
})

it('applies quality, stability, seed copying and aura bonuses concurrently',()=>{
  const [source]=auras.map(a=>a.source).filter(id=>speciesIds.includes(id as typeof speciesIds[number]))
  const species=source as typeof speciesIds[number]
  const profile:Profile={rarity:'legendary',plus:['quality','stable','seedy'],minus:'small'}
  const stats=plantStats(species,profile)
  expect(stats.copyChance).toBeCloseTo(Math.min(rules.copyCap,rules.seedCopy[1]+rules.stable[1]))
  expect(stats.fruitPriceMultiplier).toBeCloseTo(rules.rarityFruitPrice[4]*(1+rules.quality[1])*(1-rules.small))
  expect(stats.seedYieldModifier).toBeCloseTo(rules.raritySeedYield[4]+rules.seedyYield[1])
  expect(plantStats(species,{...profile,plus:['quality','stable','aura']}).auraMultiplier).toBeCloseTo(1+rules.aura[1])
})
