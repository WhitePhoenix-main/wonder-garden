import { profileKey, sameProfile } from '../../game/genetics'
import { isBusy } from '../../game/greenhouse'
import type { GameState, Lang, Profile, Result, Species } from '../../game/model'
import { productionCapacity, productionCount, productionLevel, productionModesFor, productionStatus,
  seedProductionCapacity, seedProductionCount } from '../../game/nursery'
import type { ReturnReport } from '../../game/offline'
import { allSeedPacks } from '../../game/stock-policy'
import type { UIActions } from '../../runtime/presentation'
import { describe } from '../specimens'
import { plantName } from '../strings'
import './production.css'

const copy={
  ru:{title:'Грядки питомника',unlock:'Откроются на II уровне теплицы.',basket:'Запас плодов',hours:'ч офлайн',collect:'Забрать продукцию',
    bed:'Грядка',seed:'Выберите семена',start:'Запустить',stop:'Остановить',store:'Вернуть в хранилище',move:'Перенести из хранилища',
    fruit:'Накопление плодов',seeds:'Выращивание на семена',wholesale:'Оптовая продажа',idle:'Остановлена',protected:'Экземпляр защищён',
    full:'Запас плодов заполнен',growing:'Растёт',reserve:'Семена защищены или в резерве',empty:'Закончились семена',ready:'Готова к посеву',
    return:'Пока вас не было',away:'Время отсутствия',processed:'Время работы питомника',coins:'Монеты оптом',spent:'Семян посеяно',
    experiments:'Готовые опыты и клоны',ripe:'Созрело растений в саду',close:'В сад',seedCount:'Семена доступны',minutes:'мин'},
  en:{title:'Nursery beds',unlock:'Unlocks at greenhouse level II.',basket:'Stored fruit',hours:'h offline',collect:'Collect production',
    bed:'Bed',seed:'Choose seeds',start:'Start',stop:'Stop',store:'Return to storage',move:'Move from storage',
    fruit:'Store fruit',seeds:'Produce seeds',wholesale:'Sell wholesale',idle:'Stopped',protected:'Plant is protected',
    full:'Fruit storage is full',growing:'Growing',reserve:'Seeds are protected or reserved',empty:'Out of seeds',ready:'Ready to sow',
    return:'While you were away',away:'Time away',processed:'Nursery time processed',coins:'Wholesale coins',spent:'Seeds sown',
    experiments:'Experiments and clones ready',ripe:'Garden plants ripened',close:'Back to the garden',seedCount:'Seeds available',minutes:'min'}
}

export function productionPanel(state:GameState):string {
  const w=copy[state.lang]
  const name=(p:Profile & {species:Species})=>plantName(state.lang,p.species)+' · '+describe(state.lang,p)
  const stock=allSeedPacks(state).filter(p=>state.planted.includes(p.species))
  const modes=productionModesFor(state)
  const level=productionLevel(state)
  if (!level.beds) return `<h3>${w.title}</h3><p>${w.unlock}</p>`
  const cards=state.passive.beds.map(({assignment,plant},slot)=>{
    const status=productionStatus(state,slot)
    const id=`production-${slot}`
    const choices=plant ? [plant] : stock
    const options=choices.map(pack=>`<option value="${profileKey(pack.species,pack)}" ${assignment && pack.species===assignment.species &&
      sameProfile(pack,assignment.profile)?'selected':''}>${name(pack)}${'count' in pack?' ×'+pack.count:''}</option>`).join('')
    const stored=state.nursery.filter(p=>!isBusy(state,p.id))
    return `<section class="production-bed" data-production-slot="${slot}">
      <h4>${w.bed} ${slot+1} ${plant ? '· '+name(plant) : ''}</h4>
      <p>${w[status.reason]} ${plant ? '· '+Math.floor(plant.progress*20)*5+'% · '+plant.lives+'/'+plant.maxLives+(state.lang==='ru'?' сборов':' harvests'):''}
      ${assignment ? '· '+w.seedCount+' '+status.available+'/'+status.stock:''}</p>
      <label>${w.seed}<select id="${id}-seed" data-production-seed><option value="">—</option>${options}</select></label>
      <select aria-label="${w.title}" data-production-mode>${modes.map(m=>`<option value="${m}" ${assignment?.mode===m?'selected':''}>${w[m==='seed'?'seeds':m]}</option>`).join('')}</select>
      <button type="button" data-production="assign" ${choices.length?'':'disabled'}>${w.start}</button>
      ${assignment ? `<button type="button" data-production="stop">${w.stop}</button>` : ''}
      ${plant ? `<button type="button" data-production="out" data-id="${plant.id}">${w.store}</button>` : stored.length ?
        `<label>${w.move}<select data-production-plant>${stored.map(p=>`<option value="${p.id}">${name(p)} #${p.id}</option>`).join('')}</select></label>
        <button type="button" data-production="in">${w.move}</button>`:''}
    </section>`
  })
  return `<h3>${w.title}</h3><p>${w.basket} ${productionCount(state)}/${productionCapacity(state)} · ${level.hours} ${w.hours}</p>
    ${modes.includes('seed') ? `<p>${w.seeds} · ${seedProductionCount(state)}/${seedProductionCapacity(state)}</p>` : ''}
    <button type="button" data-production="collect" ${state.passive.basket.length || state.passive.seeds.length?'':'disabled'}>${w.collect}</button>
    <div class="production-grid">${cards.join('')}</div>`
}

