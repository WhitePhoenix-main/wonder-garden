import type { Command, DecorType, GameState, Result } from '../game/model'

export type Mode = 'garden' | 'plant' | 'build' | 'breed'

export interface WorldView {
  decorPreview: { slot:string; type:DecorType } | null
  decorEditing:boolean
  state:GameState; selected:number|null; mode:Mode; moveFrom:number|null
}
export interface World {
  effects(events:string[], harvestPlot?:number):void; render(view:WorldView):void; center():void; zoom(delta:number):void; destroy():void
}
export interface UIActions {
  command(cmd:Command):Result; select(index:number):void; center():void; zoom(delta:number):void; reset():void; exportSave():void; decorPreview(editing:boolean, preview:WorldView['decorPreview']):void;
  changeView(view:Pick<WorldView,'mode'|'moveFrom'|'selected'>):void
}
export interface UI {
  notify(events:string[]):void; render(view:WorldView,storageWarning:string|null):void; pick(index:number):void; pickDecor(slot:string):void
}
