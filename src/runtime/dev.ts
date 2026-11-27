export function mountDebug(grantCoins:()=>void, toggleSpeed:()=>boolean) {
  const panel = document.createElement('aside')
  panel.className = 'dev-panel'
  panel.setAttribute('aria-label','Dev')
  const coins = document.createElement('button')
  coins.textContent = '+500 ◈'
  coins.addEventListener('click',grantCoins)
  const speed = document.createElement('button')
  speed.textContent = '×1'
  speed.addEventListener('click',() => {
    speed.textContent = toggleSpeed() ? '×8' : '×1'
  })
  panel.append(coins,speed)
  document.querySelector('#app')!.append(panel)
  Object.assign(panel.style,{position:'fixed',top:'32%',left:'8px',display:'grid',gap:'4px',zIndex:'10'})
}
