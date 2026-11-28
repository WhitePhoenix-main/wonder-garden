import { createServer } from 'vite'

const duration=Number(process.argv[2]??900)
if (!Number.isSafeInteger(duration) || duration<300 || duration>7200) throw Error('Use 300–7200 seconds')
const seeds=[17,42,2026]
const loader=await createServer({server:{middlewareMode:true,watch:null},appType:'custom'})

try {
  const {advance,execute,initialState}=await loader.ssrLoadModule('/src/game/index.ts')
  const {market,speciesInfo}=await loader.ssrLoadModule('/src/game/config.ts')
  const {common}=await loader.ssrLoadModule('/src/game/genetics.ts')
  const {marketQuote,initialMarket}=await loader.ssrLoadModule('/src/game/market.ts')
  const {harvestSaleValue,seedSaleValue}=await loader.ssrLoadModule('/src/game/pricing.ts')
  const {defaultPolicy}=await loader.ssrLoadModule('/src/game/stock-policy.ts')
  const mono=Array(8).fill('radish')
  const mixed=['radish','strawberry','blueberry','radish','strawberry','blueberry','radish','strawberry']
  const strategies=[
    {id:'starter',planting:mono.slice(0,2)},
    {id:'monoculture',planting:mono},
    {id:'diversified',planting:mixed},
    {id:'market-aware',planting:mixed,hold:true},
    {id:'automated',planting:mono,automatic:true},
    {id:'seed-specialist',planting:mono,sellSeeds:true}
  ]

  function run(strategy,seed,dynamic) {
    const state=initialState(seed)
    const {planting,hold,automatic,sellSeeds}=strategy
    const kind=sellSeeds?'seed':'fruit'
    const species=[...new Set(planting)]
    state.sold=true
    state.coins=35000
    state.planted=['radish','strawberry','blueberry']
    state.plots.forEach(plot=>{plot.open=true;plot.plant=null})
    function command(input) {
      const result=execute(state,input)
      if (!result.ok) throw Error(`${strategy.id} seed ${seed}: ${JSON.stringify(input)}: ${result.reason}`)
      return result
    }
    for (const target of [1,2,3]) command({type:'upgradeBasket',target})
    planting.forEach((species,plot)=>command({type:'plant',plot,species}))
    if (automatic) {
      for (const target of [1,2,3,4,5]) command({type:'upgradeHelper',target})
      command({type:'buyAutoSell'})
      command({type:'setAutomation',settings:{...state.automation,replant:true}})
      state.seeds.radish=Math.ceil(duration/speciesInfo.radish.cycleSec)*planting.length
      planting.forEach((species,plot)=>command({type:'plotPolicy',plot,policy:{
        ...defaultPolicy,mode:'commercial',replant:{species,profile:common}
      }}))
    }
    const start=state.coins
    const startingSeeds=state.seeds.radish
    let harvested=0
    let samples=0, floor=0, priceSum=0, saturationSum=0
    let lowest=Infinity, highest=0

    function sell(batch) {
      command({type:'sellHarvest',id:batch.id,count:batch.count})
    }

    for (let elapsed=1;elapsed<=duration;elapsed++) {
      // Keep the Alpha 05 reference quotes at 100%, including auto-sale deadlines.
      if (!dynamic) state.market=initialMarket()
      const events=advance(state,1)
      if (automatic) harvested+=events.filter(event=>event.startsWith('HelperHarvested:')).length
      else {
        planting.forEach((species,plot)=>{
          const plant=state.plots[plot].plant
          if (plant && plant.readySince!==null) {
            command({type:'harvest',plot,expectedId:plant.id,cycle:plant.lives})
            harvested++
          }
        })
        if (sellSeeds) {
          for (const batch of state.basket.slice()) command({type:'extractSeeds',id:batch.id,count:batch.count})
        } else {
          for (const batch of state.basket.slice()) {
            const pressure=state.basket.reduce((n,b)=>n+b.count,0)
            const quote=marketQuote(state,batch.species,'fruit')
            if (!hold || quote.pricePercent>=100 || pressure>=480) sell(batch)
          }
        }
        planting.forEach((species,plot)=>{
          if (state.plots[plot].plant) return
          command({type:'plant',plot,species,stock:sellSeeds && state.seeds[species]>0 ? common : undefined})
        })
        if (sellSeeds && state.seeds.radish>16) command({type:'sellSeeds',species:'radish',profile:common,count:state.seeds.radish-16})
      }
      for (const id of species) {
        const quote=marketQuote(state,id,kind)
        priceSum+=quote.pricePercent
        saturationSum+=quote.saturation
        floor+=Number(quote.pricePercent===market.minimumPricePercent)
        lowest=Math.min(lowest,quote.pricePercent)
        highest=Math.max(highest,quote.pricePercent)
        samples++
      }
    }

    // Use actual sale yields for cash and show stock value separately.
    const unsold=state.basket.reduce((sum,batch)=>sum+harvestSaleValue(batch,batch.count,state),0)
    const replenishment=automatic ? (startingSeeds-state.seeds.radish)*speciesInfo.radish.seedPrice : 0
    return {netPerMinute:(state.coins-start-replenishment)*60/duration,harvested,unsold,
      averagePrice:priceSum/samples,averageSaturation:saturationSum/samples,floorFraction:floor/samples,
      lowest,highest,seedQuote:sellSeeds?seedSaleValue('radish',common,state):null}
  }

  const results=strategies.map(strategy=>{
    const living=seeds.map(seed=>run(strategy,seed,true))
    const fixed=seeds.map(seed=>run(strategy,seed,false))
    const avg=(rows,key)=>+(rows.reduce((sum,row)=>sum+row[key],0)/rows.length).toFixed(2)
    return {strategy:strategy.id,fixedNet:avg(fixed,'netPerMinute'),livingNet:avg(living,'netPerMinute'),
      harvested:avg(living,'harvested'),averagePrice:avg(living,'averagePrice'),
      averageSaturation:avg(living,'averageSaturation'),floorTimePercent:+(100*avg(living,'floorFraction')).toFixed(1),
      lowest:Math.min(...living.map(row=>row.lowest)),highest:Math.max(...living.map(row=>row.highest)),
      unsold:avg(living,'unsold'),runs:living}
  })
  console.log(JSON.stringify({duration,seeds,config:market,results},null,2))
} finally {
  await loader.close()
}
