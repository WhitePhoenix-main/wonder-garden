import { expect, it } from 'vitest'
import { initialState } from '../src/game'
import { gardenHint, tutorialStep } from '../src/ui/onboarding'
import { cleanBed, commit, wait } from './helpers'

it('follows completed actions through the first harvest and cleanup', () => {
  const state=initialState(33)
  expect(tutorialStep(state)?.id).toBe('welcome')
  commit(state,{type:'tutorialSeen',id:'welcome'})
  expect(tutorialStep(state)?.id).toBe('first-harvest')
  wait(state,6)
  commit(state,{type:'harvest',plot:12})
  expect(tutorialStep(state)?.id).toBe('cleanup')
  cleanBed(state,12)
  expect(tutorialStep(state)?.id).toBe('first-sale')
  const batch=state.basket[0]
  commit(state,{type:'sellHarvest',id:batch.id,count:1})
  expect(tutorialStep(state)?.id).toBe('extract')
  commit(state,{type:'extractSeeds',id:batch.id,count:1})
  expect(tutorialStep(state)?.id).toBe('plant-stock')
  commit(state,{type:'plant',plot:12,species:'radish',stock:{rarity:'common',plus:null,minus:null}})
  expect(tutorialStep(state)?.id).toBe('expansion')
  commit(state,{type:'tutorialSeen',id:'expansion'})
  expect(tutorialStep(state)?.id).toBe('research')
  expect(gardenHint(state)).toMatch(/природных видов.*грядок/)
})

it('skips completed prompts, persists skipped steps and restarts the guide', () => {
  const state=initialState(42)
  commit(state,{type:'tutorialSeen',id:'welcome'})
  commit(state,{type:'tutorialSeen',id:'first-harvest'})
  expect(tutorialStep(state)).toBeNull()
  commit(state,{type:'skipTutorial'})
  expect(tutorialStep(state)).toBeNull()
  commit(state,{type:'restartTutorial'})
  expect(tutorialStep(state)?.id).toBe('welcome')
})
