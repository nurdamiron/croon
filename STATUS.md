# Project Status & Change Log

Этот файл фиксирует текущее состояние инфраструктуры и ключевые изменения.
Обновляй при любых значимых изменениях в БД, инфраструктуре или архитектуре.

---

## Текущая инфраструктура (актуально на 2026-04-19)

### Базы данных

| База | Где | Для чего | Строка подключения |
|------|-----|----------|--------------------|
| `alash-electronics` | AWS RDS `alashed-db` (eu-north-1) | **Прод БД croon.kz** | `postgresql://alashed_user:alashed01@alashed-db.cde42ec8m1u7.eu-north-1.rds.amazonaws.com:5432/alash-electronics?sslmode=require` |
| `alashed-biz` | AWS RDS `alashed-db` (eu-north-1) | Внутренняя ERP/CRM система | — |
| `learning_alashed` | AWS RDS `alashed-db` (eu-north-1) | AlashEd образовательная платформа | — |
| Neon (neondb) | neon.tech (us-east-1) | **УСТАРЕЛА** — была прод БД до 2026-03-08, теперь резервная копия | `postgresql://neondb_owner:...@ep-polished-forest-aiug4wcd-pooler.c-4.us-east-1.aws.neon.tech/neondb` |

> **Важно:** С 2026-03-08 сайт работает на RDS, не на Neon. Neon пока не удалять — резервная копия.

### Серверы

| Сервер | IP | Что крутится |
|--------|-----|-------------|
| EC2 **`alash-electronics`** (магазин) | **13.51.198.130** | Только **croon.kz**: PM2 `alash-electronics` → порт **5000**, nginx 80/443. Код: `/home/ubuntu/alashed-shop/frontend/`. См. `CLAUDE.md` → Infrastructure. |
| EC2 `alashed-services` (сервисы) | 13.62.193.249 | PM2: `biz-api`, `edu-api`, `tendon-api`, `tendon-web`, `it-site`, `unitree` — **без** `alash-electronics`, если магазин уже на отдельном инстансе (см. ниже). |
| EC2 `CodeStudio` | 16.170.207.59 | Dev окружение |

> **Сверка с AWS:** **магазин** — EC2 `i-06e2d5837c24c75f3` (**13.51.198.130**). **alashed-services** — `i-08eb56616ddb569bc` (**13.62.193.249**). A-запись `croon.kz` должна указывать на **13.51.198.130**. Workflow `deploy-ec2.yml` / `diagnose-ec2.yml` настроены на **`i-06e2d5837c24c75f3`** (не на alashed-services).

#### Разово: снять дубликат магазина с `alashed-services` (13.62.193.249)

Выполняй **только** после проверки, что **сайт и DNS** смотрят на **13.51.198.130** и с alashed-services никто не ходит:

```bash
# на 13.62.193.249 от ubuntu:
pm2 list
pm2 delete alash-electronics
pm2 save
# убедись, что в nginx нет server_name croon.kz с proxy на 127.0.0.1:5000; при необходимости удали/закомментируй site и: sudo nginx -t && sudo systemctl reload nginx
```

#### Не путать workflow

- `deploy.yml` — S3-артефакт на **`i-06e2d5837c24c75f3`**.
- `deploy-ec2.yml` — `git pull` на тот же инстанс магазина (`i-06e2d5837c24c75f3`) — на сервере часто **нет `.git`**; тогда деплой как в блоке 2026-04-04: **tar → S3 → `deploy.sh`**.
- `diagnose-ec2.yml` — диагностика / рестарт PM2 на магазин-инстансе.
- `google-indexing-key-to-ec2.yml` — одноразовая загрузка JSON ключа Google Indexing на EC2 (секрет `GOOGLE_INDEXING_JSON`).

**SSM** на alashed-services (`i-08…`) в одной из проверок давал `Undeliverable` — снятие PM2/каталога там только по **SSH** (см. блок выше).

#### Google Indexing API (прод, EC2 магазина)

| Что | Где / как |
|-----|-----------|
| Cron | Пользователь **ubuntu**: каждый день **9:00** (время системы сервера, обычно UTC) |
| Скрипт | `/home/ubuntu/alashed-shop/frontend/scripts/google-index-daily.js` (резервная подстановка с `s3://alashed-media/deploys/google-index-daily.js`) |
| Ключ | `/home/ubuntu/.secrets/google-indexing.json` (не в git; workflow **Upload Google Indexing key to EC2** или вручную) |
| State | `/home/ubuntu/.local/google-indexing-state.json` |
| Лог | `/home/ubuntu/logs/google-indexing.log` |
| Режим | По умолчанию после полного прохода sitemap state сбрасывается и цикл начинается сначала (см. комментарии в скрипте). |

В репозитории: `scripts/ec2-google-indexing-setup.sh` — логика каталогов и crontab (без git; ключ подкладывается отдельно).



### AWS S3

- Бакет `alashed-media` (eu-north-1) — все изображения товаров (3363+ файлов)
- Бакет `alashed-edu-storage` — файлы AlashEd

---

## Изменения 2026-03-08

### Миграция БД: Neon → AWS RDS

- Сделан дамп с Neon через pg_dump v17 на EC2
- Восстановлено в RDS `alash-electronics` (1896 товаров, 8 заказов, 171 категория, 3361 фото)
- Созданы GIN индексы для поиска (pg_trgm) на RDS
- Обновлён `.env` на EC2, PM2 перезапущен
- `alashed_prod` переименован в `alashed-biz` на RDS

### SEO исправления

