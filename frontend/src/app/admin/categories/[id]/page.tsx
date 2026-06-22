'use client'

import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor'))

interface Category {
  id: string
  name: string
  slug: string
  parentId: string | null
  isHidden: boolean
}

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

export default function AdminCategoryEditPage() {
  const router = useRouter()
  const params = useParams()
  const catId = params.id as string
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [slugEditing, setSlugEditing] = useState(false)

  const [form, setForm] = useState({
    name: '',
    slug: '',
    parentId: '',
    description: '',
    isHidden: false,
    imageUrl: '',
  })

  useEffect(() => {
    // Load all categories for parent dropdown
    fetch('/api/admin/categories')
      .then(r => r.json())
      .then(data => setCategories(data.categories || data || []))
      .catch(() => {})

    // Load this category
    fetch(`/api/admin/categories/${catId}`)
      .then(r => r.json())
      .then(cat => {
        const img = cat.imageUrl || ''
        const validImage = img.startsWith('http://') || img.startsWith('https://') || img.startsWith('/') ? img : ''
        setForm({
          name: cat.name || '',
          slug: cat.slug || '',
          parentId: cat.parentId || '',
          description: cat.description || '',
          isHidden: cat.isHidden || false,
          imageUrl: validImage,
        })
        setLoading(false)
      })
      .catch(() => { setError('Категория не найдена'); setLoading(false) })
  }, [catId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (type === 'checkbox') {
      setForm(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }))
    } else {
      setForm(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/admin/products/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      setForm(prev => ({ ...prev, imageUrl: data.url }))
    } catch {
      setError('Ошибка загрузки изображения')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Введите название'); return }
    setSaving(true)
    setError('')

    try {
      const slug = form.slug || toSlug(form.name)
      const res = await fetch(`/api/admin/categories/${catId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug,
          parentId: form.parentId || null,
          description: form.description || null,
          isHidden: form.isHidden,
          imageUrl: form.imageUrl || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка сохранения')
      }

      router.push('/admin/products')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Удалить эту категорию?')) return
    try {
      await fetch('/api/admin/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: catId }),
      })
      router.push('/admin/products')
    } catch {
      setError('Ошибка удаления')
    }
  }

  // Build indented options for parent select, excluding self and descendants
  const getDescendantIds = (id: string): Set<string> => {
    const ids = new Set<string>([id])
    const queue = [id]
    while (queue.length) {
      const parentId = queue.shift()!
      for (const c of categories) {
        if (c.parentId === parentId && !ids.has(c.id)) {
          ids.add(c.id)
          queue.push(c.id)
        }
      }
    }
    return ids
  }

  const excludeIds = getDescendantIds(catId)
  const buildOptions = (parentId: string | null, depth: number): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = []
    const children = categories.filter(c => c.parentId === parentId && !excludeIds.has(c.id))
    for (const c of children) {
      result.push({ id: c.id, name: c.name, depth })
      result.push(...buildOptions(c.id, depth + 1))
    }
    return result
  }
  const parentOptions = buildOptions(null, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-admin rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link href="/admin/products" className="text-gray-400 hover:text-gray-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </Link>
          <h1 className="text-xl font-semibold text-[#333]">Карточка категории</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            className="px-3.5 py-1.5 rounded text-[12px] font-medium text-red-500 hover:bg-red-50 border border-red-200 transition-colors"
          >
            Удалить
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-admin text-white px-3.5 py-1.5 rounded text-[12px] font-medium hover:bg-admin-hover transition-colors disabled:bg-gray-400"
          >
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-[12px] px-3 py-2 rounded mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Name */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <label className="block text-[12px] font-medium text-[#555] mb-1.5">Название *</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="w-full border border-gray-200 rounded px-3 py-2 text-[13px] outline-none focus:border-admin transition-colors"
              placeholder="Название категории"
            />
          </div>

          {/* Slug */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <label className="block text-[12px] font-medium text-[#555] mb-1.5">Адрес (URL)</label>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-gray-400 shrink-0">/collection/</span>
              {slugEditing ? (
                <input
                  type="text"
                  name="slug"
                  value={form.slug}
                  onChange={handleChange}
                  onBlur={() => setSlugEditing(false)}
                  autoFocus
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-[13px] outline-none focus:border-admin"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] text-admin">{form.slug || toSlug(form.name) || '—'}</span>
                  <button
                    onClick={() => { if (!form.slug) setForm(prev => ({ ...prev, slug: toSlug(prev.name) })); setSlugEditing(true) }}
                    className="text-gray-400 hover:text-admin transition-colors"
                    title="Редактировать"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Parent category */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <label className="block text-[12px] font-medium text-[#555] mb-1.5">Находится в</label>
            <select
              name="parentId"
              value={form.parentId}
              onChange={handleChange}
              className="w-full border border-gray-200 rounded px-3 py-2 text-[13px] outline-none focus:border-admin bg-white"
            >
              <option value="">— Корневая категория —</option>
              {parentOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {'　'.repeat(opt.depth)}{opt.name}
                </option>
              ))}
            </select>
          </div>

          {/* Hidden */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="isHidden"
                checked={form.isHidden}
                onChange={handleChange}
                className="accent-admin w-4 h-4"
              />
              <span className="text-[13px] text-[#333]">Скрыть категорию</span>
            </label>
            <p className="text-[11px] text-gray-400 mt-1 ml-6">Скрытая категория не отображается на сайте</p>
          </div>

          {/* Description */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <label className="block text-[12px] font-medium text-[#555] mb-1.5">Описание</label>
            <Suspense fallback={<div className="border border-gray-200 rounded p-4 text-gray-400 text-sm">Загрузка редактора...</div>}>
              <MarkdownEditor
                value={form.description}
                onChange={(md) => setForm(prev => ({ ...prev, description: md }))}
                placeholder="Описание категории в формате Markdown..."
                rows={8}
              />
            </Suspense>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Image */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <label className="block text-[12px] font-medium text-[#555] mb-3">Изображение</label>
            {form.imageUrl ? (
              <div className="relative mb-3">
                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-50 border">
                  <Image src={form.imageUrl} alt="" fill className="object-contain" sizes="300px" />
                </div>
                <button
                  onClick={() => setForm(prev => ({ ...prev, imageUrl: '' }))}
                  className="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-full w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-500 shadow transition-colors"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-admin transition-colors"
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-admin rounded-full animate-spin" />
                    <span className="text-[12px] text-gray-500">Загрузка...</span>
                  </div>
                ) : (
                  <>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" className="mx-auto mb-2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <p className="text-[12px] text-gray-400">Нажмите для загрузки</p>
                  </>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            {form.imageUrl && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full mt-2 text-[12px] text-admin hover:text-admin-hover transition-colors"
              >
                Заменить изображение
              </button>
            )}
          </div>

          {/* Info */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <label className="block text-[12px] font-medium text-[#555] mb-2">Информация</label>
            <div className="space-y-1.5 text-[12px] text-gray-500">
              <div className="flex justify-between">
                <span>ID:</span>
                <span className="text-[#333] font-mono">{catId}</span>
              </div>
              <div className="flex justify-between">
                <span>На сайте:</span>
                <Link
                  href={`/collection/${form.slug || toSlug(form.name)}`}
                  target="_blank"
                  className="text-admin hover:underline"
                >
                  Открыть →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
