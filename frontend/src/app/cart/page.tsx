'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getCart, removeFromCart, updateQuantity, saveCart, getCartTotal, CartItem } from '@/lib/cart'
import { formatPrice } from '@/lib/format'
import RecentlyViewed from '@/components/RecentlyViewed'

const FREE_SHIPPING = 150000

interface ProductInfo {
  id: string
  name: string
  price: number
  inStock: boolean
  totalStock: number // 0 = unlimited
}

// Цена/наличие/остаток для позиции корзины — поля товара (1 карточка = 1 товар).
// item оставлен в сигнатуре для совместимости вызовов (variantId больше не используется).
function effectiveInfo(_item: CartItem, info: ProductInfo) {
  return { price: info.price, inStock: info.inStock, totalStock: info.totalStock }
}

// Per-item validation result
interface ItemStatus {
  outOfStock: boolean      // product.inStock = false
  exceedsStock: boolean    // qty > totalStock (when totalStock > 0)
  maxQty: number           // max allowed qty (0 = unlimited)
  priceChanged: boolean    // price in cart ≠ current price
  currentPrice: number
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([])
  const [total, setTotal] = useState(0)
  const [productInfo, setProductInfo] = useState<Record<string, ProductInfo>>({})
  const [validating, setValidating] = useState(false)
  const [hasIssues, setHasIssues] = useState(false)

  const refreshCart = useCallback(() => {
    const cart = getCart()
    setItems(cart)
    setTotal(getCartTotal())
    return cart
  }, [])

  // Validate cart items against current stock & prices
  const validateCart = useCallback(async (cart: CartItem[]) => {
    if (cart.length === 0) return
    setValidating(true)
    try {
      const seen = new Set<string>()
      const uniqueIds: string[] = []
      for (const item of cart) { if (!seen.has(item.productId)) { seen.add(item.productId); uniqueIds.push(item.productId) } }
      const ids = uniqueIds.join(',')
      const res = await fetch(`/api/products?ids=${ids}`)
      if (!res.ok) return
      const products: ProductInfo[] = await res.json()
      const infoMap: Record<string, ProductInfo> = {}
      for (const p of products) infoMap[p.id] = p
      setProductInfo(infoMap)

      // Auto-fix: clamp quantities exceeding stock
      let changed = false
      const updatedCart = cart.map(item => {
        const info = infoMap[item.productId]
        if (!info) return item
        const eff = effectiveInfo(item, info)
        if (eff.totalStock > 0 && item.quantity > eff.totalStock) {
          changed = true
          return { ...item, quantity: eff.totalStock }
        }
        return item
      })
      if (changed) {
        saveCart(updatedCart)
        setItems(updatedCart)
        setTotal(updatedCart.reduce((s, i) => s + i.price * i.quantity, 0))
      }

      // Check for any remaining issues
      const issues = updatedCart.some(item => {
        const info = infoMap[item.productId]
        if (!info) return false
        const eff = effectiveInfo(item, info)
        return !eff.inStock || Math.abs(eff.price - item.price) > 0.01
      })
      setHasIssues(issues)
    } finally {
      setValidating(false)
    }
  }, [])

  useEffect(() => {
    const cart = refreshCart()
    validateCart(cart)

    const update = () => {
      const cart = refreshCart()
      validateCart(cart)
    }
    window.addEventListener('cart-updated', update)
    return () => window.removeEventListener('cart-updated', update)
  }, [refreshCart, validateCart])

  const getItemStatus = (item: CartItem): ItemStatus => {
    const info = productInfo[item.productId]
    if (!info) return { outOfStock: false, exceedsStock: false, maxQty: 999, priceChanged: false, currentPrice: item.price }
    const eff = effectiveInfo(item, info)
    const maxQty = eff.totalStock > 0 ? eff.totalStock : 999
    return {
      outOfStock:    !eff.inStock,
      exceedsStock:  eff.totalStock > 0 && item.quantity > eff.totalStock,
      maxQty,
      priceChanged:  Math.abs(eff.price - item.price) > 0.01,
      currentPrice:  eff.price,
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-12 text-center">
        <div className="mb-6 flex justify-center">
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Корзина пуста</h1>
        <p className="text-gray-500 mb-6">Добавьте товары из каталога</p>
        <Link href="/" className="inline-block bg-brand text-white px-8 py-3 rounded-lg hover:bg-brand-hover transition-colors font-medium">
          Перейти в каталог
        </Link>
        <RecentlyViewed />
      </div>
    )
  }

  const remaining = FREE_SHIPPING - total
  const progress = Math.min(100, (total / FREE_SHIPPING) * 100)
  const checkoutBlocked = items.some(item => getItemStatus(item).outOfStock)

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Корзина</h1>

