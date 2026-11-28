import { createServer } from 'vite'
import { resolve } from 'node:path'

const durations=process.argv[2] && process.argv[2]!=='all' ? [Number(process.argv[2])] : [900,1800,3600,7200]
if (durations.some(seconds=>!Number.isInteger(seconds) || seconds<15 || seconds>7200)) {
  throw new Error('Duration must be 15–7200 active seconds')
}
const root=resolve(process.argv[3]??'.')
const loader=await createServer({
  root,server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'
})
const seeds=[17,42,2026]
const mono=Array(8).fill('radish')
const mixed=['radish','strawberry','blueberry','radish','strawberry','blueberry','radish','strawberry']
const scenarios=[
  {id:'starter',planting:mono.slice(0,2),starter:true},
  {id:'radish',planting:mono},
  {id:'sunflower',planting:Array(8).fill('sunflower')},
  {id:'mixed',planting:mixed},
  {id:'auras',planting:['clover',...mixed.slice(1)]},
  {id:'automated',planting:mono,auto:true},
  {id:'seeds',planting:mono,seed:true},
  {id:'breeding',planting:mixed,cross:true},
  {id:'target-quote',planting:mixed,hold:true},
  {id:'large-batches',planting:mono,batches:true},
  {id:'two-islands',planting:[...mixed,...mixed],valley:true},
  {id:'rare',planting:mono,rare:true},
  {id:'orders',planting:mixed,orders:true},
  {id:'clone',planting:mixed,clone:true}
]

