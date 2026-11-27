import type { Species } from '../game/model'
import type { Mode, WorldView } from '../runtime/presentation'
import { adjacent, auras, bedLevels, isHybrid, recipes, speciesIds, speciesInfo } from '../game/config'
import { basketCapacity, canRecoverGarden, canReplace, expansionCost, isRecipeRevealed, saleValue, seedUnlocked } from '../game/queries'
import { decorUnlocked, harmony } from '../game/decor'
import { gardenHint } from './onboarding'
import { recipeCard, recipeKnown } from './panels/recipes'
import { decorPanel, gardenWords, journalPanel, type DecorChoice } from './panels/garden'
import { automationPanel, automationWords } from './panels/automation'
import { plantName, words } from './strings'

export type Overlay = 'settings' | 'collection' | 'helper' | 'journal' | 'decor'
export type CollectionFilter = 'all' | 'base' | 'hybrids'

interface PanelState {
  overlay: Overlay | null
  warning: string | null
  notice: string
  chosen: Species | null
  returnId: number | null
  collectionFilter: CollectionFilter
  entry: Species | null
  chapter: number | null
  slot: string | null
  decorChoice: DecorChoice | null
}

const icons: Record<Mode,string> = {
  garden:'<path d="M12 21v-9m0 5c-5 0-7-3-7-6 4-1 7 1 7 5m0-3c0-5 3-8 7-8 1 4-2 8-7 8"/>',
  plant:'<path d="M5 20h14M7 20c0-5 2-7 5-7s5 2 5 7M12 13V5m0 5C8 10 7 8 7 6c3-1 5 1 5 4m0-1c0-3 2-5 5-5 1 3-1 5-5 5"/>',
  breed:'<path d="M12 3c1 5 3 7 8 8-5 1-7 3-8 8-1-5-3-7-8-8 5-1 7-3 8-8ZM19 17v4m-2-2h4"/>',
  build:'<path d="M3 11 12 4l9 7M6 10v10h12V10M10 20v-6h4v6"/>'
}
const svg = (content:string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`
const button = (action:string, label:string, extra='', disabled=false) => `<button type="button" data-action="${action}" ${extra} ${disabled ? 'disabled' : ''}>${label}</button>`

export function uiMarkup(view: WorldView, {
  overlay, warning, notice, chosen, returnId, collectionFilter, entry, chapter, slot, decorChoice
}:PanelState):string {
  const settingsOpen = overlay === 'settings'
  const collectionOpen = overlay === 'collection'
  const helperOpen = overlay === 'helper'
  const journalOpen = overlay === 'journal'
  const decorOpen = overlay === 'decor'
  const name = (id:Species) => plantName(view.state.lang,id)
  const s = view.state, w = words[s.lang], selected = view.selected, plot = selected === null ? null : s.plots[selected]
  const full = s.plots.every(p => p.open && p.plant)
  const goal = gardenHint(s)
  let panel = ''
  const garden = gardenWords[s.lang]
  if (settingsOpen) {
    panel = `<h2>${w.settings}</h2>${button('language',w.language)}
      ${button('sound',garden.sound + ' · ' + (s.muted ? garden.off : garden.on),'aria-pressed="'+!s.muted+'"')}
      ${button('center',w.center)}${button('export-save',garden.export)}${button('reset',w.reset)}`
  } else if (journalOpen) panel = journalPanel(s,chapter)
  else if (decorOpen) panel = decorPanel(s,slot,decorChoice)
  else if (helperOpen) panel = automationPanel(s)
  else if (collectionOpen) {
    panel = '<h2>' + w.collection + ' · ' + s.planted.length + '/' + speciesIds.length + '</h2>'
    panel += '<div class="book-filters">' + (['all','base','hybrids'] as const).map(filter =>
      button('filter',w[filter],`data-filter="${filter}" aria-pressed="${collectionFilter === filter}"`)
    ).join('') + '</div>'
    for (const id of speciesIds) {
      if ((collectionFilter === 'base' && isHybrid(id)) || (collectionFilter === 'hybrids' && !isHybrid(id))) continue
      const recipe = recipes.find(r => r.result === id)
      const title = recipe && !recipeKnown(s,recipe) ? '◇' : name(id)
      const label = s.planted.includes(id) ? w.studied : isHybrid(id) && seedUnlocked(s,id) ? w.revealed : w.unknown
      panel += button('entry',title + ' · ' + label,`data-entry="${id}" aria-expanded="${entry === id}"`)
      if (entry === id) {
        if (recipe) panel += recipeCard(s,recipe,null)
        if (recipe && !recipeKnown(s,recipe)) continue
        const info = speciesInfo[id]
        panel += `<p>${w.cycle} · ${info.cycleSec} ${w.sec}</p>`
        if (recipe) panel += `<p>${w.multiply} · ${info.propagationThreshold} ${w.harvests}</p>`
        for (const aura of auras.filter(a => a.source === id)) {
          const targets = Array.isArray(aura.targets) ? aura.targets.map(s => name(s as Species)).join(', ') : aura.targets === 'all' ? w.allPlants : w.hybrids
          const amount = aura.kind === 'propagation' ? '+' + aura.bonus : '+' + Math.round(100*aura.bonus) + '%'
          panel += `<p>${w.aura} · ${w[aura.kind as 'growth'|'price'|'propagation']} ${amount} (${targets})</p>`
        }
      }
    }
  } else if (view.mode === 'plant') {
    panel += `<h2>${w.plant}</h2><p>${returnId === null ? w.chooseSeed : w.chooseReturn}</p>`
    if (full && !isRecipeRevealed(s)) panel += `<p class="hint">${w.full}</p>`
    if (returnId !== null) panel += button('cancel-return',w.cancel)
    if (canRecoverGarden(s)) {
      panel += `<p class="hint">${garden.recovery}</p>`
      if (plot?.open && !plot.plant) panel += button('emergencyRadish',garden.recovery,'class="primary"')
    }
    panel += '<div class="seed-list">'
    for (const id of speciesIds) {
      if (isHybrid(id) && !seedUnlocked(s,id)) continue
      const data = speciesInfo[id], locked = !seedUnlocked(s,id)
      const price = isHybrid(id) ? `${s.seeds[id]} ${w.seeds}` : `${data.seedPrice} ◈`
      const lowFunds = data.seedPrice !== null && s.coins < data.seedPrice
      const outOfStock = isHybrid(id) && s.seeds[id] === 0
      panel += button('seed',`<span class="seed-dot seed-${id}"></span><span><strong>${name(id)}</strong><small>${locked ? (id === 'moonflower' ? w.needBlue : id === 'clover' ? w.needRecipe : w.seedHint) : lowFunds ? price + ' · ' + w.funds : price}</small></span>`,`data-seed="${id}" class="seed ${chosen === id ? 'chosen' : ''}"`,locked || lowFunds || outOfStock)
    }
    panel += '</div>'
    if (plot?.plant && !(full && !isRecipeRevealed(s))) panel += `<p class="hint">${canReplace(s) ? w.replaceHint : w.locked}</p>`
    if (s.nursery.length) {
      panel += `<h3>${w.nursery}</h3><div class="nursery-list">`
      for (const p of s.nursery) panel += button('return',`${name(p.species)} · #${p.id} — ${w.return}`,`data-id="${p.id}"`)
      panel += '</div>'
    }
  } else if (view.mode === 'breed') {
    panel += '<h2>' + w.breed + '</h2>'
    panel += recipes.map(recipe => recipeCard(s,recipe,selected)).join('')
  } else if (view.mode === 'build') {
    panel += `<h2>${w.build}</h2>`
    if (decorUnlocked(s)) panel += button('decor',garden.decor)
    else panel += `<p>${garden.decorLocked}</p>`
    if (view.moveFrom !== null) panel += `<p>${w.destination}</p>` + button('cancel',w.cancel)
    else if (!plot) panel += `<p>${w.selectPlot}</p>`
    else if (!plot.open) {
      const cost = expansionCost(s)!
      const neighboring = adjacent(selected!).some(index => s.plots[index].open)
      panel += `<p>${w.closed}</p>` + button('clear',`${w.clear} · ${cost} ◈`,'class="primary"',!neighboring || s.coins < cost)
      if (!neighboring) panel += `<p>${w.notAdjacent}</p>`
      else if (s.coins < cost) panel += `<p>${w.funds}</p>`
    }
    else {
      panel += `<p>${w.plot} ${selected! + 1} · ${w.level} ${plot.level}</p>`
      if (plot.level < 3) {
        const cost = bedLevels[plot.level === 1 ? 2 : 3].upgradeCost
        panel += button('upgrade',`${w.upgrade} · ${cost} ◈`,'class="primary"',s.coins < cost)
      }
      if (plot.plant) panel += button('move',w.move)
      if (plot.plant && isRecipeRevealed(s)) panel += button('store',w.store)
    }
  } else if (plot) {
    panel += `<h2>${plot.plant ? name(plot.plant.species) : plot.open ? w.empty : w.closed}</h2><p>${w.plot} ${selected! + 1} · ${w.level} ${plot.level}</p>`
    if (plot.plant) {
      panel += `<div class="progress"><span style="width:${Math.round(plot.plant.progress * 100)}%"></span></div><p>${plot.plant.readySince !== null ? w.ready : `${w.growing} · ${Math.floor(plot.plant.progress * 100)}%`}</p>`
      if (isHybrid(plot.plant.species)) panel += `<p>${w.multiply} · ${plot.plant.propagation}/${speciesInfo[plot.plant.species].propagationThreshold}</p>`
      if (plot.plant.readySince !== null) panel += button('harvest',w.harvest,'class="primary"')
    }
  }
  const modes: Mode[] = ['garden','plant','breed','build']
  const warningText = warning ? (w as Record<string,string>)[warning] : ''
  return `<header class="topbar"><div class="brand"><span class="brand-mark">${svg(icons.garden)}</span><span><small>${w.subtitle}</small><strong>${w.title}</strong></span></div><div class="stats"><div class="stat"><span class="stat-icon">${svg('<circle cx="12" cy="12" r="8"/><path d="M12 7v10m-3-7h6m-6 4h6"/>')}</span><span><small>${w.coins}</small><strong>${s.coins}</strong></span></div><button type="button" class="stat basket" data-action="helper" aria-expanded="${helperOpen}" ${s.sold ? '' : 'disabled'}><span class="stat-icon">${svg('<path d="M4 10h16l-2 10H6L4 10ZM8 10c0-7 8-7 8 0M8 13l1 4m3-4v4m4-4-1 4"/>')}</span><span><small>${w.basket}</small><strong>${s.basket.length}/${basketCapacity(s)}</strong></span></button>${button('sell',`${w.sell} · ${saleValue(s)} ◈`,'class="sell"',!s.basket.length)}<button type="button" data-action="collection" aria-expanded="${collectionOpen}" class="stat collection"><span class="stat-icon">${svg(icons.breed)}</span><span><small>${w.collection}</small><strong>${s.planted.length}/${speciesIds.length}</strong></span></button></div><div class="top-actions">${button('journal',garden.journal,'class="quiet" aria-expanded="'+journalOpen+'"')}${button('settings',w.settings,'class="quiet" aria-expanded="'+settingsOpen+'"')}</div></header>
    <div class="goal-card"><span class="eyebrow">${w.goal}</span><p>${goal}</p><small class="harmony-label">${garden.harmony} · ${harmony(s)}</small>${s.sold ? button('helper',svg(icons.garden) + automationWords[s.lang].name,`class="helper-link" aria-expanded="${helperOpen}"`) : ''}</div>
    ${panel ? `<aside class="context">${settingsOpen || journalOpen || decorOpen || helperOpen || collectionOpen || selected !== null ? button('close','×',`class="close" aria-label="${w.close}"`) : ''}<div class="context-inner">${panel}</div></aside>` : ''}
    <div class="camera">${button('zoomIn','+',`aria-label="${w.zoomIn}" title="${w.zoomIn}"`)}${button('zoomOut','−',`aria-label="${w.zoomOut}" title="${w.zoomOut}"`)}${button('center','⌾',`aria-label="${w.center}" title="${w.center}"`)}</div>
    <nav class="modes" aria-label="${w.title}">${modes.map(m => button('mode',`${svg(icons[m])}<strong>${w[m]}</strong>`,`data-mode="${m}" class="${view.mode === m ? 'active' : ''}" aria-pressed="${view.mode === m}"`,(m === 'build' && !s.sold) || (m === 'breed' && !s.planted.includes('sunflower') && !isRecipeRevealed(s)))).join('')}</nav>
    ${warningText ? `<div class="warning" role="status">${warningText}</div>` : ''}${notice ? `<div class="notice" role="status">${notice}</div>` : ''}`
}
