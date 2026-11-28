import { inventoryPanel, inventoryWords, type InventoryTab, type InventorySort } from './inventory'
import { describe, field, portrait } from './specimens'
import { common, sameProfile } from '../game/genetics'
import { chance, cycleSeconds, pollinationFor } from '../game/queries'
import type { Profile, Species } from '../game/model'
import type { Mode, WorldView } from '../runtime/presentation'
import { adjacent, auras, bedLevels, isHybrid, recipes, speciesIds, speciesInfo } from '../game/config'
import { isRecipeActive, basketCapacity, basketCount, canRecoverGarden, canReplace, expansionCost, isRecipeRevealed, seedUnlocked } from '../game/queries'
import { quickSaleValue } from '../game/trade'
import { decorUnlocked, harmony } from '../game/decor'
import { alpha } from './alpha'
import { removalIssue, secondsLeft } from '../game/queries'
import { gardenHint, recoveryHint } from './onboarding'
import { recipeCard, recipeKnown } from './panels/recipes'
import { decorPanel, gardenWords, journalPanel, type DecorChoice } from './panels/garden'
import { automationPanel, automationWords } from './panels/automation'
import { plantName, words } from './strings'

export type Overlay = 'nursery' | 'settings' | 'collection' | 'helper' | 'journal' | 'decor' | 'inventory'
export type CollectionFilter = 'all' | 'base' | 'hybrids'

