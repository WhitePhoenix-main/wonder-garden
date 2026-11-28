import { expect, it } from 'vitest'
import { initialState } from '../src/game'
import { common } from '../src/game/genetics'
import { parseSave } from '../src/persistence/migration'
import { gardenHint, tutorialStep } from '../src/ui/onboarding'
import { cleanBed, commit, wait } from './helpers'

it('follows completed actions through the first harvest and cleanup', () => {
  const state=initialState(33)
  expect(tutorialStep(state)?.id).toBe('welcome')
  commit(state,{type:'tutorialSeen',id:'welcome'})
  expect(tutorialStep(state)?.id).toBe('first-plant')
  commit(state,{type:'plant',plot:12,species:'radish',stock:common})
  expect(tutorialStep(state)?.id).toBe('first-harvest')
  const restored=parseSave(JSON.stringify(state))
  if (!restored || restored==='future') throw Error('Garden tutorial snapshot did not load')
  expect(tutorialStep(restored)?.id).toBe('first-harvest')
  wait(state,6)
  commit(state,{type:'harvest',plot:12})
  expect(tutorialStep(state)?.id).toBe('cleanup')
  cleanBed(state,12)
  expect(tutorialStep(state)?.id).toBe('first-sale')
  commit(state,{type:'sell'})
  expect(tutorialStep(state)?.id).toBe('second-plant')
  commit(state,{type:'plant',plot:13,species:'radish',stock:common})
  expect(tutorialStep(state)?.id).toBe('second-harvest')
  wait(state,6)
  commit(state,{type:'harvest',plot:13})
  expect(tutorialStep(state)?.id).toBe('extract')
  const batch=state.basket[0]
  commit(state,{type:'extractSeeds',id:batch.id,count:1})
  expect(state.firstExtraction).toBe(true)
  expect(tutorialStep(state)?.id).toBe('expansion')
  commit(state,{type:'tutorialSeen',id:'expansion'})
  expect(tutorialStep(state)?.id).toBe('research')
  expect(gardenHint(state)).toMatch(/природных видов.*грядок/)
})

it('skips completed prompts, persists skipped steps and restarts the guide', () => {
  const state=initialState(42)
  commit(state,{type:'tutorialSeen',id:'welcome'})
  commit(state,{type:'tutorialSeen',id:'first-harvest'})
  commit(state,{type:'plant',plot:12,species:'radish',stock:common})
  expect(tutorialStep(state)?.id).not.toBe('first-harvest')
  commit(state,{type:'skipTutorial'})
  expect(tutorialStep(state)).toBeNull()
  commit(state,{type:'restartTutorial'})
  expect(tutorialStep(state)?.id).toBe('welcome')
  commit(state,{type:'tutorialSeen',id:'welcome'})
  expect(tutorialStep(state)?.id).not.toBe('first-plant')
  expect(state.seeds.radish).toBe(1)
})
