import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { getKaspiCommissionMult, getFlag, getString, KASPI_DUMPING_ENABLED, KASPI_WORKER_LAST_SEEN } from '@/lib/app-settings'
import KaspiClient from './KaspiClient'
import KaspiSwitches from './KaspiSwitches'
import KaspiCheckpointFilters from './KaspiCheckpointFilters'
import KaspiDumpingStatus from './KaspiDumpingStatus'
import KaspiDumpFilters from './KaspiDumpFilters'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 100

// Трёхпозиционный фильтр-чекпойнт: 'yes' | 'no' | undefined (неважно).
type Tri = 'yes' | 'no' | undefined
function tri(v: string | undefined): Tri {
  return v === 'yes' || v === 'no' ? v : undefined
}
function matchTri(val: boolean, f: Tri): boolean {
  if (f === undefined) return true
  return f === 'yes' ? val : !val
}

export default async function KaspiPage({ searchParams }: {
  searchParams: {
    q?: string; bound?: string; page?: string
    act?: string; avl?: string; kurl?: string; site?: string; aurl?: string
    dump?: string; comp?: string
    pos?: string; down?: string; up?: string; nofloor?: string
    pain?: string; loss?: string; expensive?: string; underdump?: string; stale?: string; alonenoceil?: string; nocost?: string
    notvisible?: string; outstock?: string; atfloor?: string; prio?: string
  }
}) {
  await requireAdmin()
  const q = (searchParams.q || '').trim()
  // Множитель комиссии — нужен раньше (для фильтра «убыточные»).
  const commissionMult = await getKaspiCommissionMult()
  const bound = searchParams.bound // undefined | 'yes' | 'no'
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1)
  // dump=on → показать только товары с включённым демпингом (autoDownscale/autoUpscale)
  const dumpOnly = searchParams.dump === 'on'
  // comp=on → только товары, где есть конкуренты (competitorCount > 0)
  const compOnly = searchParams.comp === 'on'
  // Демпинг-фильтры:
  //  pos = '1'|'2'|'3'|'4' (наша позиция) | 'alone' (конкурентов нет)
  //  down/up = 'yes'|'no' (автоснижение/автоповышение)
  //  nofloor = 'on' (снижение вкл, но мин.цена не задана — предохранитель)
  const fPos = ['1', '2', '3', '4', 'alone'].includes(searchParams.pos || '') ? searchParams.pos! : undefined
  const fDown = tri(searchParams.down)
  const fUp = tri(searchParams.up)
  const fNoFloor = searchParams.nofloor === 'on'
  // Расширенные демпинг-фильтры (вычисляются по строке):
  const fPain = searchParams.pain === 'on'           // демпинг вкл + не первые + конкуренты + нет floor
  const fLoss = searchParams.loss === 'on'           // цель демпинга ниже закуп×комиссия (убыток)
  const fExpensive = searchParams.expensive === 'on' // мы дороже конкурента в 1.5×+
  const fUnderdump = searchParams.underdump === 'on' // мы дешевле конкурента в 1.5×+ (отдаём маржу)
  const fStale = searchParams.stale === 'on'         // не проверялись >24ч (или вообще)
  const fAloneNoCeil = searchParams.alonenoceil === 'on' // один (нет конкурентов) + потолок не задан
  const fNoCost = searchParams.nocost === 'on'       // нет закупочной цены (costPrice пуст) → нельзя посчитать floor/маржу
  const fNotVisible = searchParams.notvisible === 'on' // конкуренты есть, но нас НЕТ в выдаче (дорого/глубоко)
  const fOutStock = searchParams.outstock === 'on'   // активный оффер, но товар НЕ в наличии (склад 0) → не на витрине Kaspi
  const fAtFloor = searchParams.atfloor === 'on'     // упёрлись в floor: наша цена ≤ мин.цены, ниже опускаться нельзя
  const fPrio = searchParams.prio === 'on'           // приоритетный демпинг (проверяется первым)

  // Чекпойнты выкладки на Kaspi (три состояния). Дефолт (если ни один параметр
  // не задан в URL) = act/avl/kurl/aurl 'yes' → «готов к выкладке». Если хоть один
  // задан — используем как есть (не подставляем дефолты), чтобы можно было ослаблять.
  // ВАЖНО: site (показ блока на сайте) НЕ входит в дефолт — у большинства офферов
  // showOnSite=null (авто), и требование site=yes ошибочно прятало бы все товары.
  const anyFilterSet = ['act', 'avl', 'kurl', 'site', 'aurl'].some(k => (searchParams as any)[k])
  const def: Tri = anyFilterSet ? undefined : 'yes'
  const fAct = tri(searchParams.act) ?? def    // оффер активен
  const fAvl = tri(searchParams.avl) ?? def    // товар в наличии (≈ что реально на Kaspi)
  const fKurl = tri(searchParams.kurl) ?? def  // есть ссылка Kaspi
  const fSite = tri(searchParams.site)         // showOnSite — только если задан явно (НЕ в дефолте)
  const fAurl = tri(searchParams.aurl) ?? def  // есть страница товара на Алаш (slug)

  const where: any = {}
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
      { kaspiSku: { contains: q } },
    ]
  }

  // Грузим ВСЕ карточки под поиск (766 — норм), фильтруем по чекпойнтам в JS
  // (нужны данные оффера+товара), потом пагинируем.
  const entries = await prisma.kaspiCatalogEntry.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  })

  const allSkus = entries.map(e => e.kaspiSku)
  const allPids = entries.map(e => e.kaspiProductId).filter((x): x is string => !!x)
  const offers = await prisma.kaspiOffer.findMany({
    where: { kaspiSku: { in: [...allSkus, ...allPids] } },
    include: { product: { select: { id: true, name: true, slug: true, totalStock: true, reservedStock: true, inStock: true, costPrice: true } } },
  })
  const offerBySku = new Map(offers.map(o => [o.kaspiSku, o]))

  const allRows = entries.map(e => {
    const o = offerBySku.get(e.kaspiSku) || (e.kaspiProductId ? offerBySku.get(e.kaspiProductId) : null) || null
    return {
      catalog: {
        id: e.id, kaspiSku: e.kaspiSku, kaspiUrl: e.kaspiUrl, kaspiProductId: e.kaspiProductId,
        name: e.name, brand: e.brand, priceTenge: e.priceTenge, available: e.available,
      },
      offer: o ? {
        id: o.id, kaspiName: o.kaspiName, kaspiBrand: o.kaspiBrand, priceTenge: o.priceTenge,
        active: o.active, stockOverride: o.stockOverride, availableOverride: o.availableOverride,
        preOrder: o.preOrder, showOnSite: o.showOnSite,
        // Демпинг
        autoDownscale: o.autoDownscale, autoUpscale: o.autoUpscale,
        minPriceTenge: o.minPriceTenge, maxPriceTenge: o.maxPriceTenge,
        dumpingStep: o.dumpingStep, strategy: o.strategy, ignoreMerchants: o.ignoreMerchants,
        firstPlacePrice: o.firstPlacePrice, rivalPrice: o.rivalPrice, rivalName: o.rivalName, ourPosition: o.ourPosition,
        competitorCount: o.competitorCount, lastDumpCheckAt: o.lastDumpCheckAt,
        lastDumpError: o.lastDumpError, dumpPriority: (o as any).dumpPriority ?? false,
        product: o.product ? {
          id: o.product.id, name: o.product.name, slug: o.product.slug,
          totalStock: o.product.totalStock, reservedStock: o.product.reservedStock, inStock: o.product.inStock,
          costPrice: o.product.costPrice,
        } : null,
      } : null,
    }
  })

  // Вычисляем чекпойнты на строку и фильтруем.
  const filtered = allRows.filter(r => {
    const o = r.offer
    // act: оффер активен
    const cAct = !!o?.active
    // avl: товар Алаш привязан и в наличии (availableOverride важнее)
    const p = o?.product
    const stock = o?.stockOverride != null ? o.stockOverride : (p ? Math.max(0, p.totalStock - (p.reservedStock ?? 0)) : 0)
    const cAvl = o?.availableOverride != null ? !!o.availableOverride : !!(p && p.inStock && stock > 0)
    // kurl: есть ссылка Kaspi (на оффере или каталоге)
    const cKurl = !!(r.catalog.kaspiUrl)
    // site: показывается ли блок «Купить на Kaspi» на сайте. showOnSite:
    //   true → всегда; false → скрыт; null → АВТО (= active && доступен).
    // Эффективный показ должен учитывать авто-режим, иначе null ошибочно считался
    // «нет» и фильтр «Показ=да» давал 0 строк (у всех офферов showOnSite=null).
    const cSite = o ? (o.showOnSite != null ? o.showOnSite : (cAct && cAvl)) : false
    // aurl: есть страница товара на Алаш (привязан товар со slug)
    const cAurl = !!(p && p.slug)

    if (bound === 'yes' && !o) return false
    if (bound === 'no' && o) return false
    // dump=on → только товары с включённым автоснижением/повышением
    if (dumpOnly && !(o?.autoDownscale || o?.autoUpscale)) return false
    // comp=on → только товары с конкурентами (есть смысл ставить floor/max)
    if (compOnly && !((o?.competitorCount ?? 0) > 0)) return false

    // --- Демпинг-фильтры ---
    const comp = o?.competitorCount ?? 0
    const pos = o?.ourPosition ?? null
    // pos: '1'..'4' — наша позиция; 'alone' — конкурентов нет
    if (fPos) {
      if (fPos === 'alone') { if (comp !== 0) return false }
      else { if (pos !== Number(fPos)) return false }
    }
    // снижение/повышение вкл/выкл
    if (fDown !== undefined && matchTri(!!o?.autoDownscale, fDown) === false) return false
    if (fUp !== undefined && matchTri(!!o?.autoUpscale, fUp) === false) return false
    // без мин.цены: снижение вкл, но floor (minPriceTenge) не задан (предохранитель)
    if (fNoFloor && !(o?.autoDownscale && o?.minPriceTenge == null)) return false

    // --- Расширенные демпинг-фильтры ---
    const rival = o?.rivalPrice ?? null
    const ourPrice = o?.priceTenge ?? 0
    const cost = o?.product?.costPrice ?? null
    // pain: демпинг вкл + не первые + есть конкуренты + floor не задан (заблокировано)
    if (fPain && !(o?.autoDownscale && pos != null && pos !== 1 && comp > 0 && o?.minPriceTenge == null)) return false
    // loss: цель демпинга (rival−step) ниже безубытка (закуп×комиссия) → ушли бы в минус
    if (fLoss) {
      const target = rival != null ? rival - (o?.dumpingStep || 2) : null
      const breakeven = cost != null && cost > 0 ? cost * commissionMult : null
      if (!(target != null && breakeven != null && target < breakeven)) return false
    }
    // expensive: мы дороже релевантного конкурента в 1.5×+ (теряем продажи)
    if (fExpensive && !(rival != null && rival > 0 && ourPrice > rival * 1.5)) return false
    // underdump: мы дешевле конкурента в 1.5×+ (отдаём маржу даром)
    if (fUnderdump && !(rival != null && rival > 0 && ourPrice > 0 && ourPrice * 1.5 < rival)) return false
    // stale: не проверялись >24ч (или вообще не проверялись, но есть оффер)
    if (fStale) {
      if (!o) return false
      const checkedMs = o.lastDumpCheckAt ? new Date(o.lastDumpCheckAt).getTime() : 0
      const stale = !checkedMs || (Date.now() - checkedMs) > 24 * 3600 * 1000
      if (!stale) return false
    }
    // alonenoceil: конкурентов нет, но потолок (max) не задан → автоповышение молчит
    if (fAloneNoCeil && !(o && comp === 0 && o.maxPriceTenge == null && o.lastDumpCheckAt)) return false
    // nocost: нет закупочной цены (costPrice пуст/0) — нельзя посчитать безубыток.
    // Требуем привязанный товар (без оффера closPrice неизвестен → не показываем).
    if (fNoCost && !(o && p && (cost == null || cost <= 0))) return false
    // notvisible: конкуренты есть, но мы НЕ в выдаче (ourPosition пуст) — дорого/глубоко.
    if (fNotVisible && !(o && comp > 0 && pos == null && o.lastDumpCheckAt)) return false
    // outstock: активный оффер, но товар не в наличии (cAvl=false) → не на витрине Kaspi.
    if (fOutStock && !(o && o.active && !cAvl)) return false
    // atfloor: УПЁРЛИСЬ В ПОЛ — floor задан, есть конкуренты, и наша цена опустилась
    // до минимума (≤ floor): дальше демпинговать некуда. Тут конкурент может стоять
    // ниже нашего floor → чтобы отбить, нужно вручную снизить минимум.
    if (fAtFloor && !(o && o.minPriceTenge != null && comp > 0 && ourPrice <= o.minPriceTenge)) return false
    // prio: приоритетный демпинг (воркер проверяет первым каждый прогон).
    if (fPrio && !(o && (o as any).dumpPriority)) return false

    return matchTri(cAct, fAct) && matchTri(cAvl, fAvl) && matchTri(cKurl, fKurl)
      && matchTri(cSite, fSite) && matchTri(cAurl, fAurl)
  })

  const filteredTotal = filtered.length
  const pages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))
  const curPage = Math.min(page, pages)
  const rows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)

  const total = await prisma.kaspiCatalogEntry.count()
  const totalOffers = await prisma.kaspiOffer.count()
  const totalActive = await prisma.kaspiOffer.count({ where: { active: true } })

  // «В продаже на Kaspi» — считаем ПО НАШЕЙ ЛОГИКЕ (что реально уходит в фид как
  // available=yes): active + есть kaspiName + товар в наличии + есть kaspi-ссылка +
  // привязан товар Алаш (slug). Это число всегда актуально (не зависит от кабинета).
  // Совпадает с «В продаже» в кабинете Kaspi. Старая кабинетная метка больше не нужна.
  const feedOffers = await prisma.kaspiOffer.findMany({
    where: { active: true, kaspiName: { not: null } },
    select: {
      kaspiSku: true, kaspiUrl: true, stockOverride: true, availableOverride: true,
      product: { select: { slug: true, totalStock: true, reservedStock: true, inStock: true } },
    },
  })
  // ссылки Kaspi из каталога (на случай если у оффера kaspiUrl пуст)
  const catUrls = await prisma.kaspiCatalogEntry.findMany({
    where: { OR: [{ kaspiSku: { in: feedOffers.map(o => o.kaspiSku) } }, { kaspiProductId: { in: feedOffers.map(o => o.kaspiSku) } }] },
    select: { kaspiSku: true, kaspiProductId: true, kaspiUrl: true },
  })
  const urlByKey = new Map<string, string | null>()
  for (const c of catUrls) { urlByKey.set(c.kaspiSku, c.kaspiUrl); if (c.kaspiProductId) urlByKey.set(c.kaspiProductId, c.kaspiUrl) }
  const onKaspiCount = feedOffers.filter(o => {
    const availStock = Math.max(0, (o.product?.totalStock ?? 0) - (o.product?.reservedStock ?? 0))
    const stock = o.stockOverride != null ? Math.max(0, o.stockOverride) : availStock
    const cAvl = o.availableOverride != null ? !!o.availableOverride : !!(o.product?.inStock && stock > 0)
    const cKurl = !!(o.kaspiUrl || urlByKey.get(o.kaspiSku))
    const cAurl = !!(o.product?.slug)
    return cAvl && cKurl && cAurl
  }).length

  // Статистика демпинга для плашки статуса.
  const dumpingEnabled = await getFlag(KASPI_DUMPING_ENABLED, false)
  const workerLastSeen = await getString(KASPI_WORKER_LAST_SEEN)
  const dumpingOn = await prisma.kaspiOffer.count({
    where: { active: true, OR: [{ autoDownscale: true }, { autoUpscale: true }] },
  })
  // «Опасные»: снижение включено, но floor (minPriceTenge) не задан — бот их не тронет.
  const noFloor = await prisma.kaspiOffer.count({
    where: { active: true, autoDownscale: true, minPriceTenge: null },
  })
  // Товары с конкурентами (где есть смысл ставить floor/max).
  const withCompetitors = await prisma.kaspiOffer.count({
    where: { active: true, competitorCount: { gt: 0 } },
  })

  // Счётчики для демпинг-фильтров (по активным офферам, у которых снята позиция).
  const [c1, c2, c3, c4, cAlone, cDownOn, cUpOn] = await Promise.all([
    prisma.kaspiOffer.count({ where: { active: true, ourPosition: 1 } }),
    prisma.kaspiOffer.count({ where: { active: true, ourPosition: 2 } }),
    prisma.kaspiOffer.count({ where: { active: true, ourPosition: 3 } }),
    prisma.kaspiOffer.count({ where: { active: true, ourPosition: 4 } }),
    prisma.kaspiOffer.count({ where: { active: true, competitorCount: 0, lastDumpCheckAt: { not: null } } }),
    prisma.kaspiOffer.count({ where: { active: true, autoDownscale: true } }),
    prisma.kaspiOffer.count({ where: { active: true, autoUpscale: true } }),
  ])
  // «Боль»: демпинг-снижение вкл, мы не первые, есть конкуренты, floor не задан.
  const painCount = await prisma.kaspiOffer.count({
    where: { active: true, autoDownscale: true, minPriceTenge: null, competitorCount: { gt: 0 }, ourPosition: { not: 1 } },
  })
  // Активные офферы, у которых позиция ещё не снималась (нет данных для решений).
  const notCheckedCount = await prisma.kaspiOffer.count({
    where: { active: true, lastDumpCheckAt: null },
  })
  // «Нет закупа»: активные офферы с привязанным товаром, у которого costPrice пуст/0.
  const noCostCount = await prisma.kaspiOffer.count({
    where: { active: true, product: { OR: [{ costPrice: null }, { costPrice: { lte: 0 } }] } },
  })
  // «Нас нет в выдаче»: конкуренты есть, но ourPosition пуст (мы дороже/глубже топ-64).
  const notVisibleCount = await prisma.kaspiOffer.count({
    where: { active: true, competitorCount: { gt: 0 }, ourPosition: null, lastDumpCheckAt: { not: null } },
  })
  // «Упёрлись в пол»: floor задан, есть конкуренты, наша цена ≤ floor (демпинг встал).
  // Выражение по двум колонкам → raw SQL. dumpPriority — новая колонка, тоже raw
  // (на случай если клиент ещё не пересобран).
  const atFloorRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM "KaspiOffer"
     WHERE active = true AND "minPriceTenge" IS NOT NULL
       AND "competitorCount" > 0 AND "priceTenge" <= "minPriceTenge"`
  )
  const atFloorCount = Number(atFloorRows?.[0]?.n ?? 0)
  const prioRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM "KaspiOffer" WHERE active = true AND "dumpPriority" = true`
  )
  const prioCount = Number(prioRows?.[0]?.n ?? 0)
  const dumpFilterCounts = {
    pos1: c1, pos2: c2, pos3: c3, pos4: c4, alone: cAlone,
    comp: withCompetitors, downOn: cDownOn, upOn: cUpOn, noFloor, pain: painCount,
    noCost: noCostCount, notVisible: notVisibleCount, atFloor: atFloorCount, prio: prioCount,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kaspi</h1>
          <p className="text-sm text-gray-500 mt-1">
            Каталог Kaspi и привязка к товарам Alash. Фид: <code className="bg-gray-100 px-1.5 py-0.5 rounded">/api/kaspi/feed.xml</code>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Каталог Kaspi</div>
          <div className="text-2xl font-bold mt-1">{total}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Привязано к Alash</div>
          <div className="text-2xl font-bold mt-1 text-green-600">{totalOffers}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Активных в фиде</div>
          <div className="text-2xl font-bold mt-1 text-admin">{totalActive}</div>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4" title="Сколько товаров реально уходит на Kaspi как «в продаже»: active + в наличии + есть kaspi-ссылка + привязан товар Алаш. Считается по нашей логике (всегда актуально).">
          <div className="text-xs text-gray-500 uppercase tracking-wide">На Kaspi (в продаже)</div>
          <div className="text-2xl font-bold mt-1 text-green-600">{onKaspiCount}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">по чекпойнтам выкладки</div>
        </div>
      </div>

      <KaspiSwitches />

      <KaspiDumpingStatus
        enabled={dumpingEnabled}
        dumpingOn={dumpingOn}
        noFloor={noFloor}
        withCompetitors={withCompetitors}
        workerLastSeen={workerLastSeen}
        dumpOnly={dumpOnly}
        compOnly={compOnly}
        painCount={painCount}
        noPositionCount={notCheckedCount}
      />

      <KaspiDumpFilters counts={dumpFilterCounts} />

      <KaspiCheckpointFilters counts={{ ready: filteredTotal, total }} />

      <div className="text-sm text-gray-500">
        Показано {rows.length} из {filteredTotal} (по фильтру) · страница {curPage} из {pages}
      </div>

      <KaspiClient rows={rows} q={q} bound={bound} commissionMult={commissionMult} />

      {pages > 1 && (
        <div className="flex items-center justify-center gap-1 flex-wrap pt-2">
          {pageLink(curPage - 1, searchParams, curPage <= 1, '‹ Назад')}
          {Array.from({ length: pages }, (_, i) => i + 1).map(p =>
            pageNum(p, curPage, searchParams)
          )}
          {pageLink(curPage + 1, searchParams, curPage >= pages, 'Вперёд ›')}
        </div>
      )}
    </div>
  )
}

// Сохраняем все текущие параметры (поиск + чекпойнты), меняем только page.
function buildHref(page: number, sp: Record<string, string | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'page') continue
    if (v) p.set(k, v)
  }
  if (page > 1) p.set('page', String(page))
  const qs = p.toString()
  return `/admin/kaspi${qs ? `?${qs}` : ''}`
}

function pageLink(page: number, sp: Record<string, string | undefined>, disabled: boolean, label: string) {
  if (disabled) return <span className="px-3 py-1.5 text-sm text-gray-300">{label}</span>
  return <a href={buildHref(page, sp)} className="px-3 py-1.5 text-sm rounded border border-gray-200 text-gray-700 hover:border-admin hover:text-admin">{label}</a>
}

function pageNum(p: number, cur: number, sp: Record<string, string | undefined>) {
  const active = p === cur
  return (
    <a key={p} href={buildHref(p, sp)}
      className={`min-w-[34px] text-center px-2.5 py-1.5 text-sm rounded border ${active ? 'bg-admin text-white border-admin' : 'border-gray-200 text-gray-700 hover:border-admin hover:text-admin'}`}>
      {p}
    </a>
  )
}
