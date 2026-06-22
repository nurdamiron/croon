/**
 * Ежедневная отправка в Google Indexing API: до 200 URL за запуск (по умолчанию).
 * State хранит уже успешно отправленные URL. Пока очередь не пуста — шлём следующую порцию.
 *
 * Режим «круга» (по умолчанию): как только ВСЕ ссылки из sitemap уже в state — при СЛЕДУЮЩЕМ
 * запуске state очищается и обход начинается с начала (день 11 снова шлёт первые 200 и т.д.).
 *
 * На проде положи ключ и state ВНЕ папки деплоя (tar затирает frontend/):
 *   GOOGLE_INDEXING_KEY_PATH=/home/ubuntu/.secrets/google-indexing.json
 *   GOOGLE_INDEXING_STATE_PATH=/home/ubuntu/.local/google-indexing-state.json
 *
 * Cron на EC2 (каждый день 9:00):
 *   0 9 * * * . /home/ubuntu/.profile; cd /home/ubuntu/alashed-shop/frontend && \
 *     GOOGLE_INDEXING_KEY_PATH=/home/ubuntu/.secrets/google-indexing.json \
 *     GOOGLE_INDEXING_STATE_PATH=/home/ubuntu/.local/google-indexing-state.json \
 *     SITE_URL=https://croon.kz /usr/bin/node scripts/google-index-daily.js \
 *     >> /home/ubuntu/logs/google-indexing.log 2>&1
 *
 * Опции: --no-loop (не начинать круг заново), --stats, --dry-run, --max=200, --reset
 */

const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')

const DEFAULT_MAX = 200
const DEFAULT_DELAY_MS = 500

function parseArgs() {
  const out = {
    dryRun: false,
    reset: false,
    stats: false,
    /** false = при пустой очереди сбросить state и начать круг заново */
    loop: process.env.GOOGLE_INDEXING_NO_LOOP !== '1',
    max: DEFAULT_MAX,
    delayMs: DEFAULT_DELAY_MS,
    credentials: process.env.GOOGLE_INDEXING_KEY_PATH || null,
  }
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--reset') out.reset = true
    else if (a === '--stats') out.stats = true
    else if (a === '--no-loop') out.loop = false
    else if (a.startsWith('--max=')) out.max = Math.max(0, parseInt(a.split('=')[1], 10) || DEFAULT_MAX)
    else if (a.startsWith('--delay-ms=')) out.delayMs = Math.max(0, parseInt(a.split('=')[1], 10) || 0)
    else if (a.startsWith('--credentials=')) out.credentials = a.split('=').slice(1).join('=')
  }
  return out
}

function siteUrl() {
  const u = process.env.SITE_URL || process.env.NEXTAUTH_URL || 'https://croon.kz'
  return u.replace(/\/$/, '')
}

function statePath() {
  const p = process.env.GOOGLE_INDEXING_STATE_PATH
  if (p) return path.resolve(p)
  return path.join(__dirname, 'google-indexing-state.json')
}

function loadState(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    const submitted = Array.isArray(data.submitted) ? data.submitted : []
    return { submitted: new Set(submitted.map(String)) }
  } catch (e) {
    if (e.code === 'ENOENT') return { submitted: new Set() }
    throw e
  }
}

function saveState(filePath, submittedSet) {
  const payload = {
    submitted: [...submittedSet].sort(),
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 0), 'utf8')
}

async function fetchSitemapUrls(base) {
  const url = `${base}/sitemap.xml`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`sitemap HTTP ${res.status} — ${url}`)
  }
  const xml = await res.text()
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim())
  return [...new Set(locs)]
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Считает очередь; при loop и пустой очереди — что будет после сброса (без записи на диск). */
function peekPendingAfterLoop(all, submitted, loopEnabled) {
  let pending = all.filter((u) => !submitted.has(u))
  let displaySubmitted = submitted
  let wouldStartNewRound = false
  if (pending.length === 0 && all.length > 0 && loopEnabled) {
    displaySubmitted = new Set()
    pending = [...all]
    wouldStartNewRound = true
  }
  return { pending, displaySubmitted, wouldStartNewRound }
}

/** То же для боевого запуска: при новом круге реально очищает state-файл. */
function applyLoopRoundPersist(all, submitted, stateFile, loopEnabled) {
  let pending = all.filter((u) => !submitted.has(u))
  let nextSubmitted = submitted
  if (pending.length === 0 && all.length > 0 && loopEnabled) {
    console.log(
      '\n>>> Круг завершён — очищаем state; эта порция снова с начала sitemap.\n'
    )
    nextSubmitted = new Set()
    saveState(stateFile, nextSubmitted)
    pending = [...all]
  }
  return { submitted: nextSubmitted, pending }
}

async function loadSitemapForStats(stateFile, loopEnabled) {
  const base = siteUrl()
  const all = await fetchSitemapUrls(base)
  const { submitted } = loadState(stateFile)
  const peek = peekPendingAfterLoop(all, submitted, loopEnabled)
  return {
    base,
    stateFile,
    all,
    submitted: peek.displaySubmitted,
    pending: peek.pending,
    statsVirtualRound: peek.wouldStartNewRound,
  }
}

