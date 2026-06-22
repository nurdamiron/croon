'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface Product {
  id: string
  name: string
  slug: string
  price: number
  oldPrice: number | null
  inStock: boolean
  totalStock: number
  reservedStock?: number
  sku?: string | null
  categoryId: string | null
  images: { url: string }[]
  category: { name: string } | null
}

interface Category {
  id: string
  name: string
  slug: string
  parentId: string | null
  isHidden?: boolean
  sortOrder?: number
  _count?: { products: number }
}

type SortField = 'sku' | 'name' | 'totalStock' | 'price' | 'oldPrice'

// Transliterate Russian/Kazakh to Latin slug
function toSlug(str: string): string {
  const map: Record<string, string> = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i',
    'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
    'у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y',
    'ь':'','э':'e','ю':'yu','я':'ya','ә':'a','і':'i','ң':'n','ғ':'g','ү':'u','ұ':'u',
    'қ':'q','ө':'o','һ':'h',
  }
  return str.toLowerCase().split('').map(c => map[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const LOW_STOCK_THRESHOLD = 5

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [archivedView, setArchivedView] = useState(false) // показывать архив
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortField>('sku')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)
  const [bulkCatModal, setBulkCatModal] = useState<'add' | 'remove' | null>(null)
  const [bulkCatIds, setBulkCatIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [satuProgress, setSatuProgress] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [editingStock, setEditingStock] = useState<string | null>(null)
  const [editingStockVal, setEditingStockVal] = useState('')

  // Category management state
  const [contextMenu, setContextMenu] = useState<{ catId: string; x: number; y: number } | null>(null)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [newCatParentId, setNewCatParentId] = useState<string | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const newInputRef = useRef<HTMLInputElement>(null)

  const loadCategories = useCallback(() => {
    fetch('/api/admin/categories')
      .then(r => r.json())
      .then(data => setCategories(data.categories || data || []))
      .catch(() => {})
  }, [])

  useEffect(() => { loadCategories() }, [loadCategories])

  // Close context menu / bulk menu on click outside
  useEffect(() => {
    const handler = () => { setContextMenu(null); setBulkMenuOpen(false) }
    if (contextMenu || bulkMenuOpen) document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu, bulkMenuOpen])

  // Focus inputs
  useEffect(() => { if (editingCatId) editInputRef.current?.focus() }, [editingCatId])
  useEffect(() => { if (newCatParentId !== null) newInputRef.current?.focus() }, [newCatParentId])

  const loadProducts = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (categoryId) params.set('categoryId', categoryId)
    params.set('page', page.toString())
    params.set('limit', perPage.toString())
    params.set('sortBy', sortBy)
    params.set('sortDir', sortDir)
    if (archivedView) params.set('archived', 'on')

    const res = await fetch(`/api/admin/products?${params}`)
    if (res.ok) {
      const data = await res.json()
      setProducts(data.products)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }

  useEffect(() => { loadProducts(); setSelectedIds(new Set()) }, [page, search, categoryId, perPage, sortBy, sortDir, archivedView])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  // «Удалить» = отправить в архив (для любого товара). Ничего не теряется, можно вернуть.
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Отправить «${name}» в архив? Скроется с сайта, Google и каналов. Вернуть можно через фильтр «Архив».`)) return
    const res = await fetch('/api/admin/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) { loadProducts(); return }
    alert(d.error || `Не удалось архивировать «${name}» (ошибка ${res.status})`)
  }

  // Удалить навсегда (только из архива) — физически, если нет истории продаж.
  const handleDeleteForever = async (id: string, name: string) => {
    if (!confirm(`Удалить «${name}» НАВСЕГДА? Это необратимо.`)) return
    const res = await fetch('/api/admin/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, permanent: true }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) { loadProducts(); return }
    alert(d.error || `Не удалось удалить «${name}» (ошибка ${res.status})`)
  }

  // Вернуть товар из архива (снова показывать на сайте — остаток выставит сам админ).
  const handleRestore = async (id: string, name: string) => {
    if (!confirm(`Вернуть «${name}» из архива? Появится на сайте (если есть остаток).`)) return
    const res = await fetch(`/api/admin/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    })
    if (res.ok) loadProducts()
    else alert('Не удалось вернуть из архива')
  }

  const saveStock = async (id: string, stock: string) => {
    const val = parseInt(stock)
    if (isNaN(val) || val < 0) { setEditingStock(null); return }
    // Точечный PATCH (не PUT): не затирает остальные поля товара, а inStock
    // пересчитывается на сервере по доступному остатку (склад − бронь).
    const res = await fetch(`/api/admin/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalStock: val }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      setProducts(prev => prev.map(p => p.id === id ? { ...p, totalStock: val, inStock: d.inStock ?? (val > 0) } : p))
    }
    setEditingStock(null)
  }

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir(field === 'name' ? 'asc' : 'desc')
    }
    setPage(1)
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <span className="text-gray-300 ml-0.5">↕</span>
    return <span className="text-admin ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // Bulk selection
  const allSelected = products.length > 0 && products.every(p => selectedIds.has(p.id))
  const someSelected = selectedIds.size > 0

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(products.map(p => p.id)))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkAction = async (action: string) => {
    setBulkMenuOpen(false)
    if (action === 'delete') {
      // В обычном списке — архивировать выбранные; в режиме «Архив» — удалить навсегда.
      const msg = archivedView
        ? `Удалить НАВСЕГДА ${selectedIds.size} товаров? Это необратимо.`
        : `Отправить ${selectedIds.size} товаров в архив? Скроются с сайта, Google и каналов.`
      if (!confirm(msg)) return
      setBulkLoading(true)
      const res = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', productIds: Array.from(selectedIds), permanent: archivedView }),
      })
      const d = await res.json().catch(() => ({}))
      setSelectedIds(new Set())
      setBulkLoading(false)
      loadProducts()
      if (!res.ok) {
        alert(d.error || `Ошибка (HTTP ${res.status})`)
      } else if (archivedView && d.skipped > 0) {
        alert(`Удалено: ${d.deleted}. Оставлено в архиве: ${d.skipped} — ${d.skippedReason || 'есть продажи'}.`)
      }
    } else if (action === 'addCategories') {
      setBulkCatIds(new Set())
      setBulkCatModal('add')
    } else if (action === 'removeCategories') {
      setBulkCatIds(new Set())
      setBulkCatModal('remove')
    } else if (action === 'exportToSatu') {
      const ids = Array.from(selectedIds)
      if (!confirm(`Выложить ${ids.length} товар(ов) на Satu? Создадутся карточки (название, артикул, цена, фото, описание, остаток). Уже выложенные пропустятся.`)) return
      setBulkLoading(true)
      // Бьём на батчи по 20 — Satu разрешает 1 импорт за раз + защита от таймаута.
      const BATCH = 20
      let imported = 0, enriched = 0, mirrored = 0
      const errs: string[] = []
      try {
        for (let i = 0; i < ids.length; i += BATCH) {
          const chunk = ids.slice(i, i + BATCH)
          setSatuProgress(`${Math.min(i + chunk.length, ids.length)} / ${ids.length}`)
          const res = await fetch('/api/admin/satu/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: chunk }),
          })
          // ответ может быть HTML (504/таймаут шлюза) — не парсим вслепую
          const ct = res.headers.get('content-type') || ''
          if (!ct.includes('application/json')) {
            if (res.status === 504 || res.status === 502) {
              errs.push('Satu занят (импорт другого процесса) — попробуйте позже')
            } else {
              errs.push(`Сервер вернул не JSON (HTTP ${res.status})`)
            }
            break
          }
          const d = await res.json()
          if (!res.ok && res.status !== 207) { errs.push(d.error || `HTTP ${res.status}`); break }
          imported += d.imported ?? 0
          enriched += d.enriched ?? 0
          mirrored += d.mirrored ?? 0
          if (d.errors?.length) errs.push(...d.errors)
        }
        alert(
          `Выгрузка на Satu:\nимпорт ${imported}, дозалив ${enriched}, зеркало +${mirrored}` +
          (errs.length ? `\n\nОшибки (${errs.length}):\n` + errs.slice(0, 3).join('\n') : '')
        )
      } catch (e) {
        alert('Ошибка выгрузки на Satu: ' + (e as Error).message)
      }
      setSatuProgress(null)
      setSelectedIds(new Set())
      setBulkLoading(false)
      loadProducts()
    }
  }

  const handleBulkCategorySubmit = async () => {
    if (bulkCatIds.size === 0 || !bulkCatModal) return
    setBulkLoading(true)
    await fetch('/api/admin/products/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: bulkCatModal === 'add' ? 'addCategories' : 'removeCategories',
        productIds: Array.from(selectedIds),
        categoryIds: Array.from(bulkCatIds),
      }),
    })
    setBulkCatModal(null)
    setBulkCatIds(new Set())
    setSelectedIds(new Set())
    setBulkLoading(false)
    loadProducts()
  }

  // Category CRUD
  const handleCatRename = async (id: string) => {
    const name = editingName.trim()
    if (!name) { setEditingCatId(null); return }
    const cat = categories.find(c => c.id === id)
    if (!cat || cat.name === name) { setEditingCatId(null); return }
    await fetch('/api/admin/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, slug: toSlug(name), parentId: cat.parentId, isHidden: cat.isHidden, sortOrder: cat.sortOrder }),
    })
    setEditingCatId(null)
    loadCategories()
  }

  const handleCatCreate = async (parentId: string | null) => {
    const name = newCatName.trim()
    if (!name) { setNewCatParentId(null); return }
    // For new root categories, use mainRoot's id as parent
    const actualParentId = parentId === '__ROOT__' ? (categories.find(c => !c.parentId && !c.isHidden)?.id || null) : parentId
    const siblings = categories.filter(c => c.parentId === actualParentId)
    const maxSort = Math.max(0, ...siblings.map(c => c.sortOrder || 0))
    await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug: toSlug(name), parentId: actualParentId, sortOrder: maxSort + 1 }),
    })
    setNewCatParentId(null)
    setNewCatName('')
    loadCategories()
  }

  const handleCatToggleHidden = async (id: string) => {
    const cat = categories.find(c => c.id === id)
    if (!cat) return
    await fetch('/api/admin/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: cat.name, slug: cat.slug, parentId: cat.parentId, isHidden: !cat.isHidden, sortOrder: cat.sortOrder }),
    })
    loadCategories()
  }

  const handleCatMove = async (id: string, direction: 'up' | 'down') => {
    const cat = categories.find(c => c.id === id)
    if (!cat) return
    const siblings = categories.filter(c => c.parentId === cat.parentId).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    const idx = siblings.findIndex(c => c.id === id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= siblings.length) return
    const swap = siblings[swapIdx]
    await Promise.all([
      fetch('/api/admin/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cat.id, name: cat.name, slug: cat.slug, parentId: cat.parentId, isHidden: cat.isHidden, sortOrder: swap.sortOrder }),
      }),
      fetch('/api/admin/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: swap.id, name: swap.name, slug: swap.slug, parentId: swap.parentId, isHidden: swap.isHidden, sortOrder: cat.sortOrder }),
      }),
    ])
    loadCategories()
  }

  const handleCatDelete = async (id: string) => {
    const cat = categories.find(c => c.id === id)
    if (!cat) return
    const children = categories.filter(c => c.parentId === id)
    const msg = children.length > 0
      ? `Удалить "${cat.name}" и все подкатегории (${children.length})?`
      : `Удалить "${cat.name}"?`
    if (!confirm(msg)) return
    await fetch('/api/admin/categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (categoryId === id) setCategoryId('')
    loadCategories()
  }

  const getChildren = (parentId: string) => categories.filter(c => c.parentId === parentId)
  // Show children of the main root category as top-level
  const mainRoot = categories.find(c => !c.parentId)
  const displayRoots = mainRoot ? getChildren(mainRoot.id) : categories.filter(c => !c.parentId)

  // Build category tree for bulk modal
  const buildCatTree = (parentId: string | null, depth: number): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = []
    const children = categories.filter(c => c.parentId === parentId).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    for (const c of children) {
      result.push({ id: c.id, name: c.name, depth })
      result.push(...buildCatTree(c.id, depth + 1))
    }
    return result
  }
  const allCatTree = mainRoot ? buildCatTree(mainRoot.id, 0) : buildCatTree(null, 0)

  // Auto-expand parent categories when a child is selected
  useEffect(() => {
    if (categoryId && categories.length) {
      const newExpanded = new Set(expanded)
      let current = categories.find(c => c.id === categoryId)
      while (current?.parentId) {
        newExpanded.add(current.parentId)
        current = categories.find(c => c.id === current!.parentId)
      }
      if (newExpanded.size !== expanded.size) setExpanded(newExpanded)
    }
  }, [categoryId, categories])

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderCategory = (cat: Category, depth: number = 0) => {
    const children = getChildren(cat.id)
    const hasChildren = children.length > 0
    const isExpanded = expanded.has(cat.id)
    const isActive = categoryId === cat.id
    const count = cat._count?.products || 0
    const isEditing = editingCatId === cat.id

    return (
      <div key={cat.id}>
        <div
          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ catId: cat.id, x: e.clientX, y: e.clientY }) }}
          className={`group flex items-center justify-between text-[12px] transition-colors py-1 pr-1 ${
            isActive ? 'bg-admin/8 text-admin font-medium' : cat.isHidden ? 'text-gray-300 hover:bg-gray-50' : 'text-[#555] hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {isEditing ? (
            <input
              ref={editInputRef}
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCatRename(cat.id); if (e.key === 'Escape') setEditingCatId(null) }}
              onBlur={() => handleCatRename(cat.id)}
              className="flex-1 text-[12px] border border-admin rounded px-1.5 py-0.5 outline-none mr-1"
            />
          ) : (
            <button
              onClick={() => { setCategoryId(cat.id); setPage(1) }}
              className="flex-1 text-left flex items-center gap-1 min-w-0"
            >
              {hasChildren ? (
                <span
                  onClick={(e) => toggleExpand(cat.id, e)}
                  className="w-4 h-4 flex items-center justify-center text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer shrink-0"
                >
                  {isExpanded ? '−' : '+'}
                </span>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <span className="truncate">{cat.name}</span>
              {cat.isHidden && <span className="text-[9px] text-gray-300 shrink-0" title="Скрыта">🙈</span>}
            </button>
          )}
          <span className="flex items-center gap-0.5">
            <span className="text-[10px] text-gray-400 shrink-0">{count}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setContextMenu({ catId: cat.id, x: e.clientX, y: e.clientY }) }}
              className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity rounded"
              title="Действия"
            >
              ⋮
            </button>
          </span>
        </div>
        {/* New subcategory input */}
        {newCatParentId === cat.id && (
          <div style={{ paddingLeft: `${28 + depth * 16}px` }} className="pr-3 py-1">
            <input
              ref={newInputRef}
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCatCreate(cat.id); if (e.key === 'Escape') { setNewCatParentId(null); setNewCatName('') } }}
              onBlur={() => { if (!newCatName.trim()) { setNewCatParentId(null); setNewCatName('') } else handleCatCreate(cat.id) }}
              placeholder="Название..."
              className="w-full text-[12px] border border-admin rounded px-1.5 py-0.5 outline-none"
            />
          </div>
        )}
        {hasChildren && isExpanded && (
          <div>
            {children.map(child => renderCategory(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSidebar(v => !v)}
            className="lg:hidden p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
            title="Категории"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          <h1 className="text-xl font-semibold text-[#333]">Все товары</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/products/new"
            className="bg-admin text-white px-3.5 py-1.5 rounded text-[12px] font-medium hover:bg-admin-hover transition-colors"
          >
            Добавить товар
          </Link>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Category sidebar */}
        <div className={`${showSidebar ? 'block' : 'hidden'} lg:block w-full lg:w-[220px] shrink-0`}>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100">
              <button
                onClick={() => { setCategoryId(''); setPage(1) }}
                className={`flex-1 text-left px-3 py-1.5 text-[12px] transition-colors ${
                  !categoryId ? 'bg-admin/8 text-admin font-medium' : 'text-[#555] hover:bg-gray-50'
                }`}
              >
                Все товары
              </button>
              <button
                onClick={() => { setNewCatParentId('__ROOT__'); setNewCatName('') }}
                className="px-2 py-1.5 text-gray-400 hover:text-admin text-[14px] transition-colors"
                title="Добавить категорию"
              >
                +
              </button>
            </div>
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto py-1">
              {/* New root category input */}
              {newCatParentId === '__ROOT__' && (
                <div className="px-3 py-1">
                  <input
                    ref={newInputRef}
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCatCreate('__ROOT__'); if (e.key === 'Escape') { setNewCatParentId(null); setNewCatName('') } }}
                    onBlur={() => { if (!newCatName.trim()) { setNewCatParentId(null); setNewCatName('') } else handleCatCreate('__ROOT__') }}
                    placeholder="Название категории..."
                    className="w-full text-[12px] border border-admin rounded px-1.5 py-0.5 outline-none"
                  />
                </div>
              )}
              {displayRoots.map(cat => renderCategory(cat, 0))}
            </div>
          </div>

          {/* Context menu */}
          {contextMenu && (
            <div
              className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[180px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={e => e.stopPropagation()}
            >
              <Link
                href={`/admin/categories/${contextMenu.catId}`}
                onClick={() => setContextMenu(null)}
                className="w-full text-left px-3 py-1.5 text-[12px] text-[#333] hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="text-gray-400">⚙</span> Редактировать
              </Link>
              <button
                onClick={() => { const cat = categories.find(c => c.id === contextMenu.catId); if (cat) { setEditingCatId(cat.id); setEditingName(cat.name) } setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-[#333] hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="text-gray-400">✎</span> Переименовать
              </button>
              <button
                onClick={() => { setNewCatParentId(contextMenu.catId); setNewCatName(''); setExpanded(prev => new Set(prev).add(contextMenu.catId)); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-[#333] hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="text-gray-400">+</span> Добавить подкатегорию
              </button>
              <div className="border-t border-gray-100 my-0.5" />
              <button
                onClick={() => { handleCatToggleHidden(contextMenu.catId); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-[#333] hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="text-gray-400">{categories.find(c => c.id === contextMenu.catId)?.isHidden ? '👁' : '🙈'}</span>
                {categories.find(c => c.id === contextMenu.catId)?.isHidden ? 'Показать' : 'Скрыть'}
              </button>
              <div className="border-t border-gray-100 my-0.5" />
              <button
                onClick={() => { handleCatMove(contextMenu.catId, 'up'); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-[#333] hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="text-gray-400">↑</span> Вверх
              </button>
              <button
                onClick={() => { handleCatMove(contextMenu.catId, 'down'); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-[#333] hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="text-gray-400">↓</span> Вниз
              </button>
              <div className="border-t border-gray-100 my-0.5" />
              <button
                onClick={() => { handleCatDelete(contextMenu.catId); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-50 flex items-center gap-2"
              >
                <span>✕</span> Удалить
              </button>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="bg-white rounded-t-lg border border-b-0 border-gray-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="поиск товаров"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  className="w-44 border border-gray-200 rounded pl-2.5 pr-2 py-1 text-[12px] outline-none focus:border-admin transition-all"
                />
              </div>
              <button type="submit" className="text-[12px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                везде
              </button>
              {search && (
                <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }} className="text-[11px] text-gray-400 hover:text-red-400">✕</button>
              )}
            </form>
            {/* Переключатель «Архив»: скрытые товары (есть продажи в истории) */}
            <button
              type="button"
              onClick={() => { setArchivedView(v => !v); setPage(1) }}
              className={`text-[12px] px-2.5 py-1 rounded border transition-colors ${archivedView ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-300 hover:border-amber-500'}`}
              title="Архивные товары — скрыты с сайта/Google/каналов, но не удалены (есть продажи в истории). Можно вернуть."
            >
              {archivedView ? '← К товарам' : '🗄 Архив'}
            </button>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-gray-400">{total} товаров · {page} / {pages}</span>
              <div className="flex">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-1.5 py-0.5 border border-gray-200 rounded-l text-[12px] text-gray-500 hover:bg-gray-50 disabled:opacity-30">‹</button>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-1.5 py-0.5 border border-l-0 border-gray-200 rounded-r text-[12px] text-gray-500 hover:bg-gray-50 disabled:opacity-30">›</button>
              </div>
            </div>
          </div>

          {/* Bulk action bar */}
          {someSelected && (
            <div className="bg-[#f0f5ff] border border-b-0 border-admin/20 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-[#333] font-medium">Выбрано: {selectedIds.size}</span>
                <button onClick={() => setSelectedIds(new Set())} className="text-[11px] text-gray-400 hover:text-gray-600">Снять</button>
              </div>
              <div className="relative">
                <button
                  onClick={() => setBulkMenuOpen(!bulkMenuOpen)}
                  className="bg-admin text-white px-3 py-1 rounded text-[12px] font-medium hover:bg-admin-hover transition-colors flex items-center gap-1"
                  disabled={bulkLoading}
                >
                  {bulkLoading ? (satuProgress ? `Satu ${satuProgress}…` : 'Выполняем...') : 'Действия'}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                {bulkMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[220px]">
                    <button onClick={() => handleBulkAction('addCategories')} className="w-full text-left px-3 py-1.5 text-[12px] text-[#333] hover:bg-gray-50">
                      Добавить в категорию
                    </button>
                    <button onClick={() => handleBulkAction('removeCategories')} className="w-full text-left px-3 py-1.5 text-[12px] text-[#333] hover:bg-gray-50">
                      Убрать из категории
                    </button>
                    <div className="border-t border-gray-100 my-0.5" />
                    <button onClick={() => handleBulkAction('exportToSatu')} className="w-full text-left px-3 py-1.5 text-[12px] text-[#333] hover:bg-gray-50 flex items-center gap-1.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                      Выложить на Satu
                    </button>
                    <div className="border-t border-gray-100 my-0.5" />
                    <button onClick={() => handleBulkAction('delete')} className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-red-50 ${archivedView ? 'text-red-600 font-medium' : 'text-amber-600'}`}>
                      {archivedView ? 'Удалить навсегда' : 'В архив (скрыть)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Table */}
          <div className={`bg-white border border-gray-200 rounded-b-lg overflow-hidden`}>
            {loading ? (
              <div className="divide-y divide-gray-100">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-4 animate-pulse">
                    <div className="w-10 h-10 bg-gray-200 rounded" />
                    <div className="w-16 h-4 bg-gray-200 rounded" />
                    <div className="w-48 h-4 bg-gray-200 rounded" />
                    <div className="flex-1" />
                    <div className="w-20 h-4 bg-gray-200 rounded" />
                    <div className="w-12 h-4 bg-gray-200 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-[#fafbfc]">
                    <th className="w-10 px-3 py-2"><input type="checkbox" className="accent-admin" checked={allSelected} onChange={toggleSelectAll} /></th>
                    <th className="text-left px-2 py-2 font-medium text-[#999] text-[11px]">Фото</th>
                    <th className="text-left px-2 py-2 font-medium text-[#999] text-[11px]">
                      <button onClick={() => handleSort('name')} className="flex items-center gap-0.5 hover:text-admin transition-colors">
                        Название <SortIcon field="name" />
                      </button>
                    </th>
                    <th className="text-left px-2 py-2 font-medium text-[#999] text-[11px]">
                      <button onClick={() => handleSort('sku')} className="flex items-center gap-0.5 hover:text-admin transition-colors">
                        Артикул <SortIcon field="sku" />
                      </button>
                    </th>
                    <th className="text-left px-2 py-2 font-medium text-[#999] text-[11px]">
                      <button onClick={() => handleSort('totalStock')} className="flex items-center gap-0.5 hover:text-admin transition-colors">
                        Остаток <SortIcon field="totalStock" />
                      </button>
                    </th>
                    <th className="text-left px-2 py-2 font-medium text-[#999] text-[11px]">
                      <button onClick={() => handleSort('price')} className="flex items-center gap-0.5 hover:text-admin transition-colors">
                        Цена <SortIcon field="price" />
                      </button>
                    </th>
                    <th className="text-left px-2 py-2 font-medium text-[#999] text-[11px]">
                      <button onClick={() => handleSort('oldPrice')} className="flex items-center gap-0.5 hover:text-admin transition-colors">
                        Старая <SortIcon field="oldPrice" />
                      </button>
                    </th>
                    <th className="text-left px-2 py-2 font-medium text-[#999] text-[11px] hidden xl:table-cell">Категория</th>
                    <th className="w-16 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id} className={`border-b border-gray-50 transition-colors group ${selectedIds.has(product.id) ? 'bg-admin/5' : 'hover:bg-[#f8f9fc]'}`}>
                      <td className="px-3 py-1.5"><input type="checkbox" className="accent-admin" checked={selectedIds.has(product.id)} onChange={() => toggleSelect(product.id)} /></td>
                      <td className="px-2 py-1.5">
                        {product.images[0] ? (
                          <div className="relative w-9 h-9 rounded overflow-hidden bg-gray-50">
                            <Image src={product.images[0].url} alt="" fill className="object-contain" sizes="36px" />
                          </div>
                        ) : (
                          <div className="w-9 h-9 bg-gray-100 rounded flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Link href={`/admin/products/${product.id}`} className="text-admin hover:underline line-clamp-2">
                          {product.name}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-[#999]">{product.sku || '—'}</td>
                      <td className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                        {editingStock === product.id ? (
                          <input
                            type="number"
                            value={editingStockVal}
                            onChange={e => setEditingStockVal(e.target.value)}
                            onBlur={() => saveStock(product.id, editingStockVal)}
                            onKeyDown={e => { if (e.key === 'Enter') saveStock(product.id, editingStockVal); if (e.key === 'Escape') setEditingStock(null) }}
                            autoFocus
                            className="w-16 border border-admin rounded px-1.5 py-0.5 text-[12px] outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => { setEditingStock(product.id); setEditingStockVal(String(product.totalStock)) }}
                            className={`text-[12px] px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors ${product.totalStock === 0 ? 'text-red-500' : product.totalStock <= LOW_STOCK_THRESHOLD ? 'text-amber-600' : 'text-gray-600'}`}
                            title="Нажмите чтобы изменить"
                          >
                            {product.totalStock} шт
                          </button>
                        )}
                        {/* Бронь под незавершённые заказы (Kaspi/Satu): доступно = склад − бронь */}
                        {!!product.reservedStock && product.reservedStock > 0 && (
                          <div className="text-[10px] text-amber-600 leading-tight mt-0.5"
                            title="В брони под незавершённые заказы. На сайте доступно = склад − бронь.">
                            бронь {product.reservedStock} · дост. {Math.max(0, product.totalStock - product.reservedStock)}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-[#333]">{product.price.toLocaleString()} тг.</td>
                      <td className="px-2 py-1.5 text-[#999]">{product.oldPrice ? `${product.oldPrice.toLocaleString()} тг.` : '—'}</td>
                      <td className="px-2 py-1.5 hidden xl:table-cell">
                        {product.category?.name ? (
                          <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full line-clamp-1 max-w-[160px] block">{product.category.name}</span>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <Link href={`/admin/products/${product.id}`} className="p-1 text-gray-400 hover:text-admin rounded transition-colors" title="Редактировать">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </Link>
                          <a href={`/product/${product.slug}`} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-green-600 rounded transition-colors" title="Открыть на сайте">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                          </a>
                          {archivedView ? (
                            <>
                              <button onClick={() => handleRestore(product.id, product.name)} className="p-1 text-gray-400 hover:text-green-600 rounded transition-colors" title="Вернуть из архива">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg>
                              </button>
                              <button onClick={() => handleDeleteForever(product.id, product.name)} className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors" title="Удалить навсегда">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                              </button>
                            </>
                          ) : (
                            <button onClick={() => handleDelete(product.id, product.name)} className="p-1 text-gray-400 hover:text-amber-500 rounded transition-colors" title="В архив (скрыть)">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v9a2 2 0 002 2h12a2 2 0 002-2V9"/><line x1="10" y1="13" x2="14" y2="13"/></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {products.map(product => (
                  <div
                    key={product.id}
                    className={`p-3 flex items-center gap-3 ${selectedIds.has(product.id) ? 'bg-admin/5' : 'active:bg-gray-50'}`}
                  >
                    <input
                      type="checkbox"
                      className="accent-admin shrink-0"
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                      onClick={e => e.stopPropagation()}
                    />
                    {product.images[0] ? (
                      <div className="relative w-10 h-10 rounded overflow-hidden bg-gray-50 shrink-0">
                        <Image src={product.images[0].url} alt="" fill className="object-contain" sizes="40px" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded shrink-0 flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <Link href={`/admin/products/${product.id}`} className="text-[13px] text-admin hover:underline line-clamp-1 font-medium">
                        {product.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                        {product.sku && <span className="font-mono">{product.sku}</span>}
                        {product.category?.name && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{product.category.name}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-medium text-gray-900">{product.price.toLocaleString()} тг</div>
                      <div className={`text-[11px] ${product.totalStock === 0 ? 'text-red-500' : product.totalStock <= LOW_STOCK_THRESHOLD ? 'text-amber-600' : 'text-gray-500'}`}>
                        {product.totalStock} шт
                      </div>
                      {!!product.reservedStock && product.reservedStock > 0 && (
                        <div className="text-[10px] text-amber-600">бронь {product.reservedStock}</div>
                      )}
                    </div>
                    <a href={`/product/${product.slug}`} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1 text-gray-300 hover:text-green-600" title="Открыть на сайте">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                    <Link href={`/admin/products/${product.id}`} className="shrink-0 text-gray-300 hover:text-admin">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </Link>
                  </div>
                ))}
              </div>
              </>
            )}
          </div>

          {/* Bottom pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <div className="flex items-center gap-1">
              {pages > 1 && Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                let p: number
                if (pages <= 7) p = i + 1
                else if (page <= 4) p = i + 1
                else if (page >= pages - 3) p = pages - 6 + i
                else p = page - 3 + i
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded text-[11px] transition-colors ${
                      p === page ? 'bg-admin text-white' : 'text-admin hover:bg-gray-100'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
              {pages > 7 && (
                <>
                  <span className="text-gray-400 px-1">…</span>
                  <button onClick={() => setPage(pages)} className="w-7 h-7 rounded text-[11px] text-admin hover:bg-gray-100">{pages}</button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400">Показывать</span>
              <div className="flex gap-0.5">
                {[25, 50, 100].map(n => (
                  <button
                    key={n}
                    onClick={() => { setPerPage(n); setPage(1) }}
                    className={`px-2 py-0.5 rounded text-[11px] ${perPage === n ? 'bg-admin text-white' : 'text-gray-500 hover:bg-gray-200'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk category modal */}
      {bulkCatModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setBulkCatModal(null)}>
          <div className="bg-white rounded-lg shadow-xl w-[calc(100%-2rem)] max-w-[400px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[#333]">
                {bulkCatModal === 'add' ? 'Добавить в категорию' : 'Убрать из категории'}
              </h3>
              <button onClick={() => setBulkCatModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
              {allCatTree.map(opt => (
                <label key={opt.id} className="flex items-center gap-2 py-0.5 cursor-pointer" style={{ paddingLeft: `${opt.depth * 16}px` }}>
                  <input
                    type="checkbox"
                    checked={bulkCatIds.has(opt.id)}
                    onChange={() => {
                      setBulkCatIds(prev => {
                        const next = new Set(prev)
                        if (next.has(opt.id)) next.delete(opt.id)
                        else next.add(opt.id)
                        return next
                      })
                    }}
                    className="accent-admin w-3.5 h-3.5 shrink-0"
                  />
                  <span className={`text-[12px] ${bulkCatIds.has(opt.id) ? 'text-[#333] font-medium' : 'text-[#555]'}`}>
                    {opt.name}
                  </span>
                </label>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button onClick={() => setBulkCatModal(null)} className="px-3 py-1.5 text-[12px] text-gray-500 hover:text-gray-700">
                Отмена
              </button>
              <button
                onClick={handleBulkCategorySubmit}
                disabled={bulkCatIds.size === 0 || bulkLoading}
                className="bg-admin text-white px-4 py-1.5 rounded text-[12px] font-medium hover:bg-admin-hover transition-colors disabled:bg-gray-300"
              >
                {bulkLoading ? 'Применяем...' : 'Применить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
