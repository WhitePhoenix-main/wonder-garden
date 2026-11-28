// Run against an isolated Chromium profile opened with --remote-debugging-port=9432.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const origin=process.argv[2] ?? 'http://127.0.0.1:4273'
const scenario=process.argv[3] ?? 'route'
const browserPort=Number(process.env.WONDER_TEST_CHROME_PORT ?? 9432)
const pages=await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json()
const ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
await new Promise(r=>ws.onopen=r)
let serial=0
const pending=new Map(), errors=[]
ws.onmessage=({data})=>{
  const m=JSON.parse(data)
  if(m.id){pending.get(m.id)(m);pending.delete(m.id)}
  if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error') errors.push(m.params)
  if(m.method==='Runtime.exceptionThrown'||m.method==='Network.loadingFailed'&&!m.params.canceled||
    m.method==='Log.entryAdded'&&m.params.entry.level==='error') errors.push(m.params)
  if(m.method==='Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog',{accept:scenario!=='edge'})
}
async function send(method,params={}) {
  const msg=await new Promise(r=>{pending.set(++serial,r);ws.send(JSON.stringify({id:serial,method,params}))})
  if(msg.error) throw Error(msg.error.message)
  return msg.result
}
async function read(expression){
  const r=await send('Runtime.evaluate',{expression,returnByValue:true})
  if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description)
  return r.result.value
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const snap=()=>read('JSON.parse(localStorage.getItem("wonder-garden.save.v1"))')
const mobile=scenario==='mobile'
async function click(x,y){
  if(mobile){
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  }else{
    for(const type of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1})
  }
  await sleep(120)
}
async function btn(action,extra=''){
  const selector=JSON.stringify('[data-action="'+action+'"]'+extra)
  const xy=await read('(()=>{const e=document.querySelector('+selector+');if(!e||e.disabled)return null;e.scrollIntoView({block:"nearest"});const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]})()')
  assert.ok(xy,action+' unavailable: '+await read('document.body.innerText'))
  await click(...xy)
}
const mode=m=>btn('mode','[data-mode="'+m+'"]'), seed=s=>btn('seed','[data-seed="'+s+'"]')
async function bed(i){
  const [x,y,w,h]=await read('(()=>{const b=document.querySelector("canvas").getBoundingClientRect();return [b.x,b.y,b.width,b.height]})()')
  const z=Math.min(w/1190,h/843)*(mobile?1.45:1), gx=3+i%4,gy=2+Math.floor(i/4)
  await click(x+w/2+((gx-gy)*64-64)*z,y+h/2+((gx+gy)*32-302)*z)
}
async function menu(){
  await send('Page.navigate',{url:origin+(scenario==='route'?'/':'/?debug=1')})
  for(let i=0;i<100;i++){if(await read('!!document.querySelector("[data-action=enter]")'))return;await sleep(120)}
  throw Error('Menu missing '+JSON.stringify(errors))
}
try {
  for(const m of ['Page','Runtime','Log','Network'])await send(m+'.enable')
  await send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1366,height:mobile?844:768,deviceScaleFactor:1,mobile})
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile})
  if(scenario==='audio') await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.audioProbe={themes:0,tones:0,contexts:[]};
    for(const [method,field] of [['createBufferSource','themes'],['createOscillator','tones']]){
      const original=AudioContext.prototype[method];
      AudioContext.prototype[method]=function(...args){
        window.audioProbe[field]++;
        if(!window.audioProbe.contexts.includes(this))window.audioProbe.contexts.push(this);
        return original.apply(this,args)
      }
    }`})
  await menu()
  assert.equal(await snap(),null,'Use a fresh origin')
  assert.equal(await read('!!document.querySelector(".dev-panel")'),false)
  await btn('language')
  assert.match(await read('document.body.innerText'),/Start garden/)
  await btn('enter')
  await btn('collection');await btn('entry','[data-entry="radish"]')
  assert.equal(await read('document.querySelectorAll("meter").length'),3)
  await btn('close')
  if(scenario==='audio'){
    // Dedicated origin. Observe Web Audio, without advancing or replacing the game clock.
    assert.equal(await read('audioProbe.themes'),1)
    await sleep(6500)
    assert.equal(await read('audioProbe.themes'),1)
    await bed(12);await btn('harvest')
    assert.equal(await read('audioProbe.tones'),2)
    await btn('settings');await btn('sound');await btn('menu')
    assert.equal(await read('audioProbe.contexts[0].state'),'suspended')
    const position=await read('audioProbe.contexts[0].currentTime')
    await sleep(1100)
    assert.equal(await read('audioProbe.contexts[0].currentTime'),position)
    await btn('enter');await bed(13);await btn('harvest')
    assert.equal(await read('audioProbe.tones'),2)
    assert.equal(await read('audioProbe.themes'),1)
    assert.equal(await read('audioProbe.contexts[0].state'),'running')
    const target=(await send('Target.getTargetInfo')).targetInfo.targetId
    const other=await send('Target.createTarget',{url:'about:blank'})
    await send('Target.activateTarget',{targetId:other.targetId})
    await sleep(450)
    if(await read('document.hidden')){
      assert.equal(await read('audioProbe.contexts[0].state'),'suspended')
      const frozen=await snap(), audioTime=await read('audioProbe.contexts[0].currentTime')
      await sleep(1400)
      assert.equal(await read('audioProbe.contexts[0].currentTime'),audioTime)
      await send('Target.activateTarget',{targetId:target});await sleep(200)
      assert.equal(await read('audioProbe.contexts[0].state'),'running')
      await btn('settings');await btn('menu')
      assert.ok((await snap()).playTime-frozen.playTime<1)
      console.log('Visibility pause/resume verified')
    } else console.log('Headless browser did not hide original tab')
    await send('Target.closeTarget',{targetId:other.targetId})
    await menu()
    assert.deepEqual([(await snap()).musicMuted,(await snap()).muted],[false,true])
  }else if(scenario==='edge'){
    await btn('skip')
    await menu();await btn('enter')
    assert.equal((await snap()).tutorialSkipped,true)
    const legacy=JSON.parse(await readFile(new URL('../tests/fixtures/alpha02.json',import.meta.url),'utf8'))
    async function install(state){
      const fixture=await send('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.setItem("wonder-garden.save.v1",'+JSON.stringify(JSON.stringify(state))+')'})
      await menu();await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:fixture.identifier})
      await btn('enter')
    }
    await install(legacy)
    const migrated=await snap()
    assert.equal(migrated.schemaVersion,7);assert.equal(migrated.failures.moonberry,1)
    assert.deepEqual(migrated.basket,legacy.basket)
    const plant=migrated.plots[12].plant
    Object.assign(plant,{rarity:'rare',plus:'seedy',minus:'sparse',lives:1})
    await install(migrated)
    const before=await snap()
    await bed(12);await btn('harvest')
    assert.equal((await snap()).rng,before.rng);assert.equal((await snap()).plots[12].plant.lives,1)
    await btn('seed-harvest')
    assert.equal((await snap()).plots[12].plant,null)
    await btn('close')
    await btn('collection');await btn('entry','[data-entry="radish"]')
    await btn('filter','[data-filter="hybrids"]')
    assert.equal(await read('document.querySelectorAll("[data-action=entry]").length'),6)
    await btn('close')
  }else if(scenario==='keyboard'){
    async function activate(selector){
      for(let i=0;i<150;i++){
        const active=await read('document.activeElement.matches('+JSON.stringify(selector)+')')
        const key=active?'Enter':'Tab'
        for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:active?13:9,text:active&&type==='keyDown'?'\r':''})
        if(active)return
      }
      throw Error('Cannot reach '+selector)
    }
    await sleep(6400);await activate('[data-action=pick-bed][data-id="12"]');await activate('[data-action=harvest]');await activate('[data-action=sell]')
    assert.ok((await snap()).sold)
  }else{
    await btn('settings');await btn('language');await btn('close')
    await sleep(6400)
    async function fruit(i){await bed(i);await btn('harvest');await btn('close')}
    await fruit(12);await fruit(13);await btn('sell')
    await mode('plant');await seed('radish');await bed(8);await bed(9)
    assert.equal((await snap()).plots.filter(p=>p.plant).length,4)
    await mode('garden')
    for(let cycle=0;(await snap()).coins<150 && cycle<18;cycle++){
      await sleep(6300);for(const i of [8,9,12,13])await fruit(i);await btn('sell')
    }
    await btn('shovel')
    for(const i of [8,9]){await bed(i);await btn('compost');await btn('cancel-compost');await btn('compost');await btn('confirm-compost')}
    await mode('plant');await seed('strawberry');await bed(8);await seed('sunflower');await bed(9)
    await mode('garden');await sleep(9200);await bed(8);await btn('experiment-harvest')
    const t=(await snap()).playTime
    await menu();await btn('enter');await btn('plant-reward');await bed(12)
    assert.equal((await snap()).plots[12].plant.species,'solar_strawberry')
    await mode('garden');await btn('shovel');await bed(12);await btn('store')
    if(mobile)await btn('nursery')
    else {
      const [x,y,w,h]=await read('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()')
      const z=Math.min(w/1190,h/843)
      await click(x+w/2-192*z,y+h/2-206*z)
    }
    let stored=(await snap()).nursery.find(p=>p.species==='solar_strawberry')
    await btn('nursery-return','[data-id="'+stored.id+'"]');await bed(12)
    await mode('garden');await sleep(15600);await fruit(12)
    const before=await snap()
    await menu();await btn('enter')
    assert.deepEqual((await snap()).basket,before.basket)
    assert.equal((await snap()).plots[12].plant.lives,stored.lives-1)
    assert.equal(before.plots.filter(p=>p.open).length,4)
    await btn('experiment');assert.match(await read('document.querySelector(".goal-card p").textContent'),/120/)
    await btn('corner');await btn('corner-shovel');assert.equal(await read('document.querySelector(".shovel").getAttribute("aria-pressed")'),'true')
    console.log('First hybrid',Math.round(t),'s. Four beds, greenhouse round trip, harvest and reload passed.')
  }
  assert.equal(await read('!!document.querySelector(".dev-panel")'),false)
  assert.deepEqual(errors,[])
  console.log(scenario,'passed, no page, console or network errors')
}finally{ws.close()}
