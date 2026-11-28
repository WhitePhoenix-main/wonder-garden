import type { GameState } from '../game/model'
import { canReplace, isRecipeActive, recipes, speciesIds, speciesInfo } from '../game'
import { evolution, plotCount } from '../game/config'
import { bridgeIssue } from '../game/evolution'
import { traits } from '../game/genetics'
import { marketQuote } from '../game/market'

import { researchStatus, saleValue, tierProgress } from '../game/queries'
import { extractionYield } from '../game/trade'
import { alpha } from './alpha'

export function recoveryHint(state:GameState) {
  const a=alpha[state.lang], cost=speciesInfo.radish.seedPrice!
  if (state.passive.basket.length || state.passive.seeds.length) return state.lang==='ru'
    ? 'Заберите готовые плоды или семена в теплице.'
    : 'Collect the stored fruit or seeds from the greenhouse.'
  if (state.nursery.length) return a.nursery
  if (state.variants.length || Object.values(state.seeds).some(Boolean)) return a.stock
  if (state.basket.some(b=>extractionYield(b).seeds>0 || extractionYield(b).attempts>0)) return hints[state.lang].inventory
  if (state.coins>=cost) return a.buy
  return state.coins+saleValue(state)>=cost ? a.sell : a.empty
}
const solarRecipe = recipes.find(recipe => recipe.result === 'solar_strawberry')!
const hints = {
  ru: {
    harvest: 'Нажмите на созревший редис, чтобы собрать урожай.',
    inventory: 'Откройте инвентарь и извлеките семена из части урожая.',
    seedPlant: 'Нажмите пустую грядку и посадите полученное семя из запаса.',
    sell: 'Откройте рынок и продайте урожай. Часть плодов можно оставить на семена.',
    cross: 'В инвентаре извлеките семена из опылённого урожая клубники.',
    regrow: 'Клубника растёт снова после сбора, пока у неё остаются жизни.',
    saveFor: (name:string, price:number) => `Собирайте и продавайте урожай. ${name} стоит ${price} ◈.`,
    strawberry: 'Нажмите свободную грядку и выберите клубнику.',
    sunflower: 'Посадите подсолнечник на грядке сбоку от клубники.',
    hybrid: 'Нажмите пустую грядку и выберите семя солнечной клубники.',
    replace: (name:string) => `Освободите грядку и посадите «${name}».`,
    move: 'В карточке растения выберите перемещение и разместите клубнику и подсолнечник на соседних по стороне грядках.',
    breed: 'Соберите клубнику, опылённую подсолнечником.',
    explore: 'Выберите следующий опыт или обустройте уголок сада.',
    expand: 'Все виды изучены. Откройте оставшиеся грядки.',
    complete: 'Зелёный остров освоен. Следующие цели — в журнале.'
  },
  en: {
    harvest: 'Tap a ripe radish to collect its harvest.',
    inventory: 'Open the inventory and extract seeds from some harvest.',
    seedPlant: 'Tap an empty bed and plant a seed from your stock.',
    sell: 'Open the market and sell your harvest. You can keep some fruit for seeds.',
    cross: 'Extract seeds from pollinated strawberries in the inventory.',
    regrow: 'Strawberries regrow after harvest as long as they have lives left.',
    saveFor: (name:string, price:number) => `Harvest and sell crops. ${name} costs ${price} ◈.`,
    strawberry: 'Tap an empty bed and choose a strawberry seed.',
    sunflower: 'Plant a sunflower beside the strawberry.',
    hybrid: 'Tap an empty bed and choose your sunberry seed.',
    replace: (name:string) => `Clear a bed and plant ${name}.`,
    move: 'Choose Move on a plant card and place the strawberry and sunflower in beds that share a side.',
    breed: 'Harvest a strawberry pollinated by a sunflower.',
    explore: 'Choose another experiment or create a garden corner.',
    expand: 'Every species studied. Open the remaining beds.',
    complete: 'Green Island is complete. Find your next goals in the Journal.'
  }
} as const

