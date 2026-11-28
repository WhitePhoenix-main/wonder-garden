import type { GameState } from '../../game/model'
import { basketCapacity, oldestReadyPlot } from '../../game'
import { basketCount } from '../../game/queries'
import { autoSellOffer, helperLevels, basketLevels, evolution, market } from '../../game/config'
import { plotModes, rarities } from '../../game/model'
import { field } from '../specimens'
import { saleStatus } from '../../game/automation'
import { saleMinimum } from '../../game/market'

export const modeLabels={
  ru:['Ручная','Продажа','Семена','Селекция','Поддержка'],
  en:['Manual','Commercial','Seeds','Breeding','Support']
}

export const templateDetails={
  ru:['Ручной сбор, без автопересадки','Автосбор для продажи','Автосбор для пополнения семян','Автосбор для селекции','Сохранение растения для ауры, без автосбора и пересадки'],
  en:['Manual harvest, no automatic replanting','Automatic harvest for sale','Automatic harvest to replenish seeds','Automatic harvest for breeding','Preserve the aura plant without automatic harvesting or replanting']
}

export const productionLabels={
  ru:{manual:'Ручное управление',protected:'Растение сохраняется',growing:'Ожидает роста',awaitingSale:'Ждёт выгодной продажи',full:'В корзине мало места',busy:'Ожидает Листика',profile:'Выберите профиль пересадки',noSeeds:'Нет семян профиля',reserve:'Достигнут резерв семян',cleanup:'Ожидает уборки',helperLevel:'Нужен Листик III уровня'},
  en:{manual:'Manual operation',protected:'Plant is being preserved',growing:'Waiting for growth',awaitingSale:'Waiting for a favorable sale',full:'Not enough basket space',busy:'Waiting for Leafy',profile:'Choose a replanting profile',noSeeds:'No seeds of this profile',reserve:'Seed reserve reached',cleanup:'Waiting for cleanup',helperLevel:'Requires Leafy level III'}
}

const saleLabels={
  ru:{disabled:'Автопродажа выключена',ready:'Есть товары для продажи',price:'Ожидание выгодной котировки',order:'Товары зарезервированы для заказов',protected:'Урожай защищён',breeding:'Партии оставлены для селекции',reserve:'Семена в резерве',empty:'Нет доступных товаров'},
  en:{disabled:'Auto-sell is off',ready:'Goods are ready for sale',price:'Waiting for a favorable price',order:'Goods reserved for orders',protected:'Harvest is protected',breeding:'Batches kept for breeding',reserve:'Seeds are reserved',empty:'No goods available for sale'}
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
    html += `<p class="hint">${saleLabels[state.lang][saleStatus(state)]}<br>${w.countdown} · ${Math.ceil(state.sellRemaining)} ${w.sec}</p>`
    if (state.stallLevel>=4) {
      const ru=state.lang==='ru'
      const labels=ru ? ['Быстрая продажа','Сбалансированная','Максимальная прибыль','Пользовательская'] : ['Quick sale','Balanced','Maximum profit','Custom']
      html+=`<label>${ru?'Стратегия продаж':'Sale strategy'} <select data-sale-strategy>
        ${(['quick','balanced','profit','custom'] as const).map((key,i)=>`<option value="${key}" ${state.trading.strategy===key?'selected':''}>${labels[i]}</option>`).join('')}
        </select></label><p>${ru?'Минимальная котировка':'Minimum quote'} · ${saleMinimum(state.trading)}%</p>`
      if (state.trading.strategy==='custom') {
        const values=Array.from({length:market.maximumPricePercent-market.minimumPricePercent+1},(_,i)=>market.minimumPricePercent+i)
        html+=`<label>${ru?'Порог':'Threshold'} <select data-sale-minimum>
          ${values.map(value=>`<option value="${value}" ${value===state.trading.minimum?'selected':''}>${value}%</option>`).join('')}</select></label>
          <button type="button" data-action="trading-toggle" data-setting="overflow" aria-pressed="${state.trading.overflow}">${ru?'Продажа при заполнении':'Sell when basket fills'} · ${market.strategy.overflowPercent}%</button>`
      }
      html+=`<button type="button" data-action="trading-toggle" data-setting="reserveOrders" aria-pressed="${state.trading.reserveOrders}">${ru?'Сохранять товары для заказов':'Reserve goods for orders'}</button>`
    }
  } else {
    html += `<button type="button" data-action="buy-auto-sell"
      ${level < autoSellOffer.minHelperLevel || state.coins < autoSellOffer.cost ? 'disabled' : ''}>
      ${w.enable} · ${autoSellOffer.cost} ${w.coins}</button>`
    if (level < autoSellOffer.minHelperLevel) html += `<p>${w.needs}</p>`
  }
  const basket = basketLevels[state.basketLevel + 1]
  if (level) {
    html+=`<h3>${state.lang==='ru'?'Шаблон для всего участка':'Template for all open beds'}</h3>
      <div class="book-filters">${plotModes.map((mode,i)=>`<button type="button" data-action="plot-template-all" data-mode="${mode}">${modeLabels[state.lang][i]}</button>`).join('')}</div>`
  }
  html += `<h3>${w.basket} · ${used}/${basketCapacity(state)}</h3>`
  if (basket) html += `<button type="button" data-action="upgrade-basket" data-level="${state.basketLevel + 1}"
    ${state.coins < basket.upgradeCost ? 'disabled' : ''}>${w.expand} · ${basket.capacity} · ${basket.upgradeCost} ${w.coins}</button>`
  return html
}
