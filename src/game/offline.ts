import { nurseryProduction } from './config'
import { greenhouseTime } from './greenhouse'
import type { GameState } from './model'
import { advanceProduction, productionLevel, productionStatus, type ProductionReport } from './nursery'
import { growPlots } from './simulation'

export interface ReturnReport extends ProductionReport {
  absent:number
  processed:number
  ready:number
  experiments:number
  stops:ReturnType<typeof productionStatus>['reason'][]
}

export function catchUp(state:GameState,now:number):ReturnReport|null {
  if (!Number.isSafeInteger(now) || now<0) return null
  const previous=state.passive.checkpoint
  if (previous!==null && previous>=now) return null
  state.passive.checkpoint=now
  if (previous===null) return null
  const absent=(now-previous)/1000
  const elapsed=Math.min(absent,nurseryProduction.awayLimitHours*3600)
  const processed=Math.min(elapsed,productionLevel(state).hours*3600)
  const before=greenhouseTime(state)
  const operations=[...state.crosses.filter(c=>!c.collected),...state.clones]
  const latest=operations.reduce((max,c)=>Math.max(max,c.readyAt-before),0)
  state.passive.labSeconds+=Math.min(latest,elapsed)
  const after=greenhouseTime(state)
  const experiments=operations.filter(c=>c.readyAt>before && c.readyAt<=after).length
  const ready=growPlots(state,elapsed,false)
  const report=advanceProduction(state,processed)
  if (!(ready || experiments || report.fruit || report.seeds || report.spent || report.coins)) return null
  const stops=state.passive.beds.map((_,slot)=>productionStatus(state,slot).reason)
  return {...report,absent,processed,ready,experiments,stops}
}
