import { isValuablePlant, protectedHarvest } from '../game/stock-policy'
import { canonical } from '../game/genetics'
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
import { extractionYield, groupedSaleIssue, marketFruitSalePlan, marketSeedStock, quickSaleEligible, readyFruitSalePlan, readyFruitSaleValue, seedSaleIssue, trade } from '../game/trade'
import type { DecorChoice } from './panels/garden'
import { uiMarkup, type RepeatChoice, type CollectionFilter, type Overlay } from './render'
import { plantName, words } from './strings'
import { evolutionErrors } from './panels/evolution'
import type { MarketSort } from './panels/market'
import { templateDetails } from './panels/automation'
import { plotModes } from '../game/model'
import { productionAction } from './panels/production'
import { createTutorialOverlay } from './tutorial'
import './ui.css'

export function createUI(host: HTMLElement, actions: UIActions): UI {
  let view: WorldView
  const tutorialOverlay = createTutorialOverlay(host,actions)
  let warning: string | null = null
  let chosen: Species|null = null
  let stock:Profile|undefined
  let repeatPlanting=false
  let firstSeeds:Species[]=[]
  let discoveryRarity:Rarity|null=null
  let discoverySpecies:Species|null=null
  let cornerPlanted=false
  let branch:'experiment'|'corner'|null=null
  let confirmId:number|null=null
  let lastHarvest:RepeatChoice|null=null
  let statsWindow:60|300=60
  let statsByVolume=false
  let notice = ''
  let last = ''
  let pressing = false
  let returnId: number | null = null
  let overlay: Overlay|null = null
  let marketKind:MarketKind|'orders'|'stall'='fruit'
  let marketSort:MarketSort='price'
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
    if (view.menu) return
    if (overlay !== 'decor') { closePanels(); overlay='decor' }
    slot = id
    updateDecor()
    draw()
  }
  function closePanels() {
    overlay = null
    slot = null
    decorChoice = null
  }

  function showRewards(events:string[]) {
    const harvest=events.find(e=>e.startsWith('Harvested:'))?.split(':')
    if(harvest) notice='+'+harvest[3]+' '+name(harvest[2] as Species)
    const discovered=events.find(event=>event.startsWith('HybridDiscovered:'))?.split(':')
    if (discovered) { discoverySpecies=discovered[1] as Species; discoveryRarity=discovered[2] as Rarity }
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
    if(events.includes('CropFailed'))notice=view.state.lang==='ru'?'Неурожай. Один сбор из запаса израсходован.':'Crop failed. One harvest from the capacity was used.'
    if(events.includes('PlantCleaned'))notice=view.state.lang==='ru'?'Грядка очищена':'Bed cleared'
    if(events.includes('CrossReady') || events.includes('CloneReady')) {
      notice=view.state.lang==='ru'?'В теплице можно получить семя.':'A seed is ready to collect in the greenhouse.'
    }
  }
  function run(command: Command) {
    const plant=command.type==='harvest' ? view.state.plots[command.plot]?.plant : null
    if (plant?.lives===1 && isValuablePlant(view.state,plant) &&
      !window.confirm(view.state.lang==='ru'?'Последний сбор. Собрать урожай и потерять этот экземпляр?':'Final harvest. Harvest and lose this specimen?')) return
    const coins=view.state.coins
    const result = actions.command(command)
    if (result.ok && result.events.length) {
      lastHarvest=command.type==='harvest' && plant && result.events.includes('Withered') ?
        {plot:command.plot,species:plant.species,profile:canonical(plant)} : null
    }
    if (!result.ok) {
      const dict = t() as Record<string,string>
      notice = dict[result.reason] ?? evolutionErrors[view.state.lang][result.reason] ?? dict.error
    } else if (result.events.includes('GardenCompleted')) notice = t().finished
    else {
      notice = ''
      showRewards(result.events)
      if (result.events.includes('Sold')) notice='+'+(view.state.coins-coins)+' ◈'
      if (result.obtained?.length) {
        const lang = view.state.lang
        notice = inventoryWords[lang].obtained+' · ' + result.obtained
          .map(p=>name(p.species)+' · '+field[lang][p.rarity]+' ×'+p.count).join(' / ')
        if (result.events.includes('ExperimentFailed')) notice += ' · '+field[lang].miss
        const rarity=result.obtained.find(p=>p.rarity!=='common' && !view.state.tutorialSeen.includes('notice-rarity-'+p.rarity))?.rarity
        if (rarity) {
          actions.command({type:'tutorialSeen',id:'notice-rarity-'+rarity})
          notice += ' · '+(lang==='ru'?'Новая редкость':'New rarity')+' '+field[lang][rarity]
        }
      }
    }
    draw()
  }
  function draw() {
    if (!view) return
    if (pressing) return
    let repeat=lastHarvest
    if (repeat?.profile && !availableStock(view.state,repeat.species,repeat.profile)) {
      if (availableStock(view.state,repeat.species,common)) repeat={...repeat,profile:common}
      else repeat=speciesInfo[repeat.species].seedPrice===null ? null : {...repeat,profile:undefined}
    }
    const html = uiMarkup(view,{repeat,statsWindow,statsByVolume,
      inventoryFilter,inventoryTab,inventorySort,inventoryAmounts,inventoryMinimum,inventoryDetail,crossParents,inventorySelected,favoriteOnly,inventorySearch,inventoryPage,marketKind,marketSort,
      stock,repeatPlanting,cornerPlanted,firstSeeds,discoveryRarity:discoverySpecies===firstSeeds[0] ? discoveryRarity : null,branch,confirmId,overlay, warning, notice, chosen, returnId, collectionFilter, entry, chapter, slot, decorChoice
    })
    if (html === last) return
    const active = document.activeElement as HTMLElement | null
    const caret=active instanceof HTMLInputElement && active.type==='search' ? active.selectionStart : null
    const focusData=active ? JSON.stringify({...active.dataset}) : ''
    const context = overlay ?? view.mode
    const scroll = panelKey === context ? host.querySelector('.context-inner')?.scrollTop ?? 0 : 0
    const quickActionsOpen=host.querySelector<HTMLDetailsElement>('.quick-garden-actions')?.open ?? false
    const guideOpen=host.querySelector<HTMLDetailsElement>('.guide-chapters')?.open ?? false
    const guideSections=[...host.querySelectorAll<HTMLDetailsElement>('.guide-chapters > details')].map(detail=>detail.open)
    const openPlotDetails=new Set([...host.querySelectorAll<HTMLDetailsElement>('details[data-plot-details][open]')]
      .map(detail=>detail.dataset.plotDetails))
    const productionSelections = [...host.querySelectorAll<HTMLSelectElement>('[data-production-slot] select')].map(select=>({
      slot:select.closest<HTMLElement>('[data-production-slot]')?.dataset.productionSlot,
      key:select.hasAttribute('data-production-seed')?'seed':select.hasAttribute('data-production-mode')?'mode':'plant',
      value:select.value
    }))
    panelKey = context
    host.innerHTML = html
    tutorialOverlay.render(view)
    const quickActions=host.querySelector<HTMLDetailsElement>('.quick-garden-actions')
    if (quickActions) quickActions.open=quickActionsOpen
    const guide=host.querySelector<HTMLDetailsElement>('.guide-chapters')
    if (guide) guide.open=guideOpen
    host.querySelectorAll<HTMLDetailsElement>('.guide-chapters > details').forEach((detail,index)=>{detail.open=guideSections[index]??false})
    host.querySelectorAll<HTMLDetailsElement>('details[data-plot-details]').forEach(detail=>{
      detail.open=openPlotDetails.has(detail.dataset.plotDetails)
    })
    for (const selection of productionSelections) {
      const select=host.querySelector<HTMLSelectElement>(`[data-production-slot="${selection.slot}"] [data-production-${selection.key}]`)
      if (select && [...select.options].some(option=>option.value===selection.value)) select.value=selection.value
    }
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
    if (target.matches('[data-inventory-amount]')) {
      const input=target as HTMLInputElement
      inventoryAmounts[input.dataset.key!]=Math.max(1,Math.min(Number(input.max),Math.floor(Number(input.value)||1)))
      draw();return
    }
    if (target.matches('[data-sale-strategy],[data-sale-minimum]')) {
      const settings={...view.state.trading}
      if (target.matches('[data-sale-strategy]')) settings.strategy=target.value as typeof settings.strategy
      else settings.minimum=Number(target.value)
      return run({type:'setTrading',settings})
    }
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
    if (!view) return
    if (!target) {
      const result=productionAction(event,actions,view.state)
      if (result) {
        if (result.ok) { notice=''; showRewards(result.events) }
        else notice=(t() as Record<string,string>)[result.reason] ?? evolutionErrors[view.state.lang][result.reason] ?? t().error
        draw()
      }
      return
    }
    const action = target.dataset.action, selected = view.selected, plot = selected === null ? null : view.state.plots[selected]
    const mode=(next:Mode, shovel=false, index:number|null=null)=>{
      closePanels(); stock=undefined; chosen=null; repeatPlanting=false; returnId=null; confirmId=null; notice=''
      updateDecor()
      actions.changeView({mode:next,sunflower:false,selected:index,moveFrom:null,shovel})
    }
    if (action==='gather-ready') return run({type:'gatherReady',island:view.state.activeIsland})
    if (action==='clear-withered') return run({type:'clearWithered',island:view.state.activeIsland})
    if (action==='sell-ready-fruit') return run({type:'sellReadyFruit'})
    if (action==='repeat-plant-toggle') { repeatPlanting=!repeatPlanting; draw(); return }
    if (action==='repeat-plant-done') { mode('garden'); return }
    if (action==='toggle-indicators') { actions.changeView({showIndicators:view.showIndicators===false}); return }
    if (action==='plant-again' && lastHarvest && !view.state.plots[lastHarvest.plot].plant) {
      const {plot,species,profile}=lastHarvest
      const stock=profile && availableStock(view.state,species,profile)>0 ? profile :
        availableStock(view.state,species,common)>0 ? common : undefined
      return run({type:'plant',plot,species,stock})
    }
    if (action==='statistics') {overlay='statistics';draw();return}
    if (action==='stats-window') {statsWindow=target.dataset.window==='300'?300:60;draw();return}
    if (action==='stats-sort') {statsByVolume=!statsByVolume;draw();return}
    if(action==='evolution') {overlay=overlay==='evolution'?null:'evolution';draw();return}
    if(action==='storage') {overlay='nursery';draw();return}
    if(action==='market') {overlay=overlay==='market'?null:'market';draw();return}
    if(action==='market-product') {marketKind=target.dataset.kind as typeof marketKind;draw();return}
    if(action==='market-sort') {marketSort=target.dataset.sort==='value'?'value':'price';draw();return}
    if(action==='market-sell-species' || action==='market-sell-all') {
      const selectedSpecies=target.dataset.species as Species|undefined
      const speciesList:readonly Species[]=selectedSpecies ? [selectedSpecies] : speciesIds
      const draft=structuredClone(view.state)
      const commands:BulkItem[]=[]
      if (target.dataset.kind==='fruit') {
        for (const item of marketFruitSalePlan(draft).filter(item=>!selectedSpecies || item.batch.species===selectedSpecies)) {
          const command={type:'sellHarvest',id:item.batch.id,count:item.count} as const
          if (trade(draft,command).ok) commands.push(command)
        }
      } else {
        for (const species of speciesList) {
        const packs=[{species,...common,count:draft.seeds[species]},...draft.variants.filter(pack=>pack.species===species)]
        for (const pack of packs) {
          let count=marketSeedStock(draft,species,pack)
          if (count && seedSaleIssue(draft,species,pack,count)==='lastProfile') count--
          if (!count) continue
          const command={type:'sellSeeds',species,profile:canonical(pack),count} as const
          if (trade(draft,command).ok) commands.push(command)
        }
        }
      }
      if (!commands.length) return
      const value=draft.coins-view.state.coins
      const relevant=target.dataset.kind==='fruit' ? view.state.basket.filter(batch=>!selectedSpecies || batch.species===selectedSpecies).length :
        speciesList.reduce<number>((sum,species)=>sum+(view.state.seeds[species]>0?1:0)+view.state.variants.filter(pack=>pack.species===species && pack.count>0).length,0)
      const excluded=Math.max(0,relevant-commands.length)
      const prompt=view.state.lang==='ru' ? `Продать доступные товары за ${value} ◈? Операций: ${commands.length}. Исключено партий: ${excluded}.` : `Sell available goods for ${value} ◈? Operations: ${commands.length}. Excluded batches: ${excluded}.`
      if (window.confirm(prompt)) return run({type:'bulk',commands})
      return
    }
    if(action==='trading-toggle') {
      const key=target.dataset.setting==='overflow'?'overflow':'reserveOrders'
      return run({type:'setTrading',settings:{...view.state.trading,[key]:!view.state.trading[key]}})
    }
    if(action==='plot-template-all') {
      const plots=plotIndices(view.state.activeIsland).filter(i=>view.state.plots[i]?.open)
      const template=target.dataset.mode as PlotMode
      const details=templateDetails[view.state.lang][plotModes.indexOf(template)]
      const count=view.state.lang==='ru' ? 'Грядок' : 'Beds'
      if (!window.confirm(`${details}. ${count} · ${plots.length}`)) return
      return run({type:'plotTemplate',mode:template,plots})
    }
    if(action==='cross-parent') {
      const id=Number(target.dataset.id)
      crossParents=crossParents.includes(id)?crossParents.filter(p=>p!==id):[...crossParents,id].slice(-2)
      draw();return
    }
    if(action==='cross-start' && crossParents.length===2) {
      run({type:'startCross',parents:[crossParents[0],crossParents[1]]});crossParents=[];return
    }
    if(action==='cross-collect') return run({type:'collectCross',id:Number(target.dataset.id)})
    if(action==='clone-start') return run({type:'startClone',id:Number(target.dataset.id)})
    if(action==='clone-collect') return run({type:'collectClone',id:Number(target.dataset.id)})
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
    if(action==='research-batch') {
      const id=Number(target.dataset.id), batch=view.state.basket.find(item=>item.id===id)
      if (!batch) return
      overlay='inventory';inventoryTab='harvest';inventoryFilter=batch.species;inventorySearch='';inventorySort='species'
      inventoryPage=Math.floor(view.state.basket.filter(item=>item.species===batch.species).findIndex(item=>item.id===id)/12)
      inventoryDetail='h'+id;draw();return
    }
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
      inventorySelected=[]
      mode('plant');chosen=pack.species;stock=canonical(pack);draw();return
    }
    if(action==='bulk-sell'||action==='bulk-extract') {
      const commands:BulkItem[]=[]
      const excluded:string[]=[]
      let total=0, attempts=0
      const selling=action==='bulk-sell'
      const draft=selling ? structuredClone(view.state) : view.state
      if(inventoryTab==='harvest') {
        for(const batch of view.state.basket.filter(b=>inventorySelected.includes('h'+b.id))) {
          const count=Math.min(batch.count,inventoryAmounts['h'+batch.id]??1)
          const yieldInfo=extractionYield(batch,count)
          const command=selling ? {type:'sellHarvest',id:batch.id,count} as const : {type:'extractSeeds',id:batch.id,count} as const
          if (command.type==='sellHarvest' ? batch.lots.some(lot=>lot.crossPending) || groupedSaleIssue(draft,command) || !trade(draft,command).ok
            : protectedHarvest(draft,batch) || !batch.profile || !yieldInfo.seeds && !yieldInfo.attempts) {
            excluded.push(name(batch.species)+' #'+batch.id)
            continue
          }
          commands.push(command)
          total+=selling?harvestSaleValue(batch,count,view.state):yieldInfo.seeds
          if (!selling) attempts+=yieldInfo.attempts
        }
      } else {
        for(const species of speciesIds) {
          const packs=[{species,...common,count:view.state.seeds[species]},...view.state.variants.filter(p=>p.species===species)]
          for(const pack of packs) {
            const key=`s${pack.species}-${pack.rarity}-${pack.plus}-${pack.minus}`
            if(!inventorySelected.includes(key) || !pack.count) continue
            const count=Math.min(pack.count,inventoryAmounts[key]??1)
            const command={type:'sellSeeds',species,profile:pack,count} as const
            if(groupedSaleIssue(draft,command) || !trade(draft,command).ok) {
              excluded.push(name(species)+' · '+describe(view.state.lang,pack));continue
            }
            commands.push(command)
            total+=count*seedSaleValue(species,pack,view.state)
          }
        }
      }
      const exclusions=excluded.slice(0,8).join(', ')+(excluded.length>8 ? ' …' : '')
      const message=(view.state.lang==='ru'
        ? `Количество ${commands.reduce((n,c)=>n+('count' in c?c.count:0),0)}. Операций ${commands.length}. Исключено ${excluded.length}. ${exclusions} Итог ${total} ${selling?'монет':'собственных семян'}.`
        : `${commands.reduce((n,c)=>n+('count' in c?c.count:0),0)} items. ${commands.length} operations. ${excluded.length} excluded. ${exclusions} Total ${total} ${selling?'coins':'own seeds'}.`) +
        (attempts ? (view.state.lang==='ru' ? ` Попыток скрещивания ${attempts}.` : ` Hybridization attempts ${attempts}.`) : '')
      if(!commands.length) { notice=message;draw();return }
      if(!window.confirm(message)) return
      inventorySelected=[]
      return run({type:'bulk',commands})
    }
    if(action==='bulk-sell-all') {
      const batches=view.state.basket
      const eligible=readyFruitSalePlan(view.state).length
      const excluded=batches.length-eligible
      const value=readyFruitSaleValue(view.state)
      const prompt=view.state.lang==='ru' ? `Продать ${eligible} партий за ${value} ◈? Сохранится ${excluded} партий.` :
        `Sell ${eligible} batches for ${value} ◈? ${excluded} batches will be retained.`
      if (eligible && window.confirm(prompt)) return run({type:'sellReadyFruit'})
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
    if(action==='research-direction' && selected!==null && plot?.plant) return run({type:'researchDirection',plot:selected,expectedId:plot.plant.id,recipeId:target.dataset.recipeId!})
    if(action==='research-donor' && selected!==null && plot?.plant) return run({type:'researchDonor',plot:selected,expectedId:plot.plant.id,recipeId:target.dataset.recipeId!,donor:target.dataset.donor as Species,donorId:target.dataset.id ? Number(target.dataset.id) : null})
    if(action==='nursery'){controller.nursery();return}
    if(action==='nursery-protect') {
      const id=Number(target.dataset.id)
      return run({type:'protectPlant',id,enabled:!view.state.protectedPlants.includes(id)})
    }
    if(action==='nursery-return'){mode('plant');returnId=Number(target.dataset.id);draw();return}
    if (action==='pick-bed') {controller.pick(Number(target.dataset.id));return}
    if (action==='inspect-bed') {controller.inspect(Number(target.dataset.id));return}
    if (action==='enter') return actions.enter()
    if (action==='menu') {mode('garden');actions.menu();return}
    if (action==='new-game' || action==='reset') {
      if (!window.confirm(t().confirmReset+' · '+view.state.planted.length+'/'+speciesIds.length+
        ' · '+view.state.plots.slice(0,plotCount).filter(p=>p.open).length+'/'+plotCount)) return
      mode('garden');firstSeeds=[];cornerPlanted=false;branch=null;entry=null;chapter=null;collectionFilter='all'
      inventoryAmounts={}; inventoryDetail=null; inventoryFilter='all'; inventoryTab='harvest'
      lastHarvest=null;actions.reset();actions.enter();return
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
    if (action==='tutorial-next') return run({type:'tutorialSeen',id:target.dataset.id!})
    if (action==='restart-tutorial') return run({type:'restartTutorial'})
    if (action==='music') return run({type:'music',muted:!view.state.musicMuted})
    if (action==='cancel-seed') {chosen=null;stock=undefined;actions.changeView({sunflower:false});return}
    if (action==='later' || action==='plant-reward') {
      const available=firstSeeds.find(id=>id===target.dataset.seed)
      firstSeeds=[];discoverySpecies=null;discoveryRarity=null;notice='';actions.command({type:'dismissHybrid'})
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
    if (action === 'seed') {
      stock=target.dataset.profile?JSON.parse(target.dataset.profile):undefined
      chosen=target.dataset.seed as Species; returnId=null
      if (selected!==null && plot?.open && !plot.plant) {
        const result=actions.command(repeatPlanting && stock ? {type:'repeatPlant',plot:selected,species:chosen,stock} : {type:'plant',plot:selected,species:chosen,stock})
        if (result.ok) {
          showRewards(result.events)
          if (repeatPlanting && stock && availableStock(view.state,chosen,stock)>0) actions.changeView({mode:'plant',selected:null,sunflower:false})
          else { chosen=null; stock=undefined; repeatPlanting=false; actions.changeView({mode:'garden',selected:null,sunflower:false}) }
        } else notice=(t() as Record<string,string>)[result.reason] ?? t().error
        draw();return
      }
      actions.changeView({sunflower:chosen==='sunflower'});draw();return
    }
    if (action === 'cancel-return') { returnId = null; draw(); return }
    if (action === 'return') { returnId = Number(target.dataset.id); draw(); return }
    if (action === 'sell') return run({type:'sell'})
    if (action === 'language') return run({type:'language',lang:view.state.lang === 'ru' ? 'en' : 'ru'})
    if (action === 'center') return actions.center()
    if (action === 'zoomIn') return actions.zoom(1)
    if (action === 'zoomOut') return actions.zoom(-1)
    if (action === 'close' || action === 'cancel') { chosen=null; stock=undefined; repeatPlanting=false; actions.changeView({mode:'garden',selected:null,moveFrom:null,shovel:false}); return }
    if (action === 'move' && selected !== null) { actions.changeView({mode:'build',selected,moveFrom:selected}); return }
    if (action === 'bed-settings' && selected !== null) { actions.changeView({mode:'build',selected}); return }
    if (action === 'dig' && selected !== null) { actions.changeView({mode:'garden',selected,shovel:true}); return }
    if (selected === null || !plot) return
    if(action==='plant-protect' && plot.plant) return run({type:'protectPlant',id:plot.plant.id,enabled:!view.state.protectedPlants.includes(plot.plant.id)})
    if(action==='plot-mode') return run({type:'plotTemplate',plots:[selected],mode:target.dataset.mode as PlotMode})
    if(action==='plot-harvest' || action==='plot-replant') {
      const policy={...(plot.policy ?? defaultPolicy)}
      if(action==='plot-harvest') policy.harvest=!policy.harvest
      if(action==='plot-replant' && plot.plant) policy.replant=policy.replant ? null :
        {species:plot.plant.species,profile:{rarity:plot.plant.rarity,plus:plot.plant.plus,minus:plot.plant.minus}}
      return run({type:'plotPolicy',plot:selected,policy})
    }
    if (action === 'emergencyRadish') return run({type:'emergencyRadish',plot:selected})
    if (action === 'clear' && !window.confirm(`${t().confirmClear} ${expansionCost(view.state)} ◈`)) return
    if(action==='harvest') return run({type:'harvest',plot:selected,expectedId:Number(target.dataset.id),cycle:Number(target.dataset.cycle)})
    if (action === 'clear' || action === 'upgrade') {
      run({type:action,plot:selected})
      if (action==='clear') actions.changeView({mode:'garden',selected:null})
      return
    }
  })
  const controller:UI = {
    market(){if(view.menu || !tutorialOverlay.allowsPlot())return;closePanels();overlay='market';draw()},
    bridge(){if(view.menu || !tutorialOverlay.allowsPlot())return;closePanels();overlay='bridge';draw()},
    helper(){if(view.menu || !tutorialOverlay.allowsPlot())return;closePanels();overlay='helper';draw()},
    inspect(index){if(view.menu || !tutorialOverlay.allowsPlot(index))return;closePanels();actions.changeView({mode:'garden',selected:index,shovel:false})},
    nursery(){if(view.menu || !tutorialOverlay.allowsPlot())return;firstSeeds=[];if(view.state.pendingHybrid)actions.command({type:'dismissHybrid'});closePanels();overlay='evolution';updateDecor()},
    notify: showRewards,
    pickDecor,
    render(next, storageWarning) { view=next; firstSeeds=next.state.pendingHybrid?[next.state.pendingHybrid]:[];branch=next.state.tutorialBranch;warning=storageWarning; draw() },
    pick(index) {
      if (!view || view.menu || overlay || !tutorialOverlay.allowsPlot(index)) return
      confirmId=null
      if (view.shovel) { actions.select(index); return }
      const plot = view.state.plots[index]

      if (view.mode==='garden' && plot.plant?.lives===0) {
        run({type:'cleanup',plot:index,expectedId:plot.plant.id})
        return
      }

      if (view.mode === 'garden' && !plot.plant) {
        actions.changeView({mode:plot.open?'plant':'build',selected:index}); return
      }
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
          notice=t().occupied
          draw()
          return
        } else {
          run(repeatPlanting && stock ? {type:'repeatPlant',plot:index,species:chosen,stock} : {type:'plant',plot:index,species:chosen,stock})
          if (stock && availableStock(view.state,chosen,stock)===0) {
            chosen=null; stock=undefined; repeatPlanting=false
            actions.changeView({mode:'garden',selected:null,sunflower:false})
            return
          }
        }
      }
      actions.select(index)
    }
  }
  return controller
}
