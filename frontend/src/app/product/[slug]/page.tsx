import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getProductBySlug, findProductSlugByOldSlug, getRelatedProducts, getSimilarProducts, getCategories, getKaspiBuyData } from '@/lib/data'

export const revalidate = 3600 // ISR: rebuild product pages every hour
import Link from 'next/link'
import { formatPrice, getDiscount } from '@/lib/format'
import { ProductActions } from '@/components/ProductActions'
import { ProductGallery } from '@/components/ProductGallery'
import SafeHtml from '@/components/SafeHtml'
import KaspiBuyBlock from '@/components/KaspiBuyBlock'
import AdminEditButton from '@/components/AdminEditButton'
import { cleanDescription, smartTitle, SITE_URL } from '@/lib/seo'
import { getProductReviewStats } from '@/lib/data'
import RelatedProducts from '@/components/RelatedProducts'
import Sidebar from '@/components/LazySidebar'
import ReviewList from '@/components/ReviewList'
import ReviewForm from '@/components/ReviewForm'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductBySlug(params.slug)
  if (!product) {
    const newSlug = await findProductSlugByOldSlug(params.slug)
    if (newSlug) permanentRedirect(`/product/${newSlug}`)
    return { title: 'Товар не найден' }
  }
  const image = product.images[0]?.url

  // Use admin-set metaTitle/metaDescription if available
  if (product.metaTitle) {
    const desc = product.metaDescription || cleanDescription(product.description) || product.name
    return {
      title: { absolute: product.metaTitle },
      description: desc,
      alternates: {
      canonical: `/product/${product.slug}`,
      languages: {
        'ru-KZ': `${SITE_URL}/product/${product.slug}`,
        'x-default': `${SITE_URL}/product/${product.slug}`,
      },
    },
      openGraph: {
        title: product.metaTitle,
        description: desc,
        url: `/product/${product.slug}`,
        type: 'website',
        locale: 'ru_KZ',
        ...(image && { images: [{ url: image, width: 800, height: 800, alt: product.name }] }),
      },
      twitter: { card: 'summary_large_image' },
      other: {
        'twitter:label1': 'Цена',
        'twitter:data1': `${product.price.toLocaleString('ru-RU')} ₸`,
        'twitter:label2': 'Наличие',
        'twitter:data2': product.inStock ? 'В наличии' : 'Под заказ',
      },
    }
  }

  const name = product.name
  const sku = product.sku || String(product.id)
  // Always append SKU suffix to prevent duplicate meta descriptions across product variants
  const baseDesc = product.metaDescription || cleanDescription(product.description)
  const trimmedBase = baseDesc
    ? (baseDesc.length > 125 ? baseDesc.slice(0, baseDesc.lastIndexOf(' ', 125) || 125) : baseDesc)
    : ''
  const description = trimmedBase
    ? `${trimmedBase} Арт. ${sku}.`
    : `Купить «${name}» арт. ${sku} за ${product.price.toLocaleString('ru-RU')} ₸ в интернет-магазине ИП КРУН. Доставка по Казахстану.`
  // Title: full name + SKU; keep ≤55 chars (SEO: Title element is too long — 207 pages)
  const skuSuffix = ` (арт. ${sku})`
  const maxNameLen = 55 - skuSuffix.length
  const title = name.length > maxNameLen
    ? (smartTitle(name, maxNameLen - 1) ?? name.slice(0, maxNameLen - 1) + '…') + skuSuffix
    : name + skuSuffix

  // Detect variant slugs (e.g. "product-name-2", "product-name-3") and point canonical to parent
  const variantMatch = product.slug.match(/^(.+)-(\d+)$/)
  let canonicalSlug = product.slug
  if (variantMatch) {
    const parentSlug = variantMatch[1]
    const parent = await getProductBySlug(parentSlug)
    if (parent) canonicalSlug = parentSlug
  }

  return {
    title,
    description,
    alternates: {
      canonical: `/product/${canonicalSlug}`,
      languages: {
        'ru-KZ': `${SITE_URL}/product/${canonicalSlug}`,
        'x-default': `${SITE_URL}/product/${canonicalSlug}`,
      },
    },
    openGraph: {
      title: `${title} — ИП КРУН`,
      description,
      url: `/product/${product.slug}`,
      type: 'website',
      locale: 'ru_KZ',
      ...(image && { images: [{ url: image, width: 800, height: 800, alt: product.name }] }),
    },
    twitter: { card: 'summary_large_image' },
    other: {
      'twitter:label1': 'Цена',
      'twitter:data1': `${product.price.toLocaleString('ru-RU')} ₸`,
      'twitter:label2': 'Наличие',
      'twitter:data2': product.inStock ? 'В наличии' : 'Под заказ',
      'product:price:amount': String(product.price),
      'product:price:currency': 'KZT',
      'product:availability': product.inStock ? 'in stock' : 'out of stock',
      'product:condition': 'new',
    },
  }
}

