import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Sidebar from '@/components/LazySidebar'
import SortSelect from '@/components/SortSelect'
import PerPageSelect from '@/components/PerPageSelect'

export const revalidate = 1800 // ISR: rebuild category pages every 30 min
import ProductCard from '@/components/ProductCard'
import {
  getCategories,
  getCategoryBySlug,
  getProductsByCategory,
  getAllDescendantCategoryIds,
  searchProducts,
} from '@/lib/data'
import Link from 'next/link'
import SubcategoryFilter from '@/components/SubcategoryFilter'
import SafeHtml from '@/components/SafeHtml'
import { SITE_URL, smartTitle } from '@/lib/seo'

interface Props {
  params: { slug: string }
  searchParams: { page?: string; sort?: string; search?: string; sub?: string; per?: string; stock?: string; inCat?: string }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  if (params.slug === 'all') {
    const page = parseInt(searchParams.page || '1')
    if (searchParams.search) {
      const q = searchParams.search.slice(0, 40)
      return {
        title: `Поиск: ${q}`,
        description: `Результаты поиска по запросу «${q}» в интернет-магазине ИП КРУН.`,
        alternates: { canonical: `${SITE_URL}/collection/all` },
        robots: { index: false },
      }
    }
    const hasSort = searchParams.sort && searchParams.sort !== 'default'
    const canonical = hasSort
      ? `${SITE_URL}/collection/all`
      : page > 1
        ? `${SITE_URL}/collection/all?page=${page}`
        : `${SITE_URL}/collection/all`
    return {
      title: page > 1 ? `Все товары — страница ${page}` : 'Все товары',
      description: 'Каталог всех электронных компонентов ИП КРУН. Arduino, Raspberry Pi, датчики, модули и многое другое.',
      alternates: { canonical },
      ...(hasSort ? { robots: { index: false } } : {}),
    }
  }
  const category = await getCategoryBySlug(params.slug)
  if (!category) return { title: 'Категория не найдена' }
  const description = category.description
    ? `${category.description.slice(0, 130)} — ${category.name}.`
    : `${category.name} — купить в интернет-магазине ИП КРУН. Доставка по Казахстану.`
  const page = parseInt(searchParams.page || '1')
  const baseTitle = smartTitle(category.name) ?? category.name
  const sortLabels: Record<string, string> = {
    default: 'по умолчанию',
    price_asc: 'дешевле сначала',
    price_desc: 'дороже сначала',
    name_asc: 'от А до Я',
    name_desc: 'от Я до А',
  }
  const sortLabel = searchParams.sort && searchParams.sort !== 'default' ? sortLabels[searchParams.sort] : undefined
  const title = sortLabel ? `${baseTitle} — ${sortLabel}` : baseTitle
  const hasSort = searchParams.sort && searchParams.sort !== 'default'
  // Sort variants → noindex. Sub-filter → canonical to base (same title/desc = duplicate).
  // Paginated → index with self-canonical.
  const canonicalUrl = hasSort || searchParams.sub
    ? `${SITE_URL}/collection/${category.slug}`
    : page > 1
      ? `${SITE_URL}/collection/${category.slug}?page=${page}`
      : `${SITE_URL}/collection/${category.slug}`
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    ...((hasSort || searchParams.sub) ? { robots: { index: false } } : {}),
    openGraph: {
      title: `${baseTitle} — ИП КРУН`,
      description,
      url: canonicalUrl,
      locale: 'ru_KZ',
      images: [{ url: '/images/logo.png', width: 600, height: 300, alt: `${category.name} — ИП КРУН` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${baseTitle} — ИП КРУН`,
      description,
      images: ['/images/logo.png'],
    },
  }
}

function mapChildren(c: any): { slug: string; name: string; children?: any[] } {
  return {
    slug: c.slug,
    name: c.name,
    children: c.children?.map((gc: any) => mapChildren(gc)) || [],
  }
}

const PER_PAGE_OPTIONS = [20, 50, 100]
const DEFAULT_PER_PAGE = 20

export default async function CollectionPage({ params, searchParams }: Props) {
  const categories = await getCategories()
  const page = parseInt(searchParams.page || '1')
  const sort = searchParams.sort || 'default'
  const search = searchParams.search
  const perRaw = parseInt(searchParams.per || '')
  const perPage = PER_PAGE_OPTIONS.includes(perRaw) ? perRaw : DEFAULT_PER_PAGE

  // Handle search
  if (params.slug === 'all' && search) {
    const rawStock = searchParams.stock
    const stockFilter: 'all' | 'instock' | 'outofstock' =
      rawStock === 'instock' || rawStock === 'outofstock' ? rawStock : 'all'

    // Если выбрана категория (?inCat=slug) — резолвим в id, передаём в поиск,
    // и оставляем slug в URL, чтобы селект в шапке оставался в нужном положении.
    const inCatSlug = (searchParams.inCat || '').trim()
    const inCat = inCatSlug ? await getCategoryBySlug(inCatSlug).catch(() => null) : null

    const { products, total, pages, suggestion } = await searchProducts(search, page, 24, {
      stock: stockFilter,
      categoryId: inCat?.id,
    })

    const catPart = inCatSlug ? `&inCat=${encodeURIComponent(inCatSlug)}` : ''
    const baseQS = `search=${encodeURIComponent(search)}&sort=${sort}${catPart}`
    const mkHref = (s: 'all' | 'instock' | 'outofstock') =>
      `/collection/all?${baseQS}${s === 'all' ? '' : `&stock=${s}`}`
    const pill = (label: string, value: 'all' | 'instock' | 'outofstock') => {
      const active = stockFilter === value
      return (
        <Link
          key={value}
          href={mkHref(value)}
          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
            active
              ? 'bg-brand text-white border-brand'
              : 'bg-white text-gray-700 border-gray-200 hover:border-brand hover:text-brand'
          }`}
        >
          {label}
        </Link>
      )
    }

