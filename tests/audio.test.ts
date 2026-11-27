import { afterEach, expect, it, vi } from 'vitest'
import { gardenAudio } from '../src/runtime/audio'

afterEach(()=>vi.unstubAllGlobals())

it('keeps routine automation silent, including automatic sales; gives discoveries their own cue',()=>{
  const tones:number[]=[]
  let themes=0
  class TestAudio {
    state='running'
    currentTime=0
    destination={}
    resume=async()=>{}
    suspend=async()=>{}
    createGain(){
      return {gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}
    }
    createBuffer(_channels:number,count:number){return {getChannelData:()=>new Float32Array(count)}}
    createBufferSource(){
      themes++
      return {buffer:null,loop:false,connect:(next:unknown)=>next,start(){}}
    }
    createOscillator(){
      const frequency={value:0}
      return {frequency,connect:(next:unknown)=>next,disconnect(){},stop(){},start(){tones.push(frequency.value)}}
    }
  }
  vi.stubGlobal('AudioContext',TestAudio)
  vi.stubGlobal('document',{hidden:false})
  const audio=gardenAudio()
  audio.sync(true,false)
  audio.sync(false,false)
  audio.sync(true,true)
  expect(themes).toBe(1)
  audio.play(['Harvested','HelperHarvested:12','Sold'],false,true)
  expect(tones).toEqual([])
  audio.play(['RecipeRevealed:solar_strawberry','Harvested','HelperHarvested:8'],false,true)
  expect(tones).toEqual([523,659,880,1047])
  tones.length=0
  const signatures=new Set<string>()
  for(const event of ['Planted','Harvested','Sold','Composted','BedUpgraded']){
    audio.play([event],false)
    expect(tones.length).toBeGreaterThan(0)
    signatures.add(tones.join(','))
    tones.length=0
    audio.play([event],true)
    expect(tones).toEqual([])
  }
  expect(signatures.size).toBe(5)
})