      {/* Global warning if issues */}
      {hasIssues && !validating && (
        <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" className="shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p className="text-sm text-amber-800">
            Некоторые товары изменили статус или цену. Проверьте состав заказа перед оформлением.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-3">
          {items.map(item => {
            const status = getItemStatus(item)
            const isProblematic = status.outOfStock || status.exceedsStock || status.priceChanged
            return (
              <div
                key={`${item.productId}:${item.variantId || ''}`}
                className={`flex gap-4 p-4 border rounded-xl transition-colors ${
                  status.outOfStock
                    ? 'border-red-200 bg-red-50/30'
                    : isProblematic
                    ? 'border-amber-200 bg-amber-50/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <Link href={`/product/${item.slug}`} className="shrink-0">
                  <div className={`relative w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden ${status.outOfStock ? 'opacity-50 grayscale' : ''}`}>
                    {item.image
                      ? <Image src={item.image} alt={item.name} fill className="object-contain" sizes="80px" />
                      : <div className="w-full h-full bg-gray-100" />
                    }
                  </div>
                </Link>

                <div className="flex-1 min-w-0">
                  <Link href={`/product/${item.slug}`} className={`text-sm font-medium line-clamp-2 hover:text-brand ${status.outOfStock ? 'text-gray-400' : ''}`}>
                    {item.name}
                  </Link>
                  {item.variantTitle && (
                    <div className="text-xs text-gray-400 mt-0.5">{item.variantTitle}</div>
                  )}
                  {item.sku && (
                    <div className="text-xs text-gray-400 mt-0.5 font-mono">арт. {item.sku}</div>
                  )}

                  {/* Status badges */}
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {status.outOfStock && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Нет в наличии
                      </span>
                    )}
                    {status.exceedsStock && !status.outOfStock && (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        Только {status.maxQty} шт. в наличии
                      </span>
                    )}
                    {status.priceChanged && !validating && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        Цена изменилась → {formatPrice(status.currentPrice)}
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="text-sm text-gray-500 mt-1">
                    {formatPrice(item.price)} за шт.
                    {status.priceChanged && !validating && (
                      <span className="ml-1 line-through text-gray-400">{formatPrice(status.currentPrice)}</span>
                    )}
                  </div>

                  {/* Qty controls */}
                  <div className="flex items-center gap-4 mt-2">
                    {status.outOfStock ? (
                      <button
                        onClick={() => removeFromCart(item.productId, item.variantId)}
                        className="text-xs text-red-500 hover:text-red-700 underline transition-colors"
                      >
                        Удалить из корзины
                      </button>
                    ) : (
                      <>
                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => {
                              if (item.quantity <= 1) removeFromCart(item.productId, item.variantId)
                              else updateQuantity(item.productId, item.quantity - 1, item.variantId)
                            }}
                            className={`w-11 h-11 flex items-center justify-center text-base font-medium transition-colors ${
                              item.quantity <= 1 ? 'text-red-400 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                            title={item.quantity <= 1 ? 'Удалить' : 'Меньше'}
                          >{item.quantity <= 1 ? '×' : '−'}</button>

                          <span className="px-3 text-sm font-semibold min-w-[36px] text-center tabular-nums">
                            {item.quantity}
                          </span>

                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity + 1, item.variantId)}
                            disabled={status.maxQty > 0 && item.quantity >= status.maxQty}
                            className={`w-11 h-11 flex items-center justify-center text-base font-medium transition-colors ${
                              status.maxQty > 0 && item.quantity >= status.maxQty
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                            title={status.maxQty > 0 && item.quantity >= status.maxQty ? `Максимум ${status.maxQty} шт.` : 'Больше'}
                          >+</button>
                        </div>

                        {/* Max stock hint */}
                        {status.maxQty < 999 && item.quantity >= status.maxQty && (
                          <span className="text-xs text-gray-400">макс. {status.maxQty} шт.</span>
                        )}

                        <span className="font-bold text-base">{formatPrice(item.price * item.quantity)}</span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => removeFromCart(item.productId, item.variantId)}
                  className="text-gray-300 hover:text-red-500 p-2.5 self-start transition-colors shrink-0 -mr-1"
                  title="Удалить"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            )
          })}
        </div>

        {/* Summary */}
        <div className="bg-gray-50 p-6 rounded-xl h-fit lg:sticky lg:top-20 space-y-4">
          <h3 className="font-bold text-lg">Итого</h3>

          {validating && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="w-3 h-3 border border-gray-300 border-t-brand rounded-full animate-spin" />
              Проверяем наличие...
            </div>
          )}

          {/* Free shipping */}
          <div>
            {remaining > 0 ? (
              <>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-600">До бесплатной доставки:</span>
                  <span className="font-medium">{formatPrice(remaining)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div className="bg-brand h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">Бесплатно от {formatPrice(FREE_SHIPPING)}</p>
              </>
            ) : (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                <span className="text-sm text-green-700 font-medium">Бесплатная доставка!</span>
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Позиций:</span>
              <span>{items.reduce((s, i) => s + i.quantity, 0)} шт.</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span>Сумма:</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>

          {checkoutBlocked ? (
            <div className="text-center text-sm text-red-500 py-2">
              Удалите недоступные товары для оформления
            </div>
          ) : (
            <Link
              href="/checkout"
              className="block w-full bg-brand text-white text-center py-3.5 rounded-xl hover:bg-brand-hover transition-colors font-semibold"
            >
              Оформить заказ
            </Link>
          )}

          <Link href="/" className="block w-full text-center text-sm text-gray-400 hover:text-brand transition-colors py-1">
            Продолжить покупки
          </Link>
        </div>
      </div>

      <RecentlyViewed />
    </div>
  )
}
