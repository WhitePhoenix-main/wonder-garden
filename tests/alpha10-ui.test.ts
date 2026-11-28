import { expect, it } from 'vitest'
import { breedingRecipes } from '../src/game/config'
import { recipeHints, resonanceNames } from '../src/ui/panels/recipes'
import { guideChapters } from '../src/ui/onboarding'
import { common } from '../src/game/genetics'
import { specializations } from '../src/ui/specimens'

it('provides a bilingual clue for each directional recipe and a resonance for every hybrid',()=>{
  expect(Object.keys(recipeHints).sort()).toEqual(breedingRecipes.map(recipe=>recipe.id).sort())
  for (const recipe of breedingRecipes) {
    expect(recipeHints[recipe.id]).toHaveLength(2)
    expect(recipeHints[recipe.id].every(text=>text.length>20)).toBe(true)
    expect(resonanceNames[recipe.result].every(Boolean)).toBe(true)
  }
  for (const recipe of breedingRecipes.filter(entry=>!entry.alternate)) {
    expect(recipeHints[recipe.id]).not.toEqual(recipeHints[`${recipe.result}:alternate`])
  }
})

it('offers seven nonempty guide chapters in both languages',()=>{
  for (const chapters of Object.values(guideChapters)) {
    expect(chapters).toHaveLength(7)
    expect(chapters.every(([title,text])=>title.length>0 && text.length>40)).toBe(true)
  }
})

it('derives line labels from the actual effect for the species',()=>{
  expect(specializations('ru','strawberry',common)).toEqual([])
  const fast={rarity:'uncommon',plus:['early'],minus:null} as const
  expect(specializations('ru','strawberry',fast)).toContain('Быстрорастущая линия')
  expect(specializations('en','strawberry',fast)).toContain('Breeding line')
})
