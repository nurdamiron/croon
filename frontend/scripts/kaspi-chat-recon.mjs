// РАЗВЕДКА чатов/сообщений Kaspi-кабинета.
// Открывает кабинет в ВИДИМОМ браузере с сохранённой сессией (.kaspi-session.json),
// логирует ВСЕ сетевые запросы к mc.shop.kaspi.kz, пока ты вручную ходишь по разделу
// «Сообщения». Цель — найти внутренние эндпоинты: список диалогов, сообщения, и т.п.
//
// Запуск (с мака, где лежит залогиненная сессия):
//   node scripts/kaspi-chat-recon.mjs
// Затем в открывшемся браузере зайди в раздел сообщений, открой пару диалогов.
// Все запросы пишутся в консоль и в файл kaspi-chat-recon.log (JSON-строки).
//
// НИЧЕГО НЕ ОТПРАВЛЯЕТ — только наблюдает. Закрыть: Ctrl+C.

import fs from 'node:fs'

const SESSION_FILE = process.env.KASPI_SESSION_FILE || './.kaspi-session.json'
const OUT = './kaspi-chat-recon.log'
const MC_HOST = 'mc.shop.kaspi.kz'

function loadCookiePairs() {
  if (!fs.existsSync(SESSION_FILE)) {
    throw new Error(`нет ${SESSION_FILE} — сначала залогинься воркером: node scripts/kaspi-cabinet-worker.mjs --login`)
  }
  const j = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))
  const cookie = j.cookie || ''
  // строку "a=1; b=2" → массив playwright-куки для нужных доменов
  return cookie.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf('=')
    const name = p.slice(0, i)
    const value = p.slice(i + 1)
    return { name, value, domain: '.kaspi.kz', path: '/' }
  })
}

const interesting = (url) =>
  url.includes(MC_HOST) &&
  /chat|message|messag|dialog|conversation|inbox|notif|comment|review|feedback|support|ticket/i.test(url)

;(async () => {
  let chromium
  try { ({ chromium } = await import('playwright')) }
  catch { throw new Error('нужен playwright: npm i playwright && npx playwright install chromium') }

  const cookies = loadCookiePairs()
  const browser = await chromium.launch({ headless: false })
  const ctx = await browser.newContext()
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()

  const log = (obj) => {
    const line = JSON.stringify(obj)
    fs.appendFileSync(OUT, line + '\n')
  }

  // Логируем ВСЕ запросы к mc.shop.kaspi.kz; «интересные» подсвечиваем.
  page.on('requestfinished', async (req) => {
    const url = req.url()
    if (!url.includes(MC_HOST)) return
    const method = req.method()
    let status = null
    let bodySnippet = null
    let respCT = null
    try {
      const resp = await req.response()
      if (resp) {
        status = resp.status()
        respCT = resp.headers()['content-type'] || ''
        if (/json|text/i.test(respCT)) {
          const txt = await resp.text().catch(() => '')
          bodySnippet = txt.slice(0, 600)
        }
      }
    } catch {}
    const postData = req.postData()?.slice(0, 400) || null
    const rec = { t: new Date().toISOString().slice(11, 19), method, status, url, respCT, postData, bodySnippet }
    log(rec)
    const tag = interesting(url) ? '★ CHAT?' : '·'
    console.log(`${tag} ${method} ${status ?? '-'} ${url}`)
    if (interesting(url) && bodySnippet) console.log(`      body: ${bodySnippet.replace(/\s+/g, ' ').slice(0, 200)}`)
  })

  console.log('Открываю кабинет Kaspi. Зайди в раздел «Сообщения», открой пару диалогов.')
  console.log(`Все запросы → ${OUT}. Помеченные ★ — кандидаты на API чатов. Ctrl+C для выхода.\n`)
  await page.goto('https://kaspi.kz/mc/#/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})

  // держим процесс живым, пока не закроют
  await new Promise(() => {})
})().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1) })
