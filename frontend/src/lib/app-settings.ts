// Глобальные тумблеры (key-value в AppSetting). Меняются «на лету» из админки,
// без рестарта. Используются для аварийных переключателей Kaspi.
import { prisma } from '@/lib/prisma'

// Ключи тумблеров Kaspi.
export const KASPI_FEED_ENABLED = 'kaspi_feed_enabled'             // фид отдаёт товары на Kaspi
export const KASPI_SITE_BLOCKS_ENABLED = 'kaspi_site_blocks_enabled' // блоки «Купить на Kaspi» на сайте

// Демпинг (автоуправление ценой). Глобальный аварийный тумблер: off → крон ничего
// не меняет. По умолчанию ВЫКЛ (демпинг — опасная автоматика, включается осознанно).
export const KASPI_DUMPING_ENABLED = 'kaspi_dumping_enabled'

// Множитель комиссии Kaspi для расчёта маржи/floor (число-строка, напр. "1.41").
// margin = price − costPrice × mult; floorAuto = round(costPrice × mult).
export const KASPI_COMMISSION_MULT = 'kaspi_commission_mult'
export const KASPI_COMMISSION_MULT_DEFAULT = 1.41

// Метка последнего опроса tasks внешним кабинетным воркером (ISO-строка) — для
// индикации «воркер жив» в админке. Пишется на каждый GET /tasks.
export const KASPI_WORKER_LAST_SEEN = 'kaspi_worker_last_seen'

// Реальные счётчики из кабинета Kaspi (число «в продаже» / снятых) — присылает
// браузер/воркер с кабинетной сессией (сервер сам в кабинет не ходит, IP блокирован).
export const KASPI_CABINET_ACTIVE = 'kaspi_cabinet_active'     // в продаже на Kaspi
export const KASPI_CABINET_ARCHIVED = 'kaspi_cabinet_archived' // снято с продажи
export const KASPI_CABINET_AT = 'kaspi_cabinet_at'             // когда обновлено (ISO)

// Прочитать строковую настройку (ISO-метка и т.п.).
export async function getString(key: string): Promise<string | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } })
    return row?.value ?? null
  } catch { return null }
}

export async function setString(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) },
  })
}

// Прочитать числовую настройку (множитель комиссии и т.п.). Дефолт при отсутствии/ошибке.
export async function getNumber(key: string, def: number): Promise<number> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } })
    if (!row) return def
    const n = Number(row.value)
    return Number.isFinite(n) && n > 0 ? n : def
  } catch {
    return def
  }
}

export async function setNumber(key: string, value: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) },
  })
}

// Удобный геттер множителя комиссии Kaspi.
export function getKaspiCommissionMult(): Promise<number> {
  return getNumber(KASPI_COMMISSION_MULT, KASPI_COMMISSION_MULT_DEFAULT)
}

// --- Экономика Kaspi (для аналитики прибыли /admin/kaspi-analytics) ---
// Реальные удержания Kaspi с продажи. Подтверждено гайдом Kaspi:
//   комиссия Магазина зависит от категории (электроника 10.9%), Kaspi Pay 0.95%,
//   налог упрощёнки 3%, доставку платит продавец при заказе ≥ порога (~5000₸).
// Полная себестоимость = закуп + комиссия + Kaspi Pay + доставка + налог.
// NB: множитель ×1.41 (KASPI_COMMISSION_MULT) — это про floor цены в демпинге,
// ОТДЕЛЬНАЯ механика; аналитика использует явные ставки ниже.
export const KASPI_ECON_COMMISSION_PCT = 'kaspi_econ_commission_pct' // % от цены
export const KASPI_ECON_PAY_PCT = 'kaspi_econ_pay_pct'               // Kaspi Pay, %
export const KASPI_ECON_TAX_PCT = 'kaspi_econ_tax_pct'               // налог, %
export const KASPI_ECON_DELIVERY_TENGE = 'kaspi_econ_delivery_tenge' // доставка ₸/заказ
export const KASPI_ECON_DELIVERY_THRESHOLD = 'kaspi_econ_delivery_threshold' // порог ₸

export const KASPI_ECON_DEFAULTS = {
  commissionPct: 10.9,
  payPct: 0.95,
  taxPct: 3,
  deliveryTenge: 0,
  deliveryThreshold: 5000,
} as const

export type KaspiEconomics = {
  commissionPct: number
  payPct: number
  taxPct: number
  deliveryTenge: number
  deliveryThreshold: number
}

