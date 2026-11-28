import { sessionStats } from '../../game/analytics'
import { basketCapacity, basketCount } from '../../game/queries'
import { harvestSaleValue, seedSaleValue } from '../../game/pricing'
import { allSeedPacks } from '../../game/stock-policy'
import type { GameState } from '../../game/model'
import { plantName } from '../strings'

export function statisticsPanel(s:GameState,window:60|300,byVolume:boolean) {
  const t=(ru:string,en:string)=>s.lang==='ru'?ru:en
  const fmt=new Intl.NumberFormat(s.lang,{maximumFractionDigits:1})
  const {total,crops,elapsed}=sessionStats(s,window)
  const revenue=total.fruitRevenue+total.seedRevenue+total.orders
  const rate=(value:number)=>elapsed>=1?fmt.format(value*60/elapsed):'—'
  const stock=s.basket.reduce((n,b)=>n+harvestSaleValue(b,b.count,s),0)+
    allSeedPacks(s).reduce((n,p)=>n+p.count*seedSaleValue(p.species,p,s),0)
  const rows=[
    [t('Выручка за минуту','Revenue per minute'),rate(revenue)],
    [t('Операционный поток за минуту','Operating cash flow per minute'),rate(revenue-total.seedCost-total.breedingCost)],
    [t('Продажа плодов / семян','Fruit / seed sales'),total.fruitRevenue+' / '+total.seedRevenue],
    [t('Награды за заказы','Order payments'),total.orders],
    [t('Покупка семян / селекция','Seed purchases / breeding'),total.seedCost+' / '+total.breedingCost],
    [t('Строительство и развитие','Development and construction'),total.construction],
    [t('Плодов / семян получено','Fruit / seeds produced'),total.fruit+' / '+total.seeds],
    [t('Занято грядок','Occupied beds'),s.plots.filter(p=>p.plant).length+' / '+s.plots.filter(p=>p.open).length],
    [t('Загрузка Листика','Helper capacity used'),total.helperCapacity?Math.round(100*total.helperUsed/total.helperCapacity)+'%':'—'],
    [t('Сборы Листика','Helper harvests'),total.helperHarvests],
    [t('Уборка Листика','Helper clearings'),total.helperCleanups],
    [t('Пересадки Листика','Helper replants'),total.helperReplants],
    [t('Корзина','Basket'),basketCount(s)+' / '+basketCapacity(s)],
    [t('Оценка запасов по текущей цене','Inventory at current prices'),stock+' ◈']
  ]
  const income=(p:typeof total)=>p.fruitRevenue+p.seedRevenue
  return '<h2>'+t('Статистика сада','Garden statistics')+'</h2><div class="book-filters">'+
    ([60,300] as const).map(n=>'<button data-action="stats-window" data-window="'+n+'" aria-pressed="'+(window===n)+'">'+n+' '+t('с','s')+'</button>').join('')+
    '</div><p>'+t('С начала этой сессии','This session')+' · '+Math.floor(elapsed)+' / '+window+' '+t('с','s')+
    (elapsed<window?' · '+t('идёт сбор данных','collecting data'):'')+'</p><dl class="stat-list">'+
    rows.map(([label,value])=>'<dt>'+label+'</dt><dd>'+value+'</dd>').join('')+'</dl><h3>'+t('По видам','By species')+'</h3>'+
    '<button data-action="stats-sort">'+t('Сортировка','Sort')+' · '+(byVolume?t('объём','volume'):t('выручка','revenue'))+'</button>'+
    [...crops].sort(([,a],[,b])=>byVolume?b.fruit-a.fruit:income(b)-income(a)).map(([species,row])=>
      '<article class="inventory-card"><strong>'+plantName(s.lang,species)+'</strong><p>'+t('Посадок / сборов','Plantings / harvests')+' · '+row.planted+' / '+row.harvests+
      '</p><p>'+t('Плодов / семян','Fruit / seeds')+' · '+row.fruit+' / '+row.seeds+'</p><p>'+income(row)+' ◈ · '+t('Средняя цена','Mean quote')+' '+(row.soldUnits?fmt.format(row.quoteUnits/row.soldUnits)+'%':'—')+'</p></article>').join('')
}
