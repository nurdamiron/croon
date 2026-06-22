// Клиент Satu.kz API (платформа EVO, как Prom.ua).
// База https://my.satu.kz/api/v1, авторизация Authorization: Bearer <SATU_API_TOKEN>.
// Документация: https://public-api.docs.satu.kz/
//
// Поведение подтверждено эмпирически:
//   - products/list — пагинация курсором last_id
//   - products/edit — тело = ГОЛЫЙ JSON-МАССИВ [{id, presence, quantity_in_stock}],
//     ответ {processed_ids, errors}
//   - orders/list — заказы

const BASE_URL = process.env.SATU_API_URL || 'https://my.satu.kz/api/v1'
const TOKEN = process.env.SATU_API_TOKEN || ''

export type SatuPresence = 'available' | 'order' | 'not_available'

export interface SatuProductData {
  id: number
  external_id: string | null
  sku: string
  name: string
  presence: SatuPresence
  price: number
  quantity_in_stock: number | null
  status: string
  [k: string]: unknown
}

export interface SatuOrderData {
  id: number
  date_created: string
  date_modified: string
  status: string
  client_first_name?: string
  client_last_name?: string
  client?: { first_name?: string; last_name?: string; phone?: string; id?: number }
  email?: string
  phone?: string
  delivery_option?: { id?: number; name?: string }
  products?: Array<{
    id?: number
    external_id?: string | null
    name?: string
    quantity?: number
    price?: number
    sku?: string
  }>
  amount?: number
  [k: string]: unknown
}

function authHeaders(): HeadersInit {
  if (!TOKEN) throw new Error('SATU_API_TOKEN не задан в .env')
  return {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function satuFetch(path: string, init?: RequestInit, attempt = 0): Promise<Response> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
    cache: 'no-store',
  })
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const delay = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 300)
    await sleep(delay)
    return satuFetch(path, init, attempt + 1)
  }
  return res
}

