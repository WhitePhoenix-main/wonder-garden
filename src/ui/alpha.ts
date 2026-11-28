export const alpha = {
  ru: {
    promise:'Выращивай растения и открывай новые виды, меняя соседей на грядках.',
    start:'Начать сад', resume:'Продолжить сад', fresh:'Новая игра', menu:'В меню',
    music:'Музыка', effects:'Эффекты', shovel:'Лопата', compost:'В компост',
    select:'Выберите растение на острове.', lost:'Несобранный урожай исчезнет.',
    confirm:(name:string,level:string)=>`Отправить «${name}» в компост? Растение исчезнет. Уровень грядки ${level} сохранится.`,
    lastHybrid:'Последний экземпляр этого вида. Перенесите его в питомник или дождитесь запасного семени.',
    later:'Позже', plant:'Посадить', skip:'Пропустить', collect:'К сбору',
    experiment:'Новый опыт', corner:'Уголок сада',
    experimentHint:'Посадите клевер сбоку от подсолнечника и соберите урожай клевера и извлеките семена в инвентаре, чтобы получить медовое семя.',
    honeyBenefit:'Медовый клевер повышает шанс копирования черт соседнего гибрида до 40%. Разместите его сбоку от Солнечной клубники.',
    cornerHint:'Освободите лопатой или расчистите грядку, посадите любимое растение и примерьте декор возле теплицы.',
    empty:'Откройте «Посадку» и выберите пустую грядку для аварийного редиса.',
    stock:'Посадите запасное семя в «Посадке».', nursery:'Верните растение из питомника через «Посадку».',
    buy:'Посадите редис из каталога.', sell:'Продайте корзину, чтобы купить редис.',
    occupied:'Здесь уже растёт растение. Выберите свободную грядку или освободите эту лопатой.',
    closed:'Расчистите эту грядку в «Стройке».', restored:'Теплица восстановлена', beds:'Грядки'
  },
  en: {
    promise:'Grow a garden and discover new species by changing their neighbors.',
    start:'Start garden', resume:'Continue garden', fresh:'New game', menu:'Main menu',
    music:'Music', effects:'Effects', shovel:'Shovel', compost:'Compost',
    select:'Choose a plant on the island.', lost:'Its uncollected fruit will be lost.',
    confirm:(name:string,level:string)=>`Compost ${name}? The plant will disappear. Bed level ${level} will be kept.`,
    lastHybrid:'Last plant of this species. Store it in the nursery or wait for a spare seed.',
    later:'Later', plant:'Plant', skip:'Skip', collect:'Go harvest',
    experiment:'New experiment', corner:'Garden corner',
    experimentHint:'Plant clover beside a sunflower and harvest it and extract its seeds in the inventory to discover honey clover.',
    honeyBenefit:'Honey clover gives adjacent hybrids a 40% chance to copy their traits. Plant it beside your sunberry.',
    cornerHint:'Free or clear a bed, plant a favorite and preview a decoration beside the greenhouse.',
    empty:'Open Plant and choose an empty bed for an emergency radish.',
    stock:'Plant a spare seed from the catalog.', nursery:'Return a nursery plant through Plant.',
    buy:'Buy a radish from the catalog.', sell:'Sell your basket to afford a radish.',
    occupied:'A plant is growing here. Choose an empty bed or free this one with the shovel.',
    closed:'Clear this bed in Build.', restored:'Greenhouse restored', beds:'Beds'
  }
}