export function gardenHint(state:GameState):string {
  const text = hints[state.lang]
  if (!state.sold && state.basket.length) return text.sell
  if (!state.firstExtraction && state.basket.some(b=>b.profile && extractionYield(b).seeds>0)) return text.inventory
  if (!state.firstSeedPlanting && (Object.values(state.seeds).some(Boolean) || state.variants.length)) return text.seedPlant
  if (!state.sold) return text.harvest
  if (state.planted.includes('solar_strawberry')) {
    const ru=state.lang==='ru'
    if (!state.helperLevel) return ru?'Наймите Листика для первого автоматического сбора.':'Hire Leafy for your first automatic harvest.'
    if (state.greenhouseLevel<2) return ru?'Улучшите теплицу до II для селекции одного вида.':'Upgrade the greenhouse to II to breed plants of one species.'
    if (!state.crosses.length) return ru?'Поместите два растения одного вида в питомник и начните опыт.':'Store two plants of one species in the nursery and start an experiment.'
    if (state.stallLevel<2) return ru?'Откройте автопродажу в торговой лавке.':'Unlock automatic sales at the stall.'
    if (state.planted.length < speciesIds.length) return text.explore
    if (state.plots.length===plotCount && state.plots.every(p=>p.open)) return ru?'Нажмите на мост, чтобы узнать условия восстановления.':'Tap the bridge to see its restoration requirements.'
    return state.plots.slice(0,plotCount).every(plot => plot.open) ? text.complete : text.expand
  }
  const revealed = state.revealed.includes('solar_strawberry')
  if (!revealed && state.basket.some(b=>b.pollination?.result==='solar_strawberry' && extractionYield(b).attempts>0)) return text.cross
  if (!revealed) {
    const progress=researchStatus(state,'solar_strawberry').progress
    if (!progress.unlocked) return state.lang==='ru'
      ? `Для первого гибрида изучите ${progress.current.species}/${progress.required.species} природных видов и откройте ${progress.current.plots}/${progress.required.plots} грядок. Подробности в альманахе.`
      : `For the first hybrid, study ${progress.current.species}/${progress.required.species} natural species and open ${progress.current.plots}/${progress.required.plots} beds. See the almanac for details.`
  }
  const has=(species:string)=>state.plots.some(p=>p.plant?.lives && p.plant.species===species)
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
    if (state.plots.some(plot=>plot.plant?.lives===0)) return state.lang==='ru'?'Нажмите на погибшее растение, чтобы очистить грядку.':'Tap a withered plant to clear its bed.'
    if (canReplace(state)) return text.replace(name)
    return alpha[state.lang].occupied
  }
  if (seed === 'strawberry') return text.strawberry
  return seed === 'sunflower' ? text.sunflower+' '+text.regrow : text.hybrid
}

export interface TutorialStep {
  id:string
  text:string
  target:'market'|'inventory'|'collection'|'evolution'|'helper'|'none'
  action:boolean
}

