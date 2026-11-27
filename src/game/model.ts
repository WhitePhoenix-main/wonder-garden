export const baseIds = ['radish','strawberry','sunflower','blueberry','moonflower','clover'] as const
export const hybridIds = ['solar_strawberry','moonberry','honey_clover','golden_flower','crystal_flower','star_orchid'] as const
export type Hybrid = typeof hybridIds[number]
export type Species = typeof baseIds[number] | Hybrid
export type BedLevel = 1 | 2 | 3
export type Lang = 'ru' | 'en'
export type HelperLevel = 0 | 1 | 2 | 3
export const decorIds = ['bench','lantern','flower_arch','sakura'] as const
export type DecorType = typeof decorIds[number]
export const saveVersion = 4

export interface Recipe {
  result: Hybrid
  primary: Species
  neighbors: Species[]
  minBedLevel: BedLevel
  harvests: number
}

export interface Plant {
  id: number
  species: Species
  progress: number
  mature: boolean
  readySince: number | null
  propagation: number
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
  recipeProgress: Record<Hybrid,number>
  seeds: Record<Hybrid,number>
  lang: Lang
  muted: boolean
}
export type Command =
  | {type:'harvest'|'clear'|'upgrade'|'store';plot:number}
  | {type:'plant';plot:number;species:Species;replaceId?:number}
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
