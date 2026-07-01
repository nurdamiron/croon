export const dynamic = 'force-dynamic'

import type { Metadata, Viewport } from 'next'
import { Fira_Sans } from 'next/font/google'
import './globals.css'
import Providers from '@/components/Providers'
import ServiceWorker from '@/components/ServiceWorker'
import ManifestLink from '@/components/ManifestLink'
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
    default: 'ИП КРУН — Электронные компоненты в Казахстане',
    template: '%s | ИП КРУН',
  },
  description: 'Интернет-магазин электронных компонентов в Казахстане: Arduino, ESP32, Raspberry Pi, датчики и модули. 1896 товаров в наличии. Доставка по Костанаю, самовывоз.',
  authors: [{ name: 'ИП КРУН', url: 'https://croon.kz' }],
  creator: 'ИП КРУН',
  publisher: 'ИП КРУН',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  icons: {
    icon: '/favicon.svg',
    apple: [
      { url: '/icons/icon-180x180.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'ИП КРУН',
  },
  openGraph: {
    siteName: 'ИП КРУН',
    locale: 'ru_KZ',
    type: 'website',
    title: 'ИП КРУН — Электронные компоненты в Казахстане',
    description: 'Интернет-магазин электронных компонентов в Казахстане: Arduino, ESP32, Raspberry Pi, датчики и модули. 1896 товаров в наличии. Доставка по Костанаю, самовывоз.',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'ИП КРУН — электронные компоненты в Казахстане' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ИП КРУН — Электронные компоненты в Казахстане',
    description: 'Интернет-магазин электронных компонентов в Казахстане: Arduino, ESP32, Raspberry Pi, датчики и модули. Доставка по Костанаю, самовывоз.',
    images: ['/og-image.jpg'],
  },
  alternates: {
    canonical: 'https://croon.kz',
    languages: {
      'ru-KZ': 'https://croon.kz',
      'x-default': 'https://croon.kz',
    },
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <head />
      <body className={`${firaSans.className} bg-white min-h-screen flex flex-col text-[#333] overflow-x-hidden`}>
        <Providers>
          <ManifestLink />
          <ServiceWorker />
          <div className="flex-1">{children}</div>
        </Providers>
      </body>
    </html>
  )
}
