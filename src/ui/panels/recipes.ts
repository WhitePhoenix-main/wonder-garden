import type { GameState, Lang, Recipe } from '../../game/model'
import { researchStatus } from '../../game/queries'
import { adjacent, speciesInfo } from '../../game'

export const recipeHints: Record<string, [string, string]> = {
  'solar_strawberry:main': ['Красная ягода принимает пыльцу солнечного цветка.', 'A red berry receives pollen from a sun-like flower.'],
  'solar_strawberry:alternate': ['Солнечный цветок принимает пыльцу красной ягоды.', 'A sun-like flower receives pollen from a red berry.'],
  'moonberry:main': ['Красная ягода принимает пыльцу ночного цветка.', 'A red berry receives pollen from a night flower.'],
  'moonberry:alternate': ['Синяя ягода принимает пыльцу ночного цветка.', 'A blue berry receives pollen from a night flower.'],
  'honey_clover:main': ['Три листочка встречают пыльцу солнечного цветка.', 'Three leaves meet pollen from a sun-like flower.'],
  'honey_clover:alternate': ['Три листочка встречают пыльцу солнечных ягод.', 'Three leaves meet pollen from sunlit berries.'],
  'golden_flower:main': ['Синяя ягода принимает пыльцу ночного цветка.', 'A blue berry receives pollen from a night flower.'],
  'golden_flower:alternate': ['Солнечный цветок принимает пыльцу лунной ягоды.', 'A sun-like flower receives pollen from a moonlit berry.'],
  'crystal_flower:main': ['Лунная ягода принимает пыльцу золотого цветка.', 'A moonlit berry receives pollen from a golden flower.'],
  'crystal_flower:alternate': ['Лунная ягода принимает пыльцу медовых листьев.', 'A moonlit berry receives pollen from honeyed leaves.'],
  'star_orchid:main': ['Кристалл соседствует с солнечной ягодой и медовыми листьями.', 'A crystal shares edges with a sunlit berry and honeyed leaves.'],
  'star_orchid:alternate': ['Кристалл соседствует с золотым цветком и лунной ягодой.', 'A crystal shares edges with a golden flower and a moonlit berry.']
}
export const resonanceNames:Record<string,[string,string]>={
  solar_strawberry:['Солнечный резонанс','Solar resonance'],moonberry:['Лунный резонанс','Lunar resonance'],
  honey_clover:['Медовый резонанс','Honey resonance'],golden_flower:['Золотистый резонанс','Golden resonance'],
  crystal_flower:['Кристаллический резонанс','Crystal resonance'],star_orchid:['Астральный резонанс','Astral resonance']
}

export function recipeKnown(s: GameState, r: Recipe) {
  return (s.research.recipes['id' in r ? String(r.id) : `${r.result}:main`]?.successes ?? 0) > 0 || r.result === 'solar_strawberry' && !('alternate' in r && r.alternate)
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
  const status=researchStatus(s,r.result,'id' in r ? String(r.id) : undefined)
  if (!status.labelKnown) {
    const someKnown = [r.primary,...r.neighbors].some(id => s.planted.includes(id))
    const key='id' in r ? String(r.id) : `${r.result}:main`
    const clue = someKnown ? recipeHints[key][s.lang === 'ru' ? 0 : 1] : w.explore
    const stage = status.stage==='active' ? (s.lang==='ru'?'Опыление активно':'Pollination active') : status.stage==='fruit' ? (s.lang==='ru'?'Опылённый урожай в инвентаре':'Pollinated harvest in inventory') : ''
    const resonance=resonanceNames[r.result][s.lang==='ru'?0:1]
    const odds=status.observed ? `<p>${s.lang==='ru'?'Следующая попытка':'Next attempt'} · ${Math.round(status.chance*100)}% · ${s.lang==='ru'?'Неудач':'Failures'} ${status.failures} · ${s.lang==='ru'?'До гарантии':'Until guarantee'} ${Math.max(1,status.pity-status.failures)}</p>` : ''
    return `<section class="recipe-card"><h3>◇ · ${status.observed ? resonance : w.mystery}</h3><p>${clue}</p>${stage ? '<p>'+stage+'</p>' : ''}${odds}
      ${status.batchId!==undefined ? `<button type="button" data-action="research-batch" data-id="${status.batchId}">${s.lang==='ru'?'Открыть партию':'Open harvest batch'}</button>` : ''}</section>`
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
    <p>${status.observed ? `<b>${Math.round(status.chance*100)}%</b> · ` : ''}${s.lang==='ru'?'Следующая попытка':'Next attempt'} · ${status.failures}/${status.pity} ${s.lang==='ru'?'неудач':'failures'} ${revealed?' · '+w.revealed:''}</p>
    ${status.batchId!==undefined ? `<button type="button" data-action="research-batch" data-id="${status.batchId}">${s.lang==='ru'?'Открыть партию':'Open harvest batch'}</button>` : ''}</section>`
}
