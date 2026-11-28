import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

const origin=new URL(process.argv[2]??'http://127.0.0.1:4284').origin
const port=Number(process.env.WONDER_TEST_CHROME_PORT??9442)
const suite=process.argv[3]??'all'
assert.ok(['all','layout','breeding','trading','gestures'].includes(suite),'Unknown browser suite')
const key='wonder-garden.save.v1'
const resultDir=new URL('../test-results/alpha07-browser/',import.meta.url)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const viewports=[[360,800,true],[390,844,true],[412,915,true],[768,1024,true],[844,390,true],[1366,768,false],[1920,1080,false]]
let mobile=false

const debuggerOrigin=`http://127.0.0.1:${port}`
const page=await (await fetch(debuggerOrigin+'/json/new?about:blank',{method:'PUT'})).json()
assert.ok(page.webSocketDebuggerUrl,'Start a dedicated Chromium debugging session')
const socket=new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
const pending=new Map(), errors=[]
let serial=0
socket.onmessage=({data})=>{
  const event=JSON.parse(data)
  if (event.id) {
    pending.get(event.id)?.(event)
    pending.delete(event.id)
  }
  if (event.method==='Runtime.exceptionThrown' ||
      event.method==='Runtime.consoleAPICalled' && event.params.type==='error' ||
      event.method==='Log.entryAdded' && event.params.entry.level==='error' ||
      event.method==='Network.loadingFailed' && !event.params.canceled) errors.push(event)
  if (event.method==='Network.requestWillBeSent') {
    const url=new URL(event.params.request.url)
    if (['http:','https:'].includes(url.protocol) && url.origin!==origin) errors.push(event)
  }
}

async function send(method,params={}) {
  const id=++serial
  const response=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method))},10_000)
    pending.set(id,message=>{clearTimeout(timeout);resolve(message)})
    socket.send(JSON.stringify({id,method,params}))
  })
  if (response.error) throw new Error(method+' '+response.error.message)
  return response.result
}

async function read(expression) {
  const reply=await send('Runtime.evaluate',{expression,returnByValue:true})
  if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description)
  return reply.result.value
}

async function until(check,label,ms=22_000) {
  const deadline=Date.now()+ms
  do {
    if (await check()) return
    await pause(125)
  } while (Date.now()<deadline)
  throw new Error('Timed out: '+label)
}

const snap=()=>read(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`)
const id=value=>`[data-id="${value}"]`
const action=(label,extra='')=>`[data-action="${label}"]${extra}`
const query=selector=>`document.querySelector(${JSON.stringify(selector)})`
const textContent=selector=>read(`${query(selector)}?.textContent`)

async function touch(type,points) { await send('Input.dispatchTouchEvent',{type,touchPoints:points}) }

async function click(x,y) {
  if (mobile) {
    await touch('touchStart',[{x,y}])
    await touch('touchEnd',[])
  } else {
    for (const type of ['mousePressed','mouseReleased'])
      await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1})
  }
  await pause(130)
}

async function button(label,extra='') {
  const selector=action(label,extra)
  const target=await read(`(()=>{
    const element=${query(selector)};
    if(!element || element.disabled) return null;
    element.scrollIntoView({block:'center',inline:'nearest'});
    const r=element.getBoundingClientRect();
    const x=r.left+r.width/2, y=r.top+r.height/2;
    return {x,y,width:r.width,height:r.height,hit:element.contains(document.elementFromPoint(x,y))};
  })()`)
  assert.ok(target?.hit,'Button is unavailable: '+selector+' '+JSON.stringify(target))
  if (mobile) assert.ok(target.width>=44 && target.height>=44,'Touch target smaller than 44 px: '+selector+' '+JSON.stringify(target))
  await click(target.x,target.y)
}

async function choose(selector,value) {
  await read(`(()=>{const element=${query(selector)};element.value=${JSON.stringify(value)};
    element.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await pause(130)
}

async function enter(fixture) {
  const install=fixture&&await send('Page.addScriptToEvaluateOnNewDocument',{
    source:`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(fixture))})`
  })
  const navigation=await send('Page.navigate',{url:origin+'/?debug=1'})
  assert.equal(navigation.errorText,undefined)
  await until(()=>read(`!!${query(action('enter'))}`),'main menu')
  if (install) await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:install.identifier})
  assert.equal(await read('!!document.querySelector(".dev-panel")'),false)
  await button('enter')
  await until(()=>read('!!document.querySelector("canvas")'),'canvas')
}

