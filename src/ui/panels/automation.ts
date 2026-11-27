import type { GameState } from '../../game/model'
import { basketCapacity, oldestReadyPlot } from '../../game'
import { autoSellOffer, helperLevels, basketLevels } from '../../game/config'

export const automationWords = {
  ru: {
    name:'Листик', hire:'Нанять', upgrade:'Улучшить', stall:'Торговая лавка',
    sec:'с', coins:'монет', pace:'Интервал сбора', next:'Следующий сбор',
    waiting:'Ждёт созревания', full:'Корзина полна', ready:'Созревший урожай ждёт сбора',
    offer:'Собирает по одному плоду, начиная с самого давно созревшего.',
    basket:'Корзина', expand:'Увеличить корзину', automatic:'Автопродажа', enable:'Улучшить лавку', needs:'Станет доступно после найма Листика.',
    sells:'Продажа всей корзины при заполнении или каждые', countdown:'До продажи'
  },
  en: {
    name:'Leafy', hire:'Hire', upgrade:'Upgrade', stall:'Market stall',
    sec:'s', coins:'coins', pace:'Harvest interval', next:'Next harvest',
    waiting:'Waiting for fruit to ripen', full:'Basket full', ready:'Ripe fruit ready to collect',
    offer:'Collects one fruit at a time, starting with the oldest ripe crop.',
    basket:'Basket', expand:'Expand basket', automatic:'Auto-sell', enable:'Upgrade stall', needs:'Available after hiring Leafy.',
    sells:'Sells the whole basket when full or every', countdown:'Next sale in'
  }
} as const

export function automationPanel(state:GameState) {
  const w = automationWords[state.lang]
  const level = state.helperLevel
  const next = helperLevels[level + 1]
  const status = state.basket.length === basketCapacity(state) ? w.full :
    oldestReadyPlot(state) === null ? w.waiting : w.ready
  const numerals = ['','I','II','III']
  let html = `<h2>${w.name} ${numerals[level]}</h2><p>${w.offer}</p>`
  if (level) {
    html += `<p class="hint">${status}<br>${w.pace} · ${helperLevels[level].intervalSec} ${w.sec}
      <br>${w.next} · ${Math.ceil(state.harvestRemaining)} ${w.sec}</p>`
  }
  if (next) {
    html += `<button type="button" class="primary" data-action="upgrade-helper" data-level="${next.level}"
      ${state.coins < next.upgradeCost ? 'disabled' : ''}>
      ${level ? w.upgrade : w.hire} · ${numerals[next.level]} · ${next.upgradeCost} ${w.coins}</button>
      <p>${w.pace} · ${next.intervalSec} ${w.sec}</p>`
  }
  html += `<h3>${w.stall}</h3><p>${w.sells} ${autoSellOffer.intervalSec} ${w.sec}.</p>`
  if (state.autoSell) {
    html += `<p class="hint">${w.automatic} ✓<br>${w.countdown} · ${Math.ceil(state.sellRemaining)} ${w.sec}</p>`
  } else {
    html += `<button type="button" data-action="buy-auto-sell"
      ${level < autoSellOffer.minHelperLevel || state.coins < autoSellOffer.cost ? 'disabled' : ''}>
      ${w.enable} · ${autoSellOffer.cost} ${w.coins}</button>`
    if (level < autoSellOffer.minHelperLevel) html += `<p>${w.needs}</p>`
  }
  const basket = basketLevels[state.basketLevel + 1]
  html += `<h3>${w.basket} · ${state.basket.length}/${basketCapacity(state)}</h3>`
  if (basket) html += `<button type="button" data-action="upgrade-basket" data-level="${state.basketLevel + 1}"
    ${state.coins < basket.upgradeCost ? 'disabled' : ''}>${w.expand} · ${basket.capacity} · ${basket.upgradeCost} ${w.coins}</button>`
  return html
}
