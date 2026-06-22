// Движок Каспи-демпинга: снятие цен конкурентов + расчёт целевой цены + применение.
//
// Источник цен конкурентов — публичный JSON-эндпоинт Kaspi (БЕЗ авторизации):
//   POST https://kaspi.kz/yml/offer-view/offers/{PID}
// (проверено живьём 2026-05-30: POST-only, обязателен Referer + Content-Type,
//  limit≤64, sortOption=PRICE → offers[] отсортирован по возрастанию цены).
//
// Смена цены — записью KaspiOffer.priceTenge: наш XML-фид (feed.xml) отдаёт её на
// Kaspi автоматически (официального REST для цены у Kaspi нет). Цена Kaspi
// ИЗОЛИРОВАНА от ProductVariant.price → демпинг не задевает сайт/Satu/Ba3ar.
//
// Подробности и обоснование — docs/kaspi-dumping.md.

import { prisma } from '@/lib/prisma'
import { kaspiPidFromSku } from '@/lib/kaspi-url'

// Наш merchantId в выдаче offer-view (НЕ тот же, что KASPI_MERCHANT_ID=30233309 в
// фиде — там идентификатор магазина из кабинета). Выносим в env на всякий случай.
const OUR_MERCHANT_ID = (process.env.KASPI_OFFERVIEW_MERCHANT_ID || '30383258').trim()

// Город мониторинга/конкуренции (по умолчанию Алматы).
const DUMPING_CITY = (process.env.KASPI_DUMPING_CITY || '750000000').trim()

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// FIRST_MIN_GAP — «первые, но на копейки от второго»: встаём на (цена ближайшего
// конкурента − шаг). В отличие от BECOME_FIRST разрешает ПОДНИМАТЬ цену вверх к
// преследователю, если мы стоим сильно дешевле (не распродаём в убыток). Источник —
// полная выдача offer-view (нужен второй продавец; кабинетный price/lowest не годится).
export type DumpStrategy = 'BECOME_FIRST' | 'MATCH_FIRST' | 'HOLD_SECOND' | 'FIRST_MIN_GAP'

// Один оффер продавца из offer-view (нормализованный).
export interface CompetitorOffer {
  price: number
  merchantId: string
  merchantName: string
  rating: number | null
  reviews: number | null
  kaspiDelivery: boolean
  deliveryDuration: string | null
}

export interface OfferViewResult {
  ok: boolean
  offers: CompetitorOffer[]
  total: number
  error?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Снять список продавцов по PID из offer-view. Ретрай на 429/5xx (экспонента+jitter).
// limit=64 — максимум, который принимает Kaspi (65+ → 400). Для редких товаров с
// >64 продавцами верхних позиций всё равно достаточно (нам нужен минимум цены).
export async function fetchOffers(
  pid: string,
  cityId: string = DUMPING_CITY,
  attempt = 0,
): Promise<OfferViewResult> {
  const url = `https://kaspi.kz/yml/offer-view/offers/${pid}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/*',
        // Referer ОБЯЗАТЕЛЕН — без него Kaspi nginx отдаёт 403.
        Referer: `https://kaspi.kz/shop/p/-${pid}/`,
        'User-Agent': UA,
        'Accept-Language': 'ru,en;q=0.9',
      },
      body: JSON.stringify({
        cityId,
        id: pid,
        page: 0,
        limit: 64,
        sortOption: 'PRICE',
        installationId: '-1',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })

    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const delay = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 300)
      await sleep(delay)
      return fetchOffers(pid, cityId, attempt + 1)
    }
    if (!res.ok) {
      return { ok: false, offers: [], total: 0, error: `offer-view ${res.status}` }
    }

    const data: any = await res.json()
    const rawOffers: any[] = Array.isArray(data?.offers) ? data.offers : []
    const offers: CompetitorOffer[] = rawOffers
      .map((o) => ({
        price: Math.round(Number(o?.price)),
        merchantId: String(o?.merchantId ?? ''),
        merchantName: String(o?.merchantName ?? ''),
        rating: o?.merchantRating != null ? Number(o.merchantRating) : null,
        reviews: o?.merchantReviewsQuantity != null ? Number(o.merchantReviewsQuantity) : null,
        kaspiDelivery: !!o?.kaspiDelivery,
        deliveryDuration: o?.deliveryDuration != null ? String(o.deliveryDuration) : null,
      }))
      .filter((o) => Number.isFinite(o.price) && o.price > 0)
    // На случай если Kaspi вернул не строго по цене — гарантируем сортировку.
    offers.sort((a, b) => a.price - b.price)
    return { ok: true, offers, total: Number(data?.total ?? offers.length) }
  } catch (e) {
    return { ok: false, offers: [], total: 0, error: (e as Error).message }
  }
}

