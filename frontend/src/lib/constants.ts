export const statuses = ['NEW', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'PICKED_UP', 'CANCELLED'] as const

export const statusLabels: Record<string, string> = {
  NEW: 'Новый',
  CONFIRMED: 'Подтверждён',
  PROCESSING: 'В обработке',
  SHIPPED: 'Отправлен',
  DELIVERED: 'Доставлен',
  PICKED_UP: 'Забрали заказ',
  CANCELLED: 'Отменён',
}

// Solid backgrounds (admin order badges, dashboard)
export const statusColors: Record<string, string> = {
  NEW: 'bg-red-500 text-white',
  CONFIRMED: 'bg-yellow-500 text-white',
  PROCESSING: 'bg-orange-500 text-white',
  SHIPPED: 'bg-purple-500 text-white',
  DELIVERED: 'bg-green-500 text-white',
  PICKED_UP: 'bg-teal-500 text-white',
  CANCELLED: 'bg-gray-400 text-white',
}

// Solid backgrounds with border (admin orders list)
export const statusColorsBorder: Record<string, string> = {
  NEW: 'bg-red-500 text-white border-red-500',
  CONFIRMED: 'bg-yellow-500 text-white border-yellow-500',
  PROCESSING: 'bg-orange-500 text-white border-orange-500',
  SHIPPED: 'bg-purple-500 text-white border-purple-500',
  DELIVERED: 'bg-green-500 text-white border-green-500',
  PICKED_UP: 'bg-teal-500 text-white border-teal-500',
  CANCELLED: 'bg-gray-400 text-white border-gray-400',
}

// Light backgrounds (account page)
export const statusColorsLight: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  CONFIRMED: 'bg-yellow-100 text-yellow-700',
  PROCESSING: 'bg-orange-100 text-orange-700',
  SHIPPED: 'bg-purple-100 text-purple-700',
  DELIVERED: 'bg-green-100 text-green-700',
  PICKED_UP: 'bg-teal-100 text-teal-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

// Light backgrounds with border (admin clients)
export const statusColorsLightBorder: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-600 border-blue-200',
  CONFIRMED: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  PROCESSING: 'bg-orange-50 text-orange-600 border-orange-200',
  SHIPPED: 'bg-purple-50 text-purple-600 border-purple-200',
  DELIVERED: 'bg-green-50 text-green-600 border-green-200',
  PICKED_UP: 'bg-teal-50 text-teal-600 border-teal-200',
  CANCELLED: 'bg-red-50 text-red-500 border-red-200',
}

export const deliveryLabels: Record<string, string> = {
  pickup: 'Самовывоз',
  yandex: 'Доставка по Костанаю (Яндекс Курьер)',
  indrive: 'Доставка по Казахстану (inDrive)',
  delivery: 'Доставка',
}

export const paymentLabels: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  transfer: 'Перевод',
}
