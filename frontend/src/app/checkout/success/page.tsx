'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function SuccessContent() {
  const params = useSearchParams()
  const orderId = params.get('id')

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-brand">Главная</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-800">Заказ оформлен</span>
      </nav>

      <div className="max-w-2xl mx-auto">
        {/* Success banner */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" className="shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div>
              <p className="font-bold text-[#333]">Заказ оформлен{orderId ? ` №${orderId}` : ''}</p>
              <p className="text-sm text-gray-600">Мы свяжемся с вами для подтверждения по указанному номеру телефона.</p>
            </div>
          </div>
        </div>

        {/* Order next steps */}
        <div className="border rounded-lg p-6 mb-4">
          <h2 className="font-bold text-lg mb-4">Что дальше</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex gap-3">
              <span className="font-bold text-brand shrink-0">1.</span>
              <span>Мы свяжемся с вами для подтверждения заказа</span>
            </div>
            <div className="flex gap-3">
              <span className="font-bold text-brand shrink-0">2.</span>
              <span>Подготовим заказ к выдаче или отправке</span>
            </div>
            <div className="flex gap-3">
              <span className="font-bold text-brand shrink-0">3.</span>
              <span>Сообщим, когда заказ будет готов</span>
            </div>
          </div>
        </div>

        {/* Contact + address */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="border rounded-lg p-6">
            <h2 className="font-bold text-lg mb-4">Связаться с нами</h2>
            <div className="space-y-2.5 text-sm">
              <div>
                <a href="tel:+77009001790" className="text-brand hover:underline font-medium">+7 (700) 900-17-90</a>
              </div>
              <div>
                <a href="https://wa.me/77009001790" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline font-medium">WhatsApp</a>
                <span className="text-gray-400 mx-1.5">·</span>
                <a href="https://t.me/alash_electronics" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline font-medium">Telegram</a>
              </div>
              <p className="text-gray-500">Время работы: 12:00 — 20:00 (Пн — Сб)</p>
            </div>
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="font-bold text-lg mb-4">Самовывоз</h2>
            <div className="text-sm text-gray-600 space-y-1">
              <p>ул. Кыз Жибек, 104/1</p>
              <p>Кок-Тобе 2 м-н, Медеуский район</p>
              <p>Алматы 050020</p>
              <a
                href="https://2gis.kz/almaty/search/alash%20electronics/firm/70000001086917700/76.97348%2C43.214927?m=76.97348%2C43.214927%2F10.86"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-brand hover:underline font-medium mt-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Открыть в 2ГИС
              </a>
            </div>
          </div>
        </div>

        <Link
          href="/"
          className="block w-full bg-brand text-white text-center py-3 rounded-lg hover:bg-brand-hover transition-colors font-medium"
        >
          Вернуться в каталог
        </Link>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="max-w-[1400px] mx-auto px-4 py-12 text-center text-gray-500">Загрузка...</div>}>
      <SuccessContent />
    </Suspense>
  )
}
