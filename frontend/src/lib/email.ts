import nodemailer from 'nodemailer'
import { sendTelegram } from '@/lib/telegram'
import { statusLabels } from '@/lib/constants'

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_PORT ?? '465') !== '587',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

const FROM = process.env.EMAIL_FROM ?? `ИП КРУН <${process.env.SMTP_USER}>`

async function sendEmail(params: {
  to: string
  subject: string
  html: string
  orderId?: string
}): Promise<void> {
  try {
    await getTransporter().sendMail({
      from: FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })
  } catch (err) {
    sendTelegram(
      `⚠️ Email failed${params.orderId ? ` for order #${params.orderId}` : ''}: ${(err as Error).message}`
    ).catch(console.error)
    console.error('Email send failed:', err)
  }
}

export async function sendOrderConfirmation(params: {
  to: string
  name: string
  orderNumber: number
  orderId: string
  items: { name: string; quantity: number; price: number }[]
  total: number
  deliveryMethod: string | null
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Ваш заказ #${params.orderNumber} принят — ИП КРУН`,
    html: orderConfirmationHtml(params),
    orderId: String(params.orderNumber),
  })
}

export async function sendOrderStatusUpdate(params: {
  to: string
  name: string
  orderNumber: number
  orderId: string
  status: string
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Статус заказа #${params.orderNumber} изменён — ИП КРУН`,
    html: orderStatusHtml(params),
    orderId: String(params.orderNumber),
  })
}

export async function sendPasswordReset(params: {
  to: string
  resetUrl: string
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: 'Сброс пароля — ИП КРУН',
    html: passwordResetHtml(params),
  })
}

function deliveryLabel(method: string | null): string {
  if (method === 'pickup') return 'Самовывоз'
  if (method === 'yandex') return 'Яндекс Курьер'
  if (method === 'indrive') return 'inDrive'
  return method || '—'
}

function orderConfirmationHtml(params: {
  name: string
  orderNumber: number
  items: { name: string; quantity: number; price: number }[]
  total: number
  deliveryMethod: string | null
}): string {
  const rows = params.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${item.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right">${(item.price * item.quantity).toLocaleString('ru-RU')} тг</td>
        </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>Заказ #${params.orderNumber}</title></head>
<body style="font-family:Arial,sans-serif;background:#f9f9f9;margin:0;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
    <div style="background:#006EBE;padding:24px 32px">
      <h1 style="color:#fff;margin:0;font-size:20px">ИП КРУН</h1>
    </div>
    <div style="padding:32px">
      <h2 style="margin-top:0;font-size:18px">Заказ #${params.orderNumber} принят!</h2>
      <p>Здравствуйте, ${params.name}!</p>
      <p>Ваш заказ успешно оформлен. Мы свяжемся с вами для подтверждения.</p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px 12px;text-align:left;font-size:13px">Товар</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px">Кол-во</th>
            <th style="padding:8px 12px;text-align:right;font-size:13px">Сумма</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:12px;font-weight:bold;text-align:right">Итого:</td>
            <td style="padding:12px;font-weight:bold;text-align:right">${params.total.toLocaleString('ru-RU')} тг</td>
          </tr>
        </tfoot>
      </table>

      <p><b>Доставка:</b> ${deliveryLabel(params.deliveryMethod)}</p>

      <a href="https://croon.kz/account"
         style="display:inline-block;background:#006EBE;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:8px">
        Мои заказы
      </a>

      <p style="color:#888;font-size:13px;margin-top:24px">
        Если у вас есть вопросы, позвоните нам или напишите на WhatsApp.
      </p>
    </div>
  </div>
</body>
</html>`
}

function orderStatusHtml(params: {
  name: string
  orderNumber: number
  status: string
}): string {
  const label = statusLabels[params.status] || params.status

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>Статус заказа #${params.orderNumber}</title></head>
<body style="font-family:Arial,sans-serif;background:#f9f9f9;margin:0;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
    <div style="background:#006EBE;padding:24px 32px">
      <h1 style="color:#fff;margin:0;font-size:20px">ИП КРУН</h1>
    </div>
    <div style="padding:32px">
      <h2 style="margin-top:0;font-size:18px">Статус заказа #${params.orderNumber} изменён</h2>
      <p>Здравствуйте, ${params.name}!</p>
      <p>Статус вашего заказа обновлён: <b>${label}</b></p>

      <a href="https://croon.kz/account"
         style="display:inline-block;background:#006EBE;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:8px">
        Посмотреть заказ
      </a>
    </div>
  </div>
</body>
</html>`
}

function passwordResetHtml(params: { resetUrl: string }): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>Сброс пароля</title></head>
<body style="font-family:Arial,sans-serif;background:#f9f9f9;margin:0;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
    <div style="background:#006EBE;padding:24px 32px">
      <h1 style="color:#fff;margin:0;font-size:20px">ИП КРУН</h1>
    </div>
    <div style="padding:32px">
      <h2 style="margin-top:0;font-size:18px">Сброс пароля</h2>
      <p>Мы получили запрос на сброс пароля. Нажмите кнопку ниже для создания нового пароля.</p>
      <p style="color:#888;font-size:13px">Ссылка действительна в течение 1 часа.</p>

      <a href="${params.resetUrl}"
         style="display:inline-block;background:#006EBE;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:8px">
        Сбросить пароль
      </a>

      <p style="color:#888;font-size:13px;margin-top:24px">
        Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.
      </p>
    </div>
  </div>
</body>
</html>`
}
