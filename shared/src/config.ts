// Все балансные числа — в одном месте. Это плейсхолдеры для первого теста,
// крутить их по данным, а не по ощущениям.

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const BALANCE = {
  // Сытость: 100 -> 0 примерно за 25 часов
  satietyDecayPerHour: 4,
  // Энергия: бодрствуя тратится, во сне восстанавливается (8 ч до полной)
  energyDecayPerHour: 1.5,
  energyRegenPerHourAsleep: 12.5,
  sleepDuration: 8 * HOUR,

  // Форма падает, только если боец реально запущен
  hungryThreshold: 25,
  exhaustedThreshold: 15,
  formDecayPerHourNeglected: 1.5,
  // «Потолок потерь»: забросил на неделю — форма не ниже этого значения.
  // Наказание есть, но возвращаться не страшно.
  formFloor: 30,

  feed: { satiety: 40, cooldown: 3 * HOUR },
  train: {
    minEnergy: 25,
    minSatiety: 20,
    energyCost: 20,
    satietyCost: 10,
    formGain: 5,
    baseSkillGain: 1.5,
    cooldown: 4 * HOUR,
  },

  // Бои — главный смысл ухода за бойцом
  firstFightDelay: 24 * HOUR,
  fightInterval: 72 * HOUR,

  // «Больничный» (аналог streak freeze): статы не падают
  freezeDuration: 24 * HOUR,

  // Ленивая симуляция: шаг и максимум
  simStep: 15 * MIN,
  simMaxSpan: 14 * DAY,
} as const;

// Лестница соперников. Баланс (симуляция в shared/test): 3 захода в день -> чемпион
// примерно за 30 дней, 2 захода -> примерно за 40. Это совпадает с нарративом роликов.
// Имена — пародийные, без реальных бойцов (права на имя/образ).
export const LADDER = [
  { name: 'Гена «Табуретка» Сидоров', power: 35 },
  { name: 'Тимур «Шаурма» Алиев', power: 46 },
  { name: 'Стас «Бетономешалка» Кравец', power: 58 },
  { name: 'Арсен «Тихий» Гаспарян', power: 70 },
  { name: 'Олег «Сосед снизу» Пахомов', power: 82 },
  { name: 'Рустам «Экскаватор» Байматов', power: 94 },
  { name: 'Дэн «Без тормозов» Ветров', power: 106 },
  { name: 'Чемпион: Магомед «Гора» Ахмедов', power: 120 },
] as const;

export type ProductId = 'freeze' | 'starter_pack';

export const PRODUCTS: Record<ProductId, { title: string; description: string; stars: number }> = {
  freeze: {
    title: 'Больничный',
    description: '24 часа без потери формы и сытости. Для тех, кто уезжает.',
    stars: 25,
  },
  starter_pack: {
    title: 'Стартовый пак',
    description: '2 больничных + золотые шорты. Одна покупка на аккаунт.',
    stars: 99,
  },
};
