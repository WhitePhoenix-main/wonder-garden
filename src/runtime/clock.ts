/** A long frame may advance the garden by at most 250 ms. Hidden time is discarded. */
export function createClock(step: (seconds:number)=>void) {
  const stepMs = 100
  let previous:number|null = null
  let rest = 0
  function reset() { previous = null; rest = 0 }
  function frame(now:number) {
    if (previous !== null) rest += Math.min(250, Math.max(0, now - previous))
    previous = now
    let changed = false
    while (rest >= stepMs) {
      step(stepMs / 1000)
      rest -= stepMs
      changed = true
    }
    return changed
  }
  return { frame, reset }
}
