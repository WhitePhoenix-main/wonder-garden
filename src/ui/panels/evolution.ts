import type { GameState, Species } from '../../game/model'
import { evolution, plotCount, speciesInfo } from '../../game/config'
import { harmony, harmonyGrowth } from '../../game/decor'
import { bridgeIssue, isBusy, orderQuote } from '../../game/evolution'
import { availableTraits, plantStats, traits } from '../../game/genetics'
import { canClone, crossingQuote, freeGreenhouseSlots, greenhouseTime } from '../../game/greenhouse'
import { negatives, rarities } from '../../game/model'
import { describe, field } from '../specimens'
import { plantName } from '../strings'
import { marketWords } from './market'

const words = {
  ru: { title:'Развитие сада', greenhouse:'Селекционная теплица', level:'Уровень', improve:'Улучшить', parents:'Выберите два растения одного вида в питомнике', selected:'Выбрано', cross:'Начать эксперимент', waiting:'Осталось', collect:'Получить семя', island:'Территория', green:'Зелёный остров', valley:'Цветочная долина', bridge:'Восстановить мост', orders:'Заказы', complete:'Выполнить', decline:'Отказаться', empty:'Пока нет заказов', reward:'Награда', nursery:'Питомник', seconds:'с' },
  en: { title:'Garden development', greenhouse:'Breeding greenhouse', level:'Level', improve:'Upgrade', parents:'Choose two plants of the same species in the nursery', selected:'Selected', cross:'Start experiment', waiting:'Remaining', collect:'Collect seed', island:'Territory', green:'Green Island', valley:'Flower Valley', bridge:'Restore bridge', orders:'Orders', complete:'Complete', decline:'Decline', empty:'No orders yet', reward:'Reward', nursery:'Nursery', seconds:'s' }
}
const button = (action:string, label:string, attrs='', disabled=false) =>
  `<button type="button" data-action="${action}" ${attrs} ${disabled?'disabled':''}>${label}</button>`
export const evolutionErrors:Record<GameState['lang'],Record<string,string>>={
  ru:{greenhouseLocked:'Сначала улучшите теплицу.',bridgeProgress:'Условия восстановления моста ещё не выполнены.',
    bridgeRestored:'Мост уже восстановлен.',parentsBusy:'Родитель занят в эксперименте.',invalidParents:'Выберите два живых экземпляра одного вида.',
    sameParent:'Выберите два разных экземпляра.',crossSlotsFull:'Все селекционные слоты заняты.',crossNotReady:'Эксперимент ещё идёт.',
    orderResources:'Не хватает доступных предметов.',protectedItem:'Предмет защищён.',seedReserved:'Семена входят в резерв.',
    lastProfile:'Сохраните последнее семя этого профиля.',stallLocked:'Сначала улучшите торговую лавку.',invalidPolicy:'Проверьте настройки грядки.',
    invalidProfile:'Этот генетический профиль недоступен.',cloneParent:'Нужен живой экземпляр редкости Rare или выше в питомнике.'},
  en:{greenhouseLocked:'Upgrade the greenhouse first.',bridgeProgress:'The bridge requirements are still incomplete.',
    bridgeRestored:'The bridge is already restored.',parentsBusy:'A parent is busy in an experiment.',invalidParents:'Choose two living plants of the same species.',
    sameParent:'Choose two different plants.',crossSlotsFull:'All breeding slots are in use.',crossNotReady:'The experiment is still running.',
    orderResources:'The available items fall short.',protectedItem:'This item is protected.',seedReserved:'These seeds are reserved.',
    lastProfile:'Keep the last seed of this profile.',stallLocked:'Upgrade the market stall first.',invalidPolicy:'Check the bed settings.',
    invalidProfile:'This genetic profile is unavailable.',cloneParent:'Choose a living nursery plant of Rare rarity or higher.'}
}

