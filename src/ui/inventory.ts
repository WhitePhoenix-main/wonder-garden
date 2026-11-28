import { availableStock, protectedProfile, profileKey } from '../game/evolution'
import { common, plantStats, profileAllowed } from '../game/genetics'
import { speciesIds, speciesInfo } from '../game/config'
import { marketQuote } from '../game/market'
import { harvestUnitValue } from '../game/pricing'
import { marketWords } from './panels/market'
import { extractionYield, harvestSaleValue, readyFruitSaleValue, seedSaleValue } from '../game/trade'
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
  selected:string[]
  favoriteOnly:boolean
  search:string
  page:number
}
export const inventoryWords = {
  ru: {
    title:'Инвентарь',harvest:'Урожай',seeds:'Семена',empty:'Пока пусто',sort:'Сортировка',filter:'Фильтр',
    species:'Вид',tier:'Тир',rarity:'Редкость',value:'Цена',pollination:'Опыление',quantity:'Количество',
    minValue:'Цена от',minQuantity:'Количество от',plus:'Увеличить количество',minus:'Уменьшить количество',
    all:'Все',sell:'Продать',extract:'Извлечь семена',plant:'Посадить',unknown:'Происхождение неизвестно',
    pollinated:'Опылено',plain:'Без опыления',potential:'Семян',attempts:'попыток скрещивания',
    single:'Одноразовое',multi:'Многоразовое',growth:'Рост',regrow:'Повторный рост',fruits:'Урожай',lives:'Запас сборов',
    per:'за единицу',details:'Подробности',parents:'Родители',inactive:'Признак запаса сборов не действует у одноразовых растений.',
    confirmHarvest:'Продать урожай с семенным потенциалом?',confirmSeed:'Продать последние семена этого вида?',
    obtained:'Получено'
  },
  en: {
    title:'Inventory',harvest:'Harvest',seeds:'Seeds',empty:'Nothing here yet',sort:'Sort',filter:'Filter',
    species:'Species',tier:'Tier',rarity:'Rarity',value:'Value',pollination:'Pollination',quantity:'Quantity',
    minValue:'Minimum price',minQuantity:'Minimum quantity',plus:'Increase quantity',minus:'Decrease quantity',
    all:'All',sell:'Sell',extract:'Extract seeds',plant:'Plant',unknown:'Origin unknown',
    pollinated:'Pollinated',plain:'Not pollinated',potential:'Seeds',attempts:'cross attempts',
    single:'Single harvest',multi:'Multi harvest',growth:'Growth',regrow:'Regrowth',fruits:'Yield',lives:'Harvest capacity',
    per:'each',details:'Details',parents:'Parents',inactive:'Harvest capacity traits have no effect on single-harvest plants.',
    confirmHarvest:'Sell harvest that could yield seeds?',confirmSeed:'Sell the last seeds of this species?',
    obtained:'Received'
  }
} as const

const sortFields = ['species','tier','rarity','value','pollination','quantity'] as const
const button = (action:string, label:string, attrs='', disabled=false) =>
  `<button type="button" data-action="${action}" ${attrs} ${disabled?'disabled':''}>${label}</button>`

