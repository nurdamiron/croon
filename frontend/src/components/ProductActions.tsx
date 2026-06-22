'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { addToCart, decrementItem, getItemQuantity, toggleFavorite, isFavorite, trackViewed } from '@/lib/cart'
import { formatPrice, getDiscount } from '@/lib/format'
import PhoneInput from '@/components/PhoneInput'

export interface VariantData {
  id: string
  sku?: string | null
  price: number
  oldPrice?: number | null
  stock: number
  available: boolean
  title?: string | null
  attributes: Record<string, string>
}

interface ProductActionsProps {
  product: {
    id: string
    name: string
    slug: string
    price: number
    oldPrice?: number | null
    image: string
    inStock: boolean
    totalStock?: number
    sku?: string
  }
  variants?: VariantData[]
  variantAttributes?: string[]
}

const NAME_AXIS = 'Вариант'

export function ProductActions({ product, variants: rawVariants = [], variantAttributes: rawAttributes = [] }: ProductActionsProps) {
  // Fallback: если оси вариантов не заданы, но вариантов больше одного,
  // показываем выбор по «Названию» варианта (синтетическая ось «Вариант»).
  const useNameAxis = rawAttributes.length === 0 && rawVariants.length > 1
  const variantAttributes = useNameAxis ? [NAME_AXIS] : rawAttributes
  const variants: VariantData[] = useNameAxis
    ? rawVariants.map((v, i) => ({
        ...v,
        attributes: { ...v.attributes, [NAME_AXIS]: v.title?.trim() || v.sku || `Вариант ${i + 1}` },
      }))
    : rawVariants

  const hasVariants = variantAttributes.length > 0 && variants.length > 0

  // Selected attribute values per axis: { "Цвет": "Красный", "Размер": "M" }
  const [selected, setSelected] = useState<Record<string, string>>({})

  // Derive the active variant from selected attributes
  const activeVariant: VariantData | null = hasVariants
    ? variants.find(v =>
        variantAttributes.every(attr => v.attributes[attr] === selected[attr])
      ) ?? null
    : null

  // For cart: when no variant system, use product-level key
  const activeVariantId = activeVariant?.id
  const activeVariantTitle = activeVariant
    ? (activeVariant.title || variantAttributes.map(a => activeVariant.attributes[a]).filter(Boolean).join(' / '))
    : undefined

  const [qty, setQty] = useState(0)
  const [fav, setFav] = useState(false)

  useEffect(() => {
    const update = () => setQty(getItemQuantity(product.id, activeVariantId))
    const updateFav = () => setFav(isFavorite(product.id))
    update()
    updateFav()
    trackViewed(product.id)
    window.addEventListener('cart-updated', update)
    window.addEventListener('favorites-updated', updateFav)
    return () => {
      window.removeEventListener('cart-updated', update)
      window.removeEventListener('favorites-updated', updateFav)
    }
  }, [product.id, activeVariantId])

  // Effective price/stock/inStock: variant overrides product
  const effectivePrice = activeVariant ? activeVariant.price : product.price
  const effectiveOldPrice = activeVariant ? activeVariant.oldPrice : product.oldPrice
  const effectiveStock = activeVariant ? activeVariant.stock : (product.totalStock ?? 0)
  const effectiveInStock = activeVariant ? activeVariant.available : product.inStock

  const discount = effectiveOldPrice && effectiveOldPrice > effectivePrice
    ? getDiscount(effectiveOldPrice, effectivePrice)
    : 0

  // Price range across all variants (shown before selection)
  const priceRange = hasVariants && !activeVariant ? (() => {
    const prices = variants.filter(v => v.available).map(v => v.price)
    if (prices.length === 0) return null
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    return min === max ? null : { min, max }
  })() : null

  // Stock count for a specific axis value (shown as badge on chips)
  const getValueStock = (axis: string, value: string): number => {
    return variants
      .filter(v => v.attributes[axis] === value && v.available)
      .reduce((sum, v) => sum + v.stock, 0)
  }

  const maxQty = effectiveStock > 0 ? effectiveStock : 999
  const canAdd = qty < maxQty
  // Must have all axes selected before adding to cart
  const allSelected = !hasVariants || variantAttributes.every(attr => selected[attr])

  // Pre-order modal
  const [showModal, setShowModal] = useState(false)
  const [preorderName, setPreorderName] = useState('')
  const [preorderPhone, setPreorderPhone] = useState('')
  const [preorderLoading, setPreorderLoading] = useState(false)
  const [preorderDone, setPreorderDone] = useState(false)
  const [preorderError, setPreorderError] = useState('')

  const handleAdd = () => {
    if (!canAdd || !allSelected) return
    addToCart({
      productId: product.id,
      variantId: activeVariantId,
      variantTitle: activeVariantTitle,
      name: product.name,
      slug: product.slug,
      price: effectivePrice,
      image: product.image,
      sku: activeVariant?.sku ?? product.sku,
    })
  }

  const handleMinus = () => decrementItem(product.id, activeVariantId)
  const handleToggleFav = () => toggleFavorite(product.id)

  const handlePreorderSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPreorderError('')
    setPreorderLoading(true)
    try {
      const res = await fetch('/api/preorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, name: preorderName, phone: preorderPhone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      setPreorderDone(true)
    } catch (err: any) {
      setPreorderError(err.message)
    } finally {
      setPreorderLoading(false)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setPreorderDone(false)
    setPreorderName('')
    setPreorderPhone('')
    setPreorderError('')
  }

  // Get available values for each axis, given current selections of previous axes
  const getAvailableValues = (axis: string): string[] => {
    const axisIndex = variantAttributes.indexOf(axis)
    const prevAxes = variantAttributes.slice(0, axisIndex)
    const filtered = variants.filter(v =>
      prevAxes.every(a => !selected[a] || v.attributes[a] === selected[a])
    )
    const seen = new Set<string>()
    const values: string[] = []
    for (const v of filtered) {
      const val = v.attributes[axis]
      if (val && !seen.has(val)) { seen.add(val); values.push(val) }
    }
    return values
  }

  // Is a specific value available (has stock) given current selections
  const isValueAvailable = (axis: string, value: string): boolean => {
    const testSelected = { ...selected, [axis]: value }
    return variants.some(v =>
      variantAttributes.every(a => !testSelected[a] || v.attributes[a] === testSelected[a]) &&
      v.available
    )
  }

  return (
    <div>
      {/* Variant selector */}
      {hasVariants && (
        <div className="mb-5 space-y-4">
          {variantAttributes.map((axis, axisIdx) => {
            const values = getAvailableValues(axis)
            if (values.length === 0) return null
            const isAxisReady = axisIdx === 0 || variantAttributes.slice(0, axisIdx).every(a => selected[a])
            return (
              <div key={axis}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-700">{axis}:</span>
                  {selected[axis]
                    ? <span className="text-sm font-semibold text-gray-900">{selected[axis]}</span>
                    : <span className="text-sm text-gray-400">не выбран</span>
                  }
                </div>
                <div className="flex flex-wrap gap-2">
                  {values.map(value => {
                    const isActive = selected[axis] === value
                    const inStock = isValueAvailable(axis, value)
                    const stockCount = getValueStock(axis, value)
                    return (
                      <button
                        key={value}
                        title={!inStock ? 'Нет в наличии' : stockCount > 0 ? `В наличии: ${stockCount} шт.` : ''}
                        onClick={() => {
                          setSelected(prev => {
                            const next = { ...prev, [axis]: value }
                            // clear downstream axes when upstream changes
                            variantAttributes.slice(axisIdx + 1).forEach(a => { delete next[a] })
                            return next
                          })
                        }}
                        className={[
                          'relative px-3 py-1.5 rounded-md border text-sm font-medium transition-all',
                          isActive
                            ? 'border-brand bg-brand text-white shadow-sm'
                            : !isAxisReady
                            ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                            : inStock
                            ? 'border-gray-300 bg-white text-gray-700 hover:border-brand hover:text-brand'
                            : 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed',
                        ].join(' ')}
                        disabled={(!inStock || !isAxisReady) && !isActive}
                      >
                        {!inStock && !isActive && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="absolute w-full h-px bg-gray-300 rotate-[-8deg]" />
                          </span>
                        )}
                        <span className={!inStock && !isActive ? 'opacity-40' : ''}>{value}</span>
                        {isActive && stockCount > 0 && (
                          <span className="ml-1.5 text-[10px] opacity-80">({stockCount} шт)</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Price — reactive when variants, static otherwise */}
      {hasVariants && (
        <div className="mb-4">
          {activeVariant ? (
            <>
              {effectiveOldPrice && effectiveOldPrice > effectivePrice ? (
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="text-gray-400 line-through text-base">{formatPrice(effectiveOldPrice)}</span>
                  <span className="text-[28px] font-bold text-[#333]">{formatPrice(effectivePrice)}</span>
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">-{discount}%</span>
                </div>
              ) : (
                <span className="text-[28px] font-bold text-[#333]">{formatPrice(effectivePrice)}</span>
              )}
              <div className="text-sm mt-1">
                {effectiveInStock ? (
                  <span className="text-green-600">В наличии{effectiveStock > 0 ? `: ${effectiveStock} шт.` : ''}</span>
                ) : (
                  <span className="text-red-500">Нет в наличии</span>
                )}
              </div>
            </>
          ) : (
            // No variant selected yet — show price range
            <div>
              {priceRange ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-sm text-gray-400 mr-1">от</span>
                  <span className="text-[28px] font-bold text-[#333]">{formatPrice(priceRange.min)}</span>
                  <span className="text-sm text-gray-400 mx-1">до</span>
                  <span className="text-[22px] font-semibold text-gray-500">{formatPrice(priceRange.max)}</span>
                </div>
              ) : (
                <span className="text-[28px] font-bold text-[#333]">{formatPrice(effectivePrice)}</span>
              )}
              <p className="text-sm text-gray-400 mt-1">Выберите вариант чтобы увидеть наличие</p>
            </div>
          )}
        </div>
      )}

      {/* Favorite */}
      <button
        onClick={handleToggleFav}
        className="flex items-center gap-1.5 text-sm mb-4 transition-colors"
        style={{ color: fav ? '#006EBE' : '#6b7280' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={fav ? '#006EBE' : 'none'} stroke="currentColor" strokeWidth="1.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        {fav ? 'В избранном' : 'В избранное'}
      </button>

      {/* Cart / Pre-order */}
      {hasVariants && !allSelected ? (
        <button
          disabled
          className="flex items-center gap-2 px-8 h-11 rounded-lg font-medium text-white bg-gray-300 cursor-not-allowed"
        >
          Выберите вариант
        </button>
      ) : !effectiveInStock ? (
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-8 h-11 rounded-lg font-medium text-white bg-amber-500 hover:bg-amber-600 transition-colors"
        >
          Предзаказать
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
          </svg>
        </button>
      ) : qty === 0 ? (
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-8 h-11 rounded-lg font-medium text-white bg-brand hover:bg-brand-hover transition-colors"
        >
          В корзину
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
        </button>
      ) : (
        <div className="inline-flex items-center h-11 rounded-lg bg-brand text-white">
          <button
            onClick={handleMinus}
            className="w-11 h-11 flex items-center justify-center rounded-l-lg text-lg font-bold hover:bg-brand-hover transition-colors"
          >
            -
          </button>
          <Link
            href="/cart"
            className="flex-1 h-11 flex flex-col items-center justify-center px-4 mx-px hover:bg-brand-hover transition-colors leading-none"
          >
            <span className="text-sm font-medium">В корзине {qty} шт</span>
            <span className="text-[11px] opacity-80 mt-0.5">Перейти</span>
          </Link>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className={`w-11 h-11 flex items-center justify-center rounded-r-lg text-lg font-bold transition-colors ${canAdd ? 'hover:bg-brand-hover' : 'opacity-40 cursor-not-allowed'}`}
          >
            +
          </button>
        </div>
      )}

      {/* Pre-order modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            {preorderDone ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Заявка принята!</h3>
                <p className="text-sm text-gray-500 mb-6">
                  Мы свяжемся с вами, как только товар поступит в наличие.
                </p>
                <button
                  onClick={closeModal}
                  className="w-full py-2.5 rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors font-medium"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Предзаказ</h3>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                      {product.name}{activeVariantTitle ? ` — ${activeVariantTitle}` : ''}
                    </p>
                  </div>
                  <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 ml-2 shrink-0 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2" aria-label="Закрыть">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>

                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-5">
                  Товар временно отсутствует. Оставьте заявку — мы уведомим вас о поступлении.
                </p>

                <form onSubmit={handlePreorderSubmit} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Имя *</label>
                    <input
                      type="text"
                      required
                      value={preorderName}
                      onChange={e => setPreorderName(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2.5 text-base outline-none focus:border-amber-400"
                      placeholder="Ваше имя"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Телефон *</label>
                    <PhoneInput
                      value={preorderPhone}
                      onChange={setPreorderPhone}
                      required
                    />
                  </div>

                  {preorderError && (
                    <p className="text-red-500 text-sm">{preorderError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={preorderLoading}
                    className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors disabled:bg-gray-300 mt-1"
                  >
                    {preorderLoading ? 'Отправляем...' : 'Оставить заявку'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
