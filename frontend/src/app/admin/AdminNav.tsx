'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import PushSubscribe from './PushSubscribe'

const NAV_GROUPS = [
  {
    label: null,
    items: [
      {
        label: 'Главная',
        href: '/admin',
        exact: true,
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Продажи',
    items: [
      {
        label: 'Заказы',
        href: '/admin/orders',
        badge: true,
        badgeKey: 'orders',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="2"/>
            <line x1="9" y1="12" x2="15" y2="12"/>
            <line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
        ),
      },
      {
        label: 'Kaspi заказы',
        href: '/admin/kaspi-orders',
        badge: true,
        badgeKey: 'kaspi',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
        ),
      },
      {
        label: 'Kaspi аналитика',
        href: '/admin/kaspi-analytics',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <line x1="3" y1="21" x2="21" y2="21"/>
            <rect x="5" y="11" width="3" height="7" rx="0.5"/>
            <rect x="10.5" y="7" width="3" height="11" rx="0.5"/>
            <rect x="16" y="3" width="3" height="15" rx="0.5"/>
          </svg>
        ),
      },
      {
        label: 'Satu заказы',
        href: '/admin/satu-orders',
        badge: true,
        badgeKey: 'satu',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
          </svg>
        ),
      },
      {
        label: 'Ba3ar заказы',
        href: '/admin/ba3ar-orders',
        badge: true,
        badgeKey: 'ba3ar',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
          </svg>
        ),
      },
      {
        label: 'Клиенты',
        href: '/admin/clients',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
        ),
      },
      {
        label: 'Отзывы',
        href: '/admin/reviews',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Каталог',
    items: [
      {
        label: 'Товары',
        href: '/admin/products',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/>
          </svg>
        ),
      },
      {
        label: 'Приемка товаров',
        href: '/admin/products/acceptance',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ),
      },
      {
        label: 'Себестоимость',
        href: '/admin/cost-fix',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 7v10M9.5 9.5h3.25a1.75 1.75 0 010 3.5H10.5a1.75 1.75 0 000 3.5H14"/>
          </svg>
        ),
      },
      {
        label: 'Kaspi',
        href: '/admin/kaspi',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>
            <path d="M7 7v3M17.5 7v3M7 14v3M17.5 14v3"/>
          </svg>
        ),
      },
      {
        label: 'Нет на Kaspi',
        href: '/admin/kaspi-missing',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z"/>
            <line x1="15" y1="15" x2="21" y2="21"/><line x1="21" y1="15" x2="15" y2="21"/>
          </svg>
        ),
      },
      {
        label: 'Satu',
        href: '/admin/satu',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
          </svg>
        ),
      },
      {
        label: 'Ba3ar матчинг',
        href: '/admin/ba3ar-match',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M8 7h12M8 7l-4 4 4 4M16 17H4M16 17l4-4-4-4"/>
          </svg>
        ),
      },
      {
        label: 'Категории',
        href: '/admin/categories',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Контент',
    items: [
      {
        label: 'Страницы',
        href: '/admin/pages',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="8" y1="13" x2="16" y2="13"/>
            <line x1="8" y1="17" x2="12" y2="17"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Система',
    items: [
      {
        label: 'Настройки',
        href: '/admin/settings',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        ),
      },
    ],
  },
]

export default function AdminNav({ newOrderCount }: { newOrderCount?: number }) {
  const pathname = usePathname()
  // счётчики активных заказов по каналам: сайт / kaspi / satu / ba3ar
  const [counts, setCounts] = useState<Record<string, number>>({ orders: newOrderCount || 0, kaspi: 0, satu: 0, ba3ar: 0 })

  const fetchCount = useCallback(() => {
    const endpoints: Record<string, string> = {
      orders: '/api/admin/orders/count',
      kaspi: '/api/admin/kaspi-orders/count',
      satu: '/api/admin/satu-orders/count',
      ba3ar: '/api/admin/ba3ar-orders/count',
    }
    Object.entries(endpoints).forEach(([key, url]) => {
      fetch(url)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.count !== undefined) setCounts(prev => ({ ...prev, [key]: data.count })) })
        .catch(() => {})
    })
  }, [])

  useEffect(() => {
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [fetchCount])

  useEffect(() => { fetchCount() }, [pathname, fetchCount])

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  return (
    <nav className="flex flex-col h-full overflow-hidden">
      {/* Scrollable nav area */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'pt-3' : ''}>
            {group.label && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/25 select-none">
                {group.label}
              </div>
            )}
            {group.items.map(item => {
              const active = isActive(item.href, (item as any).exact)
              const badge = (item as any).badge ? (counts[(item as any).badgeKey] || 0) : 0
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium
                    transition-all duration-150 group select-none
                    ${active
                      ? 'bg-white/10 text-white'
                      : 'text-white/55 hover:text-white/90 hover:bg-white/6'
                    }
                  `}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-admin rounded-r-full" />
                  )}
                  <span className={`shrink-0 transition-opacity ${active ? 'opacity-100' : 'opacity-60 group-hover:opacity-90'}`}>
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-px rounded-full min-w-[18px] text-center leading-snug">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* Bottom section */}
      <div className="border-t border-white/8 py-2 px-2 space-y-0.5">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
          </svg>
          <span>Открыть сайт</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto opacity-40">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </Link>
        <PushSubscribe />
      </div>
    </nav>
  )
}
