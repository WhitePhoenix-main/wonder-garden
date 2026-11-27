// Run against an isolated Chromium profile opened with --remote-debugging-port=9432.
import { mkdir,writeFile } from 'node:fs/promises'
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
  if(m.method==='Runtime.exceptionThrown'||m.method==='Network.loadingFailed'&&!m.params.canceled||
    m.method==='Log.entryAdded'&&m.params.entry.level==='error') errors.push(m.params)
  if(m.method==='Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog',{accept:scenario==='route'})
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
// Collect real crops and sell the basket. The route never changes the garden clock or inventory.
async function earnFromBeds(amount){
  await mode('garden')
  for(let cycle=0;cycle<40;cycle++){
    if((await snap()).basket.length) await btn('sell')
    if((await snap()).coins>=amount) return
    await sleep(6200)
    const state=await snap()
    for(const [index,plot] of state.plots.entries()){
      if(plot.plant?.readySince!=null) await bed(index)
    }
  }
  throw Error('Could not earn '+amount+' coins from garden')
}
async function finishBranches(screenshot){
  await earnFromBeds(120)
  await btn('experiment')
  await btn('branch-seed','[data-seed="clover"]')
  await bed(13)
  assert.equal((await snap()).plots[13].plant.species,'clover')
  await btn('collect')
  for(let n=1;n<=4;n++){
    await sleep(15400);await bed(13)
    assert.equal((await snap()).recipeProgress.honey_clover,n)
  }
  await btn('branch-seed','[data-seed="honey_clover"]');await bed(8)
  assert.equal((await snap()).plots[8].plant.species,'honey_clover')
  assert.match(await read('document.querySelector(".goal-card p").textContent'),/ускоряет размножение/)
  assert.ok(await read('(()=>{const p=document.querySelector(".context"),i=p.querySelector(".context-inner");return i.getBoundingClientRect().bottom<=p.getBoundingClientRect().bottom && i.scrollHeight>i.clientHeight})()'))
  await screenshot('route-honey-clover')
  await earnFromBeds(90)
  await btn('corner');await btn('corner-shovel');await bed(13);await btn('compost');await btn('confirm-compost')
  assert.equal((await snap()).plots[13].plant,null)
  await mode('plant');await seed('radish');await bed(13)
  await btn('decor');await btn('decor-slot','[data-id="northwest"]');await btn('decor-type','[data-id="bench"]')
  const before=await snap()
  assert.ok(await read('document.querySelector("[data-decor-preview]").textContent.includes("80")'))
  assert.equal(before.decorations.length,0)
  await screenshot('route-corner-preview')
  await btn('cancel-decor')
  assert.equal((await snap()).coins,before.coins)
  await btn('decor-type','[data-id="bench"]');await btn('confirm-decor')
  const after=await snap()
  assert.equal(after.coins,before.coins-80)
  assert.ok(after.decorations.some(d=>d.type==='bench' && d.slot==='northwest'))
  await menu();await btn('enter');await btn('experiment');await btn('corner')
  const restored=await snap()
  assert.equal(restored.plots.filter(p=>p.open).length,4)
  assert.equal(restored.plots[8].plant.species,'honey_clover')
  assert.equal(restored.plots[13].plant.species,'radish')
  assert.deepEqual(restored.decorations,after.decorations)
  console.log('Both branches completed on four beds, decor and hybrids restored')
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
  const screenshot=async name=>{
    const shot=await send('Page.captureScreenshot',{format:'png'})
    await mkdir('test-results',{recursive:true})
    await writeFile('test-results/'+name+'.png',Buffer.from(shot.data,'base64'))
  }
  await screenshot(scenario+'-menu')
  if(scenario==='route'){
    assert.equal(await snap(),null,'Use a fresh test profile or a new preview origin')
    await btn('language');await btn('music');await btn('language')
    assert.equal(await snap(),null)
    await btn('enter');await sleep(6700)
    await bed(12);await bed(13);await btn('sell')
    await mode('plant');await seed('radish');await bed(8);await bed(9)
    assert.equal((await snap()).plots.filter(p=>p.plant).length,4)
    await mode('garden')
    for(let n=0;n<12&&(await snap()).coins<160;n++){
      await sleep(6200);for(const i of [8,9,12,13])await bed(i);await btn('sell')
    }
    console.log('Radish sales', (await snap()).coins)
    await mode('plant');await seed('radish');await bed(8)
    assert.equal((await snap()).occupiedHintShown,true)
    assert.ok(await read('!!document.querySelector(".notice")'))
    await menu();await btn('enter');await mode('plant');await seed('radish');await bed(8)
    assert.equal(await read('!!document.querySelector(".notice")'),false)
    await mode('garden');await btn('shovel')
    for(const i of [8,9]){await bed(i);await btn('compost');await btn('cancel-compost');await btn('compost');await btn('confirm-compost')}
    await mode('plant');await seed('strawberry');await bed(8)
    assert.ok(await read('!document.querySelector("nav [data-mode=breed]").disabled'))
    await mode('breed');await mode('plant');await seed('sunflower');await bed(9)
    await mode('breed');await btn('collect')
    for(let n=1;n<=3;n++){await sleep(12300);await bed(8);assert.equal((await snap()).recipeProgress.solar_strawberry,n)}
    await btn('plant-reward');await bed(12)
    assert.ok((await snap()).planted.includes('solar_strawberry'))
    await menu();await btn('enter')
    assert.equal((await snap()).plots.filter(p=>p.open).length,4)
    await finishBranches(screenshot)
  } else if(scenario==='keyboard'){
    async function key(key,code){
      for(const type of ['keyDown','keyUp']) {
        const text=type==='keyDown' && key==='Enter' ? '\r' : ''
        await send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:code,text})
      }
    }
    async function activate(selector){
      for(let i=0;i<100;i++){
        if(await read('document.activeElement.matches('+JSON.stringify(selector)+')')){
          await key('Enter',13);await sleep(120);return
        }
        await key('Tab',9)
      }
      throw Error('Keyboard focus did not reach '+selector)
    }
    await activate('[data-action=enter]')
    await sleep(6500)
    await activate('[data-action=pick-bed][data-id="12"]')
    assert.equal((await snap()).basket.length,1)
    await activate('[data-action=sell]')
    assert.ok((await snap()).sold)
    await activate('[data-action=shovel]')
    await activate('[data-action=pick-bed][data-id="13"]')
    await activate('[data-action=compost]');await activate('[data-action=cancel-compost]')
    assert.equal((await snap()).plots[13].plant.species,'radish')
    await activate('[data-action=settings]');await activate('[data-action=menu]')
    assert.ok(await read('!!document.querySelector("[data-action=enter]")'))
  } else if(scenario==='discoveries'){
    await btn('enter')
    const base=await snap()
    // Fixture immediately before a joint discovery. Real harvests trigger both recipes.
    base.planted=['radish','strawberry','blueberry','moonflower','sunflower']
    base.sold=true
    base.firstHarvest=true
    base.playTime=20
    base.plots.forEach(p=>{p.plant=null})
    for(const [index,species] of [[8,'strawberry'],[9,'sunflower'],[12,'moonflower']]){
      base.plots[index].plant={id:base.nextId++,species,progress:1,mature:true,readySince:10,propagation:0}
    }
    base.recipeProgress.solar_strawberry=2
    base.recipeProgress.moonberry=2
    for(const automatic of [false,true]){
      const state=structuredClone(base)
      if(automatic){state.helperLevel=1;state.harvestRemaining=1}
      const fixture=await send('Page.addScriptToEvaluateOnNewDocument',{source:
        'localStorage.setItem("wonder-garden.save.v1",'+JSON.stringify(JSON.stringify(state))+')'})
      await menu()
      await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:fixture.identifier})
      await btn('enter')
      if(automatic)await sleep(1400)
      else await bed(8)
      assert.deepEqual(await read('Array.from(document.querySelectorAll(".reward [data-action=plant-reward]"),el=>el.dataset.seed)'),['solar_strawberry','moonberry'])
      if(automatic){
        await btn('plant-reward','[data-seed="moonberry"]');await bed(13)
        assert.equal((await snap()).plots[13].plant.species,'moonberry')
        assert.equal((await snap()).seeds.solar_strawberry,1)
      }else{
        await btn('later');await menu();await btn('enter');await mode('plant')
        assert.equal((await snap()).seeds.solar_strawberry,1)
        assert.equal((await snap()).seeds.moonberry,1)
        assert.ok(await read('!document.querySelector("[data-action=seed][data-seed=moonberry]").disabled'))
      }
    }
  } else if(scenario==='migration'){
    await btn('enter')
    const old=await snap()
    old.schemaVersion=4;old.muted=true;old.lang='en'
    delete old.musicMuted;delete old.tutorialSkipped;delete old.occupiedHintShown
    const fixture=await send('Page.addScriptToEvaluateOnNewDocument',{source:
      'localStorage.setItem("wonder-garden.save.v1",'+JSON.stringify(JSON.stringify(old))+')'})
    await menu()
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:fixture.identifier})
    assert.ok(await read('document.body.innerText.includes("Continue garden")'))
    await btn('enter')
    assert.equal((await snap()).musicMuted,true)
    assert.equal((await snap()).schemaVersion,6)
    assert.equal((await snap()).muted,true)
    assert.equal((await snap()).coins,old.coins)
    await btn('skip')
    await menu();await btn('enter')
    assert.equal((await snap()).tutorialSkipped,true)
    assert.equal(await read('!!document.querySelector(".dev-panel")'),false)
    const future=JSON.stringify({...old,schemaVersion:99})
    const protectedFixture=await send('Page.addScriptToEvaluateOnNewDocument',{source:
      'localStorage.setItem("wonder-garden.save.v1",'+JSON.stringify(future)+')'})
    await menu()
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:protectedFixture.identifier})
    assert.ok(await read('!!document.querySelector("[data-action=export-save]")'))
    await btn('enter');await btn('settings');await btn('menu')
    assert.equal(await read('localStorage.getItem("wonder-garden.save.v1")'),future)
  } else if(scenario==='audio') {
    // Dedicated origin. Observe Web Audio, without advancing or replacing the game clock.
    assert.equal(await read('audioProbe.themes'),0)
    await btn('enter')
    await sleep(6500)
    assert.equal(await read('audioProbe.themes'),1)
    await bed(12)
    assert.equal(await read('audioProbe.tones'),2)
    await btn('settings');await btn('sound');await btn('menu')
    assert.equal(await read('audioProbe.contexts[0].state'),'suspended')
    const position=await read('audioProbe.contexts[0].currentTime')
    await sleep(1100)
    assert.equal(await read('audioProbe.contexts[0].currentTime'),position)
    await btn('enter');await bed(13)
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
  } else {
    assert.equal(await read('!!document.querySelector(".dev-panel")'),false)
    await btn('enter');await sleep(6300);await bed(12);await btn('settings');await btn('menu')
    const before=await snap();await sleep(1250);await btn('new-game');await btn('enter')
    assert.deepEqual(await snap(),before)
    if(mobile){
      // Explicit edge-case fixture in the disposable browser profile only.
      await btn('settings');await btn('menu')
      const state=await snap()
      const plant=state.plots.find(p=>p.plant).plant
      state.nursery.push(...state.plots.flatMap(p=>p.plant?[p.plant]:[]))
      state.sold=true
      state.plots.forEach((p,i)=>{
        p.open=true;p.level=1+i%3
        p.plant={...plant,species:'radish',id:state.nextId++,progress:.1,mature:false,readySince:null,propagation:0}
      })
      // Apply the fixture after the previous page's final save and before the new app loads.
      const fixture=await send('Page.addScriptToEvaluateOnNewDocument',{source:
        'localStorage.setItem("wonder-garden.save.v1",'+JSON.stringify(JSON.stringify(state))+')'})
      await menu()
      await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:fixture.identifier})
      await btn('enter')
      assert.equal((await snap()).plots.filter(p=>p.open&&p.plant).length,16)
      await btn('shovel');await bed(12)
      assert.ok(await read('document.querySelector(".context")?.innerText.includes("13")'))
      await screenshot('mobile-full-island')
      await btn('zoomIn');await btn('zoomOut');await btn('zoomOut')
      await btn('zoomOut')
      await screenshot('mobile-full-zoom-out')
      const ids=(await snap()).plots.map(p=>p.plant.id)
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:174,y:400}]})
      await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:212,y:421}]})
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
      assert.deepEqual((await snap()).plots.map(p=>p.plant.id),ids)
      assert.ok(await read('document.querySelector(".context")?.innerText.includes("13")'))
    }
  }
  assert.deepEqual(errors,[])
  console.log(scenario,'passed',await read('navigator.userAgent'))
} finally { ws.close() }

