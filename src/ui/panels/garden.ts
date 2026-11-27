import { decorIds, type DecorType, type GameState } from '../../game/model'
import { balance, decorInfo, island } from '../../game/config'
import { decorationAt, harmony } from '../../game/decor'
import { journal } from '../../game/journal'

export type DecorChoice = {newType:DecorType} | {id:number}
export const gardenWords = {
  ru: {
    journal:'Журнал', decor:'Декор', harmony:'Гармония', milestones:'Цели гармонии', empty:'Свободно',
    catalog:'Купить декор', owned:'Купленные предметы', choose:'Выберите предмет и место на острове.',
    buy:'Купить и поставить', place:'Поставить', free:'бесплатно', cancel:'Отменить', store:'Убрать в хранилище',
    saved:'В хранилище', replace:'Прежний предмет отправится в хранилище.', swap:'Предметы поменяются местами.',
    rank:'Ранг', decorLocked:'Посадите первый гибрид, чтобы открыть декор.',
    recovery:'Посадить аварийный редис бесплатно', sound:'Звук', on:'вкл.', off:'выкл.', export:'Экспорт сохранения'
  },
  en: {
    journal:'Journal', decor:'Decor', harmony:'Harmony', milestones:'Harmony goals', empty:'Empty',
    catalog:'Buy decor', owned:'Owned decorations', choose:'Choose a decoration and a spot on the island.',
    buy:'Buy and place', place:'Place', free:'free', cancel:'Cancel', store:'Put in storage',
    saved:'In storage', replace:'The previous decoration goes into storage.', swap:'The decorations will swap places.',
    rank:'Rank', decorLocked:'Plant your first hybrid to unlock decorations.',
    recovery:'Plant a free recovery radish', sound:'Sound', on:'on', off:'off', export:'Export save'
  }
} as const

const chapterNames = {
  ru:['Пробуждение','Первые чудеса','Живой сад','Тайны лунного света','Звезда сада'],
  en:['Awakening','First wonders','A living garden','Moonlight secrets','Garden star']
}
const ranks = {
  ru:['Начинающий','Ботаник','Селекционер','Мастер','Хранитель острова'],
  en:['Beginner','Botanist','Breeder','Master','Island Keeper']
}
const goals = {
  ru:[
    ['Собрать первый урожай','Посадить клубнику','Открыть 5 грядок','Посадить подсолнечник'],
    ['Открыть солнечную клубнику','Восстановить теплицу','Посадить первый гибрид','Получить семя размножением'],
    ['Нанять Листика','Включить автопродажу','Купить декор','Открыть 8 грядок'],
    ['Открыть лунную ягоду','Открыть золотой цветок','Открыть медовый клевер','Открыть кристальный цветок'],
    ['Улучшить грядку до III','Открыть звёздную орхидею','Изучить 12 видов','Открыть 16 грядок']
  ],
  en:[
    ['Collect the first harvest','Plant a strawberry','Open 5 beds','Plant a sunflower'],
    ['Discover Sunberry','Restore the greenhouse','Plant the first hybrid','Propagate a seed'],
    ['Hire Leafy','Enable auto-sell','Buy a decoration','Open 8 beds'],
    ['Discover Moonberry','Discover Golden Flower','Discover Honey Clover','Discover Crystal Flower'],
    ['Upgrade a bed to III','Discover Star Orchid','Study 12 species','Open 16 beds']
  ]
}
export function journalPanel(state:GameState, chapter:number|null):string {
  const w = gardenWords[state.lang]
  const progress = journal(state)
  const first = progress.chapters.findIndex(items => items.some(done => !done))
  const score = harmony(state)
  return `<h2>${w.journal}</h2><p><strong>${w.rank} · ${ranks[state.lang][progress.rank]}</strong></p>
    <p>${w.harmony} · <strong>${score}</strong><br>${w.milestones} ·
    ${balance.harmonyMilestones.map(goal => goal <= score ? `<strong>${goal} ✓</strong>` : goal).join(' / ')}</p>
    ${progress.chapters.map((steps,index) => {
      const expanded = index === (chapter ?? first)
      const completed = steps.filter(Boolean).length
      const tasks = expanded ? `<ul class="journal-tasks">${steps.map((done,i) =>
        `<li>${done ? '✓' : '○'} ${goals[state.lang][index][i]}</li>`).join('')}</ul>` : ''
      return `<button type="button" data-action="chapter" data-id="${index}" aria-expanded="${expanded}">
        ${chapterNames[state.lang][index]} · ${completed}/${steps.length}</button>${tasks}`
    }).join('')}`
}

export function decorPanel(state:GameState, slotId:string|null, choice:DecorChoice|null):string {
  const w = gardenWords[state.lang]
  const name = (id:DecorType) => state.lang === 'ru' ? decorInfo[id].nameRu : decorInfo[id].nameEn
  const occupant = slotId === null ? undefined : decorationAt(state,slotId)
  const item = choice && 'id' in choice ? state.decorations.find(d=>d.id===choice.id) : undefined
  const newType = choice && 'newType' in choice ? choice.newType : null
  const type = newType ?? item?.type
  const confirm = !!type && slotId !== null && (newType !== null || item?.id !== occupant?.id)
  const location = (x:number,y:number) => String.fromCharCode(65+x) + (y+1)
  const slotButtons = island.decorSlots.map(slot => {
    const decor = decorationAt(state,slot.id)
    return `<button type="button" data-action="decor-slot" data-id="${slot.id}" aria-pressed="${slotId === slot.id}">
      ${location(slot.x,slot.y)} · ${decor ? name(decor.type) : w.empty}</button>`
  }).join('')
  const catalog = decorIds.map(id =>
    `<button type="button" data-action="decor-type" data-id="${id}" aria-pressed="${newType===id}">
      ${name(id)} · ${decorInfo[id].cost} ◈</button>`).join('')
  const inventory = state.decorations.map(d => {
    const slot = island.decorSlots.find(s=>s.id===d.slot)
    return `<button type="button" data-action="decor-item" data-id="${d.id}" aria-pressed="${item?.id===d.id}">
      ${name(d.type)} #${d.id} · ${slot ? location(slot.x,slot.y) : w.saved}</button>`
  }).join('')
  const purchase = newType ? decorInfo[newType].cost : 0
  return `<h2>${w.decor}</h2><p>${w.choose}</p>
    <div class="decor-slots">${slotButtons}</div>
    ${confirm && type ? `<div class="hint" data-decor-preview>
      <strong>${name(type)}</strong>
      ${occupant ? `<p>${item?.slot ? w.swap : w.replace}</p>` : ''}
      <button type="button" class="primary" data-action="confirm-decor" data-occupant="${occupant?.id ?? ''}"
        ${state.coins < purchase ? 'disabled' : ''}>${newType ? w.buy : w.place} · ${purchase ? purchase + ' ◈' : w.free}</button>
      <button type="button" data-action="cancel-decor">${w.cancel}</button></div>` : ''}
    ${occupant && !confirm ? `<button type="button" data-action="store-decor" data-id="${occupant.id}">${w.store}</button>` : ''}
    <h3>${w.catalog}</h3><div class="decor-slots">${catalog}</div>
    ${inventory ? `<h3>${w.owned}</h3>${inventory}` : ''}`
}
