#!/usr/bin/env node
// Кабинетный демпинг-воркер Kaspi (суб-минутный).
//
// В ОТЛИЧИЕ от kaspi-dumping-worker.mjs (фид, такт ~час), этот воркер меняет цену
// через ВНУТРЕННИЙ API кабинета продавца mc.shop.kaspi.kz — МГНОВЕННО (JSON-POST,
// без ожидания перечитки фида). Это механизм AlgaTop/FixBot.
//
// ГИБРИД: цены конкурентов снимаем через ПУБЛИЧНЫЙ offer-view (полная выдача всех
// продавцов → точная позиция + второй конкурент для FIRST_MIN_GAP, логина НЕ требует),
// а смену цены делаем через кабинет (мгновенно, не ждём часовой фид):
//   POST kaspi.kz/yml/offer-view/offers/{pid}      → все конкуренты (анонимно)
//   POST mc.shop.kaspi.kz/pricefeed/upload/merchant/process → смена цены (с сессией)
//
// АРХИТЕКТУРА (облегчённая): браузер (Playwright) нужен ТОЛЬКО для входа — один раз
// логинишься роботом, воркер сохраняет КУКИ сессии в .kaspi-session.json. Рабочий
// цикл — чистый Node fetch с этими куками, БЕЗ браузера (легко и быстро).
//
// ЗАПУСК (на машине с резидентным KZ IP):
//   .env (НЕ коммитить):
//     KASPI_LOGIN_USER=<email/логин робота из кабинета «Пользователи»>
//     KASPI_LOGIN_PASS=<пароль робота>
//     MERCHANT_UID=8719005
//     DUMPING_SECRET=<значение CRON_SECRET с сервера>
//     SITE=https://croon.kz
//   1) Вход (нужен playwright):  node scripts/kaspi-cabinet-worker.mjs --login
//      → откроется браузер, войди роботом (вкладка Email). Куки сохранятся.
//   2) Проверка (без браузера):  node scripts/kaspi-cabinet-worker.mjs --once --dry
//   3) Боевой цикл:              node scripts/kaspi-cabinet-worker.mjs
//
// Флаги: --login (вход и сохранение куки), --once (один прогон), --dry (не менять цену).
//
// Когда сессия протухнет — воркер скажет «нужен вход», повтори --login.

import fs from 'node:fs'

const SITE = (process.env.SITE || 'https://croon.kz').replace(/\/$/, '')
const SECRET = process.env.DUMPING_SECRET || ''
const MERCHANT_UID = process.env.MERCHANT_UID || '8719005'
const CITY = process.env.KASPI_DUMPING_CITY || '750000000'
const SESSION_FILE = process.env.KASPI_SESSION_FILE || './.kaspi-session.json'
// Креды робота (AlgaTop-модель): храним в локальном файле на маке, заполняется
// один раз через страницу дашборда. Файл имеет приоритет над env-переменными.
const CREDS_FILE = process.env.KASPI_CREDS_FILE || './.kaspi-credentials.json'
function getCreds() {
  let user = process.env.KASPI_LOGIN_USER || ''
  let pass = process.env.KASPI_LOGIN_PASS || ''
  try {
    const j = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'))
    if (j.user) user = String(j.user)
    if (j.pass) pass = String(j.pass)
  } catch {}
  return { user, pass }
}
const LOOP_MIN = Number(process.env.LOOP_MIN || 2)
const THROTTLE_MS = Number(process.env.THROTTLE_MS || 700)  // offer-view (публичный nginx) — пауза между снятиями
const MAX_OPS_PER_RUN = Number(process.env.MAX_OPS || 200)   // запас под лимит Kaspi 250/30мин
const MC = 'https://mc.shop.kaspi.kz'

const DO_LOGIN = process.argv.includes('--login')
const ONCE = process.argv.includes('--once')
const DRY = process.argv.includes('--dry')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// --- Куки сессии: храним строку Cookie для домена mc.shop.kaspi.kz ---

