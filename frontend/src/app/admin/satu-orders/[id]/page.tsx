'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  satuOtherStatuses, SATU_PROGRESS_STEPS, SATU_SETTABLE, SATU_CANCEL_REASONS,
  satuStatusLabels, satuStatusColors, satuStatusColorsLight, satuReviewLink,
} from '@/lib/satu-constants'

interface StatusLog {
  id: string
  fromStatus: string | null
  toStatus: string
  note: string | null
  createdAt: string
}

interface Item {
  id: string
  sku: string | null
  name: string | null
  quantity: number
  price: number
  imageUrl: string | null
  product: { id: string; name: string; slug: string; totalStock: number; imageUrl: string | null; sku: string | null } | null
}

interface Order {
  id: string
  satuOrderId: string
  status: string
  stockApplied: string | null
  totalPrice: number
  customerName: string | null
  customerPhone: string | null
  email: string | null
  deliveryName: string | null
  creationDate: string | null
  items: Item[]
  statusLogs: StatusLog[]
}

const STOCK_LABELS: Record<string, string> = {
  reserved: 'забронировано', completed: 'списано', released: 'снято (на складе)',
}

function fmtPrice(n: number) { return Math.round(n).toLocaleString('ru-RU') + ' ₸' }
function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' })
}
function fmtShort(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' })
}
function waDigits(phone: string) { return phone.replace(/\D/g, '').replace(/^8/, '7') }

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-gray-300 hover:text-purple-600 transition-colors p-0.5">
      {copied
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>}
    </button>
  )
}

// Блок «Запрос на отзыв про компанию» (как кнопка в кабинете Satu).
function ReviewRequestBlock({ satuOrderId }: { satuOrderId: string }) {
  const [copied, setCopied] = useState(false)
  const link = satuReviewLink(satuOrderId)
  const copy = () => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="text-[14px] font-semibold text-gray-900 mb-2">Запрос на отзыв про компанию</h2>
      <button onClick={copy}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 text-[13px] font-medium transition-colors">
        {copied
          ? <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Ссылка скопирована</>
          : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.8 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg> Скопировать запрос на отзыв</>}
      </button>
      <p className="text-[12px] text-gray-500 mt-2">У вас есть 30 дней, чтобы отправить запрос на отзыв покупателю, скопировав ссылку.</p>
      <a href={link} target="_blank" rel="noopener noreferrer" className="text-[11px] text-purple-600 hover:underline mt-1 inline-block break-all">Открыть на Satu →</a>
    </div>
  )
}

