/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'alashed-media.s3.eu-north-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'resources.cdn-kaspi.kz',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2592000, // 30 days
    // Restrict to sizes actually used — removes 1920/2048/3840 srcset bloat
    deviceSizes: [320, 420, 640, 750, 1080, 1200],
    imageSizes: [64, 128, 256, 384, 512],
  },
  async headers() {
    return [
      // Global headers
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Robots-Tag', value: 'index, follow' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://mc.yandex.ru",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://yhcnncpvjjpqmbagvowd.supabase.co https://resources.cdn-kaspi.kz https://alashed-media.s3.eu-north-1.amazonaws.com https://www.google-analytics.com https://www.googletagmanager.com https://mc.yandex.ru",
              "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://mc.yandex.ru wss://mc.yandex.ru https://yhcnncpvjjpqmbagvowd.supabase.co",
              "frame-src https://www.googletagmanager.com",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
      // CORS only for API routes
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      // Private pages — noindex via HTTP header (works even when disallowed in robots.txt)
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/(account|cart|favorites|checkout|forgot-password|reset-password)',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/(account|cart|favorites|checkout|forgot-password|reset-password)/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/client_account/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Existing headers
      {
        source: '/_next/image',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
    ]
  },
  async redirects() {
    return [
      // www -> non-www (croon.kz)
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.croon.kz' }],
        destination: 'https://croon.kz/:path*',
        permanent: true,
      },
      // Old domain -> new canonical domain
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'shop.alashed.kz' }],
        destination: 'https://croon.kz/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.shop.alashed.kz' }],
        destination: 'https://croon.kz/:path*',
        permanent: true,
      },
      // InSales product URLs: /collection/{category}/product/{slug} -> /product/{slug}
      // Handled in middleware.ts (single hop, strips ?lang= simultaneously)
      // Raspberry slug was renamed to raspberry-pi — redirect old short URL
      {
        source: '/collection/raspberry',
        destination: '/collection/raspberry-pi',
        permanent: true,
      },
      // kategoriya-2 renamed to gotovye-nabory-arduino
      {
        source: '/collection/kategoriya-2',
        destination: '/collection/gotovye-nabory-arduino',
        permanent: true,
      },
      // Old InSales category slugs → current equivalents
      { source: '/collection/dvayvery', destination: '/collection/drayvery', permanent: true },
      { source: '/collection/mikrokontroller', destination: '/collection/kategoriya-1', permanent: true },
      { source: '/collection/mikrokontrollery-i-mikroshemy', destination: '/collection/microshems', permanent: true },
      { source: '/collection/kabeli', destination: '/collection/kabeli-i-perehodniki', permanent: true },
      { source: '/collection/lora', destination: '/collection/radiomoduli', permanent: true },
      { source: '/collection/testery', destination: '/collection/multimery-i-schupy', permanent: true },
      { source: '/collection/svetodiodnaya-produktsiya', destination: '/collection/leds', permanent: true },
      { source: '/collection/taktilnye', destination: '/collection/knopki-na-platu', permanent: true },
      { source: '/collection/pulty-i-klavitury', destination: '/collection/upravlenie-i-vvod', permanent: true },
      { source: '/collection/gyroskopy-akselerometry', destination: '/collection/datchiki', permanent: true },
      // Old blog sections (InSales) → our only active blog
      { source: '/blogs/projects-arduino/:slug*', destination: '/blogs/kits', permanent: true },
      { source: '/blogs/arduino_starter_kit_tutorial/:slug*', destination: '/blogs/kits', permanent: true },
      { source: '/blogs/37in1/:slug*', destination: '/blogs/kits', permanent: true },
      { source: '/blogs/wiki/:slug*', destination: '/blogs/kits', permanent: true },
      { source: '/blogs/SmartCarKitV1/:slug*', destination: '/blogs/kits', permanent: true },
      { source: '/blogs/SmartCarKitV2/:slug*', destination: '/blogs/kits', permanent: true },
      { source: '/blogs/Arduino-4WD-bluetooth-car/:slug*', destination: '/blogs/kits', permanent: true },
      { source: '/blogs/hidden/:slug*', destination: '/blogs/kits', permanent: true },
      { source: '/blogs/proekty-arduino', destination: '/blogs/kits', permanent: true },
      // PDF manuals → product pages
      { source: '/Alash_Red_Kit_ARDUINO.pdf', destination: '/product/arduino-starter-kit-krasnyy-nabor', permanent: true },
      { source: '/Alash_Blue_Kit_ARDUINO.pdf', destination: '/product/arduino-starter-kit-siniy-nabor', permanent: true },
      // InSales misc pages
      { source: '/compares', destination: '/', permanent: true },
      { source: '/compares/:path*', destination: '/', permanent: true },
      // Blog wiki pages that no longer exist — redirect to matching products
      {
        source: '/blogs/wiki/Arduino-bluetooth-car',
        destination: '/product/arduino-4wd-smart-car-kit-robot-konstruktor',
        permanent: true,
      },
      {
        source: '/blogs/wiki/BlueKitTutorial',
        destination: '/product/arduino-starter-kit-siniy-nabor',
        permanent: true,
      },
      {
        source: '/blogs/wiki/GreenKitTutorial',
        destination: '/product/arduino-starter-kit-zelenyy-nabor',
        permanent: true,
      },
      {
        source: '/blogs/wiki/RedKitTutorial',
        destination: '/product/arduino-starter-kit-krasnyy-nabor',
        permanent: true,
      },
      // Shortened slugs for too-long URLs (301 permanent)
      {
        source: '/product/nabor-dlya-sborki-kolesnogo-smart-car-kit-na-baze-arduino-robotokonstruktor-4wd-bluetooth-mnogofunktsionalnyy-umnyy-nabor-dlya-arduino-robot-education-uno-r3-starter-robot-konstruktor',
        destination: '/product/arduino-4wd-smart-car-kit-robot-konstruktor',
        permanent: true,
      },
      {
        source: '/product/2-pary-dalprop-fold-2-f7-7-dyuymov-f5-5-dyuymov-skladnoy-propeller-gladkiy-diy-props-bolshoy-radius-deystviya-sovmestimyy-popo-dlya-fpv-gonochnogo-radioupravlyaemogo-drona',
        destination: '/product/dalprop-fold-2-f7-f5-skladnoy-propeller-fpv',
        permanent: true,
      },
      {
        source: '/product/nabor-dlya-rezki-provodov-paron-mnogofunktsionalnye-kleschi-dlya-obzhima-provodov-i-kabeley-instrumenty-dlya-chistki-ovoschey-i-fruktov-ploskogubtsy-dlya-zachistki-provodov',
        destination: '/product/paron-kleschi-dlya-zachistki-obzhima-provodov',
        permanent: true,
      },
      {
        source: '/product/distantsionnyy-pereklyuchatel-sveta-modul-pereklyuchatelya-bez-neytrali-sonoff-sa-018-wi-fi-220-v-100vt-upravlenie-so-smartfona-cherez-internet-android-ios-umnyy-dom-yandex-alisa-apple-homekit',
        destination: '/product/sonoff-sa-018-wifi-pereklyuchatel-sveta-220v',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
