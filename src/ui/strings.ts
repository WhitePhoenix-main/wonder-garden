import type { Lang, Species } from '../game/model'
import { speciesInfo } from '../game/config'

export function plantName(lang: Lang, id: Species): string {
  const plant = speciesInfo[id]
  return lang === 'ru' ? plant.nameRu : plant.nameEn
}

export const words = {
  ru: {
    decorChanged:'Выберите предмет и место заново.', basketLevel:'Уровень корзины уже изменился.', funds:'Недостаточно монет',
    title:'Чудо-сад', subtitle:'ЗЕЛЁНЫЙ ОСТРОВ', coins:'Монеты', basket:'Корзина', sell:'Продать', collection:'Коллекция',
    garden:'Сад', plant:'Посадка', breed:'Селекция', build:'Стройка', goal:'Сейчас в саду',
    plot:'Грядка', closed:'Заросший участок', empty:'Свободная грядка', ready:'Готово к сбору', growing:'Растёт',
    level:'Уровень', selectPlot:'Выберите грядку на острове', chooseSeed:'Выберите семя, затем грядку',
    clear:'Расчистить', upgrade:'Улучшить', move:'Переместить', destination:'Выберите целевую грядку для переноса или обмена.',
    cancel:'Отмена', store:'В питомник', nursery:'Питомник', return:'Вернуть', seeds:'семян', cost:'монет',
    full:'Все грядки заняты. Можно заменить растение с сохранением прежнего в питомнике.',
    locked:'Заменить растение можно после первого открытия или когда все грядки заняты.',
    reset:'Начать заново', confirmReset:'Начать новую игру? Текущий сад будет удалён.',
    center:'Показать остров', zoomIn:'Приблизить', zoomOut:'Отдалить', language:'English',
    harvests:'подходящих сборов',
    revealed:'Рецепт открыт',
    error:'Действие сейчас недоступно', noCoins:'Недостаточно монет', firstSale:'Сначала продайте урожай', notAdjacent:'Участок должен соседствовать с открытой грядкой',
    basketFull:'Корзина полна', noSeeds:'Нет семян', seedLocked:'Семя пока недоступно', occupied:'Грядка занята',
    replacementLocked:'Замена пока недоступна', stalePlant:'Растение изменилось, выберите его снова',
    future:'Сохранение создано новой версией игры. Оно защищено от перезаписи.', damaged:'Сохранение повреждено. Оно защищено от перезаписи до сброса.', recovered:'Восстановлена резервная копия сада.', unavailable:'Сохранение недоступно. Сад работает в памяти браузера.',
    close:'Закрыть', harvest:'Собрать', seedHint:'Сначала посадите клубнику',
    confirmClear:'Расчистить выбранный участок?', confirmUpgrade:'Улучшить выбранную грядку?',
    chooseReturn:'Выберите свободную грядку для растения.', settings:'Настройки',
    replaceHint:'Можно заменить растение, сохранив прежнее в питомнике.',
    all:'Все', base:'Базовые', hybrids:'Гибриды', cycle:'Цикл', sec:'с', aura:'Аура', growth:'Рост', price:'Цена', propagation:'Размножение', allPlants:'все растения', earned:'Получено семя', studied:'Изучено', unknown:'Не изучено', multiply:'Размножение', finished:'Хранитель острова · сад полностью открыт', needBlue:'Сначала посадите чернику', needRecipe:'Откройте первый рецепт',
    confirmOld:'В питомник', confirmNew:'Посадить', seedUnit:'семя'
  },
  en: {
    decorChanged:'Choose the item and spot again.', basketLevel:'The basket level has already changed.', funds:'Not enough coins',
    title:'Wonder Garden', subtitle:'THE GREEN ISLAND', coins:'Coins', basket:'Basket', sell:'Sell', collection:'Collection',
    garden:'Garden', plant:'Plant', breed:'Breeding', build:'Build', goal:'In the garden',
    plot:'Bed', closed:'Overgrown plot', empty:'Empty bed', ready:'Ready to harvest', growing:'Growing',
    level:'Level', selectPlot:'Choose a bed on the island', chooseSeed:'Choose a seed, then a bed',
    clear:'Clear', upgrade:'Upgrade', move:'Move', destination:'Choose a destination to move or swap.',
    cancel:'Cancel', store:'Store plant', nursery:'Nursery', return:'Place', seeds:'seeds', cost:'coins',
    full:'Every bed is occupied. You can replace a plant and keep the previous one in the nursery.',
    locked:'Replacement is available after the first discovery or when all beds are occupied.',
    reset:'Start over', confirmReset:'Start a new game? Your current garden will be deleted.',
    center:'Show island', zoomIn:'Zoom in', zoomOut:'Zoom out', language:'Русский',
    harvests:'matching harvests',
    revealed:'Recipe discovered',
    error:'This action is unavailable', noCoins:'Not enough coins', firstSale:'Sell a harvest first', notAdjacent:'Choose a plot next to an open bed',
    basketFull:'Basket is full', noSeeds:'No seeds available', seedLocked:'Seed is still locked', occupied:'Bed is occupied',
    replacementLocked:'Replacement is unavailable', stalePlant:'The plant changed. Select it again.',
    future:'This save was created by a newer version. It is protected from overwriting.', damaged:'The save is damaged and protected until reset.', recovered:'The backup garden was restored.', unavailable:'Saving is unavailable. Your garden is running in browser memory.',
    close:'Close', harvest:'Harvest', seedHint:'Plant a strawberry first',
    confirmClear:'Clear the selected plot?', confirmUpgrade:'Upgrade the selected bed?',
    chooseReturn:'Choose an empty bed for the plant.', settings:'Settings',
    replaceHint:'You can replace a plant and keep the previous one in the nursery.',
    all:'All', base:'Base', hybrids:'Hybrids', cycle:'Cycle', sec:'s', aura:'Aura', growth:'Growth', price:'Price', propagation:'Propagation', allPlants:'all plants', earned:'Seed received', studied:'Studied', unknown:'Undiscovered', multiply:'Propagation', finished:'Island Keeper · garden complete', needBlue:'Plant a blueberry first', needRecipe:'Discover a recipe first',
    confirmOld:'Move to nursery', confirmNew:'Plant', seedUnit:'seed'
  }
} as const