async function satuJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await satuFetch(path, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Satu API ${res.status} ${path}: ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

export function isSatuConfigured(): boolean {
  return !!TOKEN
}

// Все товары Satu (пагинация курсором last_id).
export async function getAllSatuProducts(): Promise<SatuProductData[]> {
  const all: SatuProductData[] = []
  let lastId = 0
  for (;;) {
    const q = new URLSearchParams({ limit: '100' })
    if (lastId) q.set('last_id', String(lastId))
    const res = await satuJson<{ products: SatuProductData[] }>(`/products/list?${q.toString()}`)
    const batch = res.products || []
    if (!batch.length) break
    all.push(...batch)
    lastId = batch[batch.length - 1].id
    if (batch.length < 100) break
    if (all.length > 20000) break // предохранитель
  }
  return all
}

// Заказы Satu за период (date_from/date_to — ISO). Пагинация курсором last_id.
export async function getAllSatuOrders(opts?: { dateFrom?: string }): Promise<SatuOrderData[]> {
  const all: SatuOrderData[] = []
  let lastId = 0
  for (;;) {
    const q = new URLSearchParams({ limit: '100' })
    if (lastId) q.set('last_id', String(lastId))
    if (opts?.dateFrom) q.set('date_from', opts.dateFrom)
    const res = await satuJson<{ orders: SatuOrderData[] }>(`/orders/list?${q.toString()}`)
    const batch = res.orders || []
    if (!batch.length) break
    all.push(...batch)
    lastId = batch[batch.length - 1].id
    if (batch.length < 100) break
    if (all.length > 20000) break
  }
  return all
}

export interface SatuEditItem {
  id: number
  presence?: SatuPresence
  quantity_in_stock?: number
  // Доп. поля, которые products/edit принимает (проверено на проде):
  // name, price, description (HTML), keywords. НЕ принимает: sku (артикул),
  // vendor_code, external_id — только через import_url с правильным тегом.
  name?: string
  price?: number
  description?: string
  keywords?: string
}

export interface SatuEditResult {
  processed_ids: number[]
  errors: Record<string, unknown>
}

// Массовое обновление товаров. Тело — ГОЛЫЙ массив (НЕ {products:[]}).
export async function editSatuProducts(items: SatuEditItem[]): Promise<SatuEditResult> {
  if (!items.length) return { processed_ids: [], errors: {} }
  return satuJson<SatuEditResult>('/products/edit', {
    method: 'POST',
    body: JSON.stringify(items),
  })
}

// Допустимые статусы для orders/set_status (проверено эмпирически).
// pending задать НЕЛЬЗЯ (начальный).
export type SatuSettableStatus = 'paid' | 'delivered' | 'received' | 'canceled'

// Коды причины отмены (cancellation_reason) — НЕ свободный текст, а enum.
// Проверено: 'not_available' и 'duplicate' принимаются; свободный текст → 400.
export type SatuCancelReason = 'not_available' | 'duplicate'
export const SATU_CANCEL_REASONS: Record<SatuCancelReason, string> = {
  not_available: 'Нет в наличии',
  duplicate: 'Дубликат заказа',
}

// Записать статус заказа(ов) в Satu. Тело: {ids:[...], status:"..."}.
// ВНИМАНИЕ: поле называется `status` (хотя ошибка упоминает status_str).
// Бросает, если Satu вернул error или ни один id не обработан (processed_ids пуст).
export async function setSatuOrderStatus(
  satuOrderIds: number[],
  status: SatuSettableStatus,
  cancellationReason?: SatuCancelReason,
): Promise<{ ok: boolean; processed: number[]; raw: any }> {
  if (!satuOrderIds.length) return { ok: true, processed: [], raw: null }
  const body: Record<string, unknown> = { ids: satuOrderIds, status }
  if (status === 'canceled') body.cancellation_reason = cancellationReason || 'not_available'
  const raw = await satuJson<any>('/orders/set_status', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  // Satu отдаёт 200 даже на ошибку: {error:"..."} или {processed_ids:[...]}.
  if (raw && typeof raw === 'object' && raw.error) {
    throw new Error(`Satu set_status: ${raw.error}`)
  }
  const processed: number[] = Array.isArray(raw?.processed_ids) ? raw.processed_ids : []
  if (!processed.length) {
    throw new Error(`Satu set_status: ни один заказ не обработан (${JSON.stringify(raw).slice(0, 150)})`)
  }
  return { ok: true, processed, raw }
}

export interface SatuImportStatus {
  status: 'success' | 'PARTIAL' | 'FAIL' | string
  total?: number
  imported?: number
  created?: number
  updated?: number
  not_changed?: number
  created_active?: number
  with_errors_count?: number
  errors?: unknown
}

// Старт импорта товаров по URL фида (YML). ВАЖНО: параметр называется `url`
// (НЕ `import_url`). Satu сам скачивает фид. Возвращает id задачи импорта.
//
// Satu разрешает только 1 импорт за раз и держит rate-limit на запуск.
// При ошибке «ограничение на запуск одновременных импортов» — ждём и
// повторяем с экспоненциальной задержкой (до ~5 мин суммарно).
export async function startSatuImportByUrl(url: string, markDropshipping = false): Promise<string> {
  const body = JSON.stringify({ url, mark_dropshipping: markDropshipping })
  // Держимся под таймаутом шлюза (nginx ~60с): 3 попытки, паузы 6+9=15с.
  // Если слот занят дольше — отдаём понятную ошибку, а не виснем до 504.
  const maxTries = 3
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < maxTries; attempt++) {
    try {
      const res = await satuJson<{ status: string; id: string }>('/products/import_url', {
        method: 'POST',
        body,
      })
      if (!res.id) throw new Error('Satu import_url: не вернул id задачи')
      return res.id
    } catch (e) {
      lastErr = e as Error
      const msg = lastErr.message || ''
      // ошибка «одновременные импорты» (rate-limit) — \u... в теле, ловим по 400
      const busy = msg.includes('400') || msg.includes('одновременных импорт')
      if (!busy) throw lastErr
      if (attempt === maxTries - 1) {
        throw new Error('Satu занят импортом другого процесса — попробуйте через минуту')
      }
      await sleep(6000 * (attempt + 1)) // 6с, 12с
    }
  }
  throw lastErr ?? new Error('Satu import_url: неизвестная ошибка')
}

export async function getSatuImportStatus(importId: string): Promise<SatuImportStatus> {
  return satuJson<SatuImportStatus>(`/products/import/status/${importId}`)
}

// Ждём завершения задачи импорта (статус перестаёт быть в processing).
// Satu отдаёт PARTIAL/success/FAIL когда готово; imported:0 — no-op (не ошибка).
export async function waitSatuImport(importId: string, opts?: { tries?: number; intervalMs?: number }): Promise<SatuImportStatus> {
  const tries = opts?.tries ?? 12
  const interval = opts?.intervalMs ?? 5000
  let last: SatuImportStatus = { status: 'pending' }
  for (let i = 0; i < tries; i++) {
    await sleep(interval)
    last = await getSatuImportStatus(importId)
    // готово: есть хоть какой-то итог или FAIL
    if (last.status === 'FAIL') return last
    if (typeof last.total === 'number' && last.total > 0) return last
    if (last.status === 'success' && typeof last.imported === 'number') return last
  }
  return last
}
