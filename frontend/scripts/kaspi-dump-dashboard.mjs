#!/usr/bin/env node
// Mission-control дашборд Каспи-демпинг-воркера. Без внешних зависимостей.
//   node scripts/kaspi-dump-dashboard.mjs   → http://localhost:7788
// Источники: /tmp/kaspi-dump.log (живой лог воркера) + прод-API статуса (позиции из БД).
// Env: PORT, LOG, SITE (default https://alash-electronics.kz), DUMPING_SECRET|CRON_SECRET.
import http from 'node:http'
import fs from 'node:fs'
import https from 'node:https'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PORT = Number(process.env.PORT || 7788)
const LOG = process.env.LOG || '/tmp/kaspi-dump.log'
const SITE = (process.env.SITE || 'https://alash-electronics.kz').replace(/\/$/, '')
const LOOP_MIN = Number(process.env.LOOP_MIN || 2)
// каталог frontend/ (для запуска kaspi-dump.sh)
const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// секрет: из env или из frontend/.env
let SECRET = process.env.DUMPING_SECRET || process.env.CRON_SECRET || ''
if (!SECRET) {
  try {
    const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    SECRET = (env.match(/^CRON_SECRET=(.+)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '')
  } catch {}
}

// Всё время на дашборде — по Алматы (UTC+5), независимо от TZ процесса дашборда.
// ВАЖНО: воркор пишет таймстампы в лог в UTC (new Date().toISOString().slice(11,19)).
const TZ = process.env.TZ_DISPLAY || 'Asia/Almaty'
const TZ_OFFSET_MIN = 5 * 60 // Asia/Almaty без перехода на летнее время
const fmtTime = (d) => d.toLocaleTimeString('ru', { timeZone: TZ, hour12: false })
const fmtDateTime = (d) => d.toLocaleString('ru', { timeZone: TZ, hour12: false })

// UTC HH:MM:SS из лога → абсолютный ms (привязка к сегодняшней дате в UTC).
function utcClockToMs(h, mi, s) {
  const now = new Date()
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), da = now.getUTCDate()
  let t = Date.UTC(y, mo, da, h, mi, s)
  // лог-время в будущем относительно now (>2ч) → это вчерашняя запись (перешли полночь UTC)
  if (t - now.getTime() > 2 * 3600 * 1000) t -= 24 * 3600 * 1000
  return t
}
// UTC "HH:MM:SS" из лога → отображение по Алматы "HH:MM:SS".
function utcClockToAlmaty(hhmmss) {
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hhmmss || '')
  if (!m) return hhmmss || ''
  return fmtTime(new Date(utcClockToMs(+m[1], +m[2], +m[3])))
}

// SKU → кликабельная ссылка на карточку Kaspi.
//  1) реальная ссылка из БД (urlMap[sku]) — работает и для коротких артикулов «905»;
//  2) иначе составной SKU "PID_storeId" → строим прямую ссылку по product-id;
//  3) короткий артикул без ссылки в БД — отдаём как текст (прямую ссылку не построить).
function skuLink(sku, urlMap) {
  const s = String(sku || '')
  const a = (href) => `<a class="skulink" href="${href}" target="_blank" rel="noopener">${s}</a>`
  if (urlMap && urlMap[s]) return a(urlMap[s])
  if (/^\d+_\d+$/.test(s)) return a(`https://kaspi.kz/shop/p/-${s.split('_')[0]}/?c=750000000`)
  return s
}

