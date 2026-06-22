'use client'

import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor'))
import KaspiSection from './KaspiSection'

interface Category {
  id: string
  name: string
  slug: string
  parentId: string | null
  isHidden: boolean
}

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

export default function AdminProductEditPage() {
  const router = useRouter()
  const params = useParams()
  const isNew = params.id === 'new'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [createdAt, setCreatedAt] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set())
  const [historyModal, setHistoryModal] = useState<'price' | 'stock' | null>(null)
  const [historyData, setHistoryData] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null)

  // Модель «1 карточка = 1 товар»: цена/остаток/SKU — прямые поля товара.
  // Под капотом сохраняем один технический ProductVariant (SKU для каналов).
  const [form, setForm] = useState({
    id: '',
    name: '',
    slug: '',
    description: '',
    categoryId: '',
    inStock: true,
    metaTitle: '',
    metaDescription: '',
    badgeText: '',
    price: '',
    oldPrice: '',
    costPrice: '',
    weight: '',
    totalStock: '0',
    sku: '',
    variantId: '' as string, // id существующего тех-варианта (если есть)
  })
  // Бронь под незавершённые заказы маркетплейсов (Kaspi). Только для показа:
  // «доступно = склад − бронь». Не редактируется и не отправляется на сохранение —
  // управляется синками каналов (kaspi-sync). Сайт списывает
  // totalStock напрямую, в reservedStock не пишет.
  const [reservedStock, setReservedStock] = useState(0)

  useEffect(() => {
    fetch('/api/admin/categories')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() })
      .then(data => setCategories(data.categories || data || []))
      .catch(() => {})

    if (!isNew) {
      fetch(`/api/admin/products/${params.id}`)
        .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() })
        .then(product => {
          // 1 карточка = 1 товар: все поля на Product (ProductVariant удалён).
          setForm({
            id: product.id,
            name: product.name,
            slug: product.slug,
            description: product.description || '',
            categoryId: product.categoryId || '',
            inStock: product.inStock,
            metaTitle: product.metaTitle || '',
            metaDescription: product.metaDescription || '',
            badgeText: product.badgeText || '',
            price: product.price?.toString() || '',
            oldPrice: product.oldPrice?.toString() || '',
            costPrice: product.costPrice?.toString() || '',
            weight: product.weight?.toString() || '',
            totalStock: product.totalStock?.toString() || '0',
            sku: product.sku ?? '',
            variantId: '',
          })
          setReservedStock(product.reservedStock || 0)
          setImages(product.images?.map((img: any) => img.url) || [])
          // Load multi-categories
          if (product.categories?.length > 0) {
            setSelectedCategoryIds(new Set(product.categories.map((c: any) => c.id)))
          } else if (product.categoryId) {
            setSelectedCategoryIds(new Set([product.categoryId]))
          }
          setCreatedAt(product.createdAt || '')
          setUpdatedAt(product.updatedAt || '')
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [isNew, params.id])

  // Скрыть индикатор «Сохранено» через несколько секунд.
  useEffect(() => {
    if (!savedAt) return
    const t = setTimeout(() => setSavedAt(null), 3000)
    return () => clearTimeout(t)
  }, [savedAt])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (type === 'checkbox') {
      setForm(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }))
    } else if (name === 'totalStock') {
      // Автопереключение «На сайте» по остатку: >0 → показать, =0 → скрыть.
      // Тумблер inStock остаётся ручным — его можно переключить после.
      const stock = parseInt(value) || 0
      setForm(prev => ({ ...prev, totalStock: value, inStock: stock > 0 }))
    } else {
      setForm(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')
    try {
      const newUrls: string[] = []
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/admin/products/upload', { method: 'POST', body: formData })
        if (!res.ok) throw new Error('Upload failed')
        const data = await res.json()
        newUrls.push(data.url)
      }
      setImages(prev => [...prev, ...newUrls])
    } catch (err: any) {
      setError(err.message)
    }
    setUploading(false)
  }

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const moveImage = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= images.length) return
    setImages(prev => {
      const arr = [...prev]
      ;[arr[index], arr[newIndex]] = [arr[newIndex], arr[index]]
      return arr
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files)
  }

  const handleImageDragStart = (e: React.DragEvent, index: number) => {
    setDraggingIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  const handleImageDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggingIndex !== null && draggingIndex !== index) setDragOverIndex(index)
  }

  const handleImageDropReorder = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggingIndex === null || draggingIndex === targetIndex) {
      setDraggingIndex(null)
      setDragOverIndex(null)
      return
    }
    setImages(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(draggingIndex, 1)
      arr.splice(targetIndex, 0, moved)
      return arr
    })
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  const handleImageDragEnd = () => {
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  // Category tree builder
  const buildTree = (parentId: string | null, depth: number): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = []
    const children = categories.filter(c => c.parentId === parentId)
    for (const c of children) {
      result.push({ id: c.id, name: c.name, depth })
      result.push(...buildTree(c.id, depth + 1))
    }
    return result
  }
  const categoryTree = buildTree(null, 0)

  const openHistory = async (type: 'price' | 'stock') => {
    setHistoryModal(type)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/admin/products/${params.id}/history?field=${type}`)
      if (res.ok) setHistoryData(await res.json())
    } catch {}
    setHistoryLoading(false)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Введите название'); return }
    setError('')
    setSaving(true)
    try {
      const slug = form.slug || toSlug(form.name)
      const catIds = Array.from(selectedCategoryIds)
      // 1 карточка = 1 товар: sku/price/cost/weight/stock — поля Product (вариантов нет).
      const res = await fetch('/api/admin/products', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          name: form.name,
          slug,
          description: form.description,
          price: form.price || '0',
          oldPrice: form.oldPrice || '',
          costPrice: form.costPrice || '',
          sku: form.sku || null,
          categoryId: catIds[0] || null,
          categoryIds: catIds,
          inStock: form.inStock,
          totalStock: form.totalStock || '0',
          weight: form.weight || '',
          metaTitle: form.metaTitle,
          metaDescription: form.metaDescription,
          badgeText: form.badgeText.trim() || null,
          images,
          variantAttributes: [],
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        let msg = 'Ошибка сохранения'
        try { msg = JSON.parse(text).error || msg } catch {}
        throw new Error(msg)
      }
      const saved = await res.json().catch(() => null)
      if (isNew && saved?.id) {
        // Новый товар создан → переходим на его страницу редактирования,
        // чтобы дальнейшие сохранения шли как PUT, без ухода в список.
        router.replace(`/admin/products/${saved.id}`)
      } else {
        // Существующий товар → остаёмся на странице, показываем подтверждение.
        setSavedAt(Date.now())
      }
    } catch (err: any) {
      setError(err.message)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!confirm('Удалить этот товар?')) return
    try {
      const res = await fetch('/api/admin/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: form.id }),
      })
      // ВАЖНО: проверяем ответ. Раньше редиректили всегда — при ошибке (напр. 409
      // «есть продажи на сайте») товар оставался, а юзер видел «не удаляется» без причины.
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || `Не удалось удалить (ошибка ${res.status})`)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      router.push('/admin/products')
    } catch {
      setError('Ошибка удаления (нет связи с сервером)')
    }
  }

  // Дублировать товар: спрашиваем название и новый артикул, остальное копирует сервер.
  const [duplicating, setDuplicating] = useState(false)
  const handleDuplicate = async () => {
    const name = window.prompt('Название дубликата:', `${form.name} (копия)`)
    if (name === null) return
    if (!name.trim()) { alert('Название не может быть пустым'); return }
    const sku = window.prompt('Новый артикул (пусто = без артикула):', '')
    if (sku === null) return // отмена
    setDuplicating(true)
    try {
      const res = await fetch(`/api/admin/products/${form.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), sku: sku.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { alert(d.error || `Ошибка ${res.status}`); return }
      // переходим в редактор созданного дубликата
      router.push(`/admin/products/${d.id}`)
    } catch {
      alert('Ошибка дублирования (нет связи с сервером)')
    } finally {
      setDuplicating(false)
    }
  }

  const formatDate = (d: string) => {
    if (!d) return '—'
    const date = new Date(d)
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ', ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-gray-200 rounded-full" />
            <div className="h-5 bg-gray-200 rounded w-52" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-20 bg-gray-200 rounded" />
            <div className="h-8 w-24 bg-admin/20 rounded" />
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-5">
          <div className="flex-1 min-w-0 space-y-5">
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-5">
              <div className="h-4 bg-gray-200 rounded w-20" />
              <div className="flex gap-3">
                {[0,1,2].map(i => <div key={i} className="w-[120px] h-[120px] bg-gray-200 rounded-xl shrink-0" />)}
                <div className="w-[120px] h-[120px] bg-gray-100 rounded-xl border-2 border-dashed border-gray-200 shrink-0" />
              </div>
              <div>
                <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
                <div className="h-9 bg-gray-200 rounded" />
              </div>
              <div>
                <div className="h-3 bg-gray-200 rounded w-16 mb-2" />
                <div className="h-48 bg-gray-100 rounded border border-gray-200" />
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="h-4 bg-gray-200 rounded w-36 mb-4" />
              <div className="grid grid-cols-3 gap-3">
                {[0,1,2].map(i => <div key={i} className="h-9 bg-gray-200 rounded" />)}
              </div>
            </div>
          </div>
          <div className="w-full lg:w-[280px] shrink-0 space-y-5">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
              <div className="space-y-2">
                {[0,1,2,3,4].map(i => <div key={i} className="h-4 bg-gray-100 rounded" />)}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="h-4 bg-gray-200 rounded w-20 mb-3" />
              <div className="h-8 bg-gray-100 rounded" />
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="h-4 bg-gray-200 rounded w-28 mb-3" />
              <div className="space-y-2">
                <div className="h-7 bg-gray-100 rounded" />
                <div className="h-16 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header — like InSales: back + title on left, actions dropdown on right */}
      <div className="flex items-center justify-between mb-5 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin/products" className="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </Link>
          <h1 className="text-[17px] font-semibold text-[#333] truncate">
            {isNew ? 'Новый товар' : form.name}
          </h1>
          {!isNew && form.slug && (
            <a
              href={`/product/${form.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Открыть товар на сайте в новой вкладке"
              className="shrink-0 inline-flex items-center gap-1 text-[12px] text-admin hover:text-admin-hover hover:underline"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              на сайте
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          {savedAt && !saving && (
            <span className="flex items-center gap-1 text-[13px] text-green-600 font-medium">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Сохранено
            </span>
          )}
          {!isNew && (
            <button
              onClick={handleDuplicate}
              disabled={duplicating}
              className="px-3.5 py-1.5 rounded text-[13px] font-medium text-admin hover:bg-admin/5 border border-admin/30 transition-colors disabled:opacity-50"
              title="Создать копию товара (спросит название и артикул)"
            >
              {duplicating ? 'Дублирую…' : '⧉ Дублировать'}
            </button>
          )}
          {!isNew && (
            <button
              onClick={handleDelete}
              className="px-3.5 py-1.5 rounded text-[13px] font-medium text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors"
            >
              Удалить
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-admin text-white px-4 py-1.5 rounded text-[13px] font-medium hover:bg-admin-hover transition-colors disabled:bg-gray-400 flex items-center gap-1.5"
          >
            {saving && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-[13px] px-4 py-2.5 rounded-lg mb-4">{error}</div>
      )}

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left column — main form */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* ═══ О товаре ═══ */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <span className="text-[15px] font-semibold text-[#333]">О товаре</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div className="p-5 space-y-5">

              {/* Медиа */}
              <div>
                <label className="block text-[13px] text-[#555] mb-2">Медиа</label>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFileUpload(e.target.files)} />
                {/* Horizontal scrollable strip */}
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                  {images.map((url, index) => (
                    <div
                      key={index}
                      className={`shrink-0 w-[112px] transition-opacity select-none ${draggingIndex === index ? 'opacity-25' : 'opacity-100'}`}
                      draggable
                      onDragStart={e => handleImageDragStart(e, index)}
                      onDragOver={e => handleImageDragOver(e, index)}
                      onDrop={e => handleImageDropReorder(e, index)}
                      onDragEnd={handleImageDragEnd}
                    >
                      <div
                        className={`relative w-[112px] h-[112px] border-2 rounded-xl overflow-hidden bg-gray-50 cursor-grab active:cursor-grabbing transition-all group
                          ${dragOverIndex === index
                            ? 'border-admin ring-2 ring-admin/20 scale-[1.04] shadow-lg'
                            : index === 0
                              ? 'border-admin/40'
                              : 'border-gray-200 hover:border-gray-300'}
                        `}
                        onClick={() => setLightboxIndex(index)}
                      >
                        <Image src={url} alt="" fill className="object-contain p-2" sizes="112px" />
                        {/* delete button — visible on hover */}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setConfirmDeleteIndex(index) }}
                          className="absolute top-1.5 right-1.5 w-6 h-6 bg-white/95 text-gray-400 hover:bg-red-500 hover:text-white rounded-full shadow border border-gray-200 hover:border-transparent flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 z-10 text-[13px] leading-none"
                        >×</button>
                        {/* first = main badge */}
                        {index === 0 && (
                          <div className="absolute bottom-0 inset-x-0 bg-admin text-white text-[10px] font-medium text-center py-0.5">
                            Главное
                          </div>
                        )}
                      </div>
                      {index !== 0 && (
                        <div className="mt-1 text-center text-[11px] text-gray-400">{`Фото ${index + 1}`}</div>
                      )}
                    </div>
                  ))}

                  {/* Upload button */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                    onDrop={handleDrop}
                    className="shrink-0 w-[112px] h-[112px] border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-admin hover:bg-blue-50/50 transition-colors"
                  >
                    {uploading ? (
                      <div className="w-5 h-5 border-2 border-gray-300 border-t-admin rounded-full animate-spin" />
                    ) : (
                      <>
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                        <span className="text-[11px] text-gray-400 font-medium">Добавить</span>
                      </>
                    )}
                  </div>
                </div>
                {images.length > 1 && (
                  <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l3-3-3-3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
                    Перетащи для изменения порядка
                  </p>
                )}
              </div>

              {/* Наименование */}
              <div>
                <label className="block text-[13px] text-[#555] mb-1.5">Наименование*</label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-[14px] outline-none focus:border-admin transition-colors"
                  placeholder="Название товара"
                />
              </div>

              {/* Описание — Markdown editor */}
              <div>
                <label className="block text-[13px] text-[#555] mb-1.5">Описание</label>
                <Suspense fallback={<div className="border border-gray-200 rounded p-4 text-gray-400 text-sm">Загрузка редактора...</div>}>
                  <MarkdownEditor
                    value={form.description}
                    onChange={(md) => setForm(prev => ({ ...prev, description: md }))}
                    placeholder="Описание товара в формате Markdown..."
                    rows={18}
                  />
                </Suspense>
              </div>
            </div>
          </div>

          {/* ═══ Цены и склад ═══ */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <span className="text-[15px] font-semibold text-[#333]">Цены и склад</span>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[12px] text-[#999] mb-1">Цена*</label>
                  <input type="number" step="0.01" name="price" value={form.price} onChange={handleChange}
                    className="w-full border border-gray-200 rounded px-3 py-2 text-[14px] outline-none focus:border-admin transition-colors" />
                </div>
                <div>
                  <label className="block text-[12px] text-[#999] mb-1">Цена до скидки</label>
                  <input type="number" step="0.01" name="oldPrice" value={form.oldPrice} onChange={handleChange}
                    className="w-full border border-gray-200 rounded px-3 py-2 text-[14px] outline-none focus:border-admin transition-colors" />
                </div>
                <div>
                  <label className="block text-[12px] text-[#999] mb-1">Себестоимость</label>
                  <input type="number" step="0.01" name="costPrice" value={form.costPrice} onChange={handleChange} placeholder="0.00"
                    className="w-full border border-gray-200 rounded px-3 py-2 text-[14px] outline-none focus:border-admin transition-colors" />
                </div>
                <div>
                  <label className="block text-[12px] text-[#999] mb-1">Остаток</label>
                  <input type="number" name="totalStock" value={form.totalStock} onChange={handleChange}
                    className="w-full border border-gray-200 rounded px-3 py-2 text-[14px] outline-none focus:border-admin transition-colors" />
                  {/* Бронь под незавершённые заказы маркетплейсов (Kaspi):
                      на сайте доступно = склад − бронь. Поле выше = физический склад. */}
                  {reservedStock > 0 && (
                    <p className="mt-1 text-[12px] text-amber-600">
                      На сайте доступно: <b>{Math.max(0, (parseInt(form.totalStock) || 0) - reservedStock)}</b>
                      {' · '}в брони: <b>{reservedStock}</b>
                      <span className="text-[#999]"> (незавершённые заказы)</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[12px] text-[#999] mb-1">Артикул (SKU)</label>
                  <input type="text" name="sku" value={form.sku} onChange={handleChange}
                    className="w-full border border-gray-200 rounded px-3 py-2 text-[14px] outline-none focus:border-admin transition-colors" />
                </div>
                <div>
                  <label className="block text-[12px] text-[#999] mb-1">Вес (кг)</label>
                  <input type="number" step="0.01" name="weight" value={form.weight} onChange={handleChange} placeholder="0.00"
                    className="w-full border border-gray-200 rounded px-3 py-2 text-[14px] outline-none focus:border-admin transition-colors" />
                </div>
              </div>

              {/* Наклейка на карточке (зелёный бейдж рядом со скидкой). Напр. для
                  растаможенных товаров с НДС — преимущество для B2B. Пусто → нет наклейки. */}
              <div className="mt-4">
                <label className="block text-[12px] text-[#999] mb-1">Наклейка на карточке</label>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="text"
                    name="badgeText"
                    value={form.badgeText}
                    onChange={handleChange}
                    maxLength={24}
                    placeholder="напр. С НДС · растаможен"
                    className="flex-1 min-w-[220px] border border-gray-200 rounded px-3 py-2 text-[14px] outline-none focus:border-admin transition-colors"
                  />
                  {form.badgeText.trim() && (
                    <span className="bg-[#16A34A] text-white text-xs font-semibold px-2 py-0.5 rounded shadow-sm whitespace-nowrap">
                      {form.badgeText.trim()}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-[#999]">
                  Зелёный бейдж в углу карточки (рядом со скидкой). Для официально растаможенных
                  товаров с НДС / признаком происхождения 2 — плюс для B2B. Пусто → наклейки нет.
                </p>
              </div>
            </div>
          </div>


          {/* ═══ Характеристики (placeholder like InSales) ═══ */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <span className="text-[15px] font-semibold text-[#333]">Характеристики</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div className="p-5">
              <p className="text-[13px] text-gray-400 mb-3">
                Характеристики используются для фильтрации в каталоге товаров и отображаются на карточке товара на сайте.
              </p>
              <div className="flex gap-2">
                <button type="button" className="text-[13px] text-admin hover:text-admin-hover font-medium">Добавить</button>
              </div>
            </div>
          </div>

          {/* ═══ Kaspi.kz ═══ */}
          <KaspiSection productId={form.id || (params.id as string)} isNew={isNew} />

        </div>

        {/* Right column — sidebar (like InSales) */}
        <div className="w-full lg:w-[280px] shrink-0 space-y-5">

          {/* ═══ Расположение ═══ */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-[#333]">Расположение</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div className="p-4 space-y-3">
              {/* Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[#555]">На сайте</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    name="inStock"
                    checked={form.inStock}
                    onChange={handleChange}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-checked:bg-admin rounded-full transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                </label>
                <span className="text-[12px] text-gray-400">{form.inStock ? 'Показывать' : 'Скрыт'}</span>
              </div>

              {/* Category tree with checkboxes (multi-select like InSales) */}
              <div className="border-t border-gray-100 pt-3">
                <div className="max-h-[250px] overflow-y-auto space-y-0.5">
                  {categoryTree.map(opt => (
                    <label key={opt.id} className="flex items-center gap-2 py-0.5 cursor-pointer" style={{ paddingLeft: `${opt.depth * 16}px` }}>
                      <input
                        type="checkbox"
                        checked={selectedCategoryIds.has(opt.id)}
                        onChange={() => {
                          setSelectedCategoryIds(prev => {
                            const next = new Set(prev)
                            if (next.has(opt.id)) next.delete(opt.id)
                            else next.add(opt.id)
                            return next
                          })
                        }}
                        className="accent-admin w-3.5 h-3.5 shrink-0 rounded"
                      />
                      <span className={`text-[12px] ${selectedCategoryIds.has(opt.id) ? 'text-[#333] font-medium' : 'text-[#555]'}`}>
                        {opt.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ На складе ═══ */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-[14px] font-semibold text-[#333]">На складе</span>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#555]">Склад:</span>
                <span className="bg-gray-100 px-2.5 py-0.5 rounded text-[12px] text-[#333] font-medium">
                  {form.totalStock}
                </span>
              </div>
            </div>
          </div>

          {/* ═══ Данные товара ═══ */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-[#333]">Данные товара</span>
              <button type="button" className="text-[12px] text-admin hover:text-admin-hover">Настроить</button>
            </div>
            <div className="p-4 space-y-2 text-[12px]">
              {!isNew && (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#999]">Дата создания:</span>
                    <span className="text-[#333]">{formatDate(createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#999]">Дата изменения:</span>
                    <span className="text-[#333]">{formatDate(updatedAt)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-[#999]">Валюта:</span>
                <span className="text-[#333]">Казахстанский Тенге (тг.)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999]">Требует доставки:</span>
                <span className="text-[#333]">Да</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999]">Единица измерения:</span>
                <span className="text-[#333]">шт</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999]">Количество в единице:</span>
                <span className="text-[#333]">—</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#999]">Набор товаров:</span>
                <span className="text-[#333]">—</span>
              </div>

              {/* Slug */}
              <div className="border-t border-gray-100 pt-2 mt-2">
                <div className="text-[#999] mb-1">URL (slug):</div>
                <div className="flex items-start gap-1.5">
                  <input
                    type="text"
                    name="slug"
                    value={form.slug}
                    onChange={handleChange}
                    placeholder={toSlug(form.name) || 'slug'}
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-[11px] outline-none focus:border-admin text-admin min-w-0"
                  />
                </div>
              </div>

              {/* Links */}
              {!isNew && (
                <div className="border-t border-gray-100 pt-2 mt-2 space-y-1">
                  <button
                    onClick={() => openHistory('price')}
                    className="block text-[12px] text-admin hover:underline"
                  >
                    История изменений цен
                  </button>
                  <button
                    onClick={() => openHistory('stock')}
                    className="block text-[12px] text-admin hover:underline"
                  >
                    История изменения остатков
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ═══ Поисковые сервисы (SEO) — in sidebar like InSales ═══ */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-[#333]">Поисковые сервисы (SEO)</span>
              <button type="button" className="text-[12px] text-admin hover:text-admin-hover">Настроить</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[12px] text-[#999] mb-1">Meta Title</label>
                <input
                  type="text"
                  name="metaTitle"
                  value={form.metaTitle}
                  onChange={handleChange}
                  className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] outline-none focus:border-admin transition-colors"
                  placeholder="Заголовок страницы"
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#999] mb-1">Meta Description</label>
                <textarea
                  name="metaDescription"
                  value={form.metaDescription}
                  onChange={handleChange}
                  rows={3}
                  className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] outline-none focus:border-admin transition-colors resize-y"
                  placeholder="Описание страницы"
                />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* History Modal */}
      {historyModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-[10vh]" onClick={() => setHistoryModal(null)}>
          <div className="bg-white rounded-lg shadow-xl w-[calc(100%-2rem)] max-w-[700px] mx-4 max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[#333]">
                {historyModal === 'price' ? 'История изменений цен' : 'История изменения остатков'}
              </h3>
              <button onClick={() => setHistoryModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {historyLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-admin rounded-full animate-spin" />
                </div>
              ) : historyData.length === 0 ? (
                <div className="text-center text-gray-400 py-10 text-[13px]">Нет записей</div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] text-gray-400 border-b">
                      <th className="pb-2 font-medium">Дата</th>
                      <th className="pb-2 font-medium">{historyModal === 'price' ? 'Цена' : 'Количество'}</th>
                      <th className="pb-2 font-medium">Источник изменения</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.map((log: any) => (
                      <tr key={log.id} className="border-b border-gray-50">
                        <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                          {new Date(log.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <span className="text-red-400 line-through mr-1">{historyModal === 'price' ? `${log.oldValue.toLocaleString()} тг` : log.oldValue}</span>
                          <span className="text-gray-400 mx-1">&rarr;</span>
                          <span className="font-semibold text-[#333]">{historyModal === 'price' ? `${log.newValue.toLocaleString()} тг` : log.newValue}</span>
                        </td>
                        <td className="py-3 text-gray-600">
                          <div>
                            <span className="font-medium">
                              {log.field === 'price' && `Цена изменилась с ${log.oldValue.toLocaleString()} на ${log.newValue.toLocaleString()}`}
                              {log.field === 'oldPrice' && `Старая цена изменилась с ${log.oldValue.toLocaleString()} на ${log.newValue.toLocaleString()}`}
                              {log.field === 'totalStock' && `Остаток изменился с ${log.oldValue} на ${log.newValue}`}
                              {log.field === 'stock' && `Остаток варианта изменился с ${log.oldValue} на ${log.newValue}`}
                            </span>
                          </div>
                          {log.detail && <div className="text-admin text-[12px]">{log.detail}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete photo */}
      {confirmDeleteIndex !== null && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setConfirmDeleteIndex(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-72 mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              </div>
              <h3 className="text-[15px] font-semibold text-[#333] text-center mb-1">Удалить фото?</h3>
              <p className="text-[12px] text-gray-400 text-center mb-4">Фото будет удалено из списка. Отменить нельзя.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteIndex(null)}
                  className="flex-1 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeImage(confirmDeleteIndex)
                    setConfirmDeleteIndex(null)
                  }}
                  className="flex-1 py-2 text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img
              src={images[lightboxIndex]}
              alt=""
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            />
            {/* Close */}
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full text-gray-700 shadow-lg flex items-center justify-center hover:bg-gray-100 text-lg font-medium"
            >×</button>
            {/* Prev */}
            {lightboxIndex > 0 && (
              <button
                type="button"
                onClick={() => setLightboxIndex(lightboxIndex - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full shadow flex items-center justify-center hover:bg-white text-gray-700"
              >‹</button>
            )}
            {/* Next */}
            {lightboxIndex < images.length - 1 && (
              <button
                type="button"
                onClick={() => setLightboxIndex(lightboxIndex + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full shadow flex items-center justify-center hover:bg-white text-gray-700"
              >›</button>
            )}
            {/* Counter */}
            {images.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[12px] px-2.5 py-1 rounded-full">
                {lightboxIndex + 1} / {images.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