function crossResult(state:GameState, cross:GameState['crosses'][number]) {
  const ru=state.lang==='ru'
  const label=field[state.lang]
  const inherited=new Set(cross.parentProfiles.flatMap(p=>[...traits(p),p.minus]))
  const features=[...traits(cross.profile),cross.profile.minus].filter(p=>p!==null)
  const fromParents=features.filter(t=>inherited.has(t)).map(t=>label[t])
  const mutations=features.filter(t=>!inherited.has(t)).map(t=>label[t])
  return `<strong>${describe(state.lang,cross.profile)}</strong>
    <p>${ru?'Родители':'Parents'} · ${cross.parentProfiles.map((profile,i)=>'#'+cross.parents[i]+' '+describe(state.lang,profile)).join(' + ')}</p>
    <p>${ru?'Унаследовано':'Inherited'} · ${fromParents.join(', ')||'—'}</p>
    <p>${ru?'Мутации':'Mutations'} · ${mutations.join(', ')||'—'}</p>`
}

export function evolutionPanel(state:GameState, parents:number[], section:'greenhouse'|'bridge'|'orders'|'stall'='greenhouse') {
  const w=words[state.lang]
  const name=(id:Species)=>plantName(state.lang,id)
  let html=''
  if (section==='bridge') {
  html=`<h2>${w.island}</h2>`
  html+=button('travel-green',w.green, `aria-pressed="${state.activeIsland==='green'}"`)
  html+=state.plots.length>plotCount ? button('travel-valley',w.valley,`aria-pressed="${state.activeIsland==='valley'}"`) : button('restore-bridge',w.bridge+' · '+evolution.bridge.cost+' ◈', '', !!bridgeIssue(state))
  if(state.plots.length<=plotCount) {
    const bridge=evolution.bridge
    html+=`<p>${state.lang==='ru'?'Виды':'Species'} ${state.planted.length}/${bridge.species} · ${state.lang==='ru'?'Грядки':'Beds'} ${state.plots.filter(p=>p.open).length}/${bridge.plots} · ${state.lang==='ru'?'Гармония':'Harmony'} ${harmony(state,'green')}/${bridge.harmony}</p>`
  }
  html+=`<p>${state.lang==='ru'?'Гармония сада':'Garden harmony'} ${harmony(state)} · ${state.lang==='ru'?'Зелёный остров':'Green Island'} ${harmony(state,'green')}${state.plots.length>plotCount ? ' · '+w.valley+' '+harmony(state,'valley') : ''}</p>`
  const growth=Math.round((harmonyGrowth(state,state.activeIsland)-1)*100)
  if (growth) html+=`<p>${state.lang==='ru'?'Рост от гармонии':'Harmony growth bonus'} +${growth}%</p>`
  return html
  }
  if (section==='greenhouse') {
  html+=`<h3>${w.greenhouse} · ${w.level} ${state.greenhouseLevel}</h3>`
  if(!state.tutorialSkipped && state.revealed.length && state.greenhouseLevel===1) html+=`<p class="hint">${state.lang==='ru'?'Улучшите теплицу, чтобы скрестить два растения одного вида из питомника.':'Upgrade the greenhouse to cross two nursery plants of the same species.'}</p>`
  if(state.greenhouseLevel<5) html+=button('greenhouse-upgrade',w.improve+' · '+evolution.greenhouseCosts[state.greenhouseLevel]+' ◈',
    `data-level="${state.greenhouseLevel+1}"`,!state.revealed.length || state.coins<evolution.greenhouseCosts[state.greenhouseLevel])
  if(state.greenhouseLevel>=2){
    const ru=state.lang==='ru'
    const slots=freeGreenhouseSlots(state)
    const cloneLabel=ru?'Клонирование генома':'Genome cloning'
    html+=`<p>${ru?'Свободные слоты':'Free slots'} · ${slots}/${evolution.crossSlots[state.greenhouseLevel-1]}</p>`
    html+=`<p>${w.parents}</p>`
    for(const plant of state.nursery) html+=button('cross-parent',name(plant.species)+' #'+plant.id+' · '+describe(state.lang,plant),`data-id="${plant.id}" aria-pressed="${parents.includes(plant.id)}"`,isBusy(state,plant.id))
    const selected=parents.map(id=>state.nursery.find(p=>p.id===id && !isBusy(state,id))).filter(p=>p!==undefined)
    const [first,second]=selected
    const experiment=first && second && first.species===second.species ? crossingQuote(state,first,second) : null
    if(experiment) {
      const pending=state.crosses.some(c=>c.species===first.species && c.readyAt>greenhouseTime(state))
      const odds=pending ? experiment.base : experiment.weights
      const total=odds.reduce((sum,weight)=>sum+weight,0)
      html+=`<p>${experiment.cost} ◈ · ${experiment.seconds} ${w.seconds}</p>
        <p>${rarities.map((rarity,i)=>field[state.lang][rarity]+' '+Number((odds[i]*100/total).toFixed(1))+'%').join(' · ')}</p>
        <p>${ru?'Возможные положительные признаки':'Possible positive traits'} · ${availableTraits(first.species).map(t=>field[state.lang][t]).join(' · ')}</p>
        <p>${ru?'Возможные недостатки':'Possible flaws'} · ${negatives.filter(t=>t!=='fragile' || speciesInfo[first.species].lifecycle==='multi').map(t=>field[state.lang][t]).join(' · ')}</p>`
      if (experiment.key) {
        const remaining=evolution.rarityGuarantee-experiment.failures
        html+=`<p>${pending
          ? (ru?'Показаны базовые шансы. Точный прогноз появится после завершения текущих опытов этого вида.':'Base odds shown. Exact odds are available when pending experiments on this species finish.')
          : (ru?'Гарантия повышения редкости не позднее чем через':'Rarity increase guaranteed within')+' '+remaining+' '+(ru?'подход. оп.':'eligible trials')}</p>`
      } else html+=`<p>${ru?'Эта пара уже достигла верхней редкости.':'This pair has reached the highest rarity.'}</p>`
      for(const parent of selected) {
        const stats=plantStats(parent.species,parent)
        html+=`<p>#${parent.id} · ${describe(state.lang,parent)} · ${stats.growthSec.toFixed(1)} ${w.seconds} · ♥ ${parent.lives}/${stats.maxLives}</p>`
      }
    }
    html+=button('cross-start',w.cross,'class="primary"',!experiment || slots<=0 || state.coins<experiment.cost)
    if (selected.length===1 && canClone(first)) {
      const clone=evolution.cloning[speciesInfo[first.species].generation]
      html+=state.greenhouseLevel>=3
        ? button('clone-start',cloneLabel+' · '+clone.cost+' ◈ · '+clone.seconds+' '+w.seconds,
          `data-id="${first.id}"`,slots<=0 || state.coins<clone.cost)
        : `<p>${cloneLabel} · ${w.level} III</p>`
    }
    for(const cross of state.crosses.filter(c=>!c.collected)){
      html+=`<article class="inventory-card"><p>${name(cross.species)} · #${cross.id}</p>`
      html+=cross.readyAt>greenhouseTime(state)
        ? `<p>${w.waiting} ${Math.ceil(cross.readyAt-greenhouseTime(state))} ${w.seconds}</p>`
        : `<div class="breeding-result breeding-${cross.profile.rarity}">${crossResult(state,cross)}${button('cross-collect',w.collect,`data-id="${cross.id}"`)}</div>`
      html+='</article>'
    }
    for (const clone of state.clones) {
      html+=`<article class="inventory-card"><p>${cloneLabel} · ${name(clone.species)} · ${describe(state.lang,clone.profile)}</p>`
      html+=clone.readyAt>greenhouseTime(state)
        ? `<p>${w.waiting} ${Math.ceil(clone.readyAt-greenhouseTime(state))} ${w.seconds}</p>`
        : button('clone-collect',w.collect,`data-id="${clone.id}"`)
      html+='</article>'
    }
    const history=state.crosses.filter(c=>c.collected).slice(-20).reverse()
    if (history.length) {
      html+=`<details><summary>${ru?'История опытов':'Experiment history'}</summary>`
      html+=history.map(c=>`<article class="inventory-card"><p>#${c.id} · ${name(c.species)}</p>${crossResult(state,c)}</article>`).join('')
      html+='</details>'
    }
  }
  return html
  }
  if (section==='stall') {
  html+=`<h3>${marketWords[state.lang].title} · ${w.level} ${state.stallLevel}</h3>`
  if (state.sold) html+=button('helper',state.lang==='ru'?'Листик и автоматизация':'Leafy and automation')
  if(state.stallLevel<5) html+=button('stall-upgrade',w.improve+' · '+evolution.stallCosts[state.stallLevel]+' ◈',`data-level="${state.stallLevel+1}"`)
  return html
  }
  html+=`<h3>${w.orders}</h3>`
  if (state.autoSell && state.orders.length && !state.trading.reserveOrders) {
    const hint=state.lang==='ru'
      ? (state.stallLevel>=4 ? 'В настройках лавки можно сохранять товары для заказов.' : 'Чтобы собрать запас для заказа, приостановите продажу в настройках Листика.')
      : (state.stallLevel>=4 ? 'Reserve order goods in the stall settings.' : 'Pause sales in Leafy’s settings to save goods for an order.')
    html+=`<p class="hint">${hint}</p>`
  }
  if(!state.tutorialSkipped && state.orders.length && !state.ordersCompleted) html+=`<p class="hint">${state.lang==='ru'?'Заказ расходует перечисленные предметы и приносит награду. Защищённые семена сохраняются.':'An order consumes the listed items and pays its reward. Protected seeds stay in your inventory.'}</p>`
  if(!state.orders.length) html+=`<p>${w.empty}</p>`
  const buyers = state.lang==='ru'
    ? {baker:'Кондитер',merchant:'Торговец',florist:'Флорист',alchemist:'Алхимик',botanist:'Ботаник',collector:'Коллекционер'}
    : {baker:'Baker',merchant:'Merchant',florist:'Florist',alchemist:'Alchemist',botanist:'Botanist',collector:'Collector'}
  for(const order of state.orders){
    html+=`<article class="inventory-card"><strong>${buyers[order.buyer]}</strong>`
    const quote=orderQuote(state,order)
    for(const [index,req] of order.requirements.entries()){
      const type=req.kind==='fruit' ? (state.lang==='ru'?'Урожай':'Harvest') : (state.lang==='ru'?'Семена':'Seeds')
      const tier=req.tier ? (state.lang==='ru'?'Тир ':'Tier ')+req.tier : ''
      const rarity=req.rarity ? field[state.lang][req.rarity]+(req.kind==='fruit'?(state.lang==='ru'?' или выше':' or higher'):'') : ''
      const trait=req.trait ? field[state.lang][req.trait] : ''
      const clean=req.clean ? (state.lang==='ru'?'Без недостатков':'No flaws') : ''
      html+=`<p>${[type,req.species?name(req.species):'',tier,rarity,trait,clean].filter(Boolean).join(' · ')} · ${quote.lines[index].available}/${req.count}</p>`
      html+=quote.lines[index].items.map(item=>`<p>↳ ${name(item.species)} ${item.profile?describe(state.lang,item.profile):''} ×${item.count}</p>`).join('')
    }
    const comparison=state.lang==='ru'
      ? {market:'Обычная продажа',bonus:'Разница',partial:'Стоимость доступной части заказа'}
      : {market:'Ordinary sale',bonus:'Difference',partial:'Value of available order items'}
    const signed=(value:number)=>(value>0?'+':'')+value
    html+=`<p>${w.reward} · ${order.reward} ◈</p>`
    if (quote.complete) {
      const rate=quote.marketValue ? ' ('+signed(Math.round(100*quote.bonus/quote.marketValue))+'%)' : ''
      html+=`<p>${comparison.market} · ${quote.marketValue} ◈<br>${comparison.bonus} · ${signed(quote.bonus)} ◈${rate}</p>`
    } else html+=`<p>${comparison.partial} · ${quote.marketValue} ◈</p>`
    html+=`${button('order-complete',w.complete,`data-id="${order.id}"`,!quote.complete)}${button('order-decline',w.decline,`data-id="${order.id}"`)}</article>`
  }
  return html
}
