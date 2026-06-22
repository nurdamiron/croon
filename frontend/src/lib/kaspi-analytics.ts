// Аналитика продаж Kaspi (как AlgaTop /analytics, но из нашей локальной БД).
//
// «Продажа» = заказ ПОСТУПИЛ и не отменён/не возвращён — считаем прибыль СРАЗУ при
// поступлении (по дате поступления заказа). Отмены/возвраты вычитаются (просто не
// попадают в выборку). Так заработок виден в реальном времени, а вчерашний день не
// «дозаполняется» задним числом. Возвраты/отмены показываются отдельно (KPI/проблемные).
//
// Дата продажи = KaspiOrder.creationDate (дата поступления заказа).
//
// Себестоимость: Product.costPrice → фолбэк на costPrice единственного тех-варианта.
// Товары без себестоимости ИСКЛЮЧАЮТСЯ из прибыли/маржи/ABC (никогда не profit=revenue),
// но попадают в noCostCohort, чтобы UI показал «N товаров без себестоимости».
//
// ПОЛНАЯ ЭКОНОМИКА (как реально считает Kaspi и AlgaTop):
//   Прибыль = Выручка − Себестоимость − Комиссия Kaspi − Kaspi Pay − Доставка − Налог.
//   Удержания Kaspi (комиссия/Pay/налог) — % от ЦЕНЫ продажи. Доставка — фикс ₸ на заказ
//   при сумме ≥ порога, распределяется на позиции пропорционально их доле в заказе.
//   Ставки настраиваются в /admin/kaspi (см. getKaspiEconomics в app-settings).
//
// Стратегия: findMany + агрегация в памяти (не groupBy/raw SQL) — на позицию нужен джойн к
// двум источникам себестоимости с null-обработкой и арифметикой маржи, что groupBy не умеет,
// а raw SQL делает хрупким. Объём данных скромный. При росте — это единственное место для оптимизации.

import { prisma } from './prisma'
import { kaspiUiStatusToWhere } from './kaspi-ui-status'
import { getKaspiEconomics, type KaspiEconomics } from './app-settings'

export type { KaspiEconomics }

const TOP_N = 15
const ABC_A = 0.8 // A: накопительно до 80% прибыли
const ABC_B = 0.95 // B: до 95% (80 + 15); остальное — C
const RETURN_RATE_THRESHOLD = 0.2 // ≥20% возвратов → проблемный товар
const RETURN_MIN_UNITS = 2 // минимум всего единиц (sold+return), чтобы доля была значимой
const LOW_MARKUP_THRESHOLD = 10 // наценка < 10% → проблемный товар
const MARGIN_MIN_REVENUE = 5000 // порог выручки для ТОП по марже (отсечь 1-штучные выбросы)

// Алматы = UTC+5 без DST (фиксированный офсет с 2024). Хардкодим, чтобы не тянуть tz-либу.
const ALMATY_OFFSET = '+05:00'

// Бизнес-сутки начинаются в 17:00 Алматы: заказы до 17:00 — «сегодня», с 17:00 —
// уже «следующий день» (так Kaspi режет рабочий день/отгрузку). День D охватывает
// реальное время [D-1 17:00, D 17:00) Алматы. Технически это сдвиг на (24−17)=7 часов:
// дата(t + 7ч в Алматы) даёт нужный бизнес-день.
const BUSINESS_CUTOFF_HOUR = 17
const BUSINESS_SHIFT_MS = (24 - BUSINESS_CUTOFF_HOUR) * 3600_000 // +7ч
// Время начала суток Алматы в ISO для конструирования границ (17:00 предыдущего дня).
const CUTOFF_HHMM = `${String(BUSINESS_CUTOFF_HOUR).padStart(2, '0')}:00:00`

// Текущий бизнес-день (YYYY-MM-DD) в Алматы с учётом отсечки 17:00.
function currentBusinessDay(): string {
  return new Date(Date.now() + 5 * 3600_000 + BUSINESS_SHIFT_MS).toISOString().slice(0, 10)
}

// Разбор диапазона из строк YYYY-MM-DD (как в <input type="date">) в UTC-границы.
// Граница дня D — 17:00 Алматы дня (D-1): бизнес-день D = [D-1 17:00, D 17:00).
// `to` эксклюзивно — 17:00 выбранного дня `toDay`. Без/при битом вводе — последние 30 дней.
export function resolveRange(fromStr?: string | null, toStr?: string | null): {
  from: Date
  to: Date
  fromStr: string
  toStr: string
} {
  const reDate = /^\d{4}-\d{2}-\d{2}$/
  const todayAlmaty = currentBusinessDay()

  let toDay = toStr && reDate.test(toStr) ? toStr : todayAlmaty
  let fromDay: string
  if (fromStr && reDate.test(fromStr)) {
    fromDay = fromStr
  } else {
    // последние 30 дней включительно
    const d = new Date(`${toDay}T00:00:00${ALMATY_OFFSET}`)
    d.setUTCDate(d.getUTCDate() - 29)
    fromDay = d.toISOString().slice(0, 10)
  }
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay]

  // Бизнес-день F начинается в (F-1) 17:00 Алматы.
  const from = new Date(`${fromDay}T${CUTOFF_HHMM}${ALMATY_OFFSET}`)
  from.setUTCDate(from.getUTCDate() - 1)
  // Бизнес-день toDay заканчивается в toDay 17:00 Алматы (эксклюзивно).
  const toExclusive = new Date(`${toDay}T${CUTOFF_HHMM}${ALMATY_OFFSET}`)

  return { from, to: toExclusive, fromStr: fromDay, toStr: toDay }
}

