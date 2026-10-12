// Лестница соперников. Имена пародийные, без реальных бойцов (права на имя/образ).
// power — общий рейтинг соперника с учётом «кондиций» (как у игрока: навыки + ~35 за форму).

export type Style = 'brawler' | 'striker' | 'wrestler' | 'bjj' | 'grinder' | 'allround';
export type Tactic = 'pressure' | 'counter' | 'takedown';

export interface Opponent {
  first: string;
  nick: string;
  last: string;
  style: Style;
  power: number;
  quote: string;
  art: number; // индекс картинки o0..o7
}

export const LADDER: Opponent[] = [
  { first: 'Гена', nick: 'Табуретка', last: 'Сидоров', style: 'brawler', power: 33, quote: 'Я в девяностые и не таких валил.', art: 0 },
  { first: 'Тимур', nick: 'Шаурма', last: 'Алиев', style: 'striker', power: 43, quote: 'После боя угощаю. Если сможешь жевать.', art: 1 },
  { first: 'Стас', nick: 'Бетономешалка', last: 'Кравец', style: 'wrestler', power: 53, quote: 'Положу и буду лежать сверху до утра.', art: 2 },
  { first: 'Арсен', nick: 'Тихий', last: 'Гаспарян', style: 'bjj', power: 63, quote: 'Тссс.', art: 3 },
  { first: 'Олег', nick: 'Сосед снизу', last: 'Пахомов', style: 'grinder', power: 73, quote: 'Будешь стучать — я тоже буду.', art: 4 },
  { first: 'Рустам', nick: 'Экскаватор', last: 'Байматов', style: 'wrestler', power: 83, quote: 'Копаю глубоко. Тебя закопаю.', art: 5 },
  { first: 'Дэн', nick: 'Без тормозов', last: 'Ветров', style: 'striker', power: 93, quote: 'Защита? Не слышал.', art: 6 },
  { first: 'Виктор', nick: 'Гора', last: 'Громов', style: 'allround', power: 104, quote: 'Гору не двигают. На гору поднимаются.', art: 7 },
];

export const STYLE_INFO: Record<Style, { title: string; share: { s: number; g: number; c: number }; tactics: Record<Tactic, number>; hint: string }> = {
  // Первый соперник: учит главному правилу игры — контра бьёт давление
  brawler: {
    title: 'Драчун',
    share: { s: 0.6, g: 0.1, c: 0.3 },
    tactics: { pressure: 1, counter: 0, takedown: 0 },
    hint: 'Машет без остановки и только вперёд. Стой на контратаках — и он твой.',
  },
  striker: {
    title: 'Ударник',
    share: { s: 0.55, g: 0.15, c: 0.3 },
    tactics: { pressure: 0.6, counter: 0.3, takedown: 0.1 },
    hint: 'Любит давить и встречать. Контрой ловим его на входе, а когда стоит и ждёт — переводим.',
  },
  wrestler: {
    title: 'Борец',
    share: { s: 0.15, g: 0.55, c: 0.3 },
    tactics: { pressure: 0.2, counter: 0, takedown: 0.8 },
    hint: 'Будет проходить в ноги. Дави сам — давление сбивает его проходы.',
  },
  bjj: {
    title: 'Джитсер',
    share: { s: 0.2, g: 0.6, c: 0.2 },
    tactics: { pressure: 0.1, counter: 0.3, takedown: 0.6 },
    hint: 'В партере у него захваты — туда не ходи. Дави в стойке.',
  },
  grinder: {
    title: 'Грайндер',
    share: { s: 0.3, g: 0.3, c: 0.4 },
    tactics: { pressure: 0.7, counter: 0, takedown: 0.3 },
    hint: 'Липкий и не устаёт. Контра на его давление и береги дыхалку.',
  },
  allround: {
    title: 'Универсал',
    share: { s: 0.38, g: 0.38, c: 0.24 },
    tactics: { pressure: 0.34, counter: 0.33, takedown: 0.33 },
    hint: 'Читает тебя. Меняй тактику каждый раунд.',
  },
};

export const TACTICS: Record<Tactic, { title: string; short: string; beats: Tactic; why: string }> = {
  pressure: { title: 'Давить', short: 'Давление', beats: 'takedown', why: 'Давление сбивает проходы в ноги' },
  counter: { title: 'Контратаковать', short: 'Контра', beats: 'pressure', why: 'Контра наказывает за давление' },
  takedown: { title: 'Переводить', short: 'Борьба', beats: 'counter', why: 'Пассивного контрпанчера легко перевести' },
};

export function fullName(o: Pick<Opponent, 'first' | 'nick' | 'last'>) {
  return `${o.first} «${o.nick}» ${o.last}`;
}

/** Соперник для следующего боя. После пояса — защиты титула против реваншистов, каждый сильнее. */
export function opponentFor(rank: number, defenses: number): Opponent & { defense: boolean } {
  if (rank < LADDER.length) return { ...LADDER[rank]!, defense: false };
  const base = LADDER[4 + (defenses % 4)]!;
  return {
    ...base,
    power: Math.round(LADDER[7]!.power * (1 + 0.06 * (defenses + 1))),
    quote: 'Я пришёл за поясом. Реванш.',
    defense: true,
  };
}
