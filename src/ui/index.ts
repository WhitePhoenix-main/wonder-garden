import { availableStock, defaultPolicy, profileKey, protectedProfile } from '../game/evolution'
import { inventoryWords, type InventoryTab, type InventorySort } from './inventory'
import { common, stockCount } from '../game/genetics'
import { describe, field } from './specimens'
import type { BedLevel, BulkItem, Profile, Command, DecorType, Species, PlotMode, Rarity, MarketKind } from '../game/model'
import { speciesIds } from '../game/config'
import { harvestSaleValue, seedSaleValue } from '../game/trade'
import { plotCount, plotIndices } from '../game/config'
import type { Mode, UI, UIActions, WorldView } from '../runtime/presentation'
import { alpha } from './alpha'
import { plantingIssue } from '../game/queries'
import { bedLevels, speciesInfo } from '../game/config'
import { canRecoverGarden, canReplace, expansionCost } from '../game/queries'
import { extractionYield, harvestSaleIssue, quickSaleEligible, quickSaleValue, seedSaleIssue, trade } from '../game/trade'
import type { DecorChoice } from './panels/garden'
import { uiMarkup, type CollectionFilter, type Overlay } from './render'
import { plantName, words } from './strings'
import { evolutionErrors } from './panels/evolution'
import './ui.css'

