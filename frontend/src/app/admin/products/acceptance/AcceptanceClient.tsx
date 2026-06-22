'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/components/Toast'
import Link from 'next/link'

interface Product {
  id: string
  name: string
  sku: string | null
  price: number
  totalStock: number
  reservedStock: number
  costPrice: number | null
  images: { url: string }[]
}

interface BatchItem {
  id: string
  name: string
  sku: string | null
  currentStock: number
  currentCost: number | null
  quantity: number
  costPrice: number | null
  imageUrl: string | null
}

interface Supplier {
  id: string
  name: string
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU')

export default function AcceptanceClient() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  // Form inputs
  const [quantity, setQuantity] = useState<number | ''>('')
  const [costPrice, setCostPrice] = useState<number | ''>('')

  // Batch
  const [batch, setBatch] = useState<BatchItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Batch metadata
  const [batchName, setBatchName] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')

  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // CSV
  const [csvPreview, setCsvPreview] = useState<any[] | null>(null)
  const [csvNotFound, setCsvNotFound] = useState<string[]>([])
  const [csvLoading, setCsvLoading] = useState(false)
  const [showCsv, setShowCsv] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toast = useToast()
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const qtyInputRef = useRef<HTMLInputElement>(null)

  // Load suppliers
  useEffect(() => {
    fetch('/api/admin/suppliers')
      .then((r) => r.json())
      .then((d) => setSuppliers(d.suppliers || []))
      .catch(() => {})
  }, [])

