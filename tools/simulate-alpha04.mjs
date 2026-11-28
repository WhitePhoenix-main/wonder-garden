import { createServer } from 'vite'

const samples = Number(process.argv[2] ?? 1000)
if (!Number.isSafeInteger(samples) || samples <= 0) throw new Error('Expected a positive sample count')

const server = await createServer({server:{middlewareMode:true,watch:null}, appType:'custom'})
try {
  const {initialState, advance, execute, cycleSeconds, speciesInfo, speciesIds} =
    await server.ssrLoadModule('/src/game/index.ts')
  const {common, changeStock, plantStats, sameProfile} = await server.ssrLoadModule('/src/game/genetics.ts')
  const {hybridIds} = await server.ssrLoadModule('/src/game/model.ts')
  const {extractionYield, harvestSaleValue, seedSaleValue} = await server.ssrLoadModule('/src/game/trade.ts')

  const profiles = {
    common,
    fruitful:{rarity:'rare',plus:'fruitful',minus:null},
    earlySmall:{rarity:'rare',plus:'early',minus:'small'},
    seedy:{rarity:'rare',plus:'seedy',minus:null},
    hardy:{rarity:'rare',plus:'hardy',minus:null},
    fragile:{rarity:'common',plus:null,minus:'fragile'}
  }

  function benchmark(species, profile, policy) {
    const info = speciesInfo[species]
    const usesStock = info.seedPrice === null || !sameProfile(profile, common)
    const seedCost = usesStock ? seedSaleValue(species,profile) : info.seedPrice
    const state = initialState(2026)
    state.plots.forEach(plot => { plot.plant = null })
    state.planted = [...speciesIds]
    state.revealed = [...hybridIds]
    const plot = 8
    const stats = plantStats(species,profile)
    const totals = {fruits:0,seeds:0,coins:0,paidBack:0,paybackSec:0,actions:0,variantSeeds:0,elapsed:0}
    function command(data) {
      const result = execute(state,data)
      if (!result.ok) throw new Error(`${JSON.stringify(data)}: ${result.reason}`)
      totals.actions++
      return result
    }
    for (let cycle = 0; cycle < samples; cycle++) {
      const timeBefore = state.playTime
      state.coins = usesStock ? 0 : seedCost
      let paidBack = false
      if (usesStock) changeStock(state,species,profile,1)
      command({type:'plant',plot,species,stock:usesStock ? profile : undefined})
      const coinsAfterPlanting = state.coins
      while (state.plots[plot].plant) {
        const plant = state.plots[plot].plant
        advance(state,cycleSeconds(state,plot))
        command({type:'harvest',plot,expectedId:plant.id,cycle:plant.lives})
        if (policy === 'fruit' && !paidBack && harvestSaleValue(state.basket[0]) >= seedCost) {
          totals.paidBack++
          totals.paybackSec += state.playTime - timeBefore
          paidBack = true
        }
      }
      totals.elapsed += state.playTime - timeBefore
      const batch = state.basket[0]
      totals.fruits += batch.count
      totals.seeds += extractionYield(batch).seeds
      if (policy !== 'fruit') {
        const {obtained} = command({type:'extractSeeds',id:batch.id,count:policy === 'seed' ? batch.count : 1})
        if (policy === 'seed') {
          for (const pack of obtained) {
            if (!sameProfile(pack,common)) totals.variantSeeds += pack.count
            command({type:'sellSeeds',species,profile:pack,count:pack.count})
          }
        } else {
          // The retained seed pays for the next planting. A fresh input stock
          // per trial isolates the tested genome from generation to generation.
          for (const pack of obtained) changeStock(state,species,pack,-pack.count)
        }
      }
      if (batch.count) command({type:'sellHarvest',id:batch.id,count:batch.count})
      totals.coins += state.coins - coinsAfterPlanting
      if (coinsAfterPlanting !== 0) throw new Error('Unexpected planting cost')
    }
    const elapsed = totals.elapsed / samples
    const gross = totals.coins / samples
    return {
      elapsed, fruitPerHarvest:totals.fruits / samples / stats.maxLives, fruitPerLife:totals.fruits / samples,
      seedsPerLife:totals.seeds / samples, gross, net:gross - seedCost,
      grossPerMinute:gross * 60 / elapsed, payback:totals.paidBack ? totals.paybackSec / totals.paidBack : null,
      paybackRate:totals.paidBack / samples, actions:totals.actions / samples,
      variantSeeds:totals.variantSeeds / samples
    }
  }

  const number = n => n === null ? '–' : n.toFixed(2)
  console.log(`# Baseline (${samples} life cycles per species and strategy)`)
  console.log('| Species | Sec | Fruit/crop | Fruit/life | Seeds/life | Fruit gross | Gross/min | Net | Payback s (% eligible) | Renewable/min | Renewable actions/min | Seed-only gross | Fruit actions |')
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const species of speciesIds) {
    const fruit = benchmark(species,common,'fruit')
    const seed = benchmark(species,common,'seed')
    const renewal = benchmark(species,common,'renewal')
    console.log('| '+[species, fruit.elapsed, fruit.fruitPerHarvest, fruit.fruitPerLife, fruit.seedsPerLife,
      fruit.gross, fruit.grossPerMinute, fruit.net,
      number(fruit.payback)+' ('+(fruit.paybackRate*100).toFixed(1)+'%)', renewal.grossPerMinute,
      renewal.actions * 60 / renewal.elapsed, seed.gross, fruit.actions]
      .map(value=>typeof value === 'number' ? number(value) : value).join(' | ')+' |')
  }

  console.log('\n# Genetics sensitivity')
  console.log('| Species | Variant | Extra gross fruit/min vs common | Seed-only gross | Seed-only net | Seeds/life | Variant seeds/life |')
  console.log('|---|---|---:|---:|---:|---:|---:|')
  for (const species of speciesIds) {
    const reference = benchmark(species,common,'fruit')
    for (const [name,profile] of Object.entries(profiles)) {
      if (name === 'common' || speciesInfo[species].lifecycle === 'single' && (name === 'hardy' || name === 'fragile')) continue
      const fruit = benchmark(species,profile,'fruit')
      const seed = benchmark(species,profile,'seed')
      console.log('| '+[species,name,fruit.grossPerMinute-reference.grossPerMinute,seed.gross,seed.net,seed.seedsPerLife,seed.variantSeeds]
        .map(value=>typeof value === 'number' ? number(value) : value).join(' | ')+' |')
    }
  }
} finally {
  await server.close()
}
