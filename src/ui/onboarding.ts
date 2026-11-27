import type { GameState } from '../game/model'
import { canReplace, isRecipeActive, recipes, speciesIds, speciesInfo } from '../game'

import { saleValue } from '../game/queries'
import { alpha } from './alpha'

export function recoveryHint(state:GameState) {
  const a=alpha[state.lang], cost=speciesInfo.radish.seedPrice!
  if (state.nursery.length) return a.nursery
  if (state.variants.length || Object.values(state.seeds).some(Boolean)) return a.stock
  if (state.coins>=cost) return a.buy
  return state.coins+saleValue(state)>=cost ? a.sell : a.empty
}
const solarRecipe = recipes.find(recipe => recipe.result === 'solar_strawberry')!
const hints = {
  ru: {
    harvest: 'Выберите созревший редис и нажмите «Собрать плоды».',
    sell: 'Нажмите «Продать», чтобы обменять урожай на монеты.',
    saveFor: (name:string, price:number) => `Собирайте и продавайте урожай. ${name} стоит ${price} ◈.`,
    strawberry: 'В «Посадке» выберите клубнику и свободную грядку.',
    sunflower: 'Посадите подсолнечник на грядке сбоку от клубники.',
    hybrid: 'В «Посадке» выберите полученное семя солнечной клубники.',
    replace: (name:string) => `В «Посадке» выберите «${name}» и замените одно из растений.`,
    move: 'В «Стройке» разместите клубнику и подсолнечник на соседних по стороне грядках.',
    breed: 'Откройте клубнику и выберите сбор семян с подсолнечником. Первый опыт гарантирован.',
    explore: 'Выберите следующий опыт или обустройте уголок сада.',
    expand: 'Все виды изучены. Откройте оставшиеся грядки.',
    complete: 'Хранитель острова · сад полностью открыт'
  },
  en: {
    harvest: 'Select a ripe radish and choose Collect fruit.',
    sell: 'Press “Sell” to trade your harvest for coins.',
    saveFor: (name:string, price:number) => `Harvest and sell crops. ${name} costs ${price} ◈.`,
    strawberry: 'In Plant, choose a strawberry seed and an empty bed.',
    sunflower: 'Plant a sunflower beside the strawberry.',
    hybrid: 'In Plant, choose the sunberry seed you discovered.',
    replace: (name:string) => `In Plant, choose ${name} and replace a plant in a bed.`,
    move: 'Use Build to place the strawberry and sunflower in beds that share a side.',
    breed: 'Select the strawberry and collect seeds with a sunflower donor. The first cross is guaranteed.',
    explore: 'Choose another experiment or create a garden corner.',
    expand: 'Every species studied. Open the remaining beds.',
    complete: 'Island Keeper · garden complete'
  }
} as const

export function gardenHint(state:GameState):string {
  const text = hints[state.lang]
  if (!state.sold) return state.basket.length ? text.sell : text.harvest
  if (state.planted.includes('solar_strawberry')) {
    if (state.planted.length < speciesIds.length) return text.explore
    return state.plots.every(plot => plot.open) ? text.complete : text.expand
  }
  const revealed = state.revealed.includes('solar_strawberry')
  const has=(species:string)=>state.plots.some(p=>p.plant?.species===species)
  const seed = revealed ? 'solar_strawberry' : !has('strawberry') ? 'strawberry' :
    !has('sunflower') ? 'sunflower' : null
  if (!seed) {
    return state.plots.some((_,plot) => isRecipeActive(state,plot,solarRecipe))
      ? text.breed : text.move
  }
  const info = speciesInfo[seed]
  const name = state.lang === 'ru' ? info.nameRu : info.nameEn
  if (state.nursery.some(p=>p.species===seed)) return name+' · '+alpha[state.lang].nursery
  if (!state.seeds[seed] && info.seedPrice !== null && state.coins < info.seedPrice) return text.saveFor(name,info.seedPrice)+' (−'+(info.seedPrice-state.coins)+' ◈)'
  if (!state.plots.some(plot => plot.open && !plot.plant)) {
    if (canReplace(state)) return text.replace(name)
    return alpha[state.lang].occupied
  }
  if (seed === 'strawberry') return text.strawberry
  return seed === 'sunflower' ? text.sunflower : text.hybrid
}
