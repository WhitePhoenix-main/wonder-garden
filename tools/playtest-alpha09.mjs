import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const origin=process.argv[2]??'http://127.0.0.1:4285'
const sizes=(process.argv[3]??'1920x1080,1366x768,844x390,390x844,360x800').split(',').filter(Boolean)
const port=Number(process.env.WONDER_TEST_CHROME_PORT??9429)
const resultDir=new URL('../test-results/alpha09/browser/',import.meta.url)
const key='wonder-garden.save.v1'
const tabs=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const tab=tabs.find(page=>page.type==='page' && page.url.startsWith(origin))??tabs.find(page=>page.type==='page')
const socket=new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
const pending=new Map()
const errors=[]
let nextId=1
let touch=false
socket.onmessage=({data})=>{
  const event=JSON.parse(data)
  if (event.id) {
    pending.get(event.id)?.(event)
    pending.delete(event.id)
  }
  if (event.method==='Runtime.exceptionThrown' || event.method==='Runtime.consoleAPICalled' && event.params.type==='error')
    errors.push(event)
  if (event.method==='Network.requestWillBeSent' && /^https?:/.test(event.params.request.url) &&
      new URL(event.params.request.url).origin!==origin) errors.push(event)
  if (event.method==='Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog',{accept:true})
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function send(method,params={}) {
  const id=nextId++
  const message=await new Promise((resolve,reject)=>{
    const detail=typeof params.expression==='string' ? ' '+params.expression.slice(0,100) : ''
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error(`No CDP response for ${method}${detail}`))},15000)
    pending.set(id,result=>{clearTimeout(timeout);resolve(result)})
    socket.send(JSON.stringify({id,method,params}))
  })
  if (message.error) throw Error(`${method}: ${message.error.message}`)
  return message.result
}
async function read(expression) {
  const reply=await send('Runtime.evaluate',{expression,returnByValue:true})
  if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description??expression)
  return reply.result.value
}
const snap=()=>read(`JSON.parse(localStorage.getItem('${key}'))`)
const step=()=>read('document.querySelector(".tutorial-card")?.dataset.tutorialId')
async function until(check,label,time=13000) {
  const end=Date.now()+time
  do {
    if (await check()) return
    await wait(125)
  } while (Date.now()<end)
  throw Error(`Timed out while checking ${label} (${await step()})`)
}
async function click(x,y) {
  if (touch) {
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  } else for (const type of ['mousePressed','mouseReleased'])
    await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1})
  await wait(160)
}
async function button(action,extra='') {
  const selector=JSON.stringify(`[data-action="${action}"]${extra}`)
  const box=await read(`(()=>{
    const candidates=[...document.querySelectorAll(${selector})].filter(e=>!e.disabled)
    for(const element of candidates) {
      element.scrollIntoView({block:'nearest'})
      const b=element.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2
      if(element.contains(document.elementFromPoint(x,y))) return {x,y,w:b.width,h:b.height}
    }
    return null
  })()`)
  assert.ok(box,`Unavailable ${action}${extra}: `+await read('document.body.innerText.slice(-1300)'))
  if (touch) assert.ok(box.w>=44 && box.h>=44,`Touch target ${action} is ${box.w}×${box.h}`)
  await click(box.x,box.y)
}
async function highlightedBed(plant=false) {
  const target=await read(`(()=>{
    const ring=document.querySelector('.tutorial-world-ring')
    const b=ring?.getBoundingClientRect()
    if(!b||b.width<12)return null
    const x=b.x+b.width/2,y=b.bottom-b.height*${plant ? 34/113 : 34/66}
    return {x,y,hit:document.elementFromPoint(x,y)?.tagName}
  })()`)
  assert.equal(target?.hit,'CANVAS',`Spotlight must expose the canvas. ${JSON.stringify(target)}`)
  await click(target.x,target.y)
}
async function screenshot(size,label) {
  const shot=await send('Page.captureScreenshot',{format:'png'})
  await writeFile(new URL(`${size}-${label}.png`,resultDir),Buffer.from(shot.data,'base64'))
}
async function menu() {
  await send('Page.navigate',{url:origin+'/?debug=1'})
  await until(()=>read('document.querySelector(".menu-card small")?.textContent?.includes("Alpha 09")'),'production menu')
  assert.equal(await read('!!document.querySelector(".dev-panel")'),false)
}
async function enter() {
  await button('enter')
  await until(()=>read('!!document.querySelector("canvas")'),'Phaser')
  if (process.env.WONDER_TRACE_INPUT) await read(`(()=>{
    window.playtestInput=[]
    for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture'])
      document.addEventListener(type,e=>window.playtestInput.push([type,e.pointerType,e.button,e.clientX,e.clientY,e.target.tagName,e.target.className]),true)
    return true
  })()`)
}
async function waitForStage(stage) {
  await until(async()=>await step()===stage,stage)
}

