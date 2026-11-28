import type { Lang, Profile, Species } from '../game/model'
import { plant } from '../world/art/plants'
const portraits=new Map<Species,string>()
export const plantDescriptions:Record<Species,[string,string]>={
  radish:['Быстро созревает, даёт раннюю выручку и запас семян.','Ripens quickly and provides early coins and seed stock.'],
  strawberry:['Плодоносит повторно. Соседний подсолнечник или лунный цветок открывает один из двух гибридов.','Fruits repeatedly. A sunflower or moonflower neighbor unlocks one of two hybrids.'],
  blueberry:['Даёт несколько урожаев. В соседстве с лунным цветком опыляется для золотого цветка.','Produces several harvests. A moonflower neighbor can pollinate it for Golden Flower seeds.'],
  sunflower:['Даёт один урожай и ускоряет рост соседних растений.','Produces one harvest and speeds up neighboring plants.'],
  clover:['Повышает ценность урожая соседей. Подсолнечник опыляет его для медового клевера.','Raises the value of nearby fruit. A sunflower can pollinate it for Honey Clover.'],
  moonflower:['Многоразовое растение. Участвует в получении лунной ягоды и золотого цветка.','Regrows and serves as a parent for Moonberry and Golden Flower.'],
  solar_strawberry:['Первый доступный гибрид. Передаёт профиль в рецепте звёздной орхидеи.','The first accessible hybrid. Passes on its profile in the Star Orchid recipe.'],
  moonberry:['Плодоносит повторно. В паре с золотым цветком даёт шанс получить кристальный цветок.','Fruits repeatedly. Next to Golden Flower, it can yield Crystal Flower seeds.'],
  honey_clover:['Помогает соседним гибридам копировать профиль. Нужен для опыления орхидеи.','Helps neighboring hybrids copy their profile. Required to pollinate Star Orchid.'],
  golden_flower:['Даёт один ценный урожай и увеличивает цену плодов редиса, клубники и черники рядом.','Produces one valuable harvest and improves nearby radish, strawberry and blueberry fruit prices.'],
  crystal_flower:['Ускоряет соседние гибриды. Материнское растение звёздной орхидеи.','Speeds up neighboring hybrids. The mother plant for Star Orchid.'],
  star_orchid:['Многоразовый гибрид IV тира с ценным урожаем и собственными селекционными линиями.','A Tier IV hybrid with repeated high-value harvests and its own breeding lines.']
}
export function portrait(id:Species){
  if(typeof document==='undefined')return ''
  if(!portraits.has(id)){
    const c=document.createElement('canvas')
    c.width=110;c.height=110
    const ctx=c.getContext('2d')!
    ctx.translate(55,102);plant(ctx,id,true)
    portraits.set(id,c.toDataURL())
  }
  return '<img width="68" height="68" alt="" src="'+portraits.get(id)+'">'
}
export const field={
 ru:{common:'Обычный',uncommon:'Необычный',rare:'Редкий',epic:'Эпический',legendary:'Легендарный',quality:'Высокое качество',stable:'Стабильное',aura:'Усиленная аура',hardy:'Выносливое',early:'Скороспелое',fruitful:'Плодовитое',seedy:'Семенное',fragile:'Хрупкое',slow:'Медлительное',small:'Мелкоплодное',sparse:'Малосемянное',lives:'Жизни',fruits:'Плоды',seeds:'Собрать семена',cross:'Скрестить',stock:'Из запаса',buy:'Купить',speed:'Скорость роста',income:'Доходность',last:'После сбора растение увянет. Собрать плоды?',wilt:'Растение увяло.',miss:'Гибрид не получен.',green:'Открыть питомник',help:'Лопатой можно бесплатно убрать растение в теплицу и вернуть с тем же ростом, жизнями и чертами.',hybrid:'Посадить гибрид'},
 en:{common:'Common',uncommon:'Uncommon',rare:'Rare',epic:'Epic',legendary:'Legendary',quality:'Quality',stable:'Stable',aura:'Strong aura',hardy:'Hardy',early:'Early',fruitful:'Fruitful',seedy:'Seedy',fragile:'Fragile',slow:'Slow',small:'Small-fruited',sparse:'Sparse seeds',lives:'Lives',fruits:'Fruit',seeds:'Collect seeds',cross:'Cross',stock:'From stock',buy:'Buy',speed:'Growth speed',income:'Earnings',last:'This plant will wither. Collect its fruit?',wilt:'The plant withered.',miss:'No hybrid this time.',green:'Open nursery',help:'Use the shovel to store a plant for free. Return it later with its growth, lives and traits intact.',hybrid:'Plant hybrid'}
}
export function describe(lang:Lang,p:Profile){
  const w=field[lang]
  const plus = Array.isArray(p.plus) ? p.plus : p.plus ? [p.plus] : []
  const labels = w as Record<string,string>
  return [labels[p.rarity],...plus.map(trait => labels[trait]),p.minus && labels[p.minus]].filter(Boolean).join(' · ')
}