async function screenshot(label) {
  const {data}=await send('Page.captureScreenshot',{format:'png'})
  await writeFile(new URL(label+'.png',resultDir),Buffer.from(data,'base64'))
}

async function enableViewport(width,height,touchscreen) {
  mobile=touchscreen
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile,
    screenOrientation:height>=width ? {type:'portraitPrimary',angle:0} : {type:'landscapePrimary',angle:90}})
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:mobile?5:1})
}

async function fixture() {
  const loader=await createServer({server:{middlewareMode:true,watch:null,ws:false},appType:'custom'})
  try {
    const {initialState,newPlant}=await loader.ssrLoadModule('/src/game/state.ts')
    const {validState}=await loader.ssrLoadModule('/src/persistence/validation.ts')
    const {evolution,market}=await loader.ssrLoadModule('/src/game/config.ts')
    const {marketQuote}=await loader.ssrLoadModule('/src/game/market.ts')
    const {execute}=await loader.ssrLoadModule('/src/game/commands.ts')
    const state=initialState(42)
    state.coins=35_000
    const command=input=>assert.equal(execute(state,input).ok,true,JSON.stringify(input))
    state.revealed=['solar_strawberry']
    state.planted.push('strawberry','sunflower')
    state.sold=true
    state.tutorialSkipped=true
    state.firstHarvest=true
    state.lang='ru'
    state.basket.push({id:state.nextId++,species:'radish',count:5,valueUnits:40000,profile:null,pollination:null,
      lots:[{size:5,remaining:5,seedYield:0,copyChance:0,copyPending:false,crossPending:false}]})
    for (const target of [2,3,4,5]) command({type:'upgradeGreenhouse',target})
    command({type:'upgradeHelper',target:1})
    for (const target of [2,3,4]) command({type:'upgradeStall',target})
    state.automation.enabled=false
    state.automation.sellFruit=false
    state.orderRefreshAt=10
    state.market.goods.radish.fruit.saturated=market.capacity.radish.fruit
    assert.equal(marketQuote(state,'radish','fruit').pricePercent,70)
    const rare={rarity:'rare',plus:['quality'],minus:null}
    const epic={rarity:'epic',plus:['early','seedy'],minus:'small'}
    state.nursery=[rare,epic,epic,epic,rare].map(profile=>newPlant(state.nextId++,'radish',profile))
    state.variants=[rare,epic].map(profile=>({species:'radish',...profile,count:3}))
    state.rarityProgress['radish/legendary']=evolution.rarityGuarantee-1
    assert.equal(validState(state),true)
    const legacy=structuredClone(state)
    const gesture=structuredClone(state)
    gesture.plots[9].plant=newPlant(gesture.nextId++,'radish',rare)
    for (const index of [9,12,13]) Object.assign(gesture.plots[index].plant,{progress:1,mature:true,readySince:0})
    assert.equal(validState(gesture),true)
    command({type:'startCross',parents:state.nursery.slice(0,2).map(p=>p.id)})
    legacy.crosses=structuredClone(state.crosses)
    legacy.coins=state.coins
    legacy.rng=state.rng
    legacy.nextId=state.nextId
    legacy.schemaVersion=10
    delete legacy.clones
    delete legacy.rarityProgress
    delete legacy.trading
    return {state:{...state,crosses:[],rarityProgress:{'radish/legendary':evolution.rarityGuarantee-1}},legacy,gesture}
  } finally { await loader.close() }
}

