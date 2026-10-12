// Все балансные числа — в одном месте. Крутить по данным, а не по ощущениям.
// После правок: npm test (симуляция игрока проверяет путь до пояса).

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
  // Нижняя граница потерь: забросил на неделю — форма не ниже. Возвращаться не страшно.
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
  startSkills: { striking: 2, grappling: 2, cardio: 2 },

  // Бои
  firstFightDelay: 24 * HOUR,
  fightInterval: 72 * HOUR,
  rounds: 3,

  // Весогонка: окно открывается за 24 ч до боя
  weightCut: {
    window: 24 * HOUR,
    startOver: 3, // кг сверх лимита
    perCut: 1.5,
    feedGain: 0.5, // поел в окне — плюс к весу
    energyCost: 8,
    cooldown: 3 * HOUR,
    madeBonus: 4, // очков рейтинга в бою
    missPenalty: 8,
  },

  // «Больничный»: статы не падают
  freezeDuration: 24 * HOUR,

  // Ленивая симуляция
  simStep: 15 * MIN,
  simMaxSpan: 14 * DAY,
} as const;

// ---------- Темы ----------
export type ThemeId = 'basement' | 'mountain' | 'arena';

export const THEMES: Record<ThemeId, { title: string; tagline: string; art: 'pix' | 'com' | 'pos'; stars: number }> = {
  basement: { title: 'Подвал', tagline: 'Бетон, одна лампочка и мечта', art: 'pix', stars: 75 },
  mountain: { title: 'Горный лагерь', tagline: 'Снег, покрышка и коза', art: 'com', stars: 75 },
  arena: { title: 'Неоновая арена', tagline: 'Прожекторы, экраны и пояс', art: 'pos', stars: 75 },
};
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

// ---------- Магазин ----------
export type ProductId = 'freeze' | 'starter_pack' | `theme_${ThemeId}`;

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
  theme_basement: { title: 'Тема «Подвал»', description: 'Пиксельный подвал навсегда.', stars: THEMES.basement.stars },
  theme_mountain: { title: 'Тема «Горный лагерь»', description: 'Комикс-сборы в горах навсегда.', stars: THEMES.mountain.stars },
  theme_arena: { title: 'Тема «Неоновая арена»', description: 'Арена под прожекторами навсегда.', stars: THEMES.arena.stars },
};