async function loadFixture(fixture) {
  await read(`localStorage.setItem('${key}',${JSON.stringify(JSON.stringify(fixture))})`)
  await menu()
  await enter()
}
async function bed(index) {
  const [left,top,width,height]=await read(`(()=>{
    const b=document.querySelector('canvas').getBoundingClientRect()
    return [b.left,b.top,b.width,b.height]
  })()`)
  const zoom=Math.min(width/1190,height/843)
  const gx=3+index%4, gy=2+Math.floor(index/4)
  await click(left+width/2+((gx-gy)*64-64)*zoom,top+height/2+((gx+gy)*32-302)*zoom)
}
async function advanced() {
  const {createServer}=await import('vite')
  const loader=await createServer({server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom'})
  let fixture
  let model
  try {
    model=await loader.ssrLoadModule('/src/game/index.ts')
    const {initialState,execute,advance}=model
    fixture=initialState(42)
    fixture.coins=6500
    fixture.tutorialSkipped=true
    const run=command=>{
      const result=execute(fixture,command)
      assert.equal(result.ok,true,JSON.stringify({command,result}))
    }
    run({type:'plant',plot:12,species:'radish',stock:{rarity:'common',plus:[],minus:null}})
    advance(fixture,6)
    run({type:'harvest',plot:12,expectedId:fixture.plots[12].plant.id,cycle:1})
    run({type:'cleanup',plot:12,expectedId:fixture.plots[12].plant.id})
    run({type:'sell'})
    for (const plot of [4,5]) run({type:'clear',plot})
    for (const [plot,species] of [[8,'strawberry'],[9,'sunflower'],[5,'blueberry'],[4,'moonflower']])
      run({type:'plant',plot,species})
    run({type:'researchDirection',plot:8,expectedId:fixture.plots[8].plant.id,recipeId:'solar_strawberry:main'})
    advance(fixture,25)
    fixture.passive.checkpoint=Date.now()
    fixture.failures.moonberry=5
  } finally {
    await loader.close()
  }
  await loadFixture(fixture)
  await bed(8)
  await button('inventory')
  const batch=(await snap()).basket.find(batch=>batch.pollination?.result==='solar_strawberry')
  assert.ok(batch)
  await button('inventory-detail',`[data-key="h${batch.id}"]`)
  await button('inventory-extract')
  assert.ok((await snap()).revealed.includes('solar_strawberry'))
  await until(()=>read('!!document.querySelector(".discovery")'),'discovery window')
  await screenshot('1366x768','discovery')
  await button('later')
  if (await read('!!document.querySelector("[data-action=close]")')) await button('close')
  await bed(12)
  await button('seed','[data-seed="solar_strawberry"][data-profile]')
  assert.ok((await snap()).planted.includes('solar_strawberry'))
  if (await read('!!document.querySelector("[data-action=close]")')) await button('close')
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1})
  await read('document.querySelector(".ready-inspect").open=true')
  await button('inspect-bed','[data-id="5"]')
  assert.equal(await read('document.querySelectorAll("[data-action=research-direction]").length'),2)
  await screenshot('1366x768','conflicting-directions')
  await button('research-direction','[data-recipe-id="moonberry:alternate"]')
  assert.equal((await snap()).plots[5].plant.pollination.recipeId,'moonberry:alternate')
  await button('harvest')
  if (await read('!!document.querySelector("[data-action=close]")')) await button('close')
  await button('inventory')
  const alternate=(await snap()).basket.find(batch=>batch.pollination?.recipeId==='moonberry:alternate')
  await button('inventory-detail',`[data-key="h${alternate.id}"]`)
  await button('inventory-extract')
  assert.ok((await snap()).research.recipes['moonberry:alternate'].successes)
  await button('later')
  if (await read('!!document.querySelector("[data-action=close]")')) await button('close')
  await button('evolution')
  await button('greenhouse-upgrade','[data-level="2"]')
  assert.equal((await snap()).greenhouseLevel,2)
  await button('close')
  await button('helper')
  await button('upgrade-helper','[data-level="1"]')
  assert.equal((await snap()).helperLevel,1)
  await until(async()=>Boolean((await snap()).basket.find(batch=>batch.species==='sunflower')),'Leafy harvest')
  const lab=await snap()
  const run=command=>{
    const result=model.execute(lab,command)
    assert.equal(result.ok,true,JSON.stringify({command,result}))
  }
  for (const plot of [9,13]) {
    const previous=lab.plots[plot].plant
    if (previous) run({type:previous.lives ? 'store' : 'cleanup',plot,expectedId:previous.id})
    run({type:'plant',plot,species:'radish'})
    run({type:'store',plot,expectedId:lab.plots[plot].plant.id})
  }
  lab.rarityProgress['radish/uncommon']=5
  run({type:'startCross',parents:lab.nursery.filter(plant=>plant.species==='radish').map(plant=>plant.id)})
  const experiment=lab.crosses.at(-1)
  model.advance(lab,experiment.readyAt-lab.playTime+0.1)
  lab.passive.checkpoint=Date.now()
  await loadFixture(lab)
  await button('evolution')
  await button('cross-collect',`[data-id="${experiment.id}"]`)
  assert.ok((await snap()).variants.find(seed=>seed.species==='radish' && seed.rarity==='uncommon'))
  assert.ok((await snap()).tutorialSeen.includes('notice-rarity-uncommon'))
  await screenshot('1366x768','first-rarity')
  console.log('Advanced production · first hybrid, conflict, alternative, greenhouse II, Leafy, first rarity')
}

