import type { GameState } from '../../game/model'
import { basketCapacity, oldestReadyPlot } from '../../game'
import { basketCount } from '../../game/queries'
import { autoSellOffer, helperLevels, basketLevels, evolution } from '../../game/config'
import { plotModes, rarities } from '../../game/model'
import { field } from '../specimens'

export const modeLabels={
  ru:['Ручная','Продажа','Семена','Селекция','Поддержка'],
  en:['Manual','Commercial','Seeds','Breeding','Support']
}

export const automationWords = {
  ru: {
    name:'Листик', hire:'Нанять', upgrade:'Улучшить', stall:'Торговая лавка',
    sec:'с', coins:'монет', pace:'Интервал сбора', next:'Следующий сбор',
    waiting:'Ждёт созревания', full:'Корзина полна', ready:'Созревший урожай ждёт сбора',
    offer:'Собирает урожай с одной грядки за раз, начиная с самой давно созревшей.',
    basket:'Корзина', expand:'Увеличить корзину', automatic:'Автопродажа', enable:'Улучшить лавку', needs:'Станет доступно после найма Листика.',
    sells:'Продаёт обычный урожай каждые', reserve:'Селекционный урожай и запас для размножения гибридов остаются в инвентаре.', countdown:'До продажи'
  },
  en: {
    name:'Leafy', hire:'Hire', upgrade:'Upgrade', stall:'Market stall',
    sec:'s', coins:'coins', pace:'Harvest interval', next:'Next harvest',
    waiting:'Waiting for fruit to ripen', full:'Basket full', ready:'Ripe fruit ready to collect',
    offer:'Harvests one bed at a time, starting with the oldest ripe crop.',
    basket:'Basket', expand:'Expand basket', automatic:'Auto-sell', enable:'Upgrade stall', needs:'Available after hiring Leafy.',
    sells:'Sells ordinary harvest every', reserve:'Pollinated harvest and reserves for hybrid propagation stay in the inventory.', countdown:'Next sale in'
  }
} as const

export function automationPanel(state:GameState) {
  const w = automationWords[state.lang]
  const level = state.helperLevel
  const next = helperLevels[level + 1]
  const used=basketCount(state)
  const status = used === basketCapacity(state) ? w.full :
    oldestReadyPlot(state) === null ? w.waiting : w.ready
  const numerals = ['','I','II','III','IV','V']
  let html = `<h2>${w.name} ${numerals[level]}</h2><p>${w.offer}</p>`
  if(!state.tutorialSkipped && level) html+=`<p class="hint">${state.lang==='ru'?'Назначьте грядке режим и профиль пересадки в карточке грядки. Резерв семян настраивается в инвентаре.':'Choose a bed mode and replanting profile on the bed card. Set seed reserves in the inventory.'}</p>`
  const settings = state.lang === 'ru'
    ? {enabled:'Помощник',replant:'Автопересадка',extractPollinated:'Переработка опылённого урожая',sellSeeds:'Продажа лишних семян',sellFruit:'Продажа урожая'}
    : {enabled:'Helper',replant:'Automatic replanting',extractPollinated:'Extract pollinated harvest',sellSeeds:'Sell excess seeds',sellFruit:'Sell harvest'}
  if (level) {
    const toggles=['enabled','replant',...(state.stallLevel>=2 ? ['sellFruit'] as const : []),
      ...(state.stallLevel>=3 ? ['extractPollinated','sellSeeds'] as const : [])] as const
    for (const key of toggles) {
      html += `<button type="button" data-action="automation-toggle" data-setting="${key}" aria-pressed="${state.automation[key]}">${settings[key]} · ${state.automation[key]?'✓':'—'}</button>`
    }
    html+=`<div class="inventory-tools"><label>${state.lang==='ru'?'Приоритет режима':'Preferred bed mode'}
      <select data-automation-preferred><option value="">${state.lang==='ru'?'По времени':'Oldest first'}</option>
      ${plotModes.map((mode,i)=>`<option value="${mode}" ${mode===state.automation.preferred?'selected':''}>${modeLabels[state.lang][i]}</option>`).join('')}
      </select></label>${state.stallLevel>=4 ? `<label>${state.lang==='ru'?'Редкость автопродажи до':'Auto-sell rarity up to'}
      <select data-sale-rarity><option value="">${state.lang==='ru'?'По назначению грядки':'Bed mode default'}</option>
      ${rarities.map(r=>`<option value="${r}" ${r===state.automation.saleRarity?'selected':''}>${field[state.lang][r]}</option>`).join('')}
      </select></label>` : ''}</div>`
  }
  if (level) {
    html += `<p class="hint">${status}<br>${w.pace} · ${evolution.helperThroughput[level]} / ${helperLevels[level].intervalSec} ${w.sec}
      <br>${w.next} · ${Math.ceil(state.harvestRemaining)} ${w.sec}</p>`
  }
  if (next) {
    html += `<button type="button" class="primary" data-action="upgrade-helper" data-level="${next.level}"
      ${state.coins < next.upgradeCost ? 'disabled' : ''}>
      ${level ? w.upgrade : w.hire} · ${numerals[next.level]} · ${next.upgradeCost} ${w.coins}</button>
      <p>${w.pace} · ${next.intervalSec} ${w.sec}</p>`
  }
  html += `<h3>${w.stall}</h3><p>${w.sells} ${autoSellOffer.intervalSec} ${w.sec}. ${w.reserve}</p>`
  if (state.autoSell) {
    html += `<p class="hint">${w.automatic} ✓<br>${w.countdown} · ${Math.ceil(state.sellRemaining)} ${w.sec}</p>`
  } else {
    html += `<button type="button" data-action="buy-auto-sell"
      ${level < autoSellOffer.minHelperLevel || state.coins < autoSellOffer.cost ? 'disabled' : ''}>
      ${w.enable} · ${autoSellOffer.cost} ${w.coins}</button>`
    if (level < autoSellOffer.minHelperLevel) html += `<p>${w.needs}</p>`
  }
  const basket = basketLevels[state.basketLevel + 1]
  html += `<h3>${w.basket} · ${used}/${basketCapacity(state)}</h3>`
  if (basket) html += `<button type="button" data-action="upgrade-basket" data-level="${state.basketLevel + 1}"
    ${state.coins < basket.upgradeCost ? 'disabled' : ''}>${w.expand} · ${basket.capacity} · ${basket.upgradeCost} ${w.coins}</button>`
  return html
}
