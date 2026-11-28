import { createServer } from 'vite'

const samples = Number(process.argv[2] ?? 120)
if (!Number.isSafeInteger(samples) || samples < 1) throw new Error('Expected a positive sample count')

const seeds = [17, 42, 2026]
const server = await createServer({ server:{ middlewareMode:true, watch:null }, appType:'custom' })
try {
  const { initialState, advance, execute, cycleSeconds, basketCount } = await server.ssrLoadModule('/src/game/index.ts')
  const { balance, bedLevels, evolution, helperLevels, island, speciesIds, speciesInfo, valleyPlotCount } =
    await server.ssrLoadModule('/src/game/config.ts')
  const { hybridIds } = await server.ssrLoadModule('/src/game/model.ts')
  const { common, changeStock, stockCount, plantStats } = await server.ssrLoadModule('/src/game/genetics.ts')
  const { defaultPolicy, availableStock } = await server.ssrLoadModule('/src/game/stock-policy.ts')
  const { extractionYield, harvestSaleValue, seedSaleValue } = await server.ssrLoadModule('/src/game/trade.ts')
  const { orderQuote } = await server.ssrLoadModule('/src/game/orders.ts')

  function commit(state, command) {
    const result = execute(state, command)
    if (!result.ok) throw new Error(JSON.stringify({ command, reason:result.reason, seed:state.rng }))
    return result
  }

  function harvest(state, plot) {
    const plant = state.plots[plot].plant
    return commit(state, { type:'harvest', plot, expectedId:plant.id, cycle:plant.lives })
  }

  function store(state, plot) {
    const plant = state.plots[plot].plant
    commit(state, { type:'store', plot, expectedId:plant.id })
    return plant.id
  }

  function sandbox(seed, allOpen = false) {
    const state = initialState(seed)
    state.planted = [...speciesIds]
    state.revealed = [...hybridIds]
    state.sold = true
    state.coins = 50_000
    for (const plot of state.plots) {
      plot.plant = null
      if (allOpen) plot.open = true
    }
    return state
  }

  const cultivar = (rarity, plus, minus = null) => ({ rarity, plus, minus })
  const profiles = {
    common,
    uncommon:cultivar('uncommon', ['early']),
    rare:cultivar('rare', ['quality']),
    epic:cultivar('epic', ['early', 'quality']),
    legendary:cultivar('legendary', ['early', 'quality', 'fruitful']),
    seedLine:cultivar('epic', ['seedy', 'stable']),
    slowQuality:cultivar('rare', ['quality'], 'slow')
  }

  // Ready-to-plant trials isolate crops from neighbours, helper delays and growing a seed reserve.
  function lifetime(species, profile, level = 1) {
    const elapsed = { seconds:0, fruit:0, seeds:0, gross:0, copy:0 }
    const trials = samples * seeds.length
    for (const seed of seeds) {
      const state = sandbox(seed)
      const plot = island.startOpen[0]
      state.plots[plot].level = level
      changeStock(state,species,profile,1)
      for (let cycle = 0; cycle < samples; cycle++) {
        changeStock(state,species,profile,1)
        commit(state,{type:'plant',plot,species,stock:profile})
        while (state.plots[plot].plant) {
          const duration = cycleSeconds(state,plot)
          advance(state,duration)
          elapsed.seconds += duration
          harvest(state,plot)
        }
        const lot = state.basket[0]
        const yieldQuote = extractionYield(lot)
        elapsed.fruit += lot.count
        elapsed.seeds += yieldQuote.seeds
        elapsed.copy += lot.lots.filter(part=>part.copyPending).reduce((n,part)=>n+part.copyChance,0)
        elapsed.gross += harvestSaleValue(lot)
        commit(state,{type:'sellHarvest',id:lot.id,count:lot.count})
      }
    }
    const valuation = profile === common ? speciesInfo[species].seedPrice ?? seedSaleValue(species,profile) : seedSaleValue(species,profile)
    return {
      lifeSeconds:elapsed.seconds/trials, fruitPerLife:elapsed.fruit/trials, seedsPerLife:elapsed.seeds/trials,
      expectedCopiesPerLife:elapsed.copy/trials, grossPerMinute:60*elapsed.gross/elapsed.seconds,
      netPerMinute:60*(elapsed.gross-trials*valuation)/elapsed.seconds
    }
  }

  function earn(state, target) {
    for (let attempts = 0; state.coins < target; attempts++) {
      if (attempts > 10_000) throw new Error('Financing stalled')
      for (const plot of [12,13]) if (!state.plots[plot].plant) commit(state,{type:'plant',plot,species:'radish'})
      advance(state,speciesInfo.radish.cycleSec)
      for (const plot of [12,13]) harvest(state,plot)
      commit(state,{type:'sell'})
    }
  }

  function selection(seed) {
    const state = initialState(seed)
    advance(state,speciesInfo.radish.cycleSec)
    harvest(state,12)
    commit(state,{type:'extractSeeds',id:state.basket[0].id,count:1})
    commit(state,{type:'plant',plot:12,species:'radish',stock:common})
    const workingCapital=2*speciesInfo.radish.seedPrice
    earn(state,speciesInfo.strawberry.seedPrice+speciesInfo.sunflower.seedPrice+workingCapital)
    commit(state,{type:'plant',plot:8,species:'strawberry'})
    commit(state,{type:'plant',plot:9,species:'sunflower'})
    advance(state,cycleSeconds(state,8))
    harvest(state,8)
    const pollinated = state.basket.find(b=>b.pollination?.result==='solar_strawberry')
    commit(state,{type:'extractSeeds',id:pollinated.id,count:pollinated.count})
    const firstHybridAt = state.playTime
    const offer = evolution.experiments[0]
    earn(state,evolution.greenhouseCosts[1]+workingCapital*2)
    commit(state,{type:'upgradeGreenhouse',target:2})
    for (const plot of [12,13]) {
      if (!state.plots[plot].plant) commit(state,{type:'plant',plot,species:'radish'})
    }
    const baseline = [store(state,12),store(state,13)]
    store(state,8)
    store(state,9)
    const startedAt = state.playTime
    let attempts = 0
    function breed(parents, rarity) {
      for (let count = 1; count <= 1000; count++) {
        earn(state,offer.cost+workingCapital)
        commit(state,{type:'startCross',parents})
        const result = state.crosses.at(-1)
        advance(state,result.readyAt-state.playTime)
        commit(state,{type:'collectCross',id:result.id})
        attempts++
        if (result.profile.rarity !== rarity) continue
        commit(state,{type:'plant',plot:8,species:'radish',stock:result.profile})
        return { count, cumulative:attempts, spend:attempts*offer.cost, seconds:attempts*offer.seconds,
          playTime:state.playTime, id:store(state,8) }
      }
      throw new Error('Selection exceeded 1000 attempts')
    }
    const firstRare = breed(baseline,'rare')
    const secondRare = breed(baseline,'rare')
    const epic = breed([firstRare.id,secondRare.id],'epic')
    const legendary = breed([firstRare.id,epic.id],'legendary')
    return { seed, firstHybridAt, greenhouseAt:startedAt, firstRare, secondRare, epic, legendary,
      rejectedSeedResalePotential:state.variants.reduce((n,p)=>n+p.count*seedSaleValue(p.species,p),state.seeds.radish*seedSaleValue('radish',common)) }
  }

  const duration = 600
  const gardenPlots = Array.from({length:12},(_,index)=>index)
  const radishBed = mode=>({species:'radish',mode})
  const productMix = [
    ...Array.from({length:4},()=>radishBed('seed')),
    ...Array.from({length:4},()=>({species:'strawberry',mode:'commercial'})),
    ...Array.from({length:2},()=>({species:'sunflower',mode:'support'})),
    ...Array.from({length:2},()=>({species:'strawberry',mode:'breeding'}))
  ]
  const strategies = [
    ['manual',0,0,12,'manual'],
    ['seedManual',0,0,12,'seed'],
    ['commercialI',1,0,72,'commercial'],
    ['commercialII',2,0,72,'commercial'],
    ['commercialIII',3,0,72,'commercial'],
    ['commercialIV',4,0,72,'commercial'],
    ['commercialV',5,0,72,'commercial'],
    ['commercialReserve',5,8,72,'commercial'],
    ['automatedSeed',5,0,0,'seed'],
    ['automatedReserve',5,8,0,'seed'],
    ['mixedPassive',5,8,0,'mixed'],
    ['mixed',5,8,0,'mixed'],
    ['mixedOrders',5,8,0,'mixed']
  ]

  function production(seed,[label,helper,minimum,seedStock,mode],largeGarden = false) {
    const state = sandbox(seed,true)
    if (largeGarden) state.plots.push(...Array.from({length:valleyPlotCount},()=>({open:true,level:1,plant:null})))
    const activePlots = largeGarden ? state.plots.map((_,index)=>index) : gardenPlots
    const settings = mode==='mixed' ? productMix : activePlots.map(()=>radishBed(mode))
    let harvests = 0, autoHarvests = 0, replantings = 0, reward = 0, orderPremium = 0, seedYield = 0, recent = 0
    const counter = events => {
      events.forEach(event=>{
        if (event==='Harvested') harvests++
        if (event.startsWith('HelperHarvested:')) autoHarvests++
        if (event.startsWith('AutoPlanted:')) replantings++
        if (event.startsWith('OwnSeeds:')) seedYield+=Number(event.split(':')[1])
      })
    }
    for (let target = 1; target <= helper; target++) commit(state,{type:'upgradeHelper',target})
    if (helper) {
      const stall=minimum || mode==='seed' || mode==='mixed' ? 3 : 2
      for (let target=2; target<=stall; target++) commit(state,{type:'upgradeStall',target})
      commit(state,{type:'setAutomation',settings:{...state.automation,replant:true,sellSeeds:mode==='seed' || mode==='mixed'}})
      if (minimum) commit(state,{type:'setReserve',species:'radish',count:minimum})
    }
    if (largeGarden) for (let target=1;target<balance.basketLevels.length;target++) commit(state,{type:'upgradeBasket',target})
    for (const [plot,{species,mode:purpose}] of settings.entries()) {
      if (helper) commit(state,{type:'plotPolicy',plot,policy:{...defaultPolicy,mode:purpose,
        replant:purpose==='support' ? null : {species,profile:common}}})
      commit(state,{type:'plant',plot,species})
    }
    state.seeds.radish=seedStock
    if (mode==='mixed') state.seeds.strawberry=12
    const initial = state.coins
    for (let second=0; second<duration; second++) {
      if (second===duration/2) recent=harvests
      counter(advance(state,1))
      if (!helper) for (const plot of activePlots) {
        if (state.plots[plot].plant?.readySince != null) counter(harvest(state,plot).events)
        if (!state.plots[plot].plant) {
          const stock = stockCount(state,'radish',common) > 0 ? common : undefined
          commit(state,{type:'plant',plot,species:'radish',stock})
          replantings++
        }
      }
      if (label==='seedManual') {
        for (const batch of [...state.basket]) counter(commit(state,{type:'extractSeeds',id:batch.id,count:batch.count}).events)
        const surplus=availableStock(state,'radish',common)-12
        if (surplus>0) commit(state,{type:'sellSeeds',species:'radish',profile:common,count:surplus})
      } else if (!helper) commit(state,{type:'sell'})
      if ((label==='mixed' || label==='mixedOrders') && second%30===29) {
        for (const batch of [...state.basket]) {
          if (batch.lots[0]?.origin?.mode!=='breeding' && !batch.lots.some(lot=>lot.crossPending)) continue
          const quote=extractionYield(batch)
          if (quote.seeds || quote.attempts) counter(commit(state,{type:'extractSeeds',id:batch.id,count:batch.count}).events)
        }
      }
      if (label==='mixedOrders') for (const order of [...state.orders]) {
        const quote = orderQuote(state,order)
        if (!quote.complete) continue
        const value = quote.lines.flatMap(line=>line.items).reduce((n,item)=>n+(item.id===undefined ?
          seedSaleValue(item.species,item.profile)*item.count :
          harvestSaleValue(state.basket.find(b=>b.id===item.id),item.count)),0)
        commit(state,{type:'fulfillOrder',id:order.id})
        reward+=order.reward
        orderPremium+=order.reward-value
      }
    }
    return {seed, label, coinsPerMinute:(state.coins-initial)*60/duration, harvests, autoHarvests, replantings, seedYield,
      lastHalfHarvests:harvests-recent, stockedSeeds:state.seeds.radish, basket:basketCount(state),
      empty:activePlots.filter(i=>!state.plots[i].plant).length, orders:state.ordersCompleted,
      orderReward:reward, orderPremium }
  }

  const rates = Object.fromEntries(speciesIds.map(species=>[species,Object.fromEntries(
    Object.entries(profiles).map(([label,profile])=>[label,lifetime(species,profile)])
  )]))
  const timedSelection = seeds.map(selection)
  const productionRuns = strategies.flatMap(strategy=>seeds.map(seed=>production(seed,strategy)))
  const referenceBeds = Object.values(bedLevels).map(bed=>{
    const metrics=lifetime('strawberry',common,bed.level)
    return {level:bed.level,cost:bed.upgradeCost,netPerMinute:metrics.netPerMinute}
  })
  const average = (runs,key)=>runs.reduce((n,run)=>n+run[key],0)/runs.length
  const strategyAverages = Object.fromEntries(strategies.map(([label])=>{
    const runs=productionRuns.filter(run=>run.label===label)
    const keys=Object.keys(runs[0]).filter(key=>key!=='seed' && key!=='label')
    return [label,Object.fromEntries(keys.map(key=>[key,average(runs,key)]))]
  }))
  const pauses = Object.fromEntries(strategies.map(([label])=>[
    label,productionRuns.filter(run=>run.label===label && !run.lastHalfHarvests).length
  ]))
  const helperPayback = []
  for (let level=1; level<=5; level++) {
    const runs=seeds.map(seed=>production(seed,['supplyStress',level,0,2000,'commercial'],true))
    const coinsPerMinute=average(runs,'coinsPerMinute')
    const harvestsPerMinute=average(runs,'autoHarvests')*60/duration
    const gain=coinsPerMinute-(helperPayback.at(-1)?.coinsPerMinute??0)
    const gainAfterStock=level===1 ? gain-harvestsPerMinute*speciesInfo.radish.seedPrice :
      gain-(harvestsPerMinute-helperPayback.at(-1).harvestsPerMinute)*speciesInfo.radish.seedPrice
    const setup=evolution.stallCosts[1]+balance.basketLevels.reduce((sum,row)=>sum+row.upgradeCost,0)
    const cost=helperLevels[level].upgradeCost+(level===1 ? setup : 0)
    helperPayback.push({level,harvestsPerMinute,coinsPerMinute,gainAfterStock,cost,
      projectedMinutes:gainAfterStock>0 ? cost/gainAfterStock : null})
  }
  const report = {
    seeds, samplesPerSeed:samples, duration,
    cropRates:rates, timedSelection, productionRuns, strategyAverages, pauses, helperPayback,
    bedPayback:referenceBeds.map((row,i)=>{
      const gain=i ? row.netPerMinute-referenceBeds[i-1].netPerMinute : 0
      return {...row,gain,projectedMinutes:gain>0 ? row.cost/gain : null}
    }),
    exampleCopyChances:Object.fromEntries(Object.entries(profiles).map(([label,profile])=>[label,plantStats('strawberry',profile).copyChance])),
    construction:{
      greenBeds:balance.expansionCosts.reduce((a,b)=>a+b,0),bridge:evolution.bridge.cost,
      valleyBeds:evolution.valleyCosts.reduce((a,b)=>a+b,0),
      greenhouse:evolution.greenhouseCosts,stall:evolution.stallCosts
    }
  }
  console.log(JSON.stringify(report,null,2))
} finally {
  await server.close()
}
