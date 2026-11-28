import type { Lang, Profile, Species } from '../game/model'
import { plant } from '../world/art/plants'
const portraits=new Map<Species,string>()
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
 ru:{common:'Обычный',uncommon:'Необычный',rare:'Редкий',hardy:'Выносливое',early:'Скороспелое',fruitful:'Плодовитое',seedy:'Семенное',fragile:'Хрупкое',slow:'Медлительное',small:'Мелкоплодное',sparse:'Малосемянное',lives:'Жизни',fruits:'Плоды',seeds:'Собрать семена',cross:'Скрестить',stock:'Из запаса',buy:'Купить',speed:'Скорость роста',income:'Доходность',last:'После сбора растение увянет. Собрать плоды?',wilt:'Растение увяло.',miss:'Гибрид не получен.',green:'Открыть питомник',help:'Лопатой можно бесплатно убрать растение в теплицу и вернуть с тем же ростом, жизнями и чертами.',hybrid:'Посадить гибрид'},
 en:{common:'Common',uncommon:'Uncommon',rare:'Rare',hardy:'Hardy',early:'Early',fruitful:'Fruitful',seedy:'Seedy',fragile:'Fragile',slow:'Slow',small:'Small-fruited',sparse:'Sparse seeds',lives:'Lives',fruits:'Fruit',seeds:'Collect seeds',cross:'Cross',stock:'From stock',buy:'Buy',speed:'Growth speed',income:'Earnings',last:'This plant will wither. Collect its fruit?',wilt:'The plant withered.',miss:'No hybrid this time.',green:'Open nursery',help:'Use the shovel to store a plant for free. Return it later with its growth, lives and traits intact.',hybrid:'Plant hybrid'}
}
export function describe(lang:Lang,p:Profile){
  const w=field[lang]
  return [w[p.rarity],p.plus && w[p.plus],p.minus && w[p.minus]].filter(Boolean).join(' · ')
}
