export const baseIds = ['radish','strawberry','sunflower','blueberry','moonflower','clover'] as const
export const hybridIds = ['solar_strawberry','moonberry','honey_clover','golden_flower','crystal_flower','star_orchid'] as const
export type Hybrid = typeof hybridIds[number]
export type Species = typeof baseIds[number] | Hybrid
export type BedLevel = 1 | 2 | 3 | 4 | 5
export type Lang = 'ru' | 'en'
export type HelperLevel = 0 | BedLevel
export const decorIds = ['bench','lantern','flower_arch','sakura','fountain','apiary','magic_lantern','statue'] as const
export type DecorType = typeof decorIds[number]
export const saveVersion = 10
export type MarketKind = 'fruit' | 'seed'
export interface MarketSupply {
  saturated: number
  delivered: number
}
export interface MarketState {
  tick: number
  remaining: number
  goods: Record<Species, Record<MarketKind, MarketSupply>>
}

export interface Recipe {
  result: Hybrid
  primary: Species
  neighbors: Species[]
  minBedLevel: BedLevel
  harvests: number
}

export const rarities = ['common','uncommon','rare','epic','legendary'] as const
export const positives = ['hardy','early','fruitful','seedy','quality','stable','aura'] as const
export const negatives = ['fragile','slow','small','sparse'] as const
export type Rarity = typeof rarities[number]
export type Positive = typeof positives[number]
export type IslandId = 'green'|'valley'
export interface Profile {
  rarity: Rarity
  /** Scalar inputs are supported for earlier saves. New profiles use an array. */
  plus: readonly Positive[] | Positive | null
  minus: typeof negatives[number] | null
}
export interface SeedPack extends Profile {species:Species; count:number}
export interface Experiment {result:Hybrid; donorId:number; layout:string}
export interface PollinationSnapshot {
  result: Hybrid
  donor: Profile & {species:Species}
  supporting: (Profile & {species:Species})[]
}
export interface HarvestLot {
  size: number
  remaining: number
  seedYield: number
  copyChance: number
  copyPending: boolean
  crossPending: boolean
  origin?: {plot:number; mode:PlotMode; specimen:number; protected:boolean}
}
export interface HarvestBatch {
  id: number
  species: Species
  valueUnits: number
  count: number
  profile: Profile|null
  pollination: PollinationSnapshot|null
  lots: HarvestLot[]
}
export interface Plant extends Profile {
  pollination: PollinationSnapshot|null
  lives:number
  maxLives:number
  fruitRoll:number
  id: number
  species: Species
  progress: number
  mature: boolean
  readySince: number | null
}

export interface Plot {
  open: boolean
  level: BedLevel
  plant: Plant | null
  policy?: PlotPolicy
}

export const plotModes = ['manual','commercial','seed','breeding','support'] as const
export type PlotMode = typeof plotModes[number]
export interface PlotPolicy {
  mode: PlotMode
  priority: number
  harvest: boolean
  replant: {species:Species; profile:Profile}|null
  target: number
}
export interface GreenhouseCross {
  id:number
  parents:[number,number]
  parentProfiles:[Profile,Profile]
  species:Species
  profile:Profile
  startsAt:number
  readyAt:number
  collected:boolean
}
export const buyers = ['baker','merchant','florist','alchemist','botanist','collector'] as const
export interface OrderRequirement {
  kind:'fruit'|'seed'
  count:number
  species?:Species
  tier?:number
  rarity?:Rarity
  trait?:Positive
  clean?:boolean
}
export interface Order {
  id:number
  buyer:typeof buyers[number]
  requirements:OrderRequirement[]
  reward:number
}
export interface CollectionRecord {
  species:Species
  rarity:Rarity
  profile:Profile
  planted:number
  harvested:number
  profiles:Profile[]
}

export interface Decoration {
  id: number
  type: DecorType
  slot: string | null
}

export interface GameState {
  schemaVersion: typeof saveVersion
  market: MarketState
  balanceVersion: number
  playTime: number
  nextId: number
  coins: number
  plots: Plot[]
  nursery: Plant[]
  decorations: Decoration[]
  basketLevel: number
  basket: HarvestBatch[]
  helperLevel: HelperLevel
  autoSell: boolean
  harvestRemaining: number
  sellRemaining: number
  sold: boolean
  firstHarvest: boolean
  firstExtraction: boolean
  firstSeedPlanting: boolean
  firstPropagation: boolean
  planted: Species[]
  revealed: Hybrid[]
  seeds: Record<Species,number>
  variants:SeedPack[]
  failures:Record<Hybrid,number>
  rng:number
  lang: Lang
  musicMuted: boolean
  occupiedHintShown: boolean
  tutorialBranch: 'experiment'|'corner'|null
  pendingHybrid:Hybrid|null
  tutorialSkipped: boolean
  muted: boolean
  activeIsland: IslandId
  greenhouseLevel: number
  stallLevel: number
  crosses: GreenhouseCross[]
  orders: Order[]
  orderRefreshAt: number
  ordersCompleted: number
  collection: CollectionRecord[]
  achievements: string[]
  rank: number
  protectedPlants: number[]
  protectedProfiles: string[]
  favorites: string[]
  reserves: Record<string,number>
  automation: {
    enabled:boolean; replant:boolean; extractPollinated:boolean; sellSeeds:boolean; preferred:PlotMode|null
    sellFruit:boolean; saleRarity:Rarity|null
  }
}
export type BulkItem =
  | {type:'sellHarvest';id:number;count:number}
  | {type:'extractSeeds';id:number;count:number}
  | {type:'sellSeeds';species:Species;profile:Profile;count:number}
  | {type:'plant';plot:number;species:Species;replaceId?:number;stock?:Profile}
export type EvolutionCommand =
  | {type:'upgradeGreenhouse'|'upgradeStall';target:number}
  | {type:'startCross';parents:[number,number]}
  | {type:'collectCross'|'fulfillOrder'|'declineOrder';id:number}
  | {type:'restoreBridge'}
  | {type:'travel';island:IslandId}
  | {type:'protectPlant';id:number;enabled:boolean}
  | {type:'protectProfile'|'favoriteProfile';species:Species;profile:Profile;enabled:boolean}
  | {type:'setReserve';species:Species;profile?:Profile;count:number}
  | {type:'plotPolicy';plot:number;policy:PlotPolicy}
  | {type:'setAutomation';settings:GameState['automation']}
  | {type:'bulk';commands:BulkItem[]}
export type Command =
  | EvolutionCommand
  | BulkItem
  | {type:'clear'|'upgrade';plot:number}
  | {type:'harvest';plot:number;expectedId:number;cycle:number}
  | {type:'store'|'compost';plot:number;expectedId:number}
  | {type:'dismissHybrid'} | {type:'tutorialBranch';branch:'experiment'|'corner'}
  | {type:'music';muted:boolean} | {type:'skipTutorial'|'showOccupiedHint'}
  | {type:'return';plot:number;id:number}
  | {type:'move';from:number;to:number}
  | {type:'upgradeHelper'; target:Exclude<HelperLevel,0>} | {type:'buyAutoSell'}
  | {type:'buyDecor'; decor:DecorType; slot:string; replaceId:number|null}
  | {type:'placeDecor'; id:number; slot:string; replaceId:number|null}
  | {type:'storeDecor'; id:number}
  | {type:'upgradeBasket'; target:number}
  | {type:'emergencyRadish'; plot:number}
  | {type:'sound'; muted:boolean}
  | {type:'sell'} | {type:'language';lang:Lang}
export type Result = {ok:true; events:string[]; obtained?:SeedPack[]} | {ok:false;reason:string}