async function layout(state,width,height,touchscreen) {
  await enableViewport(width,height,touchscreen)
  await enter(state)
  assert.equal(await read('innerWidth'),width,await read(`JSON.stringify(Array.from(document.querySelectorAll('#ui *'))
    .filter(e=>e.getBoundingClientRect().right>${width})
    .slice(0,12).map(e=>[e.localName,e.className,e.textContent.slice(0,24),e.getBoundingClientRect().right]))`))
  assert.equal(await read('innerHeight'),height)
  assert.equal(await read('document.documentElement.scrollWidth'),width)
  await button('evolution')
  await button('cross-parent',id(state.nursery[0].id))
  await button('cross-parent',id(state.nursery[1].id))
  assert.match(await textContent('.context-inner'),/Легендарный 100%/)
  const scroll=await read('document.querySelector(".context-inner").scrollHeight')
  assert.ok(scroll>0)
  await screenshot(width+'x'+height+'-breeding')
  await button('close')
  await button('inventory')
  await button('inventory-tab','[data-tab="seeds"]')
  assert.equal(await read('document.querySelectorAll(".inventory-card").length'),2)
  const keys=await read('Array.from(document.querySelectorAll("[data-action=inventory-select]"),e=>e.dataset.key)')
  for (const key of keys) await button('inventory-select',`[data-key="${key}"]`)
  assert.match(await textContent('.context-inner'),/Сравнение/)
  await button('close')
  if (width===390 || width===844) {
    await send('Emulation.setSafeAreaInsetsOverride',{insets:{top:16,bottom:24,left:18,right:18}})
    try {
      const boxes=await read(`(()=>{
        const header=document.querySelector('.topbar').getBoundingClientRect()
        const navigation=document.querySelector('.modes').getBoundingClientRect()
        return {top:header.top,left:header.left,right:header.right,bottom:navigation.bottom}
      })()`)
      assert.ok(boxes.top>=16 && boxes.left>=18 && boxes.right<=width-18 && boxes.bottom<=height-24)
      assert.equal(await read('innerWidth'),width)
      await screenshot(width+'x'+height+'-safe-area')
    } finally { await send('Emulation.setSafeAreaInsetsOverride',{insets:{}}) }
  }
  console.log(`${width}×${height} layout, greenhouse odds, inventory comparison, panel scrolling and targets`)
}

async function breeding(state) {
  await enableViewport(390,844,true)
  await enter(state)
  const [rare,epic,a,b,cloneParent]=state.nursery
  await button('evolution')
  await button('cross-parent',id(rare.id))
  await button('cross-parent',id(epic.id))
  await button('cross-start')
  const paid=(await snap()).crosses[0]
  assert.equal(paid.profile.rarity,'legendary')
  assert.equal((await snap()).rarityProgress['radish/legendary'],undefined)
  await button('cross-parent',id(a.id))
  await button('cross-parent',id(b.id))
  assert.match(await textContent('.context-inner'),/Показаны базовые шансы/)
  await button('cross-start')
  await button('cross-parent',id(cloneParent.id))
  await button('clone-start',id(cloneParent.id))
  const afterStart=await snap()
  assert.equal(afterStart.crosses.length,2)
  assert.equal(afterStart.clones.length,1)
  assert.equal(await read(`${query(action('cross-parent',id(cloneParent.id)))}.disabled`),true)
  await enter()
  assert.deepEqual((await snap()).crosses,afterStart.crosses)
  assert.deepEqual((await snap()).clones,afterStart.clones)
  assert.equal((await snap()).rng,afterStart.rng)
  await button('evolution')
  await until(()=>read(`!!${query(action('cross-collect',id(paid.id)))}`),'cross completion')
  assert.match(await textContent('.breeding-legendary'),/Мутации/)
  await screenshot('legendary-result')
  await button('cross-collect',id(paid.id))
  assert.ok((await snap()).crosses[0].collected)
  const clone=afterStart.clones[0]
  await until(()=>read(`!!${query(action('clone-collect',id(clone.id)))}`),'clone completion',34_000)
  await screenshot('clone-ready')
  await button('clone-collect',id(clone.id))
  const collected=await snap()
  assert.deepEqual(collected.nursery.find(p=>p.id===cloneParent.id),cloneParent)
  assert.equal(collected.variants.find(pack=>pack.rarity==='rare').count,4)
  assert.equal(collected.clones.length,0)
  await enter()
  assert.equal((await snap()).variants.find(pack=>pack.rarity==='rare').count,4)
  console.log('390×844 paid guarantee, hidden forecast, parallel cross and clone, reload and single claim')
}

