'use client'

import React, { useEffect, useState } from 'react'

type OfferRow = {
  id?: string
  kaspiSku: string
  kaspiUrl?: string | null
  url: string
  priceTenge: string
  active: boolean
  kaspiName?: string | null
  kaspiBrand?: string | null
  lastSyncedAt?: string | null
}


// маппинг оффера из API → строка формы (с дефолтами демпинга)
function rowFromOffer(o: any): OfferRow {
  return {
    id: o.id,
    kaspiSku: o.kaspiSku,
    kaspiUrl: o.kaspiUrl,
    url: offerUrl(o),
    priceTenge: String(o.priceTenge ?? ''),
    active: o.active,
    kaspiName: o.kaspiName,
    kaspiBrand: o.kaspiBrand,
    lastSyncedAt: o.lastSyncedAt,
  }
}

function skuFromUrl(input: string): string | null {
  const s = input.trim()
  const m = s.match(/-(\d{6,})(?:[/?#]|$)/)
  if (m) return m[1]
  if (/^[\d_]+$/.test(s) && s.length >= 6) return s
  return null
}

function kaspiUrlFromSku(sku: string): string {
  return `https://kaspi.kz/shop/p/-${sku}/`
}

function offerUrl(o: { kaspiUrl?: string | null; kaspiSku: string }): string {
  return o.kaspiUrl || kaspiUrlFromSku(o.kaspiSku)
}

export default function KaspiSection({ productId, isNew }: { productId: string; isNew: boolean }) {
  const [rows, setRows] = useState<OfferRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (isNew || !productId) return
    setLoading(true)
    fetch(`/api/admin/products/${productId}/kaspi-offers`)
      .then(r => r.ok ? r.json() : { offers: [] })
      .then(data => {
        setRows((data.offers || []).map(rowFromOffer))
      })
      .finally(() => setLoading(false))
  }, [productId, isNew])

  const addRow = () => setRows(prev => [...prev, {
    kaspiSku: '', url: '', priceTenge: '', active: true,
  }])

  const updateRow = (i: number, patch: Partial<OfferRow>) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))

  const deleteOffer = async (i: number) => {
    const row = rows[i]
    if (!row?.id) {
      // ещё не сохранённая строка — просто убираем из формы
      removeRow(i)
      return
    }
    if (!confirm(`Удалить оффер ${row.kaspiSku} полностью? Он пропадёт из фида.`)) return
    try {
      const res = await fetch(`/api/admin/kaspi-offers/${row.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      removeRow(i)
      setMsg({ kind: 'ok', text: 'Оффер удалён' })
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg({ kind: 'err', text: 'Ошибка удаления: ' + (e as Error).message })
      setTimeout(() => setMsg(null), 5000)
    }
  }

  const onUrlChange = (i: number, value: string) => {
    const sku = skuFromUrl(value)
    updateRow(i, { url: value, kaspiSku: sku || '' })
  }

  const probeUrl = async (i: number) => {
    const row = rows[i]
    if (!row?.url || !row.kaspiSku) return
    updateRow(i, { probing: true } as any)
    try {
      const res = await fetch(`/api/admin/kaspi-catalog/lookup?sku=${encodeURIComponent(row.kaspiSku)}`)
      const data = await res.json()
      if (!data.found) {
        setMsg({ kind: 'err', text: `SKU ${row.kaspiSku} не найден в каталоге Kaspi. Загрузите свежий ARCHIVE.xml в /admin/kaspi-offers.` })
        setTimeout(() => setMsg(null), 6000)
        return
      }
      // Заполняем только пустые поля
      const patch: Partial<OfferRow> = {}
      if (data.name && !rows[i].kaspiName) patch.kaspiName = data.name
      if (data.brand && !rows[i].kaspiBrand) patch.kaspiBrand = data.brand
      if (data.price && !rows[i].priceTenge) patch.priceTenge = String(data.price)
      if (Object.keys(patch).length) updateRow(i, patch)
    } catch (e) {
      setMsg({ kind: 'err', text: 'Lookup: ' + (e as Error).message })
      setTimeout(() => setMsg(null), 4000)
    } finally {
      updateRow(i, { probing: false } as any)
    }
  }

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const items = rows
        .filter(r => r.url || r.kaspiSku)
        .map(r => ({
          url: r.url,
          kaspiSku: r.kaspiSku,
          priceTenge: Number(r.priceTenge) || 0,
          active: r.active,
          kaspiName: r.kaspiName || undefined,
          kaspiBrand: r.kaspiBrand || undefined,
        }))
      const res = await fetch(`/api/admin/products/${productId}/kaspi-offers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(err)
      }
      const data = await res.json()
      setRows((data.offers || []).map(rowFromOffer))
      const errs = (data.errors || []) as string[]
      if (errs.length) {
        setMsg({ kind: 'err', text: 'Сохранено с ошибками: ' + errs.join('; ') })
      } else {
        setMsg({ kind: 'ok', text: 'Kaspi офферы сохранены' })
      }
    } catch (e) {
      setMsg({ kind: 'err', text: 'Ошибка: ' + (e as Error).message })
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  if (isNew) {
    return (
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <span className="text-[15px] font-semibold text-[#333]">Kaspi.kz</span>
        </div>
        <div className="p-5 text-[13px] text-gray-400">
          Сохраните товар перед добавлением Kaspi-ссылок.
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <span className="text-[15px] font-semibold text-[#333]">Kaspi.kz</span>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="text-[13px] px-3 py-1.5 bg-admin hover:bg-admin-hover text-white rounded font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? 'Сохраняю…' : 'Сохранить Kaspi'}
        </button>
      </div>
      <div className="p-5">
        <p className="text-[13px] text-gray-400 mb-4 leading-relaxed">
          Ссылки на карточки Kaspi.kz для этого товара. SKU извлекается автоматически из URL.
          В фид Kaspi отправляется <b>название как на Kaspi</b> (может отличаться от сайта), бренд (если есть)
          и <b>остаток с сайта</b>. Если название пусто — оффер не попадает в фид. Удалённые ссылки деактивируются.
        </p>

        {loading && <div className="text-[13px] text-gray-400 py-4">Загрузка…</div>}

        {!loading && rows.length === 0 && (
          <p className="text-[13px] text-gray-400 mb-3">
            Нет Kaspi-офферов. Добавьте ссылку на карточку Kaspi, чтобы остатки и цена автоматически синхронизировались.
          </p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-gray-500 border-b border-gray-100">
                  <th className="font-medium pb-2 pr-3">URL карточки Kaspi</th>
                  <th className="font-medium pb-2 pr-3 w-[120px]">SKU</th>
                  <th className="font-medium pb-2 pr-3 w-[110px] text-right">Цена, тг</th>
                  <th className="font-medium pb-2 pr-3 w-[70px] text-center">Активен</th>
                  <th className="w-[70px]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <React.Fragment key={r.id || `new-${i}`}>
                  <tr className="border-b border-gray-50">
                    <td className="py-2 pr-3 space-y-1.5">
                      <div className="relative">
                        <input
                          type="text"
                          value={r.url}
                          onChange={e => onUrlChange(i, e.target.value)}
                          onBlur={() => probeUrl(i)}
                          placeholder="URL: https://kaspi.kz/shop/p/...-121012404/"
                          className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-admin transition-colors pr-20"
                        />
                        {(r as any).probing && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-admin">загрузка…</span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={r.kaspiName || ''}
                          onChange={e => updateRow(i, { kaspiName: e.target.value })}
                          placeholder="Название как на Kaspi"
                          className={`flex-1 border rounded px-2.5 py-1.5 text-[12px] outline-none focus:border-admin transition-colors ${r.kaspiName ? 'border-gray-200' : 'border-red-200 bg-red-50/30'}`}
                        />
                        <input
                          type="text"
                          value={r.kaspiBrand || ''}
                          onChange={e => updateRow(i, { kaspiBrand: e.target.value })}
                          placeholder="Бренд (необязательно)"
                          className="w-32 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] outline-none focus:border-admin transition-colors"
                        />
                      </div>
                      {!r.kaspiName && r.kaspiSku && (
                        <div className="text-[10px] text-red-500">Без названия оффер не попадёт в фид Kaspi</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[12px]">
                      {r.kaspiSku ? (
                        <span className="text-green-600">{r.kaspiSku}</span>
                      ) : r.url ? (
                        <span className="text-red-500 text-[11px]">не найден</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        value={r.priceTenge}
                        onChange={e => updateRow(i, { priceTenge: e.target.value })}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[13px] text-right outline-none focus:border-admin transition-colors"
                      />
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <button
                        type="button"
                        onClick={() => updateRow(i, { active: !r.active })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${r.active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition ${r.active ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    <td className="py-2 text-center whitespace-nowrap">

                      <button
                        type="button"
                        onClick={() => deleteOffer(i)}
                        className="text-gray-400 hover:text-red-500 transition-colors align-middle"
                        title="Удалить оффер полностью"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </td>
                  </tr>

                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          onClick={addRow}
          className="text-[13px] text-admin hover:text-admin-hover font-medium transition-colors mt-3"
        >
          + Добавить ссылку Kaspi
        </button>

        {msg && (
          <div className={`mt-3 text-[12px] ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</div>
        )}
      </div>
    </div>
  )
}