interface PanelState {
  inventoryFilter:string
  inventoryTab:InventoryTab
  inventorySort:InventorySort
  inventoryAmounts:Record<string,number>
  inventoryMinimum:number
  inventoryDetail:string|null
  stock?:Profile
  cornerPlanted:boolean
  firstSeeds:Species[]
  branch:'experiment'|'corner'|null
  confirmId:number|null
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
  inventoryFilter, inventoryTab, inventorySort, inventoryAmounts, inventoryMinimum, inventoryDetail,
  stock, cornerPlanted, firstSeeds, branch, confirmId, overlay, warning, notice, chosen, returnId, collectionFilter, entry, chapter, slot, decorChoice
}:PanelState):string {
  const settingsOpen = overlay === 'settings'
  const collectionOpen = overlay === 'collection'
  const helperOpen = overlay === 'helper'
  const journalOpen = overlay === 'journal'
  const decorOpen = overlay === 'decor'
  const name = (id:Species) => plantName(view.state.lang,id)
  const s = view.state, w = words[s.lang], selected = view.selected, plot = selected === null ? null : s.plots[selected]
  const f=field[s.lang]
  const full = s.plots.every(p => p.open && p.plant)
  const goal = gardenHint(s)
  let panel = ''
  const garden = gardenWords[s.lang]
  const a=alpha[s.lang]
  const inventory=inventoryWords[s.lang]
  const switches=button('language',w.language) + button('music',a.music+' · '+(s.musicMuted ? garden.off : garden.on),`aria-pressed="${!s.musicMuted}"`) +
    button('sound',a.effects+' · '+(s.muted ? garden.off : garden.on),`aria-pressed="${!s.muted}"`)
  const progress=`${w.collection} ${s.planted.length}/${speciesIds.length} · ${a.beds} ${s.plots.filter(p=>p.open).length}/${s.plots.length}`
  if (view.menu) return `<main class="menu-screen"><section class="menu-card"><span class="menu-leaf">${svg(icons.garden)}</span>
    <h1>${w.title}</h1><p>${a.promise}</p>${view.started ? '<p>'+progress+'</p>' : ''}
    ${button('enter',view.started ? a.resume : a.start,'class="menu-primary"')}${view.started || warning==='future' || warning==='damaged' ? button('new-game',a.fresh) : ''}
    <div class="switches">${switches}</div>${warning ? '<p role="status">'+(w as Record<string,string>)[warning]+'</p>'+button('export-save',garden.export) : ''}
    <small>Wonder Garden · Alpha 04</small></section></main>`
  if (overlay==='inventory') {
    panel=inventoryPanel(s,{tab:inventoryTab,sort:inventorySort,amounts:inventoryAmounts,
      filter:inventoryFilter,minimum:inventoryMinimum,detail:inventoryDetail})
  } else if (overlay==='nursery') {
    panel='<h2>'+w.nursery+'</h2><p>'+f.help+'</p>'
    for(const p of s.nursery)panel+=button('nursery-return',name(p.species)+' #'+p.id+' · '+describe(s.lang,p)+' · '+f.lives+' '+p.lives+'/'+p.maxLives+' · '+w.return,'data-id="'+p.id+'"')
  } else if (settingsOpen) {
    panel = `<h2>${w.settings}</h2>${switches}${button('menu',a.menu)}
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
      const title = s.planted.includes(id) || seedUnlocked(s,id) ? name(id) : w.unknown
      const label = s.planted.includes(id) ? w.studied : isHybrid(id) && seedUnlocked(s,id) ? w.revealed : w.unknown
      panel += button('entry',(s.planted.includes(id) || seedUnlocked(s,id) ? portrait(id) : '')+title + ' · T'+(speciesInfo[id].generation+1)+' · ' + label,`data-entry="${id}" aria-expanded="${entry === id}"`)
      if (entry === id && (s.planted.includes(id) || seedUnlocked(s,id))) {
        const info = speciesInfo[id]
        const single=info.lifecycle==='single'
        panel += `<p>${single?inventory.single:inventory.multi} · ${w.cycle} ${info.cycleSec} ${w.sec}
          ${single?'':' · '+inventory.regrow+' '+info.regrowSec+' '+w.sec}</p>`
        panel+='<p>'+f.fruits+' '+info.fruits.join('–')+' × '+info.fruitValue+' ◈ · '+w.seeds+' '+info.ownSeeds.join('–')+' · '+f.lives+' '+info.lives+'</p>'
        const rates=(v:typeof info)=>60*v.lives/(v.cycleSec+v.regrowSec*(v.lives-1))
        const income=(v:typeof info)=>rates(v)*(v.fruits[0]+v.fruits[1])/2*v.fruitValue
        for(const [label,get] of [[f.speed,rates],[f.income,income],[garden.harmony,(v:typeof info)=>v.harmony]] as const){
          panel+='<label class="rating">'+label+' <meter value="'+get(info)+'" max="'+Math.max(...Object.values(speciesInfo).map(get))+'"></meter></label>'
        }
        for(const r of recipes.filter(r=>recipeKnown(s,r) && (r.primary===id || r.neighbors.includes(id))))panel+=recipeCard(s,r,null)
        for (const aura of auras.filter(a => a.source === id)) {
          const targets = Array.isArray(aura.targets) ? aura.targets.map(s => name(s as Species)).join(', ') : aura.targets === 'all' ? w.allPlants : w.hybrids
          const amount = Math.round(100*aura.bonus) + '%'
          panel += `<p>${w.aura} · ${w[aura.kind as 'growth'|'price'|'propagation']} ${amount} (${targets})</p>`
        }
      }
    }
  } else if (view.mode === 'plant') {
    panel += `<h2>${w.plant}</h2><p>${returnId === null ? w.chooseSeed : w.chooseReturn}</p>`
    if (full && !isRecipeRevealed(s)) panel += `<p class="hint">${w.full}</p>`
    if (chosen) panel += button('cancel-seed',name(chosen)+' · '+(stock?f.stock+' · '+describe(s.lang,stock):isHybrid(chosen)?f.stock:f.buy)+' · '+w.cancel)
    if (plot && !plot.open) panel += '<p>'+a.closed+'</p>'
    if (plot?.plant && s.sold) panel += '<p>'+ (canReplace(s) ? w.replaceHint : a.occupied)+'</p>'+button('shovel',a.shovel)
    if (returnId !== null) panel += button('cancel-return',w.cancel)
    if (canRecoverGarden(s)) {
      panel += `<p class="hint">${garden.recovery}</p>`
      if (plot?.open && !plot.plant) panel += button('emergencyRadish',garden.recovery,'class="primary"')
    }
    panel += '<div class="seed-list">'
    for (const id of speciesIds) {
      if (isHybrid(id) && !seedUnlocked(s,id)) continue
      const data = speciesInfo[id]
      const packs=[{...common,count:s.seeds[id]},...s.variants.filter(v=>v.species===id)]
      for(const pack of packs.filter(v=>v.count>0))panel+=button('seed',f.stock+' · '+name(id)+' T'+(data.generation+1)+' · '+describe(s.lang,pack)+' ×'+pack.count,`data-seed="${id}" aria-pressed="${chosen===id && !!stock && sameProfile(pack,stock)}" data-profile='${JSON.stringify({rarity:pack.rarity,plus:pack.plus,minus:pack.minus})}'`)
      if(isHybrid(id))continue
      const locked = !seedUnlocked(s,id)
      const price = f.buy+' · '+data.seedPrice+' ◈'
      const lowFunds = data.seedPrice !== null && s.coins < data.seedPrice

      panel += button('seed',`<span class="seed-dot seed-${id}"></span><span><strong>${name(id)} · T1 · ${f.common}</strong><small>${locked ? (id === 'moonflower' ? w.needBlue : id === 'clover' ? w.needRecipe : w.seedHint) : lowFunds ? price + ' · −' + (data.seedPrice!-s.coins)+' ◈' : price}</small></span>`,`data-seed="${id}" class="seed ${chosen === id && !stock ? 'chosen' : ''}"`,locked || lowFunds)
    }
    panel += '</div>'

    if (s.nursery.length) {
      panel += `<h3>${w.nursery}</h3><div class="nursery-list">`
      for (const p of s.nursery) panel += button('return',`${name(p.species)} · #${p.id} · ${describe(s.lang,p)} · ${p.lives}/${p.maxLives} — ${w.return}`,`data-id="${p.id}"`)
      panel += '</div>'
    }
  } else if (view.mode === 'breed') {
    panel += '<h2>' + w.breed + '</h2>'
    panel += button('collect',a.collect)
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
        const next=plot.level === 1 ? 2 : 3
        panel += `<p>${['','I','II','III'][plot.level]} → ${['','I','II','III'][next]}<br>${w.growth} ×${bedLevels[plot.level].growthMultiplier} → ×${bedLevels[next].growthMultiplier}<br>${w.price} ×${bedLevels[plot.level].priceMultiplier} → ×${bedLevels[next].priceMultiplier}</p>`
        panel += button('upgrade',`${w.upgrade} · ${cost} ◈`,'class="primary"',s.coins < cost)
      }
      if (plot.plant) panel += button('move',w.move)
      if (plot.plant && isRecipeRevealed(s)) panel += button('store',w.store,'data-id="'+plot.plant.id+'"')
    }
  } else if (view.shovel && !plot?.plant) panel='<h2>'+a.shovel+'</h2><p>'+a.select+'</p>'
  else if (plot) {
    panel += `<h2>${plot.plant ? name(plot.plant.species) : plot.open ? w.empty : w.closed}</h2><p>${w.plot} ${selected! + 1} · ${w.level} ${plot.level}</p>`
    if (plot.plant) {
      panel += `<div class="progress"><span style="width:${Math.round(plot.plant.progress * 100)}%"></span></div><p>${plot.plant.readySince !== null ? w.ready : `${w.growing} · ${secondsLeft(s,selected!)} ${w.sec}`}</p>`
      panel+='<p>T'+(speciesInfo[plot.plant.species].generation+1)+' · '+describe(s.lang,plot.plant)+' · '+f.lives+' '+plot.plant.lives+'/'+plot.plant.maxLives+' · '+w.cycle+' '+cycleSeconds(s,selected!).toFixed(1)+' '+w.sec+'</p>'
      panel += '<p>'+(speciesInfo[plot.plant.species].lifecycle==='single' ? inventory.single : inventory.multi)
        +' · '+(pollinationFor(s,selected!) ? inventory.pollinated : inventory.plain)+'</p>'
      if (view.shovel) {
        const id=plot.plant.id
        if (confirmId===id) {
          panel += '<p>'+a.confirm(name(plot.plant.species),['','I','II','III'][plot.level])+' '+(plot.plant.readySince!==null?a.lost:'')+'</p>'
          if (s.plots.filter(p=>p.plant).length===1) panel+='<p>'+recoveryHint(s)+'</p>'
          panel+=button('confirm-compost',a.compost,'data-id="'+id+'"')+button('cancel-compost',w.cancel)
        } else {
          if (!removalIssue(s,selected!,id,'store')) panel+=button('store',w.store,'data-id="'+id+'"')
          const issue=removalIssue(s,selected!,id,'compost')
          panel+=issue ? '<p>'+a.lastHybrid+'</p>' : button('compost',a.compost,'data-id="'+id+'"')
        }
       } else {
        const p=plot.plant
        const attrs='data-id="'+p.id+'" data-cycle="'+p.lives+'"'
        const disabled=p.readySince===null
        panel+=button('harvest',w.harvest,attrs,disabled)
      }
    }
  }
  const modes: Mode[] = ['garden','plant','breed','build']
  const warningText = warning ? (w as Record<string,string>)[warning] : ''
  const honey=recipes.find(r=>r.result==='honey_clover')!
  let branchHint=goal, branchButton=''
  if (branch==='experiment') {
    branchHint=s.planted.includes(honey.result) ? a.honeyBenefit : a.experimentHint
    if (!s.planted.includes(honey.result)) {
      branchHint+=' · '+(chance(s,honey.result)*100)+'%'
      const next=seedUnlocked(s,honey.result) ? honey.result : !s.plots.some(p=>p.plant?.species==='clover') ? 'clover' :
        !s.plots.some(p=>p.plant?.species==='sunflower') ? 'sunflower' : null
      if(next==='clover' && !s.seeds.clover)branchHint+=' · '+name(next)+' '+speciesInfo.clover.seedPrice+' ◈'+(s.coins<speciesInfo.clover.seedPrice!?' (−'+(speciesInfo.clover.seedPrice!-s.coins)+' ◈)':'')
      branchButton=next ? button('branch-seed',a.plant+' · '+name(next),'data-seed="'+next+'"',!s.seeds[next] && s.coins<(speciesInfo[next].seedPrice??0)) :
        s.plots.some((_,i)=>isRecipeActive(s,i,honey)) ? button('collect',a.collect) : button('mode',w.move,'data-mode="build"')
    }
  } else if (branch==='corner') {
    branchHint=a.cornerHint
    branchButton=cornerPlanted ? button('decor',garden.decor) : s.plots.some(p=>p.open&&!p.plant) ?
      button('mode',w.plant,'data-mode="plant"') : button('corner-shovel',a.shovel)
  }
  const guide = !s.tutorialSkipped && !s.planted.includes('solar_strawberry')
  const targetSeed=s.revealed.includes('solar_strawberry') ? 'solar_strawberry' :
    !s.plots.some(p=>p.plant?.species==='strawberry') ? 'strawberry' : !s.plots.some(p=>p.plant?.species==='sunflower') ? 'sunflower' : null
  const needed=targetSeed && !s.seeds[targetSeed] ? speciesInfo[targetSeed].seedPrice ?? 0 : 0
  const canExtract = s.basket.some(batch=>batch.profile && (!s.firstExtraction || batch.lots.some(lot=>lot.crossPending)))
  const hasSolarCross = !s.revealed.includes('solar_strawberry') && s.basket.some(batch=>
    batch.pollination?.result==='solar_strawberry' && batch.lots.some(lot=>lot.crossPending))
  const guideAction=hasSolarCross || canExtract && (!s.sold || !targetSeed || !s.firstExtraction) ? 'inventory' :
    !s.firstSeedPlanting && (s.variants.length || Object.values(s.seeds).some(Boolean)) ? 'inventory' :
    s.basket.length && (!s.sold || s.coins<needed) ? 'sell' :
    !s.sold || s.coins<needed || !targetSeed ? 'collect' : s.plots.every(p=>!p.open || p.plant) && !canReplace(s) ? 'shovel' : 'plant'
  const quickValue=quickSaleValue(s)
  return `<div class="garden-ui" data-guide="${guide ? guideAction : ''}" data-guide-seed="${guide && targetSeed ? targetSeed : ''}"><header class="topbar"><div class="brand"><span class="brand-mark">${svg(icons.garden)}</span><span><small>${w.subtitle}</small><strong>${w.title}</strong></span></div><div class="stats"><div class="stat"><span class="stat-icon">${svg('<circle cx="12" cy="12" r="8"/><path d="M12 7v10m-3-7h6m-6 4h6"/>')}</span><span><small>${w.coins}</small><strong>${s.coins}</strong></span></div><button type="button" class="stat basket" data-action="inventory" aria-expanded="${overlay==='inventory'}"><span class="stat-icon">${svg('<path d="M4 10h16l-2 10H6L4 10ZM8 10c0-7 8-7 8 0M8 13l1 4m3-4v4m4-4-1 4"/>')}</span><span><small>${inventory.title}</small><strong>${basketCount(s)}/${basketCapacity(s)}</strong></span></button>${button('sell',`${w.sell} · ${quickValue} ◈`,'class="sell"',!quickValue)}<button type="button" data-action="collection" aria-expanded="${collectionOpen}" class="stat collection"><span class="stat-icon">${svg(icons.breed)}</span><span><small>${w.collection}</small><strong>${s.planted.length}/${speciesIds.length}</strong></span></button></div><div class="top-actions">${isRecipeRevealed(s)?button('nursery',w.nursery):''}${button('journal',garden.journal,'class="quiet" aria-expanded="'+journalOpen+'"')}${button('settings',w.settings,'class="quiet" aria-expanded="'+settingsOpen+'"')}</div></header>
    <div class="goal-card"><span class="eyebrow">${w.goal}</span><p>${!s.plots.some(p=>p.plant) ? recoveryHint(s) : s.planted.includes('solar_strawberry') && branch ? branchHint : s.tutorialSkipped && !s.planted.includes('solar_strawberry') ? '' : goal}</p>${branchButton}
    ${s.planted.includes('solar_strawberry') ? button('experiment',a.experiment)+button('corner',a.corner) : !s.tutorialSkipped ? button('skip',a.skip,'class="quiet"') : ''}
    ${s.sold && view.mode==='garden' ? button('shovel',svg('<path d="m16 3 4 4-3 3-4-4zM15 8l-6 7m-2-3 5 5-4 4-5-1 0-5z"/>')+a.shovel,'class="shovel" aria-pressed="'+view.shovel+'"') : ''}<small class="harmony-label">${garden.harmony} · ${harmony(s)}</small>${s.sold ? button('helper',svg(icons.garden) + automationWords[s.lang].name,`class="helper-link" aria-expanded="${helperOpen}"`) : ''}</div>
    ${panel ? `<aside class="context${overlay==='inventory'?' inventory-context':''}">${overlay || journalOpen || decorOpen || helperOpen || collectionOpen || selected !== null ? button('close','×',`class="close" aria-label="${w.close}"`) : ''}<div class="context-inner">${panel}</div></aside>` : ''}
    ${overlay==='inventory'?'':`<div class="camera">${button('zoomIn','+',`aria-label="${w.zoomIn}" title="${w.zoomIn}"`)}${button('zoomOut','−',`aria-label="${w.zoomOut}" title="${w.zoomOut}"`)}${button('center','⌾',`aria-label="${w.center}" title="${w.center}"`)}</div>`}
    <nav class="modes" aria-label="${w.title}">${modes.map(m => button('mode',`${svg(icons[m])}<strong>${w[m]}</strong>`,`data-mode="${m}" class="${view.mode === m ? 'active' : ''}" aria-pressed="${view.mode === m}"`,(m === 'build' && !s.sold) || (m === 'breed' && !s.planted.includes('strawberry') && !isRecipeRevealed(s)))).join('')}</nav>
    ${warningText ? `<div class="warning" role="status">${warningText}</div>` : ''}${firstSeeds.length ? `<div class="notice reward" role="status"><strong>${firstSeeds.map(name).join(' · ')} · ${a.restored}</strong><p>${f.help}</p>${firstSeeds.map(id=>button('plant-reward',firstSeeds.length===1 ? f.hybrid : a.plant+' · '+name(id),'data-seed="'+id+'"')).join('')}${button('nursery',f.green)}${button('later',a.later)}</div>` : notice ? `<div class="notice" role="status">${notice}</div>` : ''}<div class="keyboard-beds">${s.plots.map((p,i)=>button('pick-bed',w.plot+' '+(i+1)+' · '+(p.plant ? name(p.plant.species) : p.open ? w.empty : w.closed),'data-id="'+i+'"')).join('')}</div></div>`
}
