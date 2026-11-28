import { expect,it } from 'vitest'
import { advance, execute, initialState } from '../src/game'
import { evolution, recipes, speciesIds, speciesInfo } from '../src/game/config'
import { common } from '../src/game/genetics'
import { rarities, type GameState, type Profile, type Rarity, type Species } from '../src/game/model'
import { parseSave } from '../src/persistence/migration'
import { commit } from './helpers'

it('plants all 60 collection entries from common starters and paid greenhouse offspring',()=>{
  const garden=initialState(2026)
  // Prepare a funded garden with the recipes already learned and Common seed stock.
  garden.coins=1_000_000
  garden.sold=true
  garden.revealed=recipes.map(recipe=>recipe.result)
  for (const plot of garden.plots) plot.open=true
  const bed=garden.plots.findIndex(plot=>!plot.plant)
  for (const target of [2,3,4,5]) commit(garden,{type:'upgradeGreenhouse',target})

  function growParent(state:GameState,species:Species,profile:Profile) {
    commit(state,{type:'plant',plot:bed,species,stock:profile})
    const {id}=state.plots[bed].plant!
    commit(state,{type:'store',plot:bed,expectedId:id})
    return id
  }

  for (const species of speciesIds) {
    garden.seeds[species]=2
    const parents=new Map<Rarity,number[]>(rarities.map(rarity=>[rarity,[]]))
    parents.set('common',[growParent(garden,species,common),growParent(garden,species,common)])
    const {cost,seconds}=evolution.experiments[speciesInfo[species].generation]

    function getOffspring(target:Rarity,needed:number,pair:[number,number]) {
      for (let attempts=0;attempts<120 && parents.get(target)!.length<needed;attempts++) {
        const before=garden.coins
        commit(garden,{type:'startCross',parents:pair})
        expect(garden.coins).toBe(before-cost)
        const trial=garden.crosses.at(-1)!
        advance(garden,seconds)
        const result=execute(garden,{type:'collectCross',id:trial.id})
        if (!result.ok || !result.obtained?.[0]) throw Error('Paid experiment did not deliver a seed')
        const profile=result.obtained[0]
        const candidates=parents.get(profile.rarity)!
        if (candidates.length<2) candidates.push(growParent(garden,species,profile))
      }
      expect(parents.get(target)!.length, species+'/'+target).toBeGreaterThanOrEqual(needed)
    }

    const [first,second]=parents.get('common')!
    getOffspring('uncommon',1,[first,second])
    getOffspring('rare',2,[first,parents.get('uncommon')![0]])
    const [rareA,rareB]=parents.get('rare')!
    getOffspring('epic',1,[rareA,rareB])
    getOffspring('legendary',1,[rareA,parents.get('epic')![0]])
    expect(garden.collection.filter(row=>row.species===species).map(row=>row.rarity).sort()).toEqual([...rarities].sort())
  }
  expect(garden.collection).toHaveLength(60)
  expect(parseSave(JSON.stringify(garden))).toEqual(garden)
})
