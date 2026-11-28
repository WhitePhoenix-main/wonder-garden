import { resolve } from 'node:path'
import { createServer } from 'vite'

const root=resolve(process.argv[2]??'.')
const rates=(process.argv[3]??'5,10,15,20,30').split(',').map(Number)
const horizons=[5,15,30,60,90,120,240].map(n=>n*60)
const seeds=(process.argv[4]??'17,42,2026').split(',').map(Number)
if (rates.some(rate=>!Number.isFinite(rate) || rate<=0 || rate>60)) throw Error('Pass interaction rates from 1 to 60 per minute')
if (seeds.some(seed=>!Number.isSafeInteger(seed) || seed<0 || seed>0xffffffff)) throw Error('Pass unsigned 32-bit RNG seeds')
const loader=await createServer({root,server:{middlewareMode:true,watch:null,hmr:false,ws:false},
  optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'})

try {
  const {advance,execute,initialState}=await loader.ssrLoadModule('/src/game/index.ts')
  const {balance,evolution,plotCount,speciesInfo,adjacent,breedingTier}=await loader.ssrLoadModule('/src/game/config.ts')
  const {common}=await loader.ssrLoadModule('/src/game/genetics.ts')
  const queries=await loader.ssrLoadModule('/src/game/queries.ts')
  const {quickSaleEligible,extractionYield,readyFruitSalePlan}=await loader.ssrLoadModule('/src/game/trade.ts')
  const {availableStock,defaultPolicy,isValuablePlant}=await loader.ssrLoadModule('/src/game/stock-policy.ts')
  const {orderQuote}=await loader.ssrLoadModule('/src/game/orders.ts')
  const {harmony}=await loader.ssrLoadModule('/src/game/decor.ts')
  const {catchUp}=await loader.ssrLoadModule('/src/game/offline.ts')
  const {unlockProduction,productionCount,seedProductionCount}=await loader.ssrLoadModule('/src/game/nursery.ts')
  const alpha10=typeof queries.gardenBatchTargets==='function' && !!readyFruitSalePlan
  const capital=new Set(['clear','upgrade','upgradeGreenhouse','upgradeHelper','upgradeStall','buyAutoSell','restoreBridge','buyDecor'])

  function session(seed,rate) {
    const state=initialState(seed)
    const interval=60/rate
    let next=0, panel=null
    const counts={interactions:0,commands:0,automatic:0,groups:0,panels:0,waitSeconds:0,decisionSeconds:0,
      harvests:0,clearings:0,plantings:0,sales:0,extractions:0,failures:0,experiments:0,earned:0,spent:0,infrastructure:0}
    const checkpoints=[], tierReached={}, hybrids={}
    let bridge=null, completeSpecies=null
    const status=()=>{
      const species=state.planted.length, plots=state.plots.slice(0,plotCount).filter(p=>p.open).length
      const tier=[['solar_strawberry',2],['crystal_flower',3],['star_orchid',4]]
        .reduce((max,[result,rank])=>queries.tierProgress(state,result).unlocked ? rank : max,1)
      return {seconds:state.playTime,coins:state.coins,species,plots,tier,greenhouse:state.greenhouseLevel,helper:state.helperLevel,
        rare:state.variants.filter(pack=>['rare','epic','legendary'].includes(pack.rarity)).reduce((n,pack)=>n+pack.count,0),
        ...counts,net:counts.earned-counts.spent}
    }
    function observe(events,automatic=false) {
      for (const event of events) {
        if (event==='Harvested') counts.harvests++
        if (event==='PlantCleaned') counts.clearings++
        if (event==='Planted') counts.plantings++
        if (event==='Sold') counts.sales++
        if (event==='SeedsExtracted') counts.extractions++
        if (event==='ExperimentFailed') counts.failures++
        if (event==='CrossStarted') counts.experiments++
        if (automatic && /^(HelperHarvested:|HelperCleaned:|AutoPlanted:|Sold$|SeedsExtracted$)/.test(event)) counts.automatic++
        if (event.startsWith('RecipeRevealed:')) hybrids[event.split(':')[1]]??=state.playTime
      }
    }
    function track() {
      if (state.planted.length===12) completeSpecies??=state.playTime
      for (const [result,tier] of [['solar_strawberry',2],['crystal_flower',3],['star_orchid',4]])
        if (queries.tierProgress(state,result).unlocked) tierReached[tier]??=state.playTime
      if (state.plots.length>plotCount) bridge??=state.playTime
    }
    function tick(seconds,kind='wait') {
      const target=Math.min(horizons.at(-1),state.playTime+Math.max(0,seconds))
      while (state.playTime<target-1e-7) {
        const boundary=horizons[checkpoints.length]??target
        const dt=Math.min(target,boundary)-state.playTime
        const money=state.coins
        observe(advance(state,dt),true)
        counts.earned+=Math.max(0,state.coins-money)
        counts[kind==='decision'?'decisionSeconds':'waitSeconds']+=dt
        if (state.playTime>=boundary-1e-7 && checkpoints.length<horizons.length)
          checkpoints.push(status())
      }
    }
    function interact(kind) {
      tick(next-state.playTime,'decision')
      if (state.playTime>=horizons.at(-1)) return false
      next=state.playTime+interval
      counts.interactions++
      if (kind==='panel') counts.panels++
      if (kind==='group') counts.groups++
      return true
    }
    function perform(command) {
      const before=state.coins
      const result=execute(state,command)
      const delta=state.coins-before
      counts.commands++
      if (delta>0) counts.earned+=delta
      if (delta<0) {
        counts.spent-=delta
        if (capital.has(command.type)) counts.infrastructure-=delta
      }
      if (result.ok) {
        observe(result.events)
        if (command.type==='gatherReady') counts.commands+=result.events.filter(event=>event==='Harvested').length
        if (command.type==='clearWithered') counts.commands+=result.events.filter(event=>event==='PlantCleaned').length
        track()
      }
      return result.ok
    }
    function action(command,{window=null,group=false,required=true}={}) {
      if (window!==panel && window && !interact('panel')) return false
      panel=window
      if (!interact(group?'group':'action')) return false
      const ok=perform(command)
      if (!ok && required) throw Error(JSON.stringify({seed,rate,command,second:state.playTime,coins:state.coins}))
      return ok
    }
    function harvest(plot) {
      const p=state.plots[plot].plant
      return Boolean(p) && action({type:'harvest',plot,expectedId:p.id,cycle:p.lives},{required:false})
    }
    function eligible(plot) {
      const bed=state.plots[plot]
      return bed?.plant?.readySince!=null && bed.policy?.mode!=='support' &&
        !isValuablePlant(state,bed.plant)
    }
    function gather(indices) {
      const ready=indices.filter(eligible)
      if (!ready.length) return false
      if (alpha10 && ready.length>1) return action({type:'gatherReady',island:'green'},{group:true,required:false})
      // Alpha 09 supports one swipe through connected, ready plots.
      if (ready.length>1) {
        const component=new Set([ready[0]])
        for (const plot of component) for (const neighbor of adjacent(plot))
          if (ready.includes(neighbor)) component.add(neighbor)
        if (component.size>1 && interact('group')) {
          panel=null
          for (const plot of component) {
            const p=state.plots[plot].plant
            perform({type:'harvest',plot,expectedId:p.id,cycle:p.lives})
          }
          return true
        }
      }
      return harvest(ready[0])
    }
    function clearDry(indices) {
      const dead=indices.filter(plot=>state.plots[plot].plant?.lives===0 && !isValuablePlant(state,state.plots[plot].plant))
      if (!dead.length) return false
      if (alpha10 && dead.length>1) return action({type:'clearWithered',island:'green'},{group:true,required:false})
      return action({type:'cleanup',plot:dead[0],expectedId:state.plots[dead[0]].plant.id})
    }
    function sell() {
      const ready=alpha10 ? readyFruitSalePlan(state).length : state.basket.some(b=>quickSaleEligible(state,b))
      return ready && action({type:alpha10?'sellReadyFruit':'sell'},{window:alpha10?null:'market',group:true,required:false})
    }
    function output(extra={}) {
      return {...status(),...extra,seed,rate,tierReached,hybrids,completeSpecies,bridge,checkpoints,
        interactionsPerMinute:state.playTime>0 ? counts.interactions*60/state.playTime : 0}
    }
    return {state,action,tick,harvest,gather,sell,clearDry,output}
  }

  function playthrough(seed,rate,style='balanced') {
    const m=session(seed,rate)
    const {state,action,tick,harvest,gather,sell,clearDry}=m
    const cropPlots=new Map([[12,'radish'],[13,'radish']])
    const earlyError=style==='novice'
    let lastSeed=null
    let naturalProduction=null
    function stock(species) {
      return availableStock(state,species,common)>0 ? common : state.variants.find(pack=>
        pack.species===species && availableStock(state,species,pack)>0)
    }
    function grow(plot,species,profile=stock(species)) {
      if (!profile && (speciesInfo[species].seedPrice===null || state.coins<speciesInfo[species].seedPrice)) return false
      const key=profile ? JSON.stringify([species,profile.rarity,profile.plus,profile.minus]) : null
      const repeat=alpha10 && key && lastSeed===key
      const planted=action({type:repeat?'repeatPlant':'plant',plot,species,stock:profile},
        {window:repeat ? null : 'seeds:'+species,required:false})
      lastSeed=planted ? key : null
      return planted
    }
    function spend(command,value) {
      if (!finance(value+10)) throw Error('route budget exhausted')
      return action(command,{window:command.type==='clear'?'bed':'development'})
    }
    function open(plot) {
      if (!state.plots[plot].open) spend({type:'clear',plot},queries.expansionCost(state,plot))
    }
    function parent(plot,species) {
      open(plot)
      action({type:'plotTemplate',plots:[plot],mode:'support'},{window:'bed'})
      if (!stock(species) && !finance((speciesInfo[species].seedPrice??Infinity)+10)) throw Error('parent unavailable: '+species)
      if (!grow(plot,species)) throw Error('parent planting failed: '+species)
    }
    function earnTurn() {
      const indices=[...cropPlots.keys()]
      if (state.basket.length>=(style==='merchant'?1:3) && style!=='novice') {
        const order=state.orders.find(order=>{
          const quote=orderQuote(state,order)
          return quote.complete && quote.bonus>=0
        })
        if (order && action({type:'fulfillOrder',id:order.id},{window:'orders',required:false})) return true
      }
      if (state.basket.length && (queries.basketCount(state)>=10 || !indices.some(i=>state.plots[i].plant?.readySince!=null)) && sell())
        return true
      if (queries.basketCount(state)>=queries.basketCapacity(state)*.75) {
        const seedBatch=state.basket.find(batch=>batch.pollination && extractionYield(batch).attempts)
        if (seedBatch) return action({type:'extractSeeds',id:seedBatch.id,count:seedBatch.count},{window:'inventory',required:false})
      }
      if (!state.helperLevel && gather(indices)) return true
      if (state.helperLevel<2 && clearDry(indices)) return true
      for (const [plot,species] of cropPlots) {
        if (state.plots[plot].plant) continue
        const useStrawberry=plot===12 && state.planted.includes('strawberry') &&
          (stock('strawberry') || state.coins>=speciesInfo.strawberry.seedPrice+10)
        if (grow(plot,useStrawberry?'strawberry':species)) return true
      }
      if (sell()) return true
      if (!state.basket.length && queries.canRecoverGarden(state)) {
        const plot=indices.find(i=>!state.plots[i].plant)
        if (plot!==undefined && action({type:'emergencyRadish',plot})) return true
      }
      tick(4)
      return false
    }
    function finance(target) {
      for (let i=0;state.coins<target && state.playTime<horizons.at(-1) && i<6000;i++) earnTurn()
      return state.coins>=target
    }
    function discover(plot,result) {
      const mother=state.plots[plot].plant.species
      const max=breedingTier(result).hardPity+3
      for (let attempt=0;attempt<max && !stock(result) && state.playTime<horizons.at(-1);attempt++) {
        if (!state.plots[plot].plant?.lives) {
          const dead=state.plots[plot].plant
          if (dead) action({type:'cleanup',plot,expectedId:dead.id})
          parent(plot,mother)
        }
        const p=state.plots[plot].plant
        if (!p.pollination && queries.researchDirections(state,plot).length>1)
          action({type:'researchDirection',plot,expectedId:p.id,recipeId:result+':main'},{window:'bed',required:false})
        tick(queries.secondsLeft(state,plot))
        harvest(plot)
        const batch=state.basket.find(b=>b.species===mother && b.pollination && extractionYield(b).attempts)
        if (!batch) continue
        action({type:'extractSeeds',id:batch.id,count:batch.count},{window:'inventory'})
      }
      if (!stock(result)) throw Error('no hybrid: '+result)
    }
    function tryProduction() {
      const plot=13
      const policy=state.plots[plot].policy??defaultPolicy
      action({type:'plotTemplate',plots:[plot],mode:'support'},{window:'bed'})
      if (state.plots[plot].plant?.lives===0) action({type:'cleanup',plot,expectedId:state.plots[plot].plant.id})
      if (!state.plots[plot].plant) grow(plot,'radish')
      tick(queries.secondsLeft(state,plot))
      harvest(plot)
      action({type:'plotPolicy',plot,policy},{window:'bed'})
      const batch=state.basket.find(item=>item.species==='radish' && extractionYield(item).seeds>0)
      if (batch) action({type:'extractSeeds',id:batch.id,count:batch.count},{window:'inventory',required:false})
      const stock=availableStock(state,'radish',common)
      if (!stock) return
      action({type:'assignProduction',slot:0,assignment:{species:'radish',profile:common,mode:'fruit'}},{window:'greenhouse'})
      const start=1000, hours=style==='mobile'?.5:2
      state.passive.checkpoint=start
      const report=catchUp(state,start+hours*3_600_000)
      naturalProduction={stock,hours,report}
      if (report?.fruit) action({type:'collectProduction'},{window:'greenhouse',required:false})
    }
    function trial() {
      if (!finance(evolution.experiments[0].cost+20)) return
      const parents=[]
      for (const plot of [12,13]) {
        const policy=state.plots[plot].policy??defaultPolicy
        action({type:'plotTemplate',plots:[plot],mode:'support'},{window:'bed'})
        const existing=state.plots[plot].plant
        if (existing?.lives===0) action({type:'cleanup',plot,expectedId:existing.id})
        else if (existing) action({type:'store',plot,expectedId:existing.id},{window:'bed'})
        if (grow(plot,'radish')) {
          const plant=state.plots[plot].plant
          parents.push(plant.id)
          action({type:'store',plot,expectedId:plant.id},{window:'bed'})
        }
        action({type:'plotPolicy',plot,policy},{window:'bed'})
      }
      if (parents.length===2) action({type:'startCross',parents},{window:'greenhouse',required:false})
    }
    try {
      grow(12,'radish')
      if (earlyError) {
        grow(13,'radish')
        tick(5)
      }
      tick(6)
      harvest(12)
      clearDry([12])
      sell()
      if (!state.plots[13].plant) grow(13,'radish')
      grow(12,'radish')
      tick(6)
      harvest(13)
      const first=state.basket.find(batch=>batch.species==='radish')
      if (first) action({type:'extractSeeds',id:first.id,count:1},{window:'inventory'})
      parent(8,'strawberry')
      parent(9,'sunflower')
      if (earlyError) {
        action({type:'move',from:9,to:13},{window:'bed',required:false})
        tick(18)
        action({type:'move',from:13,to:9},{window:'bed',required:false})
      }
      if (style==='optimizer') spend({type:'upgradeHelper',target:1},balance.helperLevels[1].upgradeCost)
      parent(5,'blueberry')
      open(4)
      discover(8,'solar_strawberry')
      parent(14,'solar_strawberry')
      if (style!=='manual' && !state.helperLevel) spend({type:'upgradeHelper',target:1},balance.helperLevels[1].upgradeCost)
      parent(4,'moonflower')
      parent(10,'clover')
      discover(8,'moonberry')
      discover(5,'golden_flower')
      discover(10,'honey_clover')
      parent(6,'moonberry')
      parent(7,'golden_flower')
      parent(11,'honey_clover')
      if (style!=='manual') {
        spend({type:'upgradeHelper',target:2},balance.helperLevels[2].upgradeCost)
        spend({type:'buyAutoSell'},balance.autoSell.cost)
      }
      for (const [plot,species] of [[1,'blueberry'],[2,'strawberry'],[3,'clover']]) {
        open(plot)
        cropPlots.set(plot,species)
      }
      spend({type:'upgradeGreenhouse',target:2},evolution.greenhouseCosts[1])
      if (style==='mobile' || style==='visitor') tryProduction()
      if (style==='breeder') trial()
      spend({type:'upgrade',plot:6},balance.bedLevels[1].upgradeCost)
      discover(6,'crystal_flower')
      parent(15,'crystal_flower')
      for (const target of [1,2]) spend({type:'upgrade',plot:15},balance.bedLevels[target].upgradeCost)
      open(0)
      spend({type:'upgradeGreenhouse',target:3},evolution.greenhouseCosts[2])
      discover(15,'star_orchid')
      parent(0,'star_orchid')
      const paid=state.crosses.find(cross=>!cross.collected && cross.readyAt<=state.playTime+state.passive.labSeconds)
      if (paid) action({type:'collectCross',id:paid.id},{window:'greenhouse',required:false})
      for (const [decor,slot] of [['sakura','northwest'],['statue','northeast'],['fountain','southwest'],['magic_lantern','southeast']]) {
        if (harmony(state,'green')>=evolution.bridge.harmony) break
        spend({type:'buyDecor',decor,slot,replaceId:null},balance.decor.find(row=>row.id===decor).cost)
      }
      spend({type:'restoreBridge'},evolution.bridge.cost)
      return m.output({style,finished:true,naturalProduction})
    } catch (error) {
      return m.output({style,finished:false,naturalProduction,stopped:String(error.message)})
    }
  }

  function nursery(seed,level,stock,hours,species,mode,rarity) {
    const state=initialState(seed)
    state.sold=true
    state.greenhouseLevel=level
    state.coins=0
    state.planted=['radish',...species==='radish'?[]:[species]]
    unlockProduction(state)
    const profile=rarity==='common' ? common : {rarity,plus:['fruitful'],minus:null}
    if (rarity==='common') state.seeds[species]=stock
    else state.variants.push({species,...profile,count:stock})
    for (const slot of state.passive.beds.keys()) {
      const result=execute(state,{type:'assignProduction',slot,assignment:{species,profile,mode}})
      if (!result.ok) throw Error(JSON.stringify({result,species,rarity,level,mode}))
    }
    state.passive.checkpoint=1_000
    const report=catchUp(state,1_000+hours*3_600_000)
    const fruit=productionCount(state)
    const producedSeeds=seedProductionCount(state)
    const inputCost=rarity==='common' ? (report?.spent??0)*speciesInfo[species].seedPrice : null
    const net=inputCost===null ? null : state.coins-inputCost+
      state.passive.basket.reduce((n,batch)=>n+batch.valueUnits*batch.count/10_000,0)+producedSeeds*speciesInfo[species].seedPrice
    return {seed,level,stock,hours,species,mode,rarity,fruit,producedSeeds,inputCost,net,coins:state.coins,report,
      sessionsToRepay:net>0 ? evolution.greenhouseCosts.slice(0,level).reduce((sum,cost)=>sum+cost,0)/net : null}
  }

  const styles=['balanced','novice','manual','optimizer','merchant','breeder','visitor','mobile']
  const routes=rates.flatMap(rate=>seeds.flatMap(seed=>styles.map(style=>playthrough(seed,rate,style))))
  const passive=[0.25,0.5,1,2,4,8,24].flatMap(hours=>[5,10,25,50,100,250].flatMap(stock=>
    [[2,'radish','fruit','common'],[3,'strawberry','seed','common'],[4,'strawberry','wholesale','common'],
      [5,'blueberry','fruit','rare']].flatMap(args=>seeds.map(seed=>nursery(seed,args[0],stock,hours,...args.slice(1))))))
  console.log(JSON.stringify({version:alpha10?'0.10.0':'0.9.0',rates,seeds,horizons,routes,passive},null,2))
} finally {
  await loader.close()
}