export function productionAction(event:Event,actions:UIActions,state:GameState):Result|undefined {
  if (!(event.target instanceof Element)) return
  const button=event.target.closest<HTMLButtonElement>('button[data-production]')
  if (!button) return
  if (button.dataset.production==='collect') return actions.command({type:'collectProduction'})
  const group=button.closest<HTMLElement>('[data-production-slot]')
  if (!group) return
  const slot=Number(group.dataset.productionSlot)
  switch(button.dataset.production) {
    case 'stop': return actions.command({type:'assignProduction',slot,assignment:null})
    case 'out': return actions.command({type:'moveProduction',slot,id:Number(button.dataset.id),direction:'out'})
    case 'in': return actions.command({type:'moveProduction',slot,id:Number(group.querySelector<HTMLSelectElement>('[data-production-plant]')?.value),direction:'in'})
    case 'assign': {
      const key=group.querySelector<HTMLSelectElement>('[data-production-seed]')?.value
      const mode=productionModesFor(state).find(m=>m===group.querySelector<HTMLSelectElement>('[data-production-mode]')?.value)
      if (!key || !mode) return {ok:false,reason:'noSeeds'}
      const pack=state.passive.beds[slot].plant ?? allSeedPacks(state).find(p=>profileKey(p.species,p)===key)
      if (pack) return actions.command({type:'assignProduction',slot,assignment:{species:pack.species,profile:pack,mode}})
      return {ok:false,reason:'noSeeds'}
    }
  }
}

export function showReturnReport(report:ReturnReport,lang:Lang):void {
  const w=copy[lang]
  const time=(seconds:number)=>seconds<60 ? Math.ceil(seconds)+(lang==='ru'?' с':' s') : Math.round(seconds/60)+' '+w.minutes
  document.querySelector('.return-report')?.remove()
  const modal=document.createElement('dialog')
  modal.className='return-report'
  modal.setAttribute('aria-labelledby','return-report-heading')
  const row=(label:string,value:number|string)=>value ? `<dt>${label}</dt><dd>${value}</dd>` : ''
  const stops=[...new Set(report.stops)].filter(s=>s==='empty'||s==='reserve'||s==='full'||s==='protected')
  modal.innerHTML=`<h2 id="return-report-heading">${w.return}</h2><dl>
    ${row(w.away,time(report.absent))}${row(w.processed,report.workedSeconds ? time(report.workedSeconds):0)}
    ${row(w.basket,report.fruit)}${row(w.seeds,report.seeds)}${row(w.coins,report.coins)}
    ${row(w.spent,report.spent)}${row(w.experiments,report.experiments)}${row(w.ripe,report.ready)}
    </dl>${stops.length ? `<p>${stops.map(s=>w[s]).join(' · ')}</p>`:''}
    <form method="dialog"><button type="submit" autofocus>${w.close}</button></form>`
  modal.addEventListener('close',()=>modal.remove(),{once:true})
  document.body.append(modal)
  modal.showModal()
}
