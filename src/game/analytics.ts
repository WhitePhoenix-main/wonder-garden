import type { GameState, Species } from './model'

// One aggregate per active second and species. Only the live garden is observed.
export interface Metrics {
  fruitRevenue:number; seedRevenue:number; orders:number; seedCost:number; breedingCost:number; construction:number
  planted:number; harvests:number; fruit:number; seeds:number; quoteUnits:number; soldUnits:number
  helperUsed:number; helperCapacity:number
}
const empty = ():Metrics => ({fruitRevenue:0,seedRevenue:0,orders:0,seedCost:0,breedingCost:0,construction:0,
  planted:0,harvests:0,fruit:0,seeds:0,quoteUnits:0,soldUnits:0,helperUsed:0,helperCapacity:0})
type Channel = Species|'garden'
type Bucket = Map<Channel,Metrics>
const sessions = new WeakMap<GameState,{start:number; buckets:Map<number,Bucket>}>()

export function beginObservation(state:GameState) {
  sessions.set(state,{start:state.playTime,buckets:new Map()})
}
function add(target:Metrics, delta:Partial<Metrics>) {
  for (const key of Object.keys(delta) as (keyof Metrics)[]) target[key]+=delta[key]!
}
export function measure(state:GameState, channel:Channel, delta:Partial<Metrics>) {
  const session=sessions.get(state)
  if (!session) return
  const second=Math.floor(state.playTime)
  let bucket=session.buckets.get(second)
  if (!bucket) {
    for (const time of session.buckets.keys()) if (time<=second-300) session.buckets.delete(time)
    bucket=new Map()
    session.buckets.set(second,bucket)
  }
  const row=bucket.get(channel)??empty()
  add(row,delta)
  bucket.set(channel,row)
}
export function observeDraft(state:GameState,draft:GameState) {
  if (sessions.has(state)) beginObservation(draft)
}
export function commitObservation(state:GameState,draft:GameState) {
  const buckets=sessions.get(draft)?.buckets
  if (buckets) for (const rows of buckets.values()) for (const [channel,row] of rows) measure(state,channel,row)
}
export function sessionStats(state:GameState,seconds:60|300) {
  const session=sessions.get(state)
  const elapsed=session ? Math.min(seconds,state.playTime-session.start) : 0
  const total=empty(), crops=new Map<Species,Metrics>()
  if (session) for (const [time,rows] of session.buckets) {
    if (time<=Math.floor(state.playTime)-seconds) continue
    for (const [channel,row] of rows) {
      add(total,row)
      if (channel==='garden') continue
      const crop=crops.get(channel)??empty()
      add(crop,row)
      crops.set(channel,crop)
    }
  }
  return {elapsed,total,crops}
}
