import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const alpha10=process.env.WONDER_TEST_TARGET==='alpha10'
const origin=process.argv[2]??(alpha10?'http://127.0.0.1:4290':'http://127.0.0.1:4285')
const sizes=(process.argv[3]??'1920x1080,1366x768,844x390,390x844,360x800').split(',').filter(Boolean)
const port=Number(process.env.WONDER_TEST_CHROME_PORT??(alpha10?9441:9429))
const resultDir=new URL(`../test-results/${alpha10?'alpha10':'alpha09'}/browser/`,import.meta.url)
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
  await control(`[data-action="${action}"]${extra}`)
}
async function control(css) {
  const selector=JSON.stringify(css)
  const box=await read(`(()=>{
    const candidates=[...document.querySelectorAll(${selector})].filter(e=>!e.disabled)
    for(const element of candidates) {
      element.scrollIntoView({block:'nearest'})
      const b=element.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2
      if(element.contains(document.elementFromPoint(x,y))) return {x,y,w:b.width,h:b.height}
    }
    return null
  })()`)
  assert.ok(box,`Unavailable ${css}: `+await read('document.body.innerText.slice(-1300)'))
  if (touch) assert.ok(box.w>=44 && box.h>=44,`Touch target ${css} is ${box.w}×${box.h}`)
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
  await until(()=>read(`document.querySelector(".menu-card small")?.textContent?.includes("Alpha ${alpha10?'10':'09'}")`),'production menu')
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
async function gardenPoint(gx,gy) {
  const [left,top,width,height]=await read(`(()=>{
    const b=document.querySelector('canvas').getBoundingClientRect()
    return [b.left,b.top,b.width,b.height]
  })()`)
  const zoom=Math.min(width/1190,height/843)*(width<=600?1.45:1)
  return {x:left+width/2+((gx-gy)*64-64)*zoom,y:top+height/2+((gx+gy)*32-302)*zoom}
}
async function bed(index) {
  const {x,y}=await gardenPoint(3+index%4,2+Math.floor(index/4))
  await click(x,y)
}
async function inspectWorld(index) {
  const target=await gardenPoint(3+index%4,2+Math.floor(index/4))
  for (const type of ['mousePressed','mouseReleased'])
    await send('Input.dispatchMouseEvent',{type,...target,button:'right',clickCount:1})
  await wait(160)
}
async function flow(model,size='1366x768') {
  const garden=model.initialState(42)
  garden.tutorialSkipped=true
  garden.passive.checkpoint=Date.now()
  await loadFixture(garden)
  await bed(8)
  await button('repeat-plant-toggle')
  await button('seed','[data-seed="radish"][data-profile]')
  assert.equal((await snap()).seeds.radish,1)
  await until(()=>read('!!document.querySelector("[data-action=repeat-plant-done]") && !document.querySelector(".seed-list")'),'compact repeat-planting panel')
  await screenshot(size,'repeat-planting')
  await bed(9)
  const planted=await snap()
  assert.equal(planted.seeds.radish,0)
  assert.ok(planted.plots[8].plant && planted.plots[9].plant)
  await until(async()=>(await snap()).plots.slice(8,10).every(plot=>plot.plant?.readySince!=null),'two ripe beds')
  await control('.quick-garden-actions > summary')
  await screenshot(size,'batch-actions')
  assert.equal(await read('window.alpha10Audio.themes'),1)
  const tones=await read('window.alpha10Audio.tones')
  await button('gather-ready')
  assert.equal(await read('window.alpha10Audio.tones'),tones+2)
  assert.deepEqual((await snap()).plots.slice(8,10).map(plot=>plot.plant?.lives),[0,0])
  await button('clear-withered')
  assert.deepEqual((await snap()).plots.slice(8,10).map(plot=>plot.plant),[null,null])
  await button('sell-ready-fruit')
  assert.ok((await snap()).coins>20)
  assert.equal((await snap()).basket.length,0)
  await button('settings')
  await button('toggle-indicators')
  assert.equal(await read('JSON.parse(localStorage.getItem("wonder-garden.preferences")).showIndicators'),false)
  await button('toggle-indicators')
}
async function crowdedIsland(model) {
  const garden=model.initialState(42)
  garden.tutorialSkipped=true
  garden.sold=true
  garden.coins=20_000
  for (const plot of [4,5,0,1,2,3,6,7,10,11,14,15])
    assert.equal(model.execute(garden,{type:'clear',plot}).ok,true)
  for (let plot=0;plot<16;plot++)
    assert.equal(model.execute(garden,{type:'plant',plot,species:plot%2 ? 'sunflower' : 'strawberry'}).ok,true)
  garden.passive.checkpoint=Date.now()
  touch=true
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  await send('Emulation.setTouchEmulationEnabled',{enabled:true})
  await loadFixture(garden)
  await screenshot('390x844','crowded-island')
  const sample=await send('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression:`new Promise(resolve=>{
    const frames=[];
    function record(time) {
      frames.push(time);
      if (frames.length<61) requestAnimationFrame(record);
      else resolve(Math.round(60_000/(frames.at(-1)-frames[0])));
    }
    requestAnimationFrame(record);
  })`})
  assert.ok(sample.result.value>0)
  assert.equal(await read('document.elementFromPoint(90,550)?.tagName'),'CANVAS')
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:90,y:550}]})
  for (const point of [{x:120,y:570},{x:155,y:595},{x:195,y:625}])
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]})
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await wait(160)
  const after=await snap()
  assert.deepEqual(after.plots.slice(0,16).map(plot=>plot.plant.id),garden.plots.slice(0,16).map(plot=>plot.plant.id))
  assert.equal(after.basket.length,0)
  assert.equal(await read('!!document.querySelector(".context-inner")'),false)
  await screenshot('390x844','crowded-island-pan')
  console.log(`Crowded island · 16 plants, touch pan, ${sample.result.value} rAF/s in headless Chrome`)
  touch=false
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false})
  await send('Emulation.setTouchEmulationEnabled',{enabled:false})
}
async function advanced() {
  const {createServer}=await import('vite')
  const loader=await createServer({server:{middlewareMode:true,watch:null,hmr:false,ws:false},
    optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'})
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
    if (alpha10) {
      run({type:'clear',plot:1})
      run({type:'plant',plot:1,species:'moonflower'})
    }
    run({type:'researchDirection',plot:8,expectedId:fixture.plots[8].plant.id,recipeId:'solar_strawberry:main'})
    advance(fixture,25)
    fixture.passive.checkpoint=Date.now()
    fixture.failures.moonberry=5
  } finally {
    await loader.close()
  }
  if (alpha10) {
    touch=true
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    await send('Emulation.setTouchEmulationEnabled',{enabled:true})
    await flow(model,'390x844')
    touch=false
    await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false})
    await send('Emulation.setTouchEmulationEnabled',{enabled:false})
    await flow(model)
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
  if (alpha10) {
    const donor=(await snap()).plots[4].plant.id
    await control('.donor-options > summary')
    await button('research-donor',`[data-id="${donor}"]`)
    assert.equal((await snap()).plots[5].plant.researchDonors.moonflower,donor)
    await screenshot('1366x768','specific-donor')
  }
  await button('research-direction','[data-recipe-id="moonberry:alternate"]')
  assert.equal((await snap()).plots[5].plant.pollination.recipeId,'moonberry:alternate')
  if (alpha10) assert.deepEqual((await snap()).plots[5].plant.pollination.donorIds,[(await snap()).plots[4].plant.id])
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
  if (alpha10) {
    await button('close')
    await inspectWorld(12)
    await control('.context-inner details:has([data-action="plot-mode"]) > summary')
    await wait(1300)
    await button('plot-mode','[data-mode="commercial"]')
    assert.equal((await snap()).plots[12].policy.mode,'commercial')
    await screenshot('1366x768','bed-specialization')
  }
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
  if (alpha10) {
    assert.ok(await read(`(()=>{
      const element=document.querySelector('[data-production-slot="0"] [data-production-seed]')
      const seed=[...element.options].find(option=>option.value.startsWith('radish/'))
      if(!seed) return false
      element.value=seed.value
      element.dispatchEvent(new Event('change',{bubbles:true}))
      return true
    })()`))
    await control('[data-production-slot="0"] [data-production="assign"]')
    const producing=await snap()
    assert.equal(producing.passive.beds[0].assignment.species,'radish')
    producing.passive.checkpoint=Date.now()-15*60_000
    await loadFixture(producing)
    await until(()=>read('!!document.querySelector(".return-report[open]")'),'nursery return report')
    assert.ok((await snap()).passive.basket.length)
    await screenshot('1366x768','nursery-return')

    const late=model.initialState(17)
    late.tutorialSkipped=true
    late.sold=true
    late.coins=15_000
    late.planted=model.speciesIds.filter(species=>species!=='star_orchid')
    late.revealed=model.recipes.map(recipe=>recipe.result).filter(species=>species!=='star_orchid')
    for (const plot of [4,5,0,1,2,3,6,7,10,11,14,15]) assert.equal(model.execute(late,{type:'clear',plot}).ok,true)
    assert.equal(model.execute(late,{type:'upgradeGreenhouse',target:2}).ok,true)
    late.passive.checkpoint=Date.now()
    await loadFixture(late)
    await button('evolution')
    await button('greenhouse-upgrade','[data-level="3"]')
    assert.equal((await snap()).greenhouseLevel,3)
    await button('close')
    const {x,y}=await gardenPoint(2,7)
    await click(x,y)
    assert.equal(await read('document.querySelector("[data-action=restore-bridge]")?.disabled'),true)
    await screenshot('1366x768','bridge-requirements')
    await crowdedIsland(model)
  }
  console.log('Advanced production · first hybrid, conflict, alternative, greenhouse II, Leafy, first rarity')
}

try {
  await mkdir(resultDir,{recursive:true})
  for (const domain of ['Page','Runtime','Network']) await send(domain+'.enable')
  if (alpha10) await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    if (!window.alpha10Audio) {
      window.alpha10Audio={themes:0,tones:0};
      for (const [method,key] of [['createBufferSource','themes'],['createOscillator','tones']]) {
        const original=AudioContext.prototype[method];
        AudioContext.prototype[method]=function(...args) {
          window.alpha10Audio[key]++;
          return original.apply(this,args);
        };
      }
    }`})
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
    if (alpha10 && size==='844x390') {
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
      await until(()=>read('innerWidth===390 && document.querySelector(".tutorial-world-ring")?.style.display==="block"'),'portrait spotlight after rotation')
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true})
      await until(()=>read('innerWidth===844 && document.querySelector(".tutorial-world-ring")?.style.display==="block"'),'landscape spotlight after rotation')
    }
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
  const fixture=JSON.parse(await readFile(new URL(`../tests/fixtures/${alpha10?'alpha09':'alpha08'}.json`,import.meta.url),'utf8'))
  await loadFixture(fixture)
  await until(async()=>((await snap())?.schemaVersion===(alpha10?14:13)),alpha10?'Alpha 09 migration':'Alpha 08 migration')
  const migrated=await snap()
  assert.deepEqual(migrated.revealed,fixture.revealed)
  assert.deepEqual(migrated.protectedPlants,fixture.protectedPlants)
  assert.deepEqual(migrated.crosses,fixture.crosses)
  assert.ok(migrated.passive.checkpoint>fixture.passive.checkpoint)
  await until(()=>read('!!document.querySelector(".return-report[open]")'),'offline return report')
  await screenshot(process.env.WONDER_ADVANCED ? '1366x768' : sizes.at(-1)??'1366x768','migration-return')
  assert.equal(errors.length,0,JSON.stringify(errors))
  console.log(`Alpha ${alpha10?'09':'08'} fixture migrated with the active paid experiment and current offline checkpoint`)
} catch (error) {
  if (process.env.WONDER_TRACE_INPUT) {
    try { console.error(await read('window.playtestInput?.slice(-12)')) } catch { /* Keep the original error. */ }
  }
  throw error
} finally {
  socket.close()
}