// Настройки демпинга одного оффера (то, что нужно движку для расчёта).
export interface DumpingConfig {
  currentPrice: number
  autoDownscale: boolean
  autoUpscale: boolean
  minPriceTenge: number | null
  maxPriceTenge: number | null
  dumpingStep: number
  strategy: string
  ignoreMerchants: string[]
  // Цена товара на сайте (Product.price) и множитель комиссии Kaspi. Когда конкурентов
  // НЕТ, целевая цена = round(sitePrice × commissionMult) — компенсируем комиссию Kaspi,
  // чтобы выручка была как на сайте (на сайте 450 → на Kaspi 450×1.41=635). Опционально:
  // если sitePrice не задан, работает старое поведение (поднятие к maxPriceTenge).
  sitePrice?: number | null
  commissionMult?: number
  // Закуп (Product.costPrice). Нужен для floor-защиты «одного в карточке»: не опускаем
  // цену ниже безубытка (costPrice × commissionMult), даже если сайт×mult ниже. Без
  // закупа и без minPriceTenge одиночную цену вниз НЕ трогаем (только вверх) —
  // предохранитель от ухода в убыток из-за заниженной цены на сайте.
  costPrice?: number | null
}

export type DumpStatus =
  | 'winning'        // мы первые
  | 'matched'        // поставили = лидеру (ставка на рейтинг)
  | 'floor'          // упёрлись в floor, ниже нельзя
  | 'no_competitors' // конкурентов нет
  | 'no_floor'       // включено снижение, но floor не задан — НЕ трогаем (предохранитель)
  | 'unchanged'      // цена уже оптимальна, менять нечего
  | 'skipped'        // нет ни снижения, ни повышения

export interface ComputeResult {
  target: number | null      // null = цену не менять
  status: DumpStatus
  firstPlacePrice: number | null
  // Цена релевантного конкурента, на которого ориентируемся:
  //   мы 1-е  → цена ВТОРОГО (ближайший преследователь сзади);
  //   мы 2+   → цена ПЕРВОГО (лидер, которого надо обогнать).
  // Это competitors[0].price — ближайший конкурент без нас. Именно его показываем
  // в админке и от него считаем цель (на 2₸ дешевле). null если конкурентов нет.
  rivalPrice: number | null
  rivalName: string | null   // имя продавца релевантного конкурента (для игнора/показа)
  ourPosition: number | null
  competitorCount: number
}