async function trading(state,legacy) {
  await enableViewport(1366,768,false)
  await enter(legacy)
  const migrated=await snap()
  assert.equal(migrated.schemaVersion,11)
  for (const property of ['crosses','rng','coins','basket','market']) assert.deepEqual(migrated[property],legacy[property],property)
  assert.deepEqual(migrated.rarityProgress,{})
  assert.equal(migrated.trading.strategy,'quick')
  assert.equal(await read('document.querySelector(".menu-screen")'),null)

  const trade=structuredClone(state)
  trade.market.remaining=15
  trade.sellRemaining=4
  await enter(trade)
  await button('evolution')
  await button('helper')
  await choose('[data-sale-strategy]','custom')
  await choose('[data-sale-minimum]','120')
  await button('automation-toggle','[data-setting="sellFruit"]')
  await pause(4200)
  assert.equal((await snap()).basket.length,1,'below-threshold stock was sold')
  assert.equal((await snap()).coins,trade.coins)
  await enter()
  assert.equal((await snap()).trading.minimum,120)
  await button('evolution')
  await button('helper')
  await choose('[data-sale-strategy]','quick')
  await until(async()=>!(await snap()).basket.length,'automatic sale')
  assert.ok((await snap()).coins>trade.coins)
  console.log('1366×768 schema 10 migration, active experiment, custom quote, policy reload and auto-sale')
}

async function gestures(state) {
  await enableViewport(390,844,true)
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await enter(state)
  await pause(300)
  await button('center')
  const [x,y,width,height]=await read(`(()=>{
    const r=document.querySelector('canvas').getBoundingClientRect();
    return [r.x,r.y,r.width,r.height]
  })()`)
  const zoom=Math.min(width/1190,height/843)
  function bed(index) {
    const gx=3+index%4, gy=2+Math.floor(index/4)
    return {x:x+width/2+((gx-gy)*64-64)*zoom,y:y+height/2+((gx+gy)*32-302)*zoom}
  }
  for (const index of [9,12,13]) {
    const p=bed(index)
    assert.equal(await read(`document.elementFromPoint(${p.x},${p.y})?.tagName`),'CANVAS')
  }
  await screenshot('390x844-before-sweep')
  await read(`(()=>{
    window.gestureTrace=[]
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click'])
      window.addEventListener(type,e=>window.gestureTrace.push([type,e.pointerId,e.target.tagName,e.clientX,e.clientY]),true)
  })()`)
  await touch('touchStart',[{...bed(12),id:0}])
  await pause(80)
  await touch('touchMove',[{...bed(13),id:0}])
  await pause(80)
  await touch('touchMove',[{...bed(9),id:0}])
  await pause(80)
  await touch('touchEnd',[])
  await pause(250)
  const swept=await snap()
  assert.deepEqual([12,13].map(i=>swept.plots[i].plant?.id??null),[null,null],JSON.stringify({
    width,height,trace:await read('window.gestureTrace'),plots:[9,12,13].map(i=>[i,bed(i),swept.plots[i].plant?.id??null])
  }))
  assert.deepEqual((await snap()).plots[9].plant,state.plots[9].plant)
  await screenshot('390x844-sweep')

  const capture=async()=> (await send('Page.captureScreenshot',{format:'png',
    clip:{x:20,y:450,width:240,height:260,scale:1}})).data
  const beforePan=await capture()
  await touch('touchStart',[{x:90,y:610}])
  await touch('touchMove',[{x:167,y:658}])
  await touch('touchEnd',[])
  await pause(200)
  const afterPan=await capture()
  assert.notEqual(afterPan,beforePan)
  const pair=[{x:85,y:570,id:0},{x:205,y:632,id:1}]
  await touch('touchStart',[pair[0]])
  await touch('touchStart',pair)
  await touch('touchMove',[{x:48,y:543,id:0},{x:253,y:660,id:1}])
  await touch('touchEnd',[])
  await pause(200)
  assert.notEqual(await capture(),afterPan)
  await screenshot('390x844-pinch')
  assert.equal((await snap()).plots[9].plant.id,state.plots[9].plant.id)
  console.log('390×844 swipe harvest, protected specimen, camera pan and two-finger zoom')
}

try {
  await mkdir(resultDir,{recursive:true})
  for (const domain of ['Page','Runtime','Log','Network']) await send(domain+'.enable')
  await send('Page.bringToFront')
  const {state,legacy,gesture}=await fixture()
  if (suite==='all' || suite==='layout') {
    for (const size of viewports) await layout(state,...size)
  }
  if (suite==='all' || suite==='breeding') await breeding(state)
  if (suite==='all' || suite==='trading') await trading(state,legacy)
  if (suite==='all' || suite==='gestures') await gestures(gesture)
  assert.deepEqual(errors,[])
} finally {
  socket.close()
  await fetch(debuggerOrigin+'/json/close/'+page.id)
}
