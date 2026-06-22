'use client'

import Link from 'next/link'

export default function CollectionError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold mb-4">Не удалось загрузить категорию</h1>
      <p className="text-gray-500 mb-6">Попробуйте обновить страницу или вернитесь в каталог.</p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={reset}
          className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-hover transition-colors"
        >
          Попробовать снова
        </button>
        <Link href="/collection/all" className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 transition-colors">
          Все товары
        </Link>
      </div>
    </div>
  )
}
