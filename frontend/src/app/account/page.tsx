'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { formatPrice } from '@/lib/format'
import { statusLabels, statusColorsLight as statusColors } from '@/lib/constants'
import { getCart, saveCart, getViewed } from '@/lib/cart'

interface StatusLog {
  id: string
  status: string
  prevStatus: string | null
  note: string | null
  createdAt: string
}

interface OrderItem {
  id: string
  quantity: number
  price: number
  product: { id: string; name: string; slug: string; images: { url: string }[] }
}

interface Order {
  id: string
  orderNumber?: number
  status: string
  total: number
  name: string
  phone: string
  deliveryMethod: string | null
  createdAt: string
  items: OrderItem[]
  statusLogs: StatusLog[]
}

interface Address {
  id: string
  label: string
  address: string
  city: string | null
  isDefault: boolean
}

interface FavoriteProduct {
  id: string
  name: string
  slug: string
  price: number
  oldPrice: number | null
  inStock: boolean
  images: { url: string }[]
}

const DONE_STATUSES = new Set(['DELIVERED', 'PICKED_UP'])

// Compact inline review form
function InlineReview({ productId, productName, onDone }: { productId: string; productName: string; onDone: () => void }) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (rating === 0) { setError('Выберите оценку'); return }
    if (text.length < 10) { setError('Минимум 10 символов'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, rating, text }),
      })
      const data = await res.json()
      if (res.ok) { onDone() } else { setError(data.error || 'Ошибка') }
    } catch { setError('Ошибка сети') }
    setLoading(false)
  }

  return (
    <form onSubmit={submit} className="mt-2 p-3 bg-white border rounded-lg space-y-2">
      <p className="text-xs font-medium text-gray-700 truncate">{productName}</p>
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(star => (
          <button key={star} type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="text-xl leading-none"
          >
            <span className={(hovered || rating) >= star ? 'text-yellow-400' : 'text-gray-300'}>★</span>
          </button>
        ))}
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder="Ваш отзыв (минимум 10 символов)" maxLength={2000} rows={2}
        className="w-full border rounded px-2 py-1.5 text-xs outline-none focus:border-brand resize-none"
      />
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading}
          className="bg-brand text-white text-xs px-3 py-1.5 rounded hover:bg-brand-hover disabled:opacity-50">
          {loading ? '...' : 'Отправить'}
        </button>
        <button type="button" onClick={() => onDone()}
          className="text-xs text-gray-500 hover:text-gray-700 px-2">
          Отмена
        </button>
      </div>
    </form>
  )
}

