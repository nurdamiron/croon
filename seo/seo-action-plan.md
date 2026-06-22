# SEO Action Plan — alash-electronics.kz — 2026-04-06
Score: 61/100 (Grade B)

> **Инфра / индексация:** см. корневые `STATUS.md` и `CLAUDE.md` — на проде настроен ежедневный cron **Google Indexing API** (ключ и пути на EC2), режим повторного обхода sitemap.

---

## CRITICAL (fix today)

- [ ] **og:image отсутствует на главной** → создать `/public/images/og-cover.jpg` (1200×630px)
  и добавить в `app/layout.tsx` → `openGraph.images`
  effort: low

- [ ] **Безопасность: X-Frame-Options + X-Content-Type-Options + CSP**
  В `next.config.js` в секцию `headers()` добавить:
  ```js
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ```
  effort: low

---

## HIGH (fix this week)

- [ ] **og:type + Twitter Card на всех страницах**
  `app/layout.tsx`: добавить `openGraph.type = 'website'`,
  `twitter: { card: 'summary_large_image', site: '@alash_electronics' }`
  effort: low

- [ ] **Скрыть Server версию и X-Powered-By**
  nginx.conf: добавить `server_tokens off;`
  next.config.js: добавить `poweredByHeader: false`
  effort: low

- [ ] **E-E-A-T: добавить About/История страницу с датами**
  `/page/about-us` уже есть — добавить: год основания (2019), факты о команде,
  фото магазина, «Работаем с 2019 года, >X тысяч заказов».
  effort: medium

- [ ] **Organization sameAs: добавить Wikidata + LinkedIn**
  Создать запись в Wikidata (wikidata.org/wiki/Special:NewItem),
  добавить LinkedIn Company страницу, обновить JSON-LD sameAs.
  effort: medium

- [ ] **Обновить robots.txt** — добавить явные записи для:
  DeepSeekBot, CCBot, DuckAssistBot, YouBot, Gemini-Deep-Research,
  Google-CloudVertexBot, Claude-SearchBot
  Готовый файл: `seo/robots.txt` → скопировать в `frontend/public/robots.txt`
  effort: low

---

## MEDIUM (fix this month)

- [ ] **Meta description расширить до 150-160 символов**
  Текущая: 121 символ. Добавить CTA:
  "Заказывай онлайн — самовывоз в Алматы (ул. Кыз Жибек 104/1) или доставка
  по всему Казахстану. Более 3000 товаров в наличии."
  effort: low

- [ ] **H2 секции на главной странице**
  Добавить на homepage: «Популярные категории», «Почему Alash Electronics»,
  «Доставка по Казахстану» — помогает поисковикам и LLM понять структуру.
  effort: medium

- [ ] **Access-Control-Allow-Origin: * → ограничить**
  Убрать CORS заголовки с HTML-страниц, оставить только для /api/ если нужно.
  effort: low

- [ ] **Добавить datePublished + dateModified на product/blog страницах**
  В Article/Product JSON-LD добавить:
  `"datePublished": "...", "dateModified": "..."` (из Prisma createdAt/updatedAt)
  effort: medium

- [ ] **llms.txt: добавить секцию Not for LLMs**
  ```
  ## Not for LLMs
  - /admin
  - /checkout
  - /cart
  - /api/
  - /client_account/
  ```
  effort: low

---

## LOW (backlog)

- [ ] **hreflang для казахского языка**
  Если планируется KZ-версия на казахском — добавить hreflang="kk" + hreflang="ru".
  effort: high

- [ ] **Cache-Control: s-maxage исправить**
  Главная имеет s-maxage=31536000 (1 год) при revalidate=1800 (30 мин).
  Выровнять до s-maxage=1800.
  effort: low

- [ ] **Favicon + apple-touch-icon OG-оптимизация**
  Добавить `apple-mobile-web-app-title: "Alash Electronics"` (сейчас нет).
  effort: low

---

## Что уже хорошо (не трогать)

- ✅ Title: 56 символов, keyword в начале
- ✅ H1 присутствует на главной
- ✅ HTTPS + 301 редирект http→https
- ✅ HSTS: max-age=31536000
- ✅ Sitemap.xml: 1982 URLs, связан в robots.txt
- ✅ robots.txt: GPTBot, ClaudeBot, PerplexityBot, Google-Extended явно разрешены
- ✅ llms.txt: присутствует, хорошо структурирован
- ✅ SSR: 79948 символов текста в HTML (AI краулеры видят контент)
- ✅ WebSite + SearchAction schema
- ✅ LocalBusiness schema: адрес, телефон, часы работы, координаты
- ✅ BreadcrumbList на категориях
- ✅ WebP/AVIF для изображений
- ✅ lang="ru" на HTML
