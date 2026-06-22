'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { getCart, getCartTotal, getViewed, clearViewed, getSearches, clearSearches, getSource, CartItem } from '@/lib/cart'
import { formatPrice } from '@/lib/format'
import PhoneInput from '@/components/PhoneInput'

export default function CheckoutPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [items, setItems] = useState<CartItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedAddresses, setSavedAddresses] = useState<{ id: string; label: string; address: string; city: string | null; isDefault: boolean }[]>([])

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    deliveryMethod: 'pickup',
    paymentMethod: 'cash',
    comment: '',
  })

  useEffect(() => {
    const cart = getCart()
    if (cart.length === 0) {
      router.push('/cart')
      return
    }
    setItems(cart)
    setTotal(getCartTotal())
  }, [router])

  // Auto-fill from session
  useEffect(() => {
    if (session?.user) {
      setForm(prev => ({
        ...prev,
        name: prev.name || session.user?.name || '',
        email: prev.email || session.user?.email || '',
        phone: prev.phone || (session.user as any)?.phone || '',
      }))
      fetch('/api/account/addresses').then(r => r.json()).then(data => {
        if (Array.isArray(data)) {
          setSavedAddresses(data)
          const def = data.find((a: any) => a.isDefault)
          if (def) {
            setForm(prev => ({ ...prev, address: prev.address || [def.city, def.address].filter(Boolean).join(', ') }))
          }
        }
      }).catch(() => {})
    }
  }, [session])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          items: items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            price: item.price,
          })),
          viewedProductIds: getViewed(),
          searchQueries: getSearches(),
          ...getSource(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка при оформлении заказа')
      }

      const data = await res.json()
      localStorage.removeItem('croon_cart')
      clearViewed()
      clearSearches()
      window.dispatchEvent(new Event('cart-updated'))
      router.push(`/checkout/success?id=${data.orderNumber}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) return null

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-brand">Главная</Link>
        <span className="mx-1">/</span>
        <Link href="/cart" className="hover:text-brand">Корзина</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-800">Оформление заказа</span>
      </nav>

      <h1 className="text-2xl font-bold mb-6">Оформление заказа</h1>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Contact info */}
            <div className="border rounded-lg p-4 sm:p-6">
              <h2 className="font-bold text-lg mb-4">Контактные данные</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Имя *</label>
                  <input
                    type="text"
                    name="name"
                    required
                    value={form.name}
                    onChange={handleChange}
                    className="w-full border rounded-lg px-4 py-2.5 text-base outline-none focus:border-brand"
                    placeholder="Ваше имя"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Телефон *</label>
                  <PhoneInput
                    value={form.phone}
                    onChange={phone => setForm(prev => ({ ...prev, phone }))}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    className="w-full border rounded-lg px-4 py-2.5 text-base outline-none focus:border-brand"
                    placeholder="email@example.com"
                  />
                </div>
              </div>
            </div>

            {/* Delivery */}
            <div className="border rounded-lg p-4 sm:p-6">
              <h2 className="font-bold text-lg mb-4">Доставка</h2>
              <div className="space-y-3">
                <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:border-brand transition-colors ${form.deliveryMethod === 'pickup' ? 'border-brand bg-blue-50/50' : ''}`}>
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="pickup"
                    checked={form.deliveryMethod === 'pickup'}
                    onChange={handleChange}
                    className="accent-brand mt-1"
                  />
                  <div>
                    <span className="font-medium text-sm">Самовывоз</span>
                    <p className="text-xs text-gray-500 mt-0.5">Бесплатно</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:border-brand transition-colors ${form.deliveryMethod === 'yandex' ? 'border-brand bg-blue-50/50' : ''}`}>
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="yandex"
                    checked={form.deliveryMethod === 'yandex'}
                    onChange={handleChange}
                    className="accent-brand mt-1"
                  />
                  <div>
                    <span className="font-medium text-sm">Доставка по Костанаю — Яндекс Курьер</span>
                    <p className="text-xs text-gray-500 mt-0.5">Бесплатно от 150 000 тг. При меньшей сумме стоимость рассчитывается при подтверждении.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:border-brand transition-colors ${form.deliveryMethod === 'indrive' ? 'border-brand bg-blue-50/50' : ''}`}>
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="indrive"
                    checked={form.deliveryMethod === 'indrive'}
                    onChange={handleChange}
                    className="accent-brand mt-1"
                  />
                  <div>
                    <span className="font-medium text-sm">Доставка по Казахстану — inDrive</span>
                    <p className="text-xs text-gray-500 mt-0.5">Бесплатно от 150 000 тг. При меньшей сумме стоимость рассчитывается при подтверждении.</p>
                  </div>
                </label>
              </div>

              {form.deliveryMethod === 'pickup' && (
                <div className="mt-4 bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                  <p className="font-medium text-gray-800 mb-1">Пункт выдачи:</p>
                  <p>Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9</p>
                </div>
              )}

              {(form.deliveryMethod === 'yandex' || form.deliveryMethod === 'indrive') && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Адрес доставки *</label>
                  {savedAddresses.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {savedAddresses.map(addr => (
                        <button
                          key={addr.id}
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, address: [addr.city, addr.address].filter(Boolean).join(', ') }))}
                          className="text-xs px-3 py-1.5 border rounded-full hover:border-brand hover:text-brand transition-colors bg-gray-50"
                        >
                          {addr.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    type="text"
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    required
                    className="w-full border rounded-lg px-4 py-2.5 text-base outline-none focus:border-brand"
                    placeholder="Город, улица, дом, квартира"
                  />
                  {total >= 150000 && (
                    <p className="text-xs text-green-600 mt-1.5 font-medium">Доставка бесплатная для вашего заказа</p>
                  )}
                </div>
              )}
            </div>

            {/* Payment */}
            <div className="border rounded-lg p-4 sm:p-6">
              <h2 className="font-bold text-lg mb-4">Оплата</h2>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:border-brand transition-colors">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cash"
                    checked={form.paymentMethod === 'cash'}
                    onChange={handleChange}
                    className="accent-brand"
                  />
                  <span className="font-medium text-sm">Наличными при получении</span>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:border-brand transition-colors">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="card"
                    checked={form.paymentMethod === 'card'}
                    onChange={handleChange}
                    className="accent-brand"
                  />
                  <span className="font-medium text-sm">Картой при получении</span>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:border-brand transition-colors">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="transfer"
                    checked={form.paymentMethod === 'transfer'}
                    onChange={handleChange}
                    className="accent-brand"
                  />
                  <span className="font-medium text-sm">Банковский перевод (Kaspi/Halyk)</span>
                </label>
              </div>
            </div>

            {/* Comment */}
            <div className="border rounded-lg p-4 sm:p-6">
              <h2 className="font-bold text-lg mb-4">Комментарий</h2>
              <textarea
                name="comment"
                value={form.comment}
                onChange={handleChange}
                rows={3}
                className="w-full border rounded-lg px-4 py-2.5 text-base outline-none focus:border-brand resize-none"
                placeholder="Примечания к заказу..."
              />
            </div>
          </div>

          {/* Order summary — on mobile shows above the form (order-first), on desktop right column */}
          <div className="lg:col-span-1 order-first lg:order-none">
            <div className="bg-gray-50 p-6 rounded-lg lg:sticky lg:top-20">
              <h3 className="font-bold text-lg mb-4">Ваш заказ</h3>
              <div className="space-y-3 mb-4">
                {items.map(item => (
                  <div key={`${item.productId}:${item.variantId || ''}`} className="flex justify-between text-sm gap-2">
                    <div className="text-gray-600 flex-1 min-w-0">
                      <span className="line-clamp-1">{item.name}</span>
                      {item.variantTitle && <span className="text-gray-400 text-xs block">{item.variantTitle}</span>}
                      <span className="text-gray-400 text-xs">× {item.quantity}</span>
                    </div>
                    <span className="font-medium shrink-0">{formatPrice(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mb-2 text-sm">
                <span className="text-gray-500">Товаров:</span>
                <span>{items.reduce((s, i) => s + i.quantity, 0)} шт.</span>
              </div>
              <div className="flex justify-between mb-6 text-lg font-bold border-t pt-4">
                <span>Итого:</span>
                <span>{formatPrice(total)}</span>
              </div>

              {error && (
                <p className="text-red-500 text-sm mb-4">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="block w-full bg-brand text-white text-center py-3 rounded-lg hover:bg-brand-hover transition-colors font-medium disabled:bg-gray-400"
              >
                {loading ? 'Оформляем...' : 'Подтвердить заказ'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