export default function SatuOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    const id = typeof params.id === 'string' ? params.id : params.id?.[0]
    if (!id) return
    const data = await fetch(`/api/admin/satu-orders/${id}`).then(r => r.ok ? r.json() : null)
    setOrder(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [params.id])

  const changeStatus = async (st: string) => {
    if (!order || st === order.status || saving) return
    let reason: string | undefined
    if (st === 'canceled') {
      const r = prompt('Причина отмены (Satu принимает только код):\n1 = Нет в наличии\n2 = Дубликат заказа', '1')
      if (r === null) return
      reason = r.trim() === '2' ? 'duplicate' : 'not_available'
    } else {
      if (!confirm(`Сменить статус на «${satuStatusLabels[st] || st}»? Запишется в Satu и обновит остатки.`)) return
    }
    setSaving(true); setMsg(null)
    try {
      const res = await fetch(`/api/admin/satu-orders/${order.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: st, reason }),
      })
      const d = await res.json()
      if (!res.ok && res.status !== 207) throw new Error(d.error || 'error')
      setMsg(d.pushedToSatu
        ? `Статус → ${satuStatusLabels[st] || st} (записан в Satu)`
        : `НЕ записан в Satu: ${(d.errors || []).join('; ')}`)
      await load()
    } catch (e) { setMsg('Ошибка: ' + (e as Error).message) }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-7 h-7 border-2 border-gray-200 border-t-purple-600 rounded-full animate-spin" />
    </div>
  )
  if (!order) return (
    <div className="text-center py-20">
      <p className="text-gray-400 mb-4 text-[15px]">Заказ не найден</p>
      <Link href="/admin/satu-orders" className="text-purple-700 hover:underline text-[14px]">← Назад к заказам Satu</Link>
    </div>
  )

  const currentStepIdx = SATU_PROGRESS_STEPS.indexOf(order.status)
  const isTerminal = order.status === 'canceled' || order.status === 'received'
  const others = satuOtherStatuses(order.status)
  const wa = order.customerPhone ? waDigits(order.customerPhone) : ''

  return (
    <div>
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/admin/satu-orders')} className="text-gray-400 hover:text-gray-700 mt-1 shrink-0 transition-colors">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Satu</span>
              <h1 className="text-[24px] font-bold text-gray-900 leading-none">Заказ № {order.satuOrderId}</h1>
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${satuStatusColorsLight[order.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {satuStatusLabels[order.status] || order.status}
              </span>
            </div>
            <p className="text-[13px] text-gray-400 mt-1">{fmtDateTime(order.creationDate)}</p>
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Итого</p>
          <p className="text-[22px] font-bold text-purple-700 leading-tight">{order.totalPrice.toLocaleString('ru-RU')} <span className="text-[14px] font-normal">тг</span></p>
        </div>
      </div>

      {msg && <div className="text-sm px-3 py-2 rounded-lg bg-purple-50 text-purple-800 border border-purple-200 mb-4">{msg}</div>}

      {/* STATUS PROGRESS */}
      {!isTerminal && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
          <div className="hidden sm:flex items-center justify-between relative">
            <div className="absolute left-0 right-0 top-5 h-1 bg-gray-100 z-0" style={{ margin: '0 20px' }} />
            <div className="absolute left-0 top-5 h-1 bg-purple-600 z-0 transition-all duration-500"
              style={{ margin: '0 20px', width: currentStepIdx > 0 ? `calc(${(currentStepIdx / (SATU_PROGRESS_STEPS.length - 1)) * 100}% - 40px)` : '0px' }} />
            {SATU_PROGRESS_STEPS.map((step, i) => {
              const done = currentStepIdx >= i
              const current = currentStepIdx === i
              const settable = step === order.status || SATU_SETTABLE.includes(step)
              return (
                <button key={step} onClick={() => settable && changeStatus(step)} disabled={saving || !settable}
                  className="flex flex-col items-center gap-2 relative z-10 group disabled:cursor-default">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[13px] transition-all border-2 ${
                    current ? 'bg-purple-600 border-purple-600 text-white shadow-md ring-4 ring-purple-600/20'
                    : done ? 'bg-purple-600 border-purple-600 text-white'
                    : 'bg-white border-gray-200 text-gray-400 group-hover:border-purple-400 group-hover:text-purple-600'
                  }`}>
                    {done ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : i + 1}
                  </div>
                  <span className={`text-[11px] font-medium whitespace-nowrap ${done ? 'text-purple-700' : 'text-gray-400 group-hover:text-gray-600'}`}>{satuStatusLabels[step]}</span>
                </button>
              )
            })}
          </div>
          <div className="sm:hidden space-y-2">
            {SATU_PROGRESS_STEPS.map((step, i) => {
              const done = currentStepIdx >= i
              const current = currentStepIdx === i
              const settable = step === order.status || SATU_SETTABLE.includes(step)
              return (
                <button key={step} onClick={() => settable && changeStatus(step)} disabled={saving || !settable}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    current ? 'border-purple-600 bg-purple-50' : done ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-white'
                  }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold border-2 ${done ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white border-gray-200 text-gray-400'}`}>
                    {done ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : i + 1}
                  </div>
                  <span className={`text-[13px] font-medium ${done ? 'text-purple-700' : 'text-gray-500'}`}>{satuStatusLabels[step]}</span>
                  {current && <span className="ml-auto text-[10px] font-semibold bg-purple-600 text-white px-2 py-0.5 rounded-full">Текущий</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* STATUS ACTIONS */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium block mb-1">Статус</label>
          <select value={order.status} onChange={e => changeStatus(e.target.value)} disabled={saving}
            className={`border-0 rounded-lg px-3 py-2 text-[13px] outline-none font-medium min-w-[160px] cursor-pointer disabled:opacity-60 ${satuStatusColors[order.status] || 'bg-gray-100 text-gray-700'}`}>
            <option value={order.status}>{satuStatusLabels[order.status] || order.status}</option>
            {others.map(s => <option key={s} value={s}>{satuStatusLabels[s]}</option>)}
          </select>
        </div>
        {saving && <div className="self-center pb-2"><div className="w-4 h-4 border-2 border-gray-200 border-t-purple-600 rounded-full animate-spin" /></div>}
        <p className="text-[12px] text-gray-400 self-center pb-1">
          Остатки: {order.stockApplied ? (STOCK_LABELS[order.stockApplied] || order.stockApplied) : '—'} · смена статуса пишется в Satu
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* LEFT */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Items */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-gray-900">Товары</h2>
              <span className="text-[12px] text-gray-400">{order.items.reduce((s, i) => s + i.quantity, 0)} шт.</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <th className="w-8 px-4 py-3 text-center text-[10px] text-gray-400 font-semibold uppercase tracking-wider">#</th>
                    <th className="w-12 px-2 py-3" />
                    <th className="px-3 py-3 text-left text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Артикул</th>
                    <th className="px-3 py-3 text-left text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Наименование</th>
                    <th className="px-3 py-3 text-right text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Цена</th>
                    <th className="px-3 py-3 text-right text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Кол-во</th>
                    <th className="px-3 py-3 text-right text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Остаток</th>
                    <th className="px-4 py-3 text-right text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it, i) => {
                    const img = it.imageUrl || it.product?.imageUrl
                    const stock = it.product?.totalStock
                    return (
                      <tr key={it.id} className="border-b border-gray-50 hover:bg-purple-50/30">
                        <td className="px-4 py-3 text-center text-gray-400">{i + 1}</td>
                        <td className="px-2 py-3">{img ? <img src={img} alt="" className="rounded-lg object-contain w-10 h-10" /> : <div className="w-10 h-10 bg-gray-100 rounded-lg" />}</td>
                        <td className="px-3 py-3 text-gray-400 font-mono text-[12px]">{it.sku || '—'}</td>
                        <td className="px-3 py-3">
                          {it.product
                            ? <Link href={`/admin/products/${it.product.id}`} className="text-purple-700 hover:underline line-clamp-2 leading-snug">{it.name || it.product.name}</Link>
                            : <span className="text-gray-700">{it.name || '—'} <span className="text-[11px] text-red-500">(не привязан)</span></span>}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">{fmtPrice(it.price)}</td>
                        <td className="px-3 py-3 text-right font-medium text-gray-900">{it.quantity} шт</td>
                        <td className="px-3 py-3 text-right">
                          {typeof stock === 'number'
                            ? <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${stock === 0 ? 'bg-red-50 text-red-500' : stock <= 5 ? 'bg-amber-50 text-amber-600' : 'text-gray-400'}`}>{stock} шт</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtPrice(it.price * it.quantity)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-100">
                    <td colSpan={7} className="px-4 py-4 text-right text-[13px] font-semibold text-gray-500">Итого:</td>
                    <td className="px-4 py-4 text-right text-[18px] font-bold text-purple-700">{order.totalPrice.toLocaleString('ru-RU')} тг</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* History */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-gray-900 mb-5">История заказа</h2>
            <div className="space-y-0">
              <div className="flex gap-4 pb-5">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-3 h-3 rounded-full bg-purple-600 ring-4 ring-purple-600/15 mt-0.5" />
                  {order.statusLogs.length > 0 && <div className="w-px flex-1 bg-gray-200 mt-2" />}
                </div>
                <div className="flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <span className="text-[13px] font-semibold text-gray-900">Заказ из Satu</span>
                    <span className="text-[12px] text-gray-400 font-mono">{order.creationDate ? fmtShort(order.creationDate) : '—'}</span>
                  </div>
                  <p className="text-[12px] text-gray-500 mt-0.5">{order.customerName || '—'}{order.customerPhone ? ` · ${order.customerPhone}` : ''}</p>
                </div>
              </div>
              {order.statusLogs.map((log, idx, arr) => (
                <div key={log.id} className="flex gap-4 pb-5">
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-3 h-3 rounded-full ring-4 ring-white shadow-sm mt-0.5 ${(satuStatusColors[log.toStatus] || 'bg-gray-400').split(' ')[0]}`} />
                    {idx < arr.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-2" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <span className="text-[13px] font-semibold text-gray-900">
                        {log.fromStatus && <span className="text-gray-500 font-normal">{satuStatusLabels[log.fromStatus] || log.fromStatus} → </span>}
                        <span>{satuStatusLabels[log.toStatus] || log.toStatus}</span>
                      </span>
                      <span className="text-[12px] text-gray-400 font-mono">{fmtShort(log.createdAt)}</span>
                    </div>
                    {log.note && <p className="text-[12px] text-gray-500 mt-1 italic">«{log.note}»</p>}
                  </div>
                </div>
              ))}
              {order.statusLogs.length === 0 && (
                <div className="text-[12px] text-gray-400 italic pl-7">История появится после первой смены статуса.</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="w-full lg:w-72 shrink-0 space-y-4">
          {/* Client */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-gray-900 mb-4">Клиент</h2>
            <p className="text-[15px] font-semibold text-gray-900 mb-2">{order.customerName || '—'}</p>
            {order.customerPhone && (
              <div className="flex items-center gap-2 mb-3">
                <a href={`tel:${order.customerPhone}`} className="text-[13px] text-purple-700 hover:underline font-mono">{order.customerPhone}</a>
                <CopyButton text={order.customerPhone} />
              </div>
            )}
            {order.email && (
              <div className="flex items-center gap-2 mb-3">
                <a href={`mailto:${order.email}`} className="text-[13px] text-purple-700 hover:underline truncate">{order.email}</a>
                <CopyButton text={order.email} />
              </div>
            )}
            {order.customerPhone && (
              <div className="flex gap-2">
                <a href={`tel:${order.customerPhone}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-[12px] font-medium rounded-lg transition-colors">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.81.36 1.6.7 2.34a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.74-1.74a2 2 0 012.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0122 16.92z"/></svg>
                  Позвонить
                </a>
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500 hover:bg-green-600 text-white text-[12px] font-medium rounded-lg transition-colors">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WhatsApp
                </a>
              </div>
            )}
          </div>

          {/* Delivery */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h2 className="text-[14px] font-semibold text-gray-900">Доставка</h2>
            <p className="text-[13px] text-gray-700">{order.deliveryName || '—'}</p>
            <p className="text-[11px] text-gray-400">Адрес и оплата управляются на стороне Satu.</p>
          </div>

          {/* Запрос на отзыв (для завершённых заказов) */}
          {(order.status === 'delivered' || order.status === 'received') && (
            <ReviewRequestBlock satuOrderId={order.satuOrderId} />
          )}

          {/* Cancel reasons hint */}
          {order.status !== 'canceled' && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-gray-900 mb-2">Коды отмены Satu</h2>
              <ul className="text-[12px] text-gray-500 space-y-1">
                {SATU_CANCEL_REASONS.map((r, i) => <li key={r.code}>{i + 1} — {r.label}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