export function inventoryPanel(s:GameState, {tab, sort, amounts, filter, minimum, detail, selected, favoriteOnly, search, page}:InventoryView) {
  const w=inventoryWords[s.lang]
  const name=(id:Species)=>plantName(s.lang,id)
  const format = new Intl.NumberFormat(s.lang,{maximumFractionDigits:4})
  const amountFor=(key:string,count:number)=>Math.max(1,Math.min(count,amounts[key]??1))
  function controls(key:string,count:number) {
    const amount=amountFor(key,count)
    const attrs=`data-key="${key}" data-max="${count}"`
    return `<div class="inventory-quantity">
      ${button('inventory-minus','−',attrs+` aria-label="${w.minus}"`,amount===1)}
      <label><span class="sr-only">${s.lang==='ru'?'Количество':'Quantity'}</span><input type="number" inputmode="numeric" min="1" max="${count}" value="${amount}" data-inventory-amount data-key="${key}"></label><span aria-live="polite"> / ${count}</span>
      ${button('inventory-plus','+',attrs+` aria-label="${w.plus}"`,amount===count)}
      ${button('inventory-all',w.all,attrs,amount===count)}
    </div>`
  }
  const details=(key:string, content:string) =>
    button('inventory-detail',w.details,`data-key="${key}" aria-expanded="${detail===key}"`) + (detail===key ? content : '')
  const tabs=(['harvest','seeds'] as const).map(t=>button('inventory-tab',w[t],`data-tab="${t}" aria-pressed="${tab===t}"`)).join('')
  const bulkLabels=s.lang==='ru' ? {select:'Выбрать',sell:'Продать выбранное',extract:'Извлечь выбранное',favorite:'Избранное',compare:'Сравнение'} :
    {select:'Select',sell:'Sell selected',extract:'Extract selected',favorite:'Favorites',compare:'Comparison'}
  const sortOptions=sortFields.filter(v=>tab==='harvest'||v!=='pollination')
  const options=[
    ['all',w.all], ['value',w.minValue], ['quantity',w.minQuantity],
    ...(tab==='harvest' ? [['pollinated',w.pollinated],['plain',w.plain]] : []),
    ...(['common','uncommon','rare','epic','legendary'] as const).map(r=>[r,field[s.lang][r]]),
    ...(['hardy','early','fruitful','seedy','quality','stable','aura','fragile','slow','small','sparse'] as const).map(t=>[t,field[s.lang][t]]),
    ...['1','2','3','4'].map(t=>['tier'+t,w.tier+' '+t]),
    ...speciesIds.filter(id=>s.planted.includes(id)||s.revealed.some(h=>h===id)).map(id=>[id,name(id)])
  ]
  const numeric = filter==='value' || filter==='quantity'
  const safeSearch=search.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
  const tools = `<div class="inventory-tools">
    <label>${s.lang==='ru'?'Поиск':'Search'}<input data-inventory-search type="search" value="${safeSearch}"></label>
    <label>${w.sort}<select data-inventory-sort>${sortOptions.map(v=>`<option value="${v}" ${sort===v?'selected':''}>${w[v]}</option>`).join('')}</select></label>
    <label>${w.filter}<select data-inventory-filter>${options.map(([v,label])=>`<option value="${v}" ${filter===v?'selected':''}>${label}</option>`).join('')}</select></label>
    ${numeric ? `<label>${filter==='value'?w.minValue:w.minQuantity}<input data-inventory-minimum type="number" min="0" value="${minimum}" inputmode="numeric"></label>` : ''}
  </div>`
  const matches=(species:Species, profile:Profile|null, pollinated:boolean, price:number, count:number)=>
    (!search.trim() || (name(species)+' '+(profile?describe(s.lang,profile):'')).toLocaleLowerCase(s.lang).includes(search.trim().toLocaleLowerCase(s.lang))) &&
    (filter==='all' || filter===species || filter===profile?.rarity || (profile && (Array.isArray(profile.plus) ? profile.plus.includes(filter as never) : profile.plus===filter)) || filter===profile?.minus || filter==='tier'+(speciesInfo[species].generation+1) ||
    filter==='pollinated'&&pollinated || filter==='plain'&&!pollinated ||
    filter==='value'&&price>=minimum || filter==='quantity'&&count>=minimum)
  const rank=(p:Profile|null)=>p?['common','uncommon','rare','epic','legendary'].indexOf(p.rarity):-1
  const header=(species:Species)=>`<header>${portrait(species)}<strong>${name(species)} · T${speciesInfo[species].generation+1}</strong></header>`
  let pageNav=''
  function currentPage<T>(items:T[]):T[] {
    const pageSize=12
    const pages=Math.ceil(items.length/pageSize)
    if (pages<=1) return items
    const index=Math.max(0,Math.min(page,pages-1))
    pageNav=`<div class="book-filters" aria-label="${s.lang==='ru'?'Страницы инвентаря':'Inventory pages'}">
      ${button('inventory-page','‹',`data-page="${index-1}" aria-label="${s.lang==='ru'?'Предыдущая страница':'Previous page'}"`,index===0)}
      <span>${index+1} / ${pages}</span>
      ${button('inventory-page','›',`data-page="${index+1}" aria-label="${s.lang==='ru'?'Следующая страница':'Next page'}"`,index===pages-1)}</div>`
    return items.slice(index*pageSize,(index+1)*pageSize)
  }

  let cards:string[]
  if (tab==='harvest') {
    const batches=s.basket.filter(b=>matches(b.species,b.profile,!!b.pollination,harvestUnitValue(b,s),b.count))
    batches.sort((a,b)=>sort==='tier'?speciesInfo[a.species].generation-speciesInfo[b.species].generation:
      sort==='rarity'?rank(b.profile)-rank(a.profile):sort==='value'?harvestUnitValue(b,s)-harvestUnitValue(a,s):
      sort==='pollination'?Number(!!b.pollination)-Number(!!a.pollination):
      sort==='quantity'?b.count-a.count:name(a.species).localeCompare(name(b.species),s.lang))
    cards=currentPage(batches).map(batch=>{
      const key=`h${batch.id}`
      const amount=amountFor(key,batch.count)
      const yieldInfo=extractionYield(batch,amount)
      const attrs=`data-id="${batch.id}" data-key="${key}"`
      const parents = batch.pollination ? [batch.pollination.donor,...batch.pollination.supporting] : []
      const origin=batch.profile ? describe(s.lang,batch.profile) : w.unknown
      const pollination=batch.pollination ? w.pollinated+' · '+name(batch.pollination.donor.species) : w.plain
      const locked=batch.profile && protectedProfile(s,batch.species,batch.profile)
      const protection=batch.profile && (locked || detail===key) ? button('profile-protect',
        locked ? (s.lang==='ru'?'Снять защиту профиля':'Unprotect profile') : (s.lang==='ru'?'Защитить профиль':'Protect profile'),
        `data-seed="${batch.species}" data-profile='${JSON.stringify(batch.profile)}'`) : ''
      return `<article class="inventory-card">${header(batch.species)}
        ${button('inventory-select',bulkLabels.select,`data-key="${key}" aria-pressed="${selected.includes(key)}"`)}
        <p>${origin} · ${pollination}</p>
        <p>${format.format(harvestUnitValue(batch,s))} ◈ ${w.per} · ${marketWords[s.lang].title} ${marketQuote(s,batch.species,'fruit').pricePercent}%</p>
        ${controls(key,batch.count)}
        ${batch.profile ? `<p>${w.potential} ${yieldInfo.seeds}${yieldInfo.attempts ? ' · '+yieldInfo.attempts+' '+w.attempts : ''}</p>` : ''}
        <div class="inventory-actions">${button('inventory-sell-h',`${w.sell} · ${harvestSaleValue(batch,amount,s)} ◈`,attrs)}
          ${batch.profile ? button('inventory-extract',w.extract,attrs,!yieldInfo.seeds&&!yieldInfo.attempts) : ''}
          ${protection}
          ${details(key,`<p>${w.parents} · ${name(batch.species)} (${origin})${parents.map(p=>' · '+name(p.species)+' ('+describe(s.lang,p)+')').join('')}</p>`)}
        </div>
      </article>`
    })
  } else {
    const packs=speciesIds.flatMap(species=>[{species,...common,count:s.seeds[species]},...s.variants.filter(v=>v.species===species)])
      .filter(p=>p.count>0 && matches(p.species,p,false,seedSaleValue(p.species,p,s),p.count) &&
        (!favoriteOnly || s.favorites.includes(profileKey(p.species,p))))
    packs.sort((a,b)=>sort==='tier'?speciesInfo[a.species].generation-speciesInfo[b.species].generation:
      sort==='rarity'?rank(b)-rank(a):sort==='value'?seedSaleValue(b.species,b,s)-seedSaleValue(a.species,a,s):
      sort==='quantity'?b.count-a.count:name(a.species).localeCompare(name(b.species),s.lang))
    cards=currentPage(packs).map(pack=>{
      const profile={rarity:pack.rarity,plus:pack.plus,minus:pack.minus}
      const key=`s${pack.species}-${pack.rarity}-${pack.plus}-${pack.minus}`
      const amount=amountFor(key,pack.count)
      const single=speciesInfo[pack.species].lifecycle==='single'
      const stats=plantStats(pack.species,profile)
      const attrs=`data-seed="${pack.species}" data-profile='${JSON.stringify(profile)}'`
      const price=seedSaleValue(pack.species,profile,s)
      return `<article class="inventory-card">${header(pack.species)}
        ${button('inventory-select',bulkLabels.select,`data-key="${key}" aria-pressed="${selected.includes(key)}"`)}
        <p>${describe(s.lang,profile)} · ${single?w.single:w.multi}</p>
        <p>${w.growth} ${format.format(stats.growthSec)} ${s.lang==='ru'?'с':'s'} · ${price} ◈ ${w.per} · ${marketWords[s.lang].title} ${marketQuote(s,pack.species,'seed').pricePercent}%</p>
        ${s.reserves[profileKey(pack.species,profile)] || s.reserves[pack.species] ?
          '<p>'+(s.lang==='ru'?'Доступно с учётом резерва':'Available after reserves')+' · '+availableStock(s,pack.species,profile)+'</p>' : ''}
        ${controls(key,pack.count)}
        <div class="inventory-actions">${button('inventory-plant',w.plant,attrs)}
          ${button('profile-protect', protectedProfile(s,pack.species,profile) ? (s.lang==='ru'?'Снять защиту':'Unprotect') : (s.lang==='ru'?'Защитить':'Protect'),attrs)}
          ${detail===key ? button('profile-favorite', s.favorites.includes(profileKey(pack.species,profile)) ? '★' : '☆',attrs+' aria-label="'+(s.lang==='ru'?'Избранное':'Favorite')+'"') : ''}
          ${detail===key ? button('profile-reserve',(s.lang==='ru'?'Резерв':'Reserve')+' · '+(s.reserves[profileKey(pack.species,profile)] ?? 0),attrs) : ''}
          ${detail===key ? button('species-reserve',(s.lang==='ru'?'Резерв вида':'Species reserve')+' · '+(s.reserves[pack.species] ?? 0),attrs) : ''}
          ${button('inventory-sell-s',`${w.sell} · ${price*amount} ◈`,`${attrs} data-key="${key}"`)}
          ${details(key,`<p>${w.fruits} ${stats.fruits.join('–')} · ${s.lang==='ru'?'Неурожай':'Crop failure'} ${stats.cropFailure}% · ${w.potential} ${stats.ownSeeds.join('–')} · ${w.lives} ${stats.maxLives}
            ${single?'':' · '+w.regrow+' '+format.format(stats.regrowSec)+' '+(s.lang==='ru'?'с':'s')}</p>
            ${profileAllowed(pack.species,profile)?'':`<p>${w.inactive}</p>`}`)}
        </div>
      </article>`
    })
  }
  let comparison=''
  if(tab==='seeds') {
    const packs=speciesIds.flatMap(species=>[{species,...common,count:s.seeds[species]},...s.variants.filter(v=>v.species===species)])
      .filter(pack=>selected.includes(`s${pack.species}-${pack.rarity}-${pack.plus}-${pack.minus}`))
    if(packs.length===2 && packs[0].species===packs[1].species) {
      const [a,b]=packs.map(p=>plantStats(p.species,p))
      const labels=s.lang==='ru' ? ['Первый рост, с','Повторный рост, с','Мин. плодов','Макс. плодов','Неурожай, %','Шанс макс. плодов, %','Макс. семян, %','Запас сборов','Качество ×','Копирование, %','Аура ×'] :
        ['First growth, s','Regrowth, s','Min fruit','Max fruit','Crop failure, %','Max fruit chance, %','Max seeds, %','Harvest capacity','Quality ×','Copy chance, %','Aura ×']
      const maxChance=(range:number[],adjustment:number)=>range[0]===range[1] ? 100 :
        Math.max(0,Math.min(1,1/(range[1]-range[0]+1)+adjustment))*100
      const values=(stats:typeof a)=>[stats.growthSec,stats.regrowSec,stats.fruits[0],stats.fruits[1],stats.cropFailure,stats.fruitOdds.at(-1)!,
        maxChance(stats.ownSeeds,stats.seedYieldModifier),stats.maxLives,stats.fruitPriceMultiplier,stats.copyChance*100,stats.auraMultiplier]
      const av=values(a),bv=values(b)
      comparison=`<h3>${bulkLabels.compare}</h3><p>${describe(s.lang,packs[0])} / ${describe(s.lang,packs[1])}</p><div class="collection-matrix"><table><tbody>${labels.map((label,i)=>{
        const direction=(i<2 || i===4?-1:1)*Math.sign(bv[i]-av[i])
        return `<tr><th>${label}</th><td>${format.format(av[i])}</td><td>${format.format(bv[i])} ${direction>0?'↑':direction<0?'↓':'='}</td></tr>`
      }).join('')}</tbody></table></div>`
    }
  }
  return `<h2>${w.title}</h2><div class="book-filters">${tabs}${button('market',marketWords[s.lang].title)}</div>${tools}
    ${!s.tutorialSkipped && tab==='seeds' && s.variants.length ? `<p class="hint">${s.lang==='ru'?'Выберите два профиля одного вида для сравнения. Защита и резерв помогают сохранить ценные семена.':'Select two profiles of the same species to compare them. Protection and reserves keep valuable seeds safe.'}</p>`:''}
    ${tab==='seeds'?button('favorite-filter',bulkLabels.favorite,`aria-pressed="${favoriteOnly}"`):''}
    ${button('bulk-sell',bulkLabels.sell+' · '+selected.length,'',!selected.length)}
    ${tab==='harvest'?button('bulk-sell-all',(s.lang==='ru'?'Продать обычный урожай':'Sell ordinary harvest')+' · '+readyFruitSaleValue(s)+' ◈','',!readyFruitSaleValue(s)):''}
    ${tab==='harvest'?button('bulk-extract',bulkLabels.extract+' · '+selected.length,'',!selected.length):''}
    ${tab==='seeds'?button('bulk-plant',s.lang==='ru'?'Посадить на пустые грядки':'Plant empty beds','',selected.length!==1):''}
    ${comparison}${pageNav}${cards.join('')||`<p>${w.empty}</p>`}`
}
