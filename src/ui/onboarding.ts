import type { GameState } from '../game/model'
import { canReplace, expansionCost, isRecipeActive, recipes, speciesIds, speciesInfo } from '../game'

const solarRecipe = recipes.find(recipe => recipe.result === 'solar_strawberry')!
const hints = {
  ru: {
    harvest: 'Нажмите на созревший редис, чтобы собрать его.',
    sell: 'Нажмите «Продать», чтобы обменять урожай на монеты.',
    saveFor: (name:string, price:number) => `Собирайте и продавайте урожай. ${name} стоит ${price} ◈.`,
    clearFor: (price:number) => `В «Стройке» расчистите место для посадки · ${price} ◈.`,
    strawberry: 'В «Посадке» выберите клубнику и свободную грядку.',
    sunflower: 'Посадите подсолнечник на грядке сбоку от клубники.',
    hybrid: 'В «Посадке» выберите полученное семя солнечной клубники.',
    replace: (name:string) => `В «Посадке» выберите «${name}» и замените одно из растений.`,
    move: 'В «Стройке» разместите клубнику и подсолнечник на соседних по стороне грядках.',
    breed: (done:number, need:number) => `Собирайте клубнику рядом с подсолнечником · ${done}/${need}.`,
    explore: 'Откройте селекцию и вырастите остальные виды.',
    expand: 'Все виды изучены. Откройте оставшиеся грядки.',
    complete: 'Хранитель острова · сад полностью открыт'
  },
  en: {
    harvest: 'Tap a ripe radish to collect it.',
    sell: 'Press “Sell” to trade your harvest for coins.',
    saveFor: (name:string, price:number) => `Harvest and sell crops. ${name} costs ${price} ◈.`,
    clearFor: (price:number) => `Use Build to clear a bed for planting · ${price} ◈.`,
    strawberry: 'In Plant, choose a strawberry seed and an empty bed.',
    sunflower: 'Plant a sunflower beside the strawberry.',
    hybrid: 'In Plant, choose the sunberry seed you discovered.',
    replace: (name:string) => `In Plant, choose ${name} and replace a plant in a bed.`,
    move: 'Use Build to place the strawberry and sunflower in beds that share a side.',
    breed: (done:number, need:number) => `Harvest the strawberry next to a sunflower · ${done}/${need}.`,
    explore: 'Follow the breeding recipes to grow the remaining species.',
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
  const progress = state.recipeProgress.solar_strawberry
  const seed = !state.planted.includes('strawberry') ? 'strawberry' :
    progress === solarRecipe.harvests ? 'solar_strawberry' :
    !state.planted.includes('sunflower') ? 'sunflower' : null
  if (!seed) {
    return state.plots.some((_,plot) => isRecipeActive(state,plot,solarRecipe))
      ? text.breed(progress,solarRecipe.harvests) : text.move
  }
  const info = speciesInfo[seed]
  const name = state.lang === 'ru' ? info.nameRu : info.nameEn
  if (info.seedPrice !== null && state.coins < info.seedPrice) return text.saveFor(name,info.seedPrice)
  if (!state.plots.some(plot => plot.open && !plot.plant)) {
    if (canReplace(state)) return text.replace(name)
    const cost = expansionCost(state)
    if (cost !== null) return state.coins < cost ? text.saveFor(state.lang === 'ru' ? 'Расчистка' : 'Clearing a bed',cost) : text.clearFor(cost)
  }
  if (seed === 'strawberry') return text.strawberry
  return seed === 'sunflower' ? text.sunflower : text.hybrid
}