function loadCookie() {
  try {
    const j = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))
    return j.cookie || ''
  } catch { return '' }
}
function saveCookie(cookie) {
  // Куки сессии кабинета = доступ к смене цен боевого магазина → пишем строго 0o600.
  // openSync с mode создаёт файл с правами в один syscall (нет TOCTOU-окна и тихого
  // провала chmod, как было бы при writeFileSync + chmodSync).
  const data = JSON.stringify({ cookie, savedAt: new Date().toISOString() }, null, 2)
  const fd = fs.openSync(SESSION_FILE, 'w', 0o600)
  try { fs.writeSync(fd, data) } finally { fs.closeSync(fd) }
}

// Базовые заголовки для запросов кабинета.
function mcHeaders(cookie, extra = {}) {
  return {
    cookie,
    accept: 'application/json, text/plain, */*',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    referer: 'https://kaspi.kz/',
    ...extra,
  }
}

// --- Вход через браузер (только для --login). Playwright подгружаем динамически,
//     чтобы рабочий цикл не зависел от него. ---

// АВТО-ЛОГИН (AlgaTop-модель): робот сам вводит логин+пароль и жмёт «Войти».
// headless по умолчанию (interactive=true → видимый браузер для отладки/первого входа).
// Возвращает свежую cookie-строку или бросает ошибку. Вход — ТОЛЬКО логин+пароль
// (без SMS, подтверждено): значит полностью автоматизируем.
async function doLogin({ interactive = false } = {}) {
  const { user, pass } = getCreds()
  const isManual = !user || !pass

  if (isManual && !interactive) {
    throw new Error('нет логина/пароля робота. Введи их на странице дашборда (кнопка «Логин/пароль») или задай KASPI_LOGIN_USER/PASS')
  }

  let chromium
  try { ({ chromium } = await import('playwright')) }
  catch { throw new Error('для входа нужен playwright: npm i playwright && npx playwright install chromium') }

  const browser = await chromium.launch({ headless: !interactive })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()
  try {
    if (isManual) {
      log('Логин/пароль не заданы. Открываю браузер для ручного входа...')
      log('Пожалуйста, авторизуйтесь в открывшемся окне браузера Chromium...')
    } else {
      log(`авто-вход в кабинет под ${user}…`)
    }
    
    await page.goto('https://idmc.shop.kaspi.kz/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(1500)

    if (!isManual) {
      // Вход ДВУХШАГОВЫЙ (проверено вживую):
      //   Шаг 1: вкладка «Email» (<li role=tab>), поле #user_email_field, «Продолжить».
      //   Шаг 2: появляется #password_field, «Продолжить» → редирект в кабинет.
      // SMS не запрашивается (вход только email+пароль).
      try { await page.locator('li[role="tab"]:has-text("Email")').click({ timeout: 3000 }) } catch {}
      await sleep(400)
      await page.fill('#user_email_field, input[name="username"]', user)
      await page.locator('button:has-text("Продолжить"), button[type="submit"]').first().click({ timeout: 5000 })
      await sleep(2500)

      // Шаг 2 — пароль.
      await page.fill('#password_field, input[type="password"]', pass)
      await page.locator('button:has-text("Продолжить"), button:has-text("Войти"), button[type="submit"]').first().click({ timeout: 5000 }).catch(() => {})
      log('   логин/пароль отправлены, жду сессию…')
    }

    // Ждём рабочую сессию (проверка offer/count).
    // Для ручного входа даем больше времени (180 секунд).
    const maxAttempts = isManual ? 60 : 30
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(3000)
      let ok = false
      try {
        ok = await page.evaluate(async (uid) => {
          try { const r = await fetch(`https://mc.shop.kaspi.kz/offers/api/v1/offer/count?m=${uid}`, { credentials: 'include' }); return r.ok } catch { return false }
        }, MERCHANT_UID)
      } catch { ok = false } // навигация в процессе — пробуем снова
      if (ok) {
        const cookies = await ctx.cookies(['https://mc.shop.kaspi.kz', 'https://kaspi.kz'])
        const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
        const finalCookie = cookie.includes('ks.sid=') ? cookie : (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
        saveCookie(finalCookie)
        log('✅ вход выполнен, куки сохранены')
        await browser.close()
        return finalCookie
      }
    }
    throw new Error('вход не удался по таймауту — проверь логин/пароль или пройди авторизацию до конца')
  } finally {
    try { await browser.close() } catch {}
  }
}

// Гарантирует рабочую сессию: вернёт живую cookie, при необходимости авто-логинясь.
async function ensureSession() {
  let cookie = loadCookie()
  if (cookie && (await sessionAlive(cookie))) return cookie
  log('сессия отсутствует/протухла → авто-логин…')
  return await doLogin({ interactive: false })
}

// --- Снятие цен конкурентов через ПУБЛИЧНЫЙ offer-view (НЕ кабинет) ---
// Логина НЕ требует (анонимный JSON Kaspi), но нужен резидентный KZ IP (этот Mac).
// Даёт ПОЛНУЮ выдачу всех продавцов → сервер считает точную позицию и второго
// конкурента (нужно для стратегии FIRST_MIN_GAP). Раньше брали price/lowest из
// кабинета — там только одна цена лидера, позиция/второй ломались.
const OV_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchOffers(pid, cityId, attempt = 0) {
  try {
    const res = await fetch(`https://kaspi.kz/yml/offer-view/offers/${pid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/*',
        Referer: `https://kaspi.kz/shop/p/-${pid}/`,
        'User-Agent': OV_UA,
        'Accept-Language': 'ru,en;q=0.9',
      },
      body: JSON.stringify({ cityId, id: pid, page: 0, limit: 64, sortOption: 'PRICE', installationId: '-1' }),
    })
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(Math.min(8000, 800 * 2 ** attempt) + Math.floor(Math.random() * 400))
      return fetchOffers(pid, cityId, attempt + 1)
    }
    if (!res.ok) return { error: `offer-view ${res.status}` }
    const d = await res.json()
    const offers = (Array.isArray(d.offers) ? d.offers : []).map((o) => ({
      price: Math.round(Number(o.price)),
      merchantId: String(o.merchantId ?? ''),
      merchantName: String(o.merchantName ?? ''),
      rating: o.merchantRating != null ? Number(o.merchantRating) : null,
      reviews: o.merchantReviewsQuantity != null ? Number(o.merchantReviewsQuantity) : null,
      kaspiDelivery: !!o.kaspiDelivery,
      deliveryDuration: o.deliveryDuration != null ? String(o.deliveryDuration) : null,
    })).filter((o) => Number.isFinite(o.price) && o.price > 0)
    return { offers }
  } catch (e) {
    return { error: e.message }
  }
}

