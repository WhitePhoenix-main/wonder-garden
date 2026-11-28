import type { Command, DecorType, GameState, Result } from '../game/model'

export type Mode = 'garden' | 'plant' | 'build' | 'breed'

export interface WorldView {
  decorPreview: { slot:string; type:DecorType } | null
  sunflower?:boolean
  menu:boolean; started:boolean; shovel:boolean
  decorEditing:boolean
  state:GameState; selected:number|null; mode:Mode; moveFrom:number|null
}
export interface World {
  effects(events:string[]):void; render(view:WorldView):void; center():void; zoom(delta:number):void; destroy():void
}
export interface UIActions {
  enter():void; menu():void
  command(cmd:Command):Result; select(index:number|null):void; center():void; zoom(delta:number):void; reset():void; exportSave():void; decorPreview(editing:boolean, preview:WorldView['decorPreview']):void;
  changeView(view:Partial<Pick<WorldView,'sunflower'|'mode'|'moveFrom'|'selected'|'shovel'>>):void
}
export interface UI {
  nursery():void; notify(events:string[]):void; render(view:WorldView,storageWarning:string|null):void; pick(index:number):void; pickDecor(slot:string):void
}
