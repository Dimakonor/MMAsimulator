# Метрики, пороги и точки решения

> Пороги — мои оценки для бесплатного трафика в Telegram Mini App, не отраслевой стандарт. Их задача — заставить принять решение в срок, а не «ещё недельку посмотрю».

## Честно про A/B-тесты

Чтобы отличить конверсию 2% от 4% (мощность 80%, α = 0.05), нужно около **1100 игроков в каждой ветке**. A/B по числу бесплатных слотов или цене стартового пака на первых сотнях установок — шум.

**Поэтому:**
- до 2000 установок в неделю — последовательные тесты (неделя A, неделя B) и только **крупные** различия: показать пак на день 1 или на день 3, 99 или 199 Stars;
- A/B по слотам не делать вообще: слотов в MVP нет (см. `01`, пункт 1.1);
- ветку назначать по `user_id % 2`, чтобы её можно было пересчитать задним числом.

## Воронка и события

| Шаг | Событие в `events` |
|---|---|
| Просмотр ролика → старт бота | `bot_start` с `source = vN` (просмотры берутся из TikTok/YouTube) |
| Первое открытие | `first_open` |
| Боец создан | `fighter_created` |
| Действия | `action` (`via = app / bot`) |
| Бой | `fight` |
| Напоминание → возврат | `reminder_sent`, затем `app_open` или `action via = bot` в течение 2 ч |
| Блокировка | `bot_blocked` |
| Магазин → оплата | `c_shop_click`, `invoice_opened`, `purchase` |

## Точки решения

### Ворота 0 — трафик (дни 1–14, до релиза)
| Метрика | Идёт | Думать | Стоп формату |
|---|---|---|---|
| Ролики > 10 тыс. просмотров | ≥ 3 из 20 | 1–2 | 0 |
| `bot_start` / просмотры | ≥ 0.3% | 0.1–0.3% | < 0.1% |
Если формат провалился — меняй формат (минимум 3 разных), а не игру.

### Ворота 1 — удержание (когорта 300+ установок, примерно недели 3–4)
| Метрика | Идёт | Итерировать | Стоп ядру |
|---|---|---|---|
| Создали бойца / открыли | ≥ 70% | 50–70% | < 50% |
| D1 | ≥ 25% | 15–25% | < 15% |
| D7 | ≥ 8% | 4–8% | < 4% |
| Дошли до первого боя | ≥ 40% | 25–40% | < 25% |
| Возврат по напоминанию (≤ 2 ч) | ≥ 15% | 8–15% | < 8% |
| Block rate за 7 дней | < 5% | 5–10% | > 10%: урезать частоту |

Твои ожидания по D1 25–30% достижимы для «тёплых» источников (друзья, твой канал). Для холодного трафика из Shorts реалистичнее 15–20%. Если на холодном трафике получишь 25% — это сильный результат.

**Правило стопа:** три итерации ядра подряд с D1 < 15% → ядро не работает. Меняй концепцию, а не цвет кнопок.

### Ворота 2 — деньги (1000+ установок, примерно дни 30–45)
| Метрика | Идёт | Итерировать | Стоп |
|---|---|---|---|
| Платящие к D7 (от создавших бойца) | ≥ 2% | 0.8–2% | < 0.8% |
| Чистый доход на установку к D30 | ≥ $0.05 | $0.02–0.05 | < $0.02 |
| Возвраты Stars | < 3% | — | > 5%: что-то воспринимается как обман |
Отдельно смотреть платящих по стране или языку (см. `01`, пункт 1.8).

## SQL

```sql
-- D1 / D7 по дневным когортам (по событию first_open)
with c as (
  select user_id, min(created_at)::date d0 from events where name = 'first_open' group by 1
), a as (
  select distinct user_id, created_at::date d from events where name in ('app_open','action','fight')
)
select c.d0,
       count(*) as installs,
       round(100.0 * count(*) filter (where exists (select 1 from a where a.user_id=c.user_id and a.d = c.d0 + 1)) / count(*), 1) as d1,
       round(100.0 * count(*) filter (where exists (select 1 from a where a.user_id=c.user_id and a.d = c.d0 + 7)) / count(*), 1) as d7
from c group by 1 order by 1;

-- Конверсия по источнику (ролику)
select u.source,
       count(distinct u.id) as users,
       count(distinct p.user_id) as payers,
       coalesce(sum(p.stars) filter (where p.status='paid'), 0) as stars,
       round(coalesce(sum(p.stars) filter (where p.status='paid'), 0) * 0.013 / nullif(count(distinct u.id),0), 3) as usd_per_user
from users u left join payments p on p.user_id = u.id
group by 1 order by users desc;

-- Block rate и эффективность напоминаний за 7 дней
select
  (select count(*) from events where name='bot_blocked' and created_at > now()-interval '7 days')::float
  / nullif((select count(distinct user_id) from events where name='reminder_sent' and created_at > now()-interval '7 days'),0) as block_rate,
  (select count(*) from events r where r.name='reminder_sent' and r.created_at > now()-interval '7 days'
     and exists (select 1 from events x where x.user_id=r.user_id and x.name in ('app_open','action')
                 and x.created_at between r.created_at and r.created_at + interval '2 hours'))::float
  / nullif((select count(*) from events where name='reminder_sent' and created_at > now()-interval '7 days'),0) as reminder_return_rate;
```