export function createUI(host: HTMLElement, actions: UIActions): UI {
  let view: WorldView
  let warning: string | null = null
  let chosen: Species|null = null
  let stock:Profile|undefined
  let firstSeeds:Species[]=[]
  let cornerPlanted=false
  let branch:'experiment'|'corner'|null=null
  let confirmId:number|null=null
  let notice = ''
  let last = ''
  let pressing = false
  let returnId: number | null = null
  let overlay: Overlay|null = null
  let marketKind:MarketKind='fruit'
  let crossParents:number[]=[]
  let inventorySelected:string[]=[]
  let favoriteOnly=false
  let inventorySearch=''
  let inventoryPage=0
  let inventoryFilter='all'
  let inventoryTab:InventoryTab='harvest'
  let inventorySort:InventorySort='species'
  let inventoryAmounts:Record<string,number>={}
  let inventoryMinimum=1
  let inventoryDetail:string|null=null
  let collectionFilter: CollectionFilter = 'all'
  let entry: Species|null = null
  let chapter: number|null = null
  let slot: string|null = null
  let decorChoice: DecorChoice|null = null
  let panelKey = ''
  const name = (id: Species) => plantName(view.state.lang,id)
  const t = () => words[view.state.lang]

  function updateDecor() {
    const choice = decorChoice
    const type = choice && ('newType' in choice ? choice.newType :
      view.state.decorations.find(d => d.id === choice.id)?.type)
    actions.decorPreview(overlay === 'decor', slot && type ? {slot,type} : null)
  }
  function pickDecor(id:string) {
    if (overlay !== 'decor') return
    slot = id
    updateDecor()
  }
  function closePanels() {
    overlay = null
    slot = null
    decorChoice = null
  }

  function showRewards(events:string[]) {
    const harvest=events.find(e=>e.startsWith('Harvested:'))?.split(':')
    if(harvest) notice='+'+harvest[3]+' '+name(harvest[2] as Species)
    const discoveries=events.filter(event=>event.startsWith('RecipeRevealed:'))
    if (discoveries.length && discoveries.length===view.state.revealed.length) {
      firstSeeds=discoveries.map(event=>event.split(':')[1] as Species)
    }
    if (branch==='corner' && events.some(e=>e==='Planted'||e==='PlantReturned')) cornerPlanted=true
    const rewards = events.filter(e => e.startsWith('RecipeRevealed:') || e.startsWith('SeedPropagated:'))
    const count=events.find(e=>e.startsWith('OwnSeeds:'))?.split(':')[1]
    if (rewards.length) notice = rewards.map((e,i) => t().earned + ' · ' + name(e.split(':')[1] as Species)+(i===0 && count?' ×'+count:'')).join(' / ')
    if(events.includes('ExperimentFailed'))notice+=' · '+field[view.state.lang].miss
    if(events.includes('Withered'))notice+=' · '+field[view.state.lang].wilt
  }
  function run(command: Command) {
    const result = actions.command(command)
    if (!result.ok) {
      const dict = t() as Record<string,string>
      notice = dict[result.reason] ?? evolutionErrors[view.state.lang][result.reason] ?? dict.error
    } else if (result.events.includes('GardenCompleted')) notice = t().finished
    else {
      notice = ''
      showRewards(result.events)
      if (result.obtained?.length) {
        const lang = view.state.lang
        notice = inventoryWords[lang].obtained+' · ' + result.obtained
          .map(p=>name(p.species)+' · '+field[lang][p.rarity]+' ×'+p.count).join(' / ')
        if (result.events.includes('ExperimentFailed')) notice += ' · '+field[lang].miss
      }
    }
    draw()
  }
  function draw() {
    if (!view) return
    if (pressing) return
    const html = uiMarkup(view,{
      inventoryFilter,inventoryTab,inventorySort,inventoryAmounts,inventoryMinimum,inventoryDetail,crossParents,inventorySelected,favoriteOnly,inventorySearch,inventoryPage,marketKind,
      stock,cornerPlanted,firstSeeds,branch,confirmId,overlay, warning, notice, chosen, returnId, collectionFilter, entry, chapter, slot, decorChoice
    })
    if (html === last) return
    const active = document.activeElement as HTMLElement | null
    const caret=active instanceof HTMLInputElement && active.type==='search' ? active.selectionStart : null
    const focusData=active ? JSON.stringify({...active.dataset}) : ''
    const context = overlay ?? view.mode
    const scroll = panelKey === context ? host.querySelector('.context-inner')?.scrollTop ?? 0 : 0
    panelKey = context
    host.innerHTML = html
    const inner = host.querySelector<HTMLElement>('.context-inner')
    if (inner) inner.scrollTop = scroll
    if (active && focusData!=='{}' && !document.body.contains(active)) {
      const candidate = [...host.querySelectorAll<HTMLElement>('button[data-action],input,select')]
        .find(el=>Object.entries(active.dataset).every(([key,value])=> key==='max' || el.dataset[key]===value))
      candidate?.focus({preventScroll:true})
      if (caret!==null && candidate instanceof HTMLInputElement && candidate.type==='search') candidate.setSelectionRange(caret,caret)
    }
    last = html
  }
  host.addEventListener('pointerdown', () => { pressing = true })
  window.addEventListener('pointerup', () => {
    if (!pressing) return
    pressing = false
    window.setTimeout(draw, 0)
  })
  window.addEventListener('pointercancel', () => { pressing = false; draw() })
  host.addEventListener('input', event=>{
    const input=event.target as HTMLInputElement
    if (!input.matches('[data-inventory-search]')) return
    inventorySearch=input.value
    inventoryPage=0
    draw()
  })
  host.addEventListener('change', event => {
    const target=event.target as HTMLSelectElement|HTMLInputElement
    if(target.matches('[data-automation-preferred],[data-sale-rarity]')) {
      const settings={...view.state.automation}
      if(target.matches('[data-automation-preferred]')) settings.preferred=(target.value||null) as PlotMode|null
      else settings.saleRarity=(target.value||null) as Rarity|null
      return run({type:'setAutomation',settings})
    }
    if(target.matches('[data-plot-priority],[data-plot-target],[data-replant-profile]') && view.selected!==null) {
      const policy={...(view.state.plots[view.selected].policy??defaultPolicy)}
      if(target.matches('[data-plot-priority]')) policy.priority=Number(target.value)
      else if(target.matches('[data-plot-target]')) policy.target=Number(target.value)
      else policy.replant=target.value ? JSON.parse(target.value) as typeof policy.replant : null
      return run({type:'plotPolicy',plot:view.selected,policy})
    }
    if (target.matches('[data-inventory-filter]')) inventoryFilter=target.value
    else if (target.matches('[data-inventory-search]')) inventorySearch=target.value
    else if (target.matches('[data-inventory-sort]')) inventorySort=target.value as InventorySort
    else if (target.matches('[data-inventory-minimum]')) inventoryMinimum=Math.max(0,Number(target.value)||0)
    else return
    inventoryPage=0
    draw()
  })
  host.addEventListener('click', event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('button[data-action]')
    if (!target || !view) return
    const action = target.dataset.action, selected = view.selected, plot = selected === null ? null : view.state.plots[selected]
    const mode=(next:Mode, shovel=false, index:number|null=null)=>{
      closePanels(); stock=undefined; chosen=null; returnId=null; confirmId=null; notice=''
      updateDecor()
      actions.changeView({mode:next,sunflower:false,selected:index,moveFrom:null,shovel})
    }
    if(action==='evolution') {overlay=overlay==='evolution'?null:'evolution';draw();return}
    if(action==='market') {overlay=overlay==='market'?null:'market';draw();return}
    if(action==='market-product') {marketKind=target.dataset.kind==='seed'?'seed':'fruit';draw();return}
    if(action==='cross-parent') {
      const id=Number(target.dataset.id)
      crossParents=crossParents.includes(id)?crossParents.filter(p=>p!==id):[...crossParents,id].slice(-2)
      draw();return
    }
    if(action==='cross-start' && crossParents.length===2) {
      run({type:'startCross',parents:[crossParents[0],crossParents[1]]});crossParents=[];return
    }
    if(action==='cross-collect') return run({type:'collectCross',id:Number(target.dataset.id)})
    if(action==='greenhouse-upgrade') return run({type:'upgradeGreenhouse',target:Number(target.dataset.level)})
    if(action==='stall-upgrade') return run({type:'upgradeStall',target:Number(target.dataset.level)})
    if(action==='restore-bridge') return run({type:'restoreBridge'})
    if(action==='travel-green'||action==='travel-valley') {
      closePanels()
      actions.changeView({mode:'garden',selected:null,moveFrom:null})
      return run({type:'travel',island:action==='travel-green'?'green':'valley'})
    }
    if(action==='order-complete'||action==='order-decline') {
      if(action==='order-decline' && !window.confirm(view.state.lang==='ru'?'Отказаться от заказа?':'Decline this order?'))return
      return run({type:action==='order-complete'?'fulfillOrder':'declineOrder',id:Number(target.dataset.id)})
    }
    if(action==='inventory') {overlay=overlay==='inventory'?null:'inventory';draw();return}
    if(action==='favorite-filter') {favoriteOnly=!favoriteOnly;inventoryPage=0;draw();return}
    if(action==='inventory-page') {inventoryPage=Number(target.dataset.page);draw();return}
    if(action==='inventory-select') {
      const key=target.dataset.key!
      inventorySelected=inventorySelected.includes(key)?inventorySelected.filter(v=>v!==key):[...inventorySelected,key]
      draw();return
    }
    if(action==='bulk-plant') {
      const packs=speciesIds.flatMap(species=>[{species,...common,count:view.state.seeds[species]},...view.state.variants.filter(p=>p.species===species)])
      const pack=packs.find(p=>inventorySelected.includes(`s${p.species}-${p.rarity}-${p.plus}-${p.minus}`) && p.count>0)
      if(!pack) return
      const plots=plotIndices(view.state.activeIsland).filter(i=>view.state.plots[i]?.open && !view.state.plots[i].plant && !plantingIssue(view.state,i,pack.species,undefined,pack))
      const key=`s${pack.species}-${pack.rarity}-${pack.plus}-${pack.minus}`
      const affected=plots.slice(0,Math.min(inventoryAmounts[key]??1,availableStock(view.state,pack.species,pack)))
      if(!affected.length) return
      const message=view.state.lang==='ru' ? `Посадить ${name(pack.species)} на ${affected.length} грядок? Пропущено ${plots.length-affected.length}.` :
        `Plant ${name(pack.species)} in ${affected.length} beds? Skipped ${plots.length-affected.length}.`
      if(!window.confirm(message)) return
      inventorySelected=[]
      return run({type:'bulk',commands:affected.map(plot=>({type:'plant',plot,species:pack.species,stock:pack}))})
    }
    if(action==='bulk-sell'||action==='bulk-extract') {
      const commands:BulkItem[]=[]
      const excluded:string[]=[]
      let total=0
      const selling=action==='bulk-sell'
      const draft=selling ? structuredClone(view.state) : view.state
      if(inventoryTab==='harvest') {
        for(const batch of view.state.basket.filter(b=>inventorySelected.includes('h'+b.id))) {
          const count=Math.min(batch.count,inventoryAmounts['h'+batch.id]??1)
          const yieldInfo=extractionYield(batch,count)
          const command={type:selling?'sellHarvest':'extractSeeds',id:batch.id,count} as const
          if (selling ? yieldInfo.attempts || harvestSaleIssue(draft,batch,count) || !trade(draft,command).ok
            : !batch.profile || !yieldInfo.seeds && !yieldInfo.attempts) {
            excluded.push(name(batch.species)+' #'+batch.id)
            continue
          }
          commands.push(command)
          total+=selling?harvestSaleValue(batch,count,view.state):yieldInfo.seeds
        }
      } else {
        for(const species of speciesIds) {
          const packs=[{species,...common,count:view.state.seeds[species]},...view.state.variants.filter(p=>p.species===species)]
          for(const pack of packs) {
            const key=`s${pack.species}-${pack.rarity}-${pack.plus}-${pack.minus}`
            if(!inventorySelected.includes(key) || !pack.count) continue
            const count=Math.min(pack.count,inventoryAmounts[key]??1)
            const command={type:'sellSeeds',species,profile:pack,count} as const
            if(seedSaleIssue(draft,species,pack,count) || !trade(draft,command).ok) {
              excluded.push(name(species)+' · '+describe(view.state.lang,pack));continue
            }
            commands.push(command)
            total+=count*seedSaleValue(species,pack,view.state)
          }
        }
      }
      const exclusions=excluded.slice(0,8).join(', ')+(excluded.length>8 ? ' …' : '')
      const message=view.state.lang==='ru'
        ? `Операций ${commands.length}. Исключено ${excluded.length}. ${exclusions} Итог ${total} ${selling?'монет':'собственных семян'}.`
        : `${commands.length} operations. ${excluded.length} excluded. ${exclusions} Total ${total} ${selling?'coins':'own seeds'}.`
      if(!commands.length) { notice=message;draw();return }
      if(!window.confirm(message)) return
      inventorySelected=[]
      return run({type:'bulk',commands})
    }
    if(action==='bulk-sell-all') {
      const batches=view.state.basket
      const eligible=batches.filter(batch=>quickSaleEligible(view.state,batch)).length
      const excluded=batches.length-eligible
      const value=quickSaleValue(view.state)
      const prompt=view.state.lang==='ru' ? `Продать ${eligible} партий за ${value} ◈? Сохранится ${excluded} партий.` :
        `Sell ${eligible} batches for ${value} ◈? ${excluded} batches will be retained.`
      if (eligible && window.confirm(prompt)) return run({type:'sell'})
      return
    }
    if (action==='inventory-tab') {
      inventoryTab=target.dataset.tab as InventoryTab
      inventorySelected=[]
      inventoryPage=0
      if (inventoryTab==='seeds' && (inventoryFilter==='pollinated' || inventoryFilter==='plain')) inventoryFilter='all'
      if (inventoryTab==='seeds' && inventorySort==='pollination') inventorySort='species'
      inventoryDetail=null
      draw()
      return
    }
    if (action==='inventory-detail') {
      const key=target.dataset.key!
      inventoryDetail=inventoryDetail===key?null:key
      draw()
      return
    }
    if(action==='inventory-minus'||action==='inventory-plus'||action==='inventory-all') {const key=target.dataset.key!, current=inventoryAmounts[key]??1;inventoryAmounts[key]=action==='inventory-minus'?Math.max(1,current-1):action==='inventory-all'?Number(target.dataset.max):Math.min(Number(target.dataset.max),current+1);draw();return}
    if(action==='inventory-plant') {mode('plant');chosen=target.dataset.seed as Species;stock=JSON.parse(target.dataset.profile!);draw();return}
    if (action==='inventory-sell-h' || action==='inventory-extract') {
      const id=Number(target.dataset.id), batch=view.state.basket.find(b=>b.id===id)
      if (!batch) return
      const key=target.dataset.key!, count=Math.min(batch.count,inventoryAmounts[key]??1)
      const sell=action==='inventory-sell-h'
      const wouldLoseCross=extractionYield(batch,count).attempts>0
      if (sell && (wouldLoseCross || !quickSaleEligible(view.state,batch) && count===batch.count) &&
        !window.confirm(inventoryWords[view.state.lang].confirmHarvest)) return
      delete inventoryAmounts[key]
      run(sell?{type:'sellHarvest',id,count}:{type:'extractSeeds',id,count})
      return
    }
    if(action==='profile-reserve'||action==='species-reserve') {
      const species=target.dataset.seed as Species, profile=JSON.parse(target.dataset.profile!) as Profile
      const individual=action==='profile-reserve'
      const current=view.state.reserves[individual?profileKey(species,profile):species] ?? 0
      const answer=window.prompt(view.state.lang==='ru'?(individual?'Минимальный резерв этого профиля':'Минимальный резерв вида'):(individual?'Minimum reserve for this profile':'Minimum reserve for this species'),String(current))
      if(answer===null) return
      const count=Number(answer)
      if(!Number.isSafeInteger(count) || count<0) return
      return run({type:'setReserve',species,profile:individual?profile:undefined,count})
    }
    if(action==='profile-protect'||action==='profile-favorite') {
      const species=target.dataset.seed as Species, profile=JSON.parse(target.dataset.profile!) as Profile
      const enabled=action==='profile-protect' ? !protectedProfile(view.state,species,profile) : !view.state.favorites.includes(profileKey(species,profile))
      return run({type:action==='profile-protect'?'protectProfile':'favoriteProfile',species,profile,enabled})
    }
    if (action==='inventory-sell-s') {
      const species=target.dataset.seed as Species, profile=JSON.parse(target.dataset.profile!) as Profile
      const key=target.dataset.key!, count=Math.min(stockCount(view.state,species,profile),inventoryAmounts[key]??1)
      if (count<1) return
      const remaining=view.state.seeds[species]+view.state.variants.filter(v=>v.species===species).reduce((n,v)=>n+v.count,0)-count
      if (!remaining && !window.confirm(inventoryWords[view.state.lang].confirmSeed+' '+name(species)+' ×'+count)) return
      delete inventoryAmounts[key]
      run({type:'sellSeeds',species,profile,count})
      return
    }
    if(action==='nursery'){controller.nursery();return}
    if(action==='nursery-protect') {
      const id=Number(target.dataset.id)
      return run({type:'protectPlant',id,enabled:!view.state.protectedPlants.includes(id)})
    }
    if(action==='nursery-return'){mode('plant');returnId=Number(target.dataset.id);draw();return}
    if (action==='pick-bed') {controller.pick(Number(target.dataset.id));return}
    if (action==='enter') return actions.enter()
    if (action==='menu') {mode('garden');actions.menu();return}
    if (action==='new-game' || action==='reset') {
      if (!window.confirm(t().confirmReset+' · '+view.state.planted.length+'/'+speciesIds.length+
        ' · '+view.state.plots.slice(0,plotCount).filter(p=>p.open).length+'/'+plotCount)) return
      mode('garden');firstSeeds=[];cornerPlanted=false;branch=null;entry=null;chapter=null;collectionFilter='all'
      inventoryAmounts={}; inventoryDetail=null; inventoryFilter='all'; inventoryTab='harvest'
      actions.reset();actions.enter();return
    }
    if (action==='shovel') {mode('garden',!view.shovel,view.shovel ? null : selected);return}
    if (action==='branch-seed') {mode('plant');chosen=target.dataset.seed as Species;stock=view.state.seeds[chosen]?common:view.state.variants.find(p=>p.species===chosen);actions.changeView({sunflower:chosen==='sunflower'});return}
    if (action==='corner-shovel') {mode('garden',true);return}
    if (action==='collect') {mode('garden');return}
    if (action==='compost') {confirmId=Number(target.dataset.id);draw();return}
    if (action==='cancel-compost') {confirmId=null;draw();return}
    if ((action==='confirm-compost' || action==='store') && selected!==null) {
      run({type:action==='store'?'store':'compost',plot:selected,expectedId:Number(target.dataset.id)})
      confirmId=null;actions.select(null);return
    }
    if (action==='skip') return run({type:'skipTutorial'})
    if (action==='music') return run({type:'music',muted:!view.state.musicMuted})
    if (action==='cancel-seed') {chosen=null;stock=undefined;actions.changeView({sunflower:false});return}
    if (action==='later' || action==='plant-reward') {
      const available=firstSeeds.find(id=>id===target.dataset.seed)
      firstSeeds=[];notice='';actions.command({type:'dismissHybrid'})
      if (action==='plant-reward' && available) {mode('plant');chosen=available;stock=view.state.seeds[available]?undefined:view.state.variants.find(p=>p.species===available)}
      draw();return
    }
    if (action==='experiment' || action==='corner') {
      branch=action;actions.command({type:'tutorialBranch',branch:action});mode(action==='experiment'?'breed':'build');return
    }
    if (action === 'filter') { collectionFilter = target.dataset.filter as typeof collectionFilter; entry = null; draw(); return }
    if (action === 'entry') { const id = target.dataset.entry as Species; entry = entry === id ? null : id; draw(); return }
    if (action === 'helper' || action === 'collection' || action === 'settings' || action === 'journal' || action === 'decor') {
      const nextOverlay = action === overlay ? null : action
      closePanels()
      overlay = nextOverlay
      updateDecor()
      return
    }
    if (action === 'close' && overlay) {
      closePanels()
      updateDecor()
      return
    }
    if (action === 'chapter') { chapter = Number(target.dataset.id); draw(); return }
    if (action === 'decor-slot') { if (target.dataset.id) pickDecor(target.dataset.id); return }
    if (action === 'decor-type') { decorChoice = {newType:target.dataset.id as DecorType}; updateDecor(); return }
    if (action === 'decor-item') { decorChoice = {id:Number(target.dataset.id)}; updateDecor(); return }
    if (action === 'cancel-decor') { decorChoice = null; updateDecor(); return }
    if (action === 'store-decor') return run({type:'storeDecor',id:Number(target.dataset.id)})
    if (action === 'confirm-decor' && slot && decorChoice) {
      const replaceId = target.dataset.occupant ? Number(target.dataset.occupant) : null
      const choice = decorChoice
      decorChoice = null
      run('newType' in choice ? {type:'buyDecor',decor:choice.newType,slot,replaceId} :
        {type:'placeDecor',id:choice.id,slot,replaceId})
      updateDecor()
      return
    }
    if (action === 'upgrade-basket') return run({type:'upgradeBasket',target:Number(target.dataset.level)})
    if (action === 'automation-toggle') {
      const key=target.dataset.setting as 'enabled'|'replant'|'extractPollinated'|'sellSeeds'|'sellFruit'
      return run({type:'setAutomation',settings:{...view.state.automation,[key]:!view.state.automation[key]}})
    }
    if (action === 'sound') return run({type:'sound',muted:!view.state.muted})
    if (action === 'export-save') return actions.exportSave()
    if (action === 'upgrade-helper') {
      const level = Number(target.dataset.level)
      if (level >= 1 && level <= 5) run({type:'upgradeHelper',target:level as BedLevel})
      return
    }
    if (action === 'buy-auto-sell') return run({type:'buyAutoSell'})
    if (action === 'mode') { mode(target.dataset.mode as Mode); return }
    if (action === 'seed') { stock=target.dataset.profile?JSON.parse(target.dataset.profile):undefined; chosen = target.dataset.seed as Species; returnId = null; actions.changeView({sunflower:chosen==='sunflower'});draw(); return }
    if (action === 'cancel-return') { returnId = null; draw(); return }
    if (action === 'return') { returnId = Number(target.dataset.id); draw(); return }
    if (action === 'sell') return run({type:'sell'})
    if (action === 'language') return run({type:'language',lang:view.state.lang === 'ru' ? 'en' : 'ru'})
    if (action === 'center') return actions.center()
    if (action === 'zoomIn') return actions.zoom(1)
    if (action === 'zoomOut') return actions.zoom(-1)
    if (action === 'close' || action === 'cancel') { actions.changeView({mode:view.mode,selected:null,moveFrom:null}); return }
    if (action === 'move' && selected !== null) { actions.changeView({mode:view.mode,selected,moveFrom:selected}); return }
    if (selected === null || !plot) return
    if(action==='plant-protect' && plot.plant) return run({type:'protectPlant',id:plot.plant.id,enabled:!view.state.protectedPlants.includes(plot.plant.id)})
    if(action==='plot-mode' || action==='plot-harvest' || action==='plot-replant') {
      const policy={...(plot.policy ?? defaultPolicy)}
      if(action==='plot-mode') {
        policy.mode=target.dataset.mode as typeof policy.mode
        policy.harvest=policy.mode!=='manual'
      }
      if(action==='plot-harvest') policy.harvest=!policy.harvest
      if(action==='plot-replant' && plot.plant) policy.replant=policy.replant ? null :
        {species:plot.plant.species,profile:{rarity:plot.plant.rarity,plus:plot.plant.plus,minus:plot.plant.minus}}
      return run({type:'plotPolicy',plot:selected,policy})
    }
    if (action === 'emergencyRadish') return run({type:'emergencyRadish',plot:selected})
    if (action === 'clear' && !window.confirm(`${t().confirmClear} ${expansionCost(view.state)} ◈`)) return
    if (action === 'upgrade' && !window.confirm(`${t().confirmUpgrade} ${bedLevels[(plot.level+1) as BedLevel].upgradeCost} ◈`)) return
    if(action==='harvest') return run({type:'harvest',plot:selected,expectedId:Number(target.dataset.id),cycle:Number(target.dataset.cycle)})
    if (action === 'clear' || action === 'upgrade') return run({type:action,plot:selected})
  })
  const controller:UI = {
    nursery(){if(view.menu || !view.state.revealed.length)return;firstSeeds=[];if(view.state.pendingHybrid)actions.command({type:'dismissHybrid'});closePanels();overlay='nursery';updateDecor()},
    notify: showRewards,
    pickDecor,
    render(next, storageWarning) { view=next; firstSeeds=next.state.pendingHybrid?[next.state.pendingHybrid]:[];branch=next.state.tutorialBranch;warning=storageWarning; draw() },
    pick(index) {
      if (!view || view.menu || overlay) return
      confirmId=null
      if (view.shovel) { actions.select(index); return }
      const plot = view.state.plots[index]

      if (view.mode === 'garden' && plot.plant?.readySince != null) {
        run({type:'harvest',plot:index,expectedId:plot.plant.id,cycle:plot.plant.lives})
        return
      }
      if (view.mode === 'build' && view.moveFrom !== null) {
        const from = view.moveFrom
        run({type:'move',from,to:index})
        actions.changeView({mode:view.mode,selected:index,moveFrom:null})
        return
      }
      if (view.mode === 'plant' && plot.open) {
        if (returnId !== null) {
          if (!plot.plant) { run({type:'return',plot:index,id:returnId}); returnId = null }
          else notice = t().occupied
          actions.select(index)
          return
        }
        if (!chosen || canRecoverGarden(view.state)) { actions.select(index); return }
        if (plot.plant) {
          if (!canReplace(view.state)) {
            if (view.state.sold && !view.state.occupiedHintShown && !view.state.tutorialSkipped) {
              actions.command({type:'showOccupiedHint'})
              notice=alpha[view.state.lang].occupied
            }
            actions.select(index)
            return
          }
          const replaceId = plot.plant.id
          if (plantingIssue(view.state,index,chosen,replaceId,stock)) { run({type:'plant',plot:index,species:chosen,stock,replaceId}); return }
          const price = speciesInfo[chosen].seedPrice
          const amount = stock || price === null ? `1 ${t().seedUnit}` : `${price} ${t().cost}`
          if (!window.confirm(`${t().confirmOld}: ${name(plot.plant.species)} #${replaceId}\n${t().confirmNew}: ${name(chosen)} — ${amount}`)) return
          run({type:'plant',plot:index,species:chosen,stock,replaceId})
        } else run({type:'plant',plot:index,species:chosen,stock})
      }
      actions.select(index)
    }
  }
  return controller
}
