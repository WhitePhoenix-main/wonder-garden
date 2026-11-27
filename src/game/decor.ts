import type { Command, Decoration, GameState, Result } from './model'
import { balance, decorInfo, isDecorSlot, isDecorType, speciesInfo } from './config'
import { isRecipeRevealed } from './queries'

export function decorationAt(state:GameState, slot:string): Decoration | undefined {
  return state.decorations.find(item => item.slot === slot)
}

export function decorUnlocked(state:GameState): boolean {
  return state.planted.some(id => speciesInfo[id].generation > 0)
}

export function harmony(state:GameState): number {
  const plants = new Set(state.plots.flatMap(p => p.plant ? [p.plant.species] : []))
  const decorations = new Set(state.decorations.flatMap(d => d.slot === null ? [] : [d.type]))
  const greenhouse = isRecipeRevealed(state)
  let total = balance.buildingHarmony * (Number(greenhouse) + Number(state.autoSell))
  for (const species of plants) total += speciesInfo[species].harmony
  for (const type of decorations) total += decorInfo[type].harmony
  return total
}

type DecorCommand = Extract<Command, {type:'buyDecor'|'placeDecor'|'storeDecor'}>

export function decorate(state:GameState, command:DecorCommand): Result {
  if (!decorUnlocked(state)) return {ok:false,reason:'decorLocked'}
  if (command.type === 'storeDecor') {
    const item = state.decorations.find(d => d.id === command.id && d.slot !== null)
    if (!item) return {ok:false,reason:'decorChanged'}
    item.slot = null
  } else {
    if (!isDecorSlot(command.slot)) return {ok:false,reason:'invalidSlot'}
    const displaced = decorationAt(state,command.slot)
    if ((displaced?.id ?? null) !== command.replaceId) return {ok:false,reason:'decorChanged'}
    if (command.type === 'buyDecor') {
      if (!isDecorType(command.decor)) return {ok:false,reason:'invalidDecor'}
      const cost = decorInfo[command.decor].cost
      if (state.coins < cost) return {ok:false,reason:'noCoins'}
      if (displaced) displaced.slot = null
      state.coins -= cost
      state.decorations.push({id:state.nextId++,type:command.decor,slot:command.slot})
    } else {
      const item = state.decorations.find(d => d.id === command.id)
      if (!item || item === displaced) return {ok:false,reason:'decorChanged'}
      if (displaced) displaced.slot = item.slot
      item.slot = command.slot
    }
  }
  return {ok:true,events:['DecorChanged']}
}
