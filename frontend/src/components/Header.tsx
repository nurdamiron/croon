'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getCartCount, getCartTotal, getFavorites, trackSource, trackSearch } from '@/lib/cart'
import { formatPrice } from '@/lib/format'
import HighlightText from '@/components/HighlightText'
import type { SearchSuggestion } from '@/app/api/search/suggestions/route'
import SearchCategoryPicker from '@/components/SearchCategoryPicker'
import { readSearchHistory, addSearchHistory, removeSearchHistory, clearSearchHistory } from '@/lib/search-history'

interface Category {
  id: string
  name: string
  slug: string
  parentId: string | null
  children?: Category[]
}

function SearchSync({ onSearchChange, onCatChange, onNavigate }: { onSearchChange: (q: string) => void, onCatChange: (c: string) => void, onNavigate: () => void }) {
  const searchParams = useSearchParams()
  const pathname = usePathname()

  useEffect(() => {
    onSearchChange(searchParams.get('search') || '')
    onCatChange(searchParams.get('inCat') || '')
  }, [searchParams, pathname, onSearchChange, onCatChange])

  useEffect(() => {
    onNavigate()
  }, [searchParams, pathname, onNavigate])

  return null
}

export default function Header({ categories }: { categories: Category[] }) {
  const { data: session } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartCount, setCartCount] = useState(0)
  const [cartTotal, setCartTotal] = useState(0)
  const [favCount, setFavCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('search') || ''
    }
    return ''
  })
  const [searchCat, setSearchCat] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('inCat') || ''
    }
    return ''
  })
  const [expandedCat, setExpandedCat] = useState<string | null>(null)

  useEffect(() => {
    const update = () => {
      setCartCount(getCartCount())
      setCartTotal(getCartTotal())
      setFavCount(getFavorites().length)
    }
    update()
    window.addEventListener('cart-updated', update)
    window.addEventListener('favorites-updated', update)
    return () => {
      window.removeEventListener('cart-updated', update)
      window.removeEventListener('favorites-updated', update)
    }
  }, [])

  // Track traffic source on first visit
  useEffect(() => { trackSource() }, [])

  const accountHref = session ? '/account' : '/client_account/login'

  const topLinks = [
    { label: 'Главная', href: '/' },
    { label: 'Arduino наборы', href: '/arduino-nabory' },
    { label: 'Для школ', href: '/dlya-shkol' },
    { label: 'Блог', href: '/blogs/kits' },
    { label: 'Контакты', href: '/page/contacts' },
    { label: 'Личный кабинет', href: accountHref },
    { label: 'Вики', href: 'https://wiki.alashed.kz/', external: true, own: true },
    { label: 'AlashEd-Товары для Гос.закупа', href: '/page/alashed' },
  ]

  // Build category tree
  const rootId = categories.find(c => c.name === 'Каталог')?.id
  const topLevel = categories.filter(c => c.parentId === rootId)
  const getChildren = (parentId: string) => categories.filter(c => c.parentId === parentId)

  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // История поиска (localStorage). Показываем когда инпут пустой/короче 2 и в фокусе.
  const [history, setHistory] = useState<string[]>([])
  const [searchFocused, setSearchFocused] = useState(false)
  useEffect(() => { setHistory(readSearchHistory()) }, [])

  const fetchSuggestions = useCallback((val: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    if (abortRef.current) abortRef.current.abort()
    if (val.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    suggestTimer.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(val.trim())}`, { signal: controller.signal })
        const data = await res.json()
        setSuggestions(data.products || [])
        setShowSuggestions((data.products || []).length > 0)
      } catch (e: any) {
        if (e?.name !== 'AbortError') { /* ignore abort */ }
      }
    }, 200)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setShowSuggestions(false)
    setSearchFocused(false)
    const q = searchQuery.trim()
    if (q) {
      setSearching(true)
      trackSearch(q)
      addSearchHistory(q)
      setHistory(readSearchHistory())
      const catPart = searchCat ? `&inCat=${encodeURIComponent(searchCat)}` : ''
      router.push(`/collection/all?search=${encodeURIComponent(q)}${catPart}`)
    }
  }

  const runHistoryQuery = (term: string) => {
    setSearchQuery(term)
    setShowSuggestions(false)
    setSearchFocused(false)
    setSearching(true)
    trackSearch(term)
    addSearchHistory(term)
    setHistory(readSearchHistory())
    const catPart = searchCat ? `&inCat=${encodeURIComponent(searchCat)}` : ''
    router.push(`/collection/all?search=${encodeURIComponent(term)}${catPart}`)
  }

  const deleteFromHistory = (term: string) => {
    removeSearchHistory(term)
    setHistory(readSearchHistory())
  }
  const clearAllHistory = () => {
    clearSearchHistory()
    setHistory([])
  }

  const handleSearchSync = useCallback((q: string) => setSearchQuery(q), [])
  const handleCatSync = useCallback((c: string) => setSearchCat(c), [])

  // Если юзер сменил/сбросил категорию, находясь на странице поиска —
  // сразу применяем фильтр (перенаправляем с новым inCat), без необходимости
  // нажимать лупу. В остальных местах сайта просто запоминаем выбор.
  const handleCatPick = useCallback((c: string) => {
    setSearchCat(c)
    if (pathname === '/collection/all' && searchQuery.trim()) {
      const catPart = c ? `&inCat=${encodeURIComponent(c)}` : ''
      router.push(`/collection/all?search=${encodeURIComponent(searchQuery.trim())}${catPart}`)
    }
  }, [pathname, router, searchQuery])
  const handleNavigate = useCallback(() => {
    setSearching(false)
    setShowSuggestions(false)
  }, [])

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      <Suspense fallback={null}>
        <SearchSync onSearchChange={handleSearchSync} onCatChange={handleCatSync} onNavigate={handleNavigate} />
      </Suspense>
      {/* Top bar — hidden on mobile */}
      <div className="hidden md:block bg-white border-b border-gray-100">
        <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-10 text-sm">
          <nav className="flex items-center gap-4">
            {topLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-gray-600 hover:text-brand transition-colors"
                {...(link.external ? { target: '_blank', rel: 'noopener' } : {})}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4 text-gray-500">
            <span>Доставка с 12:00 до 20:00</span>
            <a href="tel:+77009001790" className="text-gray-800 font-medium hover:text-brand">
              +7(700) 900-17-90
            </a>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="max-w-[1400px] mx-auto px-4 flex items-center gap-2 md:gap-4 h-14 md:h-16">
        {/* Logo */}
        <Link href="/" aria-label="Alash Electronics — Главная" className="shrink-0 hidden md:block">
          <Image src="/images/logo.png" alt="Alash electronics" width={110} height={55} className="object-contain" />
        </Link>

        {/* Catalog button — only on mobile (desktop has sidebar) */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="lg:hidden flex items-center gap-2 bg-brand hover:bg-brand-hover text-white px-3 py-2.5 rounded-lg font-medium transition-colors shrink-0 text-sm"
        >
          <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
            <path d="M0 0h18v2H0V0zm0 5h18v2H0V5zm0 5h18v2H0v-2z" fill="currentColor"/>
          </svg>
          Каталог
        </button>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 flex relative">
          <div className="flex flex-1 border-2 border-gray-200 rounded-lg focus-within:border-brand transition-colors">
            <input
              type="search"
              placeholder="Поиск товаров"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); fetchSuggestions(e.target.value) }}
              onFocus={() => {
                setSearchFocused(true)
                if (suggestions.length > 0) setShowSuggestions(true)
              }}
              onBlur={() => setTimeout(() => { setShowSuggestions(false); setSearchFocused(false) }, 200)}
              onKeyDown={e => { if (e.key === 'Escape') { setShowSuggestions(false); setSearchFocused(false) } }}
              className="flex-1 px-4 py-2.5 outline-none text-sm min-h-[44px] rounded-l-md"
              autoComplete="off"
              inputMode="search"
              spellCheck={false}
            />
            {/* Кастомный селект категории — справа от инпута, скрыт на мобилке */}
            <SearchCategoryPicker
              categories={categories}
              value={searchCat}
              onChange={handleCatPick}
            />
            <button type="submit" disabled={searching} className="bg-brand hover:bg-brand-hover text-white px-4 transition-colors rounded-r-md">
              {searching ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              )}
            </button>
          </div>

          {/* История поиска (когда инпут пустой/короткий и в фокусе) */}
          {searchFocused && searchQuery.trim().length < 2 && history.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Недавние запросы</span>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={clearAllHistory}
                  className="text-[11px] text-gray-400 hover:text-brand"
                >
                  Очистить
                </button>
              </div>
              <ul className="py-1">
                {history.map(term => (
                  <li key={term} className="flex items-center group">
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => runHistoryQuery(term)}
                      className="flex-1 flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left min-w-0"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-gray-400">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="truncate">{term}</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => deleteFromHistory(term)}
                      aria-label="Удалить из истории"
                      className="px-3 py-2 text-gray-300 hover:text-brand shrink-0"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden max-h-[60vh] overflow-y-auto">
              {suggestions.map(p => (
                <Link
                  key={p.id}
                  href={`/product/${p.slug}`}
                  onClick={() => { setShowSuggestions(false); setMenuOpen(false) }}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" width={40} height={40} className="w-10 h-10 object-contain rounded shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-100 rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <HighlightText text={p.name} query={searchQuery} className="text-sm text-gray-800 line-clamp-1 block" />
                    <span className="text-xs text-brand font-medium">{formatPrice(p.price)}</span>
                  </div>
                </Link>
              ))}
              <Link
                href={`/collection/all?search=${encodeURIComponent(searchQuery.trim())}${searchCat ? `&inCat=${encodeURIComponent(searchCat)}` : ''}`}
                onClick={() => setShowSuggestions(false)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm text-brand hover:bg-brand/5 font-medium transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                Все результаты по «{searchQuery.trim()}»
              </Link>
            </div>
          )}
        </form>

        {/* Icons */}
        <div className="flex items-center gap-1 md:gap-3 shrink-0">
          <Link href={accountHref} aria-label="Личный кабинет" className="hidden md:block text-gray-600 hover:text-brand p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </Link>
          <Link href="/favorites" aria-label="Избранное" className="hidden md:block text-gray-600 hover:text-brand p-2 relative">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {favCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-brand text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                {favCount}
              </span>
            )}
          </Link>
          <Link href="/cart" aria-label="Корзина" className="flex items-center gap-2 text-gray-600 hover:text-brand p-2 relative">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-brand text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
            <span className="hidden md:inline text-sm font-medium">{formatPrice(cartTotal)}</span>
          </Link>
        </div>
      </div>

      {/* Mobile drawer menu */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setMenuOpen(false)} />
          <div className="fixed top-0 left-0 bottom-0 w-[min(300px,85vw)] bg-white z-50 overflow-y-auto shadow-xl">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 h-14 border-b">
              <Link href="/" aria-label="Alash Electronics — Главная" onClick={() => setMenuOpen(false)}>
                <Image src="/images/logo.png" alt="Alash electronics" width={110} height={50} className="object-contain" />
              </Link>
              <button onClick={() => setMenuOpen(false)} className="text-gray-500 hover:text-gray-700 p-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Account section */}
            <div className="px-4 py-3 border-b bg-gray-50">
              <Link
                href={accountHref}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 text-[#333]"
              >
                <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#006EBE" strokeWidth="1.5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium">{session ? 'Личный кабинет' : 'Войти / Регистрация'}</div>
                  {session?.user?.email && <div className="text-xs text-gray-500">{session.user.email}</div>}
                </div>
              </Link>
            </div>

            {/* Quick links */}
            <div className="flex border-b">
              <Link
                href="/favorites"
                onClick={() => setMenuOpen(false)}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-gray-600 hover:text-brand border-r"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                Избранное
                {favCount > 0 && <span className="text-xs bg-brand text-white px-1.5 rounded-full">{favCount}</span>}
              </Link>
              <Link
                href="/cart"
                onClick={() => setMenuOpen(false)}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-gray-600 hover:text-brand"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 01-8 0"/>
                </svg>
                Корзина
                {cartCount > 0 && <span className="text-xs bg-brand text-white px-1.5 rounded-full">{cartCount}</span>}
              </Link>
            </div>

            {/* Catalog categories */}
            <div className="px-4 pt-4 pb-2">
              <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wide mb-2">Каталог</h3>
            </div>
            <ul className="px-4">
              {topLevel.map(cat => {
                const children = getChildren(cat.id)
                const isExpanded = expandedCat === cat.id
                return (
                  <li key={cat.id} className="border-b border-gray-100 last:border-0">
                    <div className="flex items-center">
                      <Link
                        href={`/collection/${cat.slug}`}
                        className="flex-1 py-2.5 text-sm text-[#333] hover:text-brand transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        {cat.name}
                      </Link>
                      {children.length > 0 && (
                        <button
                          onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                          className="p-2 text-gray-400 hover:text-brand"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d={isExpanded ? 'M2 8l4-4 4 4' : 'M4 2l4 4-4 4'} />
                          </svg>
                        </button>
                      )}
                    </div>
                    {isExpanded && children.length > 0 && (
                      <ul className="pl-3 pb-2">
                        {children.map(sub => (
                          <li key={sub.id}>
                            <Link
                              href={`/collection/${sub.slug}`}
                              className="block py-1.5 text-sm text-gray-500 hover:text-brand transition-colors"
                              onClick={() => setMenuOpen(false)}
                            >
                              {sub.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* Navigation links */}
            <div className="px-4 pt-4 pb-2 mt-2 border-t">
              <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wide mb-2">Навигация</h3>
            </div>
            <ul className="px-4 pb-2">
              {[
                { label: 'Главная', href: '/' },
                { label: 'Контакты', href: '/page/contacts' },
                { label: 'Вики', href: 'https://wiki.alashed.kz/', external: true, own: true },
                { label: 'AlashEd — Гос.закуп', href: '/page/alashed' },
              ].map(link => (
                <li key={link.href} className="border-b border-gray-100 last:border-0">
                  <Link
                    href={link.href}
                    className="block py-2.5 text-sm text-[#333] hover:text-brand transition-colors"
                    onClick={() => setMenuOpen(false)}
                    {...(link.external ? { target: '_blank', rel: 'noopener' } : {})}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Phone */}
            <div className="px-4 py-4 border-t mt-2">
              <a href="tel:+77009001790" className="flex items-center gap-3 text-[#333]">
                <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium">+7(700) 900-17-90</div>
                  <div className="text-xs text-gray-500">Доставка с 12:00 до 20:00</div>
                </div>
              </a>
            </div>
          </div>
        </>
      )}
    </header>
  )
}