// Чистый расчёт целевой цены по списку офферов и настройкам. Без сайд-эффектов.
// Алгоритм: исключаем себя и ignore-merchants → находим минимум конкурента →
// по стратегии считаем желаемую цену → clamp в [floor, ceiling] → решаем,
// разрешено ли это изменение (снижение/повышение по тумблерам) + анти-флаппинг.
export function computeTargetPrice(cfg: DumpingConfig, offers: CompetitorOffer[]): ComputeResult {
  const ignore = new Set([OUR_MERCHANT_ID, ...cfg.ignoreMerchants.map((m) => String(m))])

  // Наша позиция в общей выдаче (по merchantId), 1-based; null если нас нет.
  const ourIdx = offers.findIndex((o) => o.merchantId === OUR_MERCHANT_ID)
  const ourPosition = ourIdx >= 0 ? ourIdx + 1 : null
  const firstPlacePrice = offers.length ? offers[0].price : null

  // Конкуренты = все, кроме нас и игнор-листа (отсортированы по цене).
  const competitors = offers.filter((o) => !ignore.has(o.merchantId))
  const competitorCount = competitors.length

  // Цена/имя релевантного конкурента = ближайший конкурент без нас:
  //   мы первые → это ВТОРОЙ в выдаче; мы не первые → это ПЕРВЫЙ (лидер).
  const rivalPrice = competitors.length ? competitors[0].price : null
  const rivalName = competitors.length ? (competitors[0].merchantName || null) : null

  const base = (status: DumpStatus, target: number | null): ComputeResult => ({
    target,
    status,
    firstPlacePrice,
    rivalPrice,
    rivalName,
    ourPosition,
    competitorCount,
  })

  // Предохранитель: снижение включено, но floor не задан → НИКОГДА не трогаем
  // (иначе уроним в ноль). Это отдельный статус, виден в UI как ошибка-предупреждение.
  //
  // FIRST_MIN_GAP — исключение: эта стратегия в основном ПОДНИМАЕТ цену к второму
  // (когда мы стоим слишком дёшево), а подъём не опасен. Поэтому без floor её НЕ
  // блокируем целиком — продолжаем расчёт, а finalize() ниже сам запретит СНИЖЕНИЕ
  // при отсутствии floor (поднятие пропустит). Так «сильно дёшево → поднять» работает
  // даже без заданной мин. цены, а уронить в ноль по-прежнему нельзя.
  const isMinGap = cfg.strategy === 'FIRST_MIN_GAP'
  if (cfg.autoDownscale && cfg.minPriceTenge == null && !isMinGap) {
    return base('no_floor', null)
  }

  // Нет конкурентов: мы одни в карточке → ставим МАКС цену (maxPriceTenge), которую
  // владелец задаёт вручную. Логику «сайт × 1.41» УБРАЛИ (по решению владельца —
  // Мин/Макс проставляются руками). Если Макс не задан — НЕ трогаем (нечего ставить).
  // Floor (Мин) — нижняя граница: если Макс почему-то ниже Мина, берём Мин.
  if (competitorCount === 0) {
    let aloneTarget: number | null = cfg.maxPriceTenge ?? null
    if (aloneTarget == null) return base('no_competitors', null)  // нет потолка → не трогаем
    if (cfg.minPriceTenge != null && aloneTarget < cfg.minPriceTenge) aloneTarget = cfg.minPriceTenge
    aloneTarget = Math.max(1, Math.round(aloneTarget))
    if (aloneTarget !== cfg.currentPrice) {
      // allowAnyway: «один в карточке» → Макс цена ставится автоматически (не демпинг).
      return finalize(cfg, aloneTarget, base('no_competitors', aloneTarget), true)
    }
    return base('no_competitors', null)
  }

  const minComp = competitors[0].price // competitors уже отсортированы (offers сортирован)

  // Желаемая цена по стратегии. minComp = цена ближайшего конкурента (без нас).
  let desired: number
  switch (cfg.strategy as DumpStrategy) {
    case 'MATCH_FIRST':
      desired = minComp // равная цена — расчёт на наш рейтинг/доставку
      break
    case 'HOLD_SECOND': {
      // держать 2-е место: чуть выше минимума конкурента (на шаг). Реализовано
      // просто; при необходимости уточнить позже.
      desired = minComp + cfg.dumpingStep
      break
    }
    case 'FIRST_MIN_GAP':
      // «первые, но на копейки от второго»: на шаг ниже ближайшего конкурента.
      // Формула та же, что BECOME_FIRST, но finalize() ниже разрешит ПОДНЯТЬ цену
      // к преследователю (если мы стоим слишком дёшево) — см. ветку в finalize.
      desired = minComp - cfg.dumpingStep
      break
    case 'BECOME_FIRST':
    default:
      desired = minComp - cfg.dumpingStep // на шаг ниже минимума конкурента
      break
  }

  // Clamp в [floor, ceiling].
  if (cfg.minPriceTenge != null && desired < cfg.minPriceTenge) desired = cfg.minPriceTenge
  if (cfg.maxPriceTenge != null && desired > cfg.maxPriceTenge) desired = cfg.maxPriceTenge
  desired = Math.max(1, Math.round(desired))

  // Статус: уперлись ли в floor.
  const atFloor = cfg.minPriceTenge != null && desired === cfg.minPriceTenge && desired > minComp - cfg.dumpingStep
  let status: DumpStatus =
    cfg.strategy === 'MATCH_FIRST' && desired === minComp ? 'matched'
    : atFloor ? 'floor'
    : 'winning'

  return finalize(cfg, desired, base(status, desired))
}

