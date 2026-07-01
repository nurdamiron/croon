import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { getKaspiCommissionMult } from '@/lib/app-settings'
import KaspiClient from './KaspiClient'
import KaspiSwitches from './KaspiSwitches'
import KaspiCheckpointFilters from './KaspiCheckpointFilters'

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
  }
}) {
  await requireAdmin()
  const q = (searchParams.q || '').trim()
  // Множитель комиссии — нужен раньше (для фильтра «убыточные»).
  const commissionMult = await getKaspiCommissionMult()
  const bound = searchParams.bound // undefined | 'yes' | 'no'
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1)
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


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kaspi</h1>
          <p className="text-sm text-gray-500 mt-1">
            Каталог Kaspi и привязка к товарам сайта. Фид: <code className="bg-gray-100 px-1.5 py-0.5 rounded">/api/kaspi/feed.xml</code>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Каталог Kaspi</div>
          <div className="text-2xl font-bold mt-1">{total}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Привязано к сайту</div>
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
