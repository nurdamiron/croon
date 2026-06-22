'use client'

import { useEffect } from 'react'

export default function YandexMetrika() {
  useEffect(() => {
    // Set up queue BEFORE script loads so any early ym() calls are buffered
    ;(window as any).ym = (window as any).ym || function (...args: any[]) {
      ;((window as any).ym.a = (window as any).ym.a || []).push(args)
    }
    ;(window as any).ym.l = Date.now()

    const script = document.createElement('script')
    script.src = 'https://mc.yandex.ru/metrika/tag.js'
    script.async = true
    script.onload = () => {
      ;(window as any).ym?.(99289068, 'init', {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        webvisor: true,
      })
    }
    document.head.appendChild(script)
  }, [])

  return null
}
