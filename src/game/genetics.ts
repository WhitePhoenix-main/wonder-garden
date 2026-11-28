import { balance, speciesInfo } from './config'
import { negatives, positives, rarities, type GameState, type Profile, type Species } from './model'

export const common:Profile={rarity:'common',plus:null,minus:null}
export const rules=balance.genetics
export const strength=(p:Profile)=>p.rarity==='rare'?1:0
export const sameProfile=(a:Profile,b:Profile)=>a.rarity===b.rarity && a.plus===b.plus && a.minus===b.minus
export const compatible=(p:Profile)=>!(p.plus==='hardy' && p.minus==='fragile' || p.plus==='early' && p.minus==='slow')

export function maxLives(species:Species, profile:Profile):number {
  const data = speciesInfo[species]
  if (data.lifecycle === 'single') return 1
  const hardy = profile.plus === 'hardy' ? rules.hardy[strength(profile)] : 0
  const fragile = profile.minus === 'fragile' ? rules.fragile : 0
  return Math.max(1, data.lives + hardy - fragile)
}

export function plantStats(species:Species, profile:Profile) {
  const data = speciesInfo[species]
  const rank = rarities.indexOf(profile.rarity)
  const power = strength(profile)
  const duration = profile.plus === 'early' ? 1 - rules.early[power] : profile.minus === 'slow' ? 1 + rules.slow : 1
  return {
    growthSec: data.cycleSec * duration,
    regrowSec: data.regrowSec * duration,
    fruits: data.fruits,
    ownSeeds: data.ownSeeds,
    maxLives: maxLives(species, profile),
    fruitYieldModifier: profile.plus === 'fruitful' ? rules.fruitful[power] : 0,
    seedYieldModifier: rules.raritySeedYield[rank] + (profile.plus === 'seedy' ? rules.seedyYield[power] : 0)
      - (profile.minus === 'sparse' ? rules.sparse : 0),
    fruitPriceMultiplier: rules.rarityFruitPrice[rank] * (profile.minus === 'small' ? 1 - rules.small : 1)
  }
}

export function nextRandom(s:Pick<GameState,'rng'>) {
  s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0
  return s.rng/0x100000000
}
export function quantity([min,max]:number[], modifier:number, roll:number) {
  const n=max-min+1
  if(n===1)return max
  const remaining=Math.min(1, Math.max(0, 1-1/n-modifier))
  return roll>=remaining ? max : min+Math.floor(roll*(n-1)/remaining)
}
export function profileAllowed(species:Species, profile:Profile):boolean {
  return speciesInfo[species].lifecycle === 'multi' || (profile.plus !== 'hardy' && profile.minus !== 'fragile')
}

export function inherit(a:Profile,b:Profile,random:()=>number,species?:Species):Profile {
  const single = species !== undefined && speciesInfo[species].lifecycle === 'single'
  const allowedPluses = single ? positives.filter(trait => trait !== 'hardy') : positives
  const allowedFlaws = single ? negatives.filter(trait => trait !== 'fragile') : negatives
  const row=rules.rarity[rarities.indexOf(a.rarity)+rarities.indexOf(b.rarity)]
  const roll=random()*100
  const rarity=roll<row[0]?'common':roll<row[0]+row[1]?'uncommon':'rare'
  const p:Profile={rarity,plus:null,minus:null}
  const pick=<T>(values:readonly T[])=>values[Math.floor(random()*values.length)]
  if(rarity!=='common'){
    const parents=allowedPluses.filter(v=>a.plus===v || b.plus===v)
    const other=allowedPluses.filter(v=>!parents.includes(v))
    p.plus=pick(parents.length && random()<rules.inheritedPlus ? parents : other)
  }
  const flaws=[a.minus,b.minus].filter(v=>v!==null && (!single || v!=='fragile'))
  const chance=flaws.length===0?rules.newFlaw:flaws.length===1?rules.oneFlaw:rules.twoFlaws
  if(random()<chance)p.minus=pick(flaws.length?flaws:allowedFlaws)
  if(!compatible(p))p.minus=null
  return p
}
export function stockCount(s:GameState,species:Species,p:Profile) {
  return sameProfile(p,common)?s.seeds[species]:s.variants.find(v=>v.species===species && sameProfile(v,p))?.count??0
}
export function changeStock(s:GameState,species:Species,p:Profile,delta:number) {
  if(sameProfile(p,common)){s.seeds[species]+=delta;return}
  const pack=s.variants.find(v=>v.species===species && sameProfile(v,p))
  if(!pack){s.variants.push({species,rarity:p.rarity,plus:p.plus,minus:p.minus,count:delta});return}
  pack.count+=delta
  if(pack.count===0)s.variants.splice(s.variants.indexOf(pack),1)
}
