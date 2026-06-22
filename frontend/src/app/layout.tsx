export const dynamic = 'force-dynamic'

import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { Fira_Sans } from 'next/font/google'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Providers from '@/components/Providers'
import ServiceWorker from '@/components/ServiceWorker'
import ManifestLink from '@/components/ManifestLink'
import YandexMetrika from '@/components/YandexMetrika'
import { getCategories } from '@/lib/data'
import { SITE_URL } from '@/lib/seo'

const firaSans = Fira_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: true,
})

export const viewport: Viewport = {
  themeColor: '#006EBE',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Alash Electronics — Электронные компоненты в Казахстане',
    template: '%s | Alash Electronics',
  },
  description: 'Интернет-магазин электронных компонентов в Казахстане: Arduino, ESP32, Raspberry Pi, датчики и модули. 1896 товаров в наличии. Доставка по Алматы, самовывоз.',
  authors: [{ name: 'Alash Electronics', url: 'https://alash-electronics.kz' }],
  creator: 'Alash Electronics',
  publisher: 'Alash Electronics',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  icons: {
    icon: '/favicon.ico',
    apple: [
      { url: '/icons/icon-180x180.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Alash Electronics',
  },
  openGraph: {
    siteName: 'Alash Electronics',
    locale: 'ru_KZ',
    type: 'website',
    title: 'Alash Electronics — Электронные компоненты в Казахстане',
    description: 'Интернет-магазин электронных компонентов в Казахстане: Arduino, ESP32, Raspberry Pi, датчики и модули. 1896 товаров в наличии. Доставка по Алматы, самовывоз.',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Alash Electronics — электронные компоненты в Казахстане' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alash Electronics — Электронные компоненты в Казахстане',
    description: 'Интернет-магазин электронных компонентов в Казахстане: Arduino, ESP32, Raspberry Pi, датчики и модули. Доставка по Алматы, самовывоз.',
    images: ['/og-image.jpg'],
  },
  alternates: {
    canonical: 'https://alash-electronics.kz',
    languages: {
      'ru-KZ': 'https://alash-electronics.kz',
      'x-default': 'https://alash-electronics.kz',
    },
  },
}

// WebSite schema goes on every page (needed for SearchAction / Sitelinks search box)
// LocalBusiness is on homepage only (app/page.tsx)
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  url: SITE_URL,
  name: 'Alash Electronics',
  description: 'Интернет-магазин электронных компонентов в Казахстане',
  inLanguage: 'ru',
  dateModified: new Date().toISOString().split('T')[0],
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/collection/all?search={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const categories = await getCategories().catch(() => [])

  return (
    <html lang="ru">
      <head>
        {/* Google Tag Manager — hardcoded ID, no user input, safe to inline */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-KL4548TT');`,
          }}
        />
        {/* Google Analytics (gtag.js) — hardcoded IDs, no user input, safe to inline */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-ZF2FTFY91R" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','G-ZF2FTFY91R');gtag('config','G-75N26YZSQD');`,
          }}
        />
        {/* Yandex.Metrika — loaded after hydration via YandexMetrika component to avoid blocking render */}
      </head>
      <body className={`${firaSans.className} bg-white min-h-screen flex flex-col text-[#333] overflow-x-hidden`}>
        {/* GTM noscript fallback — hardcoded ID, safe */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KL4548TT"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {/* JSON-LD: hardcoded structured data, no user input — safe to inject */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers>
          <ManifestLink />
          <ServiceWorker />
          <YandexMetrika />
          <Suspense>
            <Header categories={categories} />
          </Suspense>
          <div className="flex-1">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
