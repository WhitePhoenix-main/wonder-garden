import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const origin = process.argv[2] ?? 'http://127.0.0.1:4284'
const scenario = process.argv[3] ?? 'desktop'
assert.ok(['desktop','mobile'].includes(scenario),'Expected desktop or mobile')
const mobile = scenario === 'mobile'
const width = mobile ? 390 : 1366
const height = mobile ? 844 : 768
const resultDir = new URL('../test-results/',import.meta.url)
const browserPort = Number(process.env.WONDER_TEST_CHROME_PORT ?? 9428)
const key = 'wonder-garden.save.v1'
const tabs=await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json()
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const pending=new Map()
const errors=[]
let serial=0
ws.onmessage=({data})=>{
  const event=JSON.parse(data)
  if (event.id) {pending.get(event.id)?.(event);pending.delete(event.id)}
  if (event.method==='Runtime.consoleAPICalled' && event.params.type==='error' ||
      event.method==='Runtime.exceptionThrown' ||
      event.method==='Network.loadingFailed' && !event.params.canceled ||
      event.method==='Log.entryAdded' && event.params.entry.level==='error') errors.push(event)
  if (event.method==='Network.requestWillBeSent') {
    const url=new URL(event.params.request.url)
    if ((url.protocol==='http:' || url.protocol==='https:') && url.origin!==origin) errors.push(event)
  }
  if (event.method==='Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog',{accept:true})
}
async function send(method,params={}) {
  const message=await new Promise(resolve=>{pending.set(++serial,resolve);ws.send(JSON.stringify({id:serial,method,params}))})
  if (message.error) throw Error(message.error.message)
  return message.result
}
async function read(expression) {
  const value=await send('Runtime.evaluate',{expression,returnByValue:true})
  if (value.exceptionDetails) throw Error(value.exceptionDetails.exception?.description)
  return value.result.value
}
const snap=()=>read(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`)
async function until(check,label,timeout=26000) {
  const end=Date.now()+timeout
  do {
    if (await check()) return
    await wait(175)
  } while (Date.now()<end)
  throw Error(`Timed out waiting for ${label}`)
}
async function click(x,y) {
  if (mobile) {
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  } else {
    for (const type of ['mousePressed','mouseReleased']) {
      await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1})
    }
  }
  await wait(140)
}
async function btn(action,extra='') {
  const selector=JSON.stringify(`[data-action="${action}"]${extra}`)
  const box=await read(`(()=>{
    const e=Array.from(document.querySelectorAll(${selector})).find(e=>e.getClientRects().length);
    if(!e||e.disabled)return null;
    e.scrollIntoView({block:"nearest"});
    const b=e.getBoundingClientRect(), x=b.x+b.width/2, y=b.y+b.height/2;
    return {x,y,visible:e.contains(document.elementFromPoint(x,y)),width:b.width,height:b.height};
  })()`)
  assert.ok(box?.visible,`Unavailable ${action}${extra}: `+await read('document.body.innerText.slice(0,1200)'))
  if (mobile) assert.ok(box.width>=44 && box.height>=44,`Touch target too small: ${action} ${box.width}×${box.height}`)
  await click(box.x,box.y)
}

const ready=plots=>until(async()=>(await snap()).plots.every((b,i)=>!plots.includes(i)||b.plant?.readySince!=null),`ripe beds ${plots}`)
async function grid(gx,gy,offsetY=0) {
  const [x,y,w,h]=await read('(()=>{const b=document.querySelector("canvas").getBoundingClientRect();return [b.x,b.y,b.width,b.height]})()')
  const zoom=Math.min(w/1190,h/843)*(mobile?1.45:1)
  const px=x+w/2+((gx-gy)*64-64)*zoom, py=y+h/2+((gx+gy)*32-302+offsetY)*zoom
  const hit=await read(`document.elementFromPoint(${px},${py})?.tagName`)
  assert.equal(hit,'CANVAS',`Garden tile ${gx}, ${gy} is covered by UI`)
  await click(px,py)
}
const bed=i=>grid(3+i%4,2+Math.floor(i/4))
async function menu() {
  await send('Page.navigate',{url:origin+'/?debug=1'})
  await until(()=>read('!!document.querySelector("[data-action=enter]")'),'menu')
  assert.match(await read('document.querySelector(".menu-card small")?.textContent'),/Alpha 08/)
  assert.equal(await read('!!document.querySelector(".dev-panel")'),false)
}
async function screenshot(label) {
  const shot=await send('Page.captureScreenshot',{format:'png'})
  await writeFile(new URL(`alpha08-${scenario}-${label}.png`,resultDir),Buffer.from(shot.data,'base64'))
}
try {
  await mkdir(resultDir,{recursive:true})
  for (const domain of ['Page','Runtime','Network','Log']) await send(domain+'.enable')
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile})
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile})
  await send('Storage.clearDataForOrigin',{origin,storageTypes:'local_storage'})
  await menu()
  assert.equal(await snap(),null)
  await btn('enter')
  await until(()=>read('!!document.querySelector("canvas")'),'Phaser')
  await ready([12,13])
  const start=await snap()
  const subtitle=await read(`(()=>{const t=document.querySelector('.brand small');return t.offsetHeight})()`)
  assert.ok(subtitle<42,`Territory title wraps excessively at ${width}px`)
  await screenshot('garden')
  await bed(12)
  assert.equal((await snap()).plots[12].plant.lives,0)
  assert.ok((await snap()).basket.length)
  await bed(12)
  assert.equal((await snap()).plots[12].plant,null)
  await bed(12)
  await btn('seed','[data-seed="radish"]:not([data-profile])')
  const planted=await snap()
  assert.equal(planted.plots[12].plant.species,'radish')
  assert.notEqual(planted.plots[12].plant.id,start.plots[12].plant.id)
  assert.equal(planted.coins,start.coins-5)
  await bed(4)
  assert.ok(await read('!!document.querySelector("[data-action=clear]")'))
  await btn('close')
  await btn('market')
  await screenshot('market')
  await btn('market-product','[data-kind="stall"]')
  await btn('market-product','[data-kind="fruit"]')
  await btn('market-sell-species','[data-kind="fruit"][data-species="radish"]')
  await until(async()=>((await snap())?.coins??0)>planted.coins,'market sale')
  const sold=await snap()
  assert.ok(sold.sold)
  assert.equal(sold.basket.length,0)
  assert.equal(await read('document.documentElement.scrollWidth'),width)
  assert.ok(!await read('!!document.querySelector("nav [data-action=mode],.topbar [data-action=sell]")'))
  await btn('close')
  if (!mobile) {
    await grid(0.5,4.5,-70)
    assert.ok(await read('!!document.querySelector("[data-action=market-product]")'),'Market opens from stall roof')
    await btn('close')
    await grid(0.5,2.5,-73)
    assert.match(await read('document.querySelector(".context-inner")?.textContent'),/Теплица|Greenhouse|теплиц/i)
    await btn('close')
  }
  // Save the elapsed interval through the normal production entry point after navigation.
  await read(`(()=>{const s=JSON.parse(localStorage.getItem('${key}')); s.passive.checkpoint=Date.now()-7200000;
    localStorage.setItem('${key}', JSON.stringify(s));return true})()`)
  await menu()
  await btn('enter')
  await until(()=>read('!!document.querySelector(".return-report[open]")'),'offline report')
  const resumed=await snap()
  assert.equal(resumed.plots[12].plant.lives,1)
  assert.equal(resumed.plots[12].plant.progress,1)
  assert.ok(resumed.playTime-sold.playTime<3)
  await screenshot('return')
  // An archived Alpha 07 snapshot exercises only the late-game UI and migration.
  const fixture=await readFile(new URL('../tests/fixtures/alpha07.json',import.meta.url),'utf8')
  await read(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(fixture)})`)
  await menu()
  await btn('enter')
  await until(async()=>(await snap())?.schemaVersion===12,'Alpha 07 migration')
  await btn('evolution')
  assert.ok(await read('!!document.querySelector("[data-production-slot]")'),'Production beds shown after migration')
  await screenshot('greenhouse')
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({scenario,width,height,harvest:start.playTime,sale:sold.playTime,offline:true,externalRequests:0}))
} finally {
  ws.close()
}
