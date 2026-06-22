'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { statuses, statusLabels, statusColorsLightBorder, deliveryLabels, paymentLabels } from '@/lib/constants'

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
  product: {
    id: string
    name: string
    slug: string
    totalStock: number
    sku?: string | null
    images: { url: string }[]
  }
}

interface DraftLine {
  key: string
  productId: string
  quantity: number
  name: string
  sku: string | null
  unitPrice: number
  thumbUrl?: string | null
}

interface AdminProductPick {
  id: string
  name: string
  price: number
  inStock: boolean
  totalStock: number
  sku?: string | null
  images: { url: string }[]
}

interface Order {
  id: string
  orderNumber: number
  isPreorder: boolean
  status: string
  total: number
  name: string
  phone: string
  email: string | null
  address: string | null
  deliveryMethod: string | null
  paymentMethod: string | null
  comment: string | null
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  createdAt: string
  items: OrderItem[]
  statusLogs: StatusLog[]
  viewedProducts: {
    id: string
    product: { name: string; slug: string; price: number; images: { url: string }[] }
  }[]
  searchQueries: { id: string; query: string }[]
  user: { id: string; email: string; name: string | null; phone: string | null } | null
}

// Линейные шаги (1-4). Пятый шаг — развилка: «Доставлен» ИЛИ «Забрали заказ».
const STATUS_STEPS = [
  { key: 'NEW',        label: 'Новый',        color: 'text-red-500' },
  { key: 'CONFIRMED',  label: 'Подтверждён',  color: 'text-yellow-600' },
  { key: 'PROCESSING', label: 'В обработке',  color: 'text-orange-500' },
  { key: 'SHIPPED',    label: 'Отправлен',    color: 'text-purple-600' },
]
// Финальная развилка (5-й шаг): два взаимоисключающих исхода.
const FINAL_CHOICES = [
  { key: 'DELIVERED', label: 'Доставлен' },
  { key: 'PICKED_UP', label: 'Забрали заказ' },
]
const FINAL_KEYS = FINAL_CHOICES.map(c => c.key)

const STATUS_DOT_COLORS: Record<string, string> = {
  NEW: 'bg-red-500', CONFIRMED: 'bg-yellow-500', PROCESSING: 'bg-orange-500',
  SHIPPED: 'bg-purple-500', DELIVERED: 'bg-green-500', PICKED_UP: 'bg-teal-500', CANCELLED: 'bg-gray-400',
}

const ITEMS_LOCKED_STATUSES = new Set(['CANCELLED', 'SHIPPED', 'DELIVERED', 'PICKED_UP'])

