'use client'

import { useEffect, useState, useRef } from 'react'
import { useToast } from '@/components/Toast'

interface Category {
  id: string
  name: string
  slug: string
  parentId: string | null
  isHidden: boolean
  sortOrder: number
  _count: { products: number }
}

function toSlug(str: string) {
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

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [modal, setModal] = useState<{ mode: 'edit' | 'new'; cat?: Category; parentId?: string } | null>(null)
  const [form, setForm] = useState({ name: '', slug: '', parentId: '', isHidden: false, sortOrder: 0 })
  const [saving, setSaving] = useState(false)
  const [slugManual, setSlugManual] = useState(false)
  const toast = useToast()

  // Expanded state
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const nameRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const res = await fetch('/api/admin/categories')
    if (res.ok) {
      const data = await res.json()
      setCategories(data.categories || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Auto-focus name when modal opens
  useEffect(() => {
    if (modal) setTimeout(() => nameRef.current?.focus(), 50)
  }, [modal])

  const openNew = (parentId = '') => {
    const siblings = categories.filter(c => c.parentId === (parentId || null))
    const maxSort = Math.max(0, ...siblings.map(c => c.sortOrder))
    setForm({ name: '', slug: '', parentId, isHidden: false, sortOrder: maxSort + 1 })
    setSlugManual(false)
    setModal({ mode: 'new', parentId })
  }

  const openEdit = (cat: Category) => {
    setForm({
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parentId || '',
      isHidden: cat.isHidden,
      sortOrder: cat.sortOrder,
    })
    setSlugManual(true)
    setModal({ mode: 'edit', cat })
  }

  const handleNameChange = (name: string) => {
    setForm(f => ({
      ...f,
      name,
      slug: slugManual ? f.slug : toSlug(name),
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    const body = modal?.mode === 'new'
      ? { name: form.name, slug: form.slug || toSlug(form.name), parentId: form.parentId || null, isHidden: form.isHidden, sortOrder: form.sortOrder }
      : { id: modal!.cat!.id, name: form.name, slug: form.slug || toSlug(form.name), parentId: form.parentId || null, isHidden: form.isHidden, sortOrder: form.sortOrder }

    const isNew = modal?.mode === 'new'
    const t = toast.loading(isNew ? 'Создаём категорию...' : 'Сохраняем...')
    const res = await fetch('/api/admin/categories', {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      t.resolve(isNew ? 'Категория создана' : 'Сохранено')
      setModal(null)
      load()
    } else {
      t.reject('Ошибка сохранения')
    }
  }

  const handleDelete = async (cat: Category) => {
    const children = categories.filter(c => c.parentId === cat.id)
    const msg = children.length
      ? `Удалить «${cat.name}» и все подкатегории (${children.length})?`
      : `Удалить «${cat.name}»?`
    if (!confirm(msg)) return
    const t = toast.loading('Удаляем...')
    const res = await fetch('/api/admin/categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cat.id }),
    })
    if (res.ok) { t.resolve('Категория удалена'); setModal(null); load() }
    else t.reject('Ошибка удаления')
  }

  const handleMove = async (cat: Category, dir: 'up' | 'down') => {
    const siblings = categories
      .filter(c => c.parentId === cat.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = siblings.findIndex(c => c.id === cat.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= siblings.length) return
    const swap = siblings[swapIdx]
    await Promise.all([
      fetch('/api/admin/categories', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cat.id, name: cat.name, slug: cat.slug, parentId: cat.parentId, isHidden: cat.isHidden, sortOrder: swap.sortOrder }),
      }),
      fetch('/api/admin/categories', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: swap.id, name: swap.name, slug: swap.slug, parentId: swap.parentId, isHidden: swap.isHidden, sortOrder: cat.sortOrder }),
      }),
    ])
    load()
  }

  const getChildren = (parentId: string | null) =>
    categories.filter(c => c.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder)

  // Top-level: children of root (the hidden "Каталог" node)
  const root = categories.find(c => !c.parentId)
  const topLevel = root ? getChildren(root.id) : getChildren(null)

  const renderRow = (cat: Category, depth = 0, isLast = false) => {
    const children = getChildren(cat.id)
    const isExpanded = expanded.has(cat.id)
    const siblings = categories.filter(c => c.parentId === cat.parentId).sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = siblings.findIndex(c => c.id === cat.id)

    return (
      <div key={cat.id}>
        <div
          className={`group flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 ${cat.isHidden ? 'opacity-50' : ''}`}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
        >
          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(prev => {
              const n = new Set(prev)
              n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id)
              return n
            })}
            className={`w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0 transition-colors rounded ${children.length ? 'hover:bg-gray-200' : 'cursor-default opacity-0'}`}
          >
            {children.length > 0 && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              >
                <path d="M9 18l6-6-6-6"/>
              </svg>
            )}
          </button>

          {/* Name */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className={`text-[13px] font-medium truncate ${cat.isHidden ? 'text-gray-400' : 'text-gray-900'}`}>
              {cat.name}
            </span>
            {cat.isHidden && (
              <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded shrink-0">скрыта</span>
            )}
            <span className="text-[11px] text-gray-300 shrink-0 font-mono hidden sm:inline">/{cat.slug}</span>
          </div>

          {/* Count */}
          <span className="text-[12px] text-gray-400 shrink-0 w-10 text-right">{cat._count.products}</span>

          {/* Actions — visible on hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {/* Move up */}
            <button
              onClick={() => handleMove(cat, 'up')}
              disabled={idx === 0}
              className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 rounded hover:bg-gray-200 transition-colors"
              title="Выше"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg>
            </button>
            {/* Move down */}
            <button
              onClick={() => handleMove(cat, 'down')}
              disabled={idx === siblings.length - 1}
              className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 rounded hover:bg-gray-200 transition-colors"
              title="Ниже"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {/* Add sub */}
            <button
              onClick={() => { setExpanded(p => new Set(p).add(cat.id)); openNew(cat.id) }}
              className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-admin rounded hover:bg-admin/10 transition-colors"
              title="Добавить подкатегорию"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            {/* Edit */}
            <button
              onClick={() => openEdit(cat)}
              className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-admin rounded hover:bg-admin/10 transition-colors"
              title="Редактировать"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            {/* Delete */}
            <button
              onClick={() => handleDelete(cat)}
              className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
              title="Удалить"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </div>

        {/* Children */}
        {children.length > 0 && isExpanded && (
          <div>
            {children.map((child, i) => renderRow(child, depth + 1, i === children.length - 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Категории</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">{categories.length} категорий</p>
        </div>
        <button
          onClick={() => openNew()}
          className="flex items-center gap-1.5 bg-admin text-white px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-admin-hover transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Добавить
        </button>
      </div>

      {/* Hint */}
      <p className="text-[12px] text-gray-400 mb-3 flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        Наведите на категорию чтобы увидеть кнопки управления
      </p>

      {/* Tree */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/50">
          <div className="w-5 shrink-0" />
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Название</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 w-10 text-right">Товаров</span>
          <div className="w-[120px] shrink-0" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-admin rounded-full animate-spin" />
          </div>
        ) : topLevel.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-gray-400">
            Нет категорий.
            <button onClick={() => openNew()} className="text-admin hover:underline ml-1">Создать первую</button>
          </div>
        ) : (
          <div>
            {topLevel.map((cat, i) => renderRow(cat, 0, i === topLevel.length - 1))}
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-[480px] overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-[15px] font-semibold text-gray-900">
                {modal.mode === 'new' ? 'Новая категория' : `Редактировать: ${modal.cat?.name}`}
              </h2>
              <button
                onClick={() => setModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Название *</label>
                <input
                  ref={nameRef}
                  type="text"
                  value={form.name}
                  onChange={e => handleNameChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-admin focus:ring-2 focus:ring-admin/10 transition-all"
                  placeholder="Название категории"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">URL (slug)</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={e => { setSlugManual(true); setForm(f => ({ ...f, slug: e.target.value })) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] font-mono outline-none focus:border-admin focus:ring-2 focus:ring-admin/10 transition-all"
                  placeholder="url-kategorii"
                />
              </div>

              {/* Parent */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Родительская категория</label>
                <select
                  value={form.parentId}
                  onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-admin focus:ring-2 focus:ring-admin/10 transition-all bg-white"
                >
                  <option value="">Корневая категория</option>
                  {categories
                    .filter(c => c.id !== modal.cat?.id && c.parentId !== null)
                    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))
                  }
                </select>
              </div>

              {/* Hidden toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setForm(f => ({ ...f, isHidden: !f.isHidden }))}
                  className={`relative w-9 h-5 rounded-full transition-colors ${form.isHidden ? 'bg-admin' : 'bg-gray-200'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isHidden ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-[13px] text-gray-700">Скрытая категория</span>
                <span className="text-[11px] text-gray-400">(не отображается на сайте)</span>
              </label>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              {modal.mode === 'edit' ? (
                <button
                  onClick={() => handleDelete(modal.cat!)}
                  className="text-[13px] text-red-500 hover:text-red-700 font-medium transition-colors"
                >
                  Удалить
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <button
                  onClick={() => setModal(null)}
                  className="px-4 py-2 text-[13px] text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 bg-admin text-white text-[13px] font-medium rounded-lg hover:bg-admin-hover disabled:opacity-50 transition-colors"
                >
                  {saving && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {saving ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
