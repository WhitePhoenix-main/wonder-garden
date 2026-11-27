const sounds = {
  gather: [440, 660],
  sale: [523, 659, 784],
  build: [196, 294],
  discovery: [523, 659, 880, 1047]
}

export function gardenAudio() {
  let context: AudioContext | null = null

  function unlock() {
    try {
      context ??= new AudioContext()
      if (context.state === 'suspended') void context.resume().catch(() => {})
    } catch { /* Audio availability does not affect play. */ }
  }

  function play(events:string[], muted:boolean) {
    if (muted || !context || context.state !== 'running' || document.hidden) return
    const discovery = events.some(event => event.startsWith('RecipeRevealed:') || event === 'GardenCompleted')
    const notes = discovery ? sounds.discovery : events.includes('Sold') ? sounds.sale :
      events.includes('Harvested') ? sounds.gather : events.some(event =>
        ['PlotCleared','BedUpgraded','DecorChanged','HelperUpgraded','AutoSellEnabled','Planted'].includes(event)) ?
        sounds.build : null
    if (!notes) return
    notes.forEach((frequency,i) => {
      const audio = context!
      const time = audio.currentTime + i * .058
      const tone = audio.createOscillator()
      const volume = audio.createGain()
      tone.type = 'sine'
      tone.frequency.value = frequency
      volume.gain.setValueAtTime(.001,time)
      volume.gain.exponentialRampToValueAtTime(.054,time + .014)
      volume.gain.exponentialRampToValueAtTime(.001,time + .15)
      tone.connect(volume).connect(audio.destination)
      tone.start(time)
      tone.stop(time + .16)
    })
  }

  return {unlock,play}
}
