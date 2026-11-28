import type { GameState } from '../game/model'
import { canReplace, isRecipeActive, recipes, speciesIds, speciesInfo } from '../game'
import { evolution, plotCount } from '../game/config'
import { bridgeIssue } from '../game/evolution'
import { traits } from '../game/genetics'
import { marketQuote } from '../game/market'

import { reactionHasSymbiosis, researchStatus, saleValue, tierProgress } from '../game/queries'
import { extractionYield } from '../game/trade'
import { alpha } from './alpha'

export const guideChapters = {
  ru: [
    ['Основы садоводства', 'Выберите пустую грядку и семя. Дождитесь созревания и соберите урожай. Последний сбор расходует запас, после него уберите засохшее растение.'],
    ['Экономика', 'На рынке видно цену плодов. Из части урожая в инвентаре можно извлечь семена для посадки или продажи. Открывайте соседние участки по мере заработка.'],
    ['Первый гибрид', 'Для тира II изучите четыре природных вида и откройте шесть грядок. Посадите клубнику и подсолнечник по общей стороне. Соберите клубнику, извлеките семя и посадите новый вид.'],
    ['Листик', 'После первой продажи наймите Листика. Он собирает урожай, со II уровня убирает остатки, с III пересаживает разрешённые семена. В карточке грядки выберите режим, а в инвентаре задайте резерв и защиту.'],
    ['Генетика', 'Редкость относится к экземпляру, тир — к виду. Признаки меняют свойства растения и могут наследоваться. Поместите два живых растения одного вида в теплицу для платного опыта.'],
    ['Питомник', 'Назначьте изученное семя производственной грядке. Питомник расходует семена и останавливается при исчерпании запаса или заполнении склада. Отчёт покажет результаты после возвращения.'],
    ['Продвинутая селекция', 'Альманах хранит реакции и подсказки. При нескольких направлениях выберите резонанс у матери. В карточке можно выбрать доноров. Неудачи повышают шанс до гарантии для выбранного вида.']
  ],
  en: [
    ['Garden basics', 'Choose an empty bed and a seed. Wait for ripening and harvest. The final harvest uses the remaining capacity, then clear the withered plant.'],
    ['Economy', 'See fruit prices at the market. Extract seeds from part of a harvest in inventory for planting or sale. Open neighboring beds as you earn.'],
    ['First hybrid', 'For Tier II, study four natural species and open six beds. Place strawberry and sunflower across a shared edge. Harvest the strawberry, extract its seed and plant the new species.'],
    ['Leafy', 'Hire Leafy after your first sale. Leafy harvests, clears withered plants from level II, and replants available seeds from level III. Set a bed mode on its card and seed protection and reserves in inventory.'],
    ['Genetics', 'Rarity belongs to a specimen and tier to a species. Traits change plant properties and can be inherited. Store two living plants of one species in the greenhouse for a paid experiment.'],
    ['Nursery', 'Assign a studied seed to a production bed. The nursery consumes seeds and stops when stock or storage runs out. The return report shows the results.'],
    ['Advanced breeding', 'The almanac records reactions and clues. When directions conflict, choose a resonance on the mother plant. Choose donors on its card. Failures raise the chance to a guarantee for the target species.']
  ]
} as const

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
    regrow: 'Клубника растёт снова после сбора, пока у неё остаются сборы.',
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
    regrow: 'Strawberries regrow after harvest while harvests remain.',
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
    say('first-plant',!state.firstHarvest && !state.plots.some(p=>p.plant) && (state.seeds.radish>0 || state.variants.some(p=>p.species==='radish')),'none','Нажмите свободную грядку и посадите семя редиса из запаса.','Tap an empty bed and plant a radish seed from your stock.'),
    say('first-harvest',state.plots.some(p=>p.plant) && !state.firstHarvest,'none','Дождитесь созревания редиса и нажмите на него, чтобы собрать урожай.','Wait for the radish to ripen, then tap it to harvest.'),
    say('cleanup',state.firstHarvest && dead && !state.sold,'none','У редиса запас — один сбор. Он засох после урожая. Нажмите на растение, чтобы освободить грядку.','Radish has a capacity of one harvest and has withered. Tap it to clear the bed.'),
    say('first-sale',state.firstHarvest && !state.sold && state.basket.length>0,'market','Откройте рынок и продайте часть урожая. Остальное пригодится для семян.','Open the market and sell some harvest. Keep some fruit for seeds.'),
    say('second-plant',state.sold && !state.firstExtraction && !state.basket.length && !state.plots.some(p=>p.plant?.lives) && (state.seeds.radish>0 || state.variants.some(p=>p.species==='radish')),'none','Посадите оставшееся семя редиса. Из следующего урожая можно получить новые семена.','Plant your remaining radish seed. The next harvest can provide new seeds.'),
    say('second-harvest',state.sold && !state.firstExtraction && !state.basket.length && state.plots.some(p=>p.plant?.lives),'none','Дождитесь созревания и соберите урожай для получения семян.','Wait for the crop to ripen and harvest it for seeds.'),
    say('extract',state.sold && !state.firstExtraction && state.basket.some(b=>extractionYield(b).seeds>0),'inventory','Плоды можно продать или переработать в семена. Семена можно посадить или продать.','Open your harvest in the inventory and extract seeds.'),
    say('plant-stock',state.firstExtraction && !state.firstSeedPlanting && (Object.values(state.seeds).some(Boolean)||state.variants.length>0),'none','Нажмите любую пустую грядку и выберите семена из запаса.','Tap any empty bed and choose seeds from your stock.'),
    say('regrowth',state.planted.includes('strawberry'),'none','Клубника плодоносит несколько раз. Каждый сбор расходует один цикл, затем ягоды созревают снова.','Strawberries fruit several times. Each harvest uses one cycle before the berries regrow.',false),
    say('expansion',state.sold && solar.progress.current.plots<solar.progress.required.plots,'none','Нажмите соседний закрытый участок, чтобы посмотреть стоимость расчистки. Выберите любую подходящую грядку.','Tap an adjacent blocked plot to see its clearing cost. Choose whichever plot suits your garden.'),
    say('research',state.firstSeedPlanting && !state.planted.includes('solar_strawberry') && solar.stage!=='fruit' && solar.stage!=='seed','collection','В альманахе изучите первое скрещивание. Растения-соседи должны касаться сторонами, диагональ не считается.','Study the first cross in the almanac. Plants must share an edge; diagonals do not count.',false),
    say('pollination',solar.stage==='active','collection','Подсолнечник опыляет клубнику. Когда она созреет, соберите ягоды с неё. Если растение не видно, откройте альманах.','Sunflowers pollinate strawberries. Harvest the strawberry when ripe. If it is out of view, open the almanac.'),
    say('pollinated-fruit',solar.stage==='fruit','collection','Соберите семена из опылённой партии клубники. В альманахе можно открыть эту партию.','Extract seeds from the pollinated strawberry batch. Open it from the almanac.'),
    say('hybrid-seed',solar.stage==='seed','none','Вы получили семя нового вида. Посадите его на свободной грядке.','You found a new species. Plant its seed in an empty bed.'),
    say('magic-tier',solar.stage==='studied','collection','Солнечная клубника открывает Тир II. У гибридов свои ауры, урожай и роли в следующих опытах.','Sunberry opens Tier II. Hybrids bring their own auras, yields, and roles in later crosses.',false),
    say('storage',state.revealed.length>0,'evolution','В питомнике можно сохранить живое растение. Оно сохраняет геном, запас сборов и стадию роста.','Store a living plant in the greenhouse nursery to preserve its genome, remaining harvests, and growth.',false),
    say('helper',state.helperLevel>0,'helper','Листик собирает урожай. Со II уровня он также убирает засохшие растения.','Leafy harvests crops. At level II he also clears withered plants.',false),
    say('replant',state.helperLevel>=evolution.helperReplantLevel,'helper','Листик может пересаживать выбранный профиль. Семена защищённых профилей и резервы сохраняются.','Leafy can replant a chosen profile while respecting protected seeds and reserves.',false),
    say('advanced-research',Object.values(state.research.combinations).some(reaction=>reaction==='resonance'),'collection','Резонанс подсказывает совместимость. Если направлений несколько, выберите цель в карточке матери.','Resonance reveals compatibility. When several directions are available, choose one on the mother plant.',false),
    say('donor-choice',state.plots.some(plot=>Object.keys(plot.plant?.researchDonors??{}).length>0),'none','Выбранный донор передаёт признаки при следующем опылении. Уже опылённый урожай хранит прежних родителей.','The selected donor contributes traits at the next pollination. An existing pollinated harvest keeps its original parents.',false),
    say('nursery-storage',state.passive.beds.some(bed=>bed.assignment!==null),'evolution','Питомник расходует семена и хранит урожай в пределах вместимости.','The nursery consumes seeds and stores harvests up to its capacity.',false),
    say('plot-cleared',state.plots.slice(0,plotCount).filter(p=>p.open).length>4,'none','Расчищенная грядка расширяет сад. Выбирайте, что выращивать на новом месте.','A cleared bed expands your garden. Choose what to grow there.',false),
    say('bed-upgraded',state.plots.some(p=>p.open && p.level>1),'none','Улучшенная грядка ускоряет рост и позволяет выращивать более сложные гибриды.','An upgraded bed speeds growth and supports more advanced hybrids.',false),
    say('symbiosis',Object.keys(state.research.combinations).some(reactionHasSymbiosis),'collection','Соседние растения могут помогать друг другу своими аурами. Посмотрите сочетания в журнале совместимости.','Neighboring plants can help each other with auras. Check combinations in the compatibility journal.',false),
    say('uncommon',profiles.some(p=>p.rarity==='uncommon'),'inventory','Необычная редкость относится к экземпляру, а не к ботаническому тиру вида.','Uncommon rarity belongs to a specimen, while botanical tier belongs to the species.',false),
    say('assignment',state.helperLevel>0 && state.plots.some(p=>p.policy && p.policy.mode!=='manual'),'helper','Назначенная грядка следует выбранному режиму. Листик учитывает защиту и резервы семян.','An assigned bed follows its selected mode. Leafy respects protection and seed reserves.',false),
    say('repeat-harvest',live.some(p=>p.lives>0 && p.lives<p.maxLives),'none','После сбора многоразовое растение снова растёт. Каждый сбор расходует один из оставшихся циклов.','After harvest, a multi-harvest plant grows again. Each harvest consumes one remaining cycle.',false),
    say('aura',state.planted.includes('sunflower'),'collection','Аура подсолнечника ускоряет ближайшие растения по общей стороне.','Sunflower auras speed up plants that share an edge.',false),
    say('low-price',state.sold && state.planted.some(id=>marketQuote(state,id,'fruit').pricePercent<=85),'market','Цена упала после поставок. Дайте рынку время, продайте другой вид или выполните заказ.','The price fell after deliveries. Let the market recover, sell another species, or fill an order.',false),
    say('order',state.orders.length>0,'market','Сравните фиксированную награду заказа с текущей ценой продажи его товаров.','Compare the fixed order reward with the current sale value of its goods.',false),
    say('greenhouse',state.greenhouseLevel>=2,'evolution','Внутривидовой опыт меняет редкость и гены уже изученного вида. Выберите два живых растения одного вида.','Same-species experiments change rarity and traits. Choose two living plants of the same species.',false),
    say('afk',state.passive.beds.length>0,'evolution','Назначьте семена грядке питомника. Она медленно выращивает урожай и работает между сеансами.','Assign seeds to a nursery bed. It grows crops slowly and can work between sessions.',false),
    say('unfruitful',profiles.some(p=>p.minus==='unfruitful'),'inventory','Малоплодность снижает урожай. У некоторых видов возможен неурожай, который всё равно расходует один сбор.','Unfruitful plants yield less. Some can fail a crop and still use one harvest.',false),
    say('fruitful',profiles.some(p=>traits(p).includes('fruitful')),'inventory','Плодовитый профиль меняет возможное число плодов. Сравните диапазоны и шансы в карточке.','Fruitful profiles change the possible harvest. Compare ranges and odds on the plant card.',false),
    say('rare',profiles.some(p=>p.rarity==='rare'||p.rarity==='epic'||p.rarity==='legendary'),'inventory','Редкость описывает геном, а тир — вид. Редкий редис всё равно относится к Тиру I.','Rarity describes the genome. Tier describes the species. A rare radish still belongs to Tier I.',false),
    say('guarantee',Object.values(state.failures).some(Boolean)||Object.keys(state.rarityProgress).length>0,'collection','Серия неудач приближает гарантию. Межвидовые рецепты и повышение редкости считают её отдельно.','Failed trials approach a guarantee. Hybrid recipes and rarity upgrades track separate streaks.',false),
    say('clone',state.greenhouseLevel>=3,'evolution','Клонирование сохраняет геном редкого живого экземпляра. Поместите его в хранилище теплицы.','Cloning keeps a rare living plant’s genome. Move it into greenhouse storage.',false),
    say('last-life',live.some(p=>p.lives===1 && (state.protectedPlants.includes(p.id)||p.rarity==='rare'||p.rarity==='epic'||p.rarity==='legendary')),'none','У ценного растения последний сбор. Защитите экземпляр или подстрахуйте линию семенем либо клоном.','A valuable plant has one harvest remaining. Protect it or secure the line with a seed or a clone.',false),
    say('crystal-tier',tierProgress(state,'crystal_flower').unlocked,'collection','Доступна кристальная ботаника. Сила роста Кристального цветка помогает соседним гибридам.','Crystal botany is available. Crystal Flower helps adjacent hybrids grow.',false),
    say('astral-tier',tierProgress(state,'star_orchid').unlocked,'collection','Доступен Тир IV. Кристальному цветку нужны два разных донора по общей стороне.','Tier IV is available. Crystal Flower needs two distinct donors sharing an edge.',false),
    say('bridge',bridgeIssue(state)===null,'none','Сад готов к восстановлению моста. Нажмите на него, чтобы открыть путь в Долину.','Your garden can restore the bridge. Tap it to open the way to the Valley.',false)
  ]
  return steps.find((step):step is TutorialStep=>step!==null) ?? null
}