// Дата (UTC-инстант) самого раннего Kaspi-заказа в БД, либо null если заказов нет.
// Нужна, чтобы «Всё время» начиналось с первой реальной продажи, а не с 2020 года
// (иначе график «по дням» — годы пустоты + крошечный хвост данных).
export async function earliestSaleDate(): Promise<Date | null> {
  const first = await prisma.kaspiOrder.findFirst({
    where: { creationDate: { not: null } },
    orderBy: { creationDate: 'asc' },
    select: { creationDate: true },
  })
  return first?.creationDate ?? null
}

// Поджимает начало диапазона к первой реальной продаже, если запрошено раньше.
// Возвращает (возможно) подвинутые from + fromStr (бизнес-день первой продажи).
export function clampRangeToFirstSale(
  from: Date,
  fromStr: string,
  earliest: Date | null
): { from: Date; fromStr: string } {
  if (!earliest || earliest <= from) return { from, fromStr }
  // бизнес-день первой продажи (с учётом отсечки 17:00)
  const earliestDay = new Date(earliest.getTime() + 5 * 3600_000 + BUSINESS_SHIFT_MS)
    .toISOString()
    .slice(0, 10)
  const clampedFrom = new Date(`${earliestDay}T${CUTOFF_HHMM}${ALMATY_OFFSET}`)
  clampedFrom.setUTCDate(clampedFrom.getUTCDate() - 1)
  return { from: clampedFrom, fromStr: earliestDay }
}

export type AbcBucketKey = 'A' | 'B' | 'C'

export type ProductRow = {
  productId: string | null // null = «Без привязки»
  name: string
  kaspiUrl: string | null // ссылка на карточку товара в магазине Kaspi (если привязан оффер)
  qtySold: number
  revenue: number
  cost: number | null // null, если хоть одна проданная единица без себестоимости
  profit: number | null
  marginPct: number | null // profit / revenue * 100
  markupPct: number | null // profit / cost * 100 (наценка от полной себестоимости)
  hasCost: boolean
  returnCount: number // единиц возвращено + отменено в периоде
  cancelCount: number // единиц отменено в периоде
  returnedCount: number // единиц возвращено в периоде
  soldCount: number // единиц выкуплено в периоде (= qtySold; денежник для return-rate)
}

// Наборы ТОП-чартов для вкладки «Товары» (как у AlgaTop).
export type ProductTops = {
  belowCost: ProductRow[] // ТОП товаров с ценой ниже закупочной (price < закуп, без учёта комиссий)
  returns: ProductRow[] // ТОП возвращаемых
  cancels: ProductRow[] // ТОП отменяемых
  markupAmountHigh: ProductRow[] // ТОП по сумме наценки (прибыль ₸), высокая
  markupAmountLow: ProductRow[] // ТОП по сумме наценки, низкая
  markupPctHigh: ProductRow[] // ТОП по % наценки, высокая
  markupPctLow: ProductRow[] // ТОП по % наценки, низкая
}

export type Kpi = {
  revenue: number
  profit: number | null // выручка − полная себестоимость (для товаров с известным закупом)
  marginPct: number | null
  orderCount: number // распознанных COMPLETED заказов
  buyoutCount: number // = orderCount (COMPLETED == выкуп)
  returnCount: number // распознанных возвратных/отменённых заказов
  avgCheck: number
  costCoveragePct: number // % выручки с известной себестоимостью
}

export type AbcBucket = {
  bucket: AbcBucketKey
  products: ProductRow[]
  profit: number
  sharePct: number
}

// Разбивка выручки на удержания (для доната «Структура выручки»). Суммы за период,
// по выручке с известной себестоимостью (иначе netProfit не имеет смысла).
export type RevenueStructure = {
  cost: number // закупочная стоимость
  commission: number // комиссия Магазина Kaspi
  pay: number // комиссия Kaspi Pay
  delivery: number // доставка
  tax: number // налог
  netProfit: number // чистая прибыль = выручка − всё выше
  revenueBase: number // выручка, на которой посчитана разбивка (с себестоимостью)
}

// Точка дневной динамики (для графиков «Выручка по дням» / «Маржа и прибыль по дням»).
export type DailyPoint = {
  date: string // YYYY-MM-DD (день Алматы)
  revenue: number
  profit: number // полная прибыль (по позициям с себестоимостью)
  marginPct: number | null
}

// Счётчики по статусам заказов (для доната «Статусы заказов»).
export type StatusCounts = {
  delivered: number // Доставленные (COMPLETED)
  inProgress: number // Новые и на доставке (APPROVED_BY_BANK + ACCEPTED_BY_MERCHANT)
  cancelled: number // Отменённые
  returned: number // Возвращённые
}