async function loadSitemapForRun(stateFile, loopEnabled) {
  const base = siteUrl()
  const all = await fetchSitemapUrls(base)
  let { submitted } = loadState(stateFile)
  const r = applyLoopRoundPersist(all, submitted, stateFile, loopEnabled)
  return { base, stateFile, all, submitted: r.submitted, pending: r.pending }
}

function printStatsReport({ all, submitted, pending, statsVirtualRound }, perDay, loopEnabled) {
  const n = all.length
  const inState = submitted.size
  const left = pending.length
  const days = left > 0 ? Math.ceil(left / perDay) : 0
  console.log('—'.repeat(56))
  console.log(`Ссылок в sitemap сейчас:     ${n}`)
  console.log(`Уже в state (текущий круг): ${inState}`)
  console.log(`Ещё не отправляли:          ${left}`)
  console.log(`Режим круга:                ${loopEnabled ? 'да (после полного прохода — снова с начала)' : 'нет (--no-loop)'}`)
  if (statsVirtualRound) {
    console.log('(В state уже весь текущий круг; при реальном запуске начнётся новый круг с начала sitemap.)')
  }
  if (left > 0) {
    console.log(`Ориентир при ${perDay}/день: ~${days} дн. до конца текущего круга`)
  } else if (loopEnabled && !statsVirtualRound) {
    console.log('Сейчас очередь пуста — при следующем запуске state обнулится и начнётся новый круг.')
  } else if (!loopEnabled) {
    console.log('Очередь пуста; новых отправок не будет, пока не появятся URL в sitemap или не сделаете --reset.')
  }
  console.log('—'.repeat(56))
}

async function main() {
  const args = parseArgs()
  const stateFile = statePath()

  if (args.reset) {
    try {
      fs.unlinkSync(stateFile)
      console.log(`Состояние удалено: ${stateFile}`)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
      console.log(`Файл состояния уже отсутствует: ${stateFile}`)
    }
    return
  }

  if (args.stats) {
    console.log(`State-файл: ${stateFile}`)
    console.log('Загрузка sitemap.xml …')
    const data = await loadSitemapForStats(stateFile, args.loop)
    console.log(`Сайт: ${data.base}\n`)
    printStatsReport(
      {
        all: data.all,
        submitted: data.submitted,
        pending: data.pending,
        statsVirtualRound: data.statsVirtualRound,
      },
      args.max,
      args.loop
    )
    return
  }

  const base = siteUrl()
  console.log(`Сайт: ${base}`)
  console.log(`State: ${stateFile}`)
  console.log(`Режим круга: ${args.loop ? 'вкл (после последнего URL — снова с начала)' : 'выкл'}`)

  console.log('Загрузка sitemap.xml …')
  let { all, submitted, pending } = await loadSitemapForRun(stateFile, args.loop)
  console.log(`URL в sitemap: ${all.length}`)
  console.log(`Уже в state: ${submitted.size}`)
  console.log(`В очереди на этот запуск: ${pending.length}`)

  const batch = pending.slice(0, args.max)
  console.log(`Порция: до ${batch.length} URL (max=${args.max})`)

  if (batch.length === 0) {
    console.log(
      'Нечего отправлять (пустой sitemap или отключён круг при пустой очереди).'
    )
    return
  }

  if (args.dryRun) {
    batch.forEach((u, i) => console.log(`${i + 1}. ${u}`))
    console.log('[dry-run] к API и записи state не было')
    return
  }

  if (!args.credentials || !fs.existsSync(path.resolve(args.credentials))) {
    console.error('Нужен GOOGLE_INDEXING_KEY_PATH=/abs/path/to.json')
    process.exit(1)
  }

  const keyPath = path.resolve(args.credentials)
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/indexing'],
  })
  const indexing = google.indexing({ version: 'v3', auth })
  await auth.authorize()
  console.log(`Аккаунт: ${key.client_email}\n`)

  let ok = 0
  let fail = 0

  for (let i = 0; i < batch.length; i++) {
    const url = batch[i]
    try {
      await indexing.urlNotifications.publish({
        requestBody: { url, type: 'URL_UPDATED' },
      })
      submitted.add(url)
      saveState(stateFile, submitted)
      ok++
      const short = url.length > 80 ? `${url.slice(0, 80)}…` : url
      process.stdout.write(`\rOK ${ok}/${batch.length} (всего в state: ${submitted.size}) ${short}`)
    } catch (e) {
      fail++
      console.error(`\nОшибка [${url}]: ${e.message || e}`)
      if (e.response?.data) console.error(JSON.stringify(e.response.data, null, 2))
    }
    if (i < batch.length - 1 && args.delayMs > 0) await sleep(args.delayMs)
  }

  console.log(`\n\nИтого: успешно ${ok}, ошибок ${fail}. В state сейчас: ${submitted.size} URL.`)

  const stillPending = all.filter((u) => !submitted.has(u)).length
  if (stillPending > 0) {
    console.log(`До конца круга осталось: ~${stillPending} URL (след. порции по cron).`)
  } else {
    console.log(
      args.loop
        ? 'Круг на сегодня закрыт — при следующем запуске state обнулится и начнётся новый круг.'
        : 'Все URL текущего sitemap в state. Включите круг (без --no-loop) или сделайте --reset.'
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
