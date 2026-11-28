import type { GameState, Hybrid, Lang, Recipe } from '../../game/model'
import { researchStatus } from '../../game/queries'
import { adjacent, speciesInfo } from '../../game'

const hints: Record<Hybrid, [string, string]> = {
  solar_strawberry: ['Красные ягоды тянутся к цветку, похожему на солнце.', 'Red berries reach for a flower shaped like the sun.'],
  moonberry: ['Красные ягоды впитывают свет лунного цветка.', 'Red berries drink the light of a moonflower.'],
  honey_clover: ['Солнечное тепло наполняет листья клевера мёдом.', 'Sunlight fills clover leaves with honey.'],
  golden_flower: ['В синих ягодах под лунным светом зреет золото.', 'Gold ripens inside blue berries under moonlight.'],
  crystal_flower: ['Лунные ягоды и золото встречаются на плодородной земле.', 'Moonberries and gold meet in rich soil.'],
  star_orchid: ['Ищите звезду там, где кристалл растёт между медовыми листьями и солнечными плодами.', 'Crystal, honey leaves and sunlit fruit meet on enchanted ground.']
}

export function recipeKnown(s: GameState, r: Recipe) {
  return [r.primary,...r.neighbors].every(id => s.planted.includes(id))
}

const labels = {
  ru: {mystery:'Неизвестный вид', explore:'Изучайте растения, чтобы найти подсказку.', harvest:'Собирать', neighbors:'Соседи по стороне', bed:'Уровень грядки', count:'Подходящие сборы', revealed:'Рецепт открыт'},
  en: {mystery:'Unknown species', explore:'Study more plants to find a clue.', harvest:'Harvest', neighbors:'Adjacent plants', bed:'Bed level', count:'Matching harvests', revealed:'Recipe discovered'}
} satisfies Record<Lang, Record<string,string>>

function adjacencyDiagram(ru:boolean):string {
  const sample=(diagonal:boolean,label:string)=>{
    const cells=Array.from({length:4},(_,i)=>i===0 ? 'mother' : i===(diagonal?3:1) ? 'donor' : '')
    return `<div><span class="pollination-grid" aria-hidden="true">${cells.map(cell=>`<i class="${cell}"></i>`).join('')}</span><small>${label}</small></div>`
  }
  return `<figure class="pollination-diagram"><figcaption>${ru?'Клубника и подсолнечник':'Strawberry and sunflower'}</figcaption>
    ${sample(false,ru?'✓ Общая сторона':'✓ Shared edge')}
    ${sample(true,ru?'× Диагональ':'× Diagonal')}</figure>`
}

export function recipeCard(s: GameState, r: Recipe, selected: number|null) {
  const w = labels[s.lang]
  const name = (id: keyof typeof speciesInfo) => s.lang === 'ru' ? speciesInfo[id].nameRu : speciesInfo[id].nameEn
  const status=researchStatus(s,r.result)
  if (!status.labelKnown) {
    const someKnown = [r.primary,...r.neighbors].some(id => s.planted.includes(id))
    const clue = someKnown ? hints[r.result][s.lang === 'ru' ? 0 : 1] : w.explore
    return `<section class="recipe-card"><h3>◇ · ${w.mystery}</h3><p>${clue}</p></section>`
  }
  const plot = selected === null ? null : s.plots[selected]
  const neighbors = selected === null ? [] : adjacent(selected).map(i => s.plots[i].plant?.species)
  const mark = (met:boolean) => plot ? (met ? ' ✓' : ' ✗') : ''
  const revealed = s.revealed.includes(r.result)
  const stages = s.lang==='ru'
    ? {unknown:'Неизвестно',hint:'Подсказка',tier:'Требования тира',layout:'Разместите соседей',active:'Опыление активно',fruit:'Опылённый урожай в инвентаре',seed:'Семя получено',studied:'Изучено'}
    : {unknown:'Unknown',hint:'Clue',tier:'Tier requirements',layout:'Place adjacent plants',active:'Pollination active',fruit:'Pollinated harvest in inventory',seed:'Seed obtained',studied:'Studied'}
  const {current,required,tier}=status.progress
  const requirements=`${s.lang==='ru'?'Тир':'Tier'} ${tier} · ${s.lang==='ru'?'Виды':'Species'} ${current.species}/${required.species} · ${s.lang==='ru'?'Грядки':'Beds'} ${current.plots}/${required.plots} · ${s.lang==='ru'?'Теплица':'Greenhouse'} ${current.greenhouse}/${required.greenhouse}`
  return `<section class="recipe-card"><h3>${revealed || r.result==='solar_strawberry' ? name(r.result) : w.mystery}</h3>
    <p><strong>${stages[status.stage]}</strong> · ${requirements}</p>
    <p>${w.harvest} · ${name(r.primary)}${mark(plot?.plant?.species === r.primary)}<br>
    ${w.neighbors} · ${r.neighbors.map(id => name(id) + mark(neighbors.includes(id))).join(' + ')}<br>
    ${w.bed} ≥ ${r.minBedLevel}${mark(!!plot && plot.level >= r.minBedLevel)}</p>
    ${r.result==='solar_strawberry' && status.stage!=='studied' ? adjacencyDiagram(s.lang==='ru') : ''}
    <p><b>${status.chance*100}%</b> · ${s.lang==='ru'?'Следующая попытка':'Next attempt'} · ${status.failures}/${status.pity} ${s.lang==='ru'?'неудач':'failures'} ${revealed?' · '+w.revealed:''}</p>
    ${status.batchId!==undefined ? `<button type="button" data-action="research-batch" data-id="${status.batchId}">${s.lang==='ru'?'Открыть партию':'Open harvest batch'}</button>` : ''}</section>`
}