// Решает, разрешено ли применить желаемую цену (тумблеры снижения/повышения) +
// анти-флаппинг (не трогаем, если цена уже равна желаемой).
//
// FIRST_MIN_GAP — особый случай: поднятие цены к преследователю это СУТЬ стратегии
// (если стоим слишком дёшево — не распродаём в убыток), поэтому поднятие разрешено
// всегда, не требуя отдельного тумблера autoUpscale. Снижение по-прежнему требует
// autoDownscale (предохранитель против ухода в убыток без floor уже сработал выше).
// allowAnyway=true — применить цену независимо от тумблеров (для случая «один в
// карточке»: маржинальная цена сайт×mult ставится автоматически, это не демпинг).
function finalize(cfg: DumpingConfig, desired: number, res: ComputeResult, allowAnyway = false): ComputeResult {
  if (desired === cfg.currentPrice) return { ...res, target: null, status: 'unchanged' }
  if (allowAnyway) return { ...res, target: desired }
  const lowering = desired < cfg.currentPrice
  const raising = desired > cfg.currentPrice
  const isMinGap = cfg.strategy === 'FIRST_MIN_GAP'
  // FIRST_MIN_GAP без floor: снижать НЕЛЬЗЯ (защита от падения в ноль — floor не задан),
  // поднимать к преследователю — можно. С заданным floor снижение работает как обычно.
  if (isMinGap && lowering && cfg.minPriceTenge == null) return { ...res, target: null, status: 'no_floor' }
  if (lowering && !cfg.autoDownscale) return { ...res, target: null, status: 'skipped' }
  if (raising && !cfg.autoUpscale && !isMinGap) return { ...res, target: null, status: 'skipped' }
  return { ...res, target: desired }
}

// Определить Kaspi PID для оффера: из SKU (вида "PID_xxx") или из каталога.
// Возвращает null, если PID ещё не известен (товар ждёт заполнения PID).
export async function resolvePid(kaspiSku: string): Promise<string | null> {
  const fromSku = kaspiPidFromSku(kaspiSku)
  if (fromSku) return fromSku
  // Голый SKU → ищем PID в каталоге (по kaspiSku или его product-id части).
  const bare = kaspiSku.split('_')[0]
  const cat = await prisma.kaspiCatalogEntry.findFirst({
    where: { OR: [{ kaspiSku }, { kaspiSku: bare }, { kaspiProductId: kaspiSku }, { kaspiProductId: bare }] },
    select: { kaspiProductId: true },
  })
  return cat?.kaspiProductId || null
}

// Применить результат к офферу: записать цену (если есть target) + метрики + лог.
// dryRun=true → метрики пишем, цену НЕ меняем (для безопасной разведки).
export async function applyDumping(opts: {
  offerId: string
  productId: string
  result: ComputeResult
  dryRun?: boolean
  error?: string | null
}): Promise<{ changed: boolean; newPrice: number | null }> {
  const { offerId, productId, result, dryRun, error } = opts

  const metrics: any = {
    firstPlacePrice: result.firstPlacePrice,
    rivalPrice: result.rivalPrice,
    rivalName: result.rivalName,
    ourPosition: result.ourPosition,
    competitorCount: result.competitorCount,
    lastDumpCheckAt: new Date(),
    lastDumpError: error ?? null,
  }

  // Если менять нечего (или dry-run) — пишем только метрики.
  if (result.target == null || dryRun) {
    await prisma.kaspiOffer.update({ where: { id: offerId }, data: metrics })
    return { changed: false, newPrice: null }
  }

  // Узнаём старую цену для лога.
  const before = await prisma.kaspiOffer.findUnique({
    where: { id: offerId },
    select: { priceTenge: true },
  })
  const oldPrice = before?.priceTenge ?? 0
  const newPrice = result.target

  await prisma.$transaction([
    prisma.kaspiOffer.update({
      where: { id: offerId },
      data: { ...metrics, priceTenge: newPrice },
    }),
    // Лог в историю товара (как admin-форма; guard от NaN через || 0).
    prisma.productChangeLog.create({
      data: {
        productId,
        field: 'price',
        oldValue: Number(oldPrice) || 0,
        newValue: Number(newPrice) || 0,
        source: 'kaspi-dumping',
        detail: `демпинг (${result.status}): ${oldPrice}→${newPrice}₸, поз ${result.ourPosition ?? '?'}, конкурентов ${result.competitorCount}`,
      },
    }),
  ])

  return { changed: true, newPrice }
}