function formatElapsed(fromDate: Date, toDate: Date): string {
  const ms = toDate.getTime() - fromDate.getTime()
  const mins = Math.floor(ms / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `через ${days} дн.`
  if (hours > 0) return `через ${hours} ч. ${mins % 60} мин.`
  if (mins > 0) return `через ${mins} мин.`
  return 'мгновенно'
}

function printOrder(order: Order, dateStr: string, timeStr: string) {
  const w = window.open('', '_blank'); if (!w) return
  const doc = w.document; doc.open(); doc.close(); doc.title = `Заказ #${order.orderNumber}`
  const style = doc.createElement('style')
  style.textContent = 'body{font-family:Arial,sans-serif;font-size:13px;color:#333;max-width:800px;margin:0 auto;padding:20px}table{width:100%;border-collapse:collapse;margin:16px 0}th{text-align:left;padding:8px;border-bottom:2px solid #333;font-size:12px;text-transform:uppercase;color:#666}td{padding:6px 8px;border-bottom:1px solid #eee}@media print{body{padding:0}}'
  doc.head.appendChild(style)
  const el = (t: string, tx?: string, css?: string) => { const e = doc.createElement(t); if (tx) e.textContent = tx; if (css) e.style.cssText = css; return e }
  const h = el('div', undefined, 'display:flex;justify-content:space-between;margin-bottom:20px')
  const hL = el('div'); hL.appendChild(el('h1', `Заказ #${order.orderNumber}`, 'font-size:20px;margin:0 0 4px')); hL.appendChild(el('p', `${dateStr} в ${timeStr}`, 'color:#666;font-size:12px'))
  const hR = el('div', undefined, 'text-align:right'); hR.appendChild(el('strong', 'ИП КРУН')); hR.appendChild(doc.createElement('br')); hR.appendChild(el('span', '+7(700) 900-17-90', 'color:#666;font-size:12px'))
  h.append(hL, hR)
  const info = el('div', undefined, 'display:flex;gap:40px;margin:16px 0;background:#f9f9f9;padding:12px;border-radius:6px')
  const mb = (t: string, lines: string[]) => { const b = el('div'); b.appendChild(el('h3', t, 'font-size:11px;text-transform:uppercase;color:#999;margin:0 0 4px')); lines.filter(Boolean).forEach(l => b.appendChild(el('p', l, 'margin:2px 0'))); return b }
  info.append(mb('Клиент', [order.name, order.phone, order.email||'']), mb('Доставка', [deliveryLabels[order.deliveryMethod||'']||'—', order.address||'']), mb('Оплата', [paymentLabels[order.paymentMethod||'']||'—']))
  const table = doc.createElement('table')
  const thead = doc.createElement('thead'); const hr = doc.createElement('tr')
  ;[{t:'#',s:'width:30px;text-align:center'},{t:'Артикул',s:''},{t:'Наименование',s:''},{t:'Цена',s:'text-align:right'},{t:'Кол-во',s:'text-align:center'},{t:'Сумма',s:'text-align:right'}].forEach(c=>{hr.appendChild(el('th',c.t,c.s))})
  thead.appendChild(hr); table.appendChild(thead)
  const tbody = doc.createElement('tbody')
  order.items.forEach((item,i) => { const tr=doc.createElement('tr'); [{t:String(i+1),s:'text-align:center'},{t:item.product.sku||'—',s:''},{t:item.product.name,s:''},{t:`${item.price.toLocaleString('ru-RU')} тг`,s:'text-align:right'},{t:String(item.quantity),s:'text-align:center'},{t:`${(item.price*item.quantity).toLocaleString('ru-RU')} тг`,s:'text-align:right;font-weight:600'}].forEach(c=>{tr.appendChild(el('td',c.t,c.s))}); tbody.appendChild(tr) })
  const ttr=doc.createElement('tr'); const td1=el('td','Итого:','text-align:right;padding:10px 8px;font-weight:700;font-size:14px;border-top:2px solid #333') as HTMLTableCellElement; td1.colSpan=5; ttr.append(td1,el('td',`${order.total.toLocaleString('ru-RU')} тг`,'text-align:right;padding:10px 8px;font-weight:700;font-size:14px;border-top:2px solid #333')); tbody.appendChild(ttr); table.appendChild(tbody)
  doc.body.append(h, info, table)
  if (order.comment) { const p=el('p',undefined,'margin-top:16px;padding:12px;background:#fff3cd;border-radius:4px'); p.append(el('strong','Комментарий: '),doc.createTextNode(order.comment)); doc.body.appendChild(p) }
  setTimeout(() => w.print(), 300)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-gray-300 hover:text-admin transition-colors p-0.5"
    >
      {copied
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      }
    </button>
  )
}

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingComment, setEditingComment] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const [editingItems, setEditingItems] = useState(false)
  const [draftLines, setDraftLines] = useState<DraftLine[]>([])
  const [itemsSaving, setItemsSaving] = useState(false)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<AdminProductPick[]>([])
  const [productSearchLoading, setProductSearchLoading] = useState(false)
  /** Черновик строки количества (только цифры), чтобы можно было ввести 0 и набрать «10» без мгновенного удаления */
  const [qtyDraftByKey, setQtyDraftByKey] = useState<Record<string, string>>({})

  const qtyDisplay = (line: DraftLine) =>
    qtyDraftByKey[line.key] !== undefined ? qtyDraftByKey[line.key] : String(line.quantity)

  const clearQtyDraftKey = (key: string) => {
    setQtyDraftByKey(prev => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const onQtyDigitsChange = (line: DraftLine, raw: string) => {
    const digits = raw.replace(/\D/g, '')
    setQtyDraftByKey(prev => ({ ...prev, [line.key]: digits }))
  }

  const commitQtyOnBlur = (line: DraftLine) => {
    const raw = (qtyDraftByKey[line.key] !== undefined ? qtyDraftByKey[line.key] : String(line.quantity)).trim()
    if (raw === '') {
      clearQtyDraftKey(line.key)
      return
    }
    const n = parseInt(raw.replace(/\D/g, ''), 10)
    if (!Number.isFinite(n) || n < 0) {
      clearQtyDraftKey(line.key)
      return
    }
    if (n === 0) {
      const label = line.name.length > 90 ? `${line.name.slice(0, 90)}…` : line.name
      if (typeof window !== 'undefined' && window.confirm(`Убрать «${label}» из заказа?`)) {
        setDraftLines(prev => prev.filter(l => l.key !== line.key))
      }
      clearQtyDraftKey(line.key)
      return
    }
    setDraftLines(prev => prev.map(l => (l.key === line.key ? { ...l, quantity: n } : l)))
    clearQtyDraftKey(line.key)
  }

  useEffect(() => {
    fetch(`/api/admin/orders/${params.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setOrder(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [params.id])

  useEffect(() => { if (editingComment) commentRef.current?.focus() }, [editingComment])

  useEffect(() => {
    if (!editingItems) return
    const q = productSearch.trim()
    const minLen = /^\d+$/.test(q) ? 1 : 2
    if (q.length < minLen) {
      setProductResults([])
      setProductSearchLoading(false)
      return
    }
    const ac = new AbortController()
    const t = setTimeout(() => {
      setProductSearchLoading(true)
      fetch(`/api/admin/products?search=${encodeURIComponent(q)}&limit=20&sortBy=name`, {
        credentials: 'include',
        signal: ac.signal,
      })
        .then(r => {
          if (!r.ok) throw new Error('search failed')
          return r.json()
        })
        .then((d: { products?: AdminProductPick[] }) => {
          setProductResults(Array.isArray(d?.products) ? d.products : [])
        })
        .catch(err => {
          if (err?.name !== 'AbortError') setProductResults([])
        })
        .finally(() => setProductSearchLoading(false))
    }, 280)
    return () => {
      clearTimeout(t)
      ac.abort()
      setProductSearchLoading(false)
    }
  }, [productSearch, editingItems])

  const reloadOrder = async () => {
    const id = typeof params.id === 'string' ? params.id : params.id?.[0]
    if (!id) return
    const fresh = await fetch(`/api/admin/orders/${id}`).then(r => r.ok ? r.json() : null)
    if (fresh) setOrder(fresh)
  }

  const startEditItems = () => {
    if (!order) return
    setDraftLines(order.items.map(i => ({
      key: i.id,
      productId: i.product.id,
      quantity: i.quantity,
      name: i.product.name,
      sku: i.product.sku ?? null,
      unitPrice: i.price,
      thumbUrl: i.product.images[0]?.url ?? null,
    })))
    setEditingItems(true)
    setItemsError(null)
    setProductSearch('')
    setProductResults([])
    setQtyDraftByKey({})
  }

  const cancelEditItems = () => {
    setEditingItems(false)
    setItemsError(null)
    setProductSearch('')
    setProductResults([])
    setQtyDraftByKey({})
  }

  const saveDraftItems = async () => {
    if (!order) return
    if (draftLines.length === 0) {
      setItemsError('Добавьте хотя бы один товар')
      return
    }
    setItemsSaving(true)
    setItemsError(null)
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: draftLines.map(d => ({ productId: d.productId, quantity: d.quantity })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setItemsError(typeof data.error === 'string' ? data.error : 'Не удалось сохранить')
        return
      }
      await reloadOrder()
      setEditingItems(false)
      setProductSearch('')
      setProductResults([])
      setQtyDraftByKey({})
    } catch {
      setItemsError('Не удалось сохранить')
    } finally {
      setItemsSaving(false)
    }
  }

  const addProductToDraft = (p: AdminProductPick) => {
    setDraftLines(prev => {
      const existing = prev.find(l => l.productId === p.id)
      if (existing) {
        return prev.map(l => l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l)
      }
      return [...prev, {
        key: `new-${p.id}-${Date.now()}`,
        productId: p.id,
        quantity: 1,
        name: p.name,
        sku: p.sku ?? null,
        unitPrice: p.price,
        thumbUrl: p.images[0]?.url ?? null,
      }]
    })
    setProductSearch('')
    setProductResults([])
  }

  const updateOrder = async (fields: Partial<Pick<Order, 'status' | 'paymentMethod' | 'deliveryMethod' | 'comment'>>) => {
    if (!order) return
    setSaving(true)
    const res = await fetch(`/api/admin/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (res.ok) {
      const updated = await res.json()
      // Reload full order to get new statusLog
      if (fields.status) {
        const fresh = await fetch(`/api/admin/orders/${order.id}`).then(r => r.ok ? r.json() : null)
        if (fresh) setOrder(fresh)
        else setOrder(prev => prev ? { ...prev, ...fields } : null)
      } else {
        setOrder(prev => prev ? { ...prev, ...fields } : null)
      }
    }
    setSaving(false)
  }

  const saveComment = async () => {
    setEditingComment(false)
    if (!order || commentDraft === (order.comment || '')) return
    await updateOrder({ comment: commentDraft || null })
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-7 h-7 border-2 border-gray-200 border-t-admin rounded-full animate-spin" />
    </div>
  )

  if (!order) return (
    <div className="text-center py-20">
      <p className="text-gray-400 mb-4 text-[15px]">Заказ не найден</p>
      <Link href="/admin/orders" className="text-admin hover:underline text-[14px]">← Назад к заказам</Link>
    </div>
  )

  const createdDate = new Date(order.createdAt)
  const dateStr = createdDate.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
  const timeStr = createdDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

  const isCancelled = order.status === 'CANCELLED'
  const isPickedUp = order.status === 'PICKED_UP'
  const isFinal = FINAL_KEYS.includes(order.status)
  // Бар скрываем только для отмены. Для Доставлен/Забрали — показываем (5-й шаг готов).
  const hideProgress = order.status === 'CANCELLED'
  // Индекс текущего шага: для финальных статусов — на позиции 5-го узла (длина STATUS_STEPS).
  const currentStepIdx = isFinal ? STATUS_STEPS.length : STATUS_STEPS.findIndex(s => s.key === order.status)
  const totalSlots = STATUS_STEPS.length + 1 // 4 линейных + 1 финальный
  const whatsappPhone = order.phone.replace(/[^0-9]/g, '').replace(/^8/, '7')
  const itemsEditable = !ITEMS_LOCKED_STATUSES.has(order.status)
  const draftTotal = draftLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)

  const pickSearchQ = productSearch.trim()
  const pickMinLen = pickSearchQ.length > 0 && /^\d+$/.test(pickSearchQ) ? 1 : 2
  const showPickDropdown = editingItems && pickSearchQ.length >= pickMinLen

  return (
    <div>
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/admin/orders')} className="text-gray-400 hover:text-gray-700 mt-1 shrink-0 transition-colors">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[26px] font-bold text-gray-900 leading-none">Заказ #{order.orderNumber}</h1>
              {order.isPreorder && <span className="text-[11px] font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">Предзаказ</span>}
              {isCancelled && <span className="text-[11px] font-semibold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">Отменён</span>}
              {isPickedUp && <span className="text-[11px] font-semibold bg-teal-100 text-teal-700 px-2.5 py-1 rounded-full">Самовывоз</span>}
            </div>
            <p className="text-[13px] text-gray-400 mt-1">{dateStr} в {timeStr}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:text-right">
          <div className="bg-admin/5 border border-admin/15 rounded-xl px-4 py-2.5 mr-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Итого</p>
            <p className="text-[22px] font-bold text-admin leading-tight">{order.total.toLocaleString('ru-RU')} <span className="text-[14px] font-normal">тг</span></p>
          </div>
          <button onClick={() => printOrder(order, dateStr, timeStr)}
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Печать
          </button>
        </div>
      </div>

      {/* ── STATUS PROGRESS BAR ── */}
      {!hideProgress && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
          {/* Desktop */}
          <div className="hidden sm:flex items-center justify-between relative">
            {/* Background line */}
            <div className="absolute left-0 right-0 top-5 h-1 bg-gray-100 z-0" style={{ margin: '0 20px' }} />
            {/* Progress fill */}
            <div
              className="absolute left-0 top-5 h-1 bg-admin z-0 transition-all duration-500"
              style={{ margin: '0 20px', width: currentStepIdx > 0 ? `calc(${(currentStepIdx / (totalSlots - 1)) * 100}% - 40px)` : '0px' }}
            />
            {STATUS_STEPS.map((step, i) => {
              const done = currentStepIdx >= i
              const current = currentStepIdx === i
              return (
                <button
                  key={step.key}
                  onClick={() => !saving && updateOrder({ status: step.key })}
                  disabled={saving}
                  title={`Перейти в статус: ${step.label}`}
                  className="flex flex-col items-center gap-2 relative z-10 group"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[13px] transition-all duration-300 border-2 ${
                    done && !current ? 'bg-admin border-admin text-white shadow-sm'
                    : current ? 'bg-admin border-admin text-white shadow-md ring-4 ring-admin/20'
                    : 'bg-white border-gray-200 text-gray-400 group-hover:border-admin/50 group-hover:text-admin/70'
                  }`}>
                    {done
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      : <span>{i + 1}</span>
                    }
                  </div>
                  <span className={`text-[11px] font-medium whitespace-nowrap transition-colors ${
                    done ? 'text-admin' : 'text-gray-400 group-hover:text-gray-600'
                  }`}>{step.label}</span>
                </button>
              )
            })}
            {/* 5-й шаг — развилка: Доставлен ИЛИ Забрали заказ */}
            <div className="flex flex-col items-center gap-2 relative z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[13px] border-2 ${
                isFinal ? 'bg-admin border-admin text-white shadow-md ring-4 ring-admin/20' : 'bg-white border-gray-200 text-gray-400'
              }`}>
                {isFinal
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  : <span>5</span>}
              </div>
              <div className="flex items-center gap-1.5">
                {FINAL_CHOICES.map(c => {
                  const active = order.status === c.key
                  return (
                    <button key={c.key} onClick={() => !saving && updateOrder({ status: c.key })} disabled={saving}
                      title={`Перейти в статус: ${c.label}`}
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-md border transition-colors ${
                        active ? 'bg-admin text-white border-admin'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-admin/50 hover:text-admin'
                      }`}>
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Mobile: vertical cards */}
          <div className="sm:hidden space-y-2">
            {STATUS_STEPS.map((step, i) => {
              const done = currentStepIdx >= i
              const current = currentStepIdx === i
              return (
                <button key={step.key} onClick={() => !saving && updateOrder({ status: step.key })} disabled={saving}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    current ? 'border-admin bg-admin/5 shadow-sm'
                    : done ? 'border-gray-200 bg-gray-50'
                    : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold border-2 ${
                    done ? 'bg-admin border-admin text-white'
                    : 'bg-white border-gray-200 text-gray-400'
                  }`}>
                    {done ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : i + 1}
                  </div>
                  <span className={`text-[13px] font-medium ${done ? 'text-admin' : 'text-gray-500'}`}>{step.label}</span>
                  {current && <span className="ml-auto text-[10px] font-semibold bg-admin text-white px-2 py-0.5 rounded-full">Текущий</span>}
                </button>
              )
            })}
            {/* 5-й шаг — две взаимоисключающие кнопки */}
            <div className="flex items-stretch gap-2">
              {FINAL_CHOICES.map((c, idx) => {
                const active = order.status === c.key
                return (
                  <button key={c.key} onClick={() => !saving && updateOrder({ status: c.key })} disabled={saving}
                    className={`flex-1 flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all text-left ${
                      active ? 'border-admin bg-admin/5 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold border-2 ${
                      active ? 'bg-admin border-admin text-white' : 'bg-white border-gray-200 text-gray-400'
                    }`}>
                      {active ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : '5'}
                    </div>
                    <span className={`text-[12px] font-medium ${active ? 'text-admin' : 'text-gray-500'}`}>{c.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── STATUS / PAYMENT / DELIVERY SELECTS ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium block mb-1">Статус</label>
          <select value={order.status} onChange={e => updateOrder({ status: e.target.value })} disabled={saving}
            className={`border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-admin font-medium min-w-[150px] ${statusColorsLightBorder[order.status] || 'border-gray-200 text-gray-700'}`}
          >
            {statuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium block mb-1">Оплата</label>
          <select value={order.paymentMethod || ''} onChange={e => updateOrder({ paymentMethod: e.target.value || null })} disabled={saving}
            className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-admin text-gray-700 bg-white min-w-[140px]"
          >
            <option value="">—</option>
            {Object.entries(paymentLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-400 font-medium block mb-1">Доставка</label>
          <select value={order.deliveryMethod || ''} onChange={e => updateOrder({ deliveryMethod: e.target.value || null })} disabled={saving}
            className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-admin text-gray-700 bg-white min-w-[140px]"
          >
            <option value="">—</option>
            {Object.entries(deliveryLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {saving && (
          <div className="self-end pb-2.5">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-admin rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* ── LEFT ── */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Items */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-visible">
            <div className="px-5 py-3.5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[14px] font-semibold text-gray-900">Товары</h2>
                {editingItems && (
                  <span className="text-[11px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Редактирование</span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2 flex-wrap justify-end">
                {!editingItems ? (
                  <>
                    <span className="text-[12px] text-gray-400">{order.items.reduce((s, i) => s + i.quantity, 0)} шт.</span>
                    {itemsEditable ? (
                      <button type="button" onClick={startEditItems}
                        className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-admin text-white hover:bg-admin-hover transition-colors shadow-sm"
                      >
                        Изменить
                      </button>
                    ) : (
                      <span
                        className="text-[11px] text-gray-400 max-w-[280px] text-right leading-snug"
                        title="Состав заказа можно менять только до отправки клиенту"
                      >
                        Изменение недоступно: заказ в статусе «{statusLabels[order.status] ?? order.status}»
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-[11px] text-gray-500 max-w-[220px] sm:max-w-none leading-tight">
                      Черновик: <strong className="text-gray-800">{draftTotal.toLocaleString('ru-RU')} тг</strong>
                      <span className="text-gray-400"> (итог пересчитается по актуальным ценам в базе)</span>
                    </span>
                    <button type="button" onClick={cancelEditItems} disabled={itemsSaving}
                      className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Отмена
                    </button>
                    <button type="button" onClick={saveDraftItems} disabled={itemsSaving || draftLines.length === 0}
                      className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-admin text-white hover:bg-admin-hover disabled:opacity-50"
                    >
                      {itemsSaving ? 'Сохранение…' : 'Сохранить состав'}
                    </button>
                  </>
                )}
              </div>
            </div>
            {itemsError && (
              <div className="px-5 py-2.5 bg-red-50 text-red-700 text-[13px] border-b border-red-100">{itemsError}</div>
            )}

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-gray-100">
              {!editingItems ? order.items.map((item) => {
                const img = item.product.images[0]?.url
                const sku = item.product.sku
                const lowStock = item.product.totalStock > 0 && item.product.totalStock <= 5
                const noStock = item.product.totalStock === 0
                return (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                    {img
                      ? <Image src={img} alt="" width={44} height={44} className="rounded-lg object-contain shrink-0 bg-gray-50" />
                      : <div className="w-11 h-11 bg-gray-100 rounded-lg shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <Link href={`/admin/products/${item.product.id}`} className="text-[13px] text-admin hover:underline line-clamp-2 leading-snug font-medium">
                        {item.product.name}
                      </Link>
                      {sku && <div className="text-[11px] text-gray-400 font-mono mt-0.5">{sku}</div>}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[12px] text-gray-500">{item.price.toLocaleString('ru-RU')} тг × {item.quantity} шт</span>
                        <span className="text-[13px] font-bold text-gray-900">{(item.quantity * item.price).toLocaleString('ru-RU')} тг</span>
                      </div>
                      <span className={`text-[11px] font-medium mt-1 inline-block ${noStock ? 'text-red-500' : lowStock ? 'text-amber-600' : 'text-gray-400'}`}>
                        Остаток: {item.product.totalStock} шт
                      </span>
                    </div>
                  </div>
                )
              }) : draftLines.map((line) => {
                const img = line.thumbUrl
                return (
                  <div key={line.key} className="px-4 py-3 flex items-start gap-3">
                    {img
                      ? <Image src={img} alt="" width={44} height={44} className="rounded-lg object-contain shrink-0 bg-gray-50" />
                      : <div className="w-11 h-11 bg-gray-100 rounded-lg shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/admin/products/${line.productId}`} className="text-[13px] text-admin hover:underline line-clamp-2 leading-snug font-medium">
                          {line.name}
                        </Link>
                        <button type="button" onClick={() => setDraftLines(prev => prev.filter(l => l.key !== line.key))}
                          disabled={itemsSaving}
                          className="shrink-0 p-1 text-gray-400 hover:text-red-500 disabled:opacity-40"
                          title="Убрать из заказа"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6"/></svg>
                        </button>
                      </div>
                      {line.sku && <div className="text-[11px] text-gray-400 font-mono mt-0.5">{line.sku}</div>}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-[12px] text-gray-500">{line.unitPrice.toLocaleString('ru-RU')} тг</span>
                        <span className="text-[12px] text-gray-400">×</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={qtyDisplay(line)}
                          disabled={itemsSaving}
                          onChange={e => onQtyDigitsChange(line, e.target.value)}
                          onBlur={() => commitQtyOnBlur(line)}
                          className="w-16 border border-gray-200 rounded px-2 py-1 text-[13px] text-center tabular-nums"
                        />
                        <span className="text-[12px] text-gray-500">шт</span>
                        <span className="text-[13px] font-bold text-gray-900 ml-auto">
                          {(line.quantity * line.unitPrice).toLocaleString('ru-RU')} тг
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {!editingItems ? (
                <div className="px-4 py-3 flex items-center justify-between bg-gray-50/50">
                  <span className="text-[13px] font-semibold text-gray-500">Итого к оплате:</span>
                  <span className="text-[16px] font-bold text-admin">{order.total.toLocaleString('ru-RU')} тг</span>
                </div>
              ) : (
                <div className="px-4 py-4 space-y-3 bg-gray-50/30 border-t border-gray-100 relative z-10">
                  <p className="text-[11px] text-gray-500">Добавить товар: от 2 символов в названии или от 1 цифры в артикуле (умный поиск как на сайте)</p>
                  <div className="relative z-[100]">
                    <input type="text" value={productSearch} disabled={itemsSaving}
                      onChange={e => setProductSearch(e.target.value)}
                      placeholder="Поиск…"
                      autoComplete="off"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-admin bg-white relative z-10"
                    />
                    {productSearchLoading && (
                      <p className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 z-20 pointer-events-none">Поиск…</p>
                    )}
                    {showPickDropdown && (
                      <ul className="absolute left-0 right-0 top-full z-[200] mt-1 max-h-[min(70vh,20rem)] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl text-[13px]">
                        {productSearchLoading ? (
                          <li className="px-3 py-2.5 text-gray-400 text-[12px]">Поиск…</li>
                        ) : productResults.length === 0 ? (
                          <li className="px-3 py-2.5 text-gray-400 text-[12px]">Ничего не найдено</li>
                        ) : (
                          productResults.map(p => {
                            const pimg = p.images[0]?.url
                            return (
                            <li key={p.id}>
                              <button type="button" disabled={itemsSaving}
                                onClick={() => addProductToDraft(p)}
                                className="w-full text-left px-3 py-2 hover:bg-admin/5 flex gap-2.5 items-center"
                              >
                                {pimg
                                  ? <Image src={pimg} alt="" width={36} height={36} className="rounded-md object-contain shrink-0 bg-gray-50 border border-gray-100" />
                                  : <div className="w-9 h-9 bg-gray-100 rounded-md shrink-0" />
                                }
                                <span className="line-clamp-2 flex-1 min-w-0">{p.name}</span>
                                <span className="shrink-0 text-right">
                                  <span className="block text-gray-600">{p.price.toLocaleString('ru-RU')} тг</span>
                                  {p.sku && (
                                    <span className="block text-[11px] text-gray-400 font-mono">{p.sku}</span>
                                  )}
                                </span>
                              </button>
                            </li>
                            )
                          })
                        )}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                    <span className="text-[13px] font-semibold text-gray-500">Черновик:</span>
                    <span className="text-[16px] font-bold text-admin">{draftTotal.toLocaleString('ru-RU')} тг</span>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop table: без overflow-y clip — выпадающий поиск вынесен под таблицу */}
            <div className="hidden sm:block overflow-x-auto overflow-y-visible">
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
                  {!editingItems ? order.items.map((item, i) => {
                    const img = item.product.images[0]?.url
                    const sku = item.product.sku
                    const lowStock = item.product.totalStock > 0 && item.product.totalStock <= 5
                    const noStock = item.product.totalStock === 0
                    return (
                      <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/40 transition-colors">
                        <td className="px-4 py-3 text-center text-gray-400">{i + 1}</td>
                        <td className="px-2 py-3">
                          {img ? <Image src={img} alt="" width={40} height={40} className="rounded-lg object-contain" /> : <div className="w-10 h-10 bg-gray-100 rounded-lg" />}
                        </td>
                        <td className="px-3 py-3 text-gray-400 font-mono text-[12px]">{sku || '—'}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Link href={`/admin/products/${item.product.id}`} className="text-admin hover:underline line-clamp-2 leading-snug">{item.product.name}</Link>
                            <a href={`/product/${item.product.slug}`} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-admin transition-colors shrink-0">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </a>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">{item.price.toLocaleString('ru-RU')} тг</td>
                        <td className="px-3 py-3 text-right font-medium text-gray-900">{item.quantity} шт</td>
                        <td className="px-3 py-3 text-right">
                          <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${noStock ? 'bg-red-50 text-red-500' : lowStock ? 'bg-amber-50 text-amber-600' : 'text-gray-400'}`}>
                            {item.product.totalStock} шт
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{(item.quantity * item.price).toLocaleString('ru-RU')} тг</td>
                      </tr>
                    )
                  }) : draftLines.map((line, i) => {
                    const img = line.thumbUrl
                    return (
                      <tr key={line.key} className="border-b border-gray-50">
                        <td className="px-4 py-3 text-center text-gray-400">{i + 1}</td>
                        <td className="px-2 py-3">
                          {img ? <Image src={img} alt="" width={40} height={40} className="rounded-lg object-contain" /> : <div className="w-10 h-10 bg-gray-100 rounded-lg" />}
                        </td>
                        <td className="px-3 py-3 text-gray-400 font-mono text-[12px]">{line.sku || '—'}</td>
                        <td className="px-3 py-3">
                          <Link href={`/admin/products/${line.productId}`} className="text-admin hover:underline line-clamp-2 leading-snug">{line.name}</Link>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">{line.unitPrice.toLocaleString('ru-RU')} тг</td>
                        <td className="px-3 py-3 text-right">
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={qtyDisplay(line)}
                            disabled={itemsSaving}
                            onChange={e => onQtyDigitsChange(line, e.target.value)}
                            onBlur={() => commitQtyOnBlur(line)}
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-[13px] text-right ml-auto inline-block tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-3 text-right text-gray-400">—</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-bold text-gray-900">{(line.quantity * line.unitPrice).toLocaleString('ru-RU')} тг</span>
                            <button type="button" onClick={() => setDraftLines(prev => prev.filter(l => l.key !== line.key))}
                              disabled={itemsSaving} className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-40" title="Убрать"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {!editingItems && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-100">
                      <td colSpan={7} className="px-4 py-4 text-right text-[13px] font-semibold text-gray-500">Итого к оплате:</td>
                      <td className="px-4 py-4 text-right text-[18px] font-bold text-admin">{order.total.toLocaleString('ru-RU')} тг</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {editingItems && (
              <div className="hidden sm:flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 px-4 py-4 border-t border-gray-100 bg-gray-50/40 relative z-[100]">
                <div className="flex-1 min-w-0 max-w-xl">
                  <p className="text-[11px] text-gray-500 mb-1.5">Добавить товар — умный поиск (как в каталоге): название, SKU, раскладка</p>
                  <div className="relative z-[100]">
                    <input type="text" value={productSearch} disabled={itemsSaving}
                      onChange={e => setProductSearch(e.target.value)}
                      placeholder="От 2 символов в названии или от 1 цифры в артикуле…"
                      autoComplete="off"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-16 text-[13px] outline-none focus:border-admin bg-white relative z-10"
                    />
                    {productSearchLoading && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 z-20 pointer-events-none">Поиск…</span>
                    )}
                    {showPickDropdown && (
                      <ul className="absolute left-0 right-0 top-full z-[200] mt-1 max-h-[min(70vh,22rem)] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl text-[13px]">
                        {productSearchLoading ? (
                          <li className="px-3 py-2.5 text-gray-400 text-[12px]">Поиск…</li>
                        ) : productResults.length === 0 ? (
                          <li className="px-3 py-2.5 text-gray-400 text-[12px]">Ничего не найдено</li>
                        ) : (
                          productResults.map(p => {
                            const pimg = p.images[0]?.url
                            return (
                            <li key={p.id}>
                              <button type="button" disabled={itemsSaving} onClick={() => addProductToDraft(p)}
                                className="w-full text-left px-3 py-2 hover:bg-admin/5 flex gap-3 items-center"
                              >
                                {pimg
                                  ? <Image src={pimg} alt="" width={36} height={36} className="rounded-md object-contain shrink-0 bg-gray-50 border border-gray-100" />
                                  : <div className="w-9 h-9 bg-gray-100 rounded-md shrink-0" />
                                }
                                <span className="line-clamp-2 flex-1 min-w-0">{p.name}</span>
                                <span className="shrink-0 text-right">
                                  <span className="block text-gray-600">{p.price.toLocaleString('ru-RU')} тг</span>
                                  {p.sku && (
                                    <span className="block text-[11px] text-gray-400 font-mono">{p.sku}</span>
                                  )}
                                </span>
                              </button>
                            </li>
                            )
                          })
                        )}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 pb-0.5">
                  <p className="text-[11px] text-gray-500 mb-0.5">Черновик</p>
                  <p className="text-[18px] font-bold text-admin">{draftTotal.toLocaleString('ru-RU')} тг</p>
                </div>
              </div>
            )}
          </div>

          {/* Comment */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-semibold text-gray-900">Комментарий к заказу</h2>
              {!editingComment && (
                <button onClick={() => { setCommentDraft(order.comment || ''); setEditingComment(true) }}
                  className="text-[12px] text-admin hover:text-admin-hover font-medium transition-colors"
                >
                  {order.comment ? 'Изменить' : '+ Добавить'}
                </button>
              )}
            </div>
            {editingComment ? (
              <div className="space-y-2.5">
                <textarea ref={commentRef} value={commentDraft} onChange={e => setCommentDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setEditingComment(false) }}
                  rows={3} placeholder="Примечания к заказу..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-admin resize-none transition-colors"
                />
                <div className="flex gap-2">
                  <button onClick={saveComment} className="px-4 py-1.5 bg-admin text-white text-[12px] font-medium rounded-lg hover:bg-admin-hover transition-colors">Сохранить</button>
                  <button onClick={() => setEditingComment(false)} className="px-4 py-1.5 text-gray-500 text-[12px] rounded-lg hover:bg-gray-100 transition-colors">Отмена</button>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                {order.comment || <span className="text-gray-300 italic">Нет комментария</span>}
              </p>
            )}
          </div>

          {/* ── TIMELINE ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-gray-900 mb-5">История заказа</h2>
            <div className="space-y-0">
              {/* Created */}
              <div className="flex gap-4 pb-5">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-3 h-3 rounded-full bg-admin ring-4 ring-admin/15 mt-0.5" />
                  {(order.statusLogs && order.statusLogs.length > 0) && (
                    <div className="w-px flex-1 bg-gray-200 mt-2" />
                  )}
                </div>
                <div className="flex-1 pb-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <span className="text-[13px] font-semibold text-gray-900">Заказ создан</span>
                    <span className="text-[12px] text-gray-400 font-mono">{dateStr} в {timeStr}</span>
                  </div>
                  <p className="text-[12px] text-gray-500 mt-0.5">
                    {order.name} · {order.phone}
                    {order.deliveryMethod && ` · ${deliveryLabels[order.deliveryMethod] || order.deliveryMethod}`}
                  </p>
                </div>
              </div>

              {/* Status logs */}
              {order.statusLogs && order.statusLogs.map((log, idx) => {
                const logDate = new Date(log.createdAt)
                const logDateStr = logDate.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })
                const logTimeStr = logDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                const prevDate = idx === 0 ? new Date(order.createdAt) : new Date(order.statusLogs[idx - 1].createdAt)
                const elapsed = formatElapsed(prevDate, logDate)
                const dotColor = STATUS_DOT_COLORS[log.status] || 'bg-gray-400'
                const isLast = idx === order.statusLogs.length - 1

                return (
                  <div key={log.id} className="flex gap-4 pb-5">
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`w-3 h-3 rounded-full ${dotColor} ring-4 ring-white shadow-sm mt-0.5`} />
                      {!isLast && <div className="w-px flex-1 bg-gray-200 mt-2" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <span className="text-[13px] font-semibold text-gray-900">
                          {log.prevStatus ? (
                            <>
                              <span className="text-gray-500 font-normal">{statusLabels[log.prevStatus]}</span>
                              {' → '}
                              <span>{statusLabels[log.status]}</span>
                            </>
                          ) : statusLabels[log.status]}
                        </span>
                        <div className="flex items-center gap-2 text-[12px] text-gray-400">
                          <span className="font-mono">{logDateStr} в {logTimeStr}</span>
                          <span className="text-gray-200">·</span>
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] text-gray-500">{elapsed}</span>
                        </div>
                      </div>
                      {log.note && <p className="text-[12px] text-gray-500 mt-1 italic">"{log.note}"</p>}
                    </div>
                  </div>
                )
              })}

              {/* Empty state */}
              {(!order.statusLogs || order.statusLogs.length === 0) && (
                <div className="text-[12px] text-gray-400 italic pl-7">
                  История изменений статуса появится здесь после первого обновления
                </div>
              )}
            </div>
          </div>

          {/* Source */}
          {(order.referrer || order.utmSource) && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-gray-900 mb-3">Источник трафика</h2>
              <div className="space-y-2 text-[13px]">
                {order.referrer && <div className="flex justify-between"><span className="text-gray-500">Откуда пришёл</span><span className="font-medium">{order.referrer}</span></div>}
                {order.utmSource && <div className="flex justify-between"><span className="text-gray-500">utm_source</span><span className="font-medium">{order.utmSource}</span></div>}
                {order.utmMedium && <div className="flex justify-between"><span className="text-gray-500">utm_medium</span><span className="font-medium">{order.utmMedium}</span></div>}
                {order.utmCampaign && <div className="flex justify-between"><span className="text-gray-500">utm_campaign</span><span className="font-medium">{order.utmCampaign}</span></div>}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="w-full lg:w-72 shrink-0 space-y-4">
          {/* Client */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-gray-900 mb-4">Клиент</h2>
            <p className="text-[15px] font-semibold text-gray-900 mb-2">{order.name}</p>
            <div className="flex items-center gap-2 mb-3">
              <a href={`tel:${order.phone}`} className="text-[13px] text-admin hover:underline font-mono">{order.phone}</a>
              <CopyButton text={order.phone} />
            </div>
            {order.email && (
              <div className="flex items-center gap-2 mb-3">
                <a href={`mailto:${order.email}`} className="text-[13px] text-admin hover:underline truncate">{order.email}</a>
                <CopyButton text={order.email} />
              </div>
            )}
            <div className="flex gap-2 mb-4">
              <a href={`https://wa.me/${whatsappPhone}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500 hover:bg-green-600 text-white text-[12px] font-medium rounded-lg transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </a>
              <a href={`https://t.me/+${whatsappPhone}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#2AABEE] hover:bg-[#1a96d4] text-white text-[12px] font-medium rounded-lg transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg>
                Telegram
              </a>
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <Link href={`/admin/clients?search=${encodeURIComponent(order.phone)}`}
                className="flex items-center justify-between text-[12px] text-gray-500 hover:text-admin transition-colors"
              >
                <span>История клиента</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </Link>
            </div>
          </div>

          {/* Delivery */}
          {(order.address || order.deliveryMethod) && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-gray-900 mb-3">Доставка</h2>
              <p className="text-[13px] text-gray-600 font-medium mb-1">{deliveryLabels[order.deliveryMethod || ''] || '—'}</p>
              {order.address && (
                <div className="flex items-start gap-2 mt-2">
                  <p className="text-[13px] text-gray-600 flex-1 leading-relaxed">{order.address}</p>
                  <CopyButton text={order.address} />
                </div>
              )}
            </div>
          )}

          {/* Viewed products */}
          {order.viewedProducts && order.viewedProducts.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-gray-900 mb-3">Смотрел перед заказом</h2>
              <div className="space-y-3">
                {order.viewedProducts.slice(0, 5).map(vp => {
                  const img = vp.product.images[0]?.url
                  return (
                    <div key={vp.id} className="flex items-center gap-3">
                      {img ? <Image src={img} alt="" width={32} height={32} className="rounded-lg object-contain shrink-0 bg-gray-50" /> : <div className="w-8 h-8 bg-gray-100 rounded-lg shrink-0" />}
                      <Link href={`/product/${vp.product.slug}`} className="text-[12px] text-gray-700 hover:text-admin flex-1 line-clamp-1 leading-tight transition-colors">{vp.product.name}</Link>
                      <span className="text-[11px] text-gray-400 shrink-0 font-mono">{vp.product.price.toLocaleString()} тг</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Search queries */}
          {order.searchQueries && order.searchQueries.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-gray-900 mb-3">Что искал</h2>
              <div className="flex flex-wrap gap-2">
                {order.searchQueries.map(sq => (
                  <Link key={sq.id} href={`/admin/products?search=${encodeURIComponent(sq.query)}`}
                    className="text-[11px] bg-gray-100 hover:bg-admin/10 hover:text-admin text-gray-600 px-2.5 py-1 rounded-full transition-colors font-medium"
                  >
                    {sq.query}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