// Денежный поток по дню (для графика «Денежные поступления»). Считается по ВСЕМ позициям
// (удержания — % от цены, себестоимость не нужна). Налог НЕ входит — Kaspi его не удерживает.
//   deposit = выручка − (комиссия + Pay) − доставка (что Kaspi перечисляет продавцу)
// commission/delivery — положительные магнитуды (график рисует их вниз).
export type CashflowPoint = {
  date: string
  deposit: number
  commission: number // комиссия Магазина + Kaspi Pay
  delivery: number
}

// Прогноз остатков / закупки.
// velocity = продаж в день за период; daysLeft = доступный остаток / velocity.
export type StockForecastRow = {
  productId: string
  name: string
  sku: string | null
  available: number // totalStock − reservedStock
  qtySold: number // продано за период (Kaspi COMPLETED)
  perDay: number // скорость продаж (шт/день)
  daysLeft: number | null // дней до нуля (null = не продаётся)
  costPrice: number | null
  frozen: number | null // заморожено денег = available × costPrice (для мёртвого стока)
}
export type StockForecast = {
  periodDays: number // длина периода в днях (база для скорости)
  runningOut: StockForecastRow[] // продаётся, скоро кончится (заказать)
  deadStock: StockForecastRow[] // есть остаток, нет продаж за период (заморожены деньги)
  deadStockTotalFrozen: number // сумма замороженных денег по мёртвому стоку
}

// Воронка статусов: кумулятивно «дошли до этапа или дальше» + утечки (отмены/возвраты).
// Снимок текущих статусов (истории переходов у нас нет), поэтому считаем по правилу
// «если заказ Выдан — он прошёл Оплачен/Упаковку/Передачу».
export type StatusFunnel = {
  stages: { key: string; label: string; count: number; pct: number }[] // от Оплачен до Выдан
  cancelled: number // отменено (утечка)
  returned: number // возвращено (утечка)
  buyoutRate: number | null // % выкупа = Выдан / (Оплачен или дальше)
}

// Распределение заказов по времени (часы дня × дни недели), время Алматы.
// matrix[weekday][hour] = число заказов. weekday: 0=Пн … 6=Вс. hour: 0..23.
export type OrderTiming = {
  matrix: number[][] // [7][24]
  byWeekday: number[] // [7] — сумма по дню недели
  byHour: number[] // [24] — сумма по часу
  total: number
  peak: { weekday: number; hour: number; count: number } | null
}

export type KaspiAnalyticsResult = {
  range: { from: string; to: string }
  previousRange: { from: string; to: string }
  kpi: {
    current: Kpi
    previous: Kpi
    delta: {
      revenue: number | null
      profit: number | null
      marginPct: number | null
      orderCount: number | null
      avgCheck: number | null
    }
  }
  topByRevenue: ProductRow[]
  topByProfit: ProductRow[]
  topByMargin: ProductRow[]
  products: ProductRow[] // полный список проданных товаров (для потоварной таблицы)
  productTops: ProductTops // наборы ТОП-чартов (вкладка «Товары»)
  abc: AbcBucket[]
  problems: {
    lossMaking: ProductRow[]
    highReturn: ProductRow[]
    lowMarkup: ProductRow[]
  }
  noCostCohort: {
    count: number
    revenue: number
    productIds: string[]
    items: { productId: string; name: string; slug: string | null; sku: string | null; revenue: number }[]
  }
  unlinked: { revenue: number; qtySold: number }
  econ: KaspiEconomics // применённые ставки (для подписей в UI)
  revenueStructure: RevenueStructure
  daily: DailyPoint[]
  cashflow: CashflowPoint[]
  statusCounts: StatusCounts
  stockForecast: StockForecast
  orderTiming: OrderTiming
  statusFunnel: StatusFunnel
  generatedAt: string
}

// --- запросы --------------------------------------------------------------

type SoldItem = {
  productId: string | null
  kaspiName: string | null
  quantity: number
  price: number
  product: {
    id: string
    name: string
    costPrice: number | null
  } | null
}

type SoldOrder = {
  id: string
  totalPrice: number
  creationDate: Date | null
  items: SoldItem[]
}

const SOLD_SELECT = {
  id: true,
  totalPrice: true,
  creationDate: true,
  items: {
    select: {
      productId: true,
      kaspiName: true,
      quantity: true,
      price: true,
      product: {
        select: {
          id: true,
          name: true,
          costPrice: true,
        },
      },
    },
  },
} as const

function effectiveCost(p: SoldItem['product']): number | null {
  if (!p) return null
  if (p.costPrice != null && p.costPrice > 0) return p.costPrice
  return null
}

// Доля заказа по позиции — для распределения доставки (фикс ₸ на заказ) на позиции.
function orderDelivery(order: SoldOrder, econ: KaspiEconomics): number {
  return order.totalPrice >= econ.deliveryThreshold ? econ.deliveryTenge : 0
}

// Удержания Kaspi с одной строки (комиссия + Pay + налог) — % от цены позиции.
function lineDeductions(lineRevenue: number, econ: KaspiEconomics) {
  return {
    commission: (lineRevenue * econ.commissionPct) / 100,
    pay: (lineRevenue * econ.payPct) / 100,
    tax: (lineRevenue * econ.taxPct) / 100,
  }
}

// --- KPI по набору COMPLETED-заказов (полная экономика) --------------------

