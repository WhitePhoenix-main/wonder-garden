import { createServer } from 'vite'
import { resolve } from 'node:path'

const seeds = [17, 42, 2026]
const iterations = 50_000
const root = resolve(process.argv[2] ?? '.')
const loader = await createServer({
  root,
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: 'custom'
})

function sampleAttempts(maximum, probability, nextRandom) {
  const counts = Array(maximum + 1).fill(0)
  for (const rng of seeds) {
    const stream = { rng }
    for (let sample = 0; sample < iterations; sample++) {
      let attempt = 1
      while (nextRandom(stream) >= probability(attempt) && attempt < maximum) attempt++
      counts[attempt]++
    }
  }
  return counts
}

const rounded = (value) => Number(value.toFixed(3))
const total = seeds.length * iterations
const mean = (counts, value) => rounded(counts.reduce((sum, count, attempt) => sum + count * value(attempt), 0) / total)

function percentile(counts, cutoff) {
  let cumulative = 0
  return counts.findIndex(count => (cumulative += count) >= total * cutoff)
}

function summarize(counts) {
  return {
    mean: mean(counts, attempt => attempt),
    median: percentile(counts, 0.5),
    p90: percentile(counts, 0.9),
    p95: percentile(counts, 0.95),
    max: counts.findLastIndex(count => count > 0)
  }
}

try {
  const { breedingRecipes, breedingTier, speciesInfo, evolution } = await loader.ssrLoadModule('/src/game/config.ts')
  const { nextRandom, common, inherit, hybridRarityOdds, rarityGuarantee, rarityOdds } =
    await loader.ssrLoadModule('/src/game/genetics.ts')
  const { rarities } = await loader.ssrLoadModule('/src/game/model.ts')
  const { initialState } = await loader.ssrLoadModule('/src/game/state.ts')
  const { chance } = await loader.ssrLoadModule('/src/game/queries.ts')
  const state = initialState(1)
  state.revealed = ['solar_strawberry']

  const hybrids = breedingRecipes.map(recipe => {
    const tier = breedingTier(recipe.result)
    const counts = sampleAttempts(tier.hardPity, attempt => {
      state.failures[recipe.result] = attempt - 1
      return chance(state, recipe.result, recipe.id)
    }, nextRandom)
    const mother = speciesInfo[recipe.primary]
    const motherSeeds = attempt => Math.ceil(attempt / mother.lives)
    const donorCoins = recipe.neighbors.reduce((sum, donor) => sum + (speciesInfo[donor].seedPrice ?? 0), 0)
    const upfrontShopCoins = attempt => motherSeeds(attempt) * (mother.seedPrice ?? 0) + donorCoins
    return {
      id: recipe.id,
      baseChance: recipe.baseChance,
      motherTier: mother.generation + 1,
      targetTier: speciesInfo[recipe.result].generation + 1,
      softStart: tier.softStart,
      increment: tier.increment,
      hardPity: tier.hardPity,
      attempts: summarize(counts),
      seedInputs: {
        mother: recipe.primary,
        motherHarvestCapacity: mother.lives,
        averageMotherSeeds: mean(counts, motherSeeds),
        maximumMotherSeeds: motherSeeds(tier.hardPity),
        donorSeeds: recipe.neighbors,
        averageUpfrontShopCoins: rounded(mean(counts, attempt => motherSeeds(attempt) * (mother.seedPrice ?? 0)) + donorCoins),
        maximumUpfrontShopCoins: upfrontShopCoins(tier.hardPity)
      }
    }
  })

  const paid = rarities.slice(1).map((rarity, rank) => {
    const parent = rarities[rank]
    const base = rarityOdds(parent, parent)[rank + 1] / 100
    const limit = rarityGuarantee(rarity)
    const counts = sampleAttempts(limit, attempt => attempt === limit ? 1 : base, nextRandom)
    const radishCost = evolution.experiments[speciesInfo.radish.generation].cost
    return { rarity, parent, chance: base, limit, attempts: summarize(counts),
      averageExperimentCoins: mean(counts, attempt => radishCost * attempt), maximumExperimentCoins: radishCost * limit }
  })

  const hybridRarity = seeds.map(rng => {
    const stream = { rng }
    const weights = hybridRarityOdds(common, [common])
    const counts = rarities.map(() => 0)
    const samples = 100_000
    for (let index = 0; index < samples; index++) {
      const profile = inherit(common, common, () => nextRandom(stream), 'strawberry', undefined, weights)
      counts[rarities.indexOf(profile.rarity)]++
    }
    return { rng, samples, counts }
  })

  const paidMatrix = Object.fromEntries(rarities.map((left, rank) => [left,
    Object.fromEntries(rarities.slice(rank).map(right => [right, rarityOdds(left, right)]))
  ]))
  console.log(JSON.stringify({
    seeds, iterations, rarities, guidedFirstSolar: { attempts: 1, rarity: 'common' },
    assumptions: [
      'No crop failure. Donors stay planted and alive. Use one Mother seed per full capacity.',
      'Shop expenditure includes donor seeds and replacement Mother seeds, where they are purchasable.',
      'Hybrid parent acquisition, sale proceeds, bed and greenhouse upgrades are outside direct seed expenditure.',
      'Paid escalation starts with two parents already at the stated rarity. Fixed Radish fees exclude parent costs.'
    ],
    hybrids, hybridRarity, paid, paidMatrix
  }, null, 2))
} finally {
  await loader.close()
}
