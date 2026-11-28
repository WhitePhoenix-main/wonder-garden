import { speciesIds } from '../../game/config'
import { marketKinds, marketQuote } from '../../game/market'
import type { GameState, MarketKind } from '../../game/model'
import { plantName } from '../strings'

export const marketWords={
  ru:{title:'Рынок',fruit:'Урожай',seed:'Семена',species:'Вид',demand:'Спрос',stock:'Насыщение',price:'Цена',
    next:'Новые котировки через',unit:'с',closed:'Рынок начнёт меняться после первой продажи.',
    hint:'Спрос меняется по игровому времени. Продажи снижают цену, пока рынок не разгрузится. Для урожая котировка применяется к стоимости на момент сбора.'},
  en:{title:'Market',fruit:'Harvest',seed:'Seeds',species:'Species',demand:'Demand',stock:'Saturation',price:'Price',
    next:'New quotes in',unit:'s',closed:'Market prices start changing after your first sale.',
    hint:'Demand changes with active game time. Sales lower prices until supply clears. For harvests, the quote applies to their value at collection.'}
} as const

export function marketPanel(state:GameState,kind:MarketKind):string {
  const w=marketWords[state.lang]
  const tabs=marketKinds.map(id=>`<button type="button" data-action="market-product" data-kind="${id}"
    aria-pressed="${id===kind}">${w[id]}</button>`).join('')
  const rows=speciesIds.filter(id=>state.planted.includes(id)).map(id=>{
    const quote=marketQuote(state,id,kind)
    const direction=quote.pricePercent>100 ? 'up' : quote.pricePercent<100 ? 'down' : 'flat'
    return `<tr data-market-species="${id}"><th scope="row">${plantName(state.lang,id)}</th>
      <td data-demand="${quote.demand}">${quote.demand}%</td>
      <td data-saturation="${quote.saturation}">${quote.saturation}%</td>
      <td data-market-price="${quote.pricePercent}" class="market-${direction}">
        ${direction==='up'?'↑ ':direction==='down'?'↓ ':''}${quote.pricePercent}%</td></tr>`
  }).join('')
  return `<h2>${w.title}</h2><p>${state.sold ? w.next+' '+Math.ceil(state.market.remaining)+' '+w.unit : w.closed}</p>
    <div class="book-filters">${tabs}</div>
    <table class="market-table"><thead><tr><th scope="col">${w.species}</th><th scope="col">${w.demand}</th>
      <th scope="col">${w.stock}</th><th scope="col">${w.price}</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="hint">${w.hint}</p>`
}