export function tutorialStep(state:GameState):TutorialStep|null {
  if (state.tutorialSkipped) return null
  const ru=state.lang==='ru'
  const say=(id:string,condition:boolean,target:TutorialStep['target'],textRu:string,textEn:string,action=true):TutorialStep|null =>
    condition && !state.tutorialSeen.includes(id) ? {id,text:ru?textRu:textEn,target,action} : null
  const solar=researchStatus(state,'solar_strawberry')
  const dead=state.plots.some(p=>p.plant?.lives===0)
  const live=[...state.plots.flatMap(p=>p.plant?.lives ? [p.plant] : []),...state.nursery]
  const profiles=[...live,...state.variants]
  const steps=[
    say('welcome',true,'none','Я Листик! Выращивайте растения, расширяйте сад и открывайте новые виды.','I’m Leafy! Grow plants, expand your garden and discover new species.',false),
    say('first-harvest',!state.firstHarvest,'none','Дождитесь созревания редиса и нажмите на него, чтобы собрать урожай.','Wait for the radish to ripen, then tap it to harvest.'),
    say('cleanup',state.firstHarvest && dead && !state.sold,'none','Редис прожил один сбор. Нажмите на засохшее растение, чтобы освободить грядку.','Radish lasts one harvest. Tap the withered plant to clear its bed.'),
    say('first-sale',state.firstHarvest && !state.sold && state.basket.length>0,'market','Откройте рынок и продайте часть урожая. Остальное пригодится для семян.','Open the market and sell some harvest. Keep some fruit for seeds.'),
    say('extract',state.sold && !state.firstExtraction && state.basket.some(b=>extractionYield(b).seeds>0),'inventory','В инвентаре откройте урожай и извлеките семена.','Open your harvest in the inventory and extract seeds.'),
    say('plant-stock',state.firstExtraction && !state.firstSeedPlanting && (Object.values(state.seeds).some(Boolean)||state.variants.length>0),'none','Нажмите любую пустую грядку и выберите семена из запаса.','Tap any empty bed and choose seeds from your stock.'),
    say('regrowth',state.planted.includes('strawberry'),'none','Клубника плодоносит несколько раз. Каждый сбор тратит жизнь, затем ягоды созревают снова.','Strawberries fruit several times. Each harvest uses a life before the berries regrow.',false),
    say('expansion',state.sold && solar.progress.current.plots<solar.progress.required.plots,'none','Нажмите соседний закрытый участок, чтобы посмотреть стоимость расчистки. Выберите любую подходящую грядку.','Tap an adjacent blocked plot to see its clearing cost. Choose whichever plot suits your garden.'),
    say('research',state.firstSeedPlanting && !state.planted.includes('solar_strawberry') && solar.stage!=='fruit' && solar.stage!=='seed','collection','В альманахе изучите первое скрещивание. Растения-соседи должны касаться сторонами, диагональ не считается.','Study the first cross in the almanac. Plants must share an edge; diagonals do not count.',false),
    say('pollination',solar.stage==='active','collection','Подсолнечник опыляет клубнику. Соберите ягоды именно с клубники.','Sunflowers pollinate strawberries. Collect the berries from the strawberry plant.'),
    say('pollinated-fruit',solar.stage==='fruit','collection','Соберите семена из опылённой партии клубники. В альманахе можно открыть эту партию.','Extract seeds from the pollinated strawberry batch. Open it from the almanac.'),
    say('hybrid-seed',solar.stage==='seed','none','Вы получили семя нового вида. Посадите его на свободной грядке.','You found a new species. Plant its seed in an empty bed.'),
    say('magic-tier',solar.stage==='studied','collection','Солнечная клубника открывает Тир II. У гибридов свои ауры, урожай и роли в следующих опытах.','Sunberry opens Tier II. Hybrids bring their own auras, yields, and roles in later crosses.',false),
    say('storage',state.revealed.length>0,'evolution','В питомнике можно сохранить живое растение. Оно сохраняет геном, жизни и стадию роста.','Store a living plant in the greenhouse nursery to preserve its genome, lives, and growth.',false),
    say('helper',state.helperLevel>0,'helper','Листик собирает урожай и убирает погибшие растения. Оба действия занимают его рабочее время.','Leafy harvests and clears withered plants. Both tasks use his work time.',false),
    say('replant',state.helperLevel>=evolution.helperReplantLevel,'helper','Листик может пересаживать выбранный профиль. Семена защищённых профилей и резервы сохраняются.','Leafy can replant a chosen profile while respecting protected seeds and reserves.',false),
    say('aura',state.planted.includes('sunflower'),'collection','Аура подсолнечника ускоряет ближайшие растения по общей стороне.','Sunflower auras speed up plants that share an edge.',false),
    say('low-price',state.sold && state.planted.some(id=>marketQuote(state,id,'fruit').pricePercent<=85),'market','Цена упала после поставок. Дайте рынку время, продайте другой вид или выполните заказ.','The price fell after deliveries. Let the market recover, sell another species, or fill an order.',false),
    say('order',state.orders.length>0,'market','Сравните фиксированную награду заказа с текущей ценой продажи его товаров.','Compare the fixed order reward with the current sale value of its goods.',false),
    say('greenhouse',state.greenhouseLevel>=2,'evolution','Внутривидовой опыт меняет редкость и гены уже изученного вида. Выберите два живых растения одного вида.','Same-species experiments change rarity and traits. Choose two living plants of the same species.',false),
    say('afk',state.passive.beds.length>0,'evolution','Назначьте семена грядке питомника. Она медленно выращивает урожай и работает между сеансами.','Assign seeds to a nursery bed. It grows crops slowly and can work between sessions.',false),
    say('unfruitful',profiles.some(p=>p.minus==='unfruitful'),'inventory','Малоплодность снижает урожай. У некоторых видов возможен неурожай, который всё равно тратит жизнь.','Unfruitful plants yield less. Some can fail a crop and still use one life.',false),
    say('fruitful',profiles.some(p=>traits(p).includes('fruitful')),'inventory','Плодовитый профиль меняет возможное число плодов. Сравните диапазоны и шансы в карточке.','Fruitful profiles change the possible harvest. Compare ranges and odds on the plant card.',false),
    say('rare',profiles.some(p=>p.rarity==='rare'||p.rarity==='epic'||p.rarity==='legendary'),'inventory','Редкость описывает геном, а тир — вид. Редкий редис всё равно относится к Тиру I.','Rarity describes the genome. Tier describes the species. A rare radish still belongs to Tier I.',false),
    say('guarantee',Object.values(state.failures).some(Boolean)||Object.keys(state.rarityProgress).length>0,'collection','Серия неудач приближает гарантию. Межвидовые рецепты и повышение редкости считают её отдельно.','Failed trials approach a guarantee. Hybrid recipes and rarity upgrades track separate streaks.',false),
    say('clone',state.greenhouseLevel>=3,'evolution','Клонирование сохраняет геном редкого живого экземпляра. Поместите его в хранилище теплицы.','Cloning keeps a rare living plant’s genome. Move it into greenhouse storage.',false),
    say('last-life',live.some(p=>p.lives===1 && (state.protectedPlants.includes(p.id)||p.rarity==='rare'||p.rarity==='epic'||p.rarity==='legendary')),'none','У ценного растения последняя жизнь. Защитите экземпляр или подстрахуйте линию семенем либо клоном.','A valuable plant has one life left. Protect it or secure the line with a seed or a clone.',false),
    say('crystal-tier',tierProgress(state,'crystal_flower').unlocked,'collection','Доступна кристальная ботаника. Сила роста Кристального цветка помогает соседним гибридам.','Crystal botany is available. Crystal Flower helps adjacent hybrids grow.',false),
    say('astral-tier',tierProgress(state,'star_orchid').unlocked,'collection','Доступен Тир IV. Кристальному цветку нужны два разных донора по общей стороне.','Tier IV is available. Crystal Flower needs two distinct donors sharing an edge.',false),
    say('bridge',bridgeIssue(state)===null,'none','Сад готов к восстановлению моста. Нажмите на него, чтобы открыть путь в Долину.','Your garden can restore the bridge. Tap it to open the way to the Valley.',false)
  ]
  return steps.find((step):step is TutorialStep=>step!==null) ?? null
}