try {
  await mkdir(resultDir,{recursive:true})
  for (const domain of ['Page','Runtime','Network']) await send(domain+'.enable')
  for (const size of sizes) {
    const [width,height]=size.split('x').map(Number)
    touch=width<900
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch})
    await send('Emulation.setTouchEmulationEnabled',{enabled:touch})
    await send('Storage.clearDataForOrigin',{origin,storageTypes:'local_storage'})
    await menu()
    await enter()
    await waitForStage('welcome')
    const start=await snap()
    assert.equal(start.coins,20)
    assert.equal(start.seeds.radish,2)
    assert.equal(start.plots.filter(plot=>plot.plant).length,0)
    assert.equal(await read('document.documentElement.scrollWidth > innerWidth'),false)
    await button('tutorial-next')
    await waitForStage('first-plant')
    await wait(250)
    if (size==='360x800') {
      await read(`(()=>{
        const cover=document.createElement('div')
        cover.id='test-temporary-cover'
        cover.style='position:fixed;inset:0;z-index:1000'
        document.body.append(cover)
        return true
      })()`)
      await until(()=>read('document.querySelector(".tutorial-world-ring")?.style.display==="none"'),'temporarily covered target')
      await read('document.getElementById("test-temporary-cover").remove()')
      await until(()=>read('document.querySelector(".tutorial-world-ring")?.style.display==="block"'),'target available again')
    }
    await screenshot(size,'empty-garden')
    await highlightedBed()
    await button('seed','[data-seed="radish"][data-profile]')
    assert.equal((await snap()).seeds.radish,1)
    await menu()
    await enter()
    await until(async()=>Boolean((await snap()).plots.find(plot=>plot.plant?.readySince!=null)),'ripe radish')
    await waitForStage('first-harvest')
    await screenshot(size,'first-harvest')
    await highlightedBed(true)
    assert.equal((await snap()).plots.find(plot=>plot.plant)?.plant.lives,0)
    await waitForStage('cleanup')
    await highlightedBed(true)
    await waitForStage('first-sale')
    await button('market')
    await button('market-sell-species','[data-species="radish"]')
    assert.equal((await snap()).sold,true)
    if (await read('!!document.querySelector(".context-inner [data-action=close]")')) await button('close')
    else if (await read('!!document.querySelector("[data-action=close]")')) await button('close')
    await waitForStage('second-plant')
    await highlightedBed()
    await button('seed','[data-seed="radish"][data-profile]')
    await until(async()=>Boolean((await snap()).plots.find(plot=>plot.plant?.readySince!=null)),'second ripe radish')
    await waitForStage('second-harvest')
    await highlightedBed(true)
    await waitForStage('extract')
    await button('inventory')
    if (!(await read('!!document.querySelector("[data-action=inventory-extract]")'))) await button('inventory-detail')
    await button('inventory-extract')
    assert.equal((await snap()).firstExtraction,true)
    await screenshot(size,'first-seeds')
    if (await read('!!document.querySelector("[data-action=close]")')) await button('close')
    await button('skip')
    assert.equal((await snap()).tutorialSkipped,true)
    await menu()
    await enter()
    assert.equal(await step(),undefined)
    console.log(`${size} ${touch?'touch':'mouse'} · start, reload, two harvests, market, extraction, skip`)
  }
  if (process.env.WONDER_ADVANCED) {
    touch=false
    await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false})
    await send('Emulation.setTouchEmulationEnabled',{enabled:false})
    await send('Storage.clearDataForOrigin',{origin,storageTypes:'local_storage'})
    await menu()
    await advanced()
  }
  const fixture=JSON.parse(await readFile(new URL('../tests/fixtures/alpha08.json',import.meta.url),'utf8'))
  await loadFixture(fixture)
  await until(async()=>((await snap())?.schemaVersion===13),'Alpha 08 migration')
  const migrated=await snap()
  assert.deepEqual(migrated.revealed,fixture.revealed)
  assert.deepEqual(migrated.protectedPlants,fixture.protectedPlants)
  assert.deepEqual(migrated.crosses,fixture.crosses)
  assert.ok(migrated.passive.checkpoint>fixture.passive.checkpoint)
  await until(()=>read('!!document.querySelector(".return-report[open]")'),'offline return report')
  await screenshot(process.env.WONDER_ADVANCED ? '1366x768' : sizes.at(-1)??'1366x768','migration-return')
  assert.equal(errors.length,0,JSON.stringify(errors))
  console.log('Alpha 08 fixture migrated with the active paid experiment and current offline checkpoint')
} catch (error) {
  if (process.env.WONDER_TRACE_INPUT) {
    try { console.error(await read('window.playtestInput?.slice(-12)')) } catch { /* Keep the original error. */ }
  }
  throw error
} finally {
  socket.close()
}
