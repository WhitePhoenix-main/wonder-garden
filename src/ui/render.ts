import { statisticsPanel } from './panels/statistics'
import { evolutionPanel } from './panels/evolution'
import { marketPanel, type MarketSort } from './panels/market'
import { availableStock, defaultPolicy, isBusy } from '../game/evolution'
import { inventoryPanel, inventoryWords, type InventoryTab, type InventorySort } from './inventory'
import { describe, field, plantDescriptions, portrait, specializations } from './specimens'
import { availableTraits, canonical, common, sameProfile } from '../game/genetics'
import { allSeedPacks } from '../game/stock-policy'
import { auraBonus, chance, cycleSeconds, donorCandidates, gardenBatchTargets, pollinationFor, researchDirections, reactionHasSymbiosis, researchStatus } from '../game/queries'
import { readyFruitSaleValue } from '../game/trade'
import { plantStats } from '../game/genetics'
import { rarities, type BedLevel, type MarketKind, type Profile, type Species, type Rarity } from '../game/model'
import type { Mode, WorldView } from '../runtime/presentation'
import { adjacent, auras, bedLevels, breedingRecipes, isHybrid, plotIndices, recipes, speciesIds, speciesInfo } from '../game/config'
import { isRecipeActive, basketCapacity, basketCount, canRecoverGarden, canReplace, expansionCost, isRecipeRevealed, seedUnlocked } from '../game/queries'
import { productionPanel } from './panels/production'
import { decorUnlocked, harmony } from '../game/decor'
import { alpha } from './alpha'
import { plantingIssue, removalIssue, secondsLeft } from '../game/queries'
import { gardenHint, guideChapters, recoveryHint, tutorialStep } from './onboarding'
import { recipeCard, recipeKnown, resonanceNames } from './panels/recipes'
import { decorPanel, gardenWords, journalPanel, type DecorChoice } from './panels/garden'
import { automationPanel, automationWords, modeLabels, productionLabels } from './panels/automation'
import { productionStatus } from '../game/automation'
import { plantName, words } from './strings'

export type Overlay = 'statistics' | 'nursery' | 'settings' | 'collection' | 'helper' | 'journal' | 'decor' | 'inventory' | 'evolution' | 'market' | 'bridge'
export type CollectionFilter = 'all' | 'base' | 'hybrids'

