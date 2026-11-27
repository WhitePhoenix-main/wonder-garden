import type { GameState, Hybrid, Lang, Recipe } from '../../game/model'
import { chance } from '../../game/queries'
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

export function recipeCard(s: GameState, r: Recipe, selected: number|null) {
  const w = labels[s.lang]
  const name = (id: keyof typeof speciesInfo) => s.lang === 'ru' ? speciesInfo[id].nameRu : speciesInfo[id].nameEn
  if (!recipeKnown(s,r)) {
    const someKnown = [r.primary,...r.neighbors].some(id => s.planted.includes(id))
    const clue = someKnown ? hints[r.result][s.lang === 'ru' ? 0 : 1] : w.explore
    return `<section class="recipe-card"><h3>◇ · ${w.mystery}</h3><p>${clue}</p></section>`
  }
  const plot = selected === null ? null : s.plots[selected]
  const neighbors = selected === null ? [] : adjacent(selected).map(i => s.plots[i].plant?.species)
  const mark = (met:boolean) => plot ? (met ? ' ✓' : ' ✗') : ''
  const revealed = s.revealed.includes(r.result)
  return `<section class="recipe-card"><h3>${name(r.result)}</h3>
    <p>${w.harvest} · ${name(r.primary)}${mark(plot?.plant?.species === r.primary)}<br>
    ${w.neighbors} · ${r.neighbors.map(id => name(id) + mark(neighbors.includes(id))).join(' + ')}<br>
    ${w.bed} ≥ ${r.minBedLevel}${mark(!!plot && plot.level >= r.minBedLevel)}</p>
    <p><b>${chance(s,r.result)*100}%</b> · ${s.lang==='ru'?'Сбор семян':'Seed harvest'} ${revealed?' · '+w.revealed:''}</p></section>`
}