// ── Парсер лога (за текущую сессию воркера) ─────────────────────────────────
function parseLog() {
  let text = ''
  try { text = fs.readFileSync(LOG, 'utf8') } catch { return { ok: false } }
  let lines = text.split('\n').filter(Boolean)
  let startIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) if (/Кабинетный воркер|демпинг-воркер/.test(lines[i])) { startIdx = i; break }
  const sessionLines = startIdx >= 0 ? lines.slice(startIdx) : lines

  const runs = [], checks = [], applied = [], changes = [], errors = []
  let sessionDead = false, lastApplyTs = null
  for (const ln of sessionLines) {
    const t = ln.slice(0, 8); let m
    if ((m = ln.match(/заданий:\s*(\d+)/))) runs.push({ time: t, tasks: +m[1] })
    if ((m = ln.match(/проверено\s*(\d+),\s*к изменению\s*(\d+)/))) checks.push({ time: t, checked: +m[1], toChange: +m[2] })
    if ((m = ln.match(/применено в кабинете:\s*(\d+)/))) { applied.push({ time: t, applied: +m[1] }); lastApplyTs = t; sessionDead = false }
    if ((m = ln.match(/^\d{2}:\d{2}:\d{2}\s+([0-9A-Za-z_]+):\s*(\d+)→(\d+)₸\s*\[([a-z_]+)\]\s*OK/)))
      changes.push({ time: t, sku: m[1], from: +m[2], to: +m[3], status: m[4] })
    if ((m = ln.match(/^\d{2}:\d{2}:\d{2}\s+([0-9A-Za-z_]+):\s*смена цены НЕ удалась →\s*(.+)$/)))
      errors.push({ time: t, sku: m[1], msg: m[2].trim() })
    // Флаг «сессия мертва» отражает ТЕКУЩЕЕ состояние, а не «когда-либо за сессию»:
    // протухание ставит флаг, но любой признак восстановления (успешный авто-вход,
    // применённая цена выше, новый запуск воркера) — снимает его.
    if (/сессия.*протухла|⛔/i.test(ln)) sessionDead = true
    if (/авто-вход выполнен|куки сохранены|Кабинетный воркер/i.test(ln)) sessionDead = false
  }
  const byStatus = {}
  for (const c of changes) byStatus[c.status] = (byStatus[c.status] || 0) + 1
  let mtime = null; try { mtime = fs.statSync(LOG).mtime.getTime() } catch {}

  // тренд «к изменению» по последним прогонам — для спарклайна
  const trend = checks.slice(-20).map(c => c.toChange)

  return {
    ok: true, sessionDead, mtime,
    totalRuns: runs.length,
    lastRun: runs[runs.length - 1] || null,
    lastCheck: checks[checks.length - 1] || null,
    totalApplied: applied.reduce((s, a) => s + a.applied, 0),
    totalChanges: changes.length,
    totalErrors: errors.length,
    byStatus, trend,
    recentChanges: changes.slice(-40).reverse(),
    recentErrors: errors.slice(-12).reverse(),
    recentRuns: checks.slice(-15).reverse(),
  }
}

// последняя строка-таймстамп лога → оценка времени следующего прогона
function lastRunStartedMs() {
  try {
    const text = fs.readFileSync(LOG, 'utf8')
    const lines = text.split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/^(\d{2}):(\d{2}):(\d{2})\s+заданий:/)
      if (m) return utcClockToMs(+m[1], +m[2], +m[3])
    }
  } catch {}
  return null
}

// ── Прод-статус (позиции из БД) с кэшем ─────────────────────────────────────
let prodCache = { at: 0, data: null }
function fetchProdStatus() {
  return new Promise((resolve) => {
    if (Date.now() - prodCache.at < 20000 && prodCache.data) return resolve(prodCache.data)
    if (!SECRET) return resolve(null)
    // секрет в заголовке (не в URL/логах) — безопаснее
    const url = `${SITE}/api/admin/kaspi-dumping/status`
    https.get(url, { timeout: 8000, headers: { Authorization: `Bearer ${SECRET}` } }, (r) => {
      let s = ''; r.on('data', d => s += d); r.on('end', () => {
        try { const j = JSON.parse(s); prodCache = { at: Date.now(), data: j }; resolve(j) } catch { resolve(null) }
      })
    }).on('error', () => resolve(null)).on('timeout', function () { this.destroy(); resolve(null) })
  })
}

function workerAlive(d) { return d.mtime && (Date.now() - d.mtime) < 6 * 60 * 1000 }

// ── HTML ────────────────────────────────────────────────────────────────────
function spark(arr) {
  if (!arr || !arr.length) return ''
  const blocks = '▁▂▃▄▅▆▇█'
  const max = Math.max(...arr, 1)
  return arr.map(v => blocks[Math.min(7, Math.floor((v / max) * 7))]).join('')
}

