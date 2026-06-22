import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/client_account/login')

  const { id } = await params
  const userId = (session.user as any).id
  const isAdmin = (session.user as any).role === 'ADMIN'

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: { select: { name: true, slug: true } },
        },
      },
    },
  })

  if (!order) notFound()
  if (!isAdmin && order.userId !== userId) notFound()

  const deliveryLabel: Record<string, string> = {
    pickup: 'Самовывоз',
    yandex: 'Яндекс Курьер',
    indrive: 'inDrive',
  }

  const paymentLabel: Record<string, string> = {
    cash: 'Наличными',
    card: 'Картой',
    transfer: 'Перевод',
  }

  const date = new Date(order.createdAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <html lang="ru">
      <head>
        <meta charSet="UTF-8" />
        <title>Чек заказа #{order.orderNumber}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 32px; font-size: 14px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #006EBE; padding-bottom: 16px; margin-bottom: 24px; }
          .logo { font-size: 22px; font-weight: bold; color: #006EBE; }
          .logo-sub { font-size: 11px; color: #888; margin-top: 2px; }
          .order-num { font-size: 20px; font-weight: bold; text-align: right; }
          .order-date { font-size: 12px; color: #666; text-align: right; margin-top: 4px; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: .05em; color: #888; margin-bottom: 8px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .info-item label { font-size: 11px; color: #888; display: block; margin-bottom: 2px; }
          .info-item p { font-size: 14px; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; font-size: 12px; font-weight: 600; color: #666; border-bottom: 1px solid #e5e5e5; padding: 8px 0; }
          td { padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; vertical-align: top; }
          .td-right { text-align: right; }
          .total-row td { border-top: 2px solid #e5e5e5; border-bottom: none; padding-top: 14px; font-weight: bold; font-size: 16px; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #888; display: flex; justify-content: space-between; }
          .print-btn { position: fixed; bottom: 24px; right: 24px; background: #006EBE; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; cursor: pointer; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
          @media print {
            .print-btn { display: none; }
            body { padding: 16px; }
          }
        `}</style>
      </head>
      <body>
        <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #006EBE', paddingBottom: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/icons/icon-192x192.png" alt="Alash Electronics" style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#006EBE' }}>Alash Electronics</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>alash-electronics.kz</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Заказ #{order.orderNumber}</div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{date}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.05em', color: '#888', marginBottom: '8px' }}>Покупатель</div>
            <div style={{ marginBottom: '4px' }}><strong>{order.name}</strong></div>
            <div style={{ color: '#555' }}>{order.phone}</div>
            {order.email && <div style={{ color: '#555' }}>{order.email}</div>}
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.05em', color: '#888', marginBottom: '8px' }}>Доставка и оплата</div>
            <div style={{ marginBottom: '4px' }}>{deliveryLabel[order.deliveryMethod || ''] || order.deliveryMethod || '—'}</div>
            {order.address && <div style={{ color: '#555', marginBottom: '4px' }}>{order.address}</div>}
            <div style={{ color: '#555' }}>{paymentLabel[order.paymentMethod || ''] || order.paymentMethod || '—'}</div>
          </div>
        </div>

        <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.05em', color: '#888', marginBottom: '8px' }}>Состав заказа</div>
        <table>
          <thead>
            <tr>
              <th>Товар</th>
              <th style={{ textAlign: 'center', width: '80px' }}>Кол-во</th>
              <th style={{ textAlign: 'right', width: '120px' }}>Цена</th>
              <th style={{ textAlign: 'right', width: '130px' }}>Сумма</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={item.id}>
                <td>{item.product.name}</td>
                <td style={{ textAlign: 'center' }}>{item.quantity} шт.</td>
                <td style={{ textAlign: 'right' }}>{item.price.toLocaleString('ru-RU')} тг</td>
                <td style={{ textAlign: 'right' }}>{(item.price * item.quantity).toLocaleString('ru-RU')} тг</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} style={{ textAlign: 'right', borderTop: '2px solid #e5e5e5', borderBottom: 'none', paddingTop: '14px', fontWeight: 'bold', fontSize: '16px' }}>
                Итого:
              </td>
              <td style={{ textAlign: 'right', borderTop: '2px solid #e5e5e5', borderBottom: 'none', paddingTop: '14px', fontWeight: 'bold', fontSize: '16px' }}>
                {order.total.toLocaleString('ru-RU')} тг
              </td>
            </tr>
          </tbody>
        </table>

        {order.comment && (
          <div style={{ marginTop: '20px', padding: '12px', background: '#f9f9f9', borderRadius: '6px', fontSize: '13px', color: '#555' }}>
            <strong>Комментарий:</strong> {order.comment}
          </div>
        )}

        <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #e5e5e5', fontSize: '12px', color: '#888', display: 'flex', justifyContent: 'space-between' }}>
          <span>Alash Electronics — ул. Кыз Жибек, 104/1, Алматы</span>
          <span>Документ сформирован {new Date().toLocaleDateString('ru-RU')}</span>
        </div>

        <button
          id="print-btn"
          style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#006EBE', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontSize: '15px', cursor: 'pointer', fontWeight: '600', boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}
        >
          🖨 Печать / PDF
        </button>
        <script dangerouslySetInnerHTML={{ __html: `document.getElementById('print-btn').onclick=function(){window.print()}` }} />
      </body>
    </html>
  )
}
