export function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(price)) + ' тг'
}

export function getDiscount(oldPrice: number, price: number): number {
  if (!oldPrice || oldPrice <= price) return 0
  return Math.round(((oldPrice - price) / oldPrice) * 100)
}
