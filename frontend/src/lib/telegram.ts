/**
 * Telegram bot notifications for admins.
 * Requires env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *
 * To get CHAT_ID: message your bot, then open
 * https://api.telegram.org/bot<TOKEN>/getUpdates
 */

const BASE_URL = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  try {
    const res = await fetch(`${BASE_URL()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      const err = await res.json()
      console.error('[Telegram] sendMessage failed:', err)
    }
  } catch (e) {
    console.error('[Telegram] network error:', e)
  }
}

// ── Notification builders ──────────────────────────────────────────────────

export function tgNewOrder(params: {
  orderNumber: number
  name: string
  phone: string
  total: number
  isPreorder: boolean
  deliveryMethod?: string | null
  itemCount: number
  url: string
}) {
  const { orderNumber, name, phone, total, isPreorder, deliveryMethod, itemCount, url } = params
  const type = isPreorder ? 'Предзаказ' : 'Заказ'
  const delivery = deliveryMethod === 'pickup' ? 'Самовывоз' : deliveryMethod === 'yandex' ? 'Яндекс Курьер' : deliveryMethod === 'indrive' ? 'inDrive' : deliveryMethod || '—'

  return [
    `<b>${type} #${orderNumber}</b>`,
    ``,
    `<b>Клиент:</b> ${esc(name)}`,
    `<b>Телефон:</b> ${esc(phone)}`,
    `<b>Сумма:</b> ${total.toLocaleString('ru-RU')} тг`,
    `<b>Товаров:</b> ${itemCount} шт`,
    `<b>Доставка:</b> ${delivery}`,
    ``,
    `<a href="https://croon.kz${url}">Открыть заказ</a>`,
  ].join('\n')
}

export function tgNewPreorderQuick(params: {
  orderNumber: number
  name: string
  phone: string
  productName: string
  url: string
}) {
  const { orderNumber, name, phone, productName, url } = params
  return [
    `<b>Быстрый предзаказ #${orderNumber}</b>`,
    ``,
    `<b>Клиент:</b> ${esc(name)}`,
    `<b>Телефон:</b> ${esc(phone)}`,
    `<b>Товар:</b> ${esc(productName)}`,
    ``,
    `<a href="https://croon.kz${url}">Открыть заказ</a>`,
  ].join('\n')
}

function esc(text: string): string {
  return text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c))
}
