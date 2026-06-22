// Satu заказы: статусы, подписи, цвета (фиолетовая тема канала), переходы.
// Клиент-безопасный модуль (без prisma). Статусы диктует Satu API:
// pending|paid|delivered|received|canceled. pending — начальный (задать нельзя).

export const satuStatusLabels: Record<string, string> = {
  pending: 'Новый',
  paid: 'Оплачен',
  delivered: 'Выполнен',
  received: 'Получен',
  canceled: 'Отменён',
}

// Solid badges (фиолетовая тема Satu).
export const satuStatusColors: Record<string, string> = {
  pending: 'bg-violet-600 text-white',
  paid: 'bg-purple-600 text-white',
  delivered: 'bg-indigo-600 text-white',
  received: 'bg-fuchsia-700 text-white',
  canceled: 'bg-gray-400 text-white',
}

// Light badges.
export const satuStatusColorsLight: Record<string, string> = {
  pending: 'bg-violet-50 text-violet-700 border-violet-200',
  paid: 'bg-purple-50 text-purple-700 border-purple-200',
  delivered: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  received: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  canceled: 'bg-gray-50 text-gray-600 border-gray-200',
}

// Статусы, которые можно ЗАДАТЬ через Satu API (pending — только из синхры).
export const SATU_SETTABLE: string[] = ['paid', 'delivered', 'received', 'canceled']

// Как у Alash — гибко: любой из settable-статусов в любом направлении.
// Остатки пересчитываются по эффекту целевого статуса. Список = settable
// кроме текущего.
export function satuOtherStatuses(current: string): string[] {
  return SATU_SETTABLE.filter(s => s !== current)
}

// Прогресс-бар «прямого» пути.
export const SATU_PROGRESS_STEPS = ['pending', 'paid', 'delivered', 'received']

// Открытые = требуют действия (новый/оплачен). Закрытые = завершены: «Выполнен»
// (delivered) в Satu — это ЗАВЕРШЁННЫЙ заказ (бакет «Выполненные»), не активный.
export const SATU_OPEN_STATUSES = ['pending', 'paid']
export const SATU_CLOSED_STATUSES = ['delivered', 'received', 'canceled']

// Причины отмены, которые принимает Satu (свободный текст он отвергает).
export const SATU_CANCEL_REASONS: Array<{ code: 'not_available' | 'duplicate'; label: string }> = [
  { code: 'not_available', label: 'Нет в наличии' },
  { code: 'duplicate', label: 'Дубликат заказа' },
]

// ID компании Alash на Satu (из ссылки запроса на отзыв в кабинете Satu).
export const SATU_COMPANY_ID = '814752'

// Ссылка «Запрос на отзыв про компанию» (как кнопка в кабинете Satu).
// satu.kz/opinions/create/<companyId>?order_id=<satuOrderId>&...
export function satuReviewLink(satuOrderId: string): string {
  return `https://satu.kz/opinions/create/${SATU_COMPANY_ID}?order_id=${encodeURIComponent(satuOrderId)}&page_type=cs_portal-link_from_cabinet`
}