// --- Запросы кабинета (прямой fetch с куками) ---

async function setPrice(cookie, { sku, model, value, stock }) {
  const body = {
    merchantUid: MERCHANT_UID,
    availabilities: [{ available: 'yes', storeId: `${MERCHANT_UID}_PP1`, stockCount: stock }],
    cityPrices: [{ cityId: CITY, value }],
    sku, model,
  }
  try {
    const r = await fetch(`${MC}/pricefeed/upload/merchant/process`, {
      method: 'POST',
      headers: mcHeaders(cookie, { 'content-type': 'application/json', 'x-auth-version': '3' }),
      body: JSON.stringify(body),
    })
    const d = await r.json().catch(() => null)
    return { status: r.status, id: d?.id ?? null }
  } catch (e) { return { status: 0, error: e.message } }
}

async function sessionAlive(cookie) {
  try {
    const r = await fetch(`${MC}/offers/api/v1/offer/count?m=${MERCHANT_UID}`, { headers: mcHeaders(cookie) })
    return r.ok
  } catch { return false }
}

// --- Наш сервер (tasks / ingest / confirm) ---

async function fetchTasks() {
  const r = await fetch(`${SITE}/api/admin/kaspi-dumping/tasks?secret=${encodeURIComponent(SECRET)}`)
  const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status); return d
}
async function sendIngest(results) {
  const r = await fetch(`${SITE}/api/admin/kaspi-dumping/ingest?secret=${encodeURIComponent(SECRET)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dryRun: DRY, applyHere: false, results }),
  })
  const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status); return d
}
async function sendConfirm(applied) {
  if (!applied.length) return { written: 0 }
  const r = await fetch(`${SITE}/api/admin/kaspi-dumping/confirm?secret=${encodeURIComponent(SECRET)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ applied }),
  })
  const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status); return d
}

// --- Прогон ---