export default function AccountPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  // Profile
  const [editing, setEditing] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [saving, setSaving] = useState(false)

  // Password
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [showPwValues, setShowPwValues] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  // Cancel
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  // Addresses
  const [addresses, setAddresses] = useState<Address[]>([])
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [addrLabel, setAddrLabel] = useState('')
  const [addrAddress, setAddrAddress] = useState('')
  const [addrCity, setAddrCity] = useState('')
  const [addrSaving, setAddrSaving] = useState(false)
  const [addrError, setAddrError] = useState('')

  // Reviews
  const [reviewedProductIds, setReviewedProductIds] = useState<Set<string>>(new Set())
  const [activeReviewItem, setActiveReviewItem] = useState<string | null>(null)

  // Tabs
  const [activeTab, setActiveTab] = useState<'orders' | 'favorites' | 'viewed'>('orders')
  const [favorites, setFavorites] = useState<FavoriteProduct[]>([])
  const [favLoading, setFavLoading] = useState(false)
  const [favLoaded, setFavLoaded] = useState(false)
  const [viewed, setViewed] = useState<FavoriteProduct[]>([])
  const [viewedLoading, setViewedLoading] = useState(false)
  const [viewedLoaded, setViewedLoaded] = useState(false)

  const loadProfile = useCallback(() => {
    fetch('/api/account/profile').then(r => r.json()).then(data => {
      setProfileName(data.name || '')
      setProfilePhone(data.phone || '')
      setProfileEmail(data.email || '')
      setEmailNotifications(data.emailNotifications !== false)
    }).catch(() => {})
  }, [])

  const loadAddresses = useCallback(() => {
    fetch('/api/account/addresses').then(r => r.json()).then(data => {
      setAddresses(Array.isArray(data) ? data : [])
    }).catch(() => {})
  }, [])

  const loadFavorites = useCallback(() => {
    if (favLoaded) return
    setFavLoading(true)
    fetch('/api/account/favorites').then(r => r.json()).then(data => {
      setFavorites(Array.isArray(data) ? data : [])
      setFavLoaded(true)
    }).catch(() => {}).finally(() => setFavLoading(false))
  }, [favLoaded])

  const loadViewed = useCallback(() => {
    if (viewedLoaded) return
    const ids = getViewed()
    if (ids.length === 0) { setViewedLoaded(true); return }
    setViewedLoading(true)
    fetch(`/api/account/viewed?ids=${ids.join(',')}`).then(r => r.json()).then(data => {
      setViewed(Array.isArray(data) ? data : [])
      setViewedLoaded(true)
    }).catch(() => {}).finally(() => setViewedLoading(false))
  }, [viewedLoaded])

  useEffect(() => {
    if (activeTab === 'favorites') loadFavorites()
    if (activeTab === 'viewed') loadViewed()
  }, [activeTab, loadFavorites, loadViewed])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/client_account/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/account/orders')
        .then(r => r.json())
        .then(data => { setOrders(Array.isArray(data) ? data : []); setLoading(false) })
        .catch(() => setLoading(false))

      loadProfile()
      loadAddresses()

      fetch('/api/account/reviews').then(r => r.json()).then((ids: string[]) => {
        setReviewedProductIds(new Set(ids))
      }).catch(() => {})
    }
  }, [status, loadProfile, loadAddresses])

  const saveProfile = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName, phone: profilePhone }),
      })
      if (res.ok) { setEditing(false); loadProfile() }
    } catch {}
    setSaving(false)
  }

  const toggleNotifications = async (val: boolean) => {
    setEmailNotifications(val)
    await fetch('/api/account/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailNotifications: val }),
    }).catch(() => setEmailNotifications(!val))
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    if (pwNew !== pwConfirm) { setPwError('Пароли не совпадают'); return }
    if (pwNew.length < 6) { setPwError('Новый пароль должен быть не менее 6 символов'); return }
    setPwSaving(true)
    try {
      const res = await fetch('/api/account/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      })
      if (res.ok) {
        setPwSuccess(true)
        setPwCurrent(''); setPwNew(''); setPwConfirm('')
        setTimeout(() => { setPwSuccess(false); setShowPasswordForm(false) }, 2000)
      } else {
        const data = await res.json()
        setPwError(data.error || 'Ошибка при смене пароля')
      }
    } catch { setPwError('Ошибка соединения') }
    setPwSaving(false)
  }

  const cancelOrder = async (orderId: string) => {
    if (!confirm('Отменить заказ? Это действие нельзя отменить.')) return
    setCancellingId(orderId)
    try {
      const res = await fetch(`/api/account/orders/${orderId}/cancel`, { method: 'PATCH' })
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'CANCELLED' } : o))
      } else {
        const data = await res.json()
        alert(data.error || 'Не удалось отменить заказ')
      }
    } catch { alert('Ошибка соединения') }
    setCancellingId(null)
  }

  const repeatOrder = (order: Order) => {
    const cart = getCart()
    for (const item of order.items) {
      const existing = cart.find(c => c.productId === item.product.id)
      if (existing) { existing.quantity += item.quantity }
      else {
        cart.push({
          productId: item.product.id, name: item.product.name,
          slug: item.product.slug, price: item.price,
          image: item.product.images?.[0]?.url || '', quantity: item.quantity,
        })
      }
    }
    saveCart(cart)
    window.dispatchEvent(new Event('cart-updated'))
    router.push('/cart')
  }

  const openAddressForm = (addr?: Address) => {
    if (addr) {
      setEditingAddress(addr)
      setAddrLabel(addr.label)
      setAddrAddress(addr.address)
      setAddrCity(addr.city || '')
    } else {
      setEditingAddress(null)
      setAddrLabel('')
      setAddrAddress('')
      setAddrCity('')
    }
    setAddrError('')
    setShowAddressForm(true)
  }

  const saveAddress = async () => {
    setAddrError('')
    if (!addrLabel.trim()) { setAddrError('Введите название'); return }
    if (!addrAddress.trim()) { setAddrError('Введите адрес'); return }
    setAddrSaving(true)
    try {
      const url = editingAddress ? `/api/account/addresses/${editingAddress.id}` : '/api/account/addresses'
      const method = editingAddress ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: addrLabel, address: addrAddress, city: addrCity }),
      })
      if (res.ok) {
        setShowAddressForm(false)
        loadAddresses()
      } else {
        const data = await res.json()
        setAddrError(data.error || 'Ошибка')
      }
    } catch { setAddrError('Ошибка соединения') }
    setAddrSaving(false)
  }

  const setDefaultAddress = async (id: string) => {
    await fetch(`/api/account/addresses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    })
    loadAddresses()
  }

  const deleteAddress = async (id: string) => {
    if (!confirm('Удалить адрес?')) return
    await fetch(`/api/account/addresses/${id}`, { method: 'DELETE' })
    loadAddresses()
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-12 text-center">
        <p className="text-gray-500">Загрузка...</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-brand">Главная</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-800">Личный кабинет</span>
      </nav>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Личный кабинет</h1>
        <button
          onClick={() => signOut({ callbackUrl: window.location.origin })}
          className="text-sm text-gray-500 hover:text-red-500 transition-colors"
        >
          Выйти
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* Profile card */}
          <div className="border rounded-lg p-5">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#006EBE" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Имя</label>
                  <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand"
                    placeholder="Ваше имя"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Телефон</label>
                  <input type="tel" value={profilePhone} onChange={e => setProfilePhone(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand"
                    placeholder="+7 (___) ___-__-__"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Email</label>
                  <p className="text-sm text-gray-400 px-3 py-2">{profileEmail}</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveProfile} disabled={saving}
                    className="flex-1 bg-brand text-white text-sm font-medium py-2 rounded-lg hover:bg-brand-hover disabled:opacity-50">
                    {saving ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  <button onClick={() => setEditing(false)}
                    className="flex-1 border text-sm text-gray-600 py-2 rounded-lg hover:bg-gray-50">
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="font-medium">{profileName || session?.user?.name || 'Пользователь'}</p>
                <p className="text-sm text-gray-500">{profileEmail || session?.user?.email}</p>
                {profilePhone && <p className="text-sm text-gray-500 mt-1">{profilePhone}</p>}
                <button onClick={() => setEditing(true)}
                  className="mt-3 text-sm text-brand hover:text-brand-hover transition-colors">
                  Редактировать профиль
                </button>
              </>
            )}
            {(session?.user as any)?.role === 'ADMIN' && (
              <Link href="/admin"
                className="mt-4 flex items-center justify-center gap-2 w-full bg-brand text-white text-sm font-medium py-2.5 rounded-lg hover:bg-brand-hover transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
                Панель администратора
              </Link>
            )}
          </div>

          {/* Change password */}
          <div className="border rounded-lg p-5">
            <button
              onClick={() => { setShowPasswordForm(v => !v); setPwError(''); setPwSuccess(false) }}
              className="flex items-center justify-between w-full text-sm font-medium text-gray-700 hover:text-brand transition-colors"
            >
              <span>Сменить пароль</span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-gray-400 transition-transform ${showPasswordForm ? 'rotate-180' : ''}`}>
                <path d="M4 6l4 4 4-4"/>
              </svg>
            </button>
            {showPasswordForm && (
              <form onSubmit={changePassword} className="mt-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Текущий пароль</label>
                  <div className="relative">
                    <input type={showPwValues ? 'text' : 'password'} value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} required
                      className="w-full border rounded-lg px-3 py-2 pr-9 text-sm outline-none focus:border-brand"/>
                    <button type="button" tabIndex={-1} onClick={() => setShowPwValues(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwValues
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Новый пароль</label>
                  <div className="relative">
                    <input type={showPwValues ? 'text' : 'password'} value={pwNew} onChange={e => setPwNew(e.target.value)} required minLength={6}
                      className="w-full border rounded-lg px-3 py-2 pr-9 text-sm outline-none focus:border-brand"/>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Повторите пароль</label>
                  <div className="relative">
                    <input type={showPwValues ? 'text' : 'password'} value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} required minLength={6}
                      className="w-full border rounded-lg px-3 py-2 pr-9 text-sm outline-none focus:border-brand"/>
                  </div>
                </div>
                {pwError && <p className="text-red-500 text-xs">{pwError}</p>}
                {pwSuccess && <p className="text-green-600 text-xs">Пароль успешно изменён</p>}
                <button type="submit" disabled={pwSaving}
                  className="w-full bg-brand text-white text-sm font-medium py-2 rounded-lg hover:bg-brand-hover disabled:opacity-50">
                  {pwSaving ? 'Сохранение...' : 'Сохранить пароль'}
                </button>
              </form>
            )}
          </div>

          {/* Notifications */}
          <div className="border rounded-lg p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">Уведомления</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => toggleNotifications(!emailNotifications)}
                className={`relative w-10 h-5 rounded-full transition-colors ${emailNotifications ? 'bg-brand' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${emailNotifications ? 'translate-x-5' : ''}`}/>
              </div>
              <span className="text-sm text-gray-600">Email о статусе заказов</span>
            </label>
          </div>

          {/* Address book */}
          <div className="border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">Адреса доставки</p>
              <button onClick={() => openAddressForm()}
                className="text-xs text-brand hover:text-brand-hover transition-colors">
                + Добавить
              </button>
            </div>

            {showAddressForm && (
              <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Название (Дом, Работа...)</label>
                  <input type="text" value={addrLabel} onChange={e => setAddrLabel(e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm outline-none focus:border-brand"
                    placeholder="Дом"/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Город</label>
                  <input type="text" value={addrCity} onChange={e => setAddrCity(e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm outline-none focus:border-brand"
                    placeholder="Костанай"/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Адрес *</label>
                  <input type="text" value={addrAddress} onChange={e => setAddrAddress(e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm outline-none focus:border-brand"
                    placeholder="ул. Абая 1, кв. 5"/>
                </div>
                {addrError && <p className="text-red-500 text-xs">{addrError}</p>}
                <div className="flex gap-2">
                  <button onClick={saveAddress} disabled={addrSaving}
                    className="flex-1 bg-brand text-white text-xs py-1.5 rounded hover:bg-brand-hover disabled:opacity-50">
                    {addrSaving ? '...' : editingAddress ? 'Сохранить' : 'Добавить'}
                  </button>
                  <button onClick={() => setShowAddressForm(false)}
                    className="flex-1 border text-xs text-gray-600 py-1.5 rounded hover:bg-gray-50">
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {addresses.length === 0 && !showAddressForm && (
              <p className="text-xs text-gray-400">Нет сохранённых адресов</p>
            )}

            <div className="space-y-2">
              {addresses.map(addr => (
                <div key={addr.id} className={`p-2.5 rounded-lg border text-sm ${addr.isDefault ? 'border-brand bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="font-medium text-xs text-gray-700 flex items-center gap-1">
                        {addr.label}
                        {addr.isDefault && <span className="text-brand text-xs">● основной</span>}
                      </p>
                      {addr.city && <p className="text-xs text-gray-500">{addr.city}</p>}
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{addr.address}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openAddressForm(addr)}
                        className="text-gray-400 hover:text-brand p-0.5">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z"/>
                        </svg>
                      </button>
                      {!addr.isDefault && (
                        <button onClick={() => setDefaultAddress(addr.id)}
                          className="text-gray-400 hover:text-brand p-0.5" title="Сделать основным">
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M8 1l1.9 3.8L14 5.6l-3 2.9.7 4.1L8 10.5 4.3 12.6l.7-4.1-3-2.9 4.1-.8L8 1z"/>
                          </svg>
                        </button>
                      )}
                      <button onClick={() => deleteAddress(addr.id)}
                        className="text-gray-400 hover:text-red-500 p-0.5">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="lg:col-span-3">
          {/* Tabs */}
          <div className="flex border-b mb-5">
            {([
              { key: 'orders', label: 'Заказы' },
              { key: 'favorites', label: 'Избранное' },
              { key: 'viewed', label: 'Просмотренные' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.key
                    ? 'border-brand text-brand'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Orders tab */}
          {activeTab === 'orders' && (
            <>
              {loading ? (
                <p className="text-gray-500">Загрузка заказов...</p>
              ) : orders.length === 0 ? (
                <div className="text-center py-8 border rounded-lg">
                  <p className="text-gray-500 mb-4">У вас ещё нет заказов</p>
                  <Link href="/" className="text-brand hover:text-brand-hover font-medium">Перейти в каталог</Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map(order => (
                    <div key={order.id} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-left">
                            <p className="text-sm font-medium">Заказ #{order.orderNumber || order.id.slice(0, 8)}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(order.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${statusColors[order.status] || 'bg-gray-100'}`}>
                            {statusLabels[order.status] || order.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold">{formatPrice(order.total)}</span>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                            className={`text-gray-400 transition-transform ${expandedOrder === order.id ? 'rotate-180' : ''}`}>
                            <path d="M4 6l4 4 4-4" />
                          </svg>
                        </div>
                      </button>

                      {expandedOrder === order.id && (
                        <div className="border-t px-4 py-4 bg-gray-50 space-y-4">
                          {/* Items */}
                          <div className="space-y-3">
                            {order.items.map(item => {
                              const imageUrl = item.product.images?.[0]?.url || '/images/placeholder.svg'
                              const canReview = DONE_STATUSES.has(order.status) && !reviewedProductIds.has(item.product.id)
                              const isReviewing = activeReviewItem === `${order.id}-${item.product.id}`

                              return (
                                <div key={item.id}>
                                  <div className="flex items-center gap-3">
                                    <Link href={`/product/${item.product.slug}`} className="shrink-0">
                                      <div className="relative w-14 h-14 border rounded bg-white">
                                        <Image src={imageUrl} alt={item.product.name} fill
                                          className="object-contain p-1" sizes="56px"/>
                                      </div>
                                    </Link>
                                    <div className="flex-1 min-w-0">
                                      <Link href={`/product/${item.product.slug}`}
                                        className="text-sm hover:text-brand line-clamp-1">
                                        {item.product.name}
                                      </Link>
                                      <div className="text-xs text-gray-500 mt-0.5">
                                        {formatPrice(item.price)} × {item.quantity} шт.
                                      </div>
                                      {canReview && !isReviewing && (
                                        <button
                                          onClick={() => setActiveReviewItem(`${order.id}-${item.product.id}`)}
                                          className="mt-1 text-xs text-brand hover:text-brand-hover underline"
                                        >
                                          Оставить отзыв
                                        </button>
                                      )}
                                      {reviewedProductIds.has(item.product.id) && DONE_STATUSES.has(order.status) && (
                                        <span className="mt-1 text-xs text-green-600 flex items-center gap-1">
                                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M2 8l4 4 8-8"/>
                                          </svg>
                                          Отзыв оставлен
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-medium text-sm whitespace-nowrap">{formatPrice(item.price * item.quantity)}</span>
                                  </div>
                                  {isReviewing && (
                                    <InlineReview
                                      productId={item.product.id}
                                      productName={item.product.name}
                                      onDone={() => {
                                        setActiveReviewItem(null)
                                        setReviewedProductIds(prev => { const s = new Set(prev); s.add(item.product.id); return s })
                                      }}
                                    />
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* Status timeline */}
                          {order.statusLogs && order.statusLogs.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">История статусов</p>
                              <div className="space-y-2">
                                {order.statusLogs.map((log, i) => (
                                  <div key={log.id} className="flex items-start gap-2">
                                    <div className="mt-0.5 shrink-0 flex flex-col items-center">
                                      <div className={`w-2.5 h-2.5 rounded-full ${i === order.statusLogs.length - 1 ? 'bg-brand' : 'bg-gray-300'}`} />
                                      {i < order.statusLogs.length - 1 && <div className="w-px h-4 bg-gray-200 mt-0.5" />}
                                    </div>
                                    <div className="flex-1 pb-1">
                                      <span className={`text-xs font-medium ${statusColors[log.status] || 'bg-gray-100'} px-1.5 py-0.5 rounded`}>
                                        {statusLabels[log.status] || log.status}
                                      </span>
                                      <span className="text-xs text-gray-400 ml-2">
                                        {new Date(log.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}{' '}
                                        {new Date(log.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      {log.note && <p className="text-xs text-gray-500 mt-0.5">{log.note}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button onClick={() => repeatOrder(order)}
                              className="text-xs border border-brand text-brand px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                              Повторить заказ
                            </button>
                            <Link
                              href={`/account/orders/${order.id}/invoice`}
                              target="_blank"
                              className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-1.5"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="12" y1="12" x2="12" y2="18"/>
                                <line x1="9" y1="15" x2="15" y2="15"/>
                              </svg>
                              Скачать чек
                            </Link>
                            {order.status === 'NEW' && (
                              <button onClick={() => cancelOrder(order.id)} disabled={cancellingId === order.id}
                                className="text-xs border border-red-300 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                                {cancellingId === order.id ? 'Отмена...' : 'Отменить заказ'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Favorites tab */}
          {activeTab === 'favorites' && (
            <>
              {favLoading ? (
                <p className="text-gray-500">Загрузка...</p>
              ) : favorites.length === 0 ? (
                <div className="text-center py-8 border rounded-lg">
                  <p className="text-gray-500 mb-4">В избранном ничего нет</p>
                  <Link href="/" className="text-brand hover:text-brand-hover font-medium">Перейти в каталог</Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {favorites.map(product => (
                    <Link key={product.id} href={`/product/${product.slug}`}
                      className="border rounded-lg overflow-hidden hover:border-brand transition-colors group">
                      <div className="relative aspect-square bg-gray-50">
                        {product.images?.[0] ? (
                          <Image src={product.images[0].url} alt={product.name} fill
                            className="object-contain p-2 group-hover:scale-105 transition-transform" sizes="200px"/>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                              <polyline points="21 15 16 10 5 21"/>
                            </svg>
                          </div>
                        )}
                        {!product.inStock && (
                          <span className="absolute top-1 left-1 bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded">
                            Под заказ
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs text-gray-700 line-clamp-2 mb-1.5 leading-snug">{product.name}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-gray-900">{formatPrice(product.price)}</span>
                          {product.oldPrice && product.oldPrice > product.price && (
                            <span className="text-xs text-gray-400 line-through">{formatPrice(product.oldPrice)}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Viewed tab */}
          {activeTab === 'viewed' && (
            <>
              {viewedLoading ? (
                <p className="text-gray-500">Загрузка...</p>
              ) : viewed.length === 0 ? (
                <div className="text-center py-8 border rounded-lg">
                  <p className="text-gray-500 mb-4">Нет просмотренных товаров</p>
                  <Link href="/" className="text-brand hover:text-brand-hover font-medium">Перейти в каталог</Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {viewed.map(product => (
                    <Link key={product.id} href={`/product/${product.slug}`}
                      className="border rounded-lg overflow-hidden hover:border-brand transition-colors group">
                      <div className="relative aspect-square bg-gray-50">
                        {product.images?.[0] ? (
                          <Image src={product.images[0].url} alt={product.name} fill
                            className="object-contain p-2 group-hover:scale-105 transition-transform" sizes="200px"/>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                              <polyline points="21 15 16 10 5 21"/>
                            </svg>
                          </div>
                        )}
                        {!product.inStock && (
                          <span className="absolute top-1 left-1 bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded">
                            Под заказ
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs text-gray-700 line-clamp-2 mb-1.5 leading-snug">{product.name}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-gray-900">{formatPrice(product.price)}</span>
                          {product.oldPrice && product.oldPrice > product.price && (
                            <span className="text-xs text-gray-400 line-through">{formatPrice(product.oldPrice)}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
