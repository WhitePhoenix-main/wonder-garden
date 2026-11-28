import { common, plantStats, profileAllowed } from '../game/genetics'
import { speciesIds, speciesInfo, valueScale } from '../game/config'
import { extractionYield, harvestSaleValue, seedSaleValue } from '../game/trade'
import type { GameState, Profile, Species } from '../game/model'
import { describe, field, portrait } from './specimens'
import { plantName } from './strings'

export type InventoryTab = 'harvest' | 'seeds'
export type InventorySort = 'species' | 'tier' | 'rarity' | 'value' | 'pollination' | 'quantity'
type InventoryView = {
  tab:InventoryTab
  sort:InventorySort
  amounts:Record<string,number>
  filter:string
  minimum:number
  detail:string|null
}
export const inventoryWords = {
  ru: {
    title:'Инвентарь',harvest:'Урожай',seeds:'Семена',empty:'Пока пусто',sort:'Сортировка',filter:'Фильтр',
    species:'Вид',tier:'Тир',rarity:'Редкость',value:'Цена',pollination:'Опыление',quantity:'Количество',
    minValue:'Цена от',minQuantity:'Количество от',plus:'Увеличить количество',minus:'Уменьшить количество',
    all:'Все',sell:'Продать',extract:'Извлечь семена',plant:'Посадить',unknown:'Происхождение неизвестно',
    pollinated:'Опылено',plain:'Без опыления',potential:'Семян',attempts:'попыток скрещивания',
    single:'Одноразовое',multi:'Многоразовое',growth:'Рост',regrow:'Повторный рост',fruits:'Урожай',lives:'Жизни',
    per:'за единицу',details:'Подробности',parents:'Родители',inactive:'Признак жизней не действует у одноразовых растений.',
    confirmHarvest:'Продать урожай с семенным потенциалом?',confirmSeed:'Продать последние семена этого вида?',
    obtained:'Получено'
  },
  en: {
    title:'Inventory',harvest:'Harvest',seeds:'Seeds',empty:'Nothing here yet',sort:'Sort',filter:'Filter',
    species:'Species',tier:'Tier',rarity:'Rarity',value:'Value',pollination:'Pollination',quantity:'Quantity',
    minValue:'Minimum price',minQuantity:'Minimum quantity',plus:'Increase quantity',minus:'Decrease quantity',
    all:'All',sell:'Sell',extract:'Extract seeds',plant:'Plant',unknown:'Origin unknown',
    pollinated:'Pollinated',plain:'Not pollinated',potential:'Seeds',attempts:'cross attempts',
    single:'Single harvest',multi:'Multi harvest',growth:'Growth',regrow:'Regrowth',fruits:'Yield',lives:'Lives',
    per:'each',details:'Details',parents:'Parents',inactive:'Life traits have no effect on single-harvest plants.',
    confirmHarvest:'Sell harvest that could yield seeds?',confirmSeed:'Sell the last seeds of this species?',
    obtained:'Received'
  }
} as const

const sortFields = ['species','tier','rarity','value','pollination','quantity'] as const
const button = (action:string, label:string, attrs='', disabled=false) =>
  `<button type="button" data-action="${action}" ${attrs} ${disabled?'disabled':''}>${label}</button>`