export interface RepeatChoice { plot:number; species:Species; profile?:Profile }
interface PanelState {
  repeat:RepeatChoice|null
  statsWindow:60|300
  statsByVolume:boolean
  crossParents:number[]
  marketKind:MarketKind|'orders'|'stall'
  marketSort:MarketSort
  inventorySelected:string[]
  favoriteOnly:boolean
  inventorySearch:string
  inventoryPage:number
  inventoryFilter:string
  inventoryTab:InventoryTab
  inventorySort:InventorySort
  inventoryAmounts:Record<string,number>
  inventoryMinimum:number
  inventoryDetail:string|null
  stock?:Profile
  repeatPlanting:boolean
  cornerPlanted:boolean
  firstSeeds:Species[]
  discoveryRarity:Rarity|null
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
  statsWindow, statsByVolume, repeat, stock, repeatPlanting, cornerPlanted, firstSeeds, discoveryRarity, branch, confirmId, overlay, warning, notice, chosen, returnId, collectionFilter, entry, chapter, slot, decorChoice, crossParents, inventorySelected, favoriteOnly, inventorySearch, inventoryPage, marketKind, marketSort
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
    <small>Wonder Garden · Alpha 10</small></section></main>`
  if (overlay==='statistics') panel=statisticsPanel(s,statsWindow,statsByVolume)
  else if (overlay==='evolution') {
    panel=button('storage',w.nursery)+button('statistics',s.lang==='ru'?'Статистика сада':'Garden statistics')+productionPanel(s)+evolutionPanel(s,crossParents)
  } else if (overlay==='bridge') {
    panel=evolutionPanel(s,crossParents,'bridge')
  } else if (overlay==='market') {
    const sections=[['fruit',s.lang==='ru'?'Урожай':'Harvest'],['seed',s.lang==='ru'?'Семена':'Seeds'],['orders',s.lang==='ru'?'Заказы':'Orders'],['stall',s.lang==='ru'?'Лавка':'Stall']] as const
    panel=`<h2>${s.lang==='ru'?'Рынок':'Market'}</h2><div class="book-filters">${sections.map(([id,label])=>button('market-product',label,`data-kind="${id}" aria-pressed="${marketKind===id}"`)).join('')}</div>`
    panel+=marketKind==='fruit' || marketKind==='seed' ? marketPanel(s,marketKind,marketSort) : evolutionPanel(s,crossParents,marketKind)
  } else if (overlay==='inventory') {
    panel=inventoryPanel(s,{tab:inventoryTab,sort:inventorySort,amounts:inventoryAmounts,
      filter:inventoryFilter,minimum:inventoryMinimum,detail:inventoryDetail,selected:inventorySelected,
      favoriteOnly,search:inventorySearch,page:inventoryPage})
  } else if (overlay==='nursery') {
    panel='<h2>'+w.nursery+'</h2><p>'+f.help+'</p>'
    if(!s.tutorialSkipped && s.greenhouseLevel>=2 && !s.crosses.length) panel+=`<p class="hint">${s.lang==='ru'?'Поместите в питомник два растения одного вида, затем откройте теплицу для селекции.':'Store two plants of the same species, then open the greenhouse to breed them.'}</p>`
    for (const p of s.nursery) {
      const attrs='data-id="'+p.id+'"'
      panel+=button('nursery-return',name(p.species)+' #'+p.id+' · '+describe(s.lang,p)+' · '+f.lives+' '+p.lives+'/'+p.maxLives+
        ' · '+(isBusy(s,p.id) ? (s.lang==='ru'?'В эксперименте':'In an experiment') : w.return),attrs,isBusy(s,p.id))
      panel+=button('nursery-protect',(s.lang==='ru'?'Защита экземпляра':'Protect plant')+
        ' · '+(s.protectedPlants.includes(p.id)?'✓':'—'),attrs)
    }
  } else if (settingsOpen) {
    panel = `<h2>${w.settings}</h2>${switches}${button('menu',a.menu)}
      ${button('toggle-indicators',(s.lang==='ru'?'Обозначения грядок':'Bed indicators')+' · '+(view.showIndicators===false?'—':'✓'),`aria-pressed="${view.showIndicators!==false}"`)}
      ${button('center',w.center)}${button('restart-tutorial',s.lang==='ru'?'Повторить обучение':'Restart tutorial')}${button('export-save',garden.export)}${button('reset',w.reset)}`
    panel+=`<details class="guide-chapters"><summary>${s.lang==='ru'?'Справка по саду':'Garden guide'}</summary>${guideChapters[s.lang].map(([title,text])=>`<details><summary>${title}</summary><p>${text}</p></details>`).join('')}</details>`
  } else if (journalOpen) panel = journalPanel(s,chapter)
  else if (decorOpen) panel = decorPanel(s,slot,decorChoice)
  else if (helperOpen) panel = automationPanel(s)
  else if (collectionOpen) {
    panel = '<h2>' + w.collection + ' · ' + s.collection.length + '/'+(speciesIds.length*rarities.length)+'</h2>'
    panel += `<details open><summary>${s.lang==='ru'?'Ботанические исследования':'Botanical research'}</summary>
      <p>${s.lang==='ru'?'Материнское растение и доноры должны касаться сторонами грядок. Диагональное соседство не опыляет. Соберите плоды матери и извлеките семена из опылённой партии.':'The mother and each donor must share a bed edge. Diagonal neighbors do not pollinate. Harvest the mother, then extract seeds from the pollinated batch.'}</p>
      ${breedingRecipes.filter(recipe=>!recipe.alternate || researchStatus(s,recipe.result,recipe.id).observed).map(recipe=>recipeCard(s,recipe,null)).join('')}</details>`
    const reactions = s.lang==='ru'
      ? {unknown:'Не изучено',none:'Нет реакции',symbiosis:'Симбиоз',resonance:'Генетический резонанс',strong:'Сильный резонанс'}
      : {unknown:'Unstudied',none:'No reaction',symbiosis:'Symbiosis',resonance:'Genetic resonance',strong:'Strong resonance'}
    const observed = Object.entries(s.research.combinations)
    panel+=`<details><summary>${s.lang==='ru'?'Журнал совместимости':'Compatibility journal'}</summary>
      <p>${s.lang==='ru'?'Материнское растение указано первым. Неизученные пары отмечены прочерком.':'The mother is listed first. Unstudied pairs are marked with a dash.'}</p>`
    if (!observed.length) panel+=`<p>${s.lang==='ru'?'Посадите растения рядом, чтобы изучить их взаимодействие.':'Plant neighbors to study their interactions.'}</p>`
    if (s.planted.length) {
      panel+='<div class="collection-matrix"><table><thead><tr><th>'+(s.lang==='ru'?'Мать / донор':'Mother / donor')+'</th>'+s.planted.map(id=>'<th>'+name(id)+'</th>').join('')+'</tr></thead><tbody>'
      for (const mother of s.planted) {
        panel+='<tr><th>'+name(mother)+'</th>'
        for (const donor of s.planted) {
          const reaction=s.research.combinations[mother+'+'+donor]
          panel+='<td>'+(reaction ? reactions[reaction] : '—')+'</td>'
        }
        panel+='</tr>'
      }
      panel+='</tbody></table></div>'
    }
    for (const [key,reaction] of observed) {
      const [mother,...donors]=key.split('+') as Species[]
      const symbiosis= reactionHasSymbiosis(key) && reaction!=='symbiosis'
      panel+=`<p><strong>${name(mother)} ← ${donors.map(name).join(' + ')}</strong><br>${reactions[reaction]}${symbiosis?' · '+reactions.symbiosis:''}</p>`
    }
    panel+='</details>'
    if(!s.tutorialSkipped) panel+=`<p class="hint">${s.lang==='ru'?'Посадите растение каждого вида и редкости, чтобы заполнить коллекцию.':'Plant each species and rarity to fill the collection.'}</p>`
    panel += '<div class="collection-matrix"><table><thead><tr><th>'+w.collection+'</th>'+(['common','uncommon','rare','epic','legendary'] as const).map(r=>'<th>'+f[r]+'</th>').join('')+'</tr></thead><tbody>'+speciesIds.map(id=>'<tr><th>'+(!isHybrid(id) || s.revealed.includes(id) || s.planted.includes(id) ? name(id) : w.unknown)+'</th>'+(['common','uncommon','rare','epic','legendary'] as const).map(r=>'<td>'+(s.collection.some(c=>c.species===id && c.rarity===r)?'✓':'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'
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
        panel+='<p>'+f.fruits+' '+info.fruits.join('–')+' × '+info.fruitValue+' ◈ · '+w.seeds+' '+info.ownSeeds.join('–')+' · '+(s.lang==='ru'?'Запас сборов':'Harvest capacity')+' '+info.lives+'</p>'
        const entries=s.collection.filter(row=>row.species===id)
          .sort((a,b)=>rarities.indexOf(b.rarity)-rarities.indexOf(a.rarity))
        const collectionWords=s.lang==='ru'
          ? {traits:'Возможные признаки', records:'Изученные профили', planted:'Посадки', harvested:'Плоды собраны', empty:'Посадите экземпляр этого вида.', profiles:'Профилей', source:'Семена продаются в лавке.'}
          : {traits:'Available traits', records:'Studied profiles', planted:'Plantings', harvested:'Fruit collected', empty:'Plant this species to start recording profiles.', profiles:'Profiles', source:'Seeds are available from the shop.'}
        const producesAura=auras.some(a=>a.source===id)
        panel+=`<p>${plantDescriptions[id][s.lang==='ru'?0:1]}</p>
          <p>${collectionWords.traits} · ${availableTraits(id).map(trait=>f[trait]).join(', ')}</p>
          <h3>${collectionWords.records}</h3>`
        if (!entries.length) panel+=`<p>${collectionWords.empty}</p>`
        for (const row of entries) {
          const representative=plantStats(id,row.profile)
          panel+=`<p><strong>${describe(s.lang,row.profile)}</strong><br>
            ${collectionWords.planted} ${row.planted} · ${collectionWords.harvested} ${row.harvested} · ${collectionWords.profiles} ${row.profiles.length}<br>
            ${w.cycle} ${representative.growthSec.toFixed(1)} ${w.sec} · ${s.lang==='ru'?'Запас сборов':'Harvest capacity'} ${representative.maxLives} · ${w.price} ×${representative.fruitPriceMultiplier.toFixed(2)}
            ${producesAura ? ' · '+w.aura+' ×'+representative.auraMultiplier.toFixed(2) : ''}</p>`
        }
        const profiles=entries.flatMap(row=>row.profiles).map(profile=>({profile,stats:plantStats(id,profile)}))
        if (profiles.length>1) {
          const measures=[
            {label:s.lang==='ru'?'Самый быстрый первый рост':'Fastest first growth',value:(p:typeof profiles[number])=>-p.stats.growthSec},
            {label:s.lang==='ru'?'Наибольший запас сборов':'Highest harvest capacity',value:(p:typeof profiles[number])=>p.stats.maxLives},
            {label:s.lang==='ru'?'Самый ценный урожай':'Highest fruit value',value:(p:typeof profiles[number])=>p.stats.fruitPriceMultiplier},
            {label:s.lang==='ru'?'Самое стабильное размножение':'Most stable propagation',value:(p:typeof profiles[number])=>p.stats.copyChance}
          ]
          panel+=`<h3>${s.lang==='ru'?'Рекорды характеристик':'Trait records'}</h3>`
          for (const {label,value} of measures) {
            const best=profiles.reduce((a,b)=>value(a)>=value(b)?a:b)
            panel+=`<p>${label} · ${describe(s.lang,best.profile)}</p>`
          }
        }
        const rates=(v:typeof info)=>60*v.lives/(v.cycleSec+v.regrowSec*(v.lives-1))
        const income=(v:typeof info)=>rates(v)*(v.fruits[0]+v.fruits[1])/2*v.fruitValue
        for(const [label,get] of [[f.speed,rates],[f.income,income],[garden.harmony,(v:typeof info)=>v.harmony]] as const){
          panel+='<label class="rating">'+label+' <meter value="'+get(info)+'" max="'+Math.max(...Object.values(speciesInfo).map(get))+'"></meter></label>'
        }
        if (!isHybrid(id)) panel+=`<p>${collectionWords.source}</p>`
        for(const r of breedingRecipes.filter(r=>(!r.alternate || researchStatus(s,r.result,r.id).observed) && (r.result===id || recipeKnown(s,r) && (r.primary===id || r.neighbors.includes(id)))))panel+=recipeCard(s,r,null)
        for (const aura of auras.filter(a => a.source === id)) {
          const targets = Array.isArray(aura.targets) ? aura.targets.map(s => name(s as Species)).join(', ') : aura.targets === 'all' ? w.allPlants : w.hybrids
          const amount = Math.round(100*aura.bonus) + '%'
          panel += `<p>${w.aura} · ${w[aura.kind as 'growth'|'price'|'propagation']} ${amount} (${targets})</p>`
        }
      }
    }
  } else if (view.mode === 'plant' && repeatPlanting && chosen && stock) {
    const ru=s.lang==='ru'
    panel=`<h2>${ru?'Последовательная посадка':'Repeat planting'}</h2>
      <p>${name(chosen)} · ${describe(s.lang,stock)} · ${ru?'Доступно':'Available'} ${availableStock(s,chosen,stock)}</p>`+
      button('repeat-plant-done',ru?'Завершить посадку':'Finish planting')
  } else if (view.mode === 'plant') {
    panel+=button('repeat-plant-toggle',s.lang==='ru' ? `Последовательная посадка · ${repeatPlanting?'вкл.':'выкл.'}` : `Repeat planting · ${repeatPlanting?'on':'off'}`,`aria-pressed="${repeatPlanting}"`)
    panel += `<h2>${w.plant}</h2><p>${returnId!==null ? w.chooseReturn :
      plot?.open && !plot.plant ? (s.lang==='ru'?'Выберите семя для этой грядки.':'Choose a seed for this bed.') : w.selectPlot}</p>`
    if (full && !isRecipeRevealed(s)) panel += `<p class="hint">${w.full}</p>`
    if (chosen) panel += button('cancel-seed',name(chosen)+' · '+(stock?f.stock+' · '+describe(s.lang,stock):isHybrid(chosen)?f.stock:f.buy)+' · '+w.cancel)
    if (plot && !plot.open) panel += '<p>'+a.closed+'</p>'
    if (plot?.plant && s.sold) panel += '<p>'+ (canReplace(s) ? w.replaceHint : a.occupied)+'</p>'+button('shovel',a.shovel)
    if (returnId !== null) panel += button('cancel-return',w.cancel)
    if (canRecoverGarden(s)) {
      panel += `<p class="hint">${garden.recovery}</p>`
      if (plot?.open && !plot.plant) panel += button('emergencyRadish',garden.recovery,'class="primary"')
    }
    const owned:string[]=[]
    const shop:string[]=[]
    for (const id of speciesIds) {
      if (isHybrid(id) && !seedUnlocked(s,id)) continue
      const data = speciesInfo[id]
      const packs=[{...common,count:s.seeds[id]},...s.variants.filter(v=>v.species===id)]
      for(const pack of packs.filter(v=>v.count>0)) {
        const stats=plantStats(id,pack)
        owned.push(button('seed',`<span class="seed-dot seed-${id}"></span><span><strong>${name(id)} · T${data.generation+1} · ${describe(s.lang,pack)} ×${pack.count}</strong>
          <small>${stats.growthSec.toFixed(1)} ${w.sec} · ${stats.fruits.join('–')} · ${data.lifecycle==='single'?inventory.single:inventory.multi}</small></span>`,
          `class="seed" data-seed="${id}" aria-pressed="${chosen===id && !!stock && sameProfile(pack,stock)}" data-profile='${JSON.stringify({rarity:pack.rarity,plus:pack.plus,minus:pack.minus})}'`))
      }
      if(isHybrid(id))continue
      const locked = !seedUnlocked(s,id)
      const price = f.buy+' · '+data.seedPrice+' ◈'
      const lowFunds = data.seedPrice !== null && s.coins < data.seedPrice

      shop.push(button('seed',`<span class="seed-dot seed-${id}"></span><span><strong>${name(id)} · T1 · ${f.common}</strong><small>${locked ? (id === 'moonflower' ? w.needBlue : id === 'clover' ? w.needRecipe : w.seedHint) : lowFunds ? price + ' · −' + (data.seedPrice!-s.coins)+' ◈' : price+' · '+data.cycleSec+' '+w.sec+' · '+data.fruits.join('–')+' · '+(data.lifecycle==='single'?inventory.single:inventory.multi)}</small></span>`,`data-seed="${id}" class="seed ${chosen === id && !stock ? 'chosen' : ''}"`,locked || lowFunds))
    }
    if (!s.tutorialSkipped && !s.firstHarvest && !s.plots.some(p=>p.plant) && s.seeds.radish>0) panel += `<p class="hint">${s.lang==='ru'?'Выберите семя редиса из запаса, чтобы посадить его.':'Choose a radish seed from your stock to plant it.'}</p>`
    if (owned.length) panel += `<h3>${s.lang==='ru'?'Семена из запаса':'Seeds in stock'}</h3><div class="seed-list">${owned.join('')}</div>`
    panel += `<h3>${s.lang==='ru'?'Купить и посадить':'Buy and plant'}</h3><div class="seed-list">${shop.join('')}</div>`

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
      const cost = expansionCost(s,selected!)!
      const neighboring = adjacent(selected!).some(index => s.plots[index].open)
      panel += `<p>${w.closed}</p>` + button('clear',`${w.clear} · ${cost} ◈`,'class="primary"',!neighboring || s.coins < cost)
      if (!neighboring) panel += `<p>${w.notAdjacent}</p>`
      else if (s.coins < cost) panel += `<p>${w.funds}</p>`
    }
    else {
      panel += `<p>${w.plot} ${selected! + 1} · ${w.level} ${plot.level}</p>`
      if (plot.level < 5) {
        const next=(plot.level+1) as BedLevel
        const cost = bedLevels[next].upgradeCost
        panel += `<p>${['','I','II','III','IV','V'][plot.level]} → ${['','I','II','III','IV','V'][next]}<br>${w.growth} ×${bedLevels[plot.level].growthMultiplier} → ×${bedLevels[next].growthMultiplier}<br>${w.price} ×${bedLevels[plot.level].priceMultiplier} → ×${bedLevels[next].priceMultiplier}</p>`
        panel += button('upgrade',`${w.upgrade} · ${cost} ◈`,'class="primary"',s.coins < cost)
      }
      if (plot.plant) {
        panel += button('move',w.move)
        panel += button('plant-protect',(s.lang==='ru'?'Защита экземпляра':'Protect plant')+' · '+
          (s.protectedPlants.includes(plot.plant.id)?'✓':'—'),`data-id="${plot.plant.id}"`)
      }
      if (plot.plant && isRecipeRevealed(s)) panel += button('store',w.store,'data-id="'+plot.plant.id+'"')
    }
  } else if (view.shovel && !plot?.plant) panel='<h2>'+a.shovel+'</h2><p>'+a.select+'</p>'
  else if (plot) {
    panel += `<h2>${plot.plant ? name(plot.plant.species) : plot.open ? w.empty : w.closed}</h2><p>${w.plot} ${selected! + 1} · ${w.level} ${plot.level}</p>`
    if (plot.open && s.helperLevel) {
      panel+=`<details data-plot-details="automation-${selected}"><summary>${s.lang==='ru'?'Производство и автоматизация':'Production and automation'}</summary>`
      const policy=plot.policy ?? defaultPolicy
      const labels=modeLabels[s.lang]
      if (s.helperLevel) panel+=`<p class="hint">${productionLabels[s.lang][productionStatus(s,selected!)]}</p>`
      panel+='<p>'+(s.lang==='ru'?'Назначение':'Bed mode')+'</p><div class="book-filters">'+
        (['manual','commercial','seed','breeding','support'] as const).map((mode,i)=>button('plot-mode',labels[i],`data-mode="${mode}" aria-pressed="${policy.mode===mode}"`)).join('')+'</div>'
      panel+=`<p class="hint">${s.lang==='ru'?'▤ — плоды · ● — семена · ⇄ — селекция · + — поддержка':'▤ fruit · ● seeds · ⇄ breeding · + support'}</p>`
      panel+=button('plot-harvest',(s.lang==='ru'?'Автосбор':'Auto harvest')+' · '+(policy.harvest?'✓':'—'))
      if(plot.plant) panel+=button('plot-replant',(s.lang==='ru'?'Пересадка этого профиля':'Replant this profile')+' · '+(policy.replant?'✓':'—'))
      const profiles=allSeedPacks(s).map(pack=>({species:pack.species,profile:canonical(pack)}))
      const current=policy.replant
      if (current && !profiles.some(pack=>pack.species===current.species && sameProfile(pack.profile,current.profile))) profiles.push(current)
      panel+=`<div class="inventory-tools">
        <label>${s.lang==='ru'?'Приоритет грядки':'Bed priority'}<select data-plot-priority>
        ${[0,1,2,3].map(rank=>`<option value="${rank}" ${rank===policy.priority?'selected':''}>${rank}</option>`).join('')}
        </select></label>
        ${policy.mode==='seed' || policy.mode==='breeding' ? `<label>${s.lang==='ru'?'Цель производства семян':'Seed production target'}
        <input type="number" min="0" value="${policy.target}" data-plot-target inputmode="numeric"></label>` : ''}
        <label>${s.lang==='ru'?'Точный профиль пересадки':'Exact replanting profile'}
        <select data-replant-profile><option value="">${s.lang==='ru'?'Без пересадки':'No replanting'}</option>
        ${profiles.map(pack=>`<option value='${JSON.stringify(pack)}' ${current?.species===pack.species &&
          sameProfile(current.profile,pack.profile)?'selected':''}>${name(pack.species)} · ${describe(s.lang,pack.profile)}</option>`).join('')}
        </select></label></div>`
      if (current) {
        const amount=availableStock(s,current.species,current.profile)
        const status=!s.automation.enabled || !s.automation.replant || !s.helperLevel
          ? (s.lang==='ru'?'Автопересадка выключена':'Automatic replanting is off')
          : amount===0 ? (s.lang==='ru'?'Нет доступных семян этого профиля':'No available seeds of this profile')
          : (s.lang==='ru'?'Семян для пересадки':'Seeds available to replant')+` · ${amount}`
        panel+=`<p class="hint">${status}</p>`
      }
      panel+='</details>'
    }
    if (plot.plant) {
      panel += `<div class="progress"><span style="width:${Math.round(plot.plant.progress * 100)}%"></span></div><p>${plot.plant.readySince !== null ? w.ready : `${w.growing} · ${secondsLeft(s,selected!)} ${w.sec}`}</p>`
      panel+='<p>T'+(speciesInfo[plot.plant.species].generation+1)+' · '+describe(s.lang,plot.plant)+' · '+f.lives+' '+plot.plant.lives+'/'+plot.plant.maxLives+' · '+w.cycle+' '+cycleSeconds(s,selected!).toFixed(1)+' '+w.sec+'</p>'
      const directions=researchDirections(s,selected!)
      if (directions.length>1) {
        panel+=`<h3>${s.lang==='ru'?'Направление исследования':'Research direction'}</h3>`
        if (plot.plant.pollination) panel+=`<p>${s.lang==='ru'?'Направление зафиксировано до сбора.':'Direction fixed until harvest.'}</p>`
        directions.forEach(direction=>{
          const known=(s.research.recipes[direction.id]?.successes ?? 0)>0
          const info=researchStatus(s,direction.result,direction.id)
          const label=(known ? name(direction.result) : resonanceNames[direction.result][s.lang==='ru'?0:1])+
            ` · T${info.progress.tier} · ${Math.round(info.chance*100)}% · ${info.failures}/${info.pity}`
          panel+=button('research-direction',label+(plot.plant!.researchDirection===direction.id?' ✓':''),`data-recipe-id="${direction.id}"`,!!plot.plant!.pollination)
          panel+=`<small>${name(direction.primary)} ← ${direction.neighbors.map(name).join(' + ')} · ${s.lang==='ru'?'До гарантии':'Until guarantee'} ${Math.max(1,info.pity-info.failures)}</small>`
        })
      }
      const currentRecipe=plot.plant.pollination?.recipeId ?? plot.plant.researchDirection
      const donorRecipes=currentRecipe ? directions.filter(direction=>direction.id===currentRecipe) : directions
      const donorGroups=donorRecipes.flatMap(recipe=>donorCandidates(s,selected!,recipe.id).map(group=>({...group,recipeId:recipe.id})))
        .filter((group,index,groups)=>groups.findIndex(other=>other.species===group.species)===index)
      if (donorGroups.some(group=>group.candidates.length>1)) {
          panel+=`<details class="donor-options" data-plot-details="donors-${selected}"><summary>${s.lang==='ru'?'Выбор доноров':'Choose donors'}</summary><p>${plot.plant.pollination
            ? (s.lang==='ru'?'Выбор действует при следующем опылении.':'Selection applies to the next pollination.')
            : (s.lang==='ru'?'Выберите родителей до начала опыления.':'Choose parents before pollination begins.')}</p>`
          for (const group of donorGroups) {
            panel+=`<p>${name(group.species)}</p>`
            panel+=button('research-donor',s.lang==='ru'?'Автоматический выбор':'Automatic selection',`data-recipe-id="${group.recipeId}" data-donor="${group.species}" data-id="" aria-pressed="${!plot.plant.researchDonors?.[group.species]}"`)
            for (const candidate of group.candidates) {
              const chosen=plot.plant.researchDonors?.[group.species]===candidate.plant.id
              panel+=button('research-donor',`${name(group.species)} · #${candidate.plant.id} · ${describe(s.lang,candidate.plant)} · ${candidate.plant.lives}/${candidate.plant.maxLives} · ${w.plot} ${candidate.plot+1}`,`data-recipe-id="${group.recipeId}" data-donor="${group.species}" data-id="${candidate.plant.id}" aria-pressed="${chosen}"`)
            }
          }
          panel+='</details>'
      }
      const stats=plantStats(plot.plant.species,plot.plant)
      const standard=plantStats(plot.plant.species,common)
      panel+=`<p>${f.fruits} ${stats.fruits.join('–')} · ${w.seeds} ${stats.ownSeeds.join('–')} · ${inventory.regrow} ${stats.regrowSec.toFixed(1)} ${w.sec}</p>`
      panel+=`<details data-plot-details="comparison-${selected}"><summary>${s.lang==='ru'?'Сравнение с обычным':'Compare with common'}</summary>
        <p>${s.lang==='ru'?'Запас сборов':'Harvest capacity'} ${stats.maxLives} / ${standard.maxLives} ·
        ${w.growth} ${stats.growthSec.toFixed(1)} / ${standard.growthSec.toFixed(1)} ${w.sec} ·
        ${f.fruits} ${stats.fruits.join('–')} / ${standard.fruits.join('–')} ·
        ${w.seeds} ${stats.ownSeeds.join('–')} / ${standard.ownSeeds.join('–')}</p></details>`
      const lines=specializations(s.lang,plot.plant.species,plot.plant)
      if (lines.length) panel+=`<p>${s.lang==='ru'?'Подходит для':'Useful for'} · ${lines.join(' · ')}</p>`
      const activeAuras=(['growth','price','propagation'] as const).map(kind=>({kind,bonus:auraBonus(s,selected!,kind)})).filter(a=>a.bonus>0)
      if(activeAuras.length) panel+=`<p>${w.aura} · ${activeAuras.map(a=>w[a.kind]+' +'+Math.round(a.bonus*100)+'%').join(' · ')}</p>`
      panel += '<p>'+(speciesInfo[plot.plant.species].lifecycle==='single' ? inventory.single : inventory.multi)
        +' · '+(pollinationFor(s,selected!) ? inventory.pollinated : inventory.plain)+'</p>'
      if (view.shovel) {
        const id=plot.plant.id
        if (confirmId===id) {
          panel += '<p>'+a.confirm(name(plot.plant.species),['','I','II','III','IV','V'][plot.level])+' '+(plot.plant.readySince!==null?a.lost:'')+'</p>'
          if (s.plots.filter(p=>p.plant).length===1) panel+='<p>'+recoveryHint(s)+'</p>'
          panel+=button('confirm-compost',a.compost,'data-id="'+id+'"')+button('cancel-compost',w.cancel)
        } else {
          if (!removalIssue(s,selected!,id,'store')) panel+=button('store',w.store,'data-id="'+id+'"')
          const issue=removalIssue(s,selected!,id,'compost')
          panel+=issue ? '<p>'+(issue==='protectedItem' ? (s.lang==='ru'?'Экземпляр защищён':'Plant is protected') : issue==='lastProfile' ? (s.lang==='ru'?'Последний источник генетической линии':'Last source of this genetic line') : a.lastHybrid)+'</p>' : button('compost',a.compost,'data-id="'+id+'"')
        }
       } else {
        const p=plot.plant
        panel+=button('plant-protect',(s.lang==='ru'?'Защита экземпляра':'Protect plant')+' · '+(s.protectedPlants.includes(p.id)?'✓':'—'),`data-id="${p.id}"`)
        const attrs='data-id="'+p.id+'" data-cycle="'+p.lives+'"'
        const disabled=p.readySince===null
        const harvestLabel=p.lives===1 ? (s.lang==='ru'?'Последний сбор':'Final harvest') : w.harvest
        panel+=button('harvest',harvestLabel,attrs,disabled)+button('move',w.move)+button('dig',s.lang==='ru'?'Выкопать':'Dig up')+button('bed-settings',w.upgrade)
      }
    }
  }
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
  const targetSeed=!s.firstHarvest && !s.plots.some(p=>p.plant) && s.seeds.radish>0 ? 'radish' : s.revealed.includes('solar_strawberry') ? 'solar_strawberry' :
    !s.plots.some(p=>p.plant?.species==='strawberry') ? 'strawberry' : !s.plots.some(p=>p.plant?.species==='sunflower') ? 'sunflower' : null
  const needed=targetSeed && !s.seeds[targetSeed] ? speciesInfo[targetSeed].seedPrice ?? 0 : 0
  const canExtract = s.basket.some(batch=>batch.profile && (!s.firstExtraction || batch.lots.some(lot=>lot.crossPending)))
  const hasSolarCross = !s.revealed.includes('solar_strawberry') && s.basket.some(batch=>
    batch.pollination?.result==='solar_strawberry' && batch.lots.some(lot=>lot.crossPending))
  const guideAction=hasSolarCross || canExtract && (!s.sold || !targetSeed || !s.firstExtraction) ? 'inventory' :
    !s.firstSeedPlanting && (s.variants.length || Object.values(s.seeds).some(Boolean)) ? 'inventory' :
    s.basket.length && (!s.sold || s.coins<needed) ? 'sell' :
    !s.sold || s.coins<needed || !targetSeed ? 'collect' : s.plots.every(p=>!p.open || p.plant) && !canReplace(s) ? 'shovel' : 'plant'
  const repeatButton=repeat && view.mode==='garden' && !overlay && !s.plots[repeat.plot].plant ?
    button('plant-again',(s.lang==='ru'?'Посадить снова':'Plant again')+' · '+name(repeat.species)+' · '+
      (repeat.profile ? describe(s.lang,repeat.profile)+' ×1' : f.common+' · '+speciesInfo[repeat.species].seedPrice+' ◈'),
      'data-plot="'+repeat.plot+'"',!!plantingIssue(s,repeat.plot,repeat.species,undefined,repeat.profile)) : ''
  const tutorial=tutorialStep(s)
  const tutorialBatch = tutorial?.id==='pollinated-fruit' ? researchStatus(s,'solar_strawberry').batchId : undefined
  const tutorialInPanel = !!tutorial && (tutorial.id==='first-plant' && view.mode==='plant' || tutorial.id==='second-plant' && view.mode==='plant' || tutorial.id==='first-sale' && overlay==='market' || tutorial.id==='extract' && overlay==='inventory')
  const tutorialText = tutorialInPanel && tutorial?.id==='first-plant' ? (s.lang==='ru'?'Выберите семя редиса из запаса.':'Choose the radish seed from your stock.') : tutorialInPanel && tutorial?.id==='first-sale' ? (s.lang==='ru'?'Посмотрите цену и продайте часть урожая.':'Review the price and sell some of your harvest.') : tutorialInPanel && tutorial?.id==='extract' ? (s.lang==='ru'?'Выберите партию и извлеките семена. Их можно посадить или продать.':'Choose a batch and extract seeds. You can plant or sell them.') : tutorial?.text
  return `<div class="garden-ui" data-guide="${guide ? guideAction : ''}" data-guide-seed="${guide && targetSeed ? targetSeed : ''}"><header class="topbar"><div class="brand"><span class="brand-mark">${svg(icons.garden)}</span><span><small>${s.activeIsland==='valley' ? (s.lang==='ru'?'Цветочная долина':'Flower Valley') : w.subtitle}</small><strong>${w.title} · ${s.lang==='ru'?'Ранг':'Rank'} ${s.rank}</strong></span></div><div class="stats"><div class="stat"><span class="stat-icon">${svg('<circle cx="12" cy="12" r="8"/><path d="M12 7v10m-3-7h6m-6 4h6"/>')}</span><span><small>${w.coins}</small><strong>${s.coins}</strong></span></div><button type="button" class="stat basket" data-action="inventory" aria-expanded="${overlay==='inventory'}"><span class="stat-icon">${svg('<path d="M4 10h16l-2 10H6L4 10ZM8 10c0-7 8-7 8 0M8 13l1 4m3-4v4m4-4-1 4"/>')}</span><span><small>${inventory.title}</small><strong>${basketCount(s)}/${basketCapacity(s)}</strong></span></button><button type="button" data-action="collection" aria-expanded="${collectionOpen}" class="stat collection"><span class="stat-icon">${svg(icons.breed)}</span><span><small>${w.collection}</small><strong>${s.planted.length}/${speciesIds.length}</strong></span></button></div><div class="top-actions">${s.sold ? button('helper',automationWords[s.lang].name+(s.helperLevel?' · '+(s.automation.enabled?'●':'Ⅱ'):''),`aria-expanded="${helperOpen}"`) : ''}${button('settings',w.settings,'class="quiet" aria-expanded="'+settingsOpen+'"')}</div></header>
    <div class="goal-card"><span class="eyebrow">${w.goal}</span><p>${!s.plots.some(p=>p.plant?.lives) ? recoveryHint(s) : goal}</p>${button('journal',garden.journal,'class="quiet"')}
    ${s.tutorialSkipped || s.sold ? `<details class="quick-garden-actions"><summary>${s.lang==='ru'?'Быстрые действия':'Quick actions'}</summary><div>${button('gather-ready',(s.lang==='ru'?'Собрать готовое':'Harvest ready')+' · '+gardenBatchTargets(s,s.activeIsland,'harvest').length,'',!gardenBatchTargets(s,s.activeIsland,'harvest').length)+button('clear-withered',(s.lang==='ru'?'Убрать засохшее':'Clear withered')+' · '+gardenBatchTargets(s,s.activeIsland,'cleanup').length,'',!gardenBatchTargets(s,s.activeIsland,'cleanup').length)+(readyFruitSaleValue(s)>0?button('sell-ready-fruit',(s.lang==='ru'?'Продать обычный урожай':'Sell ordinary harvest')+' · '+readyFruitSaleValue(s)+' ◈'):'')}</div></details>` : ''}</div>
    ${panel ? `<aside class="context${overlay==='statistics' || overlay==='inventory' || overlay==='evolution' || overlay==='helper' || overlay==='market'?' inventory-context':''}">${overlay || journalOpen || decorOpen || helperOpen || collectionOpen || selected !== null ? button('close','×',`class="close" aria-label="${w.close}"`) : ''}<div class="context-inner">${panel}</div></aside>` : ''}
    ${tutorial && (!panel || tutorialInPanel) ? `<section class="tutorial-card" data-tutorial-id="${tutorial.id}" data-tutorial-target="${tutorial.target}" aria-live="polite">
      <strong>${s.lang==='ru'?'Листик':'Leafy'}</strong><p>${tutorialText}</p>
      ${tutorialBatch!==undefined ? button('research-batch',s.lang==='ru'?'Открыть партию':'Open harvest batch',`data-id="${tutorialBatch}" class="primary"`) : tutorial.target!=='none' && !tutorialInPanel ? button(tutorial.target,s.lang==='ru'?'Открыть':'Open','class="primary"') : ''}
      ${button('tutorial-next',tutorial.action?(s.lang==='ru'?'Пропустить подсказку':'Skip tip'):(s.lang==='ru'?'Понятно':'Got it'),`data-id="${tutorial.id}"`)}
      ${button('skip',s.lang==='ru'?'Пропустить обучение':'Skip tutorial')}</section>` : ''}
    ${overlay==='inventory'?'':`<div class="camera">${button('zoomIn','+',`aria-label="${w.zoomIn}" title="${w.zoomIn}"`)}${button('zoomOut','−',`aria-label="${w.zoomOut}" title="${w.zoomOut}"`)}${button('center','⌾',`aria-label="${w.center}" title="${w.center}"`)}</div>`}
    ${!panel && s.plots.some(p=>p.plant && p.plant.lives>0 && p.plant.readySince!==null) ? `<details class="ready-inspect"><summary>${s.lang==='ru'?'Осмотреть созревшие':'Inspect ready plants'}</summary>${plotIndices(s.activeIsland).filter(i=>s.plots[i]?.plant && s.plots[i].plant!.lives>0 && s.plots[i].plant!.readySince!==null).map(i=>button('inspect-bed',`${name(s.plots[i].plant!.species)} · ${w.plot} ${i+1}`,`data-id="${i}"`)).join('')}</details>` : ''}
    <nav class="modes" aria-label="${w.title}">${button('inventory',inventory.title)}${button('market',s.lang==='ru'?'Рынок':'Market')}${button('evolution',s.lang==='ru'?'Теплица':'Greenhouse')}${button('collection',s.lang==='ru'?'Альманах':'Almanac')}${button('journal',garden.journal)}</nav>
    ${warningText ? `<div class="warning" role="status">${warningText}</div>` : ''}${firstSeeds.length ? `<div class="notice reward discovery" role="dialog" aria-label="${s.lang==='ru'?'Ботаническое открытие':'Botanical discovery'}">
      ${firstSeeds.map(id=>{const info=speciesInfo[id]; const variants=s.variants.filter(v=>v.species===id); const profile=variants.length===1 && !s.seeds[id] ? variants[0] : variants.length===0 ? common : null; const stats=profile ? plantStats(id,profile) : null; return `<div class="discovery-details">${portrait(id)}<strong>${name(id)} · T${info.generation+1}${discoveryRarity ? ' · '+f[discoveryRarity] : profile ? ' · '+describe(s.lang,profile) : ''}</strong><p>${plantDescriptions[id][s.lang==='ru'?0:1]}</p><p>${w.cycle} ${(stats?.growthSec ?? info.cycleSec).toFixed(1)} ${w.sec} · ${f.fruits} ${(stats?.fruits ?? info.fruits).join('–')} · ${s.lang==='ru'?'Запас сборов':'Harvest capacity'} ${stats?.maxLives ?? info.lives}</p><p>${w.collection} · ${s.planted.length}/${speciesIds.length}</p></div>`}).join('')}
      ${firstSeeds.map(id=>button('plant-reward',firstSeeds.length===1 ? f.hybrid : a.plant+' · '+name(id),'data-seed="'+id+'"')).join('')}${button('later',s.lang==='ru'?'Продолжить':'Continue')}</div>` : notice ? `<div class="notice" role="status">${notice}${repeatButton}</div>` : ''}<div class="keyboard-beds">${plotIndices(s.activeIsland).filter(i=>!!s.plots[i]).map(i=>{const p=s.plots[i];return button('pick-bed',w.plot+' '+(i+1)+' · '+(p.plant ? name(p.plant.species) : p.open ? w.empty : w.closed),'data-id="'+i+'"')}).join('')}</div></div>`
}
