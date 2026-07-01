'use client'

import Link from 'next/link'
import { useRef, useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import AdminNav from './AdminNav'
import { statusLabels } from '@/lib/constants'
import { ToastProvider } from '@/components/Toast'

interface SearchResult {
  orders: { id: string; orderNumber: number; name: string; total: number; status: string }[]
  products: { id: string; name: string; price: number; totalStock: number; images: { url: string }[] }[]
  clients: { id: string; name: string | null; email: string; phone: string | null }[]
}

// Map path → readable breadcrumb (always returns at least one item)
function useBreadcrumb() {
  const pathname = usePathname()
  if (pathname === '/admin') return [{ label: 'Главная' }]
  const parts: { label: string; href?: string }[] = [{ label: 'Главная', href: '/admin' }]
  if (pathname.startsWith('/admin/orders')) {
    parts.push({ label: 'Заказы', href: '/admin/orders' })
    if (pathname !== '/admin/orders') parts.push({ label: 'Заказ' })
  } else if (pathname.startsWith('/admin/products')) {
    parts.push({ label: 'Товары', href: '/admin/products' })
    if (pathname === '/admin/products/acceptance') {
      parts.push({ label: 'Приемка товаров' })
    } else if (pathname !== '/admin/products') {
      parts.push({ label: pathname.includes('/new') ? 'Новый товар' : 'Редактирование' })
    }
  } else if (pathname.startsWith('/admin/categories')) {
    parts.push({ label: 'Категории' })
  } else if (pathname.startsWith('/admin/clients')) {
    parts.push({ label: 'Клиенты' })
  } else if (pathname.startsWith('/admin/pages')) {
    parts.push({ label: 'Страницы' })
  } else if (pathname.startsWith('/admin/settings')) {
    parts.push({ label: 'Настройки' })
  }
  return parts
}

export default function AdminShell({ newOrderCount, children }: { newOrderCount: number; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const abortRef = useRef<AbortController | null>(null)
  const router = useRouter()
  const breadcrumbs = useBreadcrumb()

  const search = useCallback((q: string) => {
    if (q.length < 2) { setResults(null); return }
    // Cancel any in-flight request before firing a new one
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal: abortRef.current.signal })
      .then(r => r.json())
      .then(data => { setResults(data); setShowResults(true) })
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
  }, [])

  const onInput = (val: string) => {
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 280)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close sidebar on route change
  const pathname = usePathname()
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  const navigate = (href: string) => {
    setShowResults(false)
    setQuery('')
    setSearchFocused(false)
    router.push(href)
  }

  const hasResults = results && (results.orders.length > 0 || results.products.length > 0 || results.clients.length > 0)

  return (
    <ToastProvider>
    <div className="fixed inset-0 z-50 flex" style={{ background: '#f4f5f7' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── SIDEBAR ─── */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50
        w-[210px] shrink-0 flex flex-col overflow-hidden
        transform transition-transform duration-200 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{ background: '#161b22' }}>

        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="text-lg font-black tracking-widest text-white select-none">КРУН</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="text-white/30 hover:text-white/60 lg:hidden transition-colors ml-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Nav */}
        <div className="flex-1 min-h-0">
          <AdminNav newOrderCount={newOrderCount} />
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* ─── TOPBAR ─── */}
        <header className="shrink-0 bg-white border-b border-gray-200/80" style={{ height: 52 }}>
          <div className="flex items-center gap-3 h-full px-4 md:px-5">

            {/* Hamburger */}
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 hover:text-gray-800 transition-colors p-1 -ml-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18"/>
              </svg>
            </button>

            {/* Breadcrumb — always shown */}
            <nav className="flex items-center gap-1.5 text-[13px] flex-1 min-w-0">
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5 min-w-0">
                  {i > 0 && <span className="text-gray-200 select-none">/</span>}
                  {b.href
                    ? <Link href={b.href} className="text-gray-500 hover:text-admin transition-colors truncate">{b.label}</Link>
                    : <span className="text-gray-800 font-semibold truncate">{b.label}</span>
                  }
                </span>
              ))}
            </nav>

            {/* Search */}
            <div className="relative" ref={searchRef}>
              <div className={`flex items-center gap-2 border rounded-xl px-3 py-1.5 transition-all duration-200 ${
                searchFocused ? 'w-[320px] md:w-[400px] border-admin bg-white shadow-sm ring-2 ring-admin/10' : 'w-[180px] md:w-[260px] border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300'
              }`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={searchFocused ? '#5c6ac4' : '#9ca3af'} strokeWidth="2" className="shrink-0 transition-colors">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  placeholder="Поиск..."
                  value={query}
                  onChange={e => onInput(e.target.value)}
                  onFocus={() => { setSearchFocused(true); results && setShowResults(true) }}
                  className="flex-1 bg-transparent text-[13px] outline-none text-gray-800 placeholder-gray-400 min-w-0"
                />
                {query && (
                  <button onClick={() => { setQuery(''); setResults(null); setShowResults(false) }}
                    className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* Search results dropdown */}
              {showResults && query.length >= 2 && (
                <div className="absolute right-0 top-full mt-2 w-screen max-w-[380px] bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  {!hasResults ? (
                    <div className="py-8 text-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" className="mx-auto mb-2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                      </svg>
                      <p className="text-[13px] text-gray-400">Ничего не найдено по «{query}»</p>
                    </div>
                  ) : (
                    <div>
                      {results!.orders.length > 0 && (
                        <div>
                          <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Заказы</div>
                          {results!.orders.map(o => (
                            <button key={o.id} onClick={() => navigate(`/admin/orders/${o.id}`)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                            >
                              <span className="w-8 h-8 rounded-lg bg-admin/10 text-admin text-[11px] font-bold flex items-center justify-center shrink-0">#{o.orderNumber}</span>
                              <span className="flex-1 text-[13px] text-gray-800 truncate">{o.name}</span>
                              <span className="text-[12px] text-gray-500 font-mono shrink-0">{o.total.toLocaleString()} тг</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {results!.products.length > 0 && (
                        <div className="border-t border-gray-100">
                          <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Товары</div>
                          {results!.products.map(p => (
                            <button key={p.id} onClick={() => navigate(`/admin/products/${p.id}`)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                            >
                              {p.images[0]?.url
                                ? <img src={p.images[0].url} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0 bg-gray-50 border border-gray-100" />
                                : <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0" />
                              }
                              <span className="flex-1 text-[13px] text-gray-800 truncate">{p.name}</span>
                              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${p.totalStock > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                                {p.totalStock} шт
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {results!.clients.length > 0 && (
                        <div className="border-t border-gray-100">
                          <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Клиенты</div>
                          {results!.clients.map(c => (
                            <button key={c.id} onClick={() => navigate('/admin/clients')}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                            >
                              <div className="w-8 h-8 rounded-full bg-admin/10 flex items-center justify-center shrink-0">
                                <span className="text-admin text-[12px] font-bold">{(c.name || c.email)[0]?.toUpperCase()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] text-gray-800 truncate">{c.name || c.email}</div>
                                <div className="text-[11px] text-gray-400">{c.phone || ''}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="border-t border-gray-100 px-3 py-2 bg-gray-50/50 text-[11px] text-gray-400 flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px]">Esc</kbd>
                    <span>закрыть</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ─── CONTENT ─── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-5 lg:p-6">
          {children}
        </main>
      </div>
    </div>
    </ToastProvider>
  )
}
