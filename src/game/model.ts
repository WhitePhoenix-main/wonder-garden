export const baseIds = ['radish','strawberry','sunflower','blueberry','moonflower','clover'] as const
export const hybridIds = ['solar_strawberry','moonberry','honey_clover','golden_flower','crystal_flower','star_orchid'] as const
export type Hybrid = typeof hybridIds[number]
export type Species = typeof baseIds[number] | Hybrid
export type BedLevel = 1 | 2 | 3
export type Lang = 'ru' | 'en'
export type HelperLevel = 0 | 1 | 2 | 3
export const decorIds = ['bench','lantern','flower_arch','sakura'] as const
export type DecorType = typeof decorIds[number]
export const saveVersion = 7

export interface Recipe {
  result: Hybrid
  primary: Species
  neighbors: Species[]
  minBedLevel: BedLevel
  harvests: number
}

export const rarities = ['common','uncommon','rare'] as const
export const positives = ['hardy','early','fruitful','seedy'] as const
export const negatives = ['fragile','slow','small','sparse'] as const
export interface Profile {
  rarity: typeof rarities[number]
  plus: typeof positives[number] | null
  minus: typeof negatives[number] | null
}
export interface SeedPack extends Profile {species:Species; count:number}
export interface Experiment {result:Hybrid; donorId:number; layout:string}
export interface Plant extends Profile {
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
}

export interface Decoration {
  id: number
  type: DecorType
  slot: string | null
}

export interface GameState {
  schemaVersion: typeof saveVersion
  balanceVersion: number
  playTime: number
  nextId: number
  coins: number
  plots: Plot[]
  nursery: Plant[]
  decorations: Decoration[]
  basketLevel: number
  basket: { species: Species; valueUnits: number }[]
  helperLevel: HelperLevel
  autoSell: boolean
  harvestRemaining: number
  sellRemaining: number
  sold: boolean
  firstHarvest: boolean
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
}
export type Command =
  | {type:'clear'|'upgrade';plot:number}
  | {type:'harvest';plot:number;expectedId:number;cycle:number; seeds?:boolean; experiment?:Experiment}
  | {type:'store'|'compost';plot:number;expectedId:number}
  | {type:'dismissHybrid'} | {type:'tutorialBranch';branch:'experiment'|'corner'}
  | {type:'music';muted:boolean} | {type:'skipTutorial'|'showOccupiedHint'}
  | {type:'plant';plot:number;species:Species;replaceId?:number;stock?:Profile}
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
export type Result = {ok:true; events:string[]} | {ok:false;reason:string}
