// Клиент Kaspi Shop Merchant API v2 (заказы).
// Документация: https://guide.kaspi.kz/partner/ru/shop/api/orders
// Спецификация ответа — JSON:API. Токен в env KASPI_API_TOKEN (Настройки → Токен API).
//
// Лимиты Kaspi, которые здесь учтены:
//   - диапазон дат в одном запросе ≤ 14 дней (чанкуем в kaspi-sync.ts)
//   - page[size] ≤ 100
//   - 429/5xx → ретрай с экспоненциальной задержкой

// Режим Kaspi: prod | test. Переключается одним флагом KASPI_MODE в .env.
//   KASPI_MODE=prod → KASPI_API_TOKEN_PROD (рабочий)
//   KASPI_MODE=test → KASPI_API_TOKEN_TEST (тестовый)
// Если новые переменные не заданы — fallback на старый KASPI_API_TOKEN
// (обратная совместимость). URL аналогично: KASPI_API_URL_PROD/TEST → KASPI_API_URL.
function kaspiMode(): 'prod' | 'test' {
  return (process.env.KASPI_MODE || 'prod').toLowerCase() === 'test' ? 'test' : 'prod'
}

function kaspiToken(): string {
  const m = kaspiMode()
  const byMode = m === 'test' ? process.env.KASPI_API_TOKEN_TEST : process.env.KASPI_API_TOKEN_PROD
  return (byMode || process.env.KASPI_API_TOKEN || '').trim()
}

function kaspiBaseUrl(): string {
  const m = kaspiMode()
  const byMode = m === 'test' ? process.env.KASPI_API_URL_TEST : process.env.KASPI_API_URL_PROD
  return (byMode || process.env.KASPI_API_URL || 'https://kaspi.kz/shop/api/v2').replace(/\/$/, '')
}

export type KaspiOrderState =
  | 'NEW' | 'SIGN_REQUIRED' | 'PICKUP' | 'DELIVERY' | 'KASPI_DELIVERY' | 'ARCHIVE'

export type KaspiOrderStatus =
  | 'APPROVED_BY_BANK' | 'ACCEPTED_BY_MERCHANT' | 'COMPLETED'
  | 'CANCELLED' | 'CANCELLING'
  | 'KASPI_DELIVERY_RETURN_REQUESTED' | 'RETURN_ACCEPTED_BY_MERCHANT' | 'RETURNED'

export interface KaspiOrderAttributes {
  state: KaspiOrderState
  status: KaspiOrderStatus
  code: string
  totalPrice: number
  customer?: { name?: string; firstName?: string; lastName?: string; cellPhone?: string }
  preOrder?: boolean
  isKaspiDelivery?: boolean
  deliveryMode?: string
  creationDate?: number // epoch ms
  [k: string]: unknown
}

export interface KaspiOrderData {
  id: string
  type: string
  attributes: KaspiOrderAttributes
  relationships?: { entries?: { links?: { related?: string } } }
}

export interface KaspiOrdersResponse {
  data: KaspiOrderData[]
  meta?: { pageCount?: number; totalCount?: number }
}

export interface KaspiEntryAttributes {
  entryNumber: number
  quantity: number
  totalPrice: number
  basePrice: number
  deliveryCost?: number
}

export interface KaspiEntryData {
  id: string
  type: string
  attributes: KaspiEntryAttributes
  relationships?: { product?: { links?: { related?: string } } }
}

export interface KaspiEntriesResponse {
  data: KaspiEntryData[]
}

export interface KaspiProductAttributes {
  code: string // merchant SKU
  name: string
  manufacturer?: string
}

function authHeaders(): HeadersInit {
  const token = kaspiToken()
  if (!token) throw new Error(`Kaspi-токен не задан (режим ${kaspiMode()}: KASPI_API_TOKEN_${kaspiMode().toUpperCase()} или KASPI_API_TOKEN)`)
  return {
    'Content-Type': 'application/vnd.api+json',
    'Accept': 'application/vnd.api+json',
    'X-Auth-Token': token,
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// fetch с ретраем на 429/5xx (экспонента + jitter). До 4 попыток.
async function kaspiFetch(path: string, init?: RequestInit, attempt = 0): Promise<Response> {
  const url = path.startsWith('http') ? path : `${kaspiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
    // не кэшируем — данные заказов всегда свежие
    cache: 'no-store',
  })
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const delay = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 300)
    await sleep(delay)
    return kaspiFetch(path, init, attempt + 1)
  }
  return res
}

async function kaspiJson<T>(path: string): Promise<T> {
  const res = await kaspiFetch(path)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Kaspi API ${res.status} ${path}: ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

// Одна страница заказов по фильтру state + диапазон дат (epoch ms, ≤14 дней).
export async function getOrdersPage(opts: {
  state: KaspiOrderState
  fromMs: number
  toMs: number
  pageNumber: number
  pageSize?: number
}): Promise<KaspiOrdersResponse> {
  const size = Math.min(100, opts.pageSize ?? 100)
  const p = new URLSearchParams()
  p.set('page[number]', String(opts.pageNumber))
  p.set('page[size]', String(size))
  p.set('filter[orders][state]', opts.state)
  p.set('filter[orders][creationDate][$ge]', String(opts.fromMs))
  p.set('filter[orders][creationDate][$le]', String(opts.toMs))
  p.set('sort', '-creationDate')
  return kaspiJson<KaspiOrdersResponse>(`/orders?${p.toString()}`)
}

// Все страницы заказов одного state за период (с пагинацией).
export async function getAllOrders(opts: {
  state: KaspiOrderState
  fromMs: number
  toMs: number
}): Promise<KaspiOrderData[]> {
  const all: KaspiOrderData[] = []
  let page = 0
  for (;;) {
    const res = await getOrdersPage({ ...opts, pageNumber: page })
    all.push(...(res.data || []))
    const pageCount = res.meta?.pageCount ?? 1
    page += 1
    if (page >= pageCount || (res.data?.length ?? 0) === 0) break
  }
  return all
}

// Позиции заказа: GET /orders/{id}/entries
export async function getOrderEntries(orderId: string): Promise<KaspiEntryData[]> {
  const res = await kaspiJson<KaspiEntriesResponse>(`/orders/${orderId}/entries`)
  return res.data || []
}

// merchant SKU позиции: GET /orderentries/{entryId}/product
export async function getEntryProduct(entryId: string): Promise<KaspiProductAttributes | null> {
  try {
    const res = await kaspiJson<{ data?: { attributes?: KaspiProductAttributes } }>(
      `/orderentries/${entryId}/product`
    )
    return res.data?.attributes ?? null
  } catch {
    return null
  }
}

export function isKaspiConfigured(): boolean {
  return !!kaspiToken()
}

// Текущий режим Kaspi (prod|test) — для отображения в админке.
export function kaspiCurrentMode(): 'prod' | 'test' {
  return kaspiMode()
}
