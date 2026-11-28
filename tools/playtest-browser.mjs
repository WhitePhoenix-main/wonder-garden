import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const origin = process.argv[2] ?? 'http://127.0.0.1:4284'
const scenario = process.argv[3] ?? 'desktop'
const suite = process.argv[4] ?? 'intro'
assert.ok(['desktop','mobile'].includes(scenario),'Expected desktop or mobile')
assert.ok(['intro','advanced','market','all'].includes(suite),'Expected intro, advanced, market or all')
const mobile = scenario === 'mobile'
const width = mobile ? 390 : 1366
const height = mobile ? 844 : 768
const resultDir = new URL('../test-results/',import.meta.url)
const browserPort = Number(process.env.WONDER_TEST_CHROME_PORT ?? 9424)
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
const mode=m=>btn('mode',`[data-mode="${m}"]`)
const tab=id=>btn('inventory-tab',`[data-tab="${id}"]`)
const batchAttr=id=>`[data-id="${id}"]`
const itemKey=id=>`[data-key="h${id}"]`
const ready=plots=>until(async()=>(await snap()).plots.every((b,i)=>!plots.includes(i)||b.plant?.readySince!=null),`ripe beds ${plots}`)
async function bed(i) {
  const [x,y,w,h]=await read('(()=>{const b=document.querySelector("canvas").getBoundingClientRect();return [b.x,b.y,b.width,b.height]})()')
  const zoom=Math.min(w/1190,h/843)*(mobile?1.45:1)
  const gx=3+i%4, gy=2+Math.floor(i/4)
  const px=x+w/2+((gx-gy)*64-64)*zoom, py=y+h/2+((gx+gy)*32-302)*zoom
  const hit=await read(`document.elementFromPoint(${px},${py})?.tagName`)
  assert.equal(hit,'CANVAS',`Bed ${i} is covered by UI at ${px}, ${py}`)
  await click(px,py)
}
async function menu() {
  await send('Page.navigate',{url:origin+'/?debug=1'})
  await until(()=>read('!!document.querySelector("[data-action=enter]")'),'menu')
  assert.equal(await read('!!document.querySelector(".dev-panel")'),false)
}
async function screenshot(label) {
  const shot=await send('Page.captureScreenshot',{format:'png'})
  await writeFile(new URL(`alpha07-${scenario}-${label}.png`,resultDir),Buffer.from(shot.data,'base64'))
}
async function buy(id,plot) {
  await btn('seed',`[data-seed="${id}"]:not([data-profile])`)
  await bed(plot)
  assert.equal((await snap()).plots[plot].plant.species,id)
}
async function install(state) {
  const script=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(state))})`})
  await menu()
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier})
  await btn('enter')
}
async function stress(state) {
  state.basketLevel=3
  while (state.basket.length<60) {
    const id=state.nextId++
    state.basket.push({id,species:'radish',valueUnits:40000+id,count:20,profile:null,pollination:null,
      lots:[{size:20,remaining:20,seedYield:0,copyChance:0,copyPending:false,crossPending:false}]})
  }
  for (const species of ['radish','strawberry','sunflower','solar_strawberry']) {
    for (const rarity of ['uncommon','rare']) {
      for (const plus of ['early','seedy','fruitful']) {
        for (const minus of [null,'small','sparse']) state.variants.push({species,rarity,plus:[plus],minus,count:17})
      }
    }
    for (const trait of ['quality','stable']) for (const minus of [null,'small']) {
      state.variants.push({species,rarity:'uncommon',plus:[trait],minus,count:8})
    }
  }
  await install(state)
  assert.equal((await snap()).basket.length,state.basket.length)
  await btn('inventory');await tab('harvest')
  assert.equal(await read('document.querySelectorAll(".inventory-card").length'),12)
  await screenshot('harvest-stress')
  await tab('seeds')
  assert.equal(await read('document.querySelectorAll(".inventory-card").length'),12)
  await btn('inventory-page','[data-page="1"]')
  assert.ok(await read('document.querySelectorAll(".inventory-card").length')>=8)
  await btn('inventory-page','[data-page="0"]')
  await btn('inventory-detail')
  await screenshot('seed-stress')
  const card=await read('document.querySelector(".inventory-card").getBoundingClientRect().width')
  assert.ok(card>230 && card<width)
  assert.equal(await read('!!document.querySelector(".camera")'),false)
  await read(`(()=>{
    const el=document.querySelector('[data-inventory-filter]');
    el.value='rare';el.dispatchEvent(new Event('change',{bubbles:true}));
  })()`)
  assert.equal(await read('document.querySelectorAll(".inventory-card").length'),12)
  await read(`(()=>{const el=document.querySelector('[data-inventory-search]');el.value='редис';el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  const selected='[data-key="sradish-rare-early-null"]'
  await btn('inventory-all',selected)
  const before=(await snap()).coins
  await btn('inventory-sell-s',selected)
  assert.equal((await snap()).coins,before, 'Selling the last genetic profile is protected')
  await btn('inventory-all',selected)
  await btn('inventory-minus',selected)
  const total=Number((await read('document.querySelector(\'[data-action=inventory-sell-s][data-key=sradish-rare-early-null]\').textContent')).match(/\d+/)[0])
  await btn('inventory-sell-s',selected)
  assert.equal((await snap()).coins-before,total)
  assert.equal((await snap()).variants.find(p=>p.species==='radish'&&p.rarity==='rare'&&p.plus.includes('early')&&p.minus===null).count,1)
  await btn('close')
  assert.equal(await read('document.documentElement.scrollWidth'),width)
}

async function advancedState() {
  const {createServer}=await import('vite')
  const loader=await createServer({server:{middlewareMode:true,watch:null,hmr:{port:browserPort+10000}},appType:'custom'})
  try {
    const {initialState,newPlant}=await loader.ssrLoadModule('/src/game/state.ts')
    const {speciesIds}=await loader.ssrLoadModule('/src/game/config.ts')
    const {hybridIds}=await loader.ssrLoadModule('/src/game/model.ts')
    const {common,changeStock}=await loader.ssrLoadModule('/src/game/genetics.ts')
    const {recordPlanting}=await loader.ssrLoadModule('/src/game/collection.ts')
    const {execute}=await loader.ssrLoadModule('/src/game/commands.ts')
    const {validState}=await loader.ssrLoadModule('/src/persistence/validation.ts')
    const state=initialState(42)
    state.coins=15000
    state.sold=true
    state.planted=[...speciesIds]
    state.revealed=[...hybridIds]
    state.tutorialSkipped=true
    state.firstHarvest=true
    state.firstExtraction=true
    state.firstSeedPlanting=true
    state.firstPropagation=true
    state.plots.forEach((plot,index)=>{
      plot.open=true
      plot.plant=speciesIds[index] ? newPlant(state.nextId++,speciesIds[index]) : null
      if (plot.plant) recordPlanting(state,plot.plant)
    })
    for(let i=0;i<2;i++) state.nursery.push(newPlant(state.nextId++,'radish'))
    execute(state,{type:'upgradeHelper',target:1})
    execute(state,{type:'upgradeStall',target:2})
    execute(state,{type:'upgradeStall',target:3})
    execute(state,{type:'setAutomation',settings:{...state.automation,enabled:false}})
    changeStock(state,'radish',common,6)
    changeStock(state,'radish',{rarity:'rare',plus:['early'],minus:null},3)
    changeStock(state,'radish',{rarity:'epic',plus:['early','quality'],minus:null},3)
    state.orders=[{id:state.nextId++,buyer:'botanist',reward:24,requirements:[{kind:'seed',species:'radish',rarity:'common',count:2}]}]
    state.orderRefreshAt=12
    assert.equal(validState(state),true,'advanced setup must pass the production save validator')
    return state
  } finally {
    await loader.close()
  }
}

async function advanced() {
  const fixture=await advancedState()
  await install(fixture)
  await btn('evolution')
  await btn('greenhouse-upgrade','[data-level="2"]')
  assert.equal((await snap()).greenhouseLevel,2)
  for (const parent of fixture.nursery) await btn('cross-parent',batchAttr(parent.id))
  await btn('cross-start')
  const cross=(await snap()).crosses[0]
  assert.deepEqual(cross.parents,fixture.nursery.map(plant=>plant.id))
  await menu()
  await btn('enter')
  assert.deepEqual((await snap()).crosses[0],cross)
  await btn('evolution')
  await until(()=>read('!!document.querySelector("[data-action=cross-collect]")'),'completed experiment')
  await btn('cross-collect',batchAttr(cross.id))
  assert.equal((await snap()).crosses[0].collected,true)
  assert.equal(await read('!!document.querySelector("[data-action=cross-collect]")'),false)
  await screenshot('greenhouse')

  const [order]=fixture.orders
  const before=await snap()
  await btn('order-complete',batchAttr(order.id))
  const paid=await snap()
  assert.equal(paid.coins,before.coins+order.reward)
  assert.equal(paid.seeds.radish,before.seeds.radish-2)
  assert.equal(paid.ordersCompleted,1)

  await btn('restore-bridge')
  assert.equal((await snap()).plots.length,24)
  await btn('travel-valley')
  assert.equal((await snap()).activeIsland,'valley')
  if (await read('!!document.querySelector(".context [data-action=close]")')) await btn('close')
  assert.equal(await read('!!document.querySelector(".context")'),false)
  await screenshot('valley')
  await btn('evolution')
  await btn('travel-green')
  assert.equal((await snap()).activeIsland,'green')
  if (await read('!!document.querySelector(".context [data-action=close]")')) await btn('close')

  const policyPlot=11
  await mode('garden')
  await bed(policyPlot)
  const id=(await snap()).plots[policyPlot].plant.id
  await btn('plot-mode','[data-mode="seed"]')
  assert.equal((await snap()).plots[policyPlot].policy.mode,'seed')
  await btn('plant-protect',batchAttr(id))
  assert.ok((await snap()).protectedPlants.includes(id))
  assert.ok((await snap()).plots[policyPlot].policy.replant)
  await btn('plot-replant')
  assert.equal((await snap()).plots[policyPlot].policy.replant,null)
  await btn('plot-replant')
  assert.equal((await snap()).plots[policyPlot].policy.replant.species,fixture.plots[policyPlot].plant.species)
  await btn('close')
  if (!await read('Array.from(document.querySelectorAll("[data-action=helper]")).some(e=>e.getClientRects().length)')) await btn('evolution')
  await btn('helper')
  await btn('automation-toggle','[data-setting="replant"]')
  assert.equal((await snap()).automation.replant,true)
  await btn('close')

  await btn('inventory')
  await tab('seeds')
  const rareKey='[data-key="sradish-rare-early-null"]'
  const epicKey='[data-key="sradish-epic-early,quality-null"]'
  await btn('inventory-select',rareKey)
  await btn('inventory-select',epicKey)
  assert.equal(await read('document.querySelectorAll(".inventory-context .collection-matrix tbody tr").length'),8)
  const rareProtect='[data-seed="radish"][data-profile*="rare"][data-profile*="early"]'
  await btn('profile-protect',rareProtect)
  const stocks=await snap()
  await btn('bulk-sell')
  const sold=await snap()
  assert.equal(sold.variants.find(p=>p.rarity==='rare' && p.plus.join()==='early').count,
    stocks.variants.find(p=>p.rarity==='rare' && p.plus.join()==='early').count)
  assert.equal(sold.variants.find(p=>p.rarity==='epic').count,stocks.variants.find(p=>p.rarity==='epic').count-1)
  await btn('inventory-select',epicKey)
  await btn('inventory-all',epicKey)
  await btn('bulk-plant')
  assert.equal((await snap()).plots.filter(p=>p.plant?.rarity==='epic').length,2)
  await btn('close')
  await btn('collection')
  assert.equal(await read('document.querySelectorAll(".collection-matrix tbody td").length'),60)
  await btn('entry','[data-entry="radish"]')
  assert.match(await read('document.querySelector(".context").innerText'),/Изученные профили|Studied profiles/)
  assert.match(await read('document.querySelector(".context").innerText'),/Рекорды характеристик|Trait records/)
  assert.equal(await read('document.documentElement.scrollWidth'),width)
  await btn('close')
  assert.deepEqual(errors,[])
  console.log(scenario,`${width}×${height}`,'Alpha 05 seeded route passed (greenhouse, reload, orders, valley, protection, automation, comparison, bulk, collection)')
}

async function intro() {
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.audioProbe={themes:0,tones:0};
    for(const [method,key] of [['createBufferSource','themes'],['createOscillator','tones']]){
      const original=AudioContext.prototype[method];
      AudioContext.prototype[method]=function(...args){audioProbe[key]++;return original.apply(this,args)};
    }`})
  await menu()
  assert.equal(await snap(),null,'Use a fresh isolated origin and profile')
  if (!mobile) {
    await btn('language')
    assert.match(await read('document.body.innerText'),/Start garden/)
  }
  await btn('enter')
  await ready([12,13])
  const start=await snap(), tones=await read('audioProbe.tones')
  await bed(12);await bed(13)
  const gathered=await snap()
  assert.equal(gathered.coins,start.coins)
  assert.equal(gathered.plots[12].plant,null)
  assert.equal(gathered.plots[13].plant,null)
  assert.equal(gathered.basket.length,1)
  assert.equal(await read('!!document.querySelector(".inventory-context")'),false)
  assert.equal(await read('audioProbe.tones'),tones+4)
  await bed(13)
  assert.deepEqual((await snap()).basket,gathered.basket)
  const crop=gathered.basket[0]
  await btn('inventory');await tab('harvest')
  await btn('inventory-detail',itemKey(crop.id))
  await btn('profile-protect','[data-seed="radish"]')
  assert.equal((await snap()).protectedProfiles.length,1)
  await btn('profile-protect','[data-seed="radish"]')
  assert.equal((await snap()).protectedProfiles.length,0)
  await btn('inventory-detail',itemKey(crop.id))
  await btn('inventory-plus',itemKey(crop.id))
  assert.match(await read('document.querySelector(".inventory-quantity span").textContent'),/^2 /)
  await btn('inventory-minus',itemKey(crop.id))
  await btn('inventory-sell-h',batchAttr(crop.id))
  assert.equal((await snap()).basket[0].count,crop.count-1)
  assert.equal((await snap()).coins,start.coins+4)
  await btn('inventory-all',itemKey(crop.id))
  await btn('inventory-extract',batchAttr(crop.id))
  const extracted=await snap()
  assert.equal(extracted.basket.length,0)
  assert.ok(extracted.seeds.radish>=3)
  await tab('seeds');await btn('inventory-plant','[data-seed="radish"]')
  await bed(12);await bed(13)
  assert.equal((await snap()).seeds.radish,extracted.seeds.radish-2)
  console.log(scenario,'first sale, bulk extraction and planting:',(await snap()).playTime.toFixed(1),'s')

  const target=mobile?120:370
  const farmPlots=mobile?[12,13]:[8,9,12,13]
  if (!mobile) {
    await buy('radish',8)
    await buy('radish',9)
  }
  while ((await snap()).coins<target) {
    await mode('garden')
    await ready(farmPlots)
    for (const plot of farmPlots) await bed(plot)
    await btn('sell')
    if ((await snap()).coins>=target) break
    await mode('plant')
    await btn('seed','[data-seed="radish"]:not([data-profile])')
    for (const plot of farmPlots) await bed(plot)
  }
  console.log(scenario,'parent and upgrade budget reached:',(await snap()).playTime.toFixed(1),'s')
  await mode('plant')
  await buy('strawberry',8);await buy('sunflower',9)
  if (!mobile) {
    await mode('build');await bed(8);await btn('upgrade')
    assert.equal((await snap()).plots[8].level,2)
  }
  await mode('garden')
  await ready([8,9])
  const before=await snap()
  await bed(9);await bed(8)
  const crossed=await snap()
  assert.equal(crossed.coins,before.coins)
  assert.equal(crossed.plots[9].plant,null)
  assert.equal(crossed.plots[8].plant.lives,before.plots[8].plant.lives-1)
  const selected=crossed.basket.find(b=>b.pollination?.result==='solar_strawberry')
  assert.equal(selected?.pollination.donor.species,'sunflower')
  await menu();await btn('enter')
  assert.deepEqual((await snap()).basket,crossed.basket)
  await btn('inventory');await tab('harvest')
  await btn('inventory-detail',itemKey(selected.id))
  await screenshot('pollinated')
  await btn('inventory-all',itemKey(selected.id))
  await btn('inventory-extract',batchAttr(selected.id))
  assert.equal((await snap()).seeds.solar_strawberry,1)
  await btn('plant-reward')
  await bed(13)
  const planted=await snap()
  assert.equal(planted.plots[13].plant.species,'solar_strawberry')
  console.log(scenario,'first hybrid planted:',planted.playTime.toFixed(1),'s')
  await mode('garden')
  await ready([8])
  await bed(8)
  assert.equal((await snap()).plots[8].plant.lives,crossed.plots[8].plant.lives-1)
  const repeated=await snap()
  await menu();await btn('enter')
  assert.deepEqual((await snap()).basket,repeated.basket)

  if (mobile) await stress(await snap())
  const legacy=JSON.parse(await readFile(new URL('../tests/fixtures/alpha03.json',import.meta.url),'utf8'))
  await install(legacy)
  const migrated=await snap()
  assert.equal(migrated.schemaVersion,11)
  assert.equal(migrated.coins,legacy.coins)
  assert.equal(migrated.basket.reduce((sum,b)=>sum+b.count,0),legacy.basket.length)
  assert.equal(migrated.basket.every(b=>b.profile===null && b.pollination===null),true)
  const alpha04=JSON.parse(await readFile(new URL('../tests/fixtures/alpha04.json',import.meta.url),'utf8'))
  await install(alpha04)
  const restored=await snap()
  assert.equal(restored.schemaVersion,11)
  assert.equal(restored.coins,alpha04.coins)
  assert.equal(restored.stallLevel,2)
  assert.equal(restored.helperLevel,alpha04.helperLevel)
  assert.equal(restored.plots[8].plant.pollination.donor.species,'sunflower')
  assert.equal(await read('!!document.querySelector(".dev-panel")'),false)
  assert.deepEqual(errors,[])
  console.log(scenario,`${width}×${height}`,'passed; no browser, console or resource errors')
}

async function market() {
  const alpha05=JSON.parse(await readFile(new URL('../tests/fixtures/alpha05.json',import.meta.url),'utf8'))
  await install(alpha05)
  const migrated=await snap()
  assert.equal(migrated.schemaVersion,11)
  assert.equal(migrated.coins,alpha05.coins)
  assert.equal(migrated.activeIsland,'valley')
  assert.deepEqual(migrated.orders,alpha05.orders)
  assert.deepEqual(migrated.crosses,alpha05.crosses)
  assert.deepEqual(migrated.basket,alpha05.basket)
  assert.equal(migrated.market.tick,0)

  migrated.automation.sellFruit=false
  migrated.basketLevel=1
  const add=(count)=>{
    const id=migrated.nextId++
    migrated.basket.push({id,species:'radish',count,valueUnits:40000,profile:null,pollination:null,
      lots:[{size:count,remaining:count,seedYield:0,copyChance:0,copyPending:false,crossPending:false}]})
    return id
  }
  const shipment=add(120)
  const later=add(8)
  await install(migrated)
  await btn('inventory')
  await btn('market')
  const price=()=>read('Number(document.querySelector(\'[data-market-species="radish"] [data-market-price]\').dataset.marketPrice)')
  assert.equal(await price(),100)
  await btn('close')
  await btn('inventory')
  await btn('inventory-all',itemKey(shipment))
  await btn('inventory-sell-h',batchAttr(shipment))
  const sale=await snap()
  assert.equal(sale.coins,migrated.coins+480)
  assert.equal(sale.market.goods.radish.fruit.delivered,120)
  await btn('market')
  await until(async()=>await price()===70,'radish fruit market saturation',18000)
  await screenshot('market')
  await btn('market-product','[data-kind="seed"]')
  assert.equal(await price(),100)
  await btn('close')
  await btn('inventory')
  await btn('inventory-all',itemKey(later))
  const selector=JSON.stringify(`[data-action="inventory-sell-h"]${batchAttr(later)}`)
  const buttonValue=await read(`document.querySelector(${selector}).textContent`)
  assert.match(buttonValue,/22/)
  await btn('inventory-sell-h',batchAttr(later))
  const settled=await snap()
  assert.equal(settled.coins,sale.coins+22)
  await menu();await btn('enter')
  const resumed=await snap()
  assert.equal(resumed.market.tick,settled.market.tick)
  assert.deepEqual(resumed.market.goods,settled.market.goods)
  assert.ok(resumed.market.remaining<=settled.market.remaining)
  assert.equal(await read('document.documentElement.scrollWidth'),width)
  assert.deepEqual(errors,[])
  console.log(scenario,`${width}×${height}`,'Alpha 06 market passed (schema 9 migration, saturation, price, seed isolation and reload)')
}

try {
  await mkdir(resultDir,{recursive:true})
  for (const domain of ['Page','Runtime','Log','Network']) await send(domain+'.enable')
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile})
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile})
  if (suite==='intro' || suite==='all') await intro()
  if (suite==='advanced' || suite==='all') await advanced()
  if (suite==='market' || suite==='all') await market()
} finally {
  ws.close()
}