export default async function ProductPage({ params }: Props) {
  const product = await getProductBySlug(params.slug)
  if (!product) {
    const newSlug = await findProductSlugByOldSlug(params.slug)
    if (newSlug) permanentRedirect(`/product/${newSlug}`)
    return notFound()
  }

  // Доступно покупателю = totalStock − reservedStock (бронь под Kaspi-заказы).
  const availableStock = Math.max(0, product.totalStock - ((product as any).reservedStock ?? 0))

  const discount = product.oldPrice ? getDiscount(product.oldPrice, product.price) : 0

  // «Аналогичные» = товары из той же категории.
  const [similarProducts, categories, reviewStats, kaspiBuy] = await Promise.all([
    getRelatedProducts(product.id, product.categoryId),
    getCategories(),
    getProductReviewStats(product.id),
    getKaspiBuyData(product.id),
  ])
  // «Сопутствующие» = соседние категории (тот же раздел); не дублируем «Аналогичные».
  const relatedProducts = await getSimilarProducts(
    product.id,
    product.categoryId,
    16,
    similarProducts.map(p => p.id),
  )

  const breadcrumbItems: { name: string; url: string }[] = [
    { name: 'Главная', url: `${SITE_URL}/` },
  ]
  if (product.category) {
    const grandparent = (product.category.parent as any)?.parent
    if (grandparent) {
      breadcrumbItems.push({
        name: grandparent.name,
        url: `${SITE_URL}/collection/${grandparent.slug}`,
      })
    }
    if (product.category.parent) {
      breadcrumbItems.push({
        name: product.category.parent.name,
        url: `${SITE_URL}/collection/${product.category.parent.slug}`,
      })
    }
    breadcrumbItems.push({
      name: product.category.name,
      url: `${SITE_URL}/collection/${product.category.slug}`,
    })
  }
  breadcrumbItems.push({
    name: product.name,
    url: `${SITE_URL}/product/${product.slug}`,
  })

  // Артикул товара (SKU на Product)
  const artNumber = product.sku || product.id

  // JSON-LD structured data
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: cleanDescription(product.description, 300) || product.name,
    image: product.images.map(i => ({
      '@type': 'ImageObject',
      url: i.url,
      width: 800,
      height: 800,
      ...(i.alt && { name: i.alt }),
    })),
    url: `${SITE_URL}/product/${product.slug}`,
    sku: artNumber,
    datePublished: product.createdAt.toISOString(),
    dateModified: product.updatedAt.toISOString(),
    brand: { '@type': 'Brand', name: 'ИП КРУН' },
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['h1', '.product-description'],
    },
    ...(reviewStats && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: reviewStats.avg.toFixed(1),
        reviewCount: reviewStats.count,
        bestRating: 5,
        worstRating: 1,
      },
    }),
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'KZT',
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      url: `${SITE_URL}/product/${product.slug}`,
      seller: {
        '@type': 'Organization',
        name: 'ИП КРУН',
        '@id': `${SITE_URL}/#organization`,
      },
      priceValidUntil: new Date(new Date().getFullYear() + 1, 0, 1).toISOString().split('T')[0],
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'KZ',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 14,
      },
    },
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 overflow-x-hidden">
      {/* Плавающая кнопка редактирования — только для админов (клиентская проверка роли) */}
      <AdminEditButton productId={product.id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Breadcrumbs */}
      <nav className="text-sm text-gray-500 mb-6 flex items-center gap-1.5 flex-wrap">
        <Link href="/" className="hover:text-brand">Главная</Link>
        {product.category && (
          <>
            {(() => {
              const grandparent = (product.category!.parent as any)?.parent
              return (
                <>
                  {grandparent && (
                    <>
                      <span className="text-gray-300">/</span>
                      <Link href={`/collection/${grandparent.slug}`} className="hover:text-brand">
                        {grandparent.name}
                      </Link>
                    </>
                  )}
                  {product.category!.parent && (
                    <>
                      <span className="text-gray-300">/</span>
                      <Link href={`/collection/${product.category!.parent.slug}`} className="hover:text-brand">
                        {product.category!.parent.name}
                      </Link>
                    </>
                  )}
                  <span className="text-gray-300">/</span>
                  <Link href={`/collection/${product.category!.slug}`} className="hover:text-brand">
                    {product.category!.name}
                  </Link>
                </>
              )
            })()}
          </>
        )}
      </nav>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Category sidebar */}
        <Sidebar categories={categories} currentSlug={product.category?.slug} />

        {/* Product content */}
        <div className="flex-1 min-w-0">
      {/* Main product section */}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Gallery — left */}
        <div className="w-full md:w-[420px] shrink-0">
          <ProductGallery
            images={product.images.map(i => ({ url: i.url, alt: i.alt || product.name }))}
          />
        </div>

        {/* Product info — right */}
        <div className="flex-1 min-w-0">
          {/* Article */}
          <div className="text-sm text-gray-400 mb-1">арт. {artNumber}</div>

          {/* Title */}
          <h1 className="text-[22px] font-bold text-[#333] mb-3">{product.name}</h1>

          {/* Наклейка-преимущество (напр. «С НДС · растаможен») — заметный бейдж под
              названием, плюс для B2B-покупателей. Показываем только если задана. */}
          {product.badgeText && (
            <div className="mb-3">
              <span className="inline-flex items-center gap-1.5 bg-[#16A34A] text-white text-sm font-semibold px-3 py-1 rounded-full shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {product.badgeText}
              </span>
            </div>
          )}

          {/* Favorite button is inside ProductActions */}

          {/* Stock (1 карточка = 1 товар) */}
          {(
            <div className="text-sm text-gray-600 mb-4">
              {product.inStock ? (
                <span className="text-green-600">В наличии{availableStock > 0 ? `: ${availableStock} шт.` : ''}</span>
              ) : (
                <span className="text-red-500">Нет в наличии</span>
              )}
            </div>
          )}

          {/* Price */}
          {(
            <div className="flex items-center gap-4 mb-3">
              <div>
                {product.oldPrice && product.oldPrice > product.price ? (
                  <div className="flex items-baseline gap-3">
                    <span className="text-gray-400 line-through text-base">{formatPrice(product.oldPrice)}</span>
                    <span className="text-[28px] font-bold text-[#333]">{formatPrice(product.price)}</span>
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">
                      -{discount}%
                    </span>
                  </div>
                ) : (
                  <span className="text-[28px] font-bold text-[#333]">{formatPrice(product.price)}</span>
                )}
              </div>
            </div>
          )}

          {/* ProductActions: handles variant selector + reactive price + cart */}
          <div className="mb-4">
            <ProductActions
              product={{
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: product.price,
                oldPrice: product.oldPrice,
                image: product.images[0]?.url || '',
                inStock: product.inStock,
                totalStock: availableStock,
                sku: artNumber,
              }}
              variants={[]}
              variantAttributes={[]}
            />
          </div>
        </div>
      </div>

      {/* Description block */}
      {product.description ? (
        <div className="mt-10 bg-[#f5f5f5] rounded-lg p-6 product-description">
          {/* Variant badge from slug — unique visible content to reduce duplicate content signals */}
          {(() => {
            const base = product.slug.replace(/-\d+$/, '')
            const parts = base.split('-')
            const last = parts[parts.length - 1]
            const prev = parts[parts.length - 2]
            const variantLabels: Record<string, string> = {
              'm-m': 'мама-мама', 'p-m': 'папа-мама', 'p-p': 'папа-папа', 'm-p': 'мама-папа',
              mm: 'мама-мама', pm: 'папа-мама', pp: 'папа-папа', mp: 'мама-папа',
            }
            const v = last?.toLowerCase()
            const v2 = prev && v ? `${prev}-${v}`.toLowerCase() : ''
            const label = variantLabels[v2] || variantLabels[v] || (v && v.length <= 3 ? v.toUpperCase() : null)
            const lengthMatch = base.match(/(\d+)-sm\b/i)
            const lengthCm = lengthMatch?.[1]
            const descParts: string[] = []
            if (lengthCm) descParts.push(`длина ${lengthCm} см`)
            if (label) descParts.push(`разъём ${label}`)
            if (descParts.length === 0) return null
            return (
              <p className="text-sm text-gray-500 mb-3" data-variant-badge>
                Характеристики варианта: {descParts.join(', ')}. Артикул: {artNumber}. В интернет-магазине ИП КРУН доступна доставка по Костанаю и всему Казахстану.
              </p>
            )
          })()}
          <h2 className="text-lg font-bold mb-3">Описание</h2>
          <SafeHtml html={product.description} className="prose prose-sm max-w-none text-gray-700" />
        </div>
      ) : (
        <div className="mt-10 bg-[#f5f5f5] rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">О товаре</h2>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            {product.name} — купить в интернет-магазине ИП КРУН с доставкой по Костанаю и всему Казахстану.
            {product.category && (
              <> Товар из категории{' '}
                <Link href={`/collection/${product.category.slug}`} className="text-brand hover:underline">
                  {product.category.name}
                </Link>
                {product.category.parent && <>, раздел «{product.category.parent.name}»</>}.
              </>
            )}
            {product.inStock
              ? ` Товар в наличии${availableStock > 0 ? `: ${availableStock} шт.` : ''}.`
              : ' Товар временно отсутствует, но вы можете оставить заказ.'
            }
            {` Артикул: ${artNumber}.`}
          </p>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            ИП КРУН — интернет-магазин электронных компонентов и модулей для DIY, робототехники и Arduino-проектов.
            В каталоге более 3 000 позиций: платы Arduino и ESP32, датчики и модули, силовые компоненты, инструменты и расходные материалы.
            Работаем с 2019 года, доставляем по всему Казахстану.
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">
            Оформите заказ онлайн — доставим курьером по Костанаю (Яндекс Курьер), или воспользуйтесь самовывозом из нашего магазина по адресу Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9 (пн–сб, 12:00–20:00).
            Доставка по всему Казахстану через inDrive. Бесплатная доставка при заказе от 150 000 ₸.
            Оплата при получении наличными или картой, а также онлайн-переводом.
          </p>
        </div>
      )}

      {/* Блок «Купить на Kaspi.kz» — только если товар реально в фиде Kaspi */}
      {kaspiBuy && <KaspiBuyBlock url={kaspiBuy.url} />}

      {/* Related products */}
      <RelatedProducts
        title="Сопутствующие товары"
        products={relatedProducts.map(p => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          oldPrice: p.oldPrice,
          images: p.images,
          inStock: p.inStock,
        }))}
      />

      <RelatedProducts
        title="Аналогичные товары"
        products={similarProducts.map(p => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          oldPrice: p.oldPrice,
          images: p.images,
          inStock: p.inStock,
        }))}
      />

      {/* Reviews */}
      <div className="mt-8 pt-6 border-t">
        <ReviewList productId={product.id} />
        <div className="mt-6">
          <ReviewForm productId={product.id} />
        </div>
      </div>

      {/* SEO: delivery block — improves text/HTML ratio, Low word count */}
      <div className="mt-8 pt-6 border-t text-sm text-gray-600 space-y-3">
        <h3 className="font-semibold text-gray-800">Доставка и оплата</h3>
        <p>
          Купить {product.name} можно с доставкой по Костанаю курьером Яндекс или самовывозом из магазина по адресу Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9.
          По Казахстану доставляем через inDrive. Бесплатная доставка при заказе от 150 000 ₸. Оплата наличными, картой или переводом.
        </p>
        <p>
          Оформление заказа онлайн: добавьте товар в корзину, укажите контакты и адрес. Режим работы магазина: пн–сб 12:00–20:00. Телефон +7 (700) 900-17-90, Telegram и WhatsApp.
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <Link href="/page/delivery" className="text-brand hover:underline">Доставка</Link>
          <Link href="/page/payment-2" className="text-brand hover:underline">Оплата</Link>
          <Link href="/page/contacts" className="text-brand hover:underline">Контакты</Link>
        </div>
      </div>
        </div>{/* end product content */}
      </div>{/* end flex with sidebar */}
    </div>
  )
}