function computeKpi(orders: SoldOrder[], returnOrderCount: number, econ: KaspiEconomics): Kpi {
  let revenue = 0
  let revenueWithCost = 0
  let profit = 0
  let hasAnyCost = false
  for (const o of orders) {
    const delivery = orderDelivery(o, econ)
    const orderRevenue = o.items.reduce((s, it) => s + it.price * it.quantity, 0)
    for (const it of o.items) {
      const line = it.price * it.quantity
      revenue += line
      const cost = effectiveCost(it.product)
      if (cost != null) {
        hasAnyCost = true
        revenueWithCost += line
        const d = lineDeductions(line, econ)
        // доставка распределяется пропорционально доле позиции в заказе
        const lineDelivery = orderRevenue > 0 ? delivery * (line / orderRevenue) : 0
        profit += line - cost * it.quantity - d.commission - d.pay - d.tax - lineDelivery
      }
    }
  }
  const orderCount = orders.length
  return {
    revenue,
    profit: hasAnyCost ? profit : null,
    marginPct: hasAnyCost && revenueWithCost > 0 ? (profit / revenueWithCost) * 100 : null,
    orderCount,
    buyoutCount: orderCount,
    returnCount: returnOrderCount,
    avgCheck: orderCount > 0 ? revenue / orderCount : 0,
    costCoveragePct: revenue > 0 ? (revenueWithCost / revenue) * 100 : 0,
  }
}

// Бизнес-день (YYYY-MM-DD) для даты заказа: Алматы + сдвиг отсечки 17:00.
// Заказ до 17:00 → текущая дата, с 17:00 → следующая (см. BUSINESS_CUTOFF_HOUR).
function almatyDay(d: Date | null): string | null {
  if (!d) return null
  return new Date(d.getTime() + 5 * 3600_000 + BUSINESS_SHIFT_MS).toISOString().slice(0, 10)
}

function pctDelta(cur: number, prev: number): number {
  if (prev > 0) return ((cur - prev) / prev) * 100
  return cur > 0 ? 100 : 0
}

function nullableDelta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null) return null
  return pctDelta(cur, prev)
}

// --- основной расчёт ------------------------------------------------------