    return (
      <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
        <Sidebar categories={categories} />
        <main className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold mb-2">
            Результаты поиска: &quot;{search}&quot;
          </h1>
          <p className="text-gray-500 text-sm mb-3">Найдено: {total}</p>

          {inCat && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-gray-500">В категории:</span>
              <Link
                href={`/collection/all?search=${encodeURIComponent(search)}&sort=${sort}${stockFilter === 'all' ? '' : `&stock=${stockFilter}`}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20 transition-colors"
                title="Сбросить фильтр по категории"
              >
                {inCat.name}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </Link>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {pill('Все', 'all')}
            {pill('В наличии', 'instock')}
            {pill('Нет в наличии', 'outofstock')}
          </div>

          {suggestion && (
            <p className="text-sm mb-4">
              Возможно, вы имели в виду:{' '}
              <Link
                href={`/collection/all?search=${encodeURIComponent(suggestion)}${stockFilter === 'all' ? '' : `&stock=${stockFilter}`}${catPart}`}
                className="text-brand hover:underline font-medium"
              >
                {suggestion}
              </Link>
              ?
            </p>
          )}
          <ProductGrid products={products} highlightQuery={search} />
          <Pagination
            currentPage={page}
            totalPages={pages}
            baseUrl={`/collection/all?${baseQS}${stockFilter === 'all' ? '' : `&stock=${stockFilter}`}`}
          />
        </main>
      </div>
    )
  }

  const category = await getCategoryBySlug(params.slug)
  if (!category) return notFound()

  // Collect all descendant IDs recursively from DB (any depth, including hidden)
  let allDescendantIds: string[] = []
  try {
    allDescendantIds = await getAllDescendantCategoryIds(category.id)
  } catch {
    // fallback: use just this category's id
    allDescendantIds = [category.id]
  }

  // If sub filter is active, find the deepest selected categories and query them
  const selectedSubs = searchParams.sub?.split(',').filter(Boolean) || []
  let filterIds: string[]
  if (selectedSubs.length > 0 && category.children) {
    // Collect all selected category IDs, resolving slugs to IDs from loaded tree
    const slugToId = new Map<string, string>()
    const collectSlugs = (items: any[]) => {
      for (const item of items) {
        slugToId.set(item.slug, item.id)
        if (item.children) collectSlugs(item.children)
      }
    }
    collectSlugs(category.children)

    // For each selected slug, check if any of its children are also selected
    // If yes → only use the selected children. If no → use it + all descendants.
    const hasSelectedChild = (parentSlug: string, items: any[]): boolean => {
      for (const item of items) {
        if (item.slug === parentSlug && item.children) {
          return item.children.some((c: any) => selectedSubs.includes(c.slug))
        }
        if (item.children) {
          const found = hasSelectedChild(parentSlug, item.children)
          if (found) return found
        }
      }
      return false
    }

    filterIds = []
    for (const slug of selectedSubs) {
      const id = slugToId.get(slug)
      if (!id) continue
      if (hasSelectedChild(slug, category.children)) {
        // Has selected children → skip this level, children will be processed
        continue
      }
      filterIds.push(id)
      const deepIds = await getAllDescendantCategoryIds(id)
      filterIds.push(...deepIds)
    }
  } else {
    filterIds = allDescendantIds
  }

  let products: any[] = [], total = 0, pages = 0
  try {
    ;({ products, total, pages } = await getProductsByCategory(
      selectedSubs.length > 0 ? '' : category.id,
      filterIds,
      page,
      perPage,
      sort
    ))
  } catch {
    // DB error for this category — show empty state instead of 500
  }

  // FAQ schema for specific categories — helps win Featured Snippets
  const CATEGORY_FAQ: Record<string, { q: string; a: string }[]> = {
    'gotovye-nabory-dlya-robototehniki': [
      { q: 'Что входит в набор Arduino для начинающих?', a: 'Стартовый набор Arduino включает плату Arduino UNO R3, USB-кабель, макетную плату, набор датчиков (температура, расстояние), резисторы, светодиоды, провода и инструкцию по проектам.' },
      { q: 'С какого возраста можно начать работу с Arduino?', a: 'Arduino подходит детям от 10–12 лет с родителями, с 14 лет — самостоятельно. Наборы для школ ориентированы на возраст 10–18 лет.' },
      { q: 'Нужно ли знать программирование для работы с Arduino?', a: 'Нет. Стартовые наборы содержат готовые примеры кода с пошаговыми инструкциями. Язык Arduino (C++) осваивается постепенно в процессе работы над проектами.' },
      { q: 'Какие наборы есть для школ и кружков робототехники?', a: 'В каталоге ИП КРУН есть LEGO Education SPIKE Prime, Microbit, mBot, наборы Keyestudio и STEM-комплекты для школьников 5–11 классов. Оптовые поставки для школ — через форму обратной связи.' },
      { q: 'Как быстро доставят набор по Казахстану?', a: 'По Костанай — Яндекс Курьер за 1–2 дня. По всему Казахстану — inDrive за 2–5 дней. Самовывоз: Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9, пн–сб 12:00–20:00.' },
    ],
    'gotovye-nabory-arduino': [
      { q: 'Какой набор Arduino выбрать новичку?', a: 'Для начинающих подходит Arduino Starter Kit (красный, зелёный или синий) — плата UNO R3, датчики, провода и инструкция. Цена от 15 000 до 25 000 ₸.' },
      { q: 'Чем отличаются наборы Arduino UNO и Mega?', a: 'Arduino UNO R3 — для начинающих: достаточно пинов, простой в освоении. Arduino Mega — для сложных проектов с большим числом датчиков и моторов.' },
      { q: 'Есть ли набор Arduino с инструкцией на русском?', a: 'Да. Расширенный обучающий набор Arduino от ИП КРУН идёт с инструкцией на русском языке на 200+ страниц и готовыми проектами.' },
      { q: 'Можно ли купить набор Arduino оптом для школы?', a: 'Да. ИП КРУН работает с образовательными организациями, кружками и STEM-центрами. Пишите на странице Контакты или Обратная связь для согласования условий.' },
    ],
    'arduino': [
      { q: 'Какую плату Arduino купить для первого проекта?', a: 'Для первого проекта рекомендуется Arduino UNO R3 — самая распространённая плата с большим сообществом и совместимостью с большинством шилдов и библиотек. Доступна в ИП КРУН.' },
      { q: 'Чем отличается Arduino UNO от Arduino Nano?', a: 'Arduino UNO R3 — крупная плата для стационарных проектов. Arduino Nano — компактная версия того же чипа ATmega328P, подходит для встроенных решений. Оба работают с одними и теми же скетчами.' },
      { q: 'Совместима ли Arduino с IDE на Mac и Linux?', a: 'Да. Arduino IDE доступна для Windows, macOS и Linux. Бесплатно скачивается с официального сайта arduino.cc. Все платы из каталога ИП КРУН поддерживают стандартную среду разработки.' },
      { q: 'Можно ли купить Arduino оптом в Казахстане?', a: 'Да, ИП КРУН принимает оптовые заявки для школ, кружков и компаний. Заполните форму обратной связи на странице Контакты — согласуем условия и счёт.' },
    ],
    'esp32': [
      { q: 'Чем ESP32 лучше ESP8266?', a: 'ESP32 имеет двухъядерный процессор 240 МГц, встроенный Bluetooth 4.2 и Wi-Fi, больше GPIO (до 34) и поддерживает Touch-пины. ESP8266 — однъядерный, только Wi-Fi, дешевле. Для большинства новых проектов рекомендуется ESP32.' },
      { q: 'Можно ли программировать ESP32 в Arduino IDE?', a: 'Да. ESP32 поддерживается через Arduino IDE с установкой пакета Espressif. Работает с большинством Arduino-библиотек. Альтернативы: MicroPython, ESP-IDF.' },
      { q: 'Какое питание нужно для ESP32?', a: 'ESP32 питается от 3.3 В (GPIO) или 5 В через USB. При Wi-Fi-передаче потребление до 250 мА. Рекомендуется использовать LDO-регулятор и конденсатор 100 мкФ для стабилизации. Модули в каталоге ИП КРУН поставляются с USB-интерфейсом.' },
      { q: 'Есть ли ESP32 с дисплеем или камерой?', a: 'Да. В каталоге ИП КРУН есть ESP32-CAM с OV2640-камерой и ESP32 с TFT-дисплеем. Также доступны модули ESP32-S3 с расширенной поддержкой USB и AI-ускорением.' },
    ],
    'raspberry-pi': [
      { q: 'Чем Raspberry Pi отличается от Arduino?', a: 'Raspberry Pi — полноценный мини-компьютер с Linux, поддерживает Python, Node.js, веб-сервер и GUI. Arduino — микроконтроллер для работы с датчиками в реальном времени. Используйте Raspberry Pi для обработки данных и Arduino для управления железом.' },
      { q: 'Какой Raspberry Pi купить в 2024 году?', a: 'Raspberry Pi 4 Model B (2–8 ГБ ОЗУ) — лучший выбор для десктопа и сервера. Raspberry Pi Zero 2 W — компактный и дешёвый для IoT-проектов. Raspberry Pi 5 — новейшая модель с 2–8 ГБ ОЗУ и PCIe. Все модели доступны в ИП КРУН.' },
      { q: 'Какую операционную систему ставить на Raspberry Pi?', a: 'Raspberry Pi OS (Raspbian) — официальная ОС на базе Debian. Для серверов подходит Ubuntu Server. Установка через Raspberry Pi Imager — скачать бесплатно с raspberrypi.com.' },
      { q: 'Нужно ли покупать аксессуары отдельно?', a: 'Плата Raspberry Pi поставляется без блока питания, microSD-карты и корпуса. В ИП КРУН доступны комплектующие: блок питания USB-C 5В/3А, SD-карты с предустановленной ОС, корпуса и охлаждение.' },
    ],
    'datchiki': [
      { q: 'Какие датчики чаще всего используют с Arduino?', a: 'Топ датчиков для Arduino: DHT11/DHT22 (температура и влажность), HC-SR04 (расстояние), PIR (движение), MQ-2/MQ-135 (газы), BMP280 (давление). Все модели есть в каталоге ИП КРУН.' },
      { q: 'Как подключить датчик температуры к Arduino?', a: 'DHT11: пин Data → D2 Arduino, VCC → 5В, GND → GND, резистор 10кОм между Data и VCC. Библиотека: DHT sensor library (Adafruit). Код работает без изменений с Arduino UNO, Nano и ESP32.' },
      { q: 'Какой датчик выбрать для умного дома?', a: 'Для умного дома: DHT22 (точность ±0.5°C), PIR HC-SR501 (детектор движения), датчик дыма MQ-2, датчик протечки воды. Все совместимы с Arduino, ESP32 и Home Assistant.' },
    ],
  }
  // BreadcrumbList JSON-LD — category data from database, serialized safely
  const breadcrumbItems = [
    { name: 'Главная', url: `${SITE_URL}/` },
  ]
  if (category.parent) {
    breadcrumbItems.push({
      name: category.parent.name,
      url: `${SITE_URL}/collection/${category.parent.slug}`,
    })
  }
  breadcrumbItems.push({
    name: category.name,
    url: `${SITE_URL}/collection/${category.slug}`,
  })
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems
      .filter(item => item.name && item.url)
      .map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        item: item.url,
      })),
  }

  // ItemList schema — only on canonical page with products (page 1, no sort/sub filters)
  const isCanonical = page === 1 && !searchParams.sort && !searchParams.sub
  const itemListJsonLd = isCanonical && products.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: category.name,
    url: `${SITE_URL}/collection/${category.slug}`,
    numberOfItems: total,
    itemListElement: products
      .filter((p: any) => p.slug && p.name)
      .map((p: any, i: number) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/product/${p.slug}`,
        name: p.name,
      })),
  } : null

  const isNonCanonicalUrl = !isCanonical
  const faqItems = isCanonical ? (CATEGORY_FAQ[category.slug] ?? null) : null
  const faqJsonLd = faqItems ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  } : null

  const sortOptions = [
    { value: 'default', label: 'По умолчанию' },
    { value: 'price_asc', label: 'Цена: по возрастанию' },
    { value: 'price_desc', label: 'Цена: по убыванию' },
    { value: 'name_asc', label: 'Название: А-Я' },
    { value: 'name_desc', label: 'Название: Я-А' },
  ]

  // Only paginated/sorted pages get the JSX canonical override.
  // Sub-filter (?sub=) pages are self-canonical via generateMetadata — no JSX override needed.
  const needsCanonicalOverride = page > 1 || !!searchParams.sort

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
      {/* Explicit canonical for sorted/paginated pages — sub-filter pages handled via metadata */}
      {needsCanonicalOverride && (
        <link rel="canonical" href={`${SITE_URL}/collection/${params.slug}`} />
      )}
      {/* BreadcrumbList JSON-LD: category data from DB, safely serialized via JSON.stringify */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {/* ItemList JSON-LD: only on canonical (page 1, no sort/sub) — product data from DB, safely serialized */}
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      {/* FAQPage JSON-LD: only for specific categories, only on canonical page */}
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      <Sidebar categories={categories} currentSlug={params.slug} />
      <main className="flex-1 min-w-0">
        {/* Breadcrumbs */}
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
          <Link href="/" className="hover:text-brand">Главная</Link>
          <span>/</span>
          {category.parent && (
            <>
              <Link href={`/collection/${category.parent.slug}`} className="hover:text-brand">
                {category.parent.name}
              </Link>
              <span>/</span>
            </>
          )}
          <span className="text-gray-800">{category.name}</span>
        </nav>

        <h1 className="text-2xl font-bold mb-2">{category.name}</h1>
        {category.description && (
          <SafeHtml html={category.description} className="prose prose-sm max-w-none text-gray-600 mb-3" />
        )}
        <p className="text-gray-500 text-sm mb-4">Товаров: {total}</p>

        {/* Subcategory filters (multi-select) */}
        {category.children && category.children.length > 0 && (
          <SubcategoryFilter
            children={category.children.map(c => mapChildren(c))}
            parentSlug={params.slug}
            selectedSubs={selectedSubs}
            sort={sort}
          />
        )}

        {/* Sort + Per-page toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm text-gray-500 shrink-0">Сортировка:</span>
          {/* Mobile sort select */}
          <SortSelect
            slug={params.slug}
            current={sort}
            selectedSubs={selectedSubs}
            options={sortOptions}
            per={perPage}
          />
          {/* Desktop sort links */}
          <div className="hidden md:flex flex-wrap gap-2">
            {sortOptions.map(opt => {
              const parts: string[] = []
              if (opt.value !== 'default') parts.push(`sort=${opt.value}`)
              if (selectedSubs.length > 0) parts.push(`sub=${selectedSubs.join(',')}`)
              if (perPage !== DEFAULT_PER_PAGE) parts.push(`per=${perPage}`)
              const href = `/collection/${params.slug}${parts.length > 0 ? `?${parts.join('&')}` : ''}`
              return (
                <Link
                  key={opt.value}
                  href={href}
                  className={`text-sm px-3 py-1.5 rounded transition-colors ${
                    sort === opt.value ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {opt.label}
                </Link>
              )
            })}
          </div>

          {/* Per-page selector */}
          <div className="ml-auto">
            <PerPageSelect
              slug={params.slug}
              current={perPage}
              selectedSubs={selectedSubs}
              sort={sort}
            />
          </div>
        </div>

        <ProductGrid products={products} />
        {(() => {
          const parts: string[] = []
          if (sort && sort !== 'default') parts.push(`sort=${sort}`)
          if (selectedSubs.length > 0) parts.push(`sub=${selectedSubs.join(',')}`)
          if (perPage !== DEFAULT_PER_PAGE) parts.push(`per=${perPage}`)
          const base = `/collection/${params.slug}${parts.length > 0 ? `?${parts.join('&')}` : ''}`
          return <Pagination currentPage={page} totalPages={pages} baseUrl={base} />
        })()}

        {/* SEO text block — on all canonical pages, improves text/HTML ratio and word count */}
        {!isNonCanonicalUrl && (
          <div className="mt-8 pt-6 border-t text-sm text-gray-500 space-y-3">
            {!category.description && (
              <p>
                В разделе «{category.name}» представлен широкий ассортимент товаров для электроники, робототехники и DIY-проектов.
                Все товары доступны к заказу онлайн с доставкой по всему Казахстану.
              </p>
            )}
            <p>
              Интернет-магазин ИП КРУН предлагает {total > 0 ? `${total} товар${total === 1 ? '' : total < 5 ? 'а' : 'ов'} в категории «${category.name}»` : `товары категории «${category.name}»`} с быстрой обработкой заказов.
              Доставка по Костанаю — через Яндекс Курьер, по всему Казахстану — через inDrive.
              Самовывоз из магазина по адресу: Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9 (пн–сб, 12:00–20:00).
              Оплата при получении картой или наличными, а также онлайн-перевод.
            </p>
            <p>
              Arduino, ESP32, датчики, модули, аккумуляторы и комплектующие — в одном месте. Работаем с 2019 года, доставляем по Костанаю и всему Казахстану. Бесплатная доставка при заказе от 150 000 ₸.
            </p>
            {category.children && category.children.length > 0 && (
              <p>
                Подкатегории в разделе «{category.name}»: {category.children.map((c: { name: string }) => c.name).join(', ')}. В каждой подкатегории — товары с описаниями и характеристиками.
              </p>
            )}
            <p><strong>Как оформить заказ?</strong> Добавьте товар в корзину и укажите контакты. Оплата при получении наличными или картой. Доставка по Костанаю — Яндекс Курьер, по Казахстану — inDrive.</p>
            <p><strong>Когда бесплатная доставка?</strong> При заказе от 150 000 ₸. Самовывоз: Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9, пн–сб 12:00–20:00. Тел. +7 (700) 900-17-90.</p>
          </div>
        )}

        {/* FAQ block — visible on page, matches FAQPage JSON-LD for Featured Snippets */}
        {faqItems && (
          <div className="mt-8 pt-6 border-t">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Часто задаваемые вопросы</h2>
            <div className="space-y-4">
              {faqItems.map((item, i) => (
                <div key={i}>
                  <p className="text-sm font-medium text-gray-800 mb-1">{item.q}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isNonCanonicalUrl && (
          <div className="mt-4 pt-4 flex flex-wrap gap-3 text-sm">
            <Link href="/collection/all" className="text-gray-500 hover:text-brand">Весь каталог</Link>
            <Link href="/page/delivery" className="text-gray-500 hover:text-brand">Доставка</Link>
            <Link href="/page/payment-2" className="text-gray-500 hover:text-brand">Оплата</Link>
            <Link href="/page/contacts" className="text-gray-500 hover:text-brand">Контакты</Link>
          </div>
        )}
      </main>
    </div>
  )
}

function ProductGrid({ products, highlightQuery }: { products: any[]; highlightQuery?: string }) {
  if (products.length === 0) {
    return (
      <div className="py-12 text-center space-y-3">
        <p className="text-gray-500">Товары не найдены</p>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Попробуйте изменить фильтры или посмотрите весь каталог. ИП КРУН доставляет Arduino, датчики и модули по Костанаю и Казахстану.
        </p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((p: any, i: number) => (
        <ProductCard
          key={p.id}
          id={p.id}
          name={p.name}
          slug={p.slug}
          price={p.price}
          oldPrice={p.oldPrice}
          images={p.images}
          inStock={p.inStock}
          priority={i < 4}
          highlightQuery={highlightQuery}
          badgeText={p.badgeText}
        />
      ))}
    </div>
  )
}

function Pagination({ currentPage, totalPages, baseUrl }: { currentPage: number; totalPages: number; baseUrl: string }) {
  if (totalPages <= 1) return null
  const separator = baseUrl.includes('?') ? '&' : '?'
  // page=1 redirects via middleware to URL without page param — use canonical URL directly
  const href = (p: number) => p === 1 ? baseUrl : `${baseUrl}${separator}page=${p}`

  // Build visible page numbers: 1 ... [current-1, current, current+1] ... last
  const pages: (number | 'dots')[] = []
  const addPage = (p: number) => { if (!pages.includes(p)) pages.push(p) }

  addPage(1)
  if (currentPage > 3) pages.push('dots')
  for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) addPage(i)
  if (currentPage < totalPages - 2) pages.push('dots')
  if (totalPages > 1) addPage(totalPages)

  return (
    <div className="flex items-center justify-center gap-1.5 mt-8 flex-wrap">
      {currentPage > 1 && (
        <Link href={href(currentPage - 1)} aria-label="Предыдущая страница" className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm">
          &laquo;
        </Link>
      )}
      {pages.map((p, i) =>
        p === 'dots' ? (
          <span key={`dots-${i}`} className="px-2 py-2 text-sm text-gray-400">...</span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-label={p === currentPage ? `Страница ${p}` : `Перейти на страницу ${p}`}
            className={`px-3 py-2 rounded text-sm ${
              p === currentPage ? 'bg-brand text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {p}
          </Link>
        )
      )}
      {currentPage < totalPages && (
        <Link href={href(currentPage + 1)} aria-label="Следующая страница" className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm">
          &raquo;
        </Link>
      )}
    </div>
  )
}