try {
  const {advance,execute,initialState}=await loader.ssrLoadModule('/src/game/index.ts')
  const {newPlant}=await loader.ssrLoadModule('/src/game/state.ts')
  const {market,speciesInfo,evolution,plotCount,valley}=await loader.ssrLoadModule('/src/game/config.ts')
  const {common}=await loader.ssrLoadModule('/src/game/genetics.ts')
  const {marketQuote}=await loader.ssrLoadModule('/src/game/market.ts')
  const {orderQuote}=await loader.ssrLoadModule('/src/game/orders.ts')
  const {basketCapacity}=await loader.ssrLoadModule('/src/game/queries.ts')
  const {allSeedPacks,defaultPolicy}=await loader.ssrLoadModule('/src/game/stock-policy.ts')
  const {harvestSaleValue,seedSaleValue}=await loader.ssrLoadModule('/src/game/pricing.ts')
  const rare={rarity:'rare',plus:['fruitful'],minus:null}
  const alpha07='strategy' in market

  function run(scenario,seed,duration,capacityScale=1) {
    const {planting,starter,auto,cross,clone,rare:rareGarden,orders}=scenario
    const state=initialState(seed)
    const indices=starter ? state.plots.flatMap((p,i)=>p.plant ? [i] : []) :
      planting.map((_,i)=>scenario.valley && i>=8 ? plotCount+i-8 : i)
    const species=[...new Set(planting)]
    const operationCosts={plant:0,genetics:0}
    const income={sales:0,orders:0}
    let actions=0,capex=0,setupSeeds=0,production=0,collected=0
    let helperWork=0,helperTurns=0,firstHybrid=null,firstRare=null,firstEpic=null,firstLegendary=null
    let firstValley=null,allSpecies=null,priceSum=0,priceFloor=0,samples=0,experiments=0
    const initialCapacity=market.capacity.radish.fruit
    market.capacity.radish.fruit=Math.round(initialCapacity*capacityScale)

    function observe(events) {
      for (const event of events) {
        if (event.startsWith('HelperHarvested:')) helperWork++
        if (event.startsWith('Harvested:')) production+=Number(event.split(':').at(-1))
        if (event.startsWith('RecipeRevealed:')) firstHybrid??=state.playTime
      }
      if (state.planted.length===12) allSpecies??=state.playTime
      if (state.plots.length>plotCount) firstValley??=state.playTime
    }

    function command(input,setup=false) {
      const before=state.coins
      const result=execute(state,input)
      if (!result.ok) return result
      const money=state.coins-before
      if (setup) capex-=money
      else {
        actions++
        if (input.type==='fulfillOrder') income.orders+=money
        else if (money>0) income.sales+=money
        if (input.type==='plant' && money<0) operationCosts.plant-=money
        if (input.type==='startCross' || input.type==='startClone') operationCosts.genetics-=money
        if (input.type==='startCross') experiments++
        for (const pack of result.obtained??[]) {
          collected+=pack.count
          if (pack.rarity==='rare') firstRare??=state.playTime
          if (pack.rarity==='epic') firstEpic??=state.playTime
          if (pack.rarity==='legendary') firstLegendary??=state.playTime
        }
        observe(result.events)
      }
      return result
    }

    function setup(input) {
      const result=command(input,true)
      if (!result.ok) throw Error(JSON.stringify({scenario:scenario.id,input,reason:result.reason}))
    }

    if (!starter) {
      state.coins=50_000
      state.sold=true
      state.planted=Object.keys(speciesInfo).filter(s=>speciesInfo[s].seedPrice!==null)
      state.revealed=['solar_strawberry']
      state.plots.forEach(plot=>{plot.open=true;plot.plant=null})
      if (scenario.valley) {
        state.plots.push(...Array.from({length:valley.plotWidth*valley.plotHeight},()=>({open:true,level:1,plant:null})))
        capex+=evolution.bridge.cost
      }
      for (const target of [1,2,3]) setup({type:'upgradeBasket',target})
      if (auto || orders) {
        for (const target of (auto ? [1,2,3,4,5] : [1])) setup({type:'upgradeHelper',target})
        for (const target of [2,3,4]) setup({type:'upgradeStall',target})
        setup({type:'setAutomation',settings:{...state.automation,enabled:!!auto,replant:!!auto}})
        if (alpha07 && (orders || scenario.saleStrategy)) setup({type:'setTrading',settings:{
          ...state.trading,reserveOrders:!!orders,strategy:scenario.saleStrategy??'quick'
        }})
      }
      if (rareGarden) state.variants.push({species:'radish',...rare,count:indices.length*(1+Math.ceil(duration/speciesInfo.radish.cycleSec))})
      if (auto) state.seeds.radish=Math.ceil(duration/speciesInfo.radish.cycleSec)*indices.length
      for (const [i,plot] of indices.entries()) {
        const species=planting[i]
        setup({type:'plant',plot,species,stock:rareGarden ? rare : undefined})
        if (auto) setup({type:'plotPolicy',plot,policy:{...defaultPolicy,mode:'commercial',replant:{species,profile:common}}})
      }
      if (cross || clone) {
        for (const target of (clone ? [2,3]:[2])) setup({type:'upgradeGreenhouse',target})
        state.nursery.push(newPlant(state.nextId++,'radish',rare),newPlant(state.nextId++,'radish',rare))
      }
      state.orderRefreshAt=orders ? 0 : duration+1
      setupSeeds=state.seeds.radish
    }

    const initialCoins=state.coins
    for (let second=1;second<=duration;second++) {
      const before=state.coins
      const willWork=auto && state.harvestRemaining<=1
      const events=advance(state,1)
      if (willWork) helperTurns++
      observe(events)
      income.sales+=state.coins-before

      if (!auto) for (const plot of indices) {
        const plant=state.plots[plot].plant
        if (plant?.readySince!=null) command({type:'harvest',plot,expectedId:plant.id,cycle:plant.lives})
      }
      if (orders) for (const order of state.orders.slice()) {
        if (orderQuote(state,order).complete) command({type:'fulfillOrder',id:order.id})
      }
      if (scenario.seed) {
        for (const batch of state.basket.slice()) command({type:'extractSeeds',id:batch.id,count:batch.count})
        if (state.seeds.radish>16) command({type:'sellSeeds',species:'radish',profile:common,count:state.seeds.radish-16})
      } else if (!auto && !orders) {
        let fullness=state.basket.reduce((sum,b)=>sum+b.count,0)/basketCapacity(state)
        if (!scenario.batches || fullness>=0.9 || second%180===0) for (const batch of state.basket.slice()) {
          if (scenario.hold && marketQuote(state,batch.species,'fruit').pricePercent<100 && fullness<0.9) continue
          const result=command({type:'sellHarvest',id:batch.id,count:batch.count})
          if (result.ok) fullness-=batch.count/basketCapacity(state)
        }
      }
      if (!auto) for (const [i,plot] of indices.entries()) {
        if (state.plots[plot].plant) continue
        const species=planting[i]
        const stock=rareGarden ? rare : scenario.seed && state.seeds[species] ? common : undefined
        command({type:'plant',plot,species,stock})
      }
      if (cross) {
        for (const trial of state.crosses.filter(c=>!c.collected && c.readyAt<=state.playTime)) {
          command({type:'collectCross',id:trial.id})
        }
        if (!state.crosses.some(c=>!c.collected)) command({type:'startCross',parents:state.nursery.map(p=>p.id)})
      }
      if (clone && alpha07) {
        for (const trial of state.clones.filter(c=>c.readyAt<=state.playTime)) command({type:'collectClone',id:trial.id})
        if (!state.clones.length) command({type:'startClone',id:state.nursery[0].id})
      }
      for (const id of species) {
        const quote=marketQuote(state,id,scenario.seed?'seed':'fruit').pricePercent
        priceSum+=quote
        priceFloor+=Number(quote===market.minimumPricePercent)
        samples++
      }
    }
    const marketAfterProduction=structuredClone(state.market)
    let recovery=0
    if (scenario.id==='automated') {
      while (recovery<14_400 && (state.market.goods.radish.fruit.delivered || state.market.goods.radish.fruit.saturated)) {
        state.helperLevel=0
        state.autoSell=false
        advance(state,market.tickSeconds)
        recovery+=market.tickSeconds
      }
    }
    state.market=marketAfterProduction
    market.capacity.radish.fruit=initialCapacity
    const replenishment=auto ? (setupSeeds-state.seeds.radish)*speciesInfo.radish.seedPrice : 0
    const stock=allSeedPacks(state)
    return {
      seed,duration,capex,actions,production,collected,experiments,firstHybrid,firstRare,firstEpic,firstLegendary,firstValley,allSpecies,
      harvestLeft:state.basket.reduce((sum,b)=>sum+b.count,0),seedsLeft:stock.reduce((sum,p)=>sum+p.count,0),
      stockValue:state.basket.reduce((sum,b)=>sum+harvestSaleValue(b,b.count,state),0)+
        stock.reduce((sum,p)=>sum+p.count*seedSaleValue(p.species,p,state),0),
      averageQuote:priceSum/samples,floorPercent:priceFloor*100/samples,
      helperUtilization:helperTurns ? helperWork*100/(helperTurns*evolution.helperThroughput[5]) : null,recovery,
      grossPerMinute:(income.sales+income.orders)*60/duration, sales:income.sales, orderIncome:income.orders,
      operatingExpenses:operationCosts.plant+operationCosts.genetics,geneticsExpense:operationCosts.genetics,
      replenishment,cashFlow:state.coins-initialCoins,adjustedPerMinute:(state.coins-initialCoins-replenishment)*60/duration
    }
  }

  function saleProbe(mode) {
    const state=initialState(42)
    state.sold=true
    state.coins=25_000
    const totals=[]
    const batch={id:state.nextId++,species:'radish',valueUnits:40000,count:240,profile:null,pollination:null,
      lots:[{size:240,remaining:240,seedYield:0,copyChance:0,copyPending:false,crossPending:false}]}
    state.basket.push(batch)
    if (mode==='automated') {
      execute(state,{type:'upgradeHelper',target:1})
      execute(state,{type:'buyAutoSell'})
      execute(state,{type:'setAutomation',settings:{...state.automation,enabled:false}})
    }
    const before=state.coins
    const sizes=mode==='large' || mode==='automated' ? [240] : Array(4).fill(60)
    for (const count of sizes) {
      if (mode==='automated') advance(state,state.sellRemaining)
      else execute(state,{type:'sellHarvest',id:batch.id,count})
      totals.push(marketQuote(state,'radish','fruit').delivered)
      if (mode==='spaced') advance(state,market.tickSeconds)
    }
    let recovery=0
    while (recovery<3600 && (state.market.goods.radish.fruit.delivered || state.market.goods.radish.fruit.saturated)) {
      advance(state,market.tickSeconds)
      recovery+=market.tickSeconds
    }
    return {mode,proceeds:state.coins-before,deliveriesPerStep:totals,recovery}
  }

  const results=durations.flatMap(duration=>scenarios.filter(s=>alpha07 || !s.clone).map(scenario=>{
    const runs=seeds.map(seed=>run(scenario,seed,duration))
    return {scenario:scenario.id,duration,runs}
  }))
  const capacityStudy=[1,1.25,1.5].map(scale=>({scale,runs:seeds.map(seed=>run(scenarios[5],seed,durations.at(-1),scale))}))
  const strategyStudy=alpha07 ? ['quick','balanced','profit'].map(saleStrategy=>({
    saleStrategy,runs:seeds.map(seed=>run({...scenarios[5],saleStrategy},seed,durations[0]))
  })) : []
  const batchSales=['large','split','spaced','automated'].map(saleProbe)
  console.log(JSON.stringify({version:alpha07?'0.7.0':'0.6.0',seeds,results,capacityStudy,strategyStudy,batchSales},null,2))
} finally {
  await loader.close()
}
