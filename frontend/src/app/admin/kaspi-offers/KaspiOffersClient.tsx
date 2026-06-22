'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Offer = {
  id: string
  kaspiSku: string
  kaspiName: string | null
  kaspiBrand: string | null
  kaspiStoreId: string
  cityId: string
  priceTenge: number
  active: boolean
  productId: string
  productName: string
  productSlug: string
  productPrice: number
  totalStock: number
  inStock: boolean
  stockOverride: number | null
  availableOverride: boolean | null
  preOrder: number
}

export default function KaspiOffersClient({ offers }: { offers: Offer[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const toggleActive = async (id: string, current: boolean) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/kaspi-offers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !current }),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const updatePrice = async (id: string, priceTenge: number) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/kaspi-offers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceTenge }),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const patchOffer = async (id: string, body: any) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/kaspi-offers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const removeOffer = async (id: string, kaspiSku: string) => {
    if (!confirm(`Удалить оффер ${kaspiSku}? Карточка на Kaspi не удалится.`)) return
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/kaspi-offers/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <CatalogUpload onDone={() => router.refresh()} />
        <button
          onClick={() => setShowAdd(v => !v)}
          className="px-4 py-2 bg-admin hover:bg-admin-hover text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showAdd ? 'Отмена' : '+ Добавить оффер'}
        </button>
      </div>

      {showAdd && <AddOfferForm onSaved={() => { setShowAdd(false); router.refresh() }} />}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Kaspi SKU</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Товар (Alash)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Цена Kaspi</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700" title="<availability available>">available</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700" title="<availability preOrder>">preOrder</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700" title="<availability stockCount>">stockCount</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700">Активен</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {offers.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Нет офферов. Запусти seed: <code>npm run seed:kaspi</code></td></tr>
              )}
              {offers.map(o => {
                const effStock = o.stockOverride != null ? o.stockOverride : Math.max(0, o.totalStock)
                const autoAvail = effStock > 0 && o.inStock
                const effAvail = o.availableOverride != null ? o.availableOverride : autoAvail
                return (
                  <tr key={o.id} className={o.active ? '' : 'opacity-60'}>
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="text-gray-900">{o.kaspiSku}</div>
                      {o.kaspiName && <div className="text-gray-400 text-[11px] truncate max-w-[200px]">{o.kaspiName}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/admin/products/${o.productId}`} className="text-admin hover:underline">
                        #{o.productId} {o.productName}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        defaultValue={o.priceTenge}
                        disabled={busy === o.id}
                        onBlur={e => {
                          const v = Math.round(Number(e.target.value))
                          if (v && v !== o.priceTenge) updatePrice(o.id, v)
                        }}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded focus:border-admin focus:ring-1 focus:ring-admin/20 outline-none"
                      />
                      <span className="text-gray-400 text-xs ml-1">тг</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={o.availableOverride === null ? 'auto' : (o.availableOverride ? 'yes' : 'no')}
                        disabled={busy === o.id}
                        onChange={e => {
                          const v = e.target.value
                          patchOffer(o.id, { availableOverride: v === 'auto' ? null : v === 'yes' })
                        }}
                        className={`px-2 py-0.5 rounded text-xs font-medium border outline-none focus:border-admin ${effAvail ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}
                      >
                        <option value="auto">auto ({autoAvail ? 'yes' : 'no'})</option>
                        <option value="yes">yes</option>
                        <option value="no">no</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={String(o.preOrder)}
                        disabled={busy === o.id}
                        onChange={e => patchOffer(o.id, { preOrder: Number(e.target.value) })}
                        className="px-2 py-0.5 border border-gray-200 rounded text-xs font-mono outline-none focus:border-admin"
                      >
                        <option value="0">0</option>
                        <option value="1">1</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        defaultValue={o.stockOverride != null ? o.stockOverride : ''}
                        placeholder={String(Math.max(0, o.totalStock))}
                        disabled={busy === o.id}
                        onBlur={e => {
                          const raw = e.target.value
                          const newVal = raw === '' ? null : Math.max(0, Math.round(Number(raw)))
                          if (newVal !== o.stockOverride) {
                            patchOffer(o.id, { stockOverride: newVal })
                          }
                        }}
                        className="w-20 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:border-admin focus:ring-1 focus:ring-admin/20 outline-none tabular-nums"
                        title={`Override Product.totalStock=${o.totalStock}. Пусто = auto.`}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        disabled={busy === o.id}
                        onClick={() => toggleActive(o.id, o.active)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${o.active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition ${o.active ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => removeOffer(o.id, o.kaspiSku)}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function AddOfferForm({ onSaved }: { onSaved: () => void }) {
  const [kaspiSku, setKaspiSku] = useState('')
  const [productId, setProductId] = useState('')
  const [priceTenge, setPriceTenge] = useState('')
  const [kaspiName, setKaspiName] = useState('')
  const [kaspiBrand, setKaspiBrand] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/admin/kaspi-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kaspiSku, productId, priceTenge: Number(priceTenge), kaspiName, kaspiBrand }),
      })
      if (!res.ok) throw new Error(await res.text())
      setKaspiSku(''); setProductId(''); setPriceTenge(''); setKaspiName(''); setKaspiBrand('')
      onSaved()
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 gap-3">
      <label className="block">
        <span className="text-xs text-gray-600">Kaspi SKU *</span>
        <input value={kaspiSku} onChange={e => setKaspiSku(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-admin focus:ring-1 focus:ring-admin/20 outline-none"/>
      </label>
      <label className="block">
        <span className="text-xs text-gray-600">Product ID (Alash) *</span>
        <input value={productId} onChange={e => setProductId(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-admin focus:ring-1 focus:ring-admin/20 outline-none"/>
      </label>
      <label className="block">
        <span className="text-xs text-gray-600">Цена на Kaspi (тг) *</span>
        <input type="number" value={priceTenge} onChange={e => setPriceTenge(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-admin focus:ring-1 focus:ring-admin/20 outline-none"/>
      </label>
      <label className="block">
        <span className="text-xs text-gray-600">Имя на Kaspi</span>
        <input value={kaspiName} onChange={e => setKaspiName(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-admin focus:ring-1 focus:ring-admin/20 outline-none"/>
      </label>
      <label className="block">
        <span className="text-xs text-gray-600">Бренд</span>
        <input value={kaspiBrand} onChange={e => setKaspiBrand(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-admin focus:ring-1 focus:ring-admin/20 outline-none"/>
      </label>
      <div className="col-span-2 flex justify-end">
        <button type="submit" disabled={busy} className="px-4 py-2 bg-admin hover:bg-admin-hover text-white text-sm font-medium rounded-lg disabled:opacity-50">
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>
    </form>
  )
}

function CatalogUpload({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const upload = async (file: File) => {
    setBusy(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/kaspi-catalog/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'upload error')
      setMsg(`Загружено: ${data.upserted} офферов, всего в каталоге: ${data.totalInDb}`)
      setTimeout(() => setMsg(null), 6000)
      onDone()
    } catch (e) {
      setMsg('Ошибка: ' + (e as Error).message)
      setTimeout(() => setMsg(null), 8000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className={`px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium rounded-lg cursor-pointer transition-colors ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
      {busy ? 'Загружаю…' : '⬆ Загрузить ARCHIVE.xml'}
      <input
        type="file"
        accept=".xml,application/xml,text/xml"
        className="hidden"
        disabled={busy}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) upload(f)
          e.target.value = ''
        }}
      />
      {msg && <div className="absolute right-4 mt-12 text-xs bg-white border border-gray-200 rounded px-3 py-2 shadow-md max-w-md">{msg}</div>}
    </label>
  )
}
