import { speciesInfo, valueScale } from './config'
import { rules, traits } from './genetics'
import { marketQuote } from './market'
import { rarities, type GameState, type HarvestBatch, type Profile, type Species } from './model'

type PricingState = Pick<GameState,'market'>

export function harvestUnitValue(batch:HarvestBatch,state?:PricingState):number {
  const percent=state ? marketQuote(state,batch.species,'fruit').pricePercent : 100
  return batch.valueUnits*percent/(valueScale*100)
}

export function harvestSaleValue(batch:HarvestBatch,count=batch.count,state?:PricingState):number {
  const unit=harvestUnitValue(batch,state)
  // The difference telescopes for partial sales at the same market quote.
  return Math.round(batch.count*unit)-Math.round((batch.count-count)*unit)
}

export function seedSaleValue(species:Species,profile:Profile,state?:PricingState):number {
  const traitValue=1+traits(profile).length*rules.seedTraitPrice.plus-(profile.minus ? rules.seedTraitPrice.minus : 0)
  const percent=state ? marketQuote(state,species,'seed').pricePercent : 100
  return Math.max(1,Math.round(speciesInfo[species].seedValue*rules.raritySeedPrice[rarities.indexOf(profile.rarity)]*traitValue*percent/100))
}
