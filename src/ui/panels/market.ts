import { market, speciesIds } from '../../game/config'
import { marketQuote } from '../../game/market'
import type { GameState, MarketKind } from '../../game/model'
import { plantName } from '../strings'
import { marketFruitSalePlan, marketSeedStock, seedSaleIssue, trade } from '../../game/trade'
import { allSeedPacks } from '../../game/stock-policy'
import { orderReservations } from '../../game/orders'
import { changeStock } from '../../game/genetics'

export type MarketSort = 'price' | 'value'

export const marketWords={
  ru:{title:'Рынок',fruit:'Урожай',seed:'Семена',species:'Вид',demand:'Спрос',stock:'Насыщение',price:'Цена',
    next:'Новые котировки через',unit:'с',closed:'Рынок начнёт меняться после первой продажи.',
    hint:'Спрос меняется по игровому времени. Продажи снижают цену, пока рынок не разгрузится. Для урожая котировка применяется к стоимости на момент сбора.'},
  en:{title:'Market',fruit:'Harvest',seed:'Seeds',species:'Species',demand:'Demand',stock:'Saturation',price:'Price',
    next:'New quotes in',unit:'s',closed:'Market prices start changing after your first sale.',
    hint:'Demand changes with active game time. Sales lower prices until supply clears. For harvests, the quote applies to their value at collection.'}
} as const

export function marketPanel(state:GameState,kind:MarketKind,sort:MarketSort='price'):string {
  const w=marketWords[state.lang]
  const ru=state.lang==='ru'
  const packs=kind==='seed' ? allSeedPacks(state) : []
  const inventory={...state,seeds:{...state.seeds},variants:state.variants.map(pack=>({...pack}))}
  const items=kind==='fruit' ? marketFruitSalePlan(state) : []
  const seedReserve=kind==='seed' ? orderReservations(state).seed : new Map<string,number>()
  const rows=speciesIds.filter(id=>state.planted.includes(id) || state.revealed.includes(id as GameState['revealed'][number])).map(id=>{
    const quote=marketQuote(state,id,kind)
    let count=0,value=0
    const draft=structuredClone(state)
    if (kind==='fruit') for (const item of items.filter(({batch})=>batch.species===id)) {
      const before=draft.coins
      if (trade(draft,{type:'sellHarvest',id:item.batch.id,count:item.count}).ok) {
        count+=item.count
        value+=draft.coins-before
      }
    }
    if (kind==='seed') for (const pack of packs.filter(p=>p.species===id)) {
      let quantity=marketSeedStock(inventory,id,pack,seedReserve)
      if (quantity && seedSaleIssue(inventory,id,pack,quantity)==='lastProfile') quantity--
      const before=draft.coins
      if (quantity && trade(draft,{type:'sellSeeds',species:id,profile:pack,count:quantity}).ok) {
        count+=quantity
        value+=draft.coins-before
        changeStock(inventory,id,pack,-quantity)
      }
    }
    return {id,quote,count,value}
  }).sort((a,b)=>sort==='price' ? b.quote.pricePercent-a.quote.pricePercent : b.value-a.value).map(({id,quote,count,value})=>{
    const direction=quote.pricePercent>=market.strategy.profitMinimum ? 'up' : quote.pricePercent<market.strategy.balancedMinimum ? 'down' : 'flat'
    const label=direction==='up' ? (ru?'Выгодно':'Favorable') : direction==='down' ? (ru?'Низкая':'Low') : (ru?'Нейтрально':'Neutral')
    return `<tr data-market-species="${id}"><th scope="row">${plantName(state.lang,id)}<br><small>${count} · ${value} ◈</small>
      ${count ? `<br><button type="button" data-action="market-sell-species" data-kind="${kind}" data-species="${id}">${ru?'Продать':'Sell'} · ${value} ◈</button>` : ''}</th>
      <td data-demand="${quote.demand}">${quote.demand}%</td>
      <td data-saturation="${quote.saturation}">${quote.saturation}%${quote.saturation>=80 ? '<br><small>'+(ru?'Высокое':'High')+'</small>' : ''}
        ${quote.backlog ? '<br><small>+'+quote.backlog.toLocaleString(state.lang)+' '+(ru?'сверх ёмкости':'over capacity')+'</small>' : ''}</td>
      <td data-market-price="${quote.pricePercent}" class="market-${direction}">
        ${quote.pricePercent}% · ${label}${quote.change ? '<br><small>'+(quote.change>0?'+':'')+quote.change+' '+(ru?'п.п. за такт':'pp this tick')+'</small>' : ''}</td></tr>`
  }).join('')
  return `<p>${state.sold ? w.next+' '+Math.ceil(state.market.remaining)+' '+w.unit : w.closed}</p>
    <button type="button" data-action="inventory">${ru?'Инвентарь и продажа по количеству':'Inventory and quantity selection'}</button>
    <button type="button" data-action="market-sell-all" data-kind="${kind}">${ru?'Продать всё доступное':'Sell all available'}</button>
    <div class="book-filters">${(['price','value'] as const).map(key=>`<button type="button" data-action="market-sort" data-sort="${key}" aria-pressed="${sort===key}">${key==='price' ? (ru?'По котировке':'By quote') : (ru?'По стоимости запаса':'By stock value')}</button>`).join('')}</div>
    <table class="market-table"><thead><tr><th scope="col">${w.species}</th><th scope="col">${w.demand}</th>
      <th scope="col">${w.stock}</th><th scope="col">${w.price}</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="hint">${w.hint}</p>`
}