async function runOnce(cookie) {
  const t = await fetchTasks()
  if (!t.enabled) { log('⏸ демпинг выключен на сервере (KASPI_DUMPING_ENABLED=false)'); return }
  const tasks = (t.tasks || []).slice(0, MAX_OPS_PER_RUN)
  if (!tasks.length) { log('нет товаров для демпинга (включи автоснижение/повышение + floor в админке)'); return }
  log(`заданий: ${tasks.length} (город ${CITY})${t.noPid ? `, без PID: ${t.noPid}` : ''}`)

  // 1) ПОЛНАЯ выдача конкурентов через публичный offer-view (точная позиция + второй)
  const results = []
  for (let i = 0; i < tasks.length; i++) {
    const { offerId, pid } = tasks[i]
    const ov = await fetchOffers(pid, CITY)
    if (ov.error) results.push({ offerId, error: ov.error })
    else results.push({ offerId, offers: ov.offers })
    if (i < tasks.length - 1) await sleep(THROTTLE_MS)
  }

  // 2) сервер считает target (в БД не пишет), вернёт changes c sku/model/stock
  const ing = await sendIngest(results)
  log(`сервер: проверено ${ing.checked}, к изменению ${ing.changed}${DRY ? ' (dry)' : ''}`)

  // 3) применяем в кабинете + подтверждаем серверу
  if (!DRY && ing.changes?.length) {
    const applied = []
    let ops = 0
    for (const c of ing.changes) {
      if (ops >= MAX_OPS_PER_RUN) { log('⚠ MAX_OPS достигнут'); break }
      if (!c.sku) { log(`   ${c.offerId}: нет sku, пропуск`); continue }
      const res = await setPrice(cookie, { sku: c.sku, model: c.model || '', value: c.new, stock: c.stock ?? 0 })
      ops++
      if (res.status === 200) {
        applied.push({ offerId: c.offerId, newPrice: c.new, status: c.status, position: c.position })
        log(`   ${c.sku}: ${c.old}→${c.new}₸ [${c.status}] OK`)
      } else if (res.status === 401 || res.status === 403) {
        // Сессия протухла посреди прогона — прерываем, чтобы не долбить отказами.
        log(`   ⛔ сессия кабинета протухла (${res.status}) — нужен повторный --login. Прерываю.`)
        break
      } else log(`   ${c.sku}: смена цены НЕ удалась → ${res.status} ${res.error || ''}`)
      await sleep(THROTTLE_MS)
    }
    const conf = await sendConfirm(applied)
    log(`✅ применено в кабинете: ${applied.length}, записано в БД: ${conf.written}`)
  } else {
    log('✅ прогон завершён (dry или без изменений)')
  }
}

async function main() {
  // --login: ручной/первый вход (видимый браузер для отладки), потом по флагам.
  if (DO_LOGIN) { await doLogin({ interactive: true }); if (ONCE) return }

  if (!SECRET) { console.error('❌ DUMPING_SECRET не задан'); process.exit(1) }

  // AlgaTop-модель: воркер сам логинится логином/паролем и сам переавторизуется
  // при протухании сессии. Ручной --login больше не обязателен.
  let cookie
  try { cookie = await ensureSession() }
  catch (e) { console.error('❌', e.message); process.exit(1) }
  log(`Кабинетный воркер · uid=${MERCHANT_UID}${DRY ? ' · DRY' : ''}${ONCE ? ' · once' : ` · цикл ${LOOP_MIN}м`}`)

  if (ONCE) { await runOnce(cookie); return }
  let loginFails = 0
  for (;;) {
    try {
      // перед каждым прогоном гарантируем живую сессию (авто-логин при протухании)
      cookie = await ensureSession()
      loginFails = 0
      await runOnce(cookie)
    } catch (e) {
      // если упал именно авто-логин — не долбим Kaspi, ждём дольше и пробуем снова
      if (/вход|логин|playwright|парол/i.test(e.message)) {
        loginFails++
        log(`❌ авто-логин не удался (${loginFails}):`, e.message)
        if (loginFails >= 5) { log('⛔ 5 неудачных входов подряд — останавливаюсь. Проверь логин/пароль.'); break }
        await sleep(Math.min(15, loginFails * 3) * 60 * 1000) // бэкофф до 15 мин
        continue
      }
      log('❌ прогон упал:', e.message)
    }
    await sleep(LOOP_MIN * 60 * 1000)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
