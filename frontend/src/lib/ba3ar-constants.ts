// Ba3ar заказы: статусы, подписи, цвета (зелёная тема канала), переходы.
// Клиент-безопасный модуль (без prisma) — можно импортировать в 'use client'.

export const BA3AR_STATUSES = [
  'new', 'confirmed', 'processing', 'shipped', 'delivered', 'picked_up', 'canceled', 'returned',
] as const
export type Ba3arStatus = (typeof BA3AR_STATUSES)[number]

export const ba3arStatusLabels: Record<string, string> = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  processing: 'В обработке',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  picked_up: 'Забрали заказ',
  canceled: 'Отменён',
  returned: 'Возврат',
}

// Solid badges (список/карточка). Зелёная тема канала Ba3ar.
export const ba3arStatusColors: Record<string, string> = {
  new: 'bg-emerald-600 text-white',
  confirmed: 'bg-lime-600 text-white',
  processing: 'bg-amber-500 text-white',
  shipped: 'bg-teal-600 text-white',
  delivered: 'bg-green-600 text-white',
  picked_up: 'bg-green-700 text-white',
  canceled: 'bg-gray-400 text-white',
  returned: 'bg-rose-600 text-white',
}

// Light badges (мелкие плашки).
export const ba3arStatusColorsLight: Record<string, string> = {
  new: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  confirmed: 'bg-lime-50 text-lime-700 border-lime-200',
  processing: 'bg-amber-50 text-amber-700 border-amber-200',
  shipped: 'bg-teal-50 text-teal-700 border-teal-200',
  delivered: 'bg-green-50 text-green-700 border-green-200',
  picked_up: 'bg-green-50 text-green-800 border-green-200',
  canceled: 'bg-gray-50 text-gray-600 border-gray-200',
  returned: 'bg-rose-50 text-rose-700 border-rose-200',
}

// Как у Alash — статус гибкий: можно ставить любой в любом направлении.
// Остатки пересчитываются по эффекту целевого статуса (ba3arDesiredEffect),
// поэтому любой переход безопасен. Список = все статусы кроме текущего.
export function ba3arOtherStatuses(current: string): Ba3arStatus[] {
  return BA3AR_STATUSES.filter(s => s !== current)
}

// Открытые / закрытые (для фильтра списка), как у Alash.
export const BA3AR_OPEN_STATUSES: Ba3arStatus[] = ['new', 'confirmed', 'processing']
export const BA3AR_CLOSED_STATUSES: Ba3arStatus[] = ['shipped', 'delivered', 'picked_up', 'canceled', 'returned']

// Варианты оплаты/доставки для админ-редактирования (бухгалтерия + аналитика).
// Значения = подписи (как шлёт витрина), чтобы существующие заказы совпадали.
export const BA3AR_PAYMENT_OPTIONS = [
  'Kaspi QR',
  'Kaspi Red (рассрочка)',
  'Kaspi Gold (перевод)',
  'Наличные при получении',
  'Перевод на карту',
] as const

export const BA3AR_DELIVERY_OPTIONS = [
  'Доставка курьером (Алматы) — по тарифу Яндекс.Курьер',
  'Самовывоз: ТД «Тастак», ул. Толе би 266, бутик 22',
  'Доставка по Казахстану',
] as const
