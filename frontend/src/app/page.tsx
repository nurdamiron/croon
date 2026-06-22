import type { Metadata } from 'next'
import Sidebar from '@/components/LazySidebar'
import ProductCard from '@/components/ProductCard'
import { getCategories, getPopularProducts, getNewProducts, getProductsByCategorySlug } from '@/lib/data'
import Link from 'next/link'
import { HomeTabs } from '@/components/HomeTabs'
import { SITE_URL } from '@/lib/seo'

export const revalidate = 600 // ISR: rebuild homepage every 10 min

export const metadata: Metadata = {
  // Use absolute to bypass the layout template — homepage gets the full brand title
  title: { absolute: 'ИП КРУН — Электронные компоненты в Казахстане' },
  description: 'Интернет-магазин электронных компонентов в Казахстане: Arduino, ESP32, Raspberry Pi, датчики и модули. 1896 товаров в наличии. Доставка по Костанаю, самовывоз.',
  alternates: {
    canonical: 'https://croon.kz',
    languages: {
      'ru-KZ': 'https://croon.kz',
      'x-default': 'https://croon.kz',
    },
  },
  openGraph: {
    title: 'ИП КРУН — Электронные компоненты в Казахстане',
    description: 'Интернет-магазин электронных компонентов в Казахстане: Arduino, ESP32, Raspberry Pi, датчики и модули. 1896 товаров в наличии. Доставка по Костанаю, самовывоз.',
    url: '/',
    locale: 'ru_KZ',
    type: 'website',
    siteName: 'ИП КРУН',
    images: [{ url: '/images/og-cover.png', width: 1200, height: 630, alt: 'ИП КРУН — Электронные компоненты в Казахстане' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ИП КРУН — Электронные компоненты в Казахстане',
    description: 'Интернет-магазин электронных компонентов в Казахстане. Arduino, Raspberry Pi, датчики, модули.',
    images: ['/images/og-cover.png'],
  },
}

const localBusinessJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${SITE_URL}/#organization`,
  name: 'ИП КРУН',
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/images/logo.png`,
    width: 200,
    height: 60,
  },
  image: `${SITE_URL}/images/logo.png`,
  telephone: '+7-700-900-17-90',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9',
    addressLocality: 'Костанай',
    postalCode: '050020',
    addressCountry: 'KZ',
  },
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    opens: '12:00',
    closes: '20:00',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+7-700-900-17-90',
    contactType: 'customer service',
    availableLanguage: 'Russian',
  },
  foundingYear: 2019,
  areaServed: [
    { '@type': 'Country', name: 'Kazakhstan' },
    { '@type': 'City', name: 'Almaty' },
  ],
  sameAs: [
    'https://t.me/croon_kz',
    'https://www.instagram.com/croon_engineer/',
    'https://wiki.croon.kz',
  ],
  dateModified: new Date().toISOString().split('T')[0],
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Где купить Arduino в Казахстане?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Arduino можно купить в интернет-магазине ИП КРУН (croon.kz) с доставкой по всему Казахстану или самовывозом в Костанай.',
      },
    },
    {
      '@type': 'Question',
      name: 'Есть ли готовые наборы для начинающих?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Да, ИП КРУН предлагает готовые стартовые наборы Arduino: Зелёный, Синий и Красный набор с компонентами и платой для начального обучения электронике.',
      },
    },
    {
      '@type': 'Question',
      name: 'Как быстро доставляют заказы?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Доставка по Костанаю — 1-2 дня. По всему Казахстану — 3-7 дней. Доступен самовывоз из офиса в Костанае.',
      },
    },
  ],
}

export default async function Home() {
  const [categories, popularProducts, newProducts, kitProducts] = await Promise.all([
    getCategories(),
    getPopularProducts(18),
    getNewProducts(18),
    getProductsByCategorySlug('gotovye-nabory-dlya-robototehniki', 18),
  ])

  const mapProducts = (products: any[]) => products.map(p => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    oldPrice: p.oldPrice,
    inStock: p.inStock,
    badgeText: p.badgeText ?? null,
    images: p.images.map((i: any) => ({ url: i.url, alt: i.alt })),
  }))

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
      {/* LocalBusiness JSON-LD: hardcoded business data — safe to inject */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
      />
      {/* FAQPage JSON-LD: homepage FAQ for Featured Snippets — safe to inject */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Sidebar categories={categories} />

      <main className="flex-1 min-w-0">
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Электронные компоненты в Казахстане</h1>
        <p className="text-gray-600 text-sm mb-6 leading-relaxed">
          Купить Arduino, ESP32, Raspberry Pi, датчики, модули и комплектующие с доставкой по Казахстану. Самовывоз в Костанай — Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9. Бесплатная доставка от 150 000 ₸. Работаем с 2019 года, доставка Яндекс Курьер по Костанаю и inDrive по всей стране.
        </p>
        <HomeTabs
          popularProducts={mapProducts(popularProducts)}
          newProducts={mapProducts(newProducts)}
          kitProducts={mapProducts(kitProducts)}
        />

        <div className="mt-6 text-right">
          <Link
            href="/collection/all"
            className="text-brand hover:text-brand-hover text-sm font-medium inline-flex items-center gap-1"
          >
            Смотреть все
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14m-7-7l7 7-7 7"/>
            </svg>
          </Link>
        </div>

        <div className="mt-10 border-t pt-8">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Интернет-магазин электронных компонентов</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-3">
            <strong>ИП КРУН</strong> — интернет-магазин электронных компонентов в Костанай и по всему Казахстану.
            Большой выбор Arduino, ESP32, Raspberry Pi, датчиков, модулей, аккумуляторов, двигателей и готовых наборов для робототехники.
            Доставка курьером по Костанаю и транспортными компаниями по всему Казахстану.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            Закажите онлайн или заберите самовывозом по адресу Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9. Оплата при получении картой или наличными. Бесплатная доставка от 150 000 ₸. Работаем с 2019 года.
          </p>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Популярные категории</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Link href="/collection/datchiki" className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-center">
              <span className="block font-medium text-gray-800">Датчики</span>
              <span className="text-xs text-gray-500">температура, движение</span>
            </Link>
            <Link href="/collection/akkumulyatory-i-batarei" className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-center">
              <span className="block font-medium text-gray-800">Аккумуляторы</span>
              <span className="text-xs text-gray-500">Li-Ion, 18650, LiPo</span>
            </Link>
            <Link href="/collection/gotovye-nabory-dlya-robototehniki" className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-center">
              <span className="block font-medium text-gray-800">Наборы</span>
              <span className="text-xs text-gray-500">Arduino, робототехника</span>
            </Link>
            <Link href="/collection/adaptery-razyomy-i-shteker" className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-center">
              <span className="block font-medium text-gray-800">Адаптеры</span>
              <span className="text-xs text-gray-500">разъёмы, штекеры</span>
            </Link>
          </div>
        </div>

        <div className="mt-10 border-t pt-8">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Часто задаваемые вопросы</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-800 mb-1">Где купить Arduino в Казахстане?</p>
              <p className="text-sm text-gray-600 leading-relaxed">Arduino можно купить в интернет-магазине ИП КРУН (croon.kz) с доставкой по всему Казахстану или самовывозом в Костанай.</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800 mb-1">Есть ли готовые наборы для начинающих?</p>
              <p className="text-sm text-gray-600 leading-relaxed">Да, ИП КРУН предлагает готовые стартовые наборы Arduino: Зелёный, Синий и Красный набор с компонентами и платой для начального обучения электронике.</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800 mb-1">Как быстро доставляют заказы?</p>
              <p className="text-sm text-gray-600 leading-relaxed">Доставка по Костанаю — 1-2 дня. По всему Казахстану — 3-7 дней. Доступен самовывоз из офиса в Костанае.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