  // Search logic
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([])
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(`/api/admin/products?search=${encodeURIComponent(q)}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.products || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (searchQuery.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        doSearch(searchQuery)
      }, 300)
    } else {
      setSearchResults([])
    }
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [searchQuery, doSearch])

  const selectProduct = (p: Product) => {
    setSelectedProduct(p)
    setCostPrice(p.costPrice || '')
    setQuantity(1)
    setSearchQuery('')
    setSearchResults([])
    setTimeout(() => {
      qtyInputRef.current?.focus()
      qtyInputRef.current?.select()
    }, 50)
  }

  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (searchResults.length > 0) {
        selectProduct(searchResults[0])
      } else if (searchQuery.trim().length > 0) {
        setIsSearching(true)
        try {
          const res = await fetch(`/api/admin/products?search=${encodeURIComponent(searchQuery)}&limit=5`)
          if (res.ok) {
            const data = await res.json()
            const prods = data.products || []
            if (prods.length > 0) {
              selectProduct(prods[0])
            } else {
              toast.error('Товар не найден')
            }
          }
        } catch (err) {
          console.error(err)
        } finally {
          setIsSearching(false)
        }
      }
    }
  }

  const addToBatch = () => {
    if (!selectedProduct) return
    const qtyVal = Number(quantity)
    if (isNaN(qtyVal) || qtyVal <= 0) {
      toast.error('Введите корректное количество')
      return
    }

    const costVal = costPrice === '' ? null : Number(costPrice)
    if (costVal !== null && (isNaN(costVal) || costVal < 0)) {
      toast.error('Себестоимость должна быть положительным числом')
      return
    }

    const existingIndex = batch.findIndex((item) => item.id === selectedProduct.id)
    if (existingIndex >= 0) {
      const newBatch = [...batch]
      newBatch[existingIndex].quantity += qtyVal
      if (costVal !== null) {
        newBatch[existingIndex].costPrice = costVal
      }
      setBatch(newBatch)
      toast.success(`Количество товара "${selectedProduct.name}" увеличено`)
    } else {
      setBatch([
        ...batch,
        {
          id: selectedProduct.id,
          name: selectedProduct.name,
          sku: selectedProduct.sku,
          currentStock: selectedProduct.totalStock,
          currentCost: selectedProduct.costPrice,
          quantity: qtyVal,
          costPrice: costVal,
          imageUrl: selectedProduct.images?.[0]?.url || null,
        },
      ])
      toast.success(`Товар "${selectedProduct.name}" добавлен в список`)
    }

    setSelectedProduct(null)
    setQuantity('')
    setCostPrice('')
    searchInputRef.current?.focus()
  }

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addToBatch()
    }
  }

  const removeItem = (id: string) => {
    setBatch(batch.filter((item) => item.id !== id))
  }

  const updateBatchQty = (id: string, val: string) => {
    const qty = Number(val)
    if (isNaN(qty) || qty <= 0) return
    setBatch(batch.map((item) => (item.id === id ? { ...item, quantity: qty } : item)))
  }

  const updateBatchCost = (id: string, val: string) => {
    const cost = val === '' ? null : Number(val)
    if (cost !== null && (isNaN(cost) || cost < 0)) return
    setBatch(batch.map((item) => (item.id === id ? { ...item, costPrice: cost } : item)))
  }

  // CSV upload
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvLoading(true)
    setShowCsv(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/admin/products/acceptance/csv', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setCsvPreview(data.matched || [])
      setCsvNotFound(data.notFound || [])
      toast.success(`Найдено ${data.totalMatched} из ${data.totalRows} строк`)
    } catch (err: any) {
      toast.error(err.message || 'Ошибка парсинга CSV')
      setCsvPreview(null)
    } finally {
      setCsvLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const applyCsvToBatch = () => {
    if (!csvPreview?.length) return
    const newBatch = [...batch]
    for (const item of csvPreview) {
      const existing = newBatch.findIndex((b) => b.id === item.id)
      if (existing >= 0) {
        newBatch[existing].quantity += item.quantity
        if (item.costPrice) newBatch[existing].costPrice = item.costPrice
      } else {
        newBatch.push({
          id: item.id,
          name: item.name,
          sku: item.sku,
          currentStock: item.currentStock,
          currentCost: item.currentCost,
          quantity: item.quantity,
          costPrice: item.costPrice,
          imageUrl: item.imageUrl,
        })
      }
    }
    setBatch(newBatch)
    setCsvPreview(null)
    setCsvNotFound([])
    setShowCsv(false)
    toast.success(`Добавлено ${csvPreview.length} позиций в партию`)
  }

  const handleSubmit = async () => {
    if (batch.length === 0) return
    if (!confirm(`Провести приемку ${batch.length} позиций? Остатки товаров будут обновлены во всех каналах.`)) return

    setIsSubmitting(true)
    const loader = toast.loading('Проведение приемки товаров...')
    try {
      const res = await fetch('/api/admin/products/acceptance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: batch.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            costPrice: item.costPrice,
          })),
          batchName: batchName || undefined,
          supplierId: supplierId || undefined,
          notes: notes || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        loader.resolve('Приемка успешно проведена!')
        setBatch([])
        setBatchName('')
        setNotes('')
      } else {
        loader.reject(data.error || 'Произошла ошибка при сохранении')
      }
    } catch (e: any) {
      console.error(e)
      loader.reject(e.message || 'Ошибка сети')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Summary calculations
  const totalPositions = batch.length
  const totalQuantity = batch.reduce((sum, item) => sum + item.quantity, 0)
  const totalCostAmount = batch.reduce((sum, item) => sum + item.quantity * (item.costPrice || 0), 0)

  return (
    <div className="space-y-6">
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 leading-tight">Приемка товаров</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Поступление товаров на склад, увеличение остатков и обновление себестоимости во всех каналах синхронно.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/suppliers"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Поставщики
          </Link>
          <Link
            href="/admin/products/acceptance/history"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            История приёмок
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT PANEL: SEARCH & ADD ── */}
        <div className="lg:col-span-1 space-y-6">
          {/* Batch metadata */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Данные партии</h2>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Номер / название</label>
              <input
                type="text"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:bg-white focus:border-admin focus:ring-4 focus:ring-admin/10 transition-all"
                placeholder="Напр: Поставка от 22.06"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Поставщик</label>
              <select
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:bg-white focus:border-admin focus:ring-4 focus:ring-admin/10 transition-all"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">— Не указан —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Заметки</label>
              <input
                type="text"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:bg-white focus:border-admin focus:ring-4 focus:ring-admin/10 transition-all"
                placeholder="Доп. информация"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* CSV Upload */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Импорт из CSV</h2>
            <p className="text-[11px] text-gray-400 mb-3">Формат: <code className="bg-gray-100 px-1 rounded">sku,quantity,costPrice</code></p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleCsvUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={csvLoading}
              className="w-full bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-xl py-3 text-xs font-bold text-gray-600 transition-colors"
            >
              {csvLoading ? 'Загрузка...' : '📁 Загрузить CSV файл'}
            </button>

            {/* CSV Preview */}
            {csvPreview && (
              <div className="mt-4 space-y-3">
                <div className="text-[11px] text-gray-500">
                  Найдено: <b>{csvPreview.length}</b> товаров
                  {csvNotFound.length > 0 && (
                    <span className="text-red-500 ml-2">Не найдено: {csvNotFound.length} ({csvNotFound.slice(0, 5).join(', ')}{csvNotFound.length > 5 ? '...' : ''})</span>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {csvPreview.slice(0, 20).map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] bg-gray-50 rounded-lg px-3 py-1.5">
                      <span className="text-gray-700 truncate max-w-[140px]">{item.name}</span>
                      <span className="text-gray-400 font-mono">{item.sku}</span>
                      <span className="font-bold text-gray-800">+{item.quantity} шт</span>
                    </div>
                  ))}
                  {csvPreview.length > 20 && (
                    <div className="text-[10px] text-gray-400 text-center">...и ещё {csvPreview.length - 20}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={applyCsvToBatch}
                    className="flex-1 bg-admin hover:bg-admin-hover text-white py-2 rounded-xl text-xs font-bold transition-colors"
                  >
                    Добавить в партию
                  </button>
                  <button
                    onClick={() => { setCsvPreview(null); setCsvNotFound([]); setShowCsv(false) }}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Search Product */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 relative">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Найти товар</h2>

            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <input
                ref={searchInputRef}
                type="text"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-[13px] focus:outline-none focus:bg-white focus:border-admin focus:ring-4 focus:ring-admin/10 transition-all placeholder-gray-400"
                placeholder="Поиск по названию или SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {isSearching && (
                <div className="absolute right-3 top-3 w-4 h-4 border-2 border-admin/35 border-t-admin rounded-full animate-spin" />
              )}

              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-72 overflow-y-auto divide-y divide-gray-100">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors"
                      onClick={() => selectProduct(p)}
                    >
                      {p.images?.[0]?.url ? (
                        <img src={p.images[0].url} alt="" className="w-8 h-8 rounded-lg object-cover bg-gray-50 border border-gray-100 shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-[10px] font-bold shrink-0">N/A</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-gray-800 truncate">{p.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          SKU: {p.sku || p.id} • Остаток: {p.totalStock} шт. • Цена: {fmt(p.price)} тг
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedProduct ? (
              <div className="mt-5 pt-5 border-t border-gray-100 space-y-4 animate-in fade-in duration-150">
                <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
                  {selectedProduct.images?.[0]?.url ? (
                    <img src={selectedProduct.images[0].url} alt="" className="w-12 h-12 rounded-lg object-cover bg-white border border-gray-100 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-bold shrink-0">N/A</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 leading-snug">{selectedProduct.name}</p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      SKU: <span className="font-mono text-gray-700">{selectedProduct.sku || selectedProduct.id}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-200/50">
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase font-semibold">На складе</span>
                        <p className="text-xs font-bold text-gray-700">{selectedProduct.totalStock} шт.</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase font-semibold">Себестоимость</span>
                        <p className="text-xs font-bold text-gray-700">
                          {selectedProduct.costPrice ? `${fmt(selectedProduct.costPrice)} тг` : 'не задана'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Количество к поступлению</label>
                    <input
                      ref={qtyInputRef}
                      type="number"
                      min="1"
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-admin focus:ring-4 focus:ring-admin/10 transition-all"
                      placeholder="Например: 10"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value)))}
                      onKeyDown={handleFormKeyDown}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Новая себестоимость (тг, опционально)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-admin focus:ring-4 focus:ring-admin/10 transition-all"
                      placeholder={selectedProduct.costPrice ? `Текущая: ${selectedProduct.costPrice}` : 'Введите себестоимость...'}
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                      onKeyDown={handleFormKeyDown}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={addToBatch}
                    className="flex-1 bg-admin hover:bg-admin-hover text-white py-2.5 rounded-xl text-xs font-bold transition-colors shadow-md shadow-admin/10"
                  >
                    Добавить в список
                  </button>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-8 text-center py-6 border border-dashed border-gray-200 rounded-xl">
                <p className="text-xs text-gray-400">Найдите товар выше или загрузите CSV</p>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: BATCH ITEMS TABLE ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Позиций</p>
              <p className="text-xl font-bold text-gray-900 leading-none">{totalPositions}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Всего товаров</p>
              <p className="text-xl font-bold text-gray-900 leading-none">{totalQuantity} шт.</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Сумма закупки</p>
              <p className="text-xl font-bold text-gray-900 leading-none">{fmt(totalCostAmount)} тг</p>
            </div>
          </div>

          {/* Batch Table Card */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col min-h-[400px]">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Товары в текущей приемке</h2>
              {batch.length > 0 && (
                <button
                  onClick={() => { if (confirm('Очистить список?')) setBatch([]) }}
                  className="text-[11px] font-bold text-red-500 hover:text-red-600 transition-colors"
                >
                  Очистить список
                </button>
              )}
            </div>

            {batch.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                </svg>
                <p className="text-[13px] font-medium text-gray-500">Список приемки пуст</p>
                <p className="text-[11px] text-gray-400 mt-1 max-w-[280px]">
                  Найдите товары вручную или загрузите CSV-файл для массовой приёмки.
                </p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        <th className="py-3 px-4">Товар</th>
                        <th className="py-3 px-4 text-center">Текущий склад</th>
                        <th className="py-3 px-4 text-center w-28">Количество</th>
                        <th className="py-3 px-4 text-center">Итоговый склад</th>
                        <th className="py-3 px-4 text-center w-36">Себестоимость (тг)</th>
                        <th className="py-3 px-4 text-right">Сумма (тг)</th>
                        <th className="py-3 px-4 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[13px]">
                      {batch.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-50 border border-gray-100 shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-[9px] font-bold shrink-0">N/A</div>
                              )}
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800 truncate max-w-[180px] md:max-w-[240px]">{item.name}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">SKU: {item.sku || item.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center text-gray-500">{item.currentStock} шт.</td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              min="1"
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-center font-bold text-gray-800 text-[12px] focus:outline-none focus:bg-white focus:border-admin transition-all"
                              value={item.quantity}
                              onChange={(e) => updateBatchQty(item.id, e.target.value)}
                            />
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-green-600">{item.currentStock + item.quantity} шт.</td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              min="0"
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-center text-gray-700 text-[12px] focus:outline-none focus:bg-white focus:border-admin transition-all"
                              value={item.costPrice === null ? '' : item.costPrice}
                              onChange={(e) => updateBatchCost(item.id, e.target.value)}
                              placeholder={item.currentCost ? String(item.currentCost) : '0'}
                            />
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-gray-700">{fmt(item.quantity * (item.costPrice || 0))}</td>
                          <td className="py-3 px-4 text-center">
                            <button onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50" title="Удалить">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <div className="text-[12px] text-gray-500">
                    {batchName && <span className="font-semibold text-gray-700">«{batchName}»</span>}
                    {supplierId && <span className="ml-2 text-gray-400">· Поставщик: {suppliers.find((s) => s.id === supplierId)?.name}</span>}
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="bg-admin hover:bg-admin-hover disabled:bg-admin/50 text-white px-6 py-3 rounded-xl text-xs font-bold transition-all shadow-md shadow-admin/15 flex items-center gap-2"
                  >
                    {isSubmitting && <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                    Провести приемку
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
