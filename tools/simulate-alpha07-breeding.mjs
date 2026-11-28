import { createServer } from 'vite'

const samples=Number(process.argv[2]??1024)
if (!Number.isSafeInteger(samples) || samples<100) throw new Error('Use at least 100 seeds')
const seeds=[17,42,2026,...Array.from({length:samples-3},(_,i)=>i+3000)]
const loader=await createServer({server:{middlewareMode:true,watch:null,ws:false},appType:'custom'})

try {
  const {advance,execute,initialState}=await loader.ssrLoadModule('/src/game/index.ts')
  const {evolution,market,speciesInfo,speciesIds}=await loader.ssrLoadModule('/src/game/config.ts')
  const {changeStock,common,rules}=await loader.ssrLoadModule('/src/game/genetics.ts')
  const {rarities}=await loader.ssrLoadModule('/src/game/model.ts')
  const {newPlant}=await loader.ssrLoadModule('/src/game/state.ts')
  const {seedSaleValue}=await loader.ssrLoadModule('/src/game/pricing.ts')
  const thresholds={alpha06:Number.MAX_SAFE_INTEGER,guarantee6:6,guarantee10:10,guarantee15:15}
  const preparedSpecies='radish'

  function command(state,input) {
    const result=execute(state,input)
    if (!result.ok) throw new Error(`${JSON.stringify(input)} → ${result.reason}`)
    return result
  }

  function run(seed,limit) {
    evolution.rarityGuarantee=limit
    const state=initialState(seed)
    // Fund the experiment series to measure breeding independently of market and capital costs.
    state.coins=200_000
    state.planted.push('strawberry','sunflower')
    state.revealed=['solar_strawberry']
    command(state,{type:'upgradeGreenhouse',target:2})
    const capital=200_000-state.coins
    const parents={common:[],uncommon:[],rare:[],epic:[]}
    for (const plot of [12,13]) {
      const id=state.plots[plot].plant.id
      command(state,{type:'store',plot,expectedId:id})
      parents.common.push(id)
    }

    const first={}
    let attempts=0
    while (attempts<2000) {
      const pair=parents.epic.length===2 ? parents.epic
        : parents.rare.length===2 ? parents.rare
        : parents.uncommon.length===2 ? parents.uncommon : parents.common
      command(state,{type:'startCross',parents:pair})
      const trial=state.crosses.at(-1)
      advance(state,trial.readyAt-state.playTime)
      command(state,{type:'collectCross',id:trial.id})
      attempts++
      const profile=trial.profile
      first[profile.rarity]??={attempts,seconds:state.playTime,operating:200_000-state.coins-capital}
      if (profile.rarity==='legendary') return first
      if (parents[profile.rarity].length===2) continue
      command(state,{type:'plant',plot:12,species:preparedSpecies,stock:profile})
      const id=state.plots[12].plant.id
      command(state,{type:'store',plot:12,expectedId:id})
      parents[profile.rarity].push(id)
    }
    throw new Error(`Breeding stalled for seed ${seed}`)
  }

  function statistics(values) {
    const sorted=values.slice().sort((a,b)=>a-b)
    const percentile=p=>sorted[Math.ceil(p*sorted.length)-1]
    return {mean:Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(2)),
      median:percentile(.5),p90:percentile(.9),p95:percentile(.95),max:sorted.at(-1)}
  }

  const thresholdsSummary=Object.fromEntries(Object.entries(thresholds).map(([key,limit])=>{
    const runs=seeds.map(seed=>run(seed,limit))
    const milestones=Object.fromEntries(['rare','epic','legendary'].map(rank=>[
      rank,Object.fromEntries(['attempts','seconds','operating'].map(metric=>[
        metric,statistics(runs.map(run=>run[rank][metric]))
      ]))
    ]))
    return [key,{milestones,firstThree:seeds.slice(0,3).map((seed,i)=>({seed,...runs[i]}))}]
  }))
  evolution.rarityGuarantee=thresholds.guarantee10

  const cloneSummary=speciesIds.map(species=>{
    const state=initialState(42)
    state.coins=200_000
    state.planted.push('strawberry','sunflower')
    if (!state.planted.includes(species)) state.planted.push(species)
    state.revealed=['solar_strawberry']
    if (speciesInfo[species].seedPrice===null && !state.revealed.includes(species)) state.revealed.push(species)
    for (let target=2;target<=5;target++) command(state,{type:'upgradeGreenhouse',target})
    const profile={rarity:'legendary',plus:['early','seedy','quality'],minus:null}
    const parent=newPlant(state.nextId++,species,profile)
    state.nursery.push(parent)
    const before=state.coins
    command(state,{type:'startClone',id:parent.id})
    const [operation]=state.clones
    advance(state,operation.readyAt-state.playTime)
    command(state,{type:'collectClone',id:operation.id})
    const cost=before-state.coins
    const saleBefore=state.coins
    command(state,{type:'sellSeeds',species,profile,count:1})
    const neutralSale=state.coins-saleBefore
    const rank=rarities.indexOf('legendary')
    const maxBase=speciesInfo[species].seedValue*rules.raritySeedPrice[rank]*(1+rules.slots[rank]*rules.seedTraitPrice.plus)
    const maxSale=Math.round(maxBase*market.maximumPricePercent/100)
    return {species,cost,seconds:operation.readyAt-operation.startsAt,neutralSale,maxSale,maxSaleNet:maxSale-cost,
      maxNewOrderLinePerSeed:Math.ceil(maxSale*evolution.orderBonus),valueAtNeutralQuote:seedSaleValue(species,profile,state)}
  })
  console.log(JSON.stringify({samples,thresholds:thresholdsSummary,cloneSummary},null,2))
} finally {
  await loader.close()
}