// Высокоуровневый прогон одного оффера: PID → fetch → compute → apply.
// Используется и кроном, и кнопкой «Проверить сейчас». Никогда не бросает —
// возвращает структуру результата (ошибку кладёт в lastDumpError оффера).
export interface RunOneInput {
  offerId: string
  productId: string
  kaspiSku: string
  config: DumpingConfig
}
export interface RunOneOutput {
  offerId: string
  pid: string | null
  status: DumpStatus | 'no_pid' | 'fetch_error'
  changed: boolean
  oldPrice: number
  newPrice: number | null
  firstPlacePrice: number | null
  ourPosition: number | null
  competitorCount: number
  error?: string
}

export async function runOneOffer(input: RunOneInput, dryRun = false): Promise<RunOneOutput> {
  const { offerId, productId, kaspiSku, config } = input
  const out: RunOneOutput = {
    offerId,
    pid: null,
    status: 'no_pid',
    changed: false,
    oldPrice: config.currentPrice,
    newPrice: null,
    firstPlacePrice: null,
    ourPosition: null,
    competitorCount: 0,
  }

  const pid = await resolvePid(kaspiSku)
  out.pid = pid
  if (!pid) {
    // Нет PID — не ошибка, товар ждёт заполнения. Помечаем и идём дальше.
    await prisma.kaspiOffer.update({
      where: { id: offerId },
      data: { lastDumpCheckAt: new Date(), lastDumpError: 'нет PID' },
    }).catch(() => {})
    out.status = 'no_pid'
    out.error = 'нет PID'
    return out
  }

  const fetched = await fetchOffers(pid)
  if (!fetched.ok) {
    await prisma.kaspiOffer.update({
      where: { id: offerId },
      data: { lastDumpCheckAt: new Date(), lastDumpError: fetched.error || 'offer-view error' },
    }).catch(() => {})
    out.status = 'fetch_error'
    out.error = fetched.error
    return out
  }

  const result = computeTargetPrice(config, fetched.offers)
  const applied = await applyDumping({ offerId, productId, result, dryRun, error: null })

  out.status = result.status
  out.changed = applied.changed
  out.newPrice = applied.newPrice
  out.firstPlacePrice = result.firstPlacePrice
  out.ourPosition = result.ourPosition
  out.competitorCount = result.competitorCount
  return out
}

// Прогон по множеству офферов с троттлингом. Ошибка одного не валит остальные.
export interface RunBatchSummary {
  checked: number
  changed: number
  noPid: number
  errors: number
  results: RunOneOutput[]
}

export async function runDumpingBatch(
  inputs: RunOneInput[],
  opts: { dryRun?: boolean; delayMs?: number } = {},
): Promise<RunBatchSummary> {
  const delayMs = opts.delayMs ?? 600
  const summary: RunBatchSummary = { checked: 0, changed: 0, noPid: 0, errors: 0, results: [] }

  for (let i = 0; i < inputs.length; i++) {
    const r = await runOneOffer(inputs[i], opts.dryRun)
    summary.results.push(r)
    summary.checked++
    if (r.changed) summary.changed++
    if (r.status === 'no_pid') summary.noPid++
    if (r.status === 'fetch_error') summary.errors++
    // Троттлинг между запросами к Kaspi (не долбить), кроме последнего.
    if (i < inputs.length - 1) await sleep(delayMs)
  }
  return summary
}

// Утилита маржи для UI/расчётов (множитель комиссии передаётся снаружи).
export function calcMargin(price: number | null | undefined, costPrice: number | null | undefined, mult: number): {
  marginTenge: number | null
  marginPct: number | null
} {
  if (price == null || price <= 0 || costPrice == null || costPrice <= 0) {
    return { marginTenge: null, marginPct: null }
  }
  const marginTenge = Math.round(price - costPrice * mult)
  const marginPct = Math.round((marginTenge / price) * 1000) / 10
  return { marginTenge, marginPct }
}

export function floorFromCost(costPrice: number | null | undefined, mult: number): number | null {
  if (costPrice == null || costPrice <= 0) return null
  return Math.round(costPrice * mult)
}
