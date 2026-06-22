'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const jokes = [
  'Эта страница сгорела как резистор при КЗ.',
  '404 — как ESP без Wi-Fi: есть, но не работает.',
  'Страница ушла в обрыв. Проверьте пайку.',
  'Тут был контент, но его спаяли.',
  'Ошибка 404: страница не найдена в схеме.',
  'Этот URL — как диод без тока. Ничего не пропускает.',
  'Страница потеряла контакт. Как кнопка без нажатия.',
  'Порвался провод между вами и этой страницей.',
]

export default function NotFound() {
  const [joke, setJoke] = useState(jokes[0])

  useEffect(() => {
    setJoke(jokes[Math.floor(Math.random() * jokes.length)])
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] px-4 text-center">
      <div className="text-[120px] font-black text-gray-200 leading-none select-none">
        404
      </div>

      <h1 className="text-xl font-bold text-gray-800 -mt-6 mb-2">
        Страница не найдена
      </h1>

      <p className="text-sm text-gray-500 max-w-md mb-1">
        {joke}
      </p>

      <p className="text-xs text-gray-400 mb-8">
        Возможно, она была перемещена или никогда не существовала.
      </p>

      <div className="flex gap-3">
        <Link
          href="/admin"
          className="bg-admin hover:bg-admin-hover text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
        >
          На главную
        </Link>
        <button
          onClick={() => window.history.back()}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
        >
          Назад
        </button>
      </div>
    </div>
  )
}
