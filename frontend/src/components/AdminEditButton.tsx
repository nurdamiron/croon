'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'

// Плавающая кнопка «Редактировать» на публичной странице товара.
// Видна ТОЛЬКО администраторам (role === 'ADMIN').
//
// Безопасность: это лишь шорткат. Кнопка рендерится на клиенте по данным
// сессии — у обычного клиента role !== 'ADMIN', кнопки нет. Даже если кто-то
// перейдёт по /admin/* вручную, доступ закрыт на СЕРВЕРЕ (requireAdmin в
// layout админки + checkAdmin в API). Сама кнопка доступа не даёт.
export default function AdminEditButton({ productId }: { productId: string }) {
  const { data: session, status } = useSession()
  if (status !== 'authenticated') return null
  const role = (session?.user as any)?.role
  if (role !== 'ADMIN') return null

  return (
    <Link
      href={`/admin/products/${productId}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Редактировать товар в админке (видно только администраторам)"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-admin px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-admin-hover transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
      Редактировать
    </Link>
  )
}
