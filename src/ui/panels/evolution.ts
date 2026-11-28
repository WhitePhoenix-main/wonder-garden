import type { GameState, Species } from '../../game/model'
import { evolution, plotCount, speciesInfo } from '../../game/config'
import { harmony, harmonyGrowth } from '../../game/decor'
import { bridgeIssue, isBusy, orderQuote } from '../../game/evolution'
import { availableTraits, plantStats, rarityOdds } from '../../game/genetics'
import { rarities } from '../../game/model'
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
    invalidProfile:'Этот генетический профиль недоступен.'},
  en:{greenhouseLocked:'Upgrade the greenhouse first.',bridgeProgress:'The bridge requirements are still incomplete.',
    bridgeRestored:'The bridge is already restored.',parentsBusy:'A parent is busy in an experiment.',invalidParents:'Choose two living plants of the same species.',
    sameParent:'Choose two different plants.',crossSlotsFull:'All breeding slots are in use.',crossNotReady:'The experiment is still running.',
    orderResources:'The available items fall short.',protectedItem:'This item is protected.',seedReserved:'These seeds are reserved.',
    lastProfile:'Keep the last seed of this profile.',stallLocked:'Upgrade the market stall first.',invalidPolicy:'Check the bed settings.',
    invalidProfile:'This genetic profile is unavailable.'}
}

export function evolutionPanel(state:GameState, parents:number[]) {
  const w=words[state.lang]
  const name=(id:Species)=>plantName(state.lang,id)
  let html=`<h2>${w.title}</h2><h3>${w.island}</h3>`
  html+=button('market',marketWords[state.lang].title)
  html+=button('travel-green',w.green, `aria-pressed="${state.activeIsland==='green'}"`)
  html+=state.plots.length>plotCount ? button('travel-valley',w.valley,`aria-pressed="${state.activeIsland==='valley'}"`) : button('restore-bridge',w.bridge+' · '+evolution.bridge.cost+' ◈', '', !!bridgeIssue(state))
  if(state.plots.length<=plotCount) {
    const bridge=evolution.bridge
    html+=`<p>${state.lang==='ru'?'Виды':'Species'} ${state.planted.length}/${bridge.species} · ${state.lang==='ru'?'Грядки':'Beds'} ${state.plots.filter(p=>p.open).length}/${bridge.plots} · ${state.lang==='ru'?'Гармония':'Harmony'} ${harmony(state,'green')}/${bridge.harmony}</p>`
  }
  html+=`<p>${state.lang==='ru'?'Гармония сада':'Garden harmony'} ${harmony(state)} · ${state.lang==='ru'?'Зелёный остров':'Green Island'} ${harmony(state,'green')}${state.plots.length>plotCount ? ' · '+w.valley+' '+harmony(state,'valley') : ''}</p>`
  const growth=Math.round((harmonyGrowth(state,state.activeIsland)-1)*100)
  if (growth) html+=`<p>${state.lang==='ru'?'Рост от гармонии':'Harmony growth bonus'} +${growth}%</p>`
  html+=`<h3>${w.greenhouse} · ${w.level} ${state.greenhouseLevel}</h3>`
  if(!state.tutorialSkipped && state.revealed.length && state.greenhouseLevel===1) html+=`<p class="hint">${state.lang==='ru'?'Улучшите теплицу, чтобы скрестить два растения одного вида из питомника.':'Upgrade the greenhouse to cross two nursery plants of the same species.'}</p>`
  if(state.greenhouseLevel<5) html+=button('greenhouse-upgrade',w.improve+' · '+evolution.greenhouseCosts[state.greenhouseLevel]+' ◈',
    `data-level="${state.greenhouseLevel+1}"`,!state.revealed.length || state.coins<evolution.greenhouseCosts[state.greenhouseLevel])
  if(state.greenhouseLevel>=2){
    html+=`<p>${w.parents}</p>`
    for(const plant of state.nursery) html+=button('cross-parent',name(plant.species)+' #'+plant.id+' · '+describe(state.lang,plant),`data-id="${plant.id}" aria-pressed="${parents.includes(plant.id)}"`,isBusy(state,plant.id))
    const selected=parents.map(id=>state.nursery.find(p=>p.id===id)).filter(p=>p!==undefined)
    if(selected.length===2 && selected[0].species===selected[1].species) {
      const experiment=evolution.experiments[speciesInfo[selected[0].species].generation]
      const odds=rarityOdds(selected[0].rarity,selected[1].rarity)
      html+=`<p>${experiment.cost} ◈ · ${experiment.seconds} ${w.seconds}</p>
        <p>${rarities.map((rarity,i)=>field[state.lang][rarity]+' '+odds[i]+'%').join(' · ')}</p>
        <p>${availableTraits(selected[0].species).map(t=>field[state.lang][t]).join(' · ')}</p>`
      for(const parent of selected) {
        const stats=plantStats(parent.species,parent)
        html+=`<p>#${parent.id} · ${describe(state.lang,parent)} · ${stats.growthSec.toFixed(1)} ${w.seconds} · ♥ ${parent.lives}/${stats.maxLives}</p>`
      }
    }
    if(state.greenhouseLevel>=3 && state.crosses.some(c=>c.collected)) {
      html+=`<h4>${state.lang==='ru'?'История опытов':'Experiment history'}</h4>`
      html+=state.crosses.filter(c=>c.collected).slice(-20).reverse().map(c=>
        `<p>#${c.id} · ${name(c.species)} · ${c.parents.map((id,i)=>'#'+id+' ('+describe(state.lang,c.parentProfiles[i])+')').join(' + ')} → ${describe(state.lang,c.profile)}</p>`).join('')
    }
    html+=button('cross-start',w.cross,'class="primary"',selected.length!==2 || selected[0].species!==selected[1].species)
    for(const cross of state.crosses.filter(c=>!c.collected)){
      html+=`<p>${name(cross.species)} · #${cross.id} · ${cross.readyAt>state.playTime ? w.waiting+' '+Math.ceil(cross.readyAt-state.playTime)+' '+w.seconds : describe(state.lang,cross.profile)}</p>`
      if(cross.readyAt<=state.playTime) html+=button('cross-collect',w.collect,`data-id="${cross.id}"`)
    }
  }
  html+=`<h3>${state.lang==='ru'?'Торговая лавка':'Market stall'} · ${w.level} ${state.stallLevel}</h3>`
  if (state.sold) html+=button('helper',state.lang==='ru'?'Листик и автоматизация':'Leafy and automation')
  if(state.stallLevel<5) html+=button('stall-upgrade',w.improve+' · '+evolution.stallCosts[state.stallLevel]+' ◈',`data-level="${state.stallLevel+1}"`)
  html+=`<h3>${w.orders}</h3>`
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
    html+=`<p>${w.reward} · ${order.reward} ◈</p>${button('order-complete',w.complete,`data-id="${order.id}"`,!quote.complete)}${button('order-decline',w.decline,`data-id="${order.id}"`)}</article>`
  }
  return html
}