export function inventoryPanel(s:GameState, {tab, sort, amounts, filter, minimum, detail}:InventoryView) {
  const w=inventoryWords[s.lang]
  const name=(id:Species)=>plantName(s.lang,id)
  const format = new Intl.NumberFormat(s.lang,{maximumFractionDigits:4})
  const amountFor=(key:string,count:number)=>Math.max(1,Math.min(count,amounts[key]??1))
  function controls(key:string,count:number) {
    const amount=amountFor(key,count)
    const attrs=`data-key="${key}" data-max="${count}"`
    return `<div class="inventory-quantity">
      ${button('inventory-minus','−',attrs+` aria-label="${w.minus}"`,amount===1)}
      <span aria-live="polite">${amount} / ${count}</span>
      ${button('inventory-plus','+',attrs+` aria-label="${w.plus}"`,amount===count)}
      ${button('inventory-all',w.all,attrs,amount===count)}
    </div>`
  }
  const details=(key:string, content:string) =>
    button('inventory-detail',w.details,`data-key="${key}" aria-expanded="${detail===key}"`) + (detail===key ? content : '')
  const tabs=(['harvest','seeds'] as const).map(t=>button('inventory-tab',w[t],`data-tab="${t}" aria-pressed="${tab===t}"`)).join('')
  const sortOptions=sortFields.filter(v=>tab==='harvest'||v!=='pollination')
  const options=[
    ['all',w.all], ['value',w.minValue], ['quantity',w.minQuantity],
    ...(tab==='harvest' ? [['pollinated',w.pollinated],['plain',w.plain]] : []),
    ...(['common','uncommon','rare'] as const).map(r=>[r,field[s.lang][r]]),
    ...['1','2','3','4'].map(t=>['tier'+t,w.tier+' '+t]),
    ...speciesIds.filter(id=>s.planted.includes(id)||s.revealed.some(h=>h===id)).map(id=>[id,name(id)])
  ]
  const numeric = filter==='value' || filter==='quantity'
  const tools = `<div class="inventory-tools">
    <label>${w.sort}<select data-inventory-sort>${sortOptions.map(v=>`<option value="${v}" ${sort===v?'selected':''}>${w[v]}</option>`).join('')}</select></label>
    <label>${w.filter}<select data-inventory-filter>${options.map(([v,label])=>`<option value="${v}" ${filter===v?'selected':''}>${label}</option>`).join('')}</select></label>
    ${numeric ? `<label>${filter==='value'?w.minValue:w.minQuantity}<input data-inventory-minimum type="number" min="0" value="${minimum}" inputmode="numeric"></label>` : ''}
  </div>`
  const matches=(species:Species, profile:Profile|null, pollinated:boolean, price:number, count:number)=>
    filter==='all' || filter===species || filter===profile?.rarity || filter==='tier'+(speciesInfo[species].generation+1) ||
    filter==='pollinated'&&pollinated || filter==='plain'&&!pollinated ||
    filter==='value'&&price>=minimum || filter==='quantity'&&count>=minimum
  const rank=(p:Profile|null)=>p?['common','uncommon','rare'].indexOf(p.rarity):-1
  const header=(species:Species)=>`<header>${portrait(species)}<strong>${name(species)} · T${speciesInfo[species].generation+1}</strong></header>`

  let cards:string[]
  if (tab==='harvest') {
    const batches=s.basket.filter(b=>matches(b.species,b.profile,!!b.pollination,b.valueUnits/valueScale,b.count))
    batches.sort((a,b)=>sort==='tier'?speciesInfo[a.species].generation-speciesInfo[b.species].generation:
      sort==='rarity'?rank(b.profile)-rank(a.profile):sort==='value'?b.valueUnits-a.valueUnits:
      sort==='pollination'?Number(!!b.pollination)-Number(!!a.pollination):
      sort==='quantity'?b.count-a.count:name(a.species).localeCompare(name(b.species),s.lang))
    cards=batches.map(batch=>{
      const key=`h${batch.id}`
      const amount=amountFor(key,batch.count)
      const yieldInfo=extractionYield(batch,amount)
      const attrs=`data-id="${batch.id}" data-key="${key}"`
      const parents = batch.pollination ? [batch.pollination.donor,...batch.pollination.supporting] : []
      const origin=batch.profile ? describe(s.lang,batch.profile) : w.unknown
      const pollination=batch.pollination ? w.pollinated+' · '+name(batch.pollination.donor.species) : w.plain
      return `<article class="inventory-card">${header(batch.species)}
        <p>${origin} · ${pollination}</p>
        <p>${format.format(batch.valueUnits/valueScale)} ◈ ${w.per}</p>
        ${controls(key,batch.count)}
        ${batch.profile ? `<p>${w.potential} ${yieldInfo.seeds}${yieldInfo.attempts ? ' · '+yieldInfo.attempts+' '+w.attempts : ''}</p>` : ''}
        <div class="inventory-actions">${button('inventory-sell-h',`${w.sell} · ${harvestSaleValue(batch,amount)} ◈`,attrs)}
          ${batch.profile ? button('inventory-extract',w.extract,attrs,!yieldInfo.seeds&&!yieldInfo.attempts) : ''}
          ${details(key,`<p>${w.parents} · ${name(batch.species)} (${origin})${parents.map(p=>' · '+name(p.species)+' ('+describe(s.lang,p)+')').join('')}</p>`)}
        </div>
      </article>`
    })
  } else {
    const packs=speciesIds.flatMap(species=>[{species,...common,count:s.seeds[species]},...s.variants.filter(v=>v.species===species)])
      .filter(p=>p.count>0 && matches(p.species,p,false,seedSaleValue(p.species,p),p.count))
    packs.sort((a,b)=>sort==='tier'?speciesInfo[a.species].generation-speciesInfo[b.species].generation:
      sort==='rarity'?rank(b)-rank(a):sort==='value'?seedSaleValue(b.species,b)-seedSaleValue(a.species,a):
      sort==='quantity'?b.count-a.count:name(a.species).localeCompare(name(b.species),s.lang))
    cards=packs.map(pack=>{
      const profile={rarity:pack.rarity,plus:pack.plus,minus:pack.minus}
      const key=`s${pack.species}-${pack.rarity}-${pack.plus}-${pack.minus}`
      const amount=amountFor(key,pack.count)
      const single=speciesInfo[pack.species].lifecycle==='single'
      const stats=plantStats(pack.species,profile)
      const attrs=`data-seed="${pack.species}" data-profile='${JSON.stringify(profile)}'`
      const price=seedSaleValue(pack.species,profile)
      return `<article class="inventory-card">${header(pack.species)}
        <p>${describe(s.lang,profile)} · ${single?w.single:w.multi}</p>
        <p>${w.growth} ${format.format(stats.growthSec)} ${s.lang==='ru'?'с':'s'} · ${price} ◈ ${w.per}</p>
        ${controls(key,pack.count)}
        <div class="inventory-actions">${button('inventory-plant',w.plant,attrs)}
          ${button('inventory-sell-s',`${w.sell} · ${price*amount} ◈`,`${attrs} data-key="${key}"`)}
          ${details(key,`<p>${w.fruits} ${stats.fruits.join('–')} · ${w.potential} ${stats.ownSeeds.join('–')} · ${w.lives} ${stats.maxLives}
            ${single?'':' · '+w.regrow+' '+format.format(stats.regrowSec)+' '+(s.lang==='ru'?'с':'s')}</p>
            ${profileAllowed(pack.species,profile)?'':`<p>${w.inactive}</p>`}`)}
        </div>
      </article>`
    })
  }
  return `<h2>${w.title}</h2><div class="book-filters">${tabs}</div>${tools}${cards.join('')||`<p>${w.empty}</p>`}`
}
