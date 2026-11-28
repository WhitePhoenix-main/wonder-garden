import { auras, balance, speciesInfo } from './config'
import { negatives, positives, rarities, type GameState, type Profile, type Positive, type Species } from './model'

export const common:Profile={rarity:'common',plus:[],minus:null}
export const rules=balance.genetics
export const strength=(p:Profile)=>rarities.indexOf(p.rarity)>=2?1:0
export const traits=(p:Profile):readonly Positive[]=>typeof p.plus==='string'?[p.plus]:p.plus??[]
export const canonical=(p:Profile):Profile=>({rarity:p.rarity,plus:positives.filter(t=>traits(p).includes(t)),minus:p.minus})
export const profileKey=(species:Species,p:Profile)=>[species,p.rarity,canonical(p).plus,p.minus??''].join('/')
export const sameProfile=(a:Profile,b:Profile)=>a.rarity===b.rarity && a.minus===b.minus &&
  traits(a).length===traits(b).length && traits(a).every(t=>traits(b).includes(t))
export const compatible=(p:Profile)=>!(traits(p).includes('hardy') && p.minus==='fragile' ||
  traits(p).includes('early') && p.minus==='slow')
export const availableTraits=(species:Species)=>positives.filter(t=>
  (t!=='hardy' || speciesInfo[species].lifecycle==='multi') && (t!=='aura' || auras.some(a=>a.source===species)))
export const rarityOdds=(a:Profile['rarity'],b:Profile['rarity']):readonly number[]=>
  rules.rarity[rarities.indexOf(a)][rarities.indexOf(b)]

export function validGenome(species:Species, profile:Profile, allowLegacy=false):boolean {
  if (!profile || !rarities.includes(profile.rarity) || !(profile.plus===null || typeof profile.plus==='string' || Array.isArray(profile.plus))) return false
  const plus=traits(profile)
  if (plus.length!==rules.slots[rarities.indexOf(profile.rarity)] || new Set(plus).size!==plus.length ||
    !plus.every(t=>positives.includes(t)) || !(profile.minus===null || negatives.includes(profile.minus))) return false
  return compatible(profile) && (profileAllowed(species,profile) || allowLegacy &&
    !plus.includes('aura') && rarities.indexOf(profile.rarity)<=2)
}

export function maxLives(species:Species, profile:Profile):number {
  const data = speciesInfo[species]
  if (data.lifecycle === 'single') return 1
  const hardy = traits(profile).includes('hardy') ? rules.hardy[strength(profile)] : 0
  const fragile = profile.minus === 'fragile' ? rules.fragile : 0
  return Math.max(1, data.lives + hardy - fragile)
}

export function plantStats(species:Species, profile:Profile) {
  const data = speciesInfo[species]
  const rank = rarities.indexOf(profile.rarity)
  const power = strength(profile)
  const plus=traits(profile)
  const duration = plus.includes('early') ? 1 - rules.early[power] : profile.minus === 'slow' ? 1 + rules.slow : 1
  const quality = plus.includes('quality') ? 1 + rules.quality[power] : 1
  const copyChance = Math.min(rules.copyCap, (plus.includes('seedy') ? rules.seedCopy[power] : rules.copy)
    + (plus.includes('stable') ? rules.stable[power] : 0))
  return {
    growthSec: data.cycleSec * duration,
    regrowSec: data.regrowSec * duration,
    fruits: data.fruits,
    ownSeeds: data.ownSeeds,
    maxLives: maxLives(species, profile),
    copyChance,
    auraMultiplier: plus.includes('aura') ? 1 + rules.aura[power] : 1,
    fruitYieldModifier: plus.includes('fruitful') ? rules.fruitful[power] : 0,
    seedYieldModifier: rules.raritySeedYield[rank] + (plus.includes('seedy') ? rules.seedyYield[power] : 0)
      - (profile.minus === 'sparse' ? rules.sparse : 0),
    fruitPriceMultiplier: rules.rarityFruitPrice[rank] * quality * (profile.minus === 'small' ? 1 - rules.small : 1)
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
  return traits(profile).every(t=>availableTraits(species).includes(t)) &&
    (speciesInfo[species].lifecycle === 'multi' || profile.minus !== 'fragile')
}

export function inherit(a:Profile,b:Profile,random:()=>number,species?:Species,inheritedPlus=rules.inheritedPlus,
  row=rarityOdds(a.rarity,b.rarity)):Profile {
  const single = species !== undefined && speciesInfo[species].lifecycle === 'single'
  const allowedPluses = species === undefined ? positives : availableTraits(species)
  const allowedFlaws = single ? negatives.filter(trait => trait !== 'fragile') : negatives
  const roll=random()*row.reduce((sum,weight)=>sum+weight,0)
  let limit=0
  const rank=row.findIndex(weight=>roll < (limit+=weight))
  const plus:Positive[]=[]
  const pick=<T>(values:readonly T[])=>values[Math.floor(random()*values.length)]
  const inherited=new Set([...traits(a), ...traits(b)])
  for (let i=0;i<rules.slots[rank];i++) {
    const parents=allowedPluses.filter(v=>inherited.has(v) && !plus.includes(v))
    const mutations=allowedPluses.filter(v=>!inherited.has(v) && !plus.includes(v))
    plus.push(pick(parents.length && (!mutations.length || random()<inheritedPlus) ? parents : mutations))
  }
  const p:Profile={rarity:rarities[rank],plus,minus:null}
  const flaws=[a.minus,b.minus].filter(v=>v!==null)
  const chance=flaws.length===0?rules.newFlaw:flaws.length===1?rules.oneFlaw:rules.twoFlaws
  if(random()<chance) {
    const valid=allowedFlaws.filter(minus=>compatible({...p,minus}))
    const inherited=valid.filter(minus=>flaws.includes(minus))
    p.minus=pick(inherited.length ? inherited : valid)
  }
  return canonical(p)
}
export function stockCount(s:GameState,species:Species,p:Profile) {
  return sameProfile(p,common)?s.seeds[species]:s.variants.find(v=>v.species===species && sameProfile(v,p))?.count??0
}
export function changeStock(s:GameState,species:Species,p:Profile,delta:number) {
  if(sameProfile(p,common)){s.seeds[species]+=delta;return}
  const pack=s.variants.find(v=>v.species===species && sameProfile(v,p))
  if(!pack){s.variants.push({species,...canonical(p),count:delta});return}
  pack.count+=delta
  if(pack.count===0)s.variants.splice(s.variants.indexOf(pack),1)
}
