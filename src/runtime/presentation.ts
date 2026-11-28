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
  plotBounds(index:number):DOMRect|null; structureBounds(id:string):DOMRect|null; focusPlot(index:number):void
}
export interface UIActions {
  enter():void; menu():void
  command(cmd:Command):Result; select(index:number|null):void; center():void; zoom(delta:number):void; reset():void; exportSave():void; decorPreview(editing:boolean, preview:WorldView['decorPreview']):void;
  changeView(view:Partial<Pick<WorldView,'sunflower'|'mode'|'moveFrom'|'selected'|'shovel'>>):void
  worldTutorialBounds(index:number):DOMRect|null
  worldStructureBounds(id:string):DOMRect|null
  focusTutorialPlot(index:number):void
}
export interface UI {
  market():void; bridge():void; helper():void; inspect(index:number):void
  nursery():void; notify(events:string[]):void; render(view:WorldView,storageWarning:string|null):void; pick(index:number):void; pickDecor(slot:string):void
}