function html(d, prod) {
  const alive = workerAlive(d)
  const urlMap = prod?.skuUrl || {} // kaspiSku → реальная ссылка на карточку Kaspi (из БD)
  const ago = (ms) => { if (!ms) return '—'; const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? s + 'с' : s < 3600 ? Math.round(s / 60) + 'м' : Math.round(s / 3600) + 'ч' }
  const SC = { winning: '#22c55e', no_competitors: '#38bdf8', floor: '#f59e0b', matched: '#a78bfa', unchanged: '#64748b', skipped: '#64748b' }
  const SL = { winning: 'в топе', no_competitors: 'один → MAX', floor: 'упёрся в пол', matched: 'равно лидеру', unchanged: 'без измен.', skipped: 'пропуск' }

  const lastStart = lastRunStartedMs()
  const nextEta = lastStart ? lastStart + (3 * 60 + LOOP_MIN * 60) * 1000 : null // ~3мин снятие + LOOP_MIN пауза

  const pos = prod?.positions || {}
  const off = prod?.offers || {}
  const posTotal = (pos.pos1 || 0) + (pos.pos2 || 0) + (pos.pos3 || 0) + (pos.pos4plus || 0) + (pos.alone || 0)
  const bar = (n, color) => { const pct = posTotal ? Math.round((n / posTotal) * 100) : 0; return `<div class="barwrap"><div class="bar" style="width:${pct}%;background:${color}"></div></div>` }

  const chRows = d.recentChanges.map(c => {
    const up = c.to > c.from
    return `<tr><td class="mono dim">${utcClockToAlmaty(c.time)}</td><td class="mono">${skuLink(c.sku, urlMap)}</td>
      <td class="mono dim">${c.from.toLocaleString('ru')}</td>
      <td class="mono ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${c.to.toLocaleString('ru')}₸</td>
      <td><span class="badge" style="background:${SC[c.status] || '#475569'}">${SL[c.status] || c.status}</span></td></tr>`
  }).join('')
  const errRows = d.recentErrors.length ? d.recentErrors.map(e =>
    `<tr><td class="mono dim">${utcClockToAlmaty(e.time)}</td><td class="mono">${e.sku ? skuLink(e.sku, urlMap) : '—'}</td><td class="err">${e.msg}</td></tr>`).join('')
    : '<tr><td colspan=3 class="dim ok">✓ ошибок нет</td></tr>'
  const runRows = d.recentRuns.map(r =>
    `<tr><td class="mono dim">${utcClockToAlmaty(r.time)}</td><td class="mono">${r.checked}</td><td class="mono ${r.toChange > 0 ? 'hot' : 'dim'}">${r.toChange}</td></tr>`).join('')
  const chips = Object.entries(d.byStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    `<span class="chip" style="--c:${SC[k] || '#64748b'}">${SL[k] || k} <b>${v}</b></span>`).join('')

  const recentLog = (prod?.recentLog || []).slice(0, 8).map(r => {
    const label = (r.name || r.sku || '').slice(0, 28)
    const s = String(r.sku || '')
    const href = urlMap[s] || (/^\d+_\d+$/.test(s) ? `https://kaspi.kz/shop/p/-${s.split('_')[0]}/?c=750000000` : null)
    const cell = href ? `<a class="skulink" href="${href}" target="_blank" rel="noopener">${label}</a>` : label
    return `<tr><td class="mono dim">${fmtTime(new Date(r.at))}</td><td>${cell}</td>
     <td class="mono dim">${(r.old || 0).toLocaleString('ru')}</td><td class="mono">${(r.new || 0).toLocaleString('ru')}₸</td></tr>`
  }).join('')

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DUMP · mission control</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;800&family=Sora:wght@600;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#070a12;--panel:#0e1320;--panel2:#131a2b;--line:#1e2942;--txt:#cfdbf0;--dim:#5b6b8c;--grn:#22c55e;--red:#ef4444;--amb:#f59e0b;--cy:#38bdf8}
*{box-sizing:border-box;margin:0;padding:0}
body{font:14px/1.5 'JetBrains Mono',monospace;background:
  radial-gradient(1200px 600px at 80% -10%,rgba(56,189,248,.08),transparent),
  radial-gradient(900px 500px at -10% 110%,rgba(34,197,94,.06),transparent),var(--bg);
  color:var(--txt);min-height:100vh;padding:22px;background-attachment:fixed}
.grain{position:fixed;inset:0;pointer-events:none;opacity:.035;z-index:99;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.wrap{max-width:1180px;margin:0 auto}
header{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:20px;border-bottom:1px solid var(--line);padding-bottom:14px}
h1{font:800 22px/1 'Sora',sans-serif;letter-spacing:.5px;display:flex;align-items:center;gap:10px}
.dot{width:10px;height:10px;border-radius:50%;box-shadow:0 0 12px currentColor}
.live{color:var(--grn);animation:pulse 1.4s infinite} .off{color:var(--red)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.meta{color:var(--dim);font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:18px}
.kpi{background:linear-gradient(160deg,var(--panel),var(--panel2));border:1px solid var(--line);border-radius:14px;padding:14px 16px;position:relative;overflow:hidden}
.kpi::before{content:'';position:absolute;top:0;left:0;width:3px;height:100%;background:var(--ac,var(--cy))}
.kpi .l{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
.kpi .v{font:800 26px/1 'Sora',sans-serif} .kpi .s{font-size:11px;color:var(--dim);margin-top:3px}
.timer{grid-column:span 2}
.timer .v{font-size:30px;font-variant-numeric:tabular-nums;color:var(--cy)}
.ring{--p:0;width:52px;height:52px;border-radius:50%;position:absolute;right:14px;top:14px;
  background:conic-gradient(var(--cy) calc(var(--p)*1%),#1a2236 0)} .ring::after{content:'';position:absolute;inset:5px;border-radius:50%;background:var(--panel)}
.cols{display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-bottom:16px}
@media(max-width:860px){.cols{grid-template-columns:1fr}}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
.panel h2{font:600 12px/1 'JetBrains Mono';text-transform:uppercase;letter-spacing:1px;color:var(--dim);margin-bottom:12px;display:flex;justify-content:space-between}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;color:var(--dim);font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;padding:5px 7px;border-bottom:1px solid var(--line)}
td{padding:6px 7px;border-bottom:1px solid #131a2b}
tr:hover td{background:#101728}
.mono{font-family:'JetBrains Mono'} .dim{color:var(--dim)} .err{color:#fca5a5} .ok{color:var(--grn)}
.up{color:var(--grn)} .down{color:var(--amb)} .hot{color:var(--cy);font-weight:800}
.skulink{color:var(--cy);text-decoration:none;border-bottom:1px dotted rgba(56,189,248,.4)} .skulink:hover{color:#7dd3fc;border-bottom-color:#7dd3fc}
.badge{color:#04140a;font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:6px;white-space:nowrap}
.chip{display:inline-block;border:1px solid var(--c);color:var(--c);border-radius:20px;padding:3px 12px;font-size:11.5px;margin:3px 4px 0 0}
.chip b{color:#fff}
.poslist{display:flex;flex-direction:column;gap:9px}
.posrow{display:grid;grid-template-columns:120px 1fr 46px;align-items:center;gap:10px;font-size:12.5px}
.barwrap{height:8px;background:#0a0f1a;border-radius:5px;overflow:hidden}
.bar{height:100%;border-radius:5px;transition:width .6s}
.spark{font-size:18px;letter-spacing:1px;color:var(--cy)}
.warn{background:rgba(239,68,68,.1);border:1px solid var(--red);color:#fca5a5;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13px}
.foot{color:var(--dim);font-size:11px;text-align:center;margin-top:18px}
.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px}
.btn{font:600 13px 'JetBrains Mono';border:1px solid var(--line);background:var(--panel2);color:var(--txt);padding:9px 16px;border-radius:10px;cursor:pointer;transition:.15s;letter-spacing:.3px}
.btn:hover{transform:translateY(-1px);filter:brightness(1.15)}
.btn:active{transform:translateY(0)}
.btn.restart{border-color:#0ea5e9;color:#7dd3fc} .btn.stop{border-color:var(--red);color:#fca5a5} .btn.start{border-color:var(--grn);color:#86efac}
.btn.login{border-color:var(--amb);color:#fcd34d} .btn.ghost{opacity:.8}
.btn:disabled{opacity:.4;cursor:wait}
.actmsg{font-size:12px;color:var(--dim)} .actmsg.ok{color:var(--grn)} .actmsg.bad{color:var(--red)}
.credsbox{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:16px}
.credstitle{font-size:13px;font-weight:600;color:var(--txt);margin-bottom:10px}
.credshint{font-weight:400;color:var(--dim);font-size:11px}
.credsrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.credsrow input{font:600 13px 'JetBrains Mono';background:var(--panel2);border:1px solid var(--line);color:var(--txt);padding:9px 12px;border-radius:9px;outline:none;min-width:200px}
.credsrow input:focus{border-color:var(--cy)}
.rawlog{background:#05080f;border:1px solid var(--line);border-radius:12px;padding:14px;font-size:11.5px;color:#9fb3d4;max-height:340px;overflow:auto;margin-bottom:16px;white-space:pre-wrap;line-height:1.45}
.ledger{display:flex;align-items:stretch;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.ledger .lg{flex:1;min-width:140px;background:linear-gradient(160deg,var(--panel),var(--panel2));border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column}
.ledger .n{font:800 24px/1 'Sora',sans-serif} .ledger .t{font-size:12px;margin-top:4px;color:var(--txt)} .ledger .h{font-size:10.5px;color:var(--dim);margin-top:3px}
.ledger .ok .n{color:var(--grn)} .ledger .warn-n .n{color:var(--amb)} .ledger .bad-n .n{color:var(--red)}
.ledger .sep{display:flex;align-items:center;color:var(--dim);font-size:20px}
</style></head><body><div class="grain"></div><div class="wrap">

<header>
  <h1><span class="dot ${alive ? 'live' : 'off'}">●</span> DUMP · MISSION CONTROL</h1>
  <div class="meta">воркер: <b style="color:${alive ? 'var(--grn)' : 'var(--red)'}">${alive ? 'РАБОТАЕТ' : 'МОЛЧИТ'}</b>
   · демпинг: <b style="color:${prod?.enabled ? 'var(--grn)' : 'var(--amb)'}">${prod == null ? '?' : prod.enabled ? 'ВКЛ' : 'ВЫКЛ'}</b>
   · лог: ${ago(d.mtime)} назад · ${fmtTime(new Date())} (Алматы)</div>
</header>

${d.sessionDead ? `<div class="warn">⚠ Сессия протухала — воркер переавторизуется сам (логин/пароль сохранены). Если повторяется — обнови логин/пароль кнопкой ниже.</div>` : ''}

<div class="actions">
  <button class="btn restart" onclick="act('restart',this)">⟲ Перезапустить воркер</button>
  <button class="btn ${prod?.enabled ? 'stop' : 'start'}" onclick="act('toggle',this)">${prod?.enabled ? '■ Стоп демпинга' : '▶ Старт демпинга'}</button>
  <button class="btn login" onclick="showCreds()">🔑 Логин/пароль</button>
  <button class="btn ghost" onclick="act('login',this)" title="Открыть видимый браузер для ручного входа (запасной вариант)">🖥 Ручной вход</button>
  <button class="btn ghost" onclick="toggleLog()">📜 Сырой лог</button>
  <span id="actmsg" class="actmsg"></span>
</div>

<!-- Форма логина/пароля робота (AlgaTop-модель): один раз ввёл — воркер логинится сам -->
<div id="credsbox" class="credsbox" style="display:none">
  <div class="credstitle">Логин и пароль робота Kaspi <span class="credshint">(вводишь один раз, хранится локально на маке)</span></div>
  <div class="credsrow">
    <input id="cuser" type="text" placeholder="email робота" autocomplete="off">
    <input id="cpass" type="password" placeholder="пароль" autocomplete="off">
    <button class="btn start" onclick="saveCreds(this)">💾 Сохранить</button>
    <button class="btn ghost" onclick="document.getElementById('credsbox').style.display='none';paused=false">отмена</button>
  </div>
</div>
<pre id="rawlog" class="rawlog" style="display:none"></pre>

<div class="ledger">
  <div class="lg"><span class="n">${off.active ?? '—'}</span><span class="t">офферов-карточек</span><span class="h">всего привязок к Kaspi</span></div>
  <div class="sep">→</div>
  <div class="lg ok"><span class="n">${off.onSale ?? '—'}</span><span class="t">в продаже</span><span class="h">реально на витрине Kaspi</span></div>
  <div class="lg warn-n"><span class="n">${off.outOfStock ?? '—'}</span><span class="t">нет в наличии</span><span class="h">оффер есть, склад 0 → не видно</span></div>
  <div class="lg bad-n"><span class="n">${off.notVisible ?? '—'}</span><span class="t">нас нет в выдаче</span><span class="h">конкуренты есть, мы дороже/глубоко</span></div>
</div>

<div class="grid">
  <div class="kpi timer" style="--ac:var(--cy)">
    <div class="ring" id="ring"></div>
    <div class="l">след. демпинг через</div>
    <div class="v" id="timer" data-eta="${nextEta || 0}">—</div>
    <div class="s">цикл ~${3 + LOOP_MIN} мин (снятие 200 + пауза ${LOOP_MIN}м)</div>
  </div>
  <div class="kpi" style="--ac:var(--cy)"><div class="l">последний прогон</div><div class="v">${d.lastRun ? d.lastRun.tasks : '—'}</div><div class="s">товаров за цикл</div></div>
  <div class="kpi" style="--ac:var(--grn)"><div class="l">применено</div><div class="v">${d.totalApplied}</div><div class="s">цен за сессию</div></div>
  <div class="kpi" style="--ac:${d.totalErrors ? 'var(--red)' : 'var(--grn)'}"><div class="l">ошибок</div><div class="v">${d.totalErrors}</div><div class="s">за сессию</div></div>
  <div class="kpi" style="--ac:var(--cy)"><div class="l">тренд изменений</div><div class="v spark">${spark(d.trend) || '—'}</div><div class="s">к изм. по прогонам</div></div>
</div>

<div class="cols">
  <div class="panel">
    <h2><span>изменения цен · live</span><span class="dim">${d.recentChanges.length}</span></h2>
    <table><thead><tr><th>t</th><th>SKU</th><th>было</th><th>стало</th><th>статус</th></tr></thead>
    <tbody>${chRows || '<tr><td colspan=5 class=dim>ждём прогон…</td></tr>'}</tbody></table>
  </div>
  <div class="panel">
    <h2>позиции на Kaspi ${prod ? '' : '<span class=dim>(нет связи с прод)</span>'}</h2>
    <div class="poslist">
      <div class="posrow"><span>🥇 мы первые</span>${bar(pos.pos1 || 0, 'var(--grn)')}<b>${pos.pos1 ?? '—'}</b></div>
      <div class="posrow"><span>🥈 вторые</span>${bar(pos.pos2 || 0, '#84cc16')}<b>${pos.pos2 ?? '—'}</b></div>
      <div class="posrow"><span>🥉 третьи</span>${bar(pos.pos3 || 0, 'var(--amb)')}<b>${pos.pos3 ?? '—'}</b></div>
      <div class="posrow"><span>⬇ 4+ / нет нас</span>${bar(pos.pos4plus || 0, 'var(--red)')}<b>${pos.pos4plus ?? '—'}</b></div>
      <div class="posrow"><span>⚪ одни в карт.</span>${bar(pos.alone || 0, 'var(--cy)')}<b>${pos.alone ?? '—'}</b></div>
    </div>
    <h2 style="margin-top:16px">готовность</h2>
    <table><tbody>
      <tr><td class="dim">активных офферов</td><td class="mono" style="text-align:right">${off.active ?? '—'}</td></tr>
      <tr><td class="dim">снижение / повышение вкл</td><td class="mono" style="text-align:right">${off.downOn ?? '—'} / ${off.upOn ?? '—'}</td></tr>
      <tr><td class="dim">с конкурентами</td><td class="mono" style="text-align:right">${off.withComp ?? '—'}</td></tr>
      <tr><td class="dim">⚠ снижение без floor</td><td class="mono ${off.downNoFloor ? 'err' : 'ok'}" style="text-align:right">${off.downNoFloor ?? '—'}</td></tr>
      <tr><td class="dim">нет закупа</td><td class="mono" style="text-align:right">${off.noCost ?? '—'}</td></tr>
      <tr><td class="dim">не проверялись ни разу</td><td class="mono" style="text-align:right">${off.notChecked ?? '—'}</td></tr>
      <tr><td class="dim">давно (>24ч)</td><td class="mono" style="text-align:right">${off.stale24h ?? '—'}</td></tr>
    </tbody></table>
  </div>
</div>

<div class="panel" style="margin-bottom:16px"><h2>статусы за сессию</h2>${chips || '<span class=dim>пока нет данных</span>'}</div>

<div class="cols">
  <div class="panel"><h2>прогоны · проверено / к изменению</h2>
    <table><thead><tr><th>t</th><th>проверено</th><th>к изм.</th></tr></thead><tbody>${runRows || '<tr><td colspan=3 class=dim>—</td></tr>'}</tbody></table>
  </div>
  <div class="panel"><h2>ошибки</h2>
    <table><thead><tr><th>t</th><th>SKU</th><th>сообщение</th></tr></thead><tbody>${errRows}</tbody></table>
  </div>
</div>

<div class="foot">данные обновляются автоматически · лог: ${LOG} · прод: ${SITE}</div>
</div>

<script>
// живой таймер обратного отсчёта до следующего прогона
function tick(){
  const el=document.getElementById('timer'), ring=document.getElementById('ring')
  let eta=+el.dataset.eta
  if(!eta){el.textContent='скоро…';return}
  let left=Math.round((eta-Date.now())/1000)
  if(left<=0){el.textContent='идёт прогон…';el.style.color='var(--grn)';ring.style.setProperty('--p',100);return}
  const m=Math.floor(left/60),s=left%60
  el.textContent=m+':'+String(s).padStart(2,'0')
  const total=(3*60+${LOOP_MIN}*60); ring.style.setProperty('--p',Math.max(0,100-left/total*100))
}
setInterval(tick,1000); tick()
let paused=false
// действия (рестарт/тоггл/логин)
async function act(a,btn){
  const msg=document.getElementById('actmsg'); btn.disabled=true; paused=true
  msg.className='actmsg'; msg.textContent='выполняю '+a+'…'
  try{
    const r=await fetch('/act/'+a,{method:'POST'}); const j=await r.json()
    msg.className='actmsg '+(j.ok?'ok':'bad'); msg.textContent=j.msg||(j.ok?'готово':'ошибка')
  }catch(e){ msg.className='actmsg bad'; msg.textContent='сбой: '+e.message }
  btn.disabled=false; setTimeout(()=>{paused=false;location.reload()},2500)
}
async function toggleLog(){
  const el=document.getElementById('rawlog')
  if(el.style.display==='none'){ paused=true; const r=await fetch('/raw-log'); el.textContent=await r.text(); el.style.display='block'; el.scrollTop=el.scrollHeight }
  else { el.style.display='none'; paused=false }
}
function showCreds(){
  const b=document.getElementById('credsbox')
  const show=b.style.display==='none'
  b.style.display=show?'block':'none'; paused=show
  if(show) document.getElementById('cuser').focus()
}
async function saveCreds(btn){
  const user=document.getElementById('cuser').value.trim()
  const pass=document.getElementById('cpass').value
  const msg=document.getElementById('actmsg')
  if(!user||!pass){ msg.className='actmsg bad'; msg.textContent='введи логин и пароль'; return }
  btn.disabled=true; msg.className='actmsg'; msg.textContent='сохраняю…'
  try{
    const r=await fetch('/act/creds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user,pass})})
    const j=await r.json()
    msg.className='actmsg '+(j.ok?'ok':'bad'); msg.textContent=j.msg
    if(j.ok){ document.getElementById('cpass').value=''; document.getElementById('credsbox').style.display='none' }
  }catch(e){ msg.className='actmsg bad'; msg.textContent='сбой: '+e.message }
  btn.disabled=false; setTimeout(()=>{paused=false},3000)
}
// автоперезагрузка каждые 12с, но не во время действий/просмотра лога
setInterval(()=>{ if(!paused) location.reload() },12000)
</script>
</body></html>`
}

// ── Действия (выполняются на маке) ──────────────────────────────────────────
function sh(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: FRONTEND_DIR, timeout: 20000 }, (err, out, errout) =>
      resolve({ ok: !err, out: (out || '') + (errout || '') }))
  })
}
async function toggleDumping() {
  // вкл/выкл глобальный флаг на проде через ingest? нет — через SSM нельзя из браузера.
  // Дёргаем status, читаем текущее, и переключаем через прод-эндпоинт switches.
  const cur = await fetchProdStatus()
  const turnOn = !(cur && cur.enabled)
  // POST на наш status-роут (Bearer-секрет, не cookie-сессия)
  return new Promise((resolve) => {
    const body = JSON.stringify({ enabled: turnOn })
    const req2 = https.request(`${SITE}/api/admin/kaspi-dumping/status`, {
      method: 'POST', timeout: 8000,
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${SECRET}`, 'content-length': Buffer.byteLength(body) },
    }, (r) => { let s = ''; r.on('data', d => s += d); r.on('end', () => { prodCache.at = 0; resolve({ ok: r.statusCode < 300, msg: r.statusCode < 300 ? (turnOn ? 'демпинг ВКЛючён ▶' : 'демпинг ВЫКЛючен ■') : 'ошибка ' + r.statusCode }) }) })
    req2.on('error', (e) => resolve({ ok: false, msg: 'ошибка: ' + e.message }))
    req2.on('timeout', function () { this.destroy(); resolve({ ok: false, msg: 'таймаут' }) })
    req2.end(body)
  })
}

// CSRF/origin-защита для изменяющих действий: разрешаем только same-origin
// (Origin/Referer = localhost:PORT). Сервер слушает только 127.0.0.1 (см. listen),
// так что из LAN недоступен. Этого достаточно для локального дашборда.
function sameOrigin(req) {
  const ok = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]
  const o = req.headers.origin
  if (o) return ok.includes(o)
  const ref = req.headers.referer
  if (ref) return ok.some(u => ref.startsWith(u + '/') || ref === u + '/')
  return false  // нет ни Origin, ни Referer → отклоняем (curl/чужой контекст)
}

const server = http.createServer(async (req, res) => {
  const d = parseLog()
  const json = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)) }

  // изменяющие действия — только same-origin (защита от CSRF)
  if (req.method === 'POST' && req.url?.startsWith('/act/')) {
    if (!sameOrigin(req)) { res.writeHead(403); return res.end('forbidden: bad origin') }
  }

  // действия (POST)
  if (req.method === 'POST' && req.url === '/act/restart') {
    const r = await sh('./scripts/kaspi-dump.sh install')   // переустановит launchd → новый цикл сразу
    return json({ ok: r.ok, msg: r.ok ? 'воркер перезапущен ⟲' : 'не удалось: ' + r.out.slice(0, 120) })
  }
  if (req.method === 'POST' && req.url === '/act/login') {
    // запускаем вход в фоне (откроется браузер на маке)
    exec('nohup ./scripts/kaspi-dump.sh login > /tmp/kaspi-login.log 2>&1 &', { cwd: FRONTEND_DIR })
    return json({ ok: true, msg: 'открываю браузер входа — заверши вход в окне' })
  }
  // Сохранить логин/пароль робота (AlgaTop-модель): пишем в локальный файл 0600,
  // воркер сам залогинится ими при старте/протухании сессии. Креды НЕ уходят на прод.
  if (req.method === 'POST' && req.url === '/act/creds') {
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy() })
    req.on('end', () => {
      try {
        const { user, pass } = JSON.parse(body || '{}')
        if (!user || !pass) return json({ ok: false, msg: 'нужны и логин, и пароль' })
        const file = path.join(FRONTEND_DIR, '.kaspi-credentials.json')
        const fd = fs.openSync(file, 'w', 0o600)
        try { fs.writeSync(fd, JSON.stringify({ user, pass, savedAt: new Date().toISOString() }, null, 2)) }
        finally { fs.closeSync(fd) }
        // сразу пробуем авто-вход и перезапуск воркера, чтобы подхватить креды
        exec('nohup ./scripts/kaspi-dump.sh install > /tmp/kaspi-login.log 2>&1 &', { cwd: FRONTEND_DIR })
        json({ ok: true, msg: 'логин/пароль сохранены — воркер залогинится сам ✓' })
      } catch (e) { json({ ok: false, msg: 'ошибка: ' + e.message }) }
    })
    return
  }
  if (req.method === 'POST' && req.url === '/act/toggle') {
    return json(await toggleDumping())
  }
  if (req.url === '/raw-log') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    try { const t = fs.readFileSync(LOG, 'utf8').split('\n').slice(-60).join('\n'); return res.end(t) }
    catch { return res.end('лог недоступен') }
  }
  if (req.url === '/api') {
    const prod = await fetchProdStatus()
    return json({ alive: workerAlive(d), ...d, prod })
  }
  const prod = await fetchProdStatus()
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html(d, prod))
})
// слушаем ТОЛЬКО loopback — недоступно из LAN
server.listen(PORT, '127.0.0.1', () => console.log(`Дашборд: http://localhost:${PORT}  (loopback-only, лог ${LOG}, прод ${SITE}, секрет ${SECRET ? 'ok' : 'НЕТ'})`))