export async function computeKaspiAnalytics({
  from,
  to,
  econ,
}: {
  from: Date
  to: Date
  econ?: KaspiEconomics
}): Promise<KaspiAnalyticsResult> {
  const rates = econ ?? (await getKaspiEconomics())
  const span = to.getTime() - from.getTime()
  const prevTo = from
  const prevFrom = new Date(from.getTime() - span)

  // «Продажа» = заказ поступил и не отменён/не возвращён (прибыль считаем сразу,
  // при отмене/возврате он просто не попадает сюда → сумма дня уменьшается).
  // Исключаем отмены, возвраты и до-оплатные статусы (SIGN_REQUIRED).
  const CANCEL_STATUSES = ['CANCELLED', 'CANCELLING']
  const RETURN_STATUSES = ['KASPI_DELIVERY_RETURN_REQUESTED', 'RETURN_ACCEPTED_BY_MERCHANT', 'RETURNED']
  const NON_SALE_STATUSES = [...CANCEL_STATUSES, ...RETURN_STATUSES, 'SIGN_REQUIRED']
  const completedWhere = { status: { notIn: NON_SALE_STATUSES } } // поступившие и не отменённые
  const cancelWhere = kaspiUiStatusToWhere('OTMENEN')
  const returnWhere = kaspiUiStatusToWhere('VOZVRAT')

  const [soldOrders, prevSoldOrders, cancelledOrders, returnedOnlyOrders, statusGroups, kaspiOffers, kaspiStockProducts, timingOrders, peredachaCount] = await Promise.all([
    prisma.kaspiOrder.findMany({
      where: { ...completedWhere, creationDate: { gte: from, lt: to } },
      select: SOLD_SELECT,
    }),
    prisma.kaspiOrder.findMany({
      where: { ...completedWhere, creationDate: { gte: prevFrom, lt: prevTo } },
      select: SOLD_SELECT,
    }),
    prisma.kaspiOrder.findMany({
      where: { ...cancelWhere, creationDate: { gte: from, lt: to } },
      select: { id: true, items: { select: { productId: true, quantity: true } } },
    }),
    prisma.kaspiOrder.findMany({
      where: { ...returnWhere, creationDate: { gte: from, lt: to } },
      select: { id: true, items: { select: { productId: true, quantity: true } } },
    }),
    // Распределение всех заказов периода по сырому статусу — для блока «Статусы заказов».
    prisma.kaspiOrder.groupBy({
      by: ['status'],
      where: { creationDate: { gte: from, lt: to } },
      _count: { _all: true },
    }),
    // Ссылки на карточки Kaspi по товару (для кликабельных названий).
    prisma.kaspiOffer.findMany({
      where: { kaspiUrl: { not: null } },
      select: { productId: true, kaspiUrl: true },
    }),
    // Товары, выставленные на Kaspi (активный оффер), с остатком/себесом —
    // для прогноза остатков и поиска мёртвого стока. distinct по productId.
    prisma.kaspiOffer.findMany({
      where: { active: true, product: { archived: false } },
      select: {
        productId: true,
        product: {
          select: { id: true, name: true, sku: true, totalStock: true, reservedStock: true, costPrice: true },
        },
      },
    }),
    // Даты создания всех заказов периода — для распределения по времени (часы × дни недели).
    prisma.kaspiOrder.findMany({
      where: { creationDate: { gte: from, lt: to } },
      select: { creationDate: true },
    }),
    // Заказы на этапе «Передача» (ACCEPTED_BY_MERCHANT + assembled=true) — для воронки.
    prisma.kaspiOrder.count({
      where: { ...kaspiUiStatusToWhere('PEREDACHA'), creationDate: { gte: from, lt: to } },
    }),
  ])

  // productId → kaspiUrl (берём первый непустой URL на товар).
  const kaspiUrlByProduct = new Map<string, string>()
  for (const off of kaspiOffers) {
    if (off.kaspiUrl && !kaspiUrlByProduct.has(off.productId)) {
      kaspiUrlByProduct.set(off.productId, off.kaspiUrl)
    }
  }

  // Возвраты и отмены по товару (единиц) — раздельно (для ТОП возвратов / отмен).
  const cancelByProduct = new Map<string, number>()
  const returnedByProduct = new Map<string, number>()
  function tally(orders: { items: { productId: string | null; quantity: number }[] }[], m: Map<string, number>) {
    for (const o of orders) {
      for (const it of o.items) {
        if (!it.productId) continue
        m.set(it.productId, (m.get(it.productId) || 0) + it.quantity)
      }
    }
  }
  tally(cancelledOrders, cancelByProduct)
  tally(returnedOnlyOrders, returnedByProduct)
  const returnOrderCountTotal = cancelledOrders.length + returnedOnlyOrders.length

  // Свод по товарам из COMPLETED + дневная динамика + структура выручки.
  const NULL_KEY = '__null__'
  type Acc = {
    productId: string | null
    name: string
    qtySold: number
    revenue: number
    cost: number // закуп (только по позициям с себестоимостью)
    deductions: number // комиссия + Pay + налог + доставка (по тем же позициям)
    costMissing: boolean // была ли хоть одна единица без себестоимости
  }
  const map = new Map<string, Acc>()
  let unlinkedRevenue = 0
  let unlinkedQty = 0

  // Дневные накопители. revenue/commission/pay/delivery — по ВСЕМ позициям (для денежного потока);
  // revenueWithCost/profit — только по позициям с себестоимостью (для маржи по дням).
  type DailyAcc = {
    revenue: number
    revenueWithCost: number
    profit: number
    commission: number
    pay: number
    delivery: number
  }
  const dailyMap = new Map<string, DailyAcc>()
  // Структура выручки за период (суммы).
  const struct = { cost: 0, commission: 0, pay: 0, delivery: 0, tax: 0, revenueBase: 0 }

  for (const o of soldOrders) {
    const day = almatyDay(o.creationDate)
    const delivery = orderDelivery(o, rates)
    const orderRevenue = o.items.reduce((s, it) => s + it.price * it.quantity, 0)
    for (const it of o.items) {
      const line = it.price * it.quantity
      const key = it.productId || NULL_KEY
      if (!it.productId) {
        unlinkedRevenue += line
        unlinkedQty += it.quantity
      }
      let acc = map.get(key)
      if (!acc) {
        acc = {
          productId: it.productId,
          name: it.productId
            ? it.product?.name || it.kaspiName || it.productId
            : 'Без привязки',
          qtySold: 0,
          revenue: 0,
          cost: 0,
          deductions: 0,
          costMissing: false,
        }
        map.set(key, acc)
      }
      acc.qtySold += it.quantity
      acc.revenue += line

      const cost = effectiveCost(it.product)
      const lineDelivery = orderRevenue > 0 ? delivery * (line / orderRevenue) : 0
      const ded = lineDeductions(line, rates)

      // Дневная динамика и структура — только по позициям с известным закупом.
      let dayProfit = 0
      let dayRevWithCost = 0
      if (cost == null) {
        acc.costMissing = true
      } else {
        const costTotal = cost * it.quantity
        const lineProfit = line - costTotal - ded.commission - ded.pay - ded.tax - lineDelivery
        acc.cost += costTotal
        acc.deductions += ded.commission + ded.pay + ded.tax + lineDelivery
        // структура выручки за период
        struct.cost += costTotal
        struct.commission += ded.commission
        struct.pay += ded.pay
        struct.tax += ded.tax
        struct.delivery += lineDelivery
        struct.revenueBase += line
        dayProfit = lineProfit
        dayRevWithCost = line
      }

      if (day) {
        let dacc = dailyMap.get(day)
        if (!dacc) {
          dacc = { revenue: 0, revenueWithCost: 0, profit: 0, commission: 0, pay: 0, delivery: 0 }
          dailyMap.set(day, dacc)
        }
        dacc.revenue += line
        dacc.revenueWithCost += dayRevWithCost
        dacc.profit += dayProfit
        // денежный поток — по всем позициям (удержания от цены, себестоимость не нужна)
        dacc.commission += ded.commission
        dacc.pay += ded.pay
        dacc.delivery += lineDelivery
      }
    }
  }

  // Превращаем в ProductRow с полной прибылью/маржой/наценкой.
  const rows: ProductRow[] = []
  for (const acc of Array.from(map.values())) {
    const hasCost = !acc.costMissing && acc.productId != null
    // полная себестоимость = закуп + удержания Kaspi
    const fullCost = hasCost ? acc.cost + acc.deductions : null
    const cost = hasCost ? acc.cost : null
    const profit = hasCost ? acc.revenue - (fullCost as number) : null
    const marginPct = profit != null && acc.revenue > 0 ? (profit / acc.revenue) * 100 : null
    // наценка считается от полной себестоимости (как в методике AlgaTop)
    const markupPct = profit != null && fullCost != null && fullCost > 0 ? (profit / fullCost) * 100 : null
    const cancelCount = acc.productId ? cancelByProduct.get(acc.productId) || 0 : 0
    const returnedCount = acc.productId ? returnedByProduct.get(acc.productId) || 0 : 0
    rows.push({
      productId: acc.productId,
      name: acc.name,
      kaspiUrl: acc.productId ? kaspiUrlByProduct.get(acc.productId) || null : null,
      qtySold: acc.qtySold,
      revenue: acc.revenue,
      cost,
      profit,
      marginPct,
      markupPct,
      hasCost,
      returnCount: cancelCount + returnedCount,
      cancelCount,
      returnedCount,
      soldCount: acc.qtySold,
    })
  }

  // KPI текущий/прошлый + дельты.
  const current = computeKpi(soldOrders, returnOrderCountTotal, rates)
  const previous = computeKpi(prevSoldOrders, 0, rates) // возвраты прошлого периода в KPI не нужны
  const delta = {
    revenue: pctDelta(current.revenue, previous.revenue),
    profit: nullableDelta(current.profit, previous.profit),
    marginPct: nullableDelta(current.marginPct, previous.marginPct),
    orderCount: pctDelta(current.orderCount, previous.orderCount),
    avgCheck: pctDelta(current.avgCheck, previous.avgCheck),
  }

  // ТОП-листы.
  const byRevenue = [...rows].sort((a, b) => b.revenue - a.revenue)
  const costed = rows.filter((r) => r.hasCost && r.profit != null)
  const byProfit = [...costed].sort((a, b) => (b.profit || 0) - (a.profit || 0))
  const byMargin = costed
    .filter((r) => r.revenue >= MARGIN_MIN_REVENUE && r.marginPct != null)
    .sort((a, b) => (b.marginPct || 0) - (a.marginPct || 0))

  // ABC по прибыли: только hasCost && profit>0, накопительно 80/15/5.
  const abcSource = costed.filter((r) => (r.profit || 0) > 0).sort((a, b) => (b.profit || 0) - (a.profit || 0))
  const totalProfit = abcSource.reduce((s, r) => s + (r.profit || 0), 0)
  const abc: AbcBucket[] = []
  if (totalProfit > 0) {
    const buckets: Record<AbcBucketKey, ProductRow[]> = { A: [], B: [], C: [] }
    let cum = 0
    for (const r of abcSource) {
      const before = cum / totalProfit
      let key: AbcBucketKey
      if (before < ABC_A) key = 'A'
      else if (before < ABC_B) key = 'B'
      else key = 'C'
      buckets[key].push(r)
      cum += r.profit || 0
    }
    for (const key of ['A', 'B', 'C'] as AbcBucketKey[]) {
      const products = buckets[key]
      const profit = products.reduce((s, r) => s + (r.profit || 0), 0)
      abc.push({ bucket: key, products, profit, sharePct: (profit / totalProfit) * 100 })
    }
  }

  // Проблемные товары.
  const lossMaking = rows
    .filter((r) => r.hasCost && r.profit != null && r.profit < 0)
    .sort((a, b) => (a.profit || 0) - (b.profit || 0))
  const highReturn = rows
    .filter((r) => {
      const total = r.soldCount + r.returnCount
      return total >= RETURN_MIN_UNITS && r.returnCount / total >= RETURN_RATE_THRESHOLD
    })
    .sort((a, b) => b.returnCount / (b.soldCount + b.returnCount) - a.returnCount / (a.soldCount + a.returnCount))
  const lowMarkup = rows
    .filter((r) => r.hasCost && r.markupPct != null && r.markupPct < LOW_MARKUP_THRESHOLD && (r.profit || 0) >= 0)
    .sort((a, b) => (a.markupPct || 0) - (b.markupPct || 0))

  // Наборы ТОП-чартов для «Потоварной» (как у AlgaTop).
  // «Ниже закупочной цены» — выручка меньше чистого закупа (без учёта комиссий).
  const belowCost = rows
    .filter((r) => r.hasCost && r.cost != null && r.revenue < r.cost)
    .sort((a, b) => a.revenue - a.cost! - (b.revenue - b.cost!))
  const returns = rows
    .filter((r) => r.returnedCount > 0)
    .sort((a, b) => b.returnedCount - a.returnedCount)
    .slice(0, TOP_N)
  const cancels = rows
    .filter((r) => r.cancelCount > 0)
    .sort((a, b) => b.cancelCount - a.cancelCount)
    .slice(0, TOP_N)
  // Сумма наценки = прибыль в ₸ (наценка над полной себестоимостью).
  const withProfit = rows.filter((r) => r.hasCost && r.profit != null)
  const markupAmountHigh = [...withProfit].sort((a, b) => (b.profit || 0) - (a.profit || 0)).slice(0, TOP_N)
  const markupAmountLow = [...withProfit].sort((a, b) => (a.profit || 0) - (b.profit || 0)).slice(0, TOP_N)
  const withMarkupPct = rows.filter((r) => r.hasCost && r.markupPct != null)
  const markupPctHigh = [...withMarkupPct].sort((a, b) => (b.markupPct || 0) - (a.markupPct || 0)).slice(0, TOP_N)
  const markupPctLow = [...withMarkupPct].sort((a, b) => (a.markupPct || 0) - (b.markupPct || 0)).slice(0, TOP_N)
  const productTops: ProductTops = {
    belowCost: belowCost.slice(0, TOP_N),
    returns,
    cancels,
    markupAmountHigh,
    markupAmountLow,
    markupPctHigh,
    markupPctLow,
  }

  // Когорта без себестоимости. Подтягиваем slug/sku, чтобы баннер дал прямые ссылки.
  const noCost = rows.filter((r) => r.productId != null && !r.hasCost)
  const noCostIds = noCost.map((r) => r.productId as string)
  const noCostMeta = noCostIds.length
    ? await prisma.product.findMany({
        where: { id: { in: noCostIds } },
        select: { id: true, slug: true, sku: true },
      })
    : []
  const noCostMetaById = new Map(noCostMeta.map((p) => [p.id, p]))
  const noCostCohort = {
    count: noCost.length,
    revenue: noCost.reduce((s, r) => s + r.revenue, 0),
    productIds: noCostIds,
    items: noCost
      .map((r) => ({
        productId: r.productId as string,
        name: r.name,
        slug: noCostMetaById.get(r.productId as string)?.slug ?? null,
        sku: noCostMetaById.get(r.productId as string)?.sku ?? null,
        revenue: r.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue),
  }

  // Дневная динамика + денежный поток: непрерывный ряд по всем дням диапазона (пустые дни — нули).
  // from/to — UTC-инстанты начала суток Алматы; день берём через almatyDay (как при агрегации),
  // иначе UTC-срез даст предыдущий календарный день и ряд не сойдётся с dailyMap.
  const daily: DailyPoint[] = []
  const cashflow: CashflowPoint[] = []
  {
    const cursor = new Date(from)
    while (cursor < to) {
      const day = almatyDay(cursor) as string
      const d = dailyMap.get(day)
      const revenue = d?.revenue || 0
      const profit = d?.profit || 0
      const revWithCost = d?.revenueWithCost || 0
      daily.push({
        date: day,
        revenue,
        profit,
        marginPct: revWithCost > 0 ? (profit / revWithCost) * 100 : null,
      })
      const commission = (d?.commission || 0) + (d?.pay || 0)
      const delivery = d?.delivery || 0
      cashflow.push({
        date: day,
        commission,
        delivery,
        deposit: revenue - commission - delivery,
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }

  // Структура выручки (донат): закуп / комиссия / Pay / доставка / налог / чистая прибыль.
  const netProfit = struct.revenueBase - struct.cost - struct.commission - struct.pay - struct.delivery - struct.tax
  const revenueStructure: RevenueStructure = {
    cost: struct.cost,
    commission: struct.commission,
    pay: struct.pay,
    delivery: struct.delivery,
    tax: struct.tax,
    netProfit,
    revenueBase: struct.revenueBase,
  }

  // Статусы заказов: маппинг сырых статусов в 4 группы.
  const statusCounts: StatusCounts = { delivered: 0, inProgress: 0, cancelled: 0, returned: 0 }
  for (const g of statusGroups) {
    const n = g._count._all
    switch (g.status) {
      case 'COMPLETED':
        statusCounts.delivered += n
        break
      case 'APPROVED_BY_BANK':
      case 'ACCEPTED_BY_MERCHANT':
        statusCounts.inProgress += n
        break
      case 'CANCELLED':
      case 'CANCELLING':
        statusCounts.cancelled += n
        break
      case 'KASPI_DELIVERY_RETURN_REQUESTED':
      case 'RETURN_ACCEPTED_BY_MERCHANT':
      case 'RETURNED':
        statusCounts.returned += n
        break
      // прочие статусы (SIGN_REQUIRED и т.п.) не показываем
    }
  }

  // --- Прогноз остатков / закупки ---------------------------------------
  // Скорость продаж считаем за период (qtySold за periodDays).
  const periodDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000))
  // Продано за период по товару (из агрегата map; берём только привязанные).
  const soldQtyByProduct = new Map<string, number>()
  for (const acc of Array.from(map.values())) {
    if (acc.productId) soldQtyByProduct.set(acc.productId, acc.qtySold)
  }
  // Уникальные товары на Kaspi (active offer) — дедуп по productId.
  const kaspiProductsById = new Map<string, (typeof kaspiStockProducts)[number]['product']>()
  for (const off of kaspiStockProducts) {
    if (off.product && !kaspiProductsById.has(off.productId)) {
      kaspiProductsById.set(off.productId, off.product)
    }
  }
  const RUNNING_OUT_DAYS = 21 // «скоро закончится» — порог дней покрытия
  const runningOut: StockForecastRow[] = []
  const deadStock: StockForecastRow[] = []
  for (const p of Array.from(kaspiProductsById.values())) {
    const available = Math.max(0, (p.totalStock ?? 0) - (p.reservedStock ?? 0))
    const qtySold = soldQtyByProduct.get(p.id) || 0
    const perDay = qtySold / periodDays
    const costPrice = p.costPrice != null && p.costPrice > 0 ? p.costPrice : null
    const row: StockForecastRow = {
      productId: p.id,
      name: p.name,
      sku: p.sku ?? null,
      available,
      qtySold,
      perDay,
      daysLeft: perDay > 0 ? available / perDay : null,
      costPrice,
      frozen: costPrice != null ? available * costPrice : null,
    }
    if (qtySold > 0 && available > 0 && row.daysLeft != null && row.daysLeft <= RUNNING_OUT_DAYS) {
      // продаётся и скоро кончится → заказать
      runningOut.push(row)
    } else if (qtySold === 0 && available > 0) {
      // есть остаток, но за период ни одной продажи → мёртвый сток
      deadStock.push(row)
    }
  }
  runningOut.sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))
  // мёртвый сток сортируем по замороженным деньгам (где их нет — по остатку)
  deadStock.sort((a, b) => (b.frozen ?? 0) - (a.frozen ?? 0) || b.available - a.available)
  const deadStockTotalFrozen = deadStock.reduce((s, r) => s + (r.frozen ?? 0), 0)
  const stockForecast: StockForecast = {
    periodDays,
    runningOut: runningOut.slice(0, 100),
    deadStock: deadStock.slice(0, 100),
    deadStockTotalFrozen,
  }

  // --- Распределение заказов по времени (часы × дни недели, время Алматы) ----
  const matrix: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
  const byWeekday = new Array(7).fill(0)
  const byHour = new Array(24).fill(0)
  let timingTotal = 0
  let peak: OrderTiming['peak'] = null
  for (const o of timingOrders) {
    if (!o.creationDate) continue
    // в Алматы (UTC+5): сдвигаем инстант и читаем UTC-поля сдвинутой даты
    const almaty = new Date(o.creationDate.getTime() + 5 * 3600_000)
    const hour = almaty.getUTCHours()
    // getUTCDay: 0=Вс..6=Сб → переводим в 0=Пн..6=Вс
    const wd = (almaty.getUTCDay() + 6) % 7
    matrix[wd][hour]++
    byWeekday[wd]++
    byHour[hour]++
    timingTotal++
    const c = matrix[wd][hour]
    if (!peak || c > peak.count) peak = { weekday: wd, hour, count: c }
  }
  const orderTiming: OrderTiming = { matrix, byWeekday, byHour, total: timingTotal, peak }

  // --- Воронка статусов / невыкуп --------------------------------------------
  // Сырые счётчики из statusGroups.
  const rawCount = (s: string) => statusGroups.find((g) => g.status === s)?._count._all || 0
  const cOplachen = rawCount('APPROVED_BY_BANK')
  const cAccepted = rawCount('ACCEPTED_BY_MERCHANT') // упаковка + передача
  const cVydan = rawCount('COMPLETED')
  const cCancelled = rawCount('CANCELLED') + rawCount('CANCELLING')
  const cReturned =
    rawCount('KASPI_DELIVERY_RETURN_REQUESTED') +
    rawCount('RETURN_ACCEPTED_BY_MERCHANT') +
    rawCount('RETURNED')
  const cPeredacha = Math.min(peredachaCount, cAccepted)
  const cUpakovka = Math.max(0, cAccepted - cPeredacha)

  // Кумулятив: «дошёл до этапа или дальше». База воронки = Оплачен или дальше
  // (всё, что было оплачено и не отменено до оплаты). Отмены/возвраты — утечка.
  const reachedDelivered = cVydan
  const reachedHandover = cPeredacha + cVydan
  const reachedPacked = cUpakovka + cPeredacha + cVydan
  const reachedPaid = cOplachen + reachedPacked
  const funnelBase = reachedPaid || 1
  const stages = [
    { key: 'paid', label: 'Оплачен', count: reachedPaid },
    { key: 'packed', label: 'Упаковка', count: reachedPacked },
    { key: 'handover', label: 'Передача', count: reachedHandover },
    { key: 'delivered', label: 'Выдан', count: reachedDelivered },
  ].map((s) => ({ ...s, pct: (s.count / funnelBase) * 100 }))
  const statusFunnel: StatusFunnel = {
    stages,
    cancelled: cCancelled,
    returned: cReturned,
    buyoutRate: reachedPaid > 0 ? (reachedDelivered / reachedPaid) * 100 : null,
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    previousRange: { from: prevFrom.toISOString(), to: prevTo.toISOString() },
    kpi: { current, previous, delta },
    topByRevenue: byRevenue.slice(0, TOP_N),
    topByProfit: byProfit.slice(0, TOP_N),
    topByMargin: byMargin.slice(0, TOP_N),
    products: byRevenue, // полный список для потоварной таблицы
    productTops,
    abc,
    problems: {
      lossMaking: lossMaking.slice(0, TOP_N),
      highReturn: highReturn.slice(0, TOP_N),
      lowMarkup: lowMarkup.slice(0, TOP_N),
    },
    noCostCohort,
    unlinked: { revenue: unlinkedRevenue, qtySold: unlinkedQty },
    econ: rates,
    revenueStructure,
    daily,
    cashflow,
    statusCounts,
    stockForecast,
    orderTiming,
    statusFunnel,
    generatedAt: new Date().toISOString(),
  }
}
