// Original eight-bar waltz for Wonder Garden, synthesized locally at first entry.
function makeTheme(ctx:AudioContext) {
  const beat = 0.5, rate = 22050
  const buffer = ctx.createBuffer(1, rate * beat * 24, rate)
  const data = buffer.getChannelData(0)
  function note(start:number, midi:number, duration:number, gain:number) {
    const hz = 440 * 2 ** ((midi-69)/12)
    for (let i=0;i<duration*rate;i++) {
      const t=i/rate, phase=2*Math.PI*hz*t
      const envelope=Math.min(1,t/.035,(duration-t)/.07)*Math.exp(-3*t)
      const sample=(Math.sin(phase)+.18*Math.sin(2*phase))*gain*envelope
      data[(Math.round(start*rate)+i)%data.length] += sample
    }
  }
  const chords=[[48,64,67],[45,60,64],[53,65,69],[43,62,67],
                [48,64,72],[45,64,69],[50,65,69],[43,62,71]]
  chords.forEach(([bass,third,top],bar)=>{
    note(bar*3*beat,bass,1.4,.07)
    note((bar*3+1)*beat,third,.82,.05)
    note((bar*3+2)*beat,top,.94,.05)
  })
  const source=ctx.createBufferSource()
  source.buffer=buffer
  source.loop=true
  return source
}

export function gardenAudio() {
  let ctx:AudioContext|null=null
  let music:GainNode|null=null
  function sync(active:boolean, muted:boolean) {
    try {
      if (!ctx && active) {
        ctx=new AudioContext()
        music=ctx.createGain()
        const theme=makeTheme(ctx)
        theme.connect(music).connect(ctx.destination)
        theme.start()
      }
      if (!ctx || !music) return
      music.gain.value=muted ? 0 : .42
      void (active ? ctx.resume() : ctx.suspend()).catch(()=>{})
    } catch { /* Sound is optional. */ }
  }
  const cues:Record<string,number[]> = {Planted:[330,494],Harvested:[440,660],Sold:[523,659,784],
    SeedsExtracted:[370,494,740],RareSeed:[440,554,740,988],Composted:[220,147],BedUpgraded:[196,294,392],
    Discovery:[523,659,880,1047]}
  function play(events:string[],muted:boolean,automatic=false) {
    if (!ctx || muted || document.hidden) return
    const key=events.some(e=>e.startsWith('RecipeRevealed:')) ? 'Discovery' :
      !automatic && events.find(e=>e in cues)
    if (!key) return
    cues[key].forEach((freq,i)=>{
      const time=ctx!.currentTime+i*.075, tone=ctx!.createOscillator(), volume=ctx!.createGain()
      tone.frequency.value=freq
      volume.gain.setValueAtTime(.001,time)
      volume.gain.exponentialRampToValueAtTime(.055,time+.014)
      volume.gain.exponentialRampToValueAtTime(.001,time+.17)
      tone.connect(volume).connect(ctx!.destination)
      tone.onended=()=>{tone.disconnect();volume.disconnect()}
      tone.start(time)
      tone.stop(time+.18)
    })
  }
  return {sync,play}
}
