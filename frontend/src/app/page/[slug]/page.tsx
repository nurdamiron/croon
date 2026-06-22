import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPage, getCategories } from '@/lib/data'
import Link from 'next/link'
import SafeHtml from '@/components/SafeHtml'
import Sidebar from '@/components/LazySidebar'
import { cleanDescription, SITE_URL } from '@/lib/seo'

interface Props {
  params: { slug: string }
}

const PAGE_DESCRIPTIONS: Record<string, string> = {
  'about-us': 'ИП КРУН — интернет-магазин электронных компонентов в Костанай с 2019 года. Arduino, ESP32, датчики и модули. Доставка по Казахстану, самовывоз.',
  'contacts': 'Контакты ИП КРУН: Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9. Тел. +7 (700) 900-17-90. Telegram, WhatsApp. Режим работы: пн–сб 12:00–20:00.',
  'delivery': 'Доставка ИП КРУН: Яндекс Курьер по Костанаю, inDrive по Казахстану. Самовывоз — Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9. Бесплатная доставка от 150 000 ₸.',
  'feedback': 'Форма обратной связи ИП КРУН. Задайте вопрос или оставьте отзыв — ответим в течение рабочего дня.',
  'oferta': 'Публичная оферта ИП КРУН: условия покупки, доставки и возврата товаров в интернет-магазине.',
  'alashed': 'Государственные закупки — электронные компоненты для государственных учреждений. Реквизиты и условия работы с юридическими лицами.',
  'payment': 'Оплата в ИП КРУН: наличные, карта Visa/Mastercard, Kaspi Pay и банковский перевод. Оплата при получении.',
  'payment-2': 'Условия оплаты ИП КРУН: наличными, картой или банковским переводом. Оплата при получении или онлайн.',
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPage(params.slug)
  if (!page) return { title: 'Страница не найдена' }
  const description = PAGE_DESCRIPTIONS[params.slug]
    ?? (cleanDescription(page.content, 110) || page.title)
  return {
    title: page.title,
    description,
    alternates: { canonical: `/page/${page.slug}` },
    openGraph: {
      title: `${page.title} — ИП КРУН`,
      locale: 'ru_KZ',
      url: `/page/${page.slug}`,
      images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: `${page.title} — ИП КРУН` }],
    },
  }
}

// FAQPage schemas for key info pages — hardcoded from page content, safe to inject
const FAQ_SCHEMAS: Record<string, { question: string; answer: string }[]> = {
  delivery: [
    {
      question: 'Как осуществляется доставка по Костанаю?',
      answer: 'Доставка по Костанаю осуществляется через Яндекс Курьер. Бесплатная доставка при заказе от 150 000 ₸.',
    },
    {
      question: 'Как осуществляется доставка по Казахстану?',
      answer: 'Доставка по всему Казахстану через службу inDrive. Стоимость рассчитывается по тарифам перевозчика.',
    },
    {
      question: 'Можно ли забрать заказ самовывозом?',
      answer: 'Да, самовывоз доступен из нашего магазина по адресу: Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9. Часы работы: пн–сб, 12:00–20:00.',
    },
    {
      question: 'Сколько стоит доставка?',
      answer: 'Доставка бесплатна при заказе от 150 000 ₸. При меньшей сумме стоимость рассчитывается по тарифам курьерской службы.',
    },
  ],
  'payment-2': [
    {
      question: 'Какие способы оплаты доступны?',
      answer: 'Мы принимаем оплату наличными, картой и банковским переводом.',
    },
    {
      question: 'Можно ли оплатить при получении?',
      answer: 'Да, оплата наличными или картой доступна при получении заказа.',
    },
    {
      question: 'Как оплатить банковским переводом?',
      answer: 'Реквизиты для перевода предоставляются при оформлении заказа. После подтверждения оплаты заказ отправляется.',
    },
  ],
  payment: [
    {
      question: 'Можно ли оплатить картой?',
      answer: 'Да, принимаем Visa, Mastercard и карты казахстанских банков при получении заказа.',
    },
    {
      question: 'Работает ли оплата через Kaspi Pay?',
      answer: 'Да, оплата через приложение Kaspi доступна при самовывозе и доставке курьером.',
    },
    {
      question: 'Как оплатить наличными?',
      answer: 'Наличными можно оплатить курьеру при получении или в магазине при самовывозе по адресу Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9.',
    },
  ],
}

export default async function StaticPage({ params }: Props) {
  const [page, categories] = await Promise.all([
    getPage(params.slug),
    getCategories(),
  ])
  if (!page) return notFound()

  // BreadcrumbList JSON-LD: built from trusted DB fields (page.title, page.slug) — safe to inject
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: page.title, item: `${SITE_URL}/page/${page.slug}` },
    ],
  }

  const faqItems = FAQ_SCHEMAS[page.slug]
  const faqJsonLd = faqItems ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  } : null

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
      {/* JSON-LD: BreadcrumbList from trusted DB fields — safe to inject */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {/* FAQPage JSON-LD: hardcoded content for delivery/payment pages — safe to inject */}
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      <Sidebar categories={categories} />
      <main className="flex-1 min-w-0">
        <nav className="text-sm text-gray-500 mb-4">
          <Link href="/" className="hover:text-brand">Главная</Link>
          <span className="mx-1">/</span>
          <span className="text-gray-800">{page.title}</span>
        </nav>
        <h1 className="text-2xl font-bold mb-6">{page.title}</h1>
        <SafeHtml html={page.content} className="prose max-w-none" />

        <div className="mt-8 pt-6 border-t space-y-3">
          <p className="text-sm text-gray-600 leading-relaxed">
            ИП КРУН — интернет-магазин электронных компонентов в Костанай. Доставка по Казахстану, самовывоз по адресу Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9. Тел.: +7 (700) 900-17-90.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Оплата при получении картой или наличными. Бесплатная доставка от 150 000 ₸. Режим работы: пн–сб 12:00–20:00.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/collection/all" className="text-brand hover:text-brand-hover font-medium">→ Весь каталог</Link>
          <Link href="/page/delivery" className="text-gray-600 hover:text-brand">Доставка</Link>
          <Link href="/page/payment" className="text-gray-600 hover:text-brand">Оплата</Link>
          <Link href="/page/payment-2" className="text-gray-600 hover:text-brand">Условия оплаты</Link>
          <Link href="/page/contacts" className="text-gray-600 hover:text-brand">Контакты</Link>
          <Link href="/page/about-us" className="text-gray-600 hover:text-brand">О компании</Link>
          <Link href="/page/feedback" className="text-gray-600 hover:text-brand">Обратная связь</Link>
          <Link href="/page/alashed" className="text-gray-600 hover:text-brand">Гос.закуп</Link>
          <Link href="/karta-sayta" className="text-gray-600 hover:text-brand">Карта сайта</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
