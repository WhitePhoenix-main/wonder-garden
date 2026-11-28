import { createServer } from 'vite'
import { resolve } from 'node:path'

const root=resolve(process.argv[2]??'.')
const durations=process.argv[3] ? process.argv[3].split(',').map(Number) : [900,1800,3600,7200,14400]
if (durations.some(seconds=>!Number.isSafeInteger(seconds) || seconds<15 || seconds>14400)) {
  throw new Error('Pass comma-separated durations from 15 to 14400 active seconds')
}
const seeds=[17,42,2026]
const loader=await createServer({
  root,server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'
})

try {
  const game=await loader.ssrLoadModule('/src/game/index.ts')
  const {advance,execute,initialState}=game
  const {balance,evolution,market,plotCount,speciesInfo,speciesIds}=await loader.ssrLoadModule('/src/game/config.ts')
  const {common,plantStats,stockCount,nextRandom,inherit,compatible,quantity,fruitCount}=await loader.ssrLoadModule('/src/game/genetics.ts')
  const {marketQuote}=await loader.ssrLoadModule('/src/game/market.ts')
  const {orderQuote}=await loader.ssrLoadModule('/src/game/orders.ts')
  const {defaultPolicy}=await loader.ssrLoadModule('/src/game/stock-policy.ts')
  const {pollinationFor,secondsLeft,canRecoverGarden}=await loader.ssrLoadModule('/src/game/queries.ts')
  const {harmony}=await loader.ssrLoadModule('/src/game/decor.ts')
  const {extractionYield,quickSaleEligible}=await loader.ssrLoadModule('/src/game/trade.ts')
  const living=Boolean(initialState(17).passive)
  const offline=living ? await loader.ssrLoadModule('/src/game/offline.ts') : null
  const production=living ? await loader.ssrLoadModule('/src/game/nursery.ts') : null

  const capitalActions=new Set(['clear','upgrade','upgradeBasket','upgradeHelper','upgradeStall','upgradeGreenhouse','buyAutoSell','buyDecor','restoreBridge'])
  const eightRadishes=Array(8).fill('radish')
  const mixed=['radish','strawberry','blueberry','radish','strawberry','blueberry','radish','strawberry']
  const rare={rarity:'rare',plus:['fruitful'],minus:null}
  const scenarios=[
    {id:'new-garden', planting:eightRadishes.slice(0,2), fresh:true},
    {id:'manual-radish',planting:eightRadishes.slice(0,2)},
    {id:'manual-strawberry',planting:['strawberry','strawberry']},
    {id:'monoculture',planting:eightRadishes},
    {id:'mixed',planting:mixed},
    {id:'auras',planting:['sunflower','strawberry','blueberry','radish','clover','blueberry','radish','strawberry']},
    {id:'seed-production',planting:eightRadishes,seed:true},
    {id:'selective-breeding',planting:mixed,cross:true},
    {id:'rare-lines',planting:eightRadishes,rare:true},
    {id:'helper-harvest',planting:eightRadishes,helper:1,cleanup:false},
    {id:'helper-cleanup',planting:eightRadishes,helper:1,cleanup:true},
    {id:'helper-replant',planting:eightRadishes,helper:5,cleanup:true,replant:true},
    {id:'orders',planting:mixed,orders:true},
    {id:'target-quote',planting:mixed,hold:true},
    {id:'two-islands',planting:[...mixed,...mixed],valley:true}
  ]

  function measure(seed) {
    const state=initialState(seed)
    const report={seed,manualActions:0,helperHarvests:0,helperCleanups:0,helperReplants:0,helperCapacity:0,
      sales:0,orders:0,seedCost:0,breedingCost:0,capital:0,fruit:0,harvests:0,cropFailures:0,seedsObtained:0,deaths:0,
      specimens:0,firstHybrid:null,firstTier:{},firstProduction:null,allSpecies:null,allBeds:null,bridge:null}
    let sum=0,samples=0,floor=0
    function observe(events) {
      for (const event of events) {
        if (event.startsWith('Harvested:')) {
          report.fruit+=Number(event.split(':').at(-1))
          report.harvests++
        }
        if (event.startsWith('HelperHarvested:')) report.helperHarvests++
        if (event.startsWith('PlantCleaned:')) report.helperCleanups++
        if (event.startsWith('AutoPlanted:')) report.helperReplants++
        if (event.startsWith('RecipeRevealed:')) report.firstHybrid??=state.playTime
        if (event.startsWith('OwnSeeds:')) report.seedsObtained+=Number(event.split(':')[1])
        if (event==='CrossCollected' || event==='CloneCollected' || event.startsWith('RecipeRevealed:')) report.seedsObtained++
        if (event==='CropFailed') report.cropFailures++
        if (event==='Withered') report.deaths++
      }
    }
    function milestones() {
      for (const species of state.planted) {
        const tier=speciesInfo[species].generation+1
        if (tier>1) report.firstTier[tier]??={second:state.playTime,capital:report.capital,seedCost:report.seedCost}
      }
      if (state.planted.length===speciesIds.length) report.allSpecies??=state.playTime
      if (state.plots.slice(0,plotCount).every(p=>p.open)) report.allBeds??=state.playTime
      if (state.plots.length>plotCount) report.bridge??=state.playTime
      if (state.passive?.beds.length) report.firstProduction??={second:state.playTime,capital:report.capital}
    }
    function run(command,{required=true,preparation=false}={}) {
      const before=state.coins
      const result=execute(state,command)
      if (!result.ok) {
        if (required) throw Error(JSON.stringify({command,reason:result.reason,time:state.playTime}))
        return null
      }
      const delta=state.coins-before
      if (capitalActions.has(command.type)) report.capital-=delta
      else if (command.type==='startCross'||command.type==='startClone') report.breedingCost-=delta
      else if (command.type==='plant') report.seedCost-=delta
      else if (command.type==='fulfillOrder') report.orders+=delta
      else if (delta>0) report.sales+=delta
      if (!preparation) {
        report.manualActions++
        if (command.type==='plant') report.specimens++
        if (command.type!=='cleanup') observe(result.events)
        milestones()
      }
      return result
    }
    function tick(seconds=1) {
      const before=state.coins
      const interval=balance.helperLevels[state.helperLevel].intervalSec
      if (interval && state.automation.enabled && seconds>=state.harvestRemaining) {
        const turns=1+Math.floor((seconds-state.harvestRemaining)/interval)
        report.helperCapacity+=turns*evolution.helperThroughput[state.helperLevel]
      }
      observe(advance(state,seconds))
      report.sales+=state.coins-before
    }
    function quote(ids,kind='fruit') {
      for (const id of ids) {
        const price=marketQuote(state,id,kind).pricePercent
        sum+=price
        floor+=Number(price===market.minimumPricePercent)
        samples++
      }
    }
    function clean(index) {
      const plant=state.plots[index].plant
      if (plant?.lives===0) run({type:'cleanup',plot:index,expectedId:plant.id})
    }
    function harvest(index,required=true) {
      const plant=state.plots[index].plant
      return run({type:'harvest',plot:index,expectedId:plant.id,cycle:plant.lives},{required})
    }
    function result(extra={}) {
      const gross=report.sales+report.orders
      const operating=report.seedCost+report.breedingCost+(extra.replenishmentCost??0)
      return {...report,...extra,activeSeconds:state.playTime,endingCoins:state.coins,gross,operating,
        netOperating:gross-operating,netAfterCapital:gross-operating-report.capital,
        netPerMinute:state.playTime ? (gross-operating)*60/state.playTime : null,
        quoteAverage:samples ? sum/samples : null,floorPercent:samples ? 100*floor/samples : null,
        helperUtilization:report.helperCapacity ?
          100*(report.helperHarvests+report.helperCleanups+report.helperReplants)/report.helperCapacity : null}
    }
    return {state,report,run,tick,quote,clean,harvest,result}
  }

  function openBeds(state,run,indices) {
    for (const plot of indices) if (!state.plots[plot].open) run({type:'clear',plot})
  }

  function firstSpecies(state,run) {
    run({type:'plant',plot:8,species:'strawberry'})
    run({type:'plant',plot:9,species:'sunflower'})
    openBeds(state,run,[4,5])
    run({type:'plant',plot:5,species:'blueberry'})
  }

  function setup(m,scenario,duration) {
    const {state,run}=m
    if (scenario.fresh) return [12,13]
    const prepare=(command)=>run(command,{preparation:true})
    state.coins=50_000
    state.sold=true
    firstSpecies(state,prepare)
    run({type:'compost',plot:5,expectedId:state.plots[5].plant.id},{preparation:true})
    run({type:'compost',plot:8,expectedId:state.plots[8].plant.id},{preparation:true})
    run({type:'compost',plot:9,expectedId:state.plots[9].plant.id},{preparation:true})
    // Later tiers are prepared for isolated benchmarks. The legal route below earns them.
    state.revealed=['solar_strawberry']
    openBeds(state,prepare,[0,1,2,3,6,7])
    for (const target of [1,2,3]) prepare({type:'upgradeBasket',target})
    const indices=scenario.planting.map((_,i)=>i<8 ? i : plotCount+i-8)
    if (scenario.valley) {
      state.planted=[...speciesIds]
      for (const [plot,index] of [8,9,10,11,12,13,14,15].entries()) {
        if (!state.plots[index].open) prepare({type:'clear',plot:index})
        if (state.plots[index].plant) prepare({type:'compost',plot:index,expectedId:state.plots[index].plant.id})
        const species=speciesIds[plot+4]
        if (speciesInfo[species].seedPrice===null) {
          if (!state.revealed.includes(species)) state.revealed.push(species)
          state.seeds[species]=1
        }
        prepare({type:'plant',plot:index,species})
      }
      for (const [decor,slot] of [['sakura','northwest'],['statue','northeast'],['fountain','southwest'],['magic_lantern','southeast']])
        prepare({type:'buyDecor',decor,slot,replaceId:null})
      prepare({type:'restoreBridge'})
      openBeds(state,prepare,[18,19,20,21,22,23])
    } else {
      for (const plot of [12,13]) prepare({type:'compost',plot,expectedId:state.plots[plot].plant.id})
    }
    if (scenario.rare) state.variants.push({species:'radish',...rare,count:Math.ceil(duration/6)*indices.length+indices.length})
    if (scenario.helper) {
      for (let target=1;target<=scenario.helper;target++) prepare({type:'upgradeHelper',target})
      prepare({type:'setAutomation',settings:{...state.automation,replant:!!scenario.replant,
        ...(living ? {cleanup:!!scenario.cleanup}: {})}})
      if (scenario.replant) state.seeds.radish=Math.ceil(duration/6)*indices.length
    }
    for (const [i,plot] of indices.entries()) {
      const species=scenario.planting[i]
      prepare({type:'plant',plot,species,stock:scenario.rare ? rare : undefined})
      if (scenario.replant) prepare({type:'plotPolicy',plot,policy:{...defaultPolicy,mode:'commercial',replant:{species,profile:common}}})
    }
    if (scenario.cross) {
      prepare({type:'upgradeGreenhouse',target:2})
      for (const plot of [12,13]) {
        prepare({type:'plant',plot,species:'radish'})
        prepare({type:'store',plot,expectedId:state.plots[plot].plant.id})
      }
    }
    return indices
  }

  function benchmark(scenario,seed,duration) {
    const m=measure(seed)
    const {state,run,tick,quote,harvest,clean}=m
    const indices=setup(m,scenario,duration)
    const stock=scenario.rare ? rare : common
    const boughtStock=stockCount(state,'radish',stock)
    const species=[...new Set(scenario.planting)]
    for (let second=1;second<=duration;second++) {
      tick()
      for (const plot of indices) {
        if (!scenario.helper && state.plots[plot].plant?.readySince!==null && state.plots[plot].plant) harvest(plot,false)
        if (!scenario.helper || !scenario.cleanup) clean(plot)
      }
      if (scenario.seed) {
        for (const batch of [...state.basket]) run({type:'extractSeeds',id:batch.id,count:batch.count},{required:false})
        if (state.seeds.radish>indices.length*2) run({type:'sellSeeds',species:'radish',profile:common,
          count:state.seeds.radish-indices.length*2},{required:false})
      } else {
        if (scenario.orders) for (const order of [...state.orders]) {
          if (orderQuote(state,order).complete) run({type:'fulfillOrder',id:order.id})
        }
        for (const batch of [...state.basket]) {
          if (scenario.orders && second%90!==0) continue
          if (scenario.hold && marketQuote(state,batch.species,'fruit').pricePercent<100 &&
            game.basketCount(state)<game.basketCapacity(state)*0.85) continue
          if (quickSaleEligible(state,batch)) run({type:'sellHarvest',id:batch.id,count:batch.count})
        }
      }
      if (!scenario.replant) for (const [i,plot] of indices.entries()) {
        if (!state.plots[plot].plant) {
          const species=scenario.planting[i]
          run({type:'plant',plot,species,stock:scenario.rare ? rare : scenario.seed && state.seeds[species] ? common : undefined},{required:false})
        }
      }
      if (scenario.cross) {
        for (const experiment of state.crosses.filter(entry=>!entry.collected && entry.readyAt<=state.playTime))
          run({type:'collectCross',id:experiment.id})
        if (!state.crosses.some(entry=>!entry.collected)) run({type:'startCross',parents:state.nursery.map(p=>p.id)},{required:false})
      }
      quote(species,scenario.seed ? 'seed' : 'fruit')
    }
    const used= Math.max(0,boughtStock-stockCount(state,'radish',stock))
    const replenishmentCost=scenario.replant ? used*speciesInfo.radish.seedPrice : scenario.rare ? null : 0
    return m.result({setupCredit:scenario.fresh ? 0 : 50_000,presetSeedsUsed:used,replenishmentCost,
      inventoryFruit:game.basketCount(state),requirements:scenario.rare ? 'Prepared rare seed supply. Breeding replacement cost is unpriced.' : null})
  }

  function route(seed) {
    const m=measure(seed)
    const {state,run,tick,harvest,clean,quote,report}=m
    function stock(species) {
      return state.seeds[species] ? common : state.variants.find(pack=>pack.species===species)
    }
    tick(6)
    harvest(12)
    const first=state.basket[0]
    run({type:'extractSeeds',id:first.id,count:1})
    clean(12)
    run({type:'plant',plot:12,species:'radish',stock:common})
    run({type:'sell'})
    const onboarding={second:state.playTime,coins:state.coins}

    function earn(target) {
      for (let turn=0;state.coins<target && turn<6000;turn++) {
        tick(6)
        quote(['radish'])
        for (const plot of [12,13]) {
          if (state.plots[plot].plant?.readySince!=null) harvest(plot)
          clean(plot)
          if (!state.plots[plot].plant) run({type:'plant',plot,species:'radish'},{required:false})
        }
        if (state.basket.some(batch=>quickSaleEligible(state,batch))) run({type:'sell'})
      }
      if (state.coins<target) throw Error('The route could not fund expansion')
    }
    function pay(command,cost) {
      earn(cost)
      run(command)
    }
    function open(plot) {
      if (!state.plots[plot].open) pay({type:'clear',plot},game.expansionCost(state,plot))
    }
    function plant(plot,species) {
      open(plot)
      const profile=stock(species)
      pay({type:'plant',plot,species,stock:profile},profile ? 0 : speciesInfo[species].seedPrice)
    }
    function discover(plot,result) {
      for (let i=0;i<24 && !stock(result);i++) {
        const ripe=secondsLeft(state,plot)
        if (ripe) tick(ripe)
        const active=pollinationFor(state,plot)
        if (!active) throw Error('No eligible pollen in route: '+result)
        const species=state.plots[plot].plant.species
        harvest(plot)
        const batch=state.basket.find(b=>b.pollination?.result===active.result && extractionYield(b).attempts>0)
        if (batch) run({type:'extractSeeds',id:batch.id,count:batch.count})
        if (!state.plots[plot].plant?.lives) {
          clean(plot)
          plant(plot,species)
        }
      }
      if (!stock(result)) throw Error('Expected to obtain '+result)
    }
    plant(8,'strawberry');plant(9,'sunflower')
    if (living) {plant(5,'blueberry');open(4)}
    discover(8,'solar_strawberry')
    plant(14,'solar_strawberry')
    if (!living) plant(5,'blueberry')
    plant(4,'moonflower');plant(10,'clover')
    discover(8,'moonberry');discover(5,'golden_flower');discover(10,'honey_clover')
    plant(6,'moonberry');plant(7,'golden_flower');plant(11,'honey_clover')
    if (living) pay({type:'upgradeGreenhouse',target:2},evolution.greenhouseCosts[1])
    pay({type:'upgrade',plot:6},balance.bedLevels[1].upgradeCost)
    discover(6,'crystal_flower');plant(15,'crystal_flower')
    pay({type:'upgrade',plot:15},balance.bedLevels[1].upgradeCost)
    pay({type:'upgrade',plot:15},balance.bedLevels[2].upgradeCost)
    if (living) {
      open(0);open(1)
      pay({type:'upgradeGreenhouse',target:3},evolution.greenhouseCosts[2])
    }
    discover(15,'star_orchid');plant(0,'star_orchid')
    for (const plot of [1,2,3]) open(plot)
    for (const [decor,slot] of [['sakura','northwest'],['statue','northeast'],['fountain','southwest'],['magic_lantern','southeast']]) {
      if (harmony(state,'green')>=evolution.bridge.harmony) break
      pay({type:'buyDecor',decor,slot,replaceId:null},balance.decor.find(item=>item.id===decor).cost)
    }
    pay({type:'restoreBridge'},evolution.bridge.cost)
    run({type:'travel',island:'valley'})
    pay({type:'plant',plot:16,species:'radish'},speciesInfo.radish.seedPrice)
    tick(6);harvest(16)
    return m.result({onboarding,setupCredit:0,valleyCrop:true,wipedOut:false,routeCapital:report.capital})
  }

  function passive(seed,hours,mode,online=false) {
    const m=measure(seed)
    const {state,run,tick}=m
    state.coins=50_000
    state.revealed=['solar_strawberry']
    const target=hours===2 ? 2 : hours===4 ? 3 : 5
    for (let level=2;level<=target;level++) run({type:'upgradeGreenhouse',target:level},{preparation:true})
    const startingSeeds=1000
    state.seeds.radish=startingSeeds
    for (const slot of state.passive.beds.keys()) run({type:'assignProduction',slot,assignment:{species:'radish',profile:common,mode}})
    const start=1_000_000
    state.passive.checkpoint=start
    const before=state.coins
    const duration=hours*3600
    const returnReport=online ? (tick(duration),null) : offline.catchUp(state,start+duration*1000)
    const count=production.productionCount(state)
    const seedChange=state.seeds.radish-startingSeeds
    const seedsInStorage=production.seedProductionCount(state)
    const budget=state.coins-before
    const quoteValue=state.passive.basket.reduce((sum,batch)=>sum+batch.valueUnits*batch.count/10_000,0)
    const consumed=returnReport?.spent??Math.max(0,-seedChange)
    const replenishmentCost=consumed*speciesInfo.radish.seedPrice
    const netEquivalent=quoteValue+budget+seedsInStorage*speciesInfo.radish.seedPrice-replenishmentCost
    return m.result({setupCredit:50_000,hours,mode,online,returnReport,fruitInStorage:count,seedsInStorage,seedChange,consumed,
      replenishmentCost,wholesale:budget,netEquivalent,greenhousePaybackSessions:netEquivalent>0 ? m.report.capital/netEquivalent : null,
      stops:state.passive.beds.map((_,slot)=>production.productionStatus(state,slot).reason)})
  }

  function tierLine(seed,species,duration) {
    const m=measure(seed)
    const {state,run,tick,quote,harvest,clean}=m
    const slots=[8,9]
    const hybrid=speciesInfo[species].generation>0
    state.coins=50_000
    const prepare=command=>run(command,{preparation:true})
    if (hybrid) {
      state.revealed=[species]
      state.seeds[species]=slots.length
    }
    for (const plot of slots) prepare({type:'plant',plot,species})
    for (let second=1;second<=duration;second++) {
      tick()
      for (const plot of slots) {
        if (state.plots[plot].plant?.readySince!=null) harvest(plot)
        clean(plot)
      }
      for (const batch of [...state.basket]) {
        const yieldHere=extractionYield(batch).seeds
        if (hybrid && state.seeds[species]<slots.length && yieldHere>0) {
          // Keep the minimum seed supply required for the next two specimens.
          const count=Array.from({length:batch.count},(_,i)=>i+1).find(n=>extractionYield(batch,n).seeds>=slots.length-state.seeds[species])
          run({type:'extractSeeds',id:batch.id,count:count??batch.count})
        }
        if (state.basket.includes(batch) && quickSaleEligible(state,batch)) run({type:'sellHarvest',id:batch.id,count:batch.count})
      }
      for (const plot of slots) {
        if (!state.plots[plot].plant) run({type:'plant',plot,species},{required:false})
      }
      quote([species])
    }
    return m.result({setupCredit:50_000,species,inventorySeeds:state.seeds[species],preparedHybridSeeds:hybrid ? slots.length : 0})
  }

  function recover(seed) {
    const m=measure(seed)
    const {state,run,tick,harvest,clean}=m
    tick(6)
    for (const plot of [12,13]) {harvest(plot);clean(plot)}
    run({type:'sell'})
    // A controlled depleted snapshot isolates the free recovery command.
    state.coins=0
    if (!canRecoverGarden(state)) throw Error('Expected a depleted garden to be recoverable')
    run({type:'emergencyRadish',plot:12})
    tick(6);harvest(12);clean(12)
    run({type:'sell'})
    run({type:'plant',plot:12,species:'radish'})
    return m.result({recovered:true,depletedSnapshot:true})
  }

  function genomes(seed) {
    const stream={rng:seed}
    const cases=[
      ['ordinary',common],
      ['fruitful',rare],
      ...(living ? [['unfruitful',{...common,minus:'unfruitful'}]] : [])
    ]
    const outcome=cases.map(([name,profile])=>{
      const stats=plantStats('strawberry',profile)
      const counts={}
      for (let sample=0;sample<100_000;sample++) {
        const value=nextRandom(stream)
        const fruit=living ? fruitCount(stats,value) : quantity(stats.fruits,stats.fruitYieldModifier,value)
        counts[fruit]=(counts[fruit]??0)+1
      }
      return {name,counts,failurePercent:(counts[0]??0)/1000}
    })
    if (living) {
      let inherited=0,incompatible=0
      for (let sample=0;sample<100_000;sample++) {
        const result=inherit(rare,{...common,minus:'unfruitful'},()=>nextRandom(stream),'strawberry')
        inherited+=Number(result.minus==='unfruitful')
        incompatible+=Number(!compatible(result))
      }
      return {seed,samples:100_000,outcome,inherited,incompatible}
    }
    return {seed,samples:100_000,outcome}
  }

  const results=durations.flatMap(duration=>scenarios.map(scenario=>({scenario:scenario.id,duration,
    runs:seeds.map(seed=>benchmark(scenario,seed,duration))})))
  const passiveRuns=living ? [[2,'fruit'],[4,'fruit'],[8,'fruit'],[4,'seed'],[8,'wholesale'],[2,'fruit',true]].map(([hours,mode,online])=>
    ({hours,mode,online:!!online,runs:seeds.map(seed=>passive(seed,hours,mode,online))})) : []
  const tierLines=['strawberry','moonberry','crystal_flower','star_orchid'].map(species=>({
    species,runs:seeds.map(seed=>tierLine(seed,species,Math.min(durations.at(-1),3600))) }))
  console.log(JSON.stringify({version:living?'0.8.0':'0.7.0',seeds,durations,results,
    playthrough:seeds.map(route),passive:passiveRuns,tierLines,recovery:seeds.map(recover),genetics:seeds.map(genomes)},null,2))
} finally {
  await loader.close()
}