- `collection/[slug]`: noindex для страниц пагинации, сортировки, фильтров и поиска
- `page.tsx`: абсолютный title на главной (без суффикса шаблона)
- `robots.ts`: добавлен `/client_account/` в disallow
- `ProductCard`: добавлен `aria-label={name}` на ссылку изображения

### Товары — переименование дублей (прямо в БД)

Переименованы и обновлены slug для 13 товаров-переключателей KCD11/KCD1,
которые имели одинаковые названия но разные цвета/характеристики.
Удалены 3 реальных дубля (нулевые заказы, одинаковые цена/описание/фото).

Новые слаги:
- `kcd11-t85-krasnyy`, `kcd11-t85-chernyy`, `kcd11-t85-belyy`
- `kcd11-3-kontakta-krasnyy`, `kcd11-3-kontakta-chernyy-o1`, `kcd11-3-kontakta-chernyy-1-0-2`
- `kcd1-2115-krasnyy-2-kontakta`, `kcd1-2115-krasnyy-4-kontakta-podsveta`, и др.

---

## Изменения 2026-03-07

### SEO исправления (из SEMrush аудита)

- `next.config.js`: отключена оптимизация изображений (`unoptimized: true`), добавлен редирект www → non-www
- `sitemap.ts`: обновлён BASE_URL, добавлены `/collection/all` и `/karta-sayta`
- `robots.ts`: обновлён sitemap URL
- `layout.tsx`: GTM, GA4, Yandex.Metrika
- `sanitize.ts`: HTTP→HTTPS апгрейд в src, demote h1→h2 в контенте, автодобавление `alt=""`, nofollow на внешние ссылки
- `seo.ts`: добавлена функция `smartTitle()` для умного сокращения длинных названий
- `product/[slug]/page.tsx`: уникальный fallback description с ценой, блок "О товаре" для товаров без описания
- `blogs/[blog]/[slug]/page.tsx`: добавлен Sidebar и хлебные крошки
- `Header.tsx`: удалены ссылки на alash.academy, добавлен aria-label на корзину
- `Footer.tsx`: удалена ссылка alash.academy, добавлена ссылка /karta-sayta
- Создана страница `/karta-sayta` — HTML карта сайта (снижает глубину краулинга)

---

---

## Изменения 2026-04-04

### Функциональность

- **Предзаказ**: кнопка «Предзаказать» для товаров `inStock=false`. Модалка (имя + телефон) → `POST /api/preorder` → создаёт `Order(isPreorder=true)`. В админке бейдж «Предзаказ».
- **Транзакция заказа**: `POST /api/orders` обёрнут в `$transaction` с атомарным SQL декрементом `UPDATE WHERE totalStock >= qty`. Предотвращает overselling.
- **Схема**: добавлены `Order.isPreorder`, `Product.costPrice`, `Product.costPriceDate`.
- **Синк склада**: `frontend/scripts/sync-stock.js` — импорт цен/себес/остатков из CSV InSales. Запущен: 2132 варианта обновлено, 1893 товара.

### Инфраструктура

- **Git remote** на сервере: обновлён на `git@github.com:Alashed/croon.kz.git` (deploy key ещё не добавлен в новый репо — деплой через S3+SSM)
- **Deploy процесс**: `tar` изменённых файлов → S3 (`alashed-media/deploys/`) → SSM download → `npm run build` → `pm2 restart alash-electronics`
- **PM2 процесс**: `alash-electronics` (id=37), порт 5000
- **VAPID ключи**: добавлены в `.env` на сервере, ребилд выполнен
- **NEXTAUTH_URL**: исправлен на `https://croon.kz`
- **Node.js на сервере**: v20.20.0 / npm 10.8.2

### БД (после синка)
| | |
|---|---|
| Всего товаров | 1 896 |
| В наличии | 589 |
| Нет в наличии | 1 307 |
| С себестоимостью | 878 |

---

## Изменения 2026-04-19

### Деплой на EC2 (магазин)

- После `git push origin main` прод **сам** не обновляется: либо GitHub → **Actions** → **Deploy to EC2** (`workflow_dispatch`) → SSM: `git pull` … (нужен `.git` на сервере), либо типичный путь — **tar** в `s3://alashed-media/deploys/` и **`/home/ubuntu/deploy.sh`** на инстансе (см. блок 2026-04-04).
- На инстансе магазина PM2-процесс **`alash-electronics`** (не `shop`).

### Google Indexing API

- Скрипты `google-index-daily.js` / `google-index-urls.js`, npm-алиасы в `frontend/package.json`, переменные в `frontend/.env.example`.
- На EC2: crontab, пути к ключу/state/логу — см. таблицу **Google Indexing API** выше; workflow загрузки ключа — **`google-indexing-key-to-ec2.yml`**.

### Документация

- `STATUS.md` / `CLAUDE.md`: отдельный EC2 **alash-electronics** (13.51.198.130), разделение с `alashed-services`, instance id для workflow; уточнён деплой tar vs git.

### Админка заказов

- Карточка заказа: режим **«Изменить»** состава (пока заказ не в финальных статусах). **`PATCH /api/admin/orders/:id`** с телом `items` — пересчёт суммы и корректировка остатков в транзакции.
- Список заказов: доработки отображения (в рамках того же релиза).

## Что ещё планируется

- [ ] Добавить deploy key сервера в репо `Alashed/croon.kz` (чтобы `git pull` работал)
- [ ] Продолжить переименование дублей товаров (KCD3, KCD4, и др.)
- [ ] Удалить Neon базу (резервная копия с 2026-03-08)
- [ ] SEMrush повторный аудит