// Читает число ≥ 0 (в отличие от getNumber, который требует > 0 — нам нужен 0 для доставки).
async function getNumberNonNeg(key: string, def: number): Promise<number> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } })
    if (!row) return def
    const n = Number(row.value)
    return Number.isFinite(n) && n >= 0 ? n : def
  } catch {
    return def
  }
}

// Все 5 ставок одним запросом.
export async function getKaspiEconomics(): Promise<KaspiEconomics> {
  const d = KASPI_ECON_DEFAULTS
  const [commissionPct, payPct, taxPct, deliveryTenge, deliveryThreshold] = await Promise.all([
    getNumberNonNeg(KASPI_ECON_COMMISSION_PCT, d.commissionPct),
    getNumberNonNeg(KASPI_ECON_PAY_PCT, d.payPct),
    getNumberNonNeg(KASPI_ECON_TAX_PCT, d.taxPct),
    getNumberNonNeg(KASPI_ECON_DELIVERY_TENGE, d.deliveryTenge),
    getNumberNonNeg(KASPI_ECON_DELIVERY_THRESHOLD, d.deliveryThreshold),
  ])
  return { commissionPct, payPct, taxPct, deliveryTenge, deliveryThreshold }
}

// --- «Отложенные» товары на странице /admin/kaspi-missing ---
// Список productId, которые сознательно НЕ выкладываем на Kaspi (напр. B2B-товары).
// Они скрыты из основного списка «Нет на Kaspi», но доступны в отдельном виде «Отложенные»,
// откуда можно вернуть. Храним JSON-массив id в одной записи AppSetting (без миграции схемы).
export const KASPI_MISSING_POSTPONED = 'kaspi_missing_postponed'

export async function getPostponedProductIds(): Promise<string[]> {
  const raw = await getString(KASPI_MISSING_POSTPONED)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// Добавить/убрать товар из списка отложенных.
export async function setPostponed(productId: string, postponed: boolean): Promise<string[]> {
  const cur = await getPostponedProductIds()
  const set = new Set(cur)
  if (postponed) set.add(productId)
  else set.delete(productId)
  const next = Array.from(set)
  await setString(KASPI_MISSING_POSTPONED, JSON.stringify(next))
  return next
}

// --- Отложенные запросы «скан + просчёт min/max» по формуле ---------------
// Кнопка в /admin/kaspi ставит сюда offerId → множители; воркер сканит свежие
// цены конкурентов, а ingest применяет формулу и снимает запрос. Migration-free
// (храним JSON в appSetting, без новой колонки в БД).
export const KASPI_MINMAX_PENDING = 'kaspi_minmax_pending'
export type MinMaxFormula = { kMin: number; kMax: number; kRival: number }

export async function getMinMaxPending(): Promise<Record<string, MinMaxFormula>> {
  const raw = await getString(KASPI_MINMAX_PENDING)
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

// Поставить запрос формулы для набора офферов (перезаписывает множители если были).
export async function addMinMaxPending(offerIds: string[], f: MinMaxFormula): Promise<number> {
  const cur = await getMinMaxPending()
  for (const id of offerIds) cur[id] = f
  await setString(KASPI_MINMAX_PENDING, JSON.stringify(cur))
  return Object.keys(cur).length
}

// Снять запросы (после применения) для набора офферов.
export async function clearMinMaxPending(offerIds: string[]): Promise<void> {
  const cur = await getMinMaxPending()
  let changed = false
  for (const id of offerIds) if (id in cur) { delete cur[id]; changed = true }
  if (changed) await setString(KASPI_MINMAX_PENDING, JSON.stringify(cur))
}

// Ключи push-уведомлений по каналам продаж. По умолчанию все включены (true).
export const NOTIFY_ALASH = 'notify_alash_enabled'
export const NOTIFY_KASPI = 'notify_kaspi_enabled'
export const NOTIFY_SATU = 'notify_satu_enabled'
export const NOTIFY_BA3AR = 'notify_ba3ar_enabled'

export type NotifyChannel = 'croon' | 'kaspi'
export function notifyFlagKey(ch: NotifyChannel): string {
  return ({ croon: NOTIFY_ALASH, kaspi: NOTIFY_KASPI } as const)[ch]
}

// Прочитать булев флаг. По умолчанию true (если записи нет — всё включено).
export async function getFlag(key: string, def = true): Promise<boolean> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } })
    if (!row) return def
    return row.value === 'true' || row.value === '1'
  } catch {
    return def // если таблицы ещё нет / БД недоступна — не ломаем выдачу
  }
}

export async function setFlag(key: string, value: boolean): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: value ? 'true' : 'false' },
    update: { value: value ? 'true' : 'false' },
  })
}
